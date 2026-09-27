// @tier slow
import fc from 'fast-check';
import { chai, describe, expect, it } from 'vitest';
import { RESPIRATORY_INVERSE, RespiratoryDeformation, respiratoryInverse } from '../anatomy/deformation';
import { HEART, heartStillWeight } from '../anatomy/organs/heart';
import { probeHitPoint } from '../anatomy/organs/ribcage';
import { torsoDepth, torsoSkinPoint } from '../anatomy/primitives';
import { AnatomyQuery } from '../anatomy/query';
import { AnatomyScene } from '../anatomy/scene';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import { smoothstep, type Vec3 } from '../core/vec3';
import { PhysiologyEngine, type PhysiologySample } from '../physiology/engine';
import { defaultPatient, type ChestHabitus, type PatientState, type RespiratoryPattern } from '../physiology/patientState';
import { DIAPHRAGM_EXCURSION, type RespiratorySample } from '../physiology/respiratory';

/**
 * El campo respiratorio (lus-sim, decisión 22): un difeomorfismo por construcción y su inversa exacta a una tolerancia
 * declarada, en las seis variantes del hábito y con la mayor excursión de la base (53 mm, la inspiración profunda en supino).
 *
 * El mapa directo es p = m − D·w(m)·ẑ: su jacobiana es I − D·ẑ⊗∇w y su determinante, 1 − D·∂w/∂z, afín en D y 1 en D = 0;
 * positivo con la mayor excursión es positivo en toda fase de todo patrón (D va de 0 a su excursión). Se exige, además, lo
 * que de verdad es la invertibilidad de un campo vertical: que cada vertical se aplique en sí misma de forma estrictamente
 * creciente. La inversa, una bisección en z con `RESPIRATORY_INVERSE.steps` pasos, queda a ≤ D/2^(pasos + 1) de la raíz.
 *
 * Cada propiedad lleva su mutación, que debe fallar: el campo de VExUS (dirección (0, 0,15, −1), sin la ley de altura) y el
 * campo vertical sin la ley de altura se pliegan; los dos pasos de punto fijo de VExUS yerran más que la tolerancia.
 */
const SEED = 20260927;
const D_MAX = DIAPHRAGM_EXCURSION.params.deepMm.value;
/**
 * Cota inferior exigida del jacobiano con la mayor excursión. Medido (rejilla de 4 mm en todo el tronco, 27-09-2026): 0,278
 * en el avatar y la mujer, 0,142–0,144 en la delgada y 0,58–0,63 en la obesa, siempre bajo el reborde costal del flanco,
 * donde la pared del tórax pasa a la del abdomen (de 13 a 28 mm: el tejido que baja junto a ella se comprime).
 */
const JACOBIAN_FLOOR = 0.1;

const HABITS: ChestHabitus[] = (['average', 'thin', 'obese'] as const).flatMap((build) =>
  (['male', 'female'] as const).map((sex) => ({ build, sex })),
);
function patientWith(chest: ChestHabitus): PatientState {
  const p = defaultPatient();
  return { ...p, habitus: { ...p.habitus, chest } };
}
const SCENES = HABITS.map((h) => new AnatomyScene(patientWith(h)));
const tag = (v: number) => `${HABITS[v].build}/${HABITS[v].sex}`;
const respOf = (D: number) => ({ diaphragmCaudalMm: D, diaphragmVelocityMmS: 0 }) as RespiratorySample;

/** Un punto del tronco: dentro de la piel (fracción r del radio de la elipse), en todo su alto. */
const pointArb = fc
  .record({
    v: fc.integer({ min: 0, max: SCENES.length - 1 }),
    phi: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    r: fc.double({ min: 0, max: 0.999, noNaN: true }),
    z: fc.double({ min: -295, max: 295, noNaN: true }),
  })
  .map(({ v, phi, r, z }) => {
    const t = SCENES[v].torso;
    return { v, m: [r * t.a * Math.cos(phi), r * t.b * Math.sin(phi), z] as Vec3 };
  });

