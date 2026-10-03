import { describe, expect, it } from 'vitest';
import {
  KIDNEY,
  KIDNEY_FAR_BLEND_MM,
  KIDNEY_NEAR_MARGIN_MM,
  KIDNEY_RADII,
  KIDNEY_REACH_MM,
  perirenalDistance,
} from '../anatomy/organs/kidney';
import { spinousTipZ } from '../anatomy/organs/ribcage';
import { STOMACH } from '../anatomy/organs/stomach';
import { torsoDepth } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import { GAS_WINDOW, gasWindows } from '../app/gasBench';
import { RETRO_FAT, RETRO_FRONT_SPAN_MAX_MM } from '../anatomy/organs/retroperitoneum';
import type { ChestHabitus } from '../physiology/patientState';
import type { Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';

/**
 * El estómago y los riñones (lus-sim, decisión 43), frente a la base: el estómago en ayunas de Fidler y cols. (volumen y gas) y de
 * Henry y cols. (la pared); los riñones de Gray (su borde superior), Morris (las verticales), Xue y cols. (la profundidad), Glodny
 * y cols. (el largo y el giro sagital).
 */
const scene = new AnatomyScene(defaultPatient());
const cls = (m: Vec3) => scene.classify(m, BASELINE_INSTANT).tissue;
const STOMACH_TISSUES = new Set([Tissue.Bowel, Tissue.Fluid, Tissue.BowelGas]);
const KIDNEY_TISSUES = new Set([Tissue.RenalCapsule, Tissue.RenalCortex, Tissue.RenalMedulla, Tissue.RenalSinus, Tissue.RenalPelvis]);

describe('El estómago bajo la cúpula izquierda (decisión 43; Fidler y cols., Henry y cols.)', () => {
  const h = 2;
  const pts: Array<{ m: Vec3; t: Tissue }> = [];
  for (let x = 20; x <= 170; x += h)
    for (let y = -70; y <= 110; y += h)
      for (let z = -140; z <= 20; z += h) {
        const m: Vec3 = [x, y, z];
        const t = cls(m);
        if (STOMACH_TISSUES.has(t) && scene.inStomach(m, BASELINE_INSTANT)) pts.push({ m, t });
      }
  const mL = (t?: Tissue) => (pts.filter((p) => t === undefined || p.t === t).length * h ** 3) / 1000;

  it('su volumen, recortado por el bazo, es el del estómago en ayunas (Fidler: 167 ± 45 mL; medido ≈ 146)', () => {
    const [lo, hi] = STOMACH.params.volumeMl.range!;
    expect(mL()).toBeGreaterThanOrEqual(lo);
    expect(mL()).toBeLessThanOrEqual(hi);
  });

  it('su gas es el del estómago en ayunas (Fidler: 21–25 mL; el rango ≈ ± 1 DE; medido ≈ 18) y está arriba, sobre un nivel', () => {
    const [lo, hi] = STOMACH.params.gasMl.range!;
    expect(mL(Tissue.BowelGas)).toBeGreaterThanOrEqual(lo);
    expect(mL(Tissue.BowelGas)).toBeLessThanOrEqual(hi);
    // supino: la gravedad va a −y; todo el gas por encima de todo el líquido
    const gasY = Math.min(...pts.filter((p) => p.t === Tissue.BowelGas).map((p) => p.m[1]));
    const fluidY = Math.max(...pts.filter((p) => p.t === Tissue.Fluid).map((p) => p.m[1]));
    expect(fluidY).toBeLessThanOrEqual(gasY);
    expect(Math.abs(scene.stomach.gasY - gasY)).toBeLessThanOrEqual(h);
  });

  it('su pared, en la línea central de la LMC en el EIC7, mide la de Henry (3,61 ± 0,51 mm)', () => {
    // la normal de la pared torácica en la LMC izquierda: de delante atrás y algo hacia dentro; la pared del estómago, del
    // diafragma al gas (la primera luz)
    const c = pts.filter((p) => Math.abs(p.m[2] + 58) < 1 && Math.abs(p.m[0] - 88) < 1).map((p) => p.m[1]);
    expect(c.length).toBeGreaterThan(3);
    const top = Math.max(...c);
    let y = top;
    while (cls([88, y, -58]) === Tissue.Bowel) y -= 0.05;
    const [lo, hi] = STOMACH.params.wallMm.range!;
    expect(top - y).toBeGreaterThanOrEqual(lo - h);
    expect(top - y).toBeLessThanOrEqual(hi);
  });

  it('está a la izquierda, delante del bazo y bajo el diafragma: nada en la línea media ni detrás de la LAP', () => {
    for (const p of pts) {
      expect(p.m[0]).toBeGreaterThan(30);
      expect(-torsoDepth(p.m, scene.torso)).toBeLessThan(scene.stomach.maxSkinDepth);
    }
  });
});

describe('Los riñones (decisión 43; Gray, Morris, Xue y cols., Glodny y cols.)', () => {
  const pts: Vec3[][] = [[], []];
  const h = 2;
  for (let x = -110; x <= 110; x += h)
    for (let y = -100; y <= 20; y += h)
      for (let z = -180; z <= -30; z += h) if (KIDNEY_TISSUES.has(cls([x, y, z]))) pts[x < 0 ? 0 : 1].push([x, y, z]);

  it('su borde superior, a la altura de la punta de la espinosa de T11 (Gray, Morris); el derecho, 1 cm más bajo', () => {
    const top = pts.map((p) => Math.max(...p.map((q) => q[2])));
    const zT11 = spinousTipZ(KIDNEY.params.topSpinous.value);
    expect(Math.abs(top[1] - zT11)).toBeLessThan(h + 1);
    expect(Math.abs(top[0] - (zT11 - KIDNEY.params.rightLowerMm.value))).toBeLessThan(h + 1);
  });

  it('entre las verticales de Morris (2,5 y 9,5 cm de la línea media)', () => {
    for (const p of pts) {
      const ax = p.map((q) => Math.abs(q[0]));
      expect(Math.min(...ax)).toBeGreaterThanOrEqual(25);
      expect(Math.max(...ax)).toBeLessThanOrEqual(95);
    }
  });

  it('a la profundidad de Xue (± 1 DE): la media de la piel de la espalda a sus caras posterior y anterior junto al hilio', () => {
    for (const [k, p] of pts.entries()) {
      const c = scene.kidneys[k].center;
      // la vertical por el centro (x del centro), a la altura del centro
      const col = p.filter((q) => Math.abs(q[0] - c[0]) < 1 && Math.abs(q[2] - Math.round(c[2] / h) * h) < 1).map((q) => q[1]);
      const back = -scene.torso.b * Math.sqrt(1 - (c[0] / scene.torso.a) ** 2);
      const depth = (Math.min(...col) + Math.max(...col)) / 2 - back;
      const P = k === 0 ? KIDNEY.params.depthRightMm : KIDNEY.params.depthLeftMm;
      expect(depth).toBeGreaterThanOrEqual(P.range![0]);
      expect(depth).toBeLessThanOrEqual(P.range![1]);
    }
  });

  it('su largo es el de Glodny (108,5 ± 12,2 y 111,3 ± 12,6 mm) y su polo superior va detrás (el giro sagital de Glodny)', () => {
    for (const [k, p] of pts.entries()) {
      const n = p.length;
      const c = [0, 1, 2].map((i) => p.reduce((a, q) => a + q[i], 0) / n);
      const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => p.reduce((a, q) => a + (q[i] - c[i]) * (q[j] - c[j]), 0) / n));
      let v = [0, 0, 1];
      for (let it = 0; it < 200; it++) {
        const w = [0, 1, 2].map((i) => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]);
        const l = Math.hypot(w[0], w[1], w[2]);
        v = w.map((x) => x / l);
      }
      if (v[2] < 0) v = v.map((x) => -x);
      const proj = p.map((q) => (q[0] - c[0]) * v[0] + (q[1] - c[1]) * v[1] + (q[2] - c[2]) * v[2]);
      const length = Math.max(...proj) - Math.min(...proj);
      expect(length).toBeGreaterThanOrEqual(2 * KIDNEY_RADII[0] - 2 * h);
      expect(length).toBeGreaterThanOrEqual(96);
      expect(length).toBeLessThanOrEqual(124);
      // el ángulo del eje en el plano sagital, con el polo superior detrás (y < 0)
      const sag = (Math.atan2(-v[1], v[2]) * 180) / Math.PI;
      const P = k === 0 ? KIDNEY.params.sagittalTiltRightDeg : KIDNEY.params.sagittalTiltLeftDeg;
      expect(sag).toBeGreaterThanOrEqual(P.range![0]);
      expect(sag).toBeLessThanOrEqual(P.range![1]);
    }
  });

  it('su ancho y su grueso son los de un adulto normal (Glodny y cols.; Bhardwaj y cols.; Kang y cols.), por sus ejes principales', () => {
    for (const p of pts) {
      const n = p.length;
      const c = [0, 1, 2].map((i) => p.reduce((a, q) => a + q[i], 0) / n);
      const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => p.reduce((a, q) => a + (q[i] - c[i]) * (q[j] - c[j]), 0) / n));
      const axes: number[][] = [];
      for (let e = 0; e < 3; e++) {
        let v = [0.1, 1, 0.3 * e];
        for (let it = 0; it < 300; it++) {
          let w = [0, 1, 2].map((i) => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]);
          for (const a of axes) {
            const d = w[0] * a[0] + w[1] * a[1] + w[2] * a[2];
            w = w.map((x, i) => x - d * a[i]);
          }
          const l = Math.hypot(w[0], w[1], w[2]);
          v = w.map((x) => x / l);
        }
        axes.push(v);
      }
      const ext = axes.map((v) => {
        const proj = p.map((q) => (q[0] - c[0]) * v[0] + (q[1] - c[1]) * v[1] + (q[2] - c[2]) * v[2]);
        return Math.max(...proj) - Math.min(...proj);
      });
      const [, w, t] = ext;
      expect(w).toBeGreaterThanOrEqual(KIDNEY.params.widthMm.range![0]);
      expect(w).toBeLessThanOrEqual(KIDNEY.params.widthMm.range![1]);
      expect(t).toBeGreaterThanOrEqual(KIDNEY.params.thicknessMm.range![0]);
      expect(t).toBeLessThanOrEqual(KIDNEY.params.thicknessMm.range![1]);
    }
  });

  it('la grasa perirrenal lo rodea: detrás de su cápsula, grasa', () => {
    for (const k of scene.kidneys) {
      let y = k.center[1];
      while (KIDNEY_TISSUES.has(cls([k.center[0], y, k.center[2]]))) y -= 0.25;
      expect(cls([k.center[0], y - 0.5, k.center[2]])).toBe(Tissue.PerirenalFat);
    }
  });
});

