import fc from 'fast-check';
import { chai, describe, expect, it } from 'vitest';
import { heartSd } from '../anatomy/organs/heart';
import { heartLocal } from '../anatomy/organs/heart';
import { LUNG_PULSE, LUNG_PULSE_INVERSE, lungPulseInverse, lungPulseShift, type LungPulseAmplitudes } from '../anatomy/organs/lungPulse';
import { probeHitPoint } from '../anatomy/organs/ribcage';
import { torsoSkinPoint } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { START_POINTS } from '../app/startPoints';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient, type ChestHabitus, type PatientState } from '../physiology/patientState';
import { ejectedFraction, referenceBeat } from '../physiology/echoTwinBeat';
import { cycleStateAt } from '../physiology/heart/cycleModel';
import { referencePhase } from '../physiology/cardiacBeat';

/**
 * El pulso pulmonar (decisión 32, `anatomy/organs/lungPulse.ts`): el deslizamiento del pulmón junto al corazón con el latido.
 * Como el campo respiratorio de la decisión 22, un difeomorfismo por construcción con una inversa de error acotado: aquí el
 * campo es contractivo (|∇v| ≤ `LUNG_PULSE_INVERSE.lipschitz` con las mayores amplitudes del rango), así que x ↦ x + v(x) tiene
 * jacobiano > 0 y el punto fijo converge a la tolerancia. Se comprueba en el pulmón de la banda subpleural (0–10 mm bajo la
 * pleura parietal: donde vive la arena que el pulso mueve) al alcance del corazón, en las seis variantes del tórax.
 */
const SEED = 20261002;
const P = LUNG_PULSE.params;
/** Las mayores amplitudes del rango (la cota de la inversa se exige con ellas). */
const AMP_MAX: LungPulseAmplitudes = { leftMm: P.leftVentricleMm.range![1], rightMm: P.rightVentricleMm.range![1] };
/** Con la fracción expulsada e (0–1), las amplitudes del modelo escaladas: la misma familia de campos. */
const scaled = (e: number, a = AMP_MAX): LungPulseAmplitudes => ({ leftMm: e * a.leftMm, rightMm: e * a.rightMm });
const REACH = LUNG_PULSE.params.reachMm.value;

const HABITS: ChestHabitus[] = (['average', 'thin', 'obese'] as const).flatMap((build) =>
  (['male', 'female'] as const).map((sex) => ({ build, sex })),
);
const patientWith = (chest: ChestHabitus): PatientState => {
  const p = defaultPatient();
  return { ...p, habitus: { ...p.habitus, chest } };
};
const SCENES = HABITS.map((c) => new AnatomyScene(patientWith(c)));
const scene = SCENES[0];

/** Pulmón de la banda subpleural al alcance del corazón (o un poco más allá), en una de las seis escenas. */
const lungArb = fc
  .record({
    v: fc.integer({ min: 0, max: SCENES.length - 1 }),
    phi: fc.double({ min: 0.2, max: 2.4, noNaN: true }),
    z: fc.double({ min: -80, max: 140, noNaN: true }),
    depth: fc.double({ min: 0, max: 10, noNaN: true }),
  })
  .map(({ v, phi, z, depth }) => {
    const s = SCENES[v];
    const t = s.torso;
    return { v, p: probeHitPoint(phi, s.wallThicknessAt(torsoSkinPoint(phi, z, t)) + depth, t, z) };
  })
  .filter(({ v, p }) => heartSd(SCENES[v].heart, p) < REACH + 5 && SCENES[v].classify(p, BASELINE_INSTANT).tissue === Tissue.Lung);

