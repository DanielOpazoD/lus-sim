import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compressionSample, uncompress, warpAt } from '../anatomy/compression';
import { INTERFACE_COUNT, Interface, interfaceReflectivity } from '../anatomy/interfaces';
import { torsoNormal } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { TISSUES, Tissue, impedanceMRayl, reflectionCoefficient } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient, type PatientState } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, clampPose, defaultPose, lineAngle, pointOnLine, type ProbePose } from '../probe/probe';
import { IFACE_SHIFT_MM, IFACE_SLOPE_REF, facetLobe, interfaceEchoField } from '../ultrasound/interfaceEcho';
import { PLEURA_RT_RANGE, aLineGain, pleuraCoherence, pleuraRoundTrip, pleuraTerms, slidingField } from '../ultrasound/pleura';
import { scattererField } from '../ultrasound/speckleField';
import { SCAN_DEPTH_MM, chestView, intercostalZ, longitudinalPose, scanLine, type ChestView } from './support/chestView';

/**
 * Invariantes físicas de la guía (docs/GUIDE.md §18) sobre el motor portado, en TypeScript puro (lus-sim,
 * decisión 10). No fijan cifras de una escena: fijan leyes que la física exige, así que sus umbrales son de
 * redondeo. Cada una se comprobó con una mutación del código que protege (la descripción está en la PR de la
 * decisión 10): la prueba falla si la ley se rompe.
 */
const scene = new AnatomyScene(defaultPatient());
const k0 = (2 * Math.PI) / (1540 / 2500);
const FC = { seed: 20260926 };

describe('líneas A: la serie de reverberaciones las pone a múltiplos exactos de la profundidad de la pleura', () => {
  it('la réplica k del eco pleural está centrada exactamente en k·D, para cualquier D', () => {
    // pleuraTerms (gemelo de la pasada B) a la distancia s = k·D + δ del camino: el término de la pleura es la
    // réplica k y su perfil se evalúa a k·D − s = −δ del cruce. Umbral: el redondeo de coma flotante de k·D
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 80, noNaN: true }),
        fc.integer({ min: 1, max: 8 }),
        fc.double({ min: -0.49, max: 0.49, noNaN: true }),
        (D, k, frac) => {
          const delta = frac * D;
          const [p] = pleuraTerms(k * D + delta, D, 0.4, pleuraCoherence(1, k0), () => 0.4);
          expect(p.family).toBe('pleura');
          expect(p.order).toBe(k);
          expect(Math.abs(p.depth + delta)).toBeLessThanOrEqual(1e-9 * k * D);
        },
      ),
      { ...FC, numRuns: 500 },
    );
  });

  it('los picos de la línea pleural y de las líneas A se separan exactamente D (la pleura medida en la escena)', () => {
    // La amplitud de la réplica (ganancia × perfil de la cara de un lado, 2,5σh dentro del músculo): sus picos a
    // lo largo de la línea central, con la pleura de dos vistas del tórax que la tienen a otra profundidad. La
    // separación sigue a D, venga de donde venga: no es una textura. Umbral: el paso del barrido (0,002 mm)
    for (const pose of [defaultPose(), longitudinalPose(Math.PI, intercostalZ(scene, 5, Math.PI))]) {
      const D = scanLine(chestView(scene, pose), 0).pleuraMm!;
      const amp = (s: number): number => {
        const p = pleuraTerms(s, D, 0.4, pleuraCoherence(1, k0), () => 0.4)[0];
        return p.gain * interfaceEchoField(Interface.PleuraWall, 1, 1, p.depth, k0);
      };
      const peaks: number[] = [];
      for (let k = 1; k <= 4; k++) {
        let best = k * D - 1;
        for (let s = k * D - 1; s <= k * D + 1; s += 0.002) if (amp(s) > amp(best)) best = s;
        peaks.push(best);
      }
      expect(Math.abs(peaks[0] - (D - IFACE_SHIFT_MM))).toBeLessThanOrEqual(0.002);
      for (let k = 1; k < peaks.length; k++) expect(Math.abs(peaks[k] - peaks[k - 1] - D), `D ${D.toFixed(2)}`).toBeLessThanOrEqual(0.004);
    }
  });
});

/** Los tejidos de la pared del tórax en la clasificación: sus capas y las costillas que la cruzan. */
const WALL_TISSUES: ReadonlySet<Tissue> = new Set([Tissue.Skin, Tissue.Fat, Tissue.Muscle, Tissue.Bone, Tissue.Cartilage]);