describe('El retroperitoneo (decisión 43)', () => {
  it('la pendiente del borde anterior no pasa de su cota en los seis hábitos (la de la distancia de la grasa)', () => {
    for (const build of ['average', 'thin', 'obese'] as const)
      for (const sex of ['male', 'female'] as const) {
        const p = defaultPatient();
        const chest: ChestHabitus = { build, sex };
        const f = new AnatomyScene({ ...p, habitus: { ...p.habitus, chest } }).retro;
        expect(f.front - (f.back + RETRO_FAT.yLateral)).toBeLessThanOrEqual(RETRO_FRONT_SPAN_MAX_MM);
        expect(f.front - (f.back + RETRO_FAT.yLow)).toBeLessThanOrEqual(RETRO_FRONT_SPAN_MAX_MM);
      }
  });

  // Cada columna por y (de delante atrás) que cruza el riñón, en una rejilla de 5 mm sobre su silueta y en los seis hábitos: detrás
  // de él no aparece hígado ni bazo. Al lado de su borde lateral sí pueden ir (Gray: el borde posterior del bazo, entre el
  // diafragma y el riñón izquierdo). Sin la sombra del riñón (`kidneyShadow`), el lóbulo derecho de VExUS quedaba detrás del
  // riñón derecho
  it('detrás del riñón no hay hígado ni bazo (Gray: su cara posterior apoya en el diafragma y los músculos), en los seis hábitos', () => {
    const RENAL = new Set([Tissue.RenalCapsule, Tissue.RenalCortex, Tissue.RenalMedulla, Tissue.RenalSinus, Tissue.RenalPelvis]);
    const ORGAN = new Set([Tissue.Liver, Tissue.LiverCapsule, Tissue.Spleen]);
    for (const build of ['average', 'thin', 'obese'] as const)
      for (const sex of ['male', 'female'] as const) {
        const p = defaultPatient();
        const s = new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: { build, sex } } });
        const behind: string[] = [];
        let crossed = 0;
        for (const k of s.kidneys)
          for (let dx = -35; dx <= 35; dx += 5)
            for (let dz = -65; dz <= 65; dz += 5) {
              let renal = false;
              for (let y = k.center[1] + 30; y > k.center[1] - 90; y -= 0.5) {
                const t = s.classify([k.center[0] + dx, y, k.center[2] + dz], BASELINE_INSTANT).tissue;
                if (RENAL.has(t)) {
                  if (!renal) crossed++;
                  renal = true;
                } else if (renal && ORGAN.has(t)) {
                  behind.push(`${Tissue[t]} en ${(k.center[0] + dx).toFixed(0)}, ${y}, ${(k.center[2] + dz).toFixed(0)}`);
                  break;
                }
              }
            }
        expect(crossed, `${build}-${sex}`).toBeGreaterThan(250);
        expect(behind, `${build}-${sex}`).toEqual([]);
      }
  });

  // lus-sim (decisión 43): fuera de la esfera del riñón, la distancia a su grasa sale del elipsoide de la grasa y se funde con la de
  // su forma; antes era la de la esfera, que saltaba (de 29 a 3 mm junto al bazo) y la impresión renal partía el bazo
  it('la distancia a la grasa perirrenal es continua al salir de la esfera del riñón', () => {
    const edge = KIDNEY_REACH_MM + KIDNEY_NEAR_MARGIN_MM;
    for (const k of scene.kidneys)
      for (let i = 0; i < 64; i++) {
        const th = Math.acos(1 - (2 * (i + 0.5)) / 64);
        const ph = i * 2.39996;
        const dir: Vec3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        const at = (r: number) =>
          perirenalDistance([k.center[0] + dir[0] * r, k.center[1] + dir[1] * r, k.center[2] + dir[2] * r], scene.kidneys);
        for (const r of [edge, edge + KIDNEY_FAR_BLEND_MM]) expect(Math.abs(at(r + 0.01) - at(r - 0.01)), `${i} ${r}`).toBeLessThan(0.1);
      }
  });
});

