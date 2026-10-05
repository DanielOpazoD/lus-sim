import { clipBLines, detectBLines, type BLineFrame } from '../measure/bLines';
import type { ProbePose } from '../probe/probe';
import { DEFAULT_BMODE, displayLevelDb, type BModeSettings } from '../ultrasound/renderer';
import type { Simulator } from './simulator';

/**
 * Un clip medido con el detector de líneas B (lus-sim, decisiones 51 y 51): los cuadros de la mirada 0 en una pose, su nivel
 * mostrado con el recorte de la pantalla y el detector de `measure/bLines.ts`; el clip, su peor cuadro. Lo usan los ganchos de
 * prueba y el panel de insuficiencia cardiaca (separado del banco de la equivalencia, que lleva el gemelo TS de las trampas).
 */
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