/**
 * El primer punto de la línea θ (mm desde la cara) que la clasificación no pone en la pared, y su tejido: marcha
 * de 0,05 mm desde la cara y afinado de 0,002 mm en el último paso; null si la línea no sale de la pared.
 */
function firstBehindWall(v: ChestView, theta: number): { r: number; tissue: Tissue } | null {
  const tissueAt = (r: number): Tissue => v.scene.classify(v.material(pointOnLine(v.contact.frame, v.tr, theta, r)), v.instant).tissue;
  for (let r = 0; r < SCAN_DEPTH_MM; r += 0.05) {
    const t = tissueAt(r);
    if (WALL_TISSUES.has(t)) continue;
    for (let f = Math.max(r - 0.05, 0); f < r; f += 0.002) {
      const tf = tissueAt(f);
      if (!WALL_TISSUES.has(tf)) return { r: f, tissue: tf };
    }
    return { r, tissue: t };
  }
  return null;
}

describe('la pleura de A0 es el cambio de tejido de la clasificación', () => {
  it('A0 pone la pleura donde la clasificación sale de la pared (a ≤ 0,01 mm), y detrás hay pulmón justo donde A0 la ve sobre el borde', () => {
    // A0 (`pleuraCrossingLine`) busca el cruce de la cara interna de la pared con una marcha y una bisección, sin
    // la clasificación, y lo registra sobre el borde del pulmón (dz > 0) o hasta `CURTAIN_RECORD_MM` bajo él (la
    // banda donde la cortina se desvanece). La clasificación pone tras la pared el pulmón sobre el borde y el
    // abdomen bajo él. Línea a línea: la profundidad del primer tejido que no es pared con la de A0, y el tejido con
    // el lado del borde. Vistas con las dos cosas: el punto BLUE, el EIC5 en la medioclavicular (su parte caudal
    // cae en la banda) y en la axilar media, el EIC7 en la axilar posterior y en la medioclavicular. Umbral: la
    // bisección (0,5 mm / 2⁷ ≈ 0,004 mm) más el paso fino del barrido (0,002 mm)
    let lung = 0;
    let band = 0;
    const lmc = defaultPose().phi;
    for (const pose of [
      defaultPose(),
      longitudinalPose(lmc, intercostalZ(scene, 5, lmc)),
      longitudinalPose(Math.PI, intercostalZ(scene, 5, Math.PI)),
      longitudinalPose(1.2 * Math.PI, intercostalZ(scene, 7, 1.2 * Math.PI)),
      longitudinalPose(lmc, intercostalZ(scene, 7, lmc)),
    ]) {
      const v = chestView(scene, pose);
      for (let i = 0; i < CONVEX_C35.lines; i += 8) {
        const th = lineAngle(i, CONVEX_C35);
        const D = scanLine(v, th).pleuraMm;
        if (D === null) continue;
        const behind = firstBehindWall(v, th);
        const dz = scene.lungEdgeMm(v.material(pointOnLine(v.contact.frame, v.tr, th, D)), v.instant);
        const where = `línea ${i}: A0 ${D.toFixed(3)} (dz ${dz?.toFixed(2) ?? '—'})`;
        expect(behind, where).not.toBeNull();
        if (behind === null || dz === null) continue;
        expect(Math.abs(behind.r - D), `${where}, ${Tissue[behind.tissue]} desde ${behind.r.toFixed(3)}`).toBeLessThanOrEqual(0.01);
        expect(behind.tissue === Tissue.Lung, `${where}: detrás hay ${Tissue[behind.tissue]}`).toBe(dz > 0);
        if (dz > 0) lung++;
        else band++;
      }
    }
    // Que no pase vacía: el 26-09-2026 se compararon 82 líneas con pulmón detrás y 14 en la banda; los umbrales
    // solo fallan si una de las vistas deja de registrar la pleura o de cruzar el borde
    expect(lung).toBeGreaterThan(60);
    expect(band).toBeGreaterThan(10);
  });
});

