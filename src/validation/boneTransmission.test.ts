import { describe, expect, it } from 'vitest';
import { TISSUES, Tissue, attenuationDbPerCm } from '../anatomy/tissues';
import { RIBCAGE } from '../anatomy/organs/ribcage';
import { compareLook0Aperture, look0ApertureTwin } from '../app/apertureParity';
import { compareLateral, lateralTwin, type LateralParityInputs } from '../app/lateralParity';
import {
  APERTURE_GLSL,
  STEERED_APERTURE_GLSL,
  apertureTransmission,
  boneCoherence,
  coherentConeMean,
  coneMeanOf,
  type ApertureGeometry,
} from '../ultrasound/aperture';
import { CONVEX_BEAM } from '../ultrasound/beamModel';
import { BONE_TRANSMISSION, transmissionAlphaDbPerCm } from '../ultrasound/boneTransmission';
import {
  CLUTTER,
  PEDESTAL_SHADOW_GLSL,
  applyComplexKernel,
  applyLateralKernel,
  clutterParams,
  lateralKernel,
  lateralKernelParts,
  pedestalShadowFactor,
} from '../ultrasound/clutter';
import { harmonicBeam } from '../ultrasound/harmonic';
import { FRAG_LATERAL, FRAG_TRANSMISSION, FRAG_TRANS_HITS } from '../ultrasound/shaders/passes.glsl';
import {
  BONE_CHORD_GLSL,
  BONE_ENTRY_DB,
  MIRROR_BISECTION_STEPS,
  STEERED_PREFIX_GLSL,
  boneChordMm,
  boneEdge,
  boneRunAlongLine,
  prefixDb,
  rayAttenuationDb,
  steeredPrefixDb,
  type SegmentGrid,
} from '../ultrasound/transmission';
import { GRID_GEOMETRY, segmentGridFromScene } from './support/segmentGrid';

/**
 * La costilla bajo la línea pleural (lus-sim, ciclo 2, decisión 20): lo que la sombra costal hace físicamente y sus gemelos
 * TS ↔ GLSL. (1) La costilla es una lente: la fase de más de cada toma del cono de la pasada A, con la banda del pulso. (2)
 * Los lóbulos laterales de una línea ven lo de al lado a través de lo que su apertura tiene delante. (3) El hueso atenúa a la
 * frecuencia del pulso que le llega y sus caras cuestan cuatro cruces. La e2e mide el resultado en la GPU (F-T08).
 */

const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-300));
const COH = boneCoherence(CONVEX_BEAM);