describe('La firma del gas en la envolvente (gasBench, decisión 43)', () => {
  /** Una envolvente de una línea: 1 hasta el gas, las reverberaciones a 2 y 3 veces su profundidad y 0,01 entre medias. */
  function synthetic(g: number, depth = 100, samples = 1000) {
    const data = new Float32Array(samples);
    for (let k = 0; k < samples; k++) {
      const r = ((k + 0.5) * depth) / samples;
      data[k] = r < g ? 1 : Math.abs(r - 2 * g) < 1 || Math.abs(r - 3 * g) < 1 ? 0.3 : 0.01;
    }
    return { lines: 1, samples, data };
  }

  it('mide delante del gas, la sombra, la reverberación y el valle en sus ventanas', () => {
    const s = gasWindows(synthetic(20), [20], 100, (db) => db);
    expect(s.lines).toBe(1);
    expect(s.gasMm).toBe(20);
    expect(s.beforeDb).toBeCloseTo(0, 6);
    // la sombra (30–60 mm) lleva las dos reverberaciones (40 y 60 mm): ≈ −20 dB
    expect(s.shadowDb).toBeLessThan(s.beforeDb - 15);
    expect(s.troughDb).toBeCloseTo(-40, 6);
    expect(s.reverbDb).toBeGreaterThan(s.troughDb + 6);
  });

  it('una línea sin gas, o cuyas ventanas salen de la imagen, no cuenta', () => {
    expect(gasWindows(synthetic(20), [-1], 100, (db) => db).lines).toBe(0);
    expect(gasWindows(synthetic(55), [55], 100, (db) => db).lines).toBe(0);
    expect(gasWindows(synthetic(GAS_WINDOW.before[1] - 1), [GAS_WINDOW.before[1] - 1], 100, (db) => db).lines).toBe(0);
    expect(() => gasWindows(synthetic(20), [20, 20], 100, (db) => db)).toThrow(RangeError);
  });
});
