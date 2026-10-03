import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { calibrationReference, type CalibrationGroup } from '../tools/fidelity/calibration';
import type { ReferenceStats } from '../tools/fidelity/reference';

/**
 * La pila del simulador medida como los clips del banco (lus-sim, decisión 39). El banco calcula T2 y S1 sobre el clip entero
 * (7–17 s a 18–37 cps), y la decorrelación de S1 depende de la duración: la media se resta en la ventana y el retardo llega
 * hasta su mitad. `e2e/fidelidad.spec.ts` toma 1 s (30 cuadros a 30 cps): con esa ventana la arena se decorrelaba en
 * 0,15–0,19 s, y con la de los clips, en 0,30–0,40 s. Aquí el simulador respira tranquilo durante la mediana de la duración
 * de los clips de la exploración, a su mediana de cuadros por segundo. Con `LUS_PILA_FOLLOW` y `LUS_PILA_TREMOR` (listas)
 * barre lo que sigue la mano de la pared y su temblor (`probe/operator.ts`), sin recompilar. Solo con LUS_PILA=1: es la
 * herramienta de la medida y del ajuste con la exploración (decisión 24), no una prueba.
 */
const split = JSON.parse(readFileSync('docs/reference-bank/calibration-split.json', 'utf8')) as {
  exploration: CalibrationGroup;
  checking: CalibrationGroup;
};
const stats = JSON.parse(readFileSync('docs/reference-bank/reference-stats.json', 'utf8')) as ReferenceStats;
const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
};
const explorationClips = stats.clips.filter((c) => split.exploration.clips.includes(c.id));
const FPS = Math.round(median(explorationClips.map((c) => c.fps ?? Number.NaN)));
const DURATION_S = median(explorationClips.map((c) => c.frames / (c.fps ?? Number.NaN)));
const FRAMES = Math.round(DURATION_S * FPS);
const list = (v: string | undefined): (number | undefined)[] => (v ? v.split(',').map(Number) : [undefined]);
const FOLLOW = list(process.env.LUS_PILA_FOLLOW);
const TREMOR = list(process.env.LUS_PILA_TREMOR);
const STACK_METRICS = ['T2.wall', 'T2.subPleura', 'S1.ratio', 'S1.decorrelationS'] as const;
const reference = Object.fromEntries(
  (['exploration', 'checking'] as const).map((g) => {
    const c = calibrationReference(stats, split[g]).strata.find((s) => s.pattern === 'normal' && s.probe === 'convex')!;
    return [g, Object.fromEntries(STACK_METRICS.map((k) => [k, c.metrics[k]?.betweenSubjects ?? null]))];
  }),
);

test.skip(process.env.LUS_PILA !== '1', 'herramienta de la pila con el protocolo de los clips: LUS_PILA=1');

for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const)
  test(`la pila con el protocolo de los clips en ${startPoint}`, async ({ page }, testInfo) => {
    test.setTimeout(3_600_000);
    await page.goto('/?e2e=1');
    await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
    const rows = await page.evaluate(
      ({ startPoint, follow, tremor, frames, fps }) => {
        const h = window.__lusTest!;
        const out: unknown[] = [];
        try {
          for (const f of follow)
            for (const t of tremor) {
              const op = h.operator({ ...(f === undefined ? {} : { chestFollow: f }), ...(t === undefined ? {} : { tremorRmsMm: t }) });
              const r = h.fidelity({ startPoint, respiration: 'quiet', frames, frameIntervalS: 1 / fps });
              out.push({ chestFollow: op.chestFollow, tremorRmsMm: op.tremorRmsMm, stack: r.stack });
            }
        } finally {
          h.operator(null);
        }
        return out;
      },
      { startPoint, follow: FOLLOW, tremor: TREMOR, frames: FRAMES, fps: FPS },
    );
    for (const r of rows) console.log(`PILA_JSON ${JSON.stringify({ startPoint, frames: FRAMES, fps: FPS, ...(r as object) })}`);
    const file = testInfo.outputPath(`pila-${startPoint}.json`);
    writeFileSync(file, JSON.stringify({ startPoint, frames: FRAMES, fps: FPS, reference, rows }, null, 1));
    await testInfo.attach(`pila-${startPoint}.json`, { path: file, contentType: 'application/json' });
  });
