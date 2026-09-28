// @tier slow
import fc from 'fast-check';
import { chai, describe, expect, it } from 'vitest';
import { RESPIRATORY_INVERSE, RespiratoryDeformation, respiratoryInverse } from '../anatomy/deformation';
import { RESPIRATORY_WALL, respiratoryWallOf, wallTotalOf } from '../anatomy/organs/chestWall';
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
 * declarada, en las seis variantes del tórax con tres grasas del abdomen (5, 14 y 35 mm), con la excursión profunda de la base
 * (53 mm, la inspiración profunda en supino) y con el máximo de su rango (75).
 *
 * El mapa directo es p = m − D·w(m)·ẑ: su jacobiana es I − D·ẑ⊗∇w y su determinante, 1 − D·∂w/∂z, afín en D y 1 en D = 0;
 * positivo con una excursión es positivo en toda fase de todo patrón que no la pase. Se exige, además, lo que de verdad es la
 * invertibilidad de un campo vertical: que cada vertical se aplique en sí misma de forma estrictamente creciente. La inversa,
 * una bisección en z con `RESPIRATORY_INVERSE.steps` pasos, deja el punto material a ≤ D/2^(pasos + 1) de la raíz.
 *
 * Cada propiedad lleva su mutación, que debe fallar: el campo de VExUS (dirección (0, 0,15, −1), sin la ley de altura), el
 * campo vertical sin la ley de altura y el peso con la pared de verdad (sin alargar su paso al abdomen) se pliegan; los dos
 * pasos de punto fijo de VExUS yerran más que la tolerancia.
 */
const SEED = 20260927;
const D_MAX = DIAPHRAGM_EXCURSION.params.deepMm.value;
const D_RANGE = DIAPHRAGM_EXCURSION.params.deepMm.range![1];
/**
 * Cotas inferiores exigidas del jacobiano con 53 y con 75 mm. Medido (rejilla de 4 mm en todo el tronco, paso de 0,25 mm en z,
 * las 18 escenas, 27-09-2026): 0,574–0,631 con 53 y 0,397–0,478 con 75, siempre sobre el corazón (el pulmón de encima, que la
 * ley de altura baja poco); el término de la pared, ≤ 1,5·0,1/25·D por construcción (`anatomy.respiratoryWall.slopeMax`).
 */
const JACOBIAN_FLOOR = 0.5;
const JACOBIAN_FLOOR_RANGE = 0.35;

const HABITS: ChestHabitus[] = (['average', 'thin', 'obese'] as const).flatMap((build) =>
  (['male', 'female'] as const).map((sex) => ({ build, sex })),
);
/** Grasa subcutánea del abdomen (mm): la del paciente por omisión y dos extremos (la pared del abdomen, de 19 a 49 mm). */
const ABDOMEN_FAT = [14, 5, 35];
function patientWith(chest: ChestHabitus, fat = 14): PatientState {
  const p = defaultPatient();
  return { ...p, habitus: { ...p.habitus, subcutaneousFatMm: fat, chest } };
}
const CASES = ABDOMEN_FAT.flatMap((fat) => HABITS.map((chest) => ({ chest, fat })));
/** Las 18 escenas; las 6 primeras, las del abdomen por omisión. */
const SCENES = CASES.map((c) => new AnatomyScene(patientWith(c.chest, c.fat)));
const tag = (v: number) => `${CASES[v].chest.build}/${CASES[v].chest.sex}, grasa del abdomen ${CASES[v].fat}`;
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