describe('la costilla como lente: la media del cono con la fase del hueso', () => {
  const amps = [0.9, 0.7, 0.5, 0.3, 0.3, 0.5, 0.2, 0.6, 0.8];
  const mean = amps.reduce((a, b) => a + b, 0) / amps.length;

  it('sin hueso, o con el mismo hueso en todas las tomas (una placa), es la media de amplitudes de siempre', () => {
    expect(
      coherentConeMean(
        amps,
        amps.map(() => 0),
        COH.kTxPerMm,
        COH.sigmaPerMm,
      ),
    ).toBe(mean);
    // una placa solo retrasa el frente: el foco no pierde nada
    expect(
      coherentConeMean(
        amps,
        amps.map(() => 4.7),
        COH.kTxPerMm,
        COH.sigmaPerMm,
      ),
    ).toBeCloseTo(mean, 12);
  });

  it('con el grosor de una sección redonda, las tomas se suman con fases distintas y el foco pierde', () => {
    // las cuerdas de una elipse de 14 × 4,7 mm en ±3,9 mm de su centro (el cono de emisión en la costilla)
    const chords = Array.from({ length: 9 }, (_, j) => 4.7 * Math.sqrt(1 - ((-3.9 + (7.8 * j) / 8) / 7) ** 2));
    const ones = chords.map(() => 1);
    const lens = coherentConeMean(ones, chords, COH.kTxPerMm, COH.sigmaPerMm);
    expect(db(lens)).toBeLessThan(-6);
    // nunca más que la media de amplitudes (la de VExUS, todas en fase)
    for (const k of [0.5, 2, COH.kTxPerMm, 20])
      for (const sigma of [0, COH.sigmaPerMm, 5]) {
        const m = coherentConeMean(amps, chords, k, sigma);
        expect(m).toBeLessThanOrEqual(mean + 1e-12);
        expect(m).toBeGreaterThanOrEqual(0);
      }
    // con la banda del pulso muy ancha, solo interfieren las tomas con el mismo hueso (aquí, las simétricas): la suma de
    // energías de los grupos
    const wide = coherentConeMean(ones, chords, COH.kTxPerMm, 1e3);
    let same = 0;
    for (const a of chords) for (const b of chords) if (a === b) same++;
    expect(wide).toBeCloseTo(Math.sqrt(same) / 9, 9);
  });

  it('la fase sale del haz y de la tabla de tejidos: 2π·f·(1/c_músculo − 1/c_hueso) y la banda del pulso de la pasada C', () => {
    const slowness = 1 / TISSUES[Tissue.Muscle].c - 1 / TISSUES[Tissue.Bone].c;
    expect(COH.kRxPerMm).toBeCloseTo(2 * Math.PI * 3.5e6 * slowness * 1e-3, 9);
    expect(COH.kTxPerMm).toBeCloseTo(COH.kRxPerMm, 9);
    // 7,5 rad por mm de hueso a 3,5 MHz; la banda de energía del pulso de dos vías (σ 0,26 mm), 0,33 MHz
    expect(COH.kRxPerMm).toBeGreaterThan(7.4);
    expect(COH.kRxPerMm).toBeLessThan(7.6);
    expect(COH.sigmaPerMm / COH.kRxPerMm).toBeCloseTo(0.3333 / 3.5, 3);
    // en armónica la emisión va a la mitad de la frecuencia y construye el armónico (∝ p₁²)
    const h = boneCoherence(harmonicBeam(CONVEX_BEAM));
    expect(h.kTxPerMm).toBeCloseTo(COH.kRxPerMm / 2, 9);
    expect(h.kRxPerMm).toBeCloseTo(COH.kRxPerMm, 9);
    expect(h.txSquared).toBe(true);
    expect(COH.txSquared).toBe(false);
  });

  it('en armónica el cono de emisión pierde por la fase lo que pierde p₁, al cuadrado (la revisión lo halló)', () => {
    const chords = Array.from({ length: 9 }, (_, j) => 4.7 * Math.sqrt(1 - ((-3.9 + (7.8 * j) / 8) / 7) ** 2));
    const amps = chords.map((L) => 10 ** (-(2 * L) / 20));
    const mean = amps.reduce((a, b) => a + b, 0) / 9;
    const k = COH.kTxPerMm / 2;
    // sin hueso, la media de siempre, con o sin cuadrado
    expect(
      coneMeanOf(
        amps,
        amps.map(() => 0),
        k,
        COH.sigmaPerMm,
        true,
      ),
    ).toBeCloseTo(mean, 15);
    // con la lente: la media por (coherente/media)² de las amplitudes de p₁ (√a)
    const roots = amps.map(Math.sqrt);
    const plain = roots.reduce((a, b) => a + b, 0) / 9;
    const ratio = coherentConeMean(roots, chords, k, COH.sigmaPerMm) / plain;
    expect(coneMeanOf(amps, chords, k, COH.sigmaPerMm, true)).toBeCloseTo(mean * ratio * ratio, 15);
    expect(ratio).toBeLessThan(1);
    // sin el cuadrado (la media coherente de a) el cono de emisión en armónica quedaba más brillante
    expect(coherentConeMean(amps, chords, k, COH.sigmaPerMm)).toBeGreaterThan(coneMeanOf(amps, chords, k, COH.sigmaPerMm, true));
  });

  it('el GLSL de la pasada A es la misma media, con la fase de emisión en un cono y la de recepción en el otro', () => {
    for (const line of [
      'p += 2.0 * a[j] * a[m] * cos(kPh * d) * exp(-0.5 * (uBoneCoh.z * d) * (uBoneCoh.z * d));',
      'return sqrt(max(p, 0.0)) / float(AP_TAPS);',
      'if (!bone) return sum / float(AP_TAPS);',
      'return apConeMean(line, k, halfTx, uBoneCoh.x, step, uBoneCoh.w > 0.5) * apConeMean(line, k, halfRx, uBoneCoh.y, step, false);',
      'return mean * (c / plain) * (c / plain);',
      'return boneChordMm(clamp(l, 0, int(uLinesF) - 1), (float(k) + 0.5) * step);',
    ])
      expect(APERTURE_GLSL, line).toContain(line);
    expect(STEERED_APERTURE_GLSL).toContain(
      'return apConeMeanSteer(line, k, halfTx, uBoneCoh.x, uBoneCoh.w > 0.5) * apConeMeanSteer(line, k, halfRx, uBoneCoh.y, false);',
    );
    expect(STEERED_APERTURE_GLSL).toContain('return texelFetch(uPreSteerX, ivec2(l, k), 0).z;');
    expect(BONE_CHORD_GLSL).toContain('return h3.x < 0.0 ? 0.0 : max(0.0, min(h3.y, r) - h3.x);');
    expect(FRAG_TRANSMISSION).toContain(BONE_CHORD_GLSL);
    expect(STEERED_PREFIX_GLSL).toContain(
      'float boneMm = boneLine >= 0 ? boneChordMm(boneLine, (float(k) + 0.5) * step) * boneScale : 0.0;',
    );
  });
});

