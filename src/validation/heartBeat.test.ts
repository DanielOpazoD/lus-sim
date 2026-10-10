import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../core/vec3';
import { AnatomyScene } from '../anatomy/scene';
import { defaultPatient } from '../physiology/patientState';
import { CARDIAC_BASE_SPHERE_CM, CARDIAC_BOX_CM, ET_TO_PALETTE, cardiacPoint, cardiacPoseAt } from '../anatomy/heart/cardiac';
import { classifyHeart } from '../anatomy/heart/heartModel';
import { Structure, makeSample } from '../anatomy/heart/tissue';
import { Tissue } from '../anatomy/tissues';
import { reduceChanges, voxelWords, windowDepths } from '../anatomy/heart/cardiacRuntime';
import {
  HEART_PALETTE,
  HEART_PHASES,
  HEART_TRANSITIONS,
  decodeHeartVoxel,
  heartFinePhase,
  heartSd,
  heartVoxel,
  packHeartVoxel,
} from '../anatomy/organs/heart';
import { cycleStateAt } from '../physiology/heart/cycleModel';
import { referenceBeat } from '../physiology/echoTwinBeat';
import { PhysiologyEngine } from '../physiology/engine';

/**
 * Fase 2 del corazón: el latido de EchoTwin en el reloj único. La línea de tiempo de cada vóxel reproduce el clasificador de
 * EchoTwin en cada fase (salvo lo que funde al dejar cuatro cambios), el corazón no sale de su sitio al latir (ni entra en la
 * pared, ni sale de lo que no respira), y el pulmón y el corazón leen la misma fase.
 */
const scene = new AnatomyScene(defaultPatient());
const heart = scene.heart;
const runtime = heart.cardiac!;
const cardiac = runtime.cardiac;
const v = runtime.vol;
const VOXEL_CM = v.voxelMm / 10;
/** El índice de la grasa en la paleta del corazón: lo que el corazón deja vacío al latir. */
const FAT_IDX = HEART_PALETTE.indexOf(Tissue.Fat) + 1;

// mulberry32
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** El índice del tejido que da el clasificador de EchoTwin en el centro del vóxel en la fase fina f. */
function analytic(i: number, j: number, k: number, f: number): number {
  const s = makeSample();
  const min = CARDIAC_BOX_CM.min;
  const hit = classifyHeart(
    cardiac.model,
    cardiacPoseAt(cardiac, f),
    min[0] + (i + 0.5) * VOXEL_CM,
    min[1] + (j + 0.5) * VOXEL_CM,
    min[2] + (k + 0.5) * VOXEL_CM,
    s,
  );
  return hit ? ET_TO_PALETTE[s.tissue] : 0;
}