const H = 0.05;
/** Determinante de la jacobiana del mapa directo con el peso `w` y la dirección `dir` (unitaria): 1 + D·∂w/∂dir. */
function jacobian(w: (m: Vec3) => number, m: Vec3, D: number, dir: Vec3 = [0, 0, -1]): number {
  const at = (s: number): Vec3 => [m[0] + s * dir[0], m[1] + s * dir[1], m[2] + s * dir[2]];
  return 1 + (D * (w(at(H)) - w(at(-H)))) / (2 * H);
}

/** El peso de VExUS en el tórax de lus-sim: la pared, la columna y el corazón (decisión 18), sin la ley de altura. */
function legacyWeight(scene: AnatomyScene, m: Vec3): number {
  const spine = smoothstep(scene.spine.r + 5, scene.spine.r + 35, Math.hypot(m[0] - scene.spine.x0, m[1] - scene.spine.y0));
  return smoothstep(0, 25, scene.insideWallMm(m)) * spine * heartStillWeight(scene.heart, m);
}
const LEGACY_DIR: Vec3 = (() => {
  const l = Math.hypot(0.15, 1);
  return [0, 0.15 / l, -1 / l];
})();

/**
 * Una mutación que debe morder: la propiedad falla por una aserción (no por un error del código de la prueba), con un
 * contraejemplo de fast-check.
 */
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

/** La inversa de VExUS: dos pasos de punto fijo, m = q − d(m), con el campo de lus-sim. */
function fixedPointInverse(scene: AnatomyScene, q: Vec3, D: number): Vec3 {
  let m = q;
  for (let i = 0; i < 2; i++) m = [q[0], q[1], q[2] + D * scene.respiratoryWeight(m)];
  return m;
}

describe('Campo respiratorio: difeomorfismo por construcción (decisión 22)', () => {
  it('jacobiano > 0 en todo el tronco con la mayor excursión, en las seis variantes del hábito', () => {
    fc.assert(
      fc.property(pointArb, ({ v, m }) => {
        const s = SCENES[v];
        expect(
          jacobian((p) => s.respiratoryWeight(p), m, D_MAX),
          `${tag(v)} ${m.join(',')}`,
        ).toBeGreaterThanOrEqual(JACOBIAN_FLOOR);
      }),
      { seed: SEED, numRuns: 20_000 },
    );
  });

  it('cada vertical se aplica en sí misma de forma estrictamente creciente (rejilla de 6 mm, paso de 0,5 mm en z)', () => {
    // el mínimo de Δ(z − D·w)/Δz entre muestras seguidas: el jacobiano medio en cada paso, la cota que se declara
    for (let v = 0; v < SCENES.length; v++) {
      const s = SCENES[v];
      let min = Infinity;
      for (let x = -157; x <= 157; x += 6)
        for (let y = -103; y <= 103; y += 6) {
          if (torsoDepth([x, y, 0], s.torso) > 0) continue;
          const c = s.respiratoryColumn(x, y);
          let prev = -300 - D_MAX * s.respiratoryWeightAt(c, -300);
          for (let z = -299.5; z <= 300; z += 0.5) {
            const cur = z - D_MAX * s.respiratoryWeightAt(c, z);
            min = Math.min(min, (cur - prev) / 0.5);
            prev = cur;
          }
        }
      expect(min, tag(v)).toBeGreaterThanOrEqual(JACOBIAN_FLOOR);
    }
  });

  it('mutación: el campo de VExUS (caudal y algo anterior, sin la ley de altura) se pliega con 53 mm', () => {
    expectPropertyFails(() =>
      fc.assert(
        fc.property(pointArb, ({ v, m }) => {
          const s = SCENES[v];
          expect(jacobian((p) => legacyWeight(s, p), m, D_MAX, LEGACY_DIR)).toBeGreaterThan(0);
        }),
        { seed: SEED, numRuns: 20_000 },
      ),
    );
  });

  it('mutación: el campo vertical sin la ley de altura se pliega sobre el corazón con 53 mm', () => {
    expectPropertyFails(() =>
      fc.assert(
        fc.property(pointArb, ({ v, m }) => {
          const s = SCENES[v];
          expect(jacobian((p) => legacyWeight(s, p), m, D_MAX)).toBeGreaterThan(0);
        }),
        { seed: SEED, numRuns: 20_000 },
      ),
    );
  });
});