describe('la cuerda de la costilla: entrada y salida exactas de A0 (h3)', () => {
  const step = 120 / 160;
  const quantum = step / 2 ** MIRROR_BISECTION_STEPS;

  it('la bisección del espejo lleva los dos bordes a ≤ su paso final, esté donde esté el hueso', () => {
    for (const [a, b] of [
      [11.3, 16.0],
      [11.0, 15.75],
      [8.13, 12.9],
      [0.2, 3.1],
    ]) {
      const run = boneRunAlongLine((r) => r >= a && r < b, 120, 160)!;
      expect(Math.abs(run.entry - a)).toBeLessThanOrEqual(quantum / 2 + 1e-12);
      expect(Math.abs(run.exit - b)).toBeLessThanOrEqual(quantum / 2 + 1e-12);
      // la de la salida mira hueso por debajo del borde
      expect(boneEdge((r) => r >= a && r < b, b - step / 3, b + step / 3, false)).toBeCloseTo(b, 2);
    }
    expect(boneRunAlongLine(() => false, 120, 160)).toBeNull();
    // un tramo que llega al final de la línea (o al espejo) acaba en el borde de su última muestra
    const open = boneRunAlongLine((r) => r > 100, 120, 160)!;
    expect(open.exit).toBeCloseTo(120, 9);
    expect(boneRunAlongLine((r) => r > 100, 120, 160, 110)!.exit).toBeCloseTo(110.25, 9);
  });

  it('A0 abre la bisección en las vueltas que siguen a la muestra del borde, con la clasificación de la vuelta', () => {
    // la bisección de `boneEdge`, letra a letra (la revisión sesgó el intervalo de la salida y solo lo vio la e2e)
    for (const line of [
      'if ((tissueFlag(c.tissue) > 1.5) == bEntering) bHi = bMid; else bLo = bMid;',
      `boneBis = ${MIRROR_BISECTION_STEPS};`,
      'bLo = isBone ? max(r - step, 0.0) : r - step;',
      'bHi = r;',
      'float bMid = 0.5 * (bLo + bHi);',
      'vec3 p = bis ? origin + dir0 * bMid : (mirrorSeg >= 0.0 ? hitPoint + dir * (r - hitR) : origin + dir * r);',
      'if (bEntering) boneIn = 0.5 * (bLo + bHi); else boneOut = 0.5 * (bLo + bHi);',
      'bool edge = (isBone && boneIn < 0.0) || (!isBone && boneIn >= 0.0);',
      'if (mirrorSeg < 0.0 && boneOut < 0.0 && boneBis == 0) {',
      'if (boneIn >= 0.0 && boneOut < 0.0) boneOut = boneLast + 0.5 * step;',
      'h3 = boneIn >= 0.0 ? vec4(boneIn, boneOut, 0.0, 0.0) : vec4(-1.0, -1.0, 0.0, 0.0);',
    ])
      expect(FRAG_TRANS_HITS, line).toContain(line);
  });

  it('el hueso de la toma hasta la fila: el de la costilla que ya cruzó, y lo mismo por el camino dirigido con θ = 0', () => {
    const g: SegmentGrid = {
      ...segmentGridFromScene((x, z) => (Math.abs(x) < 7 && z > 11.3 && z < 16 ? Tissue.Bone : Tissue.Muscle), 2.5),
    };
    g.boneEntryMm = new Float64Array(g.lines).fill(-1);
    g.boneExitMm = new Float64Array(g.lines).fill(-1);
    g.boneEntryMm[96] = 11.3;
    g.boneExitMm[96] = 16;
    expect(boneChordMm(g, 96, 10)).toBe(0);
    expect(boneChordMm(g, 96, 13.3)).toBeCloseTo(2, 12);
    expect(boneChordMm(g, 96, 30)).toBeCloseTo(4.7, 12);
    expect(boneChordMm(g, 95, 30)).toBe(0);
    const k = Math.floor(30 / g.stepMm);
    expect(prefixDb(g, 96, k).boneMm).toBeCloseTo(4.7, 12);
    expect(steeredPrefixDb(g, GRID_GEOMETRY, 0, 96, k).boneMm).toBe(prefixDb(g, 96, k).boneMm);
    // sin la costilla en la rejilla (una escena sintética), ninguna fase
    const bare = segmentGridFromScene(() => Tissue.Muscle, 2.5);
    expect(prefixDb(bare, 96, k).boneMm).toBe(0);
  });
});