describe('las palabras del vóxel y su línea de tiempo', () => {
  it('se empaquetan y se leen igual: el tejido en cada fase es el del último cambio pasado', () => {
    const w = packHeartVoxel(2, 0, [
      [10, 3],
      [100, 2],
      [130, 5],
      [180, 7],
      [255, 1],
    ]);
    expect(w.every((x) => x >= 0 && x < 65536)).toBe(true);
    expect(decodeHeartVoxel(w, 0).idx).toBe(2);
    expect(decodeHeartVoxel(w, 10).idx).toBe(3);
    expect(decodeHeartVoxel(w, 99).idx).toBe(3);
    expect(decodeHeartVoxel(w, 100).idx).toBe(2);
    expect(decodeHeartVoxel(w, 179).idx).toBe(5);
    expect(decodeHeartVoxel(w, 200).idx).toBe(7);
    expect(decodeHeartVoxel(w, 255).idx).toBe(1);
    expect(decodeHeartVoxel(packHeartVoxel(7, 7, []), 77)).toEqual({ idx: 7, dq: 7 });
    // todos los valores de cada campo, por separado
    for (let f = 0; f < 256; f += 17)
      for (let idx = 1; idx <= 7; idx++) {
        const ch: [number, number][] = [0, 1, 2, 3, 4].map((i) => [Math.min(255, f + i), ((idx + i) % 7) + 1]);
        const ww = packHeartVoxel(idx, idx % 8, ch);
        expect(decodeHeartVoxel(ww, 0).dq).toBe(idx % 8);
        for (let i = 0; i < 5; i++)
          if (f + i <= 255 && (i === 4 || f + i + 1 <= 255)) expect(decodeHeartVoxel(ww, f + i).idx).toBe(ch[i][1]);
      }
  });

  it('funde los tramos más cortos hasta dejar cinco cambios, y dos tramos seguidos del mismo tejido', () => {
    const ch: [number, number][] = [
      [16, 2],
      [20, 3],
      [40, 2],
      [100, 1],
      [104, 2],
      [140, 4],
      [200, 1],
    ];
    const r = reduceChanges(ch, 1);
    expect(r.length).toBeLessThanOrEqual(HEART_TRANSITIONS);
    // los tramos de [16, 20) (2, se funde con la base) y de [100, 104) (1, se funde con el 2 de antes, y con él el 2 de después)
    // eran los más cortos
    expect(r).toEqual([
      [20, 3],
      [40, 2],
      [140, 4],
      [200, 1],
    ]);
  });

  it(
    'en 16 fases del latido, el vóxel da lo que el clasificador de EchoTwin en su centro (≥ 98,5 % en el corazón)',
    { timeout: 600_000 },
    () => {
      const rnd = rng(17);
      let n = 0;
      let agree = 0;
      let moving = 0;
      for (let tries = 0; tries < 20000 && n < 300; tries++) {
        const i = Math.floor(rnd() * v.dims[0]);
        const j = Math.floor(rnd() * v.dims[1]);
        const k = Math.floor(rnd() * v.dims[2]);
        const w = voxelWords(cardiac, i, j, k, true);
        const base = decodeHeartVoxel(w, 0).idx;
        if (base === 0 && ((w[0] >> 10) & 7) === 0) continue;
        n++;
        if (((w[0] >> 10) & 7) > 0) moving++;
        // lo que el corazón deja al latir es grasa (el 1) donde el clasificador no da nada
        for (let f = 0; f < HEART_PHASES; f += 16 + 7) {
          const a = analytic(i, j, k, f);
          const got = decodeHeartVoxel(w, f).idx;
          if (a === 0 ? got === FAT_IDX : got === a) agree++;
        }
      }
      const total = n * Math.ceil(HEART_PHASES / 23);
      expect(n).toBe(300);
      // una parte del corazón se mueve (su pared, sus válvulas)
      expect(moving / n).toBeGreaterThan(0.1);
      expect(agree / total).toBeGreaterThanOrEqual(0.985);
    },
  );

  it(
    'lo que el corazón deja vacío al latir es grasa, nunca nada (que caería en el pulmón): ninguna fase de un vóxel del corazón queda en 0',
    { timeout: 600_000 },
    () => {
      expect(FAT_IDX).toBeGreaterThan(0);
      const rnd = rng(29);
      let vacated = 0;
      let vacatedPhases = 0;
      let fatPhases = 0;
      for (let tries = 0; tries < 40000 && vacated < 12; tries++) {
        const i = Math.floor(rnd() * v.dims[0]);
        const j = Math.floor(rnd() * v.dims[1]);
        const k = Math.floor(rnd() * v.dims[2]);
        const w = voxelWords(cardiac, i, j, k, true);
        // el vóxel que en alguna de las 16 fases gruesas es corazón y en otra el clasificador no da nada
        const empty: number[] = [];
        let some = false;
        for (let f = 0; f < HEART_PHASES; f += 16) {
          if (analytic(i, j, k, f) > 0) some = true;
          else empty.push(f);
        }
        if (!some || empty.length === 0) continue;
        vacated++;
        // en toda la línea de tiempo del vóxel hay un tejido (nunca el 0)
        for (let f = 0; f < HEART_PHASES; f++) expect(decodeHeartVoxel(w, f).idx).toBeGreaterThan(0);
        // y donde el clasificador lo deja vacío, es grasa
        for (const f of empty) {
          vacatedPhases++;
          if (decodeHeartVoxel(w, f).idx === FAT_IDX) fatPhases++;
        }
      }
      expect(vacated).toBe(12);
      expect(fatPhases / vacatedPhases).toBeGreaterThanOrEqual(0.9);
    },
  );

  it('sin latido, el vóxel es el de telediástole (la fase no lo cambia)', () => {
    const c = cardiacPoint(cardiac, [0, 0, 4]);
    const still = { ...heart, beat: null };
    for (const f of [0, 64, 128, 200]) expect(heartVoxel(still, c, f).tissue).toBe(heartVoxel(still, c, 0).tissue);
  });
});