describe('Campo respiratorio: la inversa exacta a la tolerancia declarada (decisión 22)', () => {
  const tol = RESPIRATORY_INVERSE.toleranceMm;

  it('la bisección alcanza la tolerancia con la mayor excursión de la base (y con la de su rango)', () => {
    expect(D_MAX / 2 ** (RESPIRATORY_INVERSE.steps + 1)).toBeLessThanOrEqual(tol);
    expect(DIAPHRAGM_EXCURSION.params.deepMm.range![1] / 2 ** (RESPIRATORY_INVERSE.steps + 1)).toBeLessThanOrEqual(tol);
  });

  it('material → mundo → material vuelve al punto a ≤ la tolerancia, en todo el tronco y para toda excursión', () => {
    fc.assert(
      fc.property(pointArb, fc.double({ min: 0, max: D_MAX, noNaN: true }), ({ v, m }, D) => {
        const def = new RespiratoryDeformation(SCENES[v]);
        const back = def.toMaterial(def.toWorld(m, respOf(D)), respOf(D));
        const err = Math.hypot(back[0] - m[0], back[1] - m[1], back[2] - m[2]);
        expect(err, `${tag(v)} D ${D} ${m.join(',')}`).toBeLessThanOrEqual(tol);
        // y con la cota a priori de la bisección
        expect(err).toBeLessThanOrEqual(D / 2 ** (RESPIRATORY_INVERSE.steps + 1) + 1e-9);
      }),
      { seed: SEED, numRuns: 20_000 },
    );
  });

  it('mundo → material da el punto cuyo mundo es el de partida (el residuo de la ecuación de la vertical)', () => {
    fc.assert(
      fc.property(pointArb, ({ v, m: q }) => {
        const s = SCENES[v];
        const m = respiratoryInverse(s, q, D_MAX);
        expect(m[0]).toBe(q[0]);
        expect(m[1]).toBe(q[1]);
        // |z − D·w(z) − q_z| ≤ (1 + D·máx ∂w/∂z)·error en z; con la cota de la jacobiana más alta del campo (2,6, bajo el
        // corazón), ≤ 3,6·0,026 mm
        expect(Math.abs(m[2] - D_MAX * s.respiratoryWeight(m) - q[2])).toBeLessThanOrEqual(3.6 * tol);
      }),
      { seed: SEED, numRuns: 5_000 },
    );
  });

  it('mutación: los dos pasos de punto fijo de VExUS yerran más que la tolerancia', () => {
    expectPropertyFails(() =>
      fc.assert(
        fc.property(pointArb, ({ v, m }) => {
          const s = SCENES[v];
          const def = new RespiratoryDeformation(s);
          const back = fixedPointInverse(s, def.toWorld(m, respOf(D_MAX)), D_MAX);
          expect(Math.hypot(back[0] - m[0], back[1] - m[1], back[2] - m[2])).toBeLessThanOrEqual(tol);
        }),
        { seed: SEED, numRuns: 20_000 },
      ),
    );
  });
});

