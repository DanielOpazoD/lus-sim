import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Barrido de calibración de la pleura (ciclo 3b-2): σz de la pleura parietal, R_t y K, con el protocolo de C3b-A
 * (decisión 24: apnea espiratoria fija a t = 60 s, tres réplicas, rango dinámico 70 dB). Solo con LUS_BARRIDO=1: no es
 * una prueba, es la herramienta del barrido; la selección se hace con la exploración y se comprueba después.
 */
const SIGMA_Z = (process.env.LUS_BARRIDO_SIGMAZ ?? '0.01,0.02,0.03,0.04,0.05,0.06,0.067').split(',').map(Number);
const RT = (process.env.LUS_BARRIDO_RT ?? '0.1,0.15,0.2,0.25,0.3,0.4,0.5').split(',').map(Number);
const K = (process.env.LUS_BARRIDO_K ?? '53,54,55,56,57').split(',').map(Number);
/** Ganancia del preajuste (dB): −20 (decisión 24) salvo que se barra. */
const GAIN = (process.env.LUS_BARRIDO_GAIN ?? '-20').split(',').map(Number);
const SAMPLE_TIME_S = 60;
const FRAMES = 3;

test.skip(process.env.LUS_BARRIDO !== '1', 'herramienta del barrido de calibración: LUS_BARRIDO=1');

for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const)
  test(`barrido de la pleura en ${startPoint}`, async ({ page }, testInfo) => {
    test.setTimeout(3_600_000);
    await page.goto('/?e2e=1');
    await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
    const rows = await page.evaluate(
      ({ startPoint, sigmaZ, rt, k, gain, frames, sampleTimeS }) => {
        const hooks = window.__lusTest!;
        const sim = hooks.sim();
        const clock = sim.physiology.clock;
        sim.patient.respiratoryPattern = 'apnea-expiratory';
        const step = Math.round(sampleTimeS / clock.dt);
        while (clock.step < step) sim.physiology.step();
        clock.pause();
        const out: unknown[] = [];
        try {
          for (const s of sigmaZ)
            for (const r of rt)
              for (const kDb of k)
                for (const gainDb of gain) {
                  hooks.calibrationOverride({ kDb, pleuraSigmaZMm: s, pleuraRt: r });
                  const rep = hooks.fidelity({
                    startPoint,
                    respiration: 'apnea-expiratory',
                    frames,
                    frameIntervalS: 0,
                    settleS: 0,
                    dynamicRangeDb: 70,
                    gainDb,
                  });
                  const m = Object.fromEntries(
                    Object.entries(rep.metrics).map(([key, v]) => [key, { median: v.median, censored: v.censored }]),
                  );
                  out.push({ sigmaZ: s, rt: r, kDb, gainDb, metrics: m });
                }
        } finally {
          hooks.calibrationOverride(null);
        }
        return out;
      },
      { startPoint, sigmaZ: SIGMA_Z, rt: RT, k: K, gain: GAIN, frames: FRAMES, sampleTimeS: SAMPLE_TIME_S },
    );
    const file = testInfo.outputPath(`barrido-${startPoint}.json`);
    writeFileSync(file, JSON.stringify({ startPoint, rows }, null, 1));
    await testInfo.attach(`barrido-${startPoint}.json`, { path: file, contentType: 'application/json' });
  });