describe('energía en una interfaz: la reflexión y la transmisión se reparten la incidente', () => {
  it('Fresnel en incidencia normal: R² + (Z₁/Z₂)(1 + R)² = 1 entre cualquier par de tejidos, |R| ≤ 1 y R(a, b) = −R(b, a)', () => {
    // intensidad reflejada R² y transmitida 4Z₁Z₂/(Z₁ + Z₂)² (la presión transmitida es 1 + R): su suma es la
    // incidente. Umbral: redondeo
    const ids: Tissue[] = TISSUES.map((_, i) => i);
    for (const a of ids)
      for (const b of ids) {
        const r = reflectionCoefficient(a, b);
        const za = impedanceMRayl(a);
        const zb = impedanceMRayl(b);
        const transmitted = (za / zb) * (1 + r) ** 2;
        expect(r * r + transmitted, `${TISSUES[a].name} → ${TISSUES[b].name}`).toBeCloseTo(1, 12);
        expect(Math.abs(r)).toBeLessThanOrEqual(1);
        expect(reflectionCoefficient(b, a)).toBeCloseTo(-r, 15);
        // la transmitida es la misma en los dos sentidos (reciprocidad)
        expect(transmitted).toBeCloseTo((zb / za) * (1 - r) ** 2, 12);
      }
    // la pleura: músculo/gas refleja casi todo y transmite casi nada (la línea pleural y la sombra del aire)
    const rp = reflectionCoefficient(Tissue.Muscle, Tissue.Lung);
    expect(rp * rp).toBeGreaterThan(0.998);
  });

  it('ninguna cara refleja más de lo que le llega: 0 ≤ reflectividad efectiva ≤ 1 (el suelo de colágeno incluido)', () => {
    for (let i = 0; i < INTERFACE_COUNT; i++) {
      const id: Interface = i;
      expect(interfaceReflectivity(id), Interface[id]).toBeGreaterThanOrEqual(0);
      expect(interfaceReflectivity(id), Interface[id]).toBeLessThanOrEqual(1);
    }
  });

  it('cada ida y vuelta pleura–sonda pierde energía (G < 1) y las líneas A decaen con su orden', () => {
    // G = R_p·χ·R_t·T(D) (`pleuraRoundTrip`) con cualquier transmisión, cualquier incidencia y R_t en todo su rango
    // calibrable; la réplica k lleva G^(k−1) (`aLineGain`): cada línea A es más débil que la anterior y la primera
    // réplica es la línea pleural
    const [rtMin, rtMax] = PLEURA_RT_RANGE;
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: rtMin, max: rtMax, noNaN: true }),
        (tD, cosI, rt) => {
          const G = pleuraRoundTrip(tD, pleuraCoherence(cosI, k0), rt);
          expect(G).toBeGreaterThanOrEqual(0);
          expect(G).toBeLessThan(1);
          expect(aLineGain(G, 1)).toBe(1);
          for (let k = 1; k < 8; k++) expect(aLineGain(G, k + 1)).toBeLessThanOrEqual(aLineGain(G, k));
          if (G > 0) expect(aLineGain(G, 3)).toBeLessThan(aLineGain(G, 2));
        },
      ),
      { ...FC, numRuns: 300 },
    );
  });

  it('el lóbulo de Kirchhoff reparte la energía reflejada sin crearla: ∫ Λ²·cos⁴θ d²(tan θ) = 2π·s_ref² para cualquier pendiente', () => {
    // Λ = (s_ref/s)·sec²θ·exp(−tan²θ/4s²) en amplitud: con la densidad gaussiana de facetas, la potencia devuelta
    // integrada sobre las pendientes no depende de s (una cara rugosa ensancha el lóbulo, no la energía). Integral
    // radial numérica en ζ = tan θ; umbral: el error de la cuadratura (< 1e-6 relativo)
    for (const s of [0.1, 0.14, 0.15, 0.21, 0.3, 0.4]) {
      let sum = 0;
      const dz = s / 2000;
      for (let z = dz / 2; z < 12 * s; z += dz) {
        const c = 1 / Math.sqrt(1 + z * z);
        sum += facetLobe(c, s) ** 2 * c ** 4 * 2 * Math.PI * z * dz;
      }
      expect(sum / (2 * Math.PI * IFACE_SLOPE_REF ** 2), `s ${s}`).toBeCloseTo(1, 6);
    }
  });
});

