import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { compareToReference, simValuesOf } from '../src/measure/fidelity/compare';
import { calibrationReference, type CalibrationGroup } from '../tools/fidelity/calibration';
import type { ReferenceStats } from '../tools/fidelity/reference';

/**
 * C3b-A: adquisición reproducible del preajuste normal y barrido de presentación.
 * Tres réplicas en el MISMO instante de apnea por candidato: la anatomía no cambia; el ruido del receptor
 * sigue dependiendo del cuadro. No es una medida temporal T2/S1 ni una validación clínica del normal.
 * Cada candidato pasa por la GPU y readDisplay: no se remapea el gris ya recortado ni se duplica la conversión de barrido.
 */
const RANGES_DB = [50, 60, 70, 80] as const;
const FRAMES = 3;
// Instante de protocolo, no parámetro físico: se alcanza sin renderizar, a pasos del reloj existente.
const SAMPLE_TIME_S = 60;
const METRICS = [
  'M.wall',
  'M.haze',
  'M.deep',
  'A1.max',
  'A2.r2',
  'A2.r3',
  'A2.visible',
  'T1.sigmaOverProminence',
  'T1.lateral.dPl',
] as const;
const CLIPPING = [
  'levels.peaks.pleura.clippedHigh',
  'levels.peaks.aLine1.clippedHigh',
  'levels.wall.clippedLow',
  'levels.haze.clippedLow',
  'levels.deep.clippedLow',
] as const;
const split = JSON.parse(readFileSync('docs/reference-bank/calibration-split.json', 'utf8')) as {
  id: string;
  exploration: CalibrationGroup;
};
const reference = calibrationReference(
  JSON.parse(readFileSync('docs/reference-bank/reference-stats.json', 'utf8')) as ReferenceStats,
  split.exploration,
);
const convex = reference.strata.find((s) => s.pattern === 'normal' && s.probe === 'convex');
if (!convex) throw new Error('calibración: falta el estrato normal/convex del banco de referencia');

for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const)
  test(`C3b-A en ${startPoint}: barrido de rango dinámico sobre réplicas de una apnea fija`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await page.goto('/?e2e=1');
    await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
    const result = await page.evaluate(
      ({ startPoint, ranges, frames, sampleTimeS }) => {
        const hooks = window.__lusTest!;
        const sim = hooks.sim();
        const clock = sim.physiology.clock;
        const equipment = sim.equipment;
        const pattern = sim.patient.respiratoryPattern;
        const paused = clock.paused;
        if (sim.frozen || sim.bmode.compound || sim.bmode.harmonic || sim.bmode.persistence !== 0)
          throw new Error('calibración: requiere adquisición viva fundamental, una mirada y sin persistencia');
        const step = Math.round(sampleTimeS / clock.dt);
        if (clock.step >= step) throw new Error('calibración: el arranque ya superó el instante fijo del protocolo');
        const started = performance.now();
        try {
          sim.patient.respiratoryPattern = 'apnea-expiratory';
          // Se integra desde el estado actual; no se rebobina un generador de ritmo ni se inventa una muestra.
          while (clock.step < step) sim.physiology.step();
          clock.pause();
          // Una sola llamada síncrona impide que requestAnimationFrame intercale adquisiciones entre candidatos.
          const reports = ranges.map((dynamicRangeDb) =>
            hooks.fidelity({ startPoint, respiration: 'apnea-expiratory', frames, frameIntervalS: 0, settleS: 0, dynamicRangeDb }),
          );
          const gl = document.createElement('canvas').getContext('webgl2');
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          const renderer = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconocida';
          return { reports, renderer, elapsedMs: performance.now() - started, equipmentRestored: sim.equipment === equipment };
        } finally {
          sim.patient.respiratoryPattern = pattern;
          if (!paused) clock.resume();
        }
      },
      { startPoint, ranges: [...RANGES_DB], frames: FRAMES, sampleTimeS: SAMPLE_TIME_S },
    );
    const comparison = result.reports.map((r) => ({
      dynamicRangeDb: r.display.dynamicRangeDb,
      rows: compareToReference(simValuesOf(r.metrics, null), convex.metrics, METRICS, 'subjects'),
    }));
    const file = testInfo.outputPath(`calibracion-${startPoint}.json`);
    writeFileSync(file, JSON.stringify({ ...result, gpu: process.env.LUS_E2E_GPU === '1', comparison }, null, 1));
    await testInfo.attach(`calibracion-${startPoint}.json`, { path: file, contentType: 'application/json' });
    // Una línea por candidato, consultable por la API de logs aunque no se descargue el artefacto completo.
    for (const [i, r] of result.reports.entries())
      console.log(
        `CALIBRATION_JSON ${JSON.stringify({
          startPoint,
          protocol: { respiration: 'apnea-expiratory', frames: FRAMES, frameIntervalS: 0, settleS: 0, stack: r.stack },
          acquisition: r.acquisition,
          display: r.display,
          renderer: result.renderer,
          referenceGroup: { split: split.id, group: 'exploration', subjects: convex.subjects },
          metrics: Object.fromEntries(METRICS.map((k) => [k, r.metrics[k]])),
          clipping: Object.fromEntries(CLIPPING.map((k) => [k, r.metrics[k]?.median ?? null])),
          levelsDb: r.levelsDb,
          reference: comparison[i].rows.map(({ metric, position, basis, reference: ref }) => ({
            metric,
            position,
            basis,
            p10: ref.betweenSubjects.p10,
            p90: ref.betweenSubjects.p90,
            clips: ref.clips,
            subjects: ref.subjects,
          })),
        })}`,
      );
    expect(result.equipmentRestored).toBe(true);
    expect(result.reports.map((r) => r.display.dynamicRangeDb)).toEqual([...RANGES_DB]);
    for (const r of result.reports) {
      expect(r.stack).toBeNull();
      expect(r.acquisition.timesS).toEqual(Array<number>(FRAMES).fill(SAMPLE_TIME_S));
      expect(r.coherence.pleura.columns).toBeGreaterThan(50);
      expect(Number.isFinite(r.metrics['M.wall'].median)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
