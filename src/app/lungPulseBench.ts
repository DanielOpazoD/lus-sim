import { lungPulseInverse } from '../anatomy/organs/lungPulse';
import { probeHitPoint, ribTableZ } from '../anatomy/organs/ribcage';
import { wallArc } from '../anatomy/organs/wall';
import { torsoSkinPoint } from '../anatomy/primitives';
import { Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { bandCorrelation, bandRows, bandSpectrum, decorrelationOnsetMm, rowLagCorrelation } from '../measure/lungPulse';
import type { RespiratoryPattern } from '../physiology/patientState';
import { pointOnLine, type ProbePose } from '../probe/probe';
import type { Simulator } from './simulator';
import { measurementViewPose, type MeasurementViewId } from './measurementViews';

/**
 * El pulso pulmonar en la imagen (lus-sim, decisión 32; metas A-T16, S3 y F-T11): el modo M de la línea central, como lo
 * registra la interfaz (`renderer.mStrip`, la línea de la envolvente mostrada, aquí a la cadencia de los cuadros), a intervalos fijos del
 * reloj único, medido en la banda bajo la línea pleural con `src/measure/lungPulse.ts`. Y el gemelo: el pulso de la GLSL
 * (`queryPoints`) frente al de TS en el pulmón junto al corazón.
 */
/** El vértice o una vista de medida (decisión 42). */
export type LungPulseSite = 'apex' | MeasurementViewId;

export interface LungPulseOptions {
  site: LungPulseSite;
  respiration: RespiratoryPattern;
  /** Segundos de franja (6 por omisión) y su intervalo (1/20 s por omisión). */
  seconds?: number;
  frameIntervalS?: number;
}

export interface LungPulseReport {
  site: LungPulseSite;
  respiration: RespiratoryPattern;
  /** Profundidad de la pleura en la línea central (mm, A0). */
  pleuraMm: number;
  /** Filas de la banda (1–6 mm bajo la pleura) y columnas de la franja. */
  rows: number;
  columns: number;
  frameIntervalS: number;
  /** Frecuencia cardiaca del paciente (Hz) y la del pico del espectro de la banda (Hz). */
  heartHz: number;
  peakHz: number;
  peakOverMedian: number;
  /** F-T11: la menor correlación entre columnas de la banda separadas ≤ 2 s. */
  correlation2s: number;
  /** El deslizamiento del latido en la pleura de la línea central, en la telesístole (mm, TS). */
  pulseMm: number;
}

/** Sobre el ápex (Gray: 5.º EIC a 9 cm a la izquierda de la línea media), corte longitudinal centrado en el EIC5. */
export function apexPose(sim: Simulator): ProbePose {
  const t = sim.scene.torso;
  const phi = Math.acos(90 / t.a);
  const au = Math.abs(wallArc(torsoSkinPoint(phi, 0, t), t));
  const z = 0.5 * (ribTableZ(sim.scene.ribCage, 4, au) + ribTableZ(sim.scene.ribCage, 5, au));
  return { phi, z, lift: 0, yaw: 0, rock: 0, tilt: 0 };
}

function poseOf(sim: Simulator, site: LungPulseSite): ProbePose {
  if (site === 'apex') return apexPose(sim);
  return measurementViewPose(site);
}

export function lungPulseMMode(sim: Simulator, opts: LungPulseOptions): LungPulseReport {
  const seconds = opts.seconds ?? 6;
  const dt = opts.frameIntervalS ?? 1 / 20;
  const pattern = sim.patient.respiratoryPattern;
  try {
    sim.patient.respiratoryPattern = opts.respiration;
    sim.setPose(poseOf(sim, opts.site));
    sim.advance(1);
    sim.renderer.mStrip.clear();
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      sim.advance(dt);
      // a la cadencia de los cuadros (decisión 54): el espectro cuenta con columnas a intervalos iguales
      sim.render({ mline: 0, mSubsteps: false });
    }
    const strip = sim.renderer.readMStrip();
    const h2 = sim.renderer.readPleuraHits();
    const lines = h2.length / 4;
    const a = h2[(lines / 2 - 1) * 4];
    const b = h2[(lines / 2) * 4];
    if (!(a > 0 && b > 0)) throw new Error(`pulso pulmonar en ${opts.site}: sin pleura en la línea central`);
    const pleuraMm = 0.5 * (a + b);
    const rows = bandRows(pleuraMm, 1, 6, strip.samples, strip.depthMm);
    const spectrum = bandSpectrum(strip.columns, dt, rows);
    // el deslizamiento del latido en la pleura de la línea central (TS), con el corazón vacío del todo
    const pD = sim.anatomy.deformation.toMaterial(pointOnLine(sim.frame, sim.transducer, 0, pleuraMm), sim.sample.resp);
    const x = lungPulseInverse(sim.scene.heart, sim.scene.torso, pD, 1);
    return {
      site: opts.site,
      respiration: opts.respiration,
      pleuraMm,
      rows: rows.length,
      columns: strip.columns.length,
      frameIntervalS: dt,
      heartHz: sim.patient.heartRateBpm / 60,
      peakHz: spectrum.peakHz,
      peakOverMedian: spectrum.peakOverMedian,
      correlation2s: bandCorrelation(strip.columns, strip.times, rows, 2),
      pulseMm: Math.hypot(x[0] - pD[0], x[1] - pD[1], x[2] - pD[2]),
    };
  } finally {
    sim.patient.respiratoryPattern = pattern;
  }
}

export interface LungPulseEquivalence {
  points: number;
  /** El mayor deslizamiento del latido entre los puntos (mm) y la mayor diferencia GLSL − TS (mm). */
  maxShiftMm: number;
  maxDiffMm: number;
}