describe('el corazón late sin salir de su sitio', () => {
  // las fases del latido: telediástole, eyección, telesístole, llenado rápido, diástasis, onda A
  const ref = referenceBeat();
  const phases = [0, 0.15, ref.endSystoleS / ref.rrS, 0.6, 0.8, 0.93].map((p) => heartFinePhase(p));

  it(
    'en todas las fases, nada del corazón entra en la pared bajo la ventana (el pericardio toca la pleura en telediástole)',
    { timeout: 600_000 },
    () => {
      const s = makeSample();
      const min = Infinity;
      let worst = min;
      for (const f of phases) {
        const pose = cardiacPoseAt(cardiac, f);
        const depths = windowDepths(heart, scene.torso, (p: Vec3) => {
          const q = [0, 1, 2].map((a) => {
            const d = [(p[0] - cardiac.originMm[0]) * 0.1, (p[1] - cardiac.originMm[1]) * 0.1, (p[2] - cardiac.originMm[2]) * 0.1];
            const e = [cardiac.ex, cardiac.ey, cardiac.ez][a];
            return d[0] * e[0] + d[1] * e[1] + d[2] * e[2];
          });
          return classifyHeart(cardiac.model, pose, q[0], q[1], q[2], s);
        });
        for (const d of depths) worst = Math.min(worst, d);
      }
      expect(worst).toBeGreaterThanOrEqual(-0.5);
    },
  );

  it(
    'en todas las fases, el saco queda en lo que no respira (la esfera de la base y el elipsoide con su tapón)',
    { timeout: 600_000 },
    () => {
      const VESSELS = new Set([
        Structure.Ivc,
        Structure.Svc,
        Structure.HepaticVein,
        Structure.PulmonaryVein,
        Structure.PulmonaryArtery,
        Structure.AorticRoot,
      ]);
      const B = CARDIAC_BASE_SPHERE_CM;
      const s = makeSample();
      const { min, max } = CARDIAC_BOX_CM;
      let out = 0;
      for (const f of phases) {
        const pose = cardiacPoseAt(cardiac, f);
        for (let x = min[0]; x <= max[0]; x += 0.4)
          for (let y = min[1]; y <= max[1]; y += 0.4)
            for (let z = min[2]; z <= max[2]; z += 0.4) {
              if (!classifyHeart(cardiac.model, pose, x, y, z, s) || VESSELS.has(s.structure)) continue;
              const inBase = Math.hypot(x - B.c[0], y - B.c[1], z - B.c[2]) <= B.r;
              if (!inBase && heartSd(heart, cardiacPoint(cardiac, [x, y, z])) > heart.plugDepthMm) out++;
            }
      }
      expect(out).toBe(0);
    },
  );
});

describe('el reloj único mueve el corazón y el pulmón con la misma fase', () => {
  it('la fase fina del instante es la de la muestra; la fracción expulsada, la del volumen del VI en esa fase', () => {
    const e = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: 'apnea-expiratory' });
    const ref = referenceBeat();
    for (let i = 0; i < 400; i++) {
      const s = e.step();
      const st = cycleStateAt(ref, s.heartPhase);
      expect(s.cardiacEjection).toBeCloseTo(st.contraction, 6);
      expect(heartFinePhase(s.heartPhase)).toBe(Math.floor(s.heartPhase * HEART_PHASES));
    }
  });
});