describe('la sonda solo empuja: la compresión nunca estira ni tira del tejido', () => {
  it('en cualquier pose sobre el tórax, s ≤ 0 y ∂s/∂ρ ≥ 0 a lo largo de cada línea (el tejido se aparta y se comprime)', () => {
    // m' = p + s·r̂ (anatomy/compression.ts): con s ≤ 0 el tejido que está en p vino de más cerca de la sonda (se
    // apartó); con ∂s/∂ρ ≥ 0, dr/dd = 1 + ∂s/∂ρ ≥ 1 y nunca se estira a lo largo de la línea. Poses al azar del
    // dominio de clampPose en el tórax (φ de axilar posterior a axilar posterior, z del reborde a la clavícula),
    // con presión, flotación, basculación, inclinación y giro. Umbral: redondeo
    const poseArb = fc.record({
      phi: fc.double({ min: -0.2 * Math.PI, max: 1.2 * Math.PI, noNaN: true }),
      z: fc.double({ min: -60, max: 140, noNaN: true }),
      lift: fc.double({ min: -6, max: 4, noNaN: true }),
      yaw: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      rock: fc.double({ min: -0.6, max: 0.6, noNaN: true }),
      tilt: fc.double({ min: -0.5, max: 0.5, noNaN: true }),
    });
    fc.assert(
      fc.property(poseArb, fc.integer({ min: 0, max: CONVEX_C35.lines - 1 }), (raw: ProbePose, line) => {
        const k = probeContact(clampPose(raw), CONVEX_C35, scene.torso);
        const th = lineAngle(line, CONVEX_C35);
        for (let d = -2; d < k.reachMm + 5; d += 1.7) {
          const p = pointOnLine(k.frame, CONVEX_C35, th, d);
          const w = warpAt(p, k);
          expect(w.shift).toBeLessThanOrEqual(0);
          expect(compressionSample(p, k).shift).toBeLessThanOrEqual(0);
          // derivada radial del empuje (la del plano de la cara: la línea es radial)
          const radial = w.grad[0] * w.rhat[0] + w.grad[1] * w.rhat[1] + w.grad[2] * w.rhat[2];
          expect(radial).toBeGreaterThanOrEqual(-1e-12);
        }
        // y la piel bajo la cara nunca queda por encima de ella: lo que la sonda toca, lo empuja
        for (const n of k.nodes) expect(n[0]).toBeLessThanOrEqual(0);
      }),
      { ...FC, numRuns: 150 },
    );
  });

  it('el mapa mundo → material es monótono a lo largo de la línea: dos puntos del mundo nunca intercambian su orden', () => {
    const k = probeContact({ ...defaultPose(), lift: -6 }, CONVEX_C35, scene.torso);
    const C = k.frame.curvatureCenter;
    const radius = (m: Vec3) => Math.hypot(m[0] - C[0], m[1] - C[1], m[2] - C[2]);
    for (let i = 0; i < CONVEX_C35.lines; i += 5) {
      const th = lineAngle(i, CONVEX_C35);
      let prev = -Infinity;
      for (let d = -2; d < k.reachMm + 5; d += 0.25) {
        const r = radius(uncompress(pointOnLine(k.frame, CONVEX_C35, th, d), k));
        // 0,25 mm en el mundo son al menos 0,25 mm en el material (nunca se estira); umbral: redondeo
        expect(r - prev).toBeGreaterThanOrEqual(0.25 - 1e-9);
        prev = r;
      }
    }
  });
});