/**
 * Gemelo TS ↔ GLSL del pulso pulmonar: en el pulmón bajo la pleura alrededor del corazón (rejilla en φ y z, 1–8 mm bajo
 * la pleura), con el corazón vacío del todo (la telesístole: `cardiacEjection` = 1), el punto del pulmón antes del latido
 * según la GPU (`queryPoints`, la salida `o3`) frente a `lungPulseInverse`.
 */
export function lungPulseEquivalence(sim: Simulator): LungPulseEquivalence {
  const scene = sim.scene;
  const t = scene.torso;
  const sample = { ...sim.sample, cardiacEjection: 1 };
  const instant = sim.anatomy.instantFor(sample);
  const pts: Vec3[] = [];
  for (let phi = 0.4; phi <= 1.9; phi += 0.06)
    for (let z = -40; z <= 110; z += 6)
      for (const depth of [1, 3, 8]) {
        const p = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + depth, t, z);
        if (scene.classify(p, instant).tissue === Tissue.Lung) pts.push(p);
      }
  const flat = new Float32Array(pts.flat());
  // la misma compresión de la sonda en las dos (la del contacto del cuadro) y el mismo instante
  const gpu = sim.gpuQuery(flat, sim.frame, false, { lungPulse: true, sample }).lungPulse!;
  let maxShiftMm = 0;
  let maxDiffMm = 0;
  pts.forEach((p, i) => {
    const m = sim.anatomy.deformation.toMaterial(p, sample.resp);
    const x = lungPulseInverse(scene.heart, t, m, 1);
    const cpu = [x[0] - m[0], x[1] - m[1], x[2] - m[2]];
    maxShiftMm = Math.max(maxShiftMm, Math.hypot(cpu[0], cpu[1], cpu[2]));
    maxDiffMm = Math.max(maxDiffMm, Math.hypot(gpu[i * 3] - cpu[0], gpu[i * 3 + 1] - cpu[1], gpu[i * 3 + 2] - cpu[2]));
  });
  return { points: pts.length, maxShiftMm, maxDiffMm };
}

export interface SeashoreOptions {
  site: LungPulseSite;
  respiration: RespiratoryPattern;
  /** Segundos de franja (3 por omisión), intervalo de los cuadros (1/20 s por omisión) y retardo de la correlación (0,5 s). */
  seconds?: number;
  frameIntervalS?: number;
  lagS?: number;
}

export interface SeashoreReport {
  site: LungPulseSite;
  respiration: RespiratoryPattern;
  /** Profundidad de la pleura en la línea central (mm, A0). */
  pleuraMm: number;
  /** Columnas de la franja, cuadros dibujados y columnas por segundo de franja. */
  columns: number;
  frames: number;
  columnsPerSecond: number;
  /** Mediana del paso entre columnas (s). */
  medianStepS: number;
  /** F-T10: profundidad a la que empieza la decorrelación temporal (mm; NaN si no empieza) y su distancia a la pleura. */
  onsetMm: number;
  onsetMinusPleuraMm: number;
  /** Correlación media con el retardo en la pared (2–7 mm sobre la pleura) y bajo la pleura (1–6 mm). */
  wallCorrelation: number;
  lungCorrelation: number;
}

/**
 * La orilla de mar en el modo M como lo registra la interfaz (decisión 54, meta F-T10): la franja de la línea central a la
 * cadencia del reloj (las columnas intermedias de cada cuadro), con la respiración pedida, y sobre ella la profundidad a
 * la que empieza la decorrelación temporal frente a la pleura de A0.
 */
export function seashoreMMode(sim: Simulator, opts: SeashoreOptions): SeashoreReport {
  const seconds = opts.seconds ?? 3;
  const dt = opts.frameIntervalS ?? 1 / 20;
  const lagS = opts.lagS ?? 0.5;
  const pattern = sim.patient.respiratoryPattern;
  try {
    sim.patient.respiratoryPattern = opts.respiration;
    sim.setPose(poseOf(sim, opts.site));
    sim.advance(1);
    sim.render({ mline: 0 });
    sim.renderer.mStrip.clear();
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      sim.advance(dt);
      sim.render({ mline: 0 });
    }
    const strip = sim.renderer.readMStrip();
    const h2 = sim.renderer.readPleuraHits();
    const lines = h2.length / 4;
    const a = h2[(lines / 2 - 1) * 4];
    const b = h2[(lines / 2) * 4];
    if (!(a > 0 && b > 0)) throw new Error(`orilla de mar en ${opts.site}: sin pleura en la línea central`);
    const pleuraMm = 0.5 * (a + b);
    const corr = rowLagCorrelation(strip.columns, strip.times, lagS);
    const onsetMm = decorrelationOnsetMm(corr, strip.depthMm);
    const mean = (rows: number[]) => rows.reduce((acc, r) => acc + corr[r], 0) / rows.length;
    const steps = strip.times
      .slice(1)
      .map((t, i) => t - strip.times[i])
      .sort((x, y) => x - y);
    const span = strip.times[strip.times.length - 1] - strip.times[0];
    return {
      site: opts.site,
      respiration: opts.respiration,
      pleuraMm,
      columns: strip.columns.length,
      frames: n,
      columnsPerSecond: span > 0 ? (strip.columns.length - 1) / span : 0,
      medianStepS: steps.length ? steps[Math.floor(steps.length / 2)] : Number.NaN,
      onsetMm,
      onsetMinusPleuraMm: onsetMm - pleuraMm,
      wallCorrelation: mean(bandRows(pleuraMm, -7, -2, strip.samples, strip.depthMm)),
      lungCorrelation: mean(bandRows(pleuraMm, 1, 6, strip.samples, strip.depthMm)),
    };
  } finally {
    sim.patient.respiratoryPattern = pattern;
  }
}
