import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CalibrationGroup } from '../tools/fidelity/calibration';
import type { ReferenceStats } from '../tools/fidelity/reference';

/**
 * La pleura lisa con la ganancia que no la recorta (ciclo 3b-4, decisión 41). Para cada σz de la pleura parietal
 * (`LUS_LISA_SIGMAZ`), con R_t (`LUS_LISA_RT`) y en fundamental o en armónica (`LUS_LISA_HARMONIC=1`), con el protocolo de C3b-A
 * (apnea espiratoria a t = 60 s, tres réplicas, rango dinámico 70 dB): las métricas del banco y los niveles en dB en cada
 * ganancia de −20 a −34 dB. Se elige la más alta que deja la línea pleural sin recortar en ningún cuadro (Demi 2023, enunciado
 * 15) y con M y r₂ sin censura. Con esa ganancia (o con `LUS_LISA_PILA_GAIN`, el control), la pila con el protocolo de los clips
 * (la mediana de la duración y de los cuadros por segundo de los clips de la exploración, como `e2e/pilaClips.spec.ts`): la
 * decorrelación de la arena. Solo con LUS_LISA=1: es la herramienta de la medida, no una prueba.
 */
const SIGMA_Z = (process.env.LUS_LISA_SIGMAZ ?? '0.005,0.01,0.015,0.02,0.03,0.05').split(',').map(Number);
const RT = Number(process.env.LUS_LISA_RT ?? '0.1');
const HARMONIC = process.env.LUS_LISA_HARMONIC === '1';
const PILA_GAIN = process.env.LUS_LISA_PILA_GAIN === undefined ? null : Number(process.env.LUS_LISA_PILA_GAIN);
const GAINS = [-20, -22, -24, -26, -28, -30, -32, -34];
const KEYS = [
  'M.wall',
  'M.haze',
  'M.deep',
  'A2.r2',
  'A2.slopeLn',
  'A2.visible',
  'P1',
  'levels.peaks.pleura.clippedHigh',
  'levels.haze.clippedLow',
  'levels.wall.clippedLow',
];
const split = JSON.parse(readFileSync('docs/reference-bank/calibration-split.json', 'utf8')) as { exploration: CalibrationGroup };
const stats = JSON.parse(readFileSync('docs/reference-bank/reference-stats.json', 'utf8')) as ReferenceStats;
const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
};
const explorationClips = stats.clips.filter((c) => split.exploration.clips.includes(c.id));
const FPS = Math.round(median(explorationClips.map((c) => c.fps ?? Number.NaN)));
const FRAMES = Math.round(median(explorationClips.map((c) => c.frames / (c.fps ?? Number.NaN))) * FPS);

test.skip(process.env.LUS_LISA !== '1', 'herramienta de la pleura lisa: LUS_LISA=1');

for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const)
  test(`pleura lisa en ${startPoint}`, async ({ page }, testInfo) => {
    test.setTimeout(3_600_000);
    await page.goto('/?e2e=1&corazon=0');
    await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
    const rows = await page.evaluate(
      ({ startPoint, sigmaZ, gains, keys, rt, harmonic, pilaGain, frames, fps }) => {
        const h = window.__lusTest!;
        const sim = h.sim();
        const clock = sim.physiology.clock;
        const harmonicBefore = sim.bmode.harmonic;
        const pattern = sim.patient.respiratoryPattern;
        const wasPaused = clock.paused;
        const out: unknown[] = [];
        const pick = (r: ReturnType<typeof h.fidelity>) =>
          Object.fromEntries(
            keys.map((k) => {
              const m = r.metrics[k];
              if (!m) throw new Error(`pleura lisa: falta la métrica ${k}`);
              return [k, { median: m.median, p75: m.p75, censored: m.censored ?? null, censoredFraction: m.censoredFraction }];
            }),
          );
        try {
          h.setHarmonic(harmonic);
          sim.patient.respiratoryPattern = 'apnea-expiratory';
          const step = Math.round(60 / clock.dt);
          while (clock.step < step) sim.physiology.step();
          clock.pause();
          const chosen = new Map<number, number | null>();
          for (const s of sigmaZ) {
            h.calibrationOverride({ pleuraSigmaZMm: s, pleuraRt: rt });
            let c: number | null = null;
            const static_: unknown[] = [];
            for (const g of gains) {
              const r = h.fidelity({
                startPoint,
                respiration: 'apnea-expiratory',
                frames: 3,
                frameIntervalS: 0,
                settleS: 0,
                dynamicRangeDb: 70,
                gainDb: g,
              });
              const m = pick(r);
              // sin recorte en ningún cuadro: el p75 de tres cuadros es > 0 si alguno recorta
              const clip = (m['levels.peaks.pleura.clippedHigh'] as { p75: number }).p75;
              static_.push({ gainDb: g, metrics: m, levels: r.levelsDb });
              const uncensored = ['M.wall', 'M.haze', 'A2.r2'].every((k) => (m[k] as { censoredFraction: number }).censoredFraction === 0);
              if (c === null && clip === 0 && uncensored) c = g;
            }
            chosen.set(s, c);
            out.push({ sigmaZ: s, chosenGainDb: c, static: static_ });
          }
          if (!wasPaused) clock.resume();
          sim.patient.respiratoryPattern = pattern;
          for (const s of sigmaZ) {
            const g = pilaGain ?? chosen.get(s);
            if (g === null || g === undefined) continue;
            h.calibrationOverride({ pleuraSigmaZMm: s, pleuraRt: rt });
            out.push({
              sigmaZ: s,
              pilaGainDb: g,
              pila: h.fidelity({ startPoint, respiration: 'quiet', frames, frameIntervalS: 1 / fps, gainDb: g }).stack,
            });
          }
        } finally {
          h.calibrationOverride(null);
          h.setHarmonic(harmonicBefore);
          sim.patient.respiratoryPattern = pattern;
          if (!wasPaused && clock.paused) clock.resume();
        }
        return out;
      },
      { startPoint, sigmaZ: SIGMA_Z, gains: GAINS, keys: KEYS, rt: RT, harmonic: HARMONIC, pilaGain: PILA_GAIN, frames: FRAMES, fps: FPS },
    );
    console.log(`LISA_JSON ${JSON.stringify({ startPoint, rows })}`);
    const file = testInfo.outputPath(`pleura-lisa-${startPoint}.json`);
    writeFileSync(file, JSON.stringify({ startPoint, rt: RT, harmonic: HARMONIC, frames: FRAMES, fps: FPS, rows }, null, 1));
    await testInfo.attach(`pleura-lisa-${startPoint}.json`, { path: file, contentType: 'application/json' });
  });