describe('el deslizamiento se mueve con la fase respiratoria del reloj único', () => {
  /** Punto de la pleura parietal bajo la línea central del punto BLUE superior (material) y su normal exterior. */
  const v = chestView(scene, defaultPose());
  const D = scanLine(v, 0).pleuraMm!;
  const pD = v.material(pointOnLine(v.contact.frame, CONVEX_C35, 0, D));
  const n = torsoNormal(pD, scene.torso);
  const H = 3; // mm bajo la pleura: la banda donde se mira el deslizamiento
  const SEED = 3.1;

  /** El campo del deslizamiento a lo largo de un ciclo, con el tiempo que da el reloj del motor. */
  function slidingOverTime(p: PatientState, seconds: number) {
    const e = new PhysiologyEngine(p, { historySeconds: seconds + 1 });
    const out: { t: number; phase: number; volume: number; f: [number, number] }[] = [];
    const steps = Math.round(seconds / e.clock.dt);
    for (let i = 0; i < steps; i++) {
      const s = e.step();
      out.push({ t: s.t, phase: s.resp.phase, volume: s.resp.volume, f: slidingField(pD, n, s.resp.diaphragmCaudalMm, H, SEED) });
    }
    return out;
  }

  it('la misma fase del ciclo da la misma neblina y otra fase, otra: el pulmón baja con el diafragma del reloj', () => {
    // 15 respiraciones por minuto: el periodo (4 s) es un número entero de pasos del reloj (1000 de 4 ms), así que
    // un periodo después la fase es la misma salvo el redondeo de coma flotante
    const p = { ...defaultPatient(), respiratoryRateMin: 15 };
    const T = 60 / p.respiratoryRateMin;
    const run = slidingOverTime(p, 2 * T + 0.2);
    const stepsPerCycle = Math.round(T / 0.004);
    // un periodo después, la misma fase: el mismo campo (umbral: el de la fase, que el reloj de paso fijo da con
    // redondeo, y la tolerancia de float32 del hash del campo)
    let compared = 0;
    for (let i = 0; i + stepsPerCycle < run.length; i += 25) {
      const a = run[i];
      const b = run[i + stepsPerCycle];
      expect(Math.abs(a.phase - b.phase)).toBeLessThan(1e-9);
      expect(b.f[0]).toBeCloseTo(a.f[0], 6);
      expect(b.f[1]).toBeCloseTo(a.f[1], 6);
      compared++;
    }
    expect(compared).toBeGreaterThan(20);
    // en la pausa espiratoria (volumen 0: fase 0,9–1) el pulmón está quieto: el campo no cambia
    const pause = run.filter((s) => s.volume === 0);
    expect(pause.length).toBeGreaterThan(10);
    for (const s of pause) expect(s.f).toEqual(pause[0].f);
    // al inspirar el pulmón baja y el campo en el punto de la pleura cambia (otra parte del pulmón debajo)
    const inspiration = run.filter((s) => s.volume > 0.5);
    const changed = inspiration.filter((s) => Math.hypot(s.f[0] - pause[0].f[0], s.f[1] - pause[0].f[1]) > 1e-3).length;
    expect(changed / inspiration.length).toBeGreaterThan(0.9);
  });

  it('el campo del instante es el del pulmón de espiración desplazado el descenso del diafragma (anclado al pulmón)', () => {
    const e = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: 'deep' });
    for (let i = 0; i < 400; i++) {
      const s = e.step();
      const c = s.resp.diaphragmCaudalMm;
      // el pulmón que está en pD en este instante estaba c mm más arriba en espiración
      expect(slidingField(pD, n, c, H, SEED)).toEqual(slidingField([pD[0], pD[1], pD[2] + c], n, 0, H, SEED));
    }
  });

  it('en apnea no hay deslizamiento: el campo es el mismo en todo instante', () => {
    for (const pattern of ['apnea-expiratory', 'apnea-inspiratory'] as const) {
      const run = slidingOverTime({ ...defaultPatient(), respiratoryPattern: pattern }, 5);
      for (const s of run) expect(s.f).toEqual(run[0].f);
    }
  });
});

describe('misma semilla, mismo resultado (guía §17)', () => {
  it('dos motores con el mismo paciente dan la misma historia bit a bit; otra semilla, otro ritmo', () => {
    const run = (seed: number) => {
      const e = new PhysiologyEngine({ ...defaultPatient(), seed }, { historySeconds: 6 });
      for (let i = 0; i < 1250; i++) e.step();
      return e.samples.map((s) => ({ t: s.t, ecg: s.ecgMv, rr: s.rr, beat: s.beatIndex, resp: s.resp }));
    };
    const a = run(20260921);
    expect(run(20260921)).toEqual(a);
    // otra semilla cambia los RR (la variabilidad del 3 %) pero no la respiración (determinista por el reloj)
    const b = run(7);
    expect(b.map((s) => s.rr)).not.toEqual(a.map((s) => s.rr));
    expect(b.map((s) => s.resp)).toEqual(a.map((s) => s.resp));
  });

  it('la anatomía, el contacto y las medidas de la escena no tienen azar: la misma pose, el mismo resultado', () => {
    const measure = () => {
      const s = new AnatomyScene(defaultPatient());
      const v = chestView(s, defaultPose());
      return {
        cls: [-55, -5, 70].map((x) => s.classify([x, 60, 90], BASELINE_INSTANT).tissue),
        nodes: v.contact.nodes,
        pleura: scanLine(v, 0.2).pleuraMm,
      };
    };
    expect(measure()).toEqual(measure());
  });

  it('el moteado y el deslizamiento son funciones de la semilla: la misma da el mismo campo y otra, otro', () => {
    const pts: Vec3[] = Array.from({ length: 200 }, (_, i) => [-80 + 0.37 * i, 60 - 0.11 * i, 90 + 0.23 * i]);
    const speckle = (salt: number) => pts.map((p) => scattererField(p, 0.42, salt));
    expect(speckle(5.5)).toEqual(speckle(5.5));
    expect(speckle(6.5)).not.toEqual(speckle(5.5));
    const sliding = (seed: number) => pts.map((p) => slidingField(p, [0, 1, 0], 4, 2, seed));
    expect(sliding(3.1)).toEqual(sliding(3.1));
    expect(sliding(4.1)).not.toEqual(sliding(3.1));
  });
});
