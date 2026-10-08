import { tableGas, seedBits } from '../anatomy/organs/subpleuralTraps';
import { lungSlideMm } from '../anatomy/organs/lungBorder';
import { wallArc } from '../anatomy/organs/wall';
import { cross, normalize, type Vec3 } from '../core/vec3';
import { detectBLines, clipBLines, type BLineFrame } from '../measure/bLines';
import { SUBPLEURAL_GRID, SUBPLEURAL_NODES, subpleuralQuad, uniformAeration } from '../physiology/lungAeration';
import { pointOnLine, type ProbePose } from '../probe/probe';
import { trapGeometry, trapScan } from '../ultrasound/bLineTraps';
import { lateralSigmaMm } from '../ultrasound/beamModel';
import { elevSigmaMm } from '../ultrasound/pleura';
import { DEFAULT_BMODE, displayLevelDb, type BModeSettings } from '../ultrasound/renderer';
import { bmodeBeam } from '../ultrasound/transducerProfile';
import type { Simulator } from './simulator';

/**
 * Las líneas B en la GPU (lus-sim, decisión 51), solo para la e2e:
 *  - `setLungGas`: la aireación subpleural del paciente (la misma en todo el pulmón, un gradiente con la altura o la normal);
 *  - `bLineEquivalence`: el gemelo TS ↔ GLSL de las trampas (`bLineField` de la consulta de puntos frente a `trapScan`) en la
 *    pleura de cada línea de la pose actual, a varias profundidades aparentes;
 *  - `bLineClip`: un clip en la pose, medido con el detector (`measure/bLines.ts`) sobre el nivel mostrado de la mirada 0.
 */
export function setLungGas(sim: Simulator, gas: number | null | { top: number; bottom: number }): void {
  const lung =
    gas === null
      ? undefined
      : typeof gas === 'number'
        ? uniformAeration(gas)
        : // un mapa no uniforme: la fracción de gas varía con la altura de cada nodo, de `bottom` en la fila más baja a `top` en la más alta
          {
            gas: Array.from({ length: SUBPLEURAL_NODES }, (_, i) => {
              const f = Math.floor(i / SUBPLEURAL_GRID.NU) / (SUBPLEURAL_GRID.NZ - 1);
              return gas.bottom + (gas.top - gas.bottom) * f;
            }),
          };
  sim.patient.lung = lung;
  sim.scene.setLungAeration(lung);
}

export interface BLineEquivalence {
  /** Puntos comparados (líneas con pleura × profundidades). */
  points: number;
  /** Fracción de puntos con el mismo número de trampas en las dos. */
  sameTraps: number;
  /** Mayor |ρ_GPU − ρ_TS| en los puntos con las mismas trampas. */
  rhoMaxDiff: number;
  /** Error relativo mediano de |campo| (GPU frente a TS) donde el de TS no es despreciable. */
  fieldMedianRelErr: number;
  /** Trampas vistas en total (que la comparación no sea vacía). */
  traps: number;
}

export function bLineEquivalence(sim: Simulator, taus: readonly number[] = [-0.5, 1, 7, 30, 80]): BLineEquivalence {
  sim.render();
  const h2 = sim.renderer.readPleuraHits();
  const tr = sim.transducer;
  const frame = sim.frame;
  const pts: number[] = [];
  const tauArr: number[] = [];
  for (let l = 0; l < tr.lines; l++) {
    const D = h2[l * 4];
    if (!(D > 0)) continue;
    const theta = -tr.halfSector + (2 * tr.halfSector * (l + 0.5)) / tr.lines;
    const p = pointOnLine(frame, tr, theta, D);
    for (const t of taus) {
      pts.push(...p);
      tauArr.push(t);
    }
  }
  const q = sim.gpuQuery(new Float32Array(pts), frame, false, { lungPulse: true, trapTauMm: new Float32Array(tauArr) });
  const gpu = q.bLines!;
  const scene = sim.scene;
  const t = scene.torso;
  const caudal = sim.sample.resp.diaphragmCaudalMm;
  const gas = tableGas(scene.subpleural.table);
  const minGas = scene.subpleural.table[SUBPLEURAL_NODES * 4];
  const seedU = seedBits(sim.patient.seed);
  const beam = bmodeBeam(sim.profile, sim.bmode);
  const elev = frame.elevation;
  let same = 0;
  let rhoMax = 0;
  let traps = 0;
  const rel: number[] = [];
  for (let i = 0; i < tauArr.length; i++) {
    const p: Vec3 = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
    const m0 = sim.anatomy.deformation.toMaterial(p, sim.sample.resp);
    const lp = q.lungPulse!;
    const m: Vec3 = [m0[0] + lp[i * 3], m0[1] + lp[i * 3 + 1], m0[2] + lp[i * 3 + 2]];
    const D =
      Math.hypot(p[0] - frame.curvatureCenter[0], p[1] - frame.curvatureCenter[1], p[2] - frame.curvatureCenter[2]) - tr.curvatureRadius;
    const dir = normalize([p[0] - frame.curvatureCenter[0], p[1] - frame.curvatureCenter[1], p[2] - frame.curvatureCenter[2]]);
    const lat = normalize(cross(elev, dir));
    const u = wallArc(m, t);
    const z = m[2] + lungSlideMm(scene.lungBorder, m, t, caudal);
    const uL = wallArc([m[0] + lat[0], m[1] + lat[1], m[2] + lat[2]], t) - u;
    const uE = wallArc([m[0] + elev[0], m[1] + elev[1], m[2] + elev[2]], t) - u;
    const pitch = (tr.curvatureRadius + D) * ((2 * tr.halfSector) / (tr.lines - 1));
    const g = trapGeometry(
      u,
      z,
      uL,
      lat[2],
      uE,
      elev[2],
      lateralSigmaMm(D, sim.bmode.focusMm, beam),
      pitch,
      elevSigmaMm(D, tr.elevationFocusMm, sim.bmode.harmonic) * Math.SQRT1_2,
    );
    const ts = trapScan(g, subpleuralQuad(gas, u, z), minGas, seedU, tauArr[i]);
    const gTraps = gpu[i * 4 + 3];
    traps += ts.traps;
    if (gTraps !== ts.traps) continue;
    same++;
    rhoMax = Math.max(rhoMax, Math.abs(gpu[i * 4 + 2] - ts.rho));
    const a = Math.hypot(ts.re, ts.im);
    if (a > 1e-3) rel.push(Math.abs(Math.hypot(gpu[i * 4], gpu[i * 4 + 1]) - a) / a);
  }
  rel.sort((x, y) => x - y);
  return {
    points: tauArr.length,
    sameTraps: tauArr.length ? same / tauArr.length : 0,
    rhoMaxDiff: rhoMax,
    fieldMedianRelErr: rel.length ? rel[rel.length >> 1] : 0,
    traps,
  };
}

