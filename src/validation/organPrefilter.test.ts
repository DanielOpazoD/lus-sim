import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LIVER_EARLY_OUT_MM, ORGAN_SDF_LIPSCHITZ, liverLobesSd, liverSdf } from '../anatomy/organs/liver';
import { wallColumnTexel } from '../anatomy/organs/chestWall';
import { zoaGap } from '../anatomy/organs/lungBorder';
import { perirenalDistance, renalImpression } from '../anatomy/organs/kidney';
import { SPLEEN_NEAR_MARGIN_MM, SPLEEN_X_MIN_MM, spleenSdf } from '../anatomy/organs/spleen';
import { STOMACH_NEAR_MARGIN_MM, STOMACH_X_MIN_MM, STOMACH_Y_MIN_MM, stomachSdf } from '../anatomy/organs/stomach';
import { wallArc } from '../anatomy/organs/wall';
import { sdDiaphragm, torsoDepth } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { BOWEL_BD_CAP_MM, DIAPHRAGM_THICKNESS_MM, Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { defaultPatient, type ChestHabitus } from '../physiology/patientState';

/**
 * El prefiltro de los órganos (lus-sim, decisión 37): lejos de los lóbulos del hígado (`LIVER_EARLY_OUT_MM`) y fuera de donde
 * pueden estar el bazo (`spleenCandidate`) y el estómago (decisión 43, `stomachCandidate`), la clasificación no evalúa la columna
 * de la pared, el bazo ni el estómago; la GPU se ahorra esa
 * cuenta en la mayor parte del abdomen. No puede cambiar ninguna clasificación: aquí se comprueba, en el tronco entero de las
 * seis variantes del tórax, que la clasificación con el prefiltro es la de la cuenta completa (el hígado y el bazo evaluados en
 * todo punto bajo el diafragma, como antes del prefiltro). La e2e de equivalencia comprueba que la GPU hace lo mismo que TS.
 */
const HABITS: ChestHabitus[] = (['average', 'thin', 'obese'] as const).flatMap((build) =>
  (['male', 'female'] as const).map((sex) => ({ build, sex })),
);
const SCENES = HABITS.map((chest) => {
  const p = defaultPatient();
  return new AnatomyScene({ ...p, habitus: { ...p.habitus, chest } });
});

/** La cuenta completa de `classifyOrgans` sin el prefiltro (tras los riñones): [órgano o null, dOut] (la de antes del prefiltro). */
function fullOrgans(s: AnatomyScene, m: Vec3): ['liver' | 'spleen' | 'stomach' | null, number] {
  const u = wallArc(m, s.torso);
  const inside = s.insideWallMm(m);
  const gap = zoaGap(s.lungBorder, m, inside, u, 0);
  const wallSide = Math.min(inside, gap);
  const dDia = sdDiaphragm(m, s.diaphragm, s.torso) - DIAPHRAGM_THICKNESS_MM;
  const perirenal = perirenalDistance(m, s.kidneys);
  const renal = renalImpression(m, s.kidneys, perirenal);
  const dLiver = liverSdf(m, u, inside, wallColumnTexel(s.chestWall, u)[2], s.liver, renal);
  if (dLiver < 0) return ['liver', 0];
  const skin = -torsoDepth(m, s.torso);
  const dSpleen = spleenSdf(m, u, Math.min(dDia, wallSide), skin, inside, s.spleen, renal);
  if (dSpleen < 0) return ['spleen', 0];
  const dStomach = stomachSdf(m, u, Math.min(dDia, wallSide), skin, s.stomach);
  if (dStomach < 0) return ['stomach', 0];
  return [null, Math.min(dLiver, dSpleen, dStomach, perirenal) * ORGAN_SDF_LIPSCHITZ];
}

/** La distancia del hígado de la cuenta completa, por el factor de la distancia a la frontera. */
function liverOut(s: AnatomyScene, m: Vec3): number {
  const u = wallArc(m, s.torso);
  const renal = renalImpression(m, s.kidneys, perirenalDistance(m, s.kidneys));
  return liverSdf(m, u, s.insideWallMm(m), wallColumnTexel(s.chestWall, u)[2], s.liver, renal) * ORGAN_SDF_LIPSCHITZ;
}

const STOMACH_TISSUES = [Tissue.Bowel, Tissue.Fluid, Tissue.BowelGas];

const pointArb = fc
  .record({
    v: fc.integer({ min: 0, max: SCENES.length - 1 }),
    phi: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    r: fc.double({ min: 0, max: 0.999, noNaN: true }),
    z: fc.double({ min: -200, max: 40, noNaN: true }),
  })
  .map(({ v, phi, r, z }) => {
    const t = SCENES[v].torso;
    return { v, m: [r * t.a * Math.cos(phi), r * t.b * Math.sin(phi), z] as Vec3 };
  });

describe('El prefiltro de los órganos no cambia la clasificación (decisiones 37 y 43)', () => {
  // Donde salta el bazo, su distancia real pasa del doble del tope del «resto» (2 × 5 mm por `ORGAN_SDF_LIPSCHITZ`): todo punto
  // del bazo está a x > 25 (decisión 43: el bazo normal, a x ≥ 86 en el paciente por omisión) y a menos de `maxSkinDepth` bajo
  // la piel, y el prefiltro salta x ≤ 15 (10 mm en x) y lo que está a más de `maxSkinDepth` + 25 (25 mm por la normal: la profundidad bajo la piel cambia ≤ 1 mm por mm). La distancia aproximada del
  // bazo (`spleenSdf`) no es la real lejos de él: en el centro del tronco su cota de profundidad daba ≈ 9 mm (y el «resto», una
  // distancia a la frontera de 4,45 en lugar de 5); con el prefiltro, el tope
  it('el bazo de cada escena queda dentro de lo que el prefiltro evalúa, con 10 mm de holgura', () => {
    // las holguras del prefiltro pasan de la distancia que importa (el tope del «resto» por el factor: 10 mm)
    expect(SPLEEN_NEAR_MARGIN_MM).toBeGreaterThanOrEqual(BOWEL_BD_CAP_MM / ORGAN_SDF_LIPSCHITZ);
    for (const s of SCENES)
      for (let x = 0; x <= 160; x += 4)
        for (let y = -113; y <= 113; y += 4)
          for (let z = -170; z <= 20; z += 4) {
            const m: Vec3 = [x, y, z];
            if (s.classify(m, BASELINE_INSTANT).tissue !== Tissue.Spleen) continue;
            expect(m[0]).toBeGreaterThan(SPLEEN_X_MIN_MM + 10);
            expect(-torsoDepth(m, s.torso)).toBeLessThan(s.spleen.maxSkinDepth);
          }
  });

  it('el estómago de cada escena queda dentro de lo que el prefiltro evalúa, con 10 mm de holgura (decisión 43)', () => {
    expect(STOMACH_NEAR_MARGIN_MM).toBeGreaterThanOrEqual(BOWEL_BD_CAP_MM / ORGAN_SDF_LIPSCHITZ);
    let n = 0;
    for (const s of SCENES)
      for (let x = 0; x <= 160; x += 4)
        for (let y = -113; y <= 113; y += 4)
          for (let z = -170; z <= 20; z += 4) {
            const m: Vec3 = [x, y, z];
            if (!STOMACH_TISSUES.includes(s.classify(m, BASELINE_INSTANT).tissue) || !s.inStomach(m, BASELINE_INSTANT)) continue;
            n++;
            expect(m[0]).toBeGreaterThan(STOMACH_X_MIN_MM + 10);
            expect(m[1]).toBeGreaterThan(STOMACH_Y_MIN_MM + 10);
            expect(-torsoDepth(m, s.torso)).toBeLessThan(s.stomach.maxSkinDepth);
          }
    expect(n).toBeGreaterThan(100);
  });

  it('lejos de los lóbulos, la distancia del hígado es la de los lóbulos', () => {
    fc.assert(
      fc.property(pointArb, ({ v, m }) => {
        const s = SCENES[v];
        const lobes = liverLobesSd(m, s.liver);
        fc.pre(lobes > LIVER_EARLY_OUT_MM);
        const u = wallArc(m, s.torso);
        const renal = renalImpression(m, s.kidneys, perirenalDistance(m, s.kidneys));
        expect(liverSdf(m, u, s.insideWallMm(m), wallColumnTexel(s.chestWall, u)[2], s.liver, renal)).toBe(lobes);
      }),
      { seed: 20261003, numRuns: 5_000 },
    );
  });

  it('la clasificación bajo el diafragma, con el prefiltro, es la de la cuenta completa; la distancia del «resto» solo sube a su tope', () => {
    let checked = 0;
    fc.assert(
      fc.property(pointArb, ({ v, m }) => {
        const s = SCENES[v];
        const c = s.classify(m, BASELINE_INSTANT);
        const rest = [Tissue.Bowel, Tissue.Psoas, Tissue.QuadratusLumborum, Tissue.RetroperitonealFat];
        fc.pre([Tissue.Liver, Tissue.LiverCapsule, Tissue.Spleen, Tissue.Fluid, Tissue.BowelGas, ...rest].includes(c.tissue));
        checked++;
        const [organ, dOut] = fullOrgans(s, m);
        if (organ === 'liver') expect([Tissue.Liver, Tissue.LiverCapsule]).toContain(c.tissue);
        else if (organ === 'spleen') expect(c.tissue).toBe(Tissue.Spleen);
        else if (organ === 'stomach') expect(STOMACH_TISSUES).toContain(c.tissue);
        else {
          expect(rest).toContain(c.tissue);
          // la distancia del «resto» no pasa de su tope, ni de la del hígado de la cuenta completa
          expect(c.boundaryDistance).toBeLessThanOrEqual(BOWEL_BD_CAP_MM);
          expect(c.boundaryDistance).toBeLessThanOrEqual(Math.max(0, liverOut(s, m)) + 1e-6);
          void dOut;
        }
      }),
      { seed: 20261003, numRuns: 20_000 },
    );
    expect(checked).toBeGreaterThan(1000);
  });
});