describe('el hueso en la transmisión: su frecuencia y sus caras', () => {
  it('las caras cuestan cuatro cruces músculo ↔ cortical con las impedancias de la tabla (physics.md R7: −1,9 dB por cruce)', () => {
    const z = (t: Tissue) => TISSUES[t].rho * TISSUES[t].c;
    const T = (4 * z(Tissue.Muscle) * z(Tissue.Bone)) / (z(Tissue.Muscle) + z(Tissue.Bone)) ** 2;
    expect(BONE_ENTRY_DB).toBe(BONE_TRANSMISSION.params.interfaceLossDb.value);
    expect(BONE_ENTRY_DB).toBeCloseTo(-40 * Math.log10(T), 12);
    expect(BONE_ENTRY_DB / 4).toBeGreaterThan(1.8);
    expect(BONE_ENTRY_DB / 4).toBeLessThan(1.95);
    // una sola vez por rayo, como antes
    expect(rayAttenuationDb([Tissue.Bone, Tissue.Bone], 2.5, 2.5) - rayAttenuationDb([Tissue.Bone], 2.5, 2.5)).toBeCloseTo(
      2 * transmissionAlphaDbPerCm(Tissue.Bone, 2.5) * 0.25,
      12,
    );
  });

  it('el hueso atenúa a la frecuencia del pulso en la costilla, con el desplazamiento que produce: f₀ − α′ℓσ_E²', () => {
    const f = BONE_TRANSMISSION.params.attenuationMHz.value;
    const alphaNp = TISSUES[Tissue.Bone].alpha1 / 10 / (20 / Math.LN10);
    const ell = 2 * (RIBCAGE.params.crestToPleuraMm.value - RIBCAGE.params.pleuraComplexMm.value);
    expect(ell).toBeCloseTo(9.4, 12);
    expect(f).toBeCloseTo(3.5 - alphaNp * ell * (1 / (2 * Math.PI * Math.SQRT2 * ((2 * 0.26e-3) / 1540)) / 1e6) ** 2, 12);
    expect(f).toBeCloseTo(3.26, 2);
    // el recorrido de ida y vuelta por el centro de la costilla del avatar: 14 dB más que a la frecuencia del campo profundo
    const at = (fMHz: number) => 2 * attenuationDbPerCm(Tissue.Bone, fMHz) * (ell / 2 / 10);
    expect(at(f) - at(2.5)).toBeGreaterThan(13);
    expect(at(f) - at(2.5)).toBeLessThan(16);
    // solo el hueso: el cartílago y los tejidos blandos siguen a la frecuencia B efectiva
    for (const t of [Tissue.Bone, Tissue.Vertebra]) expect(transmissionAlphaDbPerCm(t, 2.5)).toBe(attenuationDbPerCm(t, f));
    for (const t of [Tissue.Muscle, Tissue.Fat, Tissue.Cartilage, Tissue.Skin])
      expect(transmissionAlphaDbPerCm(t, 2.5)).toBe(attenuationDbPerCm(t, 2.5));
  });
});

/** Los ecos parásitos del punto BLUE superior: la pared torácica anterior (16 mm, 3,7 de grasa). */
const ref = clutterParams(16, 3.7);