describe('Excursión por patrón, por el camino real (motor → consulta → escena; decisión 22)', () => {
  const scene = SCENES[0];
  const q = new AnatomyQuery(scene);
  /** La muestra de fin de inspiración del patrón (la de más volumen en un ciclo; las apneas, la primera). */
  function peak(pattern: RespiratoryPattern): PhysiologySample {
    const engine = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: pattern });
    let best = engine.sample;
    for (let i = 0; i < Math.round(60 / engine.patient.respiratoryRateMin / engine.clock.dt); i++) {
      const s = engine.step();
      if (s.resp.volume > best.resp.volume) best = s;
    }
    return best;
  }
  /** Primer z (bajando, paso `step`) en que la vertical (x, y) del mundo deja el pulmón. */
  function lungFloorZ(x: number, y: number, s: PhysiologySample, top: number, step = 0.1): number {
    for (let z = top; z > -250; z -= step) if (q.classifyWorld([x, y, z], s).tissue !== Tissue.Lung) return z;
    return NaN;
  }
  const rest = peak('apnea-expiratory');

  it('la cúpula derecha junto a la axilar (lejos del corazón, de la pared y de la columna) baja la excursión de cada patrón', () => {
    // (−110, 0): la cúpula derecha con el peso entero (el corazón, que no respira, frena la cúpula a menos de 75 mm de su
    // elipsoide: su vértice, en (−61, −6), baja la mitad; `heart-simplified`)
    const [x, y] = [-110, 0];
    const z0 = lungFloorZ(x, y, rest, 40);
    expect(scene.respiratoryWeight([x, y, z0])).toBe(1);
    const expected: Record<RespiratoryPattern, number> = {
      'apnea-expiratory': 0,
      quiet: DIAPHRAGM_EXCURSION.params.quietMm.value,
      deep: DIAPHRAGM_EXCURSION.params.deepMm.value,
      'apnea-inspiratory': DIAPHRAGM_EXCURSION.params.deepMm.value,
    };
    for (const [pattern, E] of Object.entries(expected) as [RespiratoryPattern, number][]) {
      const s = peak(pattern);
      expect(s.resp.diaphragmCaudalMm, pattern).toBeCloseTo(E, 2);
      const descent = z0 - lungFloorZ(x, y, s, 40);
      expect(descent, pattern).toBeGreaterThanOrEqual(E - 0.2);
      expect(descent, pattern).toBeLessThanOrEqual(E + 0.2);
    }
  });

  it('A-T13 en el mundo: la cortina de la LAM baja 0,9–2,8 cm en la respiración tranquila y 3,1–7,5 en la profunda', () => {
    // el pulmón 1,5 mm por dentro de la pleura (la lámina de la cortina) en la LAM de los dos lados, bajando por la vertical
    // de la cara interna de la pared, que no respira: en el mundo baja la excursión y lo que el campo baja la lámina (peso
    // smoothstep(0, 25, 1,5) ≈ 0,01: 0,2 mm en la tranquila y 0,55 en la profunda)
    for (const side of [-1, 1] as const) {
      const phi = thoraxLinePhi('midaxillary', scene.torso, side);
      const t = scene.torso;
      const edge = (s: PhysiologySample) => {
        let last = NaN;
        for (let z = 0; z > -150; z -= 0.1) {
          let p = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + 1.5, t, z);
          p = probeHitPoint(phi, scene.wallThicknessAt(p) + 1.5, t, z);
          if (q.classifyWorld(p, s).tissue !== Tissue.Lung) break;
          last = z;
        }
        return last;
      };
      const frc = edge(rest);
      const quiet = frc - edge(peak('quiet'));
      const deep = frc - edge(peak('deep'));
      expect(quiet, `tranquila ${side}`).toBeGreaterThanOrEqual(9);
      expect(quiet, `tranquila ${side}`).toBeLessThanOrEqual(28);
      expect(deep, `profunda ${side}`).toBeGreaterThanOrEqual(31);
      expect(deep, `profunda ${side}`).toBeLessThanOrEqual(75);
    }
  });

  it('la ventana cardiaca no se mueve con la inspiración profunda: miocardio bajo la pleura y sin pleura registrada', () => {
    const t = scene.torso;
    const w = scene.heart.window;
    const deep = peak('deep');
    // el centro de la ventana y dos puntos a media distancia de su borde, arriba y abajo (el corazón y el tapón no respiran)
    const phi = Math.acos(HEART.params.windowOffsetMm.value / t.a);
    for (const dz of [0, 0.5 * w.r, -0.5 * w.r]) {
      const z = w.z + dz;
      const pleura = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)), t, z);
      const under = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + 1.5, t, z);
      for (const s of [rest, deep]) {
        expect(q.classifyWorld(under, s).tissue, `dz ${dz}`).toBe(Tissue.Myocardium);
        const m = q.deformation.toMaterial(pleura, s.resp);
        expect(m).toEqual(pleura);
        expect(scene.lungEdgeMm(m, q.instantFor(s))!).toBeLessThan(-100);
      }
    }
  });
});
