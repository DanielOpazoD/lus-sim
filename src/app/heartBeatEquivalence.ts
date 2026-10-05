import type { Simulator } from './simulator';
import type { Vec3 } from '../core/vec3';
import { Tissue } from '../anatomy/tissues';
import { CARDIAC_TISSUES, decodeHeartVoxel } from '../anatomy/organs/heart';

/**
 * Equivalencia TS ↔ GLSL del latido (fase 2 del corazón): en las capas del volumen que llevan la línea de tiempo (`Heart.beat`),
 * `n` centros de vóxel del corazón (semilla fija) clasificados en la CPU y en la GPU con la misma muestra fisiológica en varias fases
 * del latido. En el centro del vóxel la rejilla no tiene empates: las dos leen el mismo vóxel, y su línea de tiempo en la misma fase
 * fina. Cuenta también cuántos puntos cambian de tejido entre fases (el corazón late de verdad en la GPU).
 */
export interface HeartBeatEquivalenceReport {
  points: number;
  phases: { phase: number; agreement: number; heart: number; worst: string }[];
  /** Puntos cuyo tejido de la GPU cambia entre alguna de las fases. */
  moving: number;
}

export function heartBeatEquivalence(sim: Simulator, phases: readonly number[], n = 2000, seed = 20261005): HeartBeatEquivalenceReport {
  const h = sim.scene.heart;
  const rt = h.cardiac;
  if (!rt || !h.beat) throw new Error('heartBeatEquivalence: la escena no tiene el latido');
  const v = rt.vol;
  let state = seed >>> 0;
  const rnd = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // centros de vóxel de las capas con latido que alguna vez son corazón (su línea de tiempo tiene cambios o tejido)
  const pts: number[] = [];
  for (let tries = 0; tries < 200 * n && pts.length < 3 * n; tries++) {
    const i = Math.floor(rnd() * v.dims[0]);
    const j = Math.floor(rnd() * v.dims[1]);
    const k = h.beat.k0 + Math.floor(rnd() * (h.beat.k1 - h.beat.k0));
    const w = v.voxel(i, j, k, true);
    if (decodeHeartVoxel(w, 0).idx === 0 && ((w[0] >> 6) & 7) === 0) continue;
    const c: Vec3 = [0, 1, 2].map(
      (a) => v.originMm[a] + ((i + 0.5) * v.ex[a] + (j + 0.5) * v.ey[a] + (k + 0.5) * v.ez[a]) * v.voxelMm,
    ) as Vec3;
    pts.push(...c);
  }
  const m = pts.length / 3;
  const points = new Float32Array(pts);
  const frame = sim.frame;
  const gpuByPhase: Uint8Array[] = [];
  const out: HeartBeatEquivalenceReport['phases'] = [];
  for (const phase of phases) {
    const sample = { ...sim.sample, heartPhase: phase };
    const gpu = sim.gpuQuery(points, frame, false, { sample });
    let agree = 0;
    let heart = 0;
    const worst = new Map<string, number>();
    const g = new Uint8Array(m);
    for (let i = 0; i < m; i++) {
      const cpu: number = sim.anatomy.classifyWorld([points[3 * i], points[3 * i + 1], points[3 * i + 2]], sample).tissue;
      const gt: number = gpu.tissue[i];
      g[i] = gt;
      if (cpu === gt) agree++;
      else {
        const key = `${Tissue[cpu]}→${Tissue[gt]}`;
        worst.set(key, (worst.get(key) ?? 0) + 1);
      }
      if ((CARDIAC_TISSUES as ReadonlySet<number>).has(gt)) heart++;
    }
    gpuByPhase.push(g);
    out.push({
      phase,
      agreement: m > 0 ? agree / m : 0,
      heart,
      worst: [...worst]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, c]) => `${k}×${c}`)
        .join(', '),
    });
  }
  let moving = 0;
  for (let i = 0; i < m; i++) if (gpuByPhase.some((g) => g[i] !== gpuByPhase[0][i])) moving++;
  return { points: m, phases: out, moving };
}