/** La jacobiana de v en p por diferencias centradas (filas: componentes de v; columnas: derivadas). */
function shiftJacobian(s: AnatomyScene, p: Vec3, amp: LungPulseAmplitudes): number[][] {
  const h = 0.05;
  const cols = [0, 1, 2].map((k) => {
    const a: Vec3 = [...p];
    const b: Vec3 = [...p];
    a[k] += h;
    b[k] -= h;
    const va = lungPulseShift(s.heart, s.torso, a, 1, amp);
    const vb = lungPulseShift(s.heart, s.torso, b, 1, amp);
    return [0, 1, 2].map((i) => (va[i] - vb[i]) / (2 * h));
  });
  return [0, 1, 2].map((i) => [cols[0][i], cols[1][i], cols[2][i]]);
}
/** Norma espectral de una 3 × 3 (iteración de potencia sobre JᵀJ). */
function spectralNorm(J: number[][]): number {
  let x = [1, 0.7, 0.3];
  let lambda = 0;
  for (let it = 0; it < 60; it++) {
    const y = [0, 1, 2].map((i) => J[i][0] * x[0] + J[i][1] * x[1] + J[i][2] * x[2]);
    const z = [0, 1, 2].map((j) => J[0][j] * y[0] + J[1][j] * y[1] + J[2][j] * y[2]);
    const n = Math.hypot(z[0], z[1], z[2]);
    if (n === 0) return 0;
    lambda = n / Math.hypot(x[0], x[1], x[2]);
    x = z.map((c) => c / n);
  }
  return Math.sqrt(lambda);
}
const det3 = (M: number[][]): number =>
  M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
  M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
  M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function expectPropertyFails(run: () => void): void {
  let error: unknown = null;
  try {
    run();
  } catch (e) {
    error = e;
  }
  expect(error, 'la mutación no falla').toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/^Property failed/);
  expect((error as Error).cause).toBeInstanceOf(chai.AssertionError);
}

describe('pulso pulmonar: difeomorfismo por construcción (decisión 32)', () => {
  it('el campo es contractivo con las mayores amplitudes del rango: |∇v| ≤ la cota que usa la inversa', () => {
    fc.assert(
      fc.property(lungArb, ({ v, p }) => {
        expect(spectralNorm(shiftJacobian(SCENES[v], p, AMP_MAX))).toBeLessThanOrEqual(LUNG_PULSE_INVERSE.lipschitz);
      }),
      { seed: SEED, numRuns: 1500 },
    );
  });

  it('jacobiano de x ↦ x + v(x) > 0 en todo instante del latido y con toda amplitud del rango', () => {
    fc.assert(
      fc.property(lungArb, fc.double({ min: 0, max: 1, noNaN: true }), ({ v, p }, e) => {
        const J = shiftJacobian(SCENES[v], p, scaled(e));
        const I = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + J[i][j]));
        // con ‖∇v‖ ≤ L, cada valor singular de I + ∇v es ≥ 1 − L: det ≥ (1 − L)³ > 0
        expect(det3(I)).toBeGreaterThanOrEqual((1 - LUNG_PULSE_INVERSE.lipschitz) ** 3);
      }),
      { seed: SEED, numRuns: 1000 },
    );
  });

  it('pulmón → latido → pulmón vuelve al punto a ≤ la tolerancia, con toda amplitud del rango', () => {
    fc.assert(
      fc.property(lungArb, fc.double({ min: 0, max: 1, noNaN: true }), ({ v, p }, e) => {
        const s = SCENES[v];
        const shift = lungPulseShift(s.heart, s.torso, p, e, AMP_MAX);
        const q: Vec3 = [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
        expect(dist(lungPulseInverse(s.heart, s.torso, q, e, AMP_MAX), p)).toBeLessThanOrEqual(LUNG_PULSE_INVERSE.toleranceMm);
      }),
      { seed: SEED, numRuns: 1500 },
    );
  });

  it('mutación: dos pasos de punto fijo (como la inversa de VExUS) no alcanzan la tolerancia con la mayor amplitud', () => {
    const twoSteps = (s: AnatomyScene, q: Vec3): Vec3 => {
      let x = q;
      for (let i = 0; i < 2; i++) {
        const v = lungPulseShift(s.heart, s.torso, x, 1, AMP_MAX);
        x = [q[0] - v[0], q[1] - v[1], q[2] - v[2]];
      }
      return x;
    };
    expectPropertyFails(() =>
      fc.assert(
        fc.property(lungArb, ({ v, p }) => {
          const s = SCENES[v];
          const shift = lungPulseShift(s.heart, s.torso, p, 1, AMP_MAX);
          const q: Vec3 = [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
          expect(dist(twoSteps(s, q), p)).toBeLessThanOrEqual(LUNG_PULSE_INVERSE.toleranceMm);
        }),
        { seed: SEED, numRuns: 1500 },
      ),
    );
  });
});