export interface BLineClip {
  /** El peor cuadro (el que manda) y los conteos de todos. */
  clip: BLineFrame;
  counts: number[];
  /** Posiciones (línea) de las líneas B de cada cuadro. */
  positions: number[][];
  /**
   * Diagnóstico: la pleura que el detector halló en la imagen frente a la de la anatomía (A0), en el último cuadro: líneas con
   * pleura en las dos, cuántas a ≤ 1,5 mm, y las que el detector ve sin que la anatomía tenga pleura (deberían ser 0).
   */
  pleura: { both: number; within: number; extra: number };
}

/** Un clip de `frames` cuadros cada `intervalS` s en `pose` (o la actual), medido con el detector en la mirada 0. */
export function bLineClip(sim: Simulator, opts: { pose?: ProbePose; frames?: number; intervalS?: number }): BLineClip {
  if (opts.pose) sim.setPose(opts.pose);
  sim.advance(0.5);
  const n = opts.frames ?? 6;
  const dt = opts.intervalS ?? 0.5;
  const frames: BLineFrame[] = [];
  for (let k = 0; k < n; k++) {
    sim.advance(dt);
    sim.render();
    const env = sim.renderer.readEnvelope();
    const tr = sim.transducer;
    const sampleMm = sim.bmode.depthMm / env.samples;
    // lo que se ve: el nivel de la pantalla con su recorte (0 dB el blanco, −rango dinámico el negro)
    const dr = sim.bmode.dynamicRangeDb;
    const level = new Float32Array(env.lines * env.samples);
    for (let s = 0; s < env.samples; s++) {
      const r = (s + 0.5) * sampleMm;
      for (let l = 0; l < env.lines; l++) {
        const e = env.data[s * env.lines + l];
        const d = displayLevelDb(20 * Math.log10(Math.max(e, 1e-12)), r, sim.bmode, sim.profile.bEffectiveMHz);
        level[s * env.lines + l] = Math.min(0, Math.max(-dr, d));
      }
    }
    frames.push(
      detectBLines({
        lines: env.lines,
        samples: env.samples,
        sampleMm,
        level,
        apexMm: tr.curvatureRadius,
        lineStepRad: (2 * tr.halfSector) / (tr.lines - 1),
        whiteDb: 0,
        gainOverPresetDb: gainOverPresetDb(sim.bmode, sim.profile.bEffectiveMHz, env.samples),
      }),
    );
  }
  const h2 = sim.renderer.readPleuraHits();
  const last = frames[frames.length - 1];
  let both = 0;
  let within = 0;
  let extra = 0;
  last.pleuraMm.forEach((D, l) => {
    const m = h2[l * 4];
    if (D > 0 && m > 0) {
      both++;
      if (Math.abs(D - m) <= 1.5) within++;
    } else if (D > 0) extra++;
  });
  return {
    clip: clipBLines(frames),
    counts: frames.map((f) => f.count),
    positions: frames.map((f) => f.positions),
    pleura: { both, within, extra },
  };
}

/**
 * La ganancia de pantalla más la TGC del usuario sobre las del preajuste pulmonar (dB), en cada una de las `samples` muestras de
 * la imagen: lo que el contador de líneas B compara con su rango de operación (`maxGainOverPresetDb`, `maxTgcSpreadDb`).
 */
export function gainOverPresetDb(b: BModeSettings, fMHz: number, samples: number): Float32Array {
  const preset = { ...b, gainDb: DEFAULT_BMODE.gainDb, tgcDb: DEFAULT_BMODE.tgcDb };
  const out = new Float32Array(samples);
  for (let s = 0; s < samples; s++) {
    const r = ((s + 0.5) * b.depthMm) / samples;
    out[s] = displayLevelDb(0, r, b, fMHz) - displayLevelDb(0, r, preset, fMHz);
  }
  return out;
}
