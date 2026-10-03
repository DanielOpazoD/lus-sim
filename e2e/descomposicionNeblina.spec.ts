import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Descomposición de la neblina subpleural (ciclo 3b-3): qué pone cada parte del pulmón bajo la pleura en la banda de la
 * neblina (u 1,25–1,75) y en la de la pared (u 0,2–0,85), con el protocolo de C3b-A (decisión 24: apnea espiratoria fija a
 * t = 60 s, tres réplicas, rango dinámico 70 dB) y `calibrationOverride({ seriesParts })`. La línea pleural y sus réplicas se
 * conservan en todas las configuraciones: el detector necesita la pleura y la línea A para situar las bandas. Solo con
 * LUS_DESCOMPOSICION=1: no es una prueba, es la herramienta de la medida.
 */
const SAMPLE_TIME_S = 60;
const FRAMES = 3;
/** Pesos (espejo, directa, deslizamiento, línea pleural y réplicas). */
const CONFIGS: Record<string, [number, number, number, number]> = {
  todo: [1, 1, 1, 1],
  'línea y espejo': [1, 0, 0, 1],
  'línea y directa': [0, 1, 0, 1],
  'línea y deslizamiento': [0, 0, 1, 1],
  'línea sola': [0, 0, 0, 1],
  'sin deslizamiento': [1, 1, 0, 1],
};
const SIGMA_Z = (process.env.LUS_DESCOMPOSICION_SIGMAZ ?? '').split(',').filter(Boolean).map(Number);

test.skip(process.env.LUS_DESCOMPOSICION !== '1', 'herramienta de la descomposición de la neblina: LUS_DESCOMPOSICION=1');

for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const)
  test(`descomposición de la neblina en ${startPoint}`, async ({ page }, testInfo) => {
    test.setTimeout(1_800_000);
    await page.goto('/?e2e=1');
    await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
    const rows = await page.evaluate(
      ({ startPoint, configs, sigmaZ, frames, sampleTimeS }) => {
        const hooks = window.__lusTest!;
        const sim = hooks.sim();
        const clock = sim.physiology.clock;
        sim.patient.respiratoryPattern = 'apnea-expiratory';
        const step = Math.round(sampleTimeS / clock.dt);
        while (clock.step < step) sim.physiology.step();
        clock.pause();
        const out: unknown[] = [];
        try {
          for (const s of sigmaZ.length ? sigmaZ : [undefined])
            for (const [name, parts] of Object.entries(configs)) {
              hooks.calibrationOverride({ seriesParts: parts, ...(s === undefined ? {} : { pleuraSigmaZMm: s }) });
              const rep = hooks.fidelity({
                startPoint,
                respiration: 'apnea-expiratory',
                frames,
                frameIntervalS: 0,
                settleS: 0,
                dynamicRangeDb: 70,
              });
              out.push({
                config: name,
                sigmaZ: s ?? null,
                levelsDb: rep.levelsDb,
                ft02: rep.aLineDrop.ft02,
                aLineDrop: rep.aLineDrop.orders.map((o) => ({ k: o.k, dropEnvelopeDb: o.dropEnvelopeDb })),
                metrics: Object.fromEntries(
                  ['M.wall', 'M.haze', 'M.deep', 'A2.r2', 'A2.slopeLn', 'A2.visible', 'P1', 'levels.peaks.pleura.clippedHigh'].map((k) => [
                    k,
                    { median: rep.metrics[k]?.median, censored: rep.metrics[k]?.censored },
                  ]),
                ),
              });
            }
        } finally {
          hooks.calibrationOverride(null);
        }
        return out;
      },
      { startPoint, configs: CONFIGS, sigmaZ: SIGMA_Z, frames: FRAMES, sampleTimeS: SAMPLE_TIME_S },
    );
    for (const r of rows) console.log(`DESCOMPOSICION_JSON ${JSON.stringify({ startPoint, ...(r as object) })}`);
    const file = testInfo.outputPath(`descomposicion-${startPoint}.json`);
    writeFileSync(file, JSON.stringify({ startPoint, rows }, null, 1));
    await testInfo.attach(`descomposicion-${startPoint}.json`, { path: file, contentType: 'application/json' });
  });