describe('pulso pulmonar: amplitud por distancia al corazón', () => {
  const t = scene.torso;
  /** Pleura parietal (1,5 mm bajo ella) en φ y z. */
  const pleuraAt = (phi: number, z: number): Vec3 => probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + 1.5, t, z);

  it('decae con la distancia al corazón y es 0 desde su alcance; en los puntos de partida del hemitórax derecho, nada; en el izquierdo, el BLUE inferior', () => {
    const w = scene.heart.window;
    const phi = Math.acos(47.5 / t.a);
    const at = (dz: number) => {
      const p = pleuraAt(phi, w.z + w.r + dz);
      const v = lungPulseShift(scene.heart, t, p, 1);
      return { d: heartSd(scene.heart, p), mm: Math.hypot(v[0], v[1], v[2]) };
    };
    const rows = [5, 10, 20, 30, 40, 50].map(at);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].d).toBeGreaterThan(rows[i - 1].d);
      expect(rows[i].mm).toBeLessThanOrEqual(rows[i - 1].mm + 1e-9);
    }
    // junto a la ventana, la cara anterior (el ventrículo derecho, casi paralela a la pared): poco, < 1 mm
    expect(rows[0].mm).toBeGreaterThan(0.5);
    expect(rows[0].mm).toBeLessThan(1);
    for (const r of rows) if (r.d >= REACH) expect(r.mm).toBe(0);
    for (const sp of START_POINTS.filter((x) => x.side === 'right'))
      expect(lungPulseShift(scene.heart, t, pleuraAt(sp.phi, sp.z), 1, AMP_MAX), sp.id).toEqual([0, 0, 0]);
    // (decisión 42) en el izquierdo, el BLUE inferior queda al alcance del corazón (el pulso pulmonar, junto al borde
    // cardiaco: la regla de las manos lo pone «cerca del pezón»); los demás, no
    const pulse = (sp: (typeof START_POINTS)[number]) => Math.hypot(...lungPulseShift(scene.heart, t, pleuraAt(sp.phi, sp.z), 1, AMP_MAX));
    const left = START_POINTS.filter((x) => x.side === 'left' && pulse(x) > 0).map((x) => x.id);
    expect(left).toEqual(['blueLowerLeft']);
  });

  it('se ve en el borde del corazón, donde su cara está oblicua a la pared: el borde izquierdo (≈ 11 cm) más que el ápex y la ventana', () => {
    const w = scene.heart.window;
    const mm = (X: number) => Math.hypot(...lungPulseShift(scene.heart, t, pleuraAt(Math.acos(X / t.a), w.z), 1));
    const win = Math.hypot(...lungPulseShift(scene.heart, t, pleuraAt(Math.acos(47.5 / t.a), w.z + w.r + 5), 1));
    expect(mm(110)).toBeGreaterThan(mm(90));
    expect(mm(90)).toBeGreaterThan(win);
    // y nunca más que la amplitud del ventrículo izquierdo (solo su parte tangente)
    expect(mm(110)).toBeLessThan(P.leftVentricleMm.value);
  });

  it('en la sístole el pulmón va hacia el corazón: contra la normal de su cara', () => {
    fc.assert(
      fc.property(lungArb, ({ v, p }) => {
        const s = SCENES[v];
        const sh = lungPulseShift(s.heart, s.torso, p, 1);
        const q = heartLocal(s.heart, p);
        const g = q.map((c, i) => c / s.heart.radii[i] ** 2);
        const nc = [0, 1, 2].map((k) => g[0] * s.heart.e1[k] + g[1] * s.heart.e2[k] + g[2] * s.heart.e3[k]);
        expect(sh[0] * nc[0] + sh[1] * nc[1] + sh[2] * nc[2]).toBeLessThanOrEqual(1e-12);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('es tangente a la pared: la pleura visceral se desliza sobre la parietal, no se separa de ella', () => {
    fc.assert(
      fc.property(lungArb, ({ v, p }) => {
        const s = SCENES[v];
        const sh = lungPulseShift(s.heart, s.torso, p, 1);
        const n = [p[0] / s.torso.a ** 2, p[1] / s.torso.b ** 2];
        const nl = Math.hypot(n[0], n[1]);
        expect(Math.abs((sh[0] * n[0] + sh[1] * n[1]) / nl)).toBeLessThan(1e-9);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });
});

describe('el latido del reloj único: la fracción expulsada de la curva de volumen de EchoTwin (physiology/cardiacBeat.ts)', () => {
  it('cada latido del reloj, por tramos sobre el de referencia: la R en 0, la telesístole del reloj en la de referencia', () => {
    const ref = referenceBeat();
    const e = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: 'apnea-expiratory' });
    const beats = e.rhythm.beatsBetween(0.5, 6);
    expect(beats.length).toBeGreaterThan(4);
    for (const b of beats) {
      expect(referencePhase(b, b.tR)).toBe(0);
      expect(referencePhase(b, b.tV)).toBeCloseTo(ref.endSystoleS / ref.rrS, 12);
      // monótona y en [0, 1)
      let prev = -1;
      for (let k = 0; k < 200; k++) {
        const p = referencePhase(b, b.tR + (k / 200) * b.rr);
        expect(p).toBeGreaterThan(prev);
        expect(p).toBeLessThan(1);
        prev = p;
      }
    }
  });

  it('0 en la telediástole, 1 en la telesístole de EchoTwin, entre 0 y 1: la eyección, el llenado rápido y la onda A', () => {
    const ref = referenceBeat();
    expect(ejectedFraction(0)).toBeCloseTo(0, 2);
    // la telesístole de EchoTwin: el VI en su mínimo (≈ 45 mL de 120)
    expect(ejectedFraction(ref.endSystoleS / ref.rrS)).toBeCloseTo(1, 2);
    let max = 0;
    for (let k = 0; k < 400; k++) {
      const f = ejectedFraction(k / 400);
      expect(f).toBeGreaterThanOrEqual(-0.02);
      expect(f).toBeLessThanOrEqual(1.02);
      max = Math.max(max, f);
    }
    expect(max).toBeCloseTo(1, 2);
    // antes de la onda A el VI no está lleno: la contracción auricular aporta el último llenado
    const tm = ref.timings;
    expect(ejectedFraction(tm.aStartS / ref.rrS)).toBeGreaterThan(0.1);
  });

  it('la muestra del motor la lleva, continua y periódica a la FC (sin respiración en apnea)', () => {
    const e = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: 'apnea-expiratory', rrVariability: 0 });
    let prev = e.sample.cardiacEjection;
    let maxJump = 0;
    const peaks: number[] = [];
    let before = prev;
    let prevT = e.sample.t;
    for (let i = 0; i < Math.round(6 / e.clock.dt); i++) {
      const s = e.step();
      maxJump = Math.max(maxJump, Math.abs(s.cardiacEjection - prev));
      // un máximo local (la telesístole) en la muestra anterior
      if (prev > before && prev >= s.cardiacEjection) peaks.push(prevT);
      before = prev;
      prev = s.cardiacEjection;
      prevT = s.t;
    }
    // continua: en un paso de 4 ms cambia poco
    expect(maxJump).toBeLessThan(0.05);
    // un máximo por latido, separados un RR
    const rr = 60 / defaultPatient().heartRateBpm;
    expect(peaks.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i] - peaks[i - 1]).toBeCloseTo(rr, 2);
  });
});

describe('sin contracción auricular (FA, decisión 53) el latido no tiene onda A: ni en el volumen, ni en la geometría, ni en el pulso pulmonar', () => {
  /** Los latidos completos de un motor, con su fracción expulsada y el estado cinemático que lee la geometría en cada paso. */
  function beats(patient: Partial<ReturnType<typeof defaultPatient>>) {
    const e = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: 'apnea-expiratory', ...patient });
    const ref = referenceBeat();
    const out = new Map<number, { t: number; ejection: number; atrial: number; hold: number; rr: number }[]>();
    for (let i = 0; i < Math.round(10 / e.clock.dt); i++) {
      const s = e.step();
      const st = cycleStateAt(ref, s.heartPhase);
      const list = out.get(s.beatIndex) ?? [];
      list.push({ t: s.t - s.lastR, ejection: s.cardiacEjection, atrial: st.atrialContraction, hold: st.atrialHold, rr: s.rr });
      out.set(s.beatIndex, list);
    }
    // sin el primero ni el último, que quedan cortados por la ventana
    return [...out.values()].slice(1, -1);
  }

  /** La mayor BAJADA de la fracción expulsada en la diástole, después de su máximo (el llenado que añade la onda A). */
  function lateFill(b: { ejection: number }[]): number {
    const peak = b.reduce((m, x, i) => (x.ejection > b[m].ejection ? i : m), 0);
    return b[peak].ejection - Math.min(...b.slice(peak).map((x) => x.ejection));
  }

  it('en FA, la contracción auricular de la geometría es 0 en todo el latido; en sinusal llega a 1', () => {
    const af = beats({ rhythm: 'atrial-fibrillation' });
    expect(af.length).toBeGreaterThan(6);
    for (const b of af)
      for (const x of b) {
        expect(x.atrial).toBeCloseTo(0, 9);
        expect(x.hold).toBe(0);
      }
    const sinus = beats({});
    expect(Math.max(...sinus.flatMap((b) => b.map((x) => x.atrial)))).toBeGreaterThan(0.95);
  });

  it('en FA, después de la telesístole la fracción expulsada solo baja con el llenado rápido y se queda (sin el llenado de la onda A); en sinusal vuelve a 0', () => {
    for (const b of beats({ rhythm: 'atrial-fibrillation' })) {
      const peak = b.reduce((m, x, i) => (x.ejection > b[m].ejection ? i : m), 0);
      for (let i = peak + 1; i < b.length; i++) expect(b[i].ejection).toBeLessThanOrEqual(b[i - 1].ejection + 1e-9);
      // el VI llega a la R siguiente con el volumen de antes de la onda A (≈ 0,26 de la fracción expulsada), no en la telediástole
      expect(b[b.length - 1].ejection).toBeGreaterThan(0.2);
    }
    for (const b of beats({ rhythm: 'sinus', rrVariability: 0 })) {
      expect(b[b.length - 1].ejection).toBeLessThan(0.05);
      // la onda A llena más de lo que baja el resto de la diástole tardía
      expect(lateFill(b)).toBeGreaterThan(0.95);
    }
  });

  it('en FA la fracción expulsada es continua (a cada paso, también al empezar el latido y al acabar la eyección)', () => {
    const jumps = beats({ rhythm: 'atrial-fibrillation' }).flatMap((b) => b.slice(1).map((x, i) => Math.abs(x.ejection - b[i].ejection)));
    // el mismo orden que el sinusal (< 0,05 por paso de 4 ms), no el salto de 0,26 de pasar de la onda A a la eyección
    expect(Math.max(...jumps)).toBeLessThan(0.05);
  });

  it('un paciente sinusal sin función auricular tampoco tiene onda A', () => {
    for (const b of beats({ atrialFunction: 0, rrVariability: 0 })) for (const x of b) expect(x.atrial).toBeCloseTo(0, 9);
  });
});