describe('los lóbulos laterales de una línea ven lo de al lado a través de su apertura', () => {
  it('la vecina entra en el pedestal con la menor de las dos transmisiones', () => {
    expect(pedestalShadowFactor(1, 1)).toBe(1);
    expect(pedestalShadowFactor(1, 0.5)).toBe(1);
    expect(pedestalShadowFactor(1e-3, 1)).toBe(1e-3);
    expect(pedestalShadowFactor(0.2, 0)).toBe(1);
    expect(PEDESTAL_SHADOW_GLSL).toContain('return tSource > tDest ? tDest / tSource : 1.0;');
    // en D, solo el pedestal se atenúa; el principal, no
    expect(FRAG_LATERAL).toContain(
      'float sh = pedOn ? pedestalShadow(tDest, texture(uTransDrawn, vUv + vec2(kf * uTexel.x, 0.0)).z) : 0.0;',
    );
    expect(FRAG_LATERAL).toContain('accP += gp * sh * vec2(ph.x * f.x - ph.y * f.y, ph.x * f.y + ph.y * f.x);');
    expect(FRAG_LATERAL).toContain('accM += gm * f;');
  });

  it('el núcleo en dos partes es el de siempre, y con los factores en 1 la pasada D no cambia', () => {
    for (const sigma of [0.35, 1, 2.5])
      for (const c of [1, 0.5, 0]) {
        const parts = lateralKernelParts(sigma, ref, c);
        const whole = lateralKernel(sigma, ref, c);
        expect(parts.main).toHaveLength(whole.length);
        parts.main.forEach((m, i) => {
          expect(m + parts.ped[i][0]).toBeCloseTo(whole[i][0], 12);
          expect(parts.ped[i][1]).toBeCloseTo(whole[i][1], 12);
        });
        const field = (k: number): [number, number] => [Math.cos(0.7 * k), Math.sin(1.3 * k) + 0.2];
        const [a, b] = applyLateralKernel(parts, field, () => 1);
        const [x, y] = applyComplexKernel(whole, field);
        expect(a).toBeCloseTo(x, 12);
        expect(b).toBeCloseTo(y, 12);
      }
  });

  it('bajo una costilla el pedestal ya no trae la línea pleural del espacio vecino', () => {
    // una línea pleural brillante a la izquierda (k < −8) y la línea de destino en sombra (transmisión −70 dB)
    const sigma = 1;
    const parts = lateralKernelParts(sigma, ref);
    const field = (k: number): [number, number] => (k < -8 ? [1, 0] : [3e-4, 0]);
    const tOf = (k: number) => (k < -8 ? 1 : 3e-4);
    const own = Math.hypot(
      ...applyLateralKernel(
        parts,
        (k) => [3e-4, 0 * k],
        () => 1,
      ),
    );
    const before = Math.hypot(...applyLateralKernel(parts, field, () => 1));
    const after = Math.hypot(...applyLateralKernel(parts, field, (k) => pedestalShadowFactor(tOf(0), tOf(k))));
    // antes, el pedestal traía la pleura vecina ≈ 20 dB por encima de lo que deja pasar la costilla; ahora entra por la
    // costilla, como el eco propio: queda a pocos dB de él (las vecinas son tan reflectivas como la pleura de la línea)
    expect(db(before / own)).toBeGreaterThan(15);
    expect(db(after / own)).toBeLessThan(6);
    expect(db(before / after)).toBeGreaterThan(12);
    expect(CLUTTER.sidelobeWidth).toBe(7);
  });
});