/** El peso de VExUS en el tórax de lus-sim: la pared de verdad, la columna y el corazón (decisión 18), sin la ley de altura. */
function legacyWeight(scene: AnatomyScene, m: Vec3): number {
  const spine = smoothstep(scene.spine.r + 5, scene.spine.r + 35, Math.hypot(m[0] - scene.spine.x0, m[1] - scene.spine.y0));
  return smoothstep(0, 25, scene.insideWallMm(m)) * spine * heartStillWeight(scene.heart, m);
}
/** El de lus-sim con la ley de altura, pero con la pared de verdad (`insideWallMm`) en lugar de la que mira el campo. */
function realWallWeight(scene: AnatomyScene, m: Vec3): number {
  const h = scene.respiratoryHeight;
  return legacyWeight(scene, m) * Math.min(1, Math.max(0, (h.topZ - m[2]) / (h.topZ - h.baseZ)));
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

/**
 * Meta que el modelo aún no cumple (como en `anatomyTargets.test.ts`): su cuerpo debe fallar por una aserción; cuando se
 * cumpla, esta prueba falla y pasa a `it`.
 */
function notYetMet(title: string, body: () => void): void {
  it(`${title} [aún no se cumple]`, () => {
    expect(body).toThrow(chai.AssertionError);
  });
}

/** La inversa de VExUS: dos pasos de punto fijo, m = q − d(m), con el campo de lus-sim. */
function fixedPointInverse(scene: AnatomyScene, q: Vec3, D: number): Vec3 {
  let m = q;
  for (let i = 0; i < 2; i++) m = [q[0], q[1], q[2] + D * scene.respiratoryWeight(m)];
  return m;
}

describe('Campo respiratorio: difeomorfismo por construcción (decisión 22)', () => {
  it('jacobiano > 0 en todo el tronco con la excursión profunda y con el máximo de su rango, en las 18 escenas', () => {
    fc.assert(
      fc.property(pointArb, ({ v, m }) => {
        const s = SCENES[v];
        const w = (p: Vec3) => s.respiratoryWeight(p);
        expect(jacobian(w, m, D_MAX), `${tag(v)} ${m.join(',')}`).toBeGreaterThanOrEqual(JACOBIAN_FLOOR);
        expect(jacobian(w, m, D_RANGE), `${tag(v)} ${m.join(',')}`).toBeGreaterThanOrEqual(JACOBIAN_FLOOR_RANGE);
      }),
      { seed: SEED, numRuns: 20_000 },
    );
  });

  it('cada vertical se aplica en sí misma de forma estrictamente creciente con 75 mm (rejilla de 6–8 mm, paso de 0,5 en z)', () => {
    // el mínimo de Δ(z − D·w)/Δz entre muestras seguidas: el jacobiano medio en cada paso, la cota que se declara; las seis
    // variantes del tórax con el abdomen por omisión (6 mm) y el avatar con los dos extremos de grasa del abdomen (8 mm)
    const avatar = (fat: number) => CASES.findIndex((c) => c.fat === fat && c.chest.build === 'average' && c.chest.sex === 'male');
    for (const [v, step] of [...[0, 1, 2, 3, 4, 5].map((v) => [v, 6]), [avatar(5), 8], [avatar(35), 8]]) {
      const s = SCENES[v];
      let min = Infinity;
      for (let x = -157; x <= 157; x += step)
        for (let y = -103; y <= 103; y += step) {
          if (torsoDepth([x, y, 0], s.torso) > 0) continue;
          const c = s.respiratoryColumn(x, y);
          let prev = -300 - D_RANGE * s.respiratoryWeightAt(c, -300);
          for (let z = -299.5; z <= 300; z += 0.5) {
            const cur = z - D_RANGE * s.respiratoryWeightAt(c, z);
            min = Math.min(min, (cur - prev) / 0.5);
            prev = cur;
          }
        }
      expect(min, tag(v)).toBeGreaterThanOrEqual(JACOBIAN_FLOOR_RANGE);
    }
  });

  it('la pared que mira el campo nunca es más fina que la de verdad, ni más gruesa que la cota de la GLSL (`maxTotal`)', () => {
    // más fina, el peso sería > 0 dentro de la pared (la pared se movería); más gruesa que maxTotal, la salida barata de la
    // GLSL (`RespCol.far`) daría 1 donde no lo es
    type Location = { scene: string; point: Vec3; actual: number; bound: number };
    type Check = {
      name: string;
      lowerBound: boolean;
      count: number;
      maxExcess: number;
      worst: Location | null;
      nonFinite: (Omit<Location, 'actual' | 'bound'> & { actual: string; bound: string }) | null;
    };
    const check = (name: string, lowerBound = false): Check => ({
      name,
      lowerBound,
      count: 0,
      maxExcess: -Infinity,
      worst: null,
      nonFinite: null,
    });
    const minimum = check('espesor mínimo: pared de verdad − 1e-9', true);
    const maximum = check('espesor máximo: maxTotal + 1e-9');
    const slope = check('pendiente máxima: slopeMax + 0.012');
    // La misma desigualdad en TODOS los puntos; solo se agrega su exceso para evitar millones de matchers.
    // Math.max propaga NaN y se registra además el primer dato no finito con su ubicación.
    const record = (c: Check, actual: number, bound: number, v: number, x: number, y: number, z: number): void => {
      c.count++;
      if ((!Number.isFinite(actual) || !Number.isFinite(bound)) && c.nonFinite === null)
        c.nonFinite = { scene: tag(v), point: [x, y, z], actual: String(actual), bound: String(bound) };
      const excess = c.lowerBound ? bound - actual : actual - bound;
      if (excess > c.maxExcess) c.worst = { scene: tag(v), point: [x, y, z], actual, bound };
      c.maxExcess = Math.max(c.maxExcess, excess);
    };
    for (const [v, s] of SCENES.entries())
      for (let x = -157; x <= 157; x += 9)
        for (let y = -103; y <= 103; y += 9) {
          if (torsoDepth([x, y, 0], s.torso) > 0) continue;
          const c = s.respiratoryColumn(x, y);
          for (let z = -300; z <= 300; z += 3) {
            const w = respiratoryWallOf(s.chestWall, c.wall, c.wallBlendMm, z);
            record(minimum, w, wallTotalOf(s.chestWall, c.wall, z) - 1e-9, v, x, y, z);
            record(maximum, w, s.chestWall.maxTotal + 1e-9, v, x, y, z);
          }
          // y su paso al abdomen no engruesa hacia abajo más deprisa que la pendiente declarada (la del tórax alto → bajo,
          // ≤ 0,01 mm/mm, aparte)
          for (let z = -300; z < 300; z += 0.5) {
            const thicker =
              respiratoryWallOf(s.chestWall, c.wall, c.wallBlendMm, z) - respiratoryWallOf(s.chestWall, c.wall, c.wallBlendMm, z + 0.5);
            record(slope, thicker / 0.5, RESPIRATORY_WALL.params.slopeMax.value + 0.012, v, x, y, z);
          }
        }
    for (const c of [minimum, maximum, slope]) {
      const diagnostic = JSON.stringify(c);
      expect(c.count, diagnostic).toBeGreaterThan(0);
      expect(c.nonFinite, diagnostic).toBeNull();
      expect(c.maxExcess, diagnostic).toBeLessThanOrEqual(0);
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

  it('mutación: con la pared de verdad en el peso se pliega bajo el reborde costal (la delgada con 75 mm; con 53 y 35 mm de grasa)', () => {
    // medido con la pared de verdad: se pliega con 62 mm en la delgada y 73 en el avatar, y con 53 mm y 25 de grasa. El pliegue
    // es una banda fina junto a la pared (fast-check no la encuentra al azar): se recorren las verticales a menos de 60 mm de la
    // piel, bajo z = 0, cada 3 mm y con paso de 0,25 en z
    const thin = CASES.findIndex((c) => c.fat === 14 && c.chest.build === 'thin' && c.chest.sex === 'male');
    const fat = CASES.findIndex((c) => c.fat === 35 && c.chest.build === 'average' && c.chest.sex === 'male');
    for (const [v, D] of [
      [thin, D_RANGE],
      [fat, D_MAX],
    ]) {
      const s = SCENES[v];
      let min = Infinity;
      for (let x = -157; x <= 157; x += 3)
        for (let y = -103; y <= 103; y += 3) {
          const d = torsoDepth([x, y, 0], s.torso);
          if (d > 0 || d < -60) continue;
          let prev = -250 - D * realWallWeight(s, [x, y, -250]);
          for (let z = -249.75; z <= 0; z += 0.25) {
            const cur = z - D * realWallWeight(s, [x, y, z]);
            min = Math.min(min, (cur - prev) / 0.25);
            prev = cur;
          }
        }
      expect(min, tag(v)).toBeLessThan(0);
    }
  });
});

describe('Campo respiratorio: la inversa exacta a la tolerancia declarada (decisión 22)', () => {
  const tol = RESPIRATORY_INVERSE.toleranceMm;

  it('la bisección alcanza la tolerancia con la mayor excursión de la base (y con la de su rango)', () => {
    expect(D_MAX / 2 ** (RESPIRATORY_INVERSE.steps + 1)).toBeLessThanOrEqual(tol);
    expect(DIAPHRAGM_EXCURSION.params.deepMm.range![1] / 2 ** (RESPIRATORY_INVERSE.steps + 1)).toBeLessThanOrEqual(tol);
  });

  it('material → mundo → material vuelve al punto a ≤ la tolerancia, en todo el tronco y para toda excursión hasta 75 mm', () => {
    fc.assert(
      fc.property(pointArb, fc.double({ min: 0, max: D_RANGE, noNaN: true }), ({ v, m }, D) => {
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
        // la tolerancia es la del punto material; en el mundo el residuo, |z − D·w(z) − q_z|, es el error en z por la
        // jacobiana, que llega a 2,51 bajo el corazón (donde el tejido se aleja de él): ≤ 2,6·D/2¹¹, 0,068 mm con 53
        const bound = (2.6 * D_MAX) / 2 ** (RESPIRATORY_INVERSE.steps + 1);
        expect(Math.abs(m[2] - D_MAX * s.respiratoryWeight(m) - q[2])).toBeLessThanOrEqual(bound);
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
    // elipsoide: el vértice derecho, en (−61, −6), baja el 52 %; `respiratory-field-vertical`)
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
    // de la cara interna de la pared, que no respira: en el mundo baja la excursión (medido, 16,0 y 53,0 mm: la lámina queda
    // dentro de la pared que mira el campo, con peso 0)
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

  it('en la mujer la inspiración profunda baja 47 mm (Kantarci), y la cúpula junto a la axilar con ella', () => {
    const female = patientWith({ build: 'average', sex: 'female' });
    const s = new AnatomyScene(female);
    const qf = new AnatomyQuery(s);
    const E = DIAPHRAGM_EXCURSION.params.deepFemaleMm.value;
    const engine = new PhysiologyEngine({ ...female, respiratoryPattern: 'apnea-inspiratory' });
    const insp = engine.step();
    expect(insp.resp.diaphragmCaudalMm).toBe(E);
    const restF = new PhysiologyEngine({ ...female, respiratoryPattern: 'apnea-expiratory' }).step();
    const floor = (smp: PhysiologySample) => {
      for (let z = 40; z > -250; z -= 0.1) if (qf.classifyWorld([-110, 0, z], smp).tissue !== Tissue.Lung) return z;
      return NaN;
    };
    const descent = floor(restF) - floor(insp);
    expect(descent).toBeGreaterThanOrEqual(E - 0.2);
    expect(descent).toBeLessThanOrEqual(E + 0.2);
  });

  // La base da la misma excursión a los dos hemidiafragmas (Boussuges, tablas 1–2). Medido (27-09-2026): la cúpula izquierda
  // en (110, 0) baja 18,4 mm con los 53 de la inspiración profunda (35 %) y su vértice, 2 (4 %): la rampa del corazón quieto
  // (decisión 18) alcanza la cúpula de debajo. Hoy no se ve (el abdomen es negro y la cortina tapa la cúpula, A-T14), pero
  // una excursión asimétrica es el signo de una parálisis hemidiafragmática
  notYetMet('la cúpula izquierda junto a la axilar baja la excursión, como la derecha (hoy el 35 %: `respiratory-field-vertical`)', () => {
    const z0 = lungFloorZ(110, 0, rest, 40);
    const E = DIAPHRAGM_EXCURSION.params.deepMm.value;
    const descent = z0 - lungFloorZ(110, 0, peak('deep'), 40);
    expect(descent).toBeGreaterThanOrEqual(0.9 * E);
  });

  // Con más grasa en el abdomen, la pared que mira el campo alarga su paso al abdomen (en el avatar, 228 mm con 14 mm de grasa,
  // 393 con 25 y 543 con 35) y frena la cúpula lateral junto a la pared. Medido con 53 mm en (−120, 0): 53 mm con 5 y 14 de
  // grasa, 43,4 con 25 y 7,6 con 35; en (−130, 0), 40,6, 40,6, 10,2 y 0 (Boussuges: la excursión crece con el IMC). La grasa del
  // abdomen no se cambia desde la interfaz (`respiratory-field-vertical`)
  notYetMet('con 35 mm de grasa en el abdomen la cúpula lateral baja la excursión (hoy el 14 % en (−120, 0))', () => {
    const p = { ...patientWith({ build: 'average', sex: 'male' }, 35) };
    const s = new AnatomyScene(p);
    const qf = new AnatomyQuery(s);
    const E = DIAPHRAGM_EXCURSION.params.deepMm.value;
    const floor = (smp: PhysiologySample) => {
      for (let z = 40; z > -250; z -= 0.1) if (qf.classifyWorld([-120, 0, z], smp).tissue !== Tissue.Lung) return z;
      return NaN;
    };
    const restF = new PhysiologyEngine({ ...p, respiratoryPattern: 'apnea-expiratory' }).step();
    const insp = new PhysiologyEngine({ ...p, respiratoryPattern: 'apnea-inspiratory' }).step();
    // (un error que no es de aserción: si falla, la prueba cae en vez de darse por «aún no se cumple»)
    if (insp.resp.diaphragmCaudalMm !== E) throw new Error(`descenso ${insp.resp.diaphragmCaudalMm}, no ${E}`);
    expect(floor(restF) - floor(insp)).toBeGreaterThanOrEqual(0.9 * E);
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