describe('paridades de la GPU (los gemelos que usa la e2e)', () => {
  const AP: ApertureGeometry = {
    lines: GRID_GEOMETRY.lines,
    halfSector: GRID_GEOMETRY.halfSector,
    curvatureRadius: GRID_GEOMETRY.curvatureRadius,
    apertureTxMm: CONVEX_BEAM.apertureTxMm,
    apertureRxMaxMm: CONVEX_BEAM.apertureRxMaxMm,
    fNumberRxMin: CONVEX_BEAM.fNumberRxMin,
  };
  /** Una costilla de sección elíptica (14 × 4,7 mm) a 11 mm y la pleura a 16, con la cuerda exacta de cada línea. */
  function ribGrid(): SegmentGrid {
    const inRib = (x: number, z: number) => (x / 7) ** 2 + ((z - 13.35) / 2.35) ** 2 < 1;
    const g = segmentGridFromScene((x, z) => (inRib(x, z) ? Tissue.Bone : Tissue.Muscle), 2.5);
    g.boneEntryMm = new Float64Array(g.lines).fill(-1);
    g.boneExitMm = new Float64Array(g.lines).fill(-1);
    g.pleuraD = new Float64Array(g.lines).fill(16);
    for (let l = 0; l < g.lines; l++) {
      const a = -GRID_GEOMETRY.halfSector + ((l + 0.5) * 2 * GRID_GEOMETRY.halfSector) / g.lines;
      const at = (r: number) => {
        const rho = GRID_GEOMETRY.curvatureRadius + r;
        return inRib(rho * Math.sin(a), rho * Math.cos(a) - GRID_GEOMETRY.curvatureRadius);
      };
      const run = boneRunAlongLine(at, GRID_GEOMETRY.depthMm, GRID_GEOMETRY.rows);
      if (run) {
        g.boneEntryMm[l] = run.entry;
        g.boneExitMm[l] = run.exit;
      }
    }
    return g;
  }

  it('la paridad de A de la mirada 0 ve la fase: sin ella, la GPU no casaría', () => {
    const g = ribGrid();
    const twin = look0ApertureTwin(g, AP, COH);
    const rows = g.rows;
    const lines = g.lines;
    const aperture = new Float32Array(rows * lines);
    const drawn = new Float32Array(rows * lines);
    for (let k = 0; k < 40; k++)
      for (let l = 0; l < lines; l++) {
        aperture[k * lines + l] = twin.at(l, k);
        drawn[k * lines + l] = twin.drawn(l, k);
      }
    const gpu = { lines, samples: 40, aperture, drawn };
    const ok = compareLook0Aperture(g, AP, COH, gpu, 4);
    expect(ok.apertureMaxDiffDb).toBeLessThan(1e-4);
    expect(ok.drawnMaxDiffDb).toBeLessThan(1e-4);
    expect(ok.boneSamples).toBeGreaterThan(50);
    // bajo la pleura (fila tope de 16 mm) la transmisión dibujada es la de su fila
    const kCap = Math.floor(15.5 / g.stepMm);
    expect(twin.drawn(96, 30)).toBe(twin.at(96, kCap));
    // una GPU con la media de amplitudes de VExUS no pasaría: bajo la costilla la fase quita decibelios
    const plain = (l: number, k: number) =>
      apertureTransmission(
        AP,
        l,
        (k + 0.5) * g.stepMm,
        (m) => Math.pow(10, -prefixDb(g, m, k).db / 40),
        (m) => (g.boneEntryMm![m] >= 0 ? (Math.floor(g.boneEntryMm![m] / g.stepMm) + 0.5) * g.stepMm : Infinity),
      );
    expect(db(plain(96, 25)) - db(twin.at(96, 25))).toBeGreaterThan(3);
  });

  it('la paridad de D ve el pedestal en sombra: el gemelo sin él se aparta de la GPU', () => {
    const lines = 64;
    const samples = 32;
    const coarseRows = 8;
    const re = new Float32Array(lines * samples);
    const im = new Float32Array(lines * samples);
    const drawn = new Float32Array(lines * coarseRows);
    const envelope = new Float32Array(lines * samples);
    for (let v = 0; v < samples; v++)
      for (let u = 0; u < lines; u++) {
        const shadow = u >= 24 && u < 44;
        re[v * lines + u] = shadow ? 1e-4 : 1;
        im[v * lines + u] = 0.1 * Math.sin(u + v);
      }
    for (let r = 0; r < coarseRows; r++) for (let u = 0; u < lines; u++) drawn[r * lines + u] = u >= 24 && u < 44 ? 1e-4 : 1;
    const inp: LateralParityInputs = {
      lines,
      samples,
      coarseRows,
      depthMm: 40,
      focusMm: 16,
      curvatureRadius: 60,
      halfSector: (34 * Math.PI) / 180,
      beam: CONVEX_BEAM,
      clutter: ref,
      re,
      im,
      coupling: new Float32Array(lines).fill(1),
      drawn,
      envelope,
    };
    for (let v = 0; v < samples; v++) for (let u = 0; u < lines; u++) envelope[v * lines + u] = lateralTwin(inp, u, v);
    const p = compareLateral(inp, 1, 1);
    expect(p.maxDiffDb).toBeLessThan(1e-4);
    expect(p.shadowedSamples).toBeGreaterThan(30);
    // la envolvente del pedestal de siempre no casa en la sombra
    for (let v = 0; v < samples; v++) for (let u = 0; u < lines; u++) envelope[v * lines + u] = lateralTwin(inp, u, v, false);
    expect(compareLateral(inp, 1, 1).maxDiffDb).toBeGreaterThan(3);
  });
});
