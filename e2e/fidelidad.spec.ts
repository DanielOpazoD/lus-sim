import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { FidelityBenchReport } from '../src/app/fidelityBench';
import { LUNG_PRESET } from '../src/ultrasound/lungPreset';
import { compareToReference, simValuesOf, type StratumMetric } from '../src/measure/fidelity/compare';

/**
 * Banco de fidelidad, lado del simulador (decisión 21; `docs/knowledge/reference-images.md` §3): la imagen MOSTRADA (el
 * gris de 8 bits del lienzo) en los tres puntos de partida, en apnea espiratoria y en respiración tranquila, medida con
 * las mismas funciones que los clips reales (`src/measure/fidelity/`), con la geometría verdadera y con la detectada. Aquí no
 * se compara con la referencia (ciclo 3b): se exige que el detector automático vea lo que el simulador sabe, y el informe con
 * las métricas, su censura y los niveles en dB se adjunta al resultado de Playwright (`fidelidad-<punto>.json`).
 *
 * Referencia histórica medida el 27-09-2026 sobre main 9f9fd9f (K = 55 dB, R_t = 0,3, ganancia −21 dB) con GPU real
 * (Apple M4, `LUS_E2E_GPU=1`), 30 cuadros a 30 cps (los mismos rangos que la decisión 21):
 *  - la pleura detectada, a −0,11…−0,17 mm del cruce del gemelo de A0 (la peor, 0,24 mm) en todas las columnas;
 *  - las líneas A de orden 2 y 3 a +0,11…+0,34 mm de k veces la línea pleural mostrada (F-T01 pide ±0,5 mm) y a
 *    −0,17…−0,32 mm de k·D;
 *  - los núcleos de las sombras detectadas sobre líneas que cruzan hueso (94,2–100 %) y todas las sombras completas del
 *    simulador con núcleo cubiertas (salvo la parcial del borde del sector del BLUE inferior, 3 líneas);
 *  - el ápice detectado a 0,4–1,0 px del verdadero (8,1–13,7 px en el BLUE inferior, con los bordes del sector a oscuras) y el
 *    fondo detectado a 32,6–41,7 mm de los 120: el campo profundo es negro exacto (la envolvente, 6–7 dB bajo el negro);
 *  - σ temporal bajo la pleura: 3,3–4,6 grises respirando, 0,010–0,026 en apnea.
 */
async function openBench(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?e2e=1');
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
  return errors;
}

/**
 * Los estratos del banco de referencia (`npm run fidelity:ref`, decisión 21), si están: el informe sitúa cada métrica del
 * simulador frente a su p10–p90, sin afirmarlo (la calibración es del ciclo 3b).
 */
const REFERENCE = 'docs/reference-bank/reference-stats.json';
const strata: { pattern: string; probe: string; clips: string[]; subjects: string[]; metrics: Record<string, StratumMetric> }[] =
  existsSync(REFERENCE) ? (JSON.parse(readFileSync(REFERENCE, 'utf8')) as { strata: typeof strata }).strata : [];

/** Cuadros de cada pila y su intervalo: un segundo de vídeo a 30 cps (el modo M reconstruido, S1, y la coherencia, T2). */
const FRAMES = 30;
const FRAME_INTERVAL_S = 1 / 30;

for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const)
  test(`banco de fidelidad en ${startPoint}: el detector encuentra la pleura, las líneas A y las sombras del simulador (informe adjunto)`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const errors = await openBench(page);
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconocida';
    });
    const reports = [];
    for (const respiration of ['apnea-expiratory', 'quiet'] as const) {
      const r = await page.evaluate((o) => window.__lusTest!.fidelity(o), {
        startPoint,
        respiration,
        frames: FRAMES,
        frameIntervalS: FRAME_INTERVAL_S,
      });
      reports.push(r);
      const c = r.coherence;
      const tag = `${startPoint}, ${respiration}: ${JSON.stringify({ geometry: r.geometry, coherence: c })}`;
      // el sector detectado desde la imagen, sin la verdad del simulador: los bordes, la piel y el ápice, que se extrapola 60 mm
      // por encima de la piel (el radio de la convexa): a ≤ 1 px en el BLUE superior y el PLAPS, a 8–14 px y con el borde
      // derecho a 1,7–2,9° en el BLUE inferior, cuyos bordes están a oscuras. El fondo no: el campo profundo es negro exacto y el
      // sector detectado acaba donde acaba lo encendido (33–42 mm de los 120). Con la geometría detectada, d_pl sale 0,1–0,6 mm
      // más larga (la piel detectada, más honda). Queda en el informe (decisión 21)
      expect(r.geometry.apexErrPx, tag).toBeLessThan(25);
      expect(Math.abs(r.geometry.thetaErrDeg.left), tag).toBeLessThan(4);
      expect(Math.abs(r.geometry.thetaErrDeg.right), tag).toBeLessThan(4);
      expect(Math.abs(r.geometry.rhoMinErrPx), tag).toBeLessThan(10);
      expect(Math.abs(r.detectedMetrics['dPl.mm'].median - r.metrics['dPl.mm'].median), tag).toBeLessThan(2);
      // la pleura del detector, a ±1 mm del cruce del gemelo de A0, en todas las columnas intercostales
      expect(c.pleura.columns, tag).toBeGreaterThan(50);
      expect(c.pleura.within1mm, tag).toBe(1);
      // las líneas A de orden 2 y 3 se ven y caen a k veces la línea pleural mostrada (F-T01: ±0,5 mm o un píxel) y a ±1 mm
      // de k·D del gemelo
      const tol = Math.max(0.5, r.display.mmPerPx);
      for (const k of [2, 3]) {
        const a = c.aLines.find((x) => x.k === k)!;
        expect(a.visible, `orden ${k} (${tag})`).toBe(true);
        expect(Math.abs(a.shownErrMm), `F-T01, orden ${k} (${tag})`).toBeLessThanOrEqual(tol);
        expect(Math.abs(a.cpuErrMm), `orden ${k} frente a k·D (${tag})`).toBeLessThanOrEqual(1);
      }
      // las sombras: el núcleo de las detectadas sobre líneas que cruzan hueso, y cada sombra completa del simulador con
      // núcleo (≥ 5 líneas fuera de su penumbra) cubierta por el detector
      expect(c.shadows.detected.length, tag).toBeGreaterThanOrEqual(2);
      expect(c.shadows.coreOnBone, tag).toBeGreaterThanOrEqual(0.9);
      for (const s of c.shadows.simulated.filter((x) => x.coreLines >= 5)) expect(s.covered, tag).toBeGreaterThanOrEqual(0.9);
    }
    // el modo M reconstruido distingue la respiración (orilla de mar) de la apnea: σ temporal bajo la pleura
    const [apnea, quiet] = reports;
    expect(quiet.stack!.S1.sigmaBelow, JSON.stringify([apnea.stack, quiet.stack])).toBeGreaterThan(10 * apnea.stack!.S1.sigmaBelow);
    // frente a la referencia, estrato a estrato (convexa, lineal, sectorial): solo informa
    const comparison = reports.map((r) => ({
      respiration: r.respiration,
      strata: strata.map((g) => ({
        stratum: `${g.pattern}/${g.probe}`,
        clips: g.clips.length,
        subjects: g.subjects.length,
        rows: compareToReference(simValuesOf(r.metrics, r.stack), g.metrics),
      })),
    }));
    const file = testInfo.outputPath(`fidelidad-${startPoint}.json`);
    writeFileSync(file, JSON.stringify({ renderer, gpu: process.env.LUS_E2E_GPU === '1', reports, comparison }, null, 1));
    await testInfo.attach(`fidelidad-${startPoint}.json`, { path: file, contentType: 'application/json' });
    expect(errors).toEqual([]);
  });

/**
 * Las métricas que se declaran invariantes a la ganancia (decisión 21). Un cambio de ganancia es exactamente g → a·g + b en el
 * gris mostrado (la curva de grises es exponencial en el nivel: (1 + c)^(y + δ) = (1 + c)^δ·(1 + c)^y), así que lo que no se
 * recorta no debe cambiar más que el escalón de 8 bits y la detección (una fila o una columna): ±5 %. Lo recortado sale
 * censurado y no se compara. En la medición histórica del 27-09-2026, con preajuste −21 dB: neblina y campo profundo en el negro
 * a −30 dB, pleura en el blanco desde −15 dB (un 5 % de sus columnas) y fondo de las líneas A en el negro. Estos niveles no se
 * presuponen para otro preajuste: el barrido conserva sus desplazamientos y exige comparación a ±3 dB. N1–N3 no están: con el
 * suelo de la sombra en el negro dependen de la ganancia (la revisión de la PR #23 lo midió: N1 de 0,059 a 0,175 entre −31 y
 * −15 dB) y deben salir censuradas.
 */
const GAIN_INVARIANT = [
  'dPl.px',
  'M.wall',
  'M.haze',
  'M.deep',
  'N4',
  'P1',
  'P2.dPl',
  'P4.dPl',
  'A2.r2',
  'A2.r3',
  'A2.slopeLn',
  'T1.axial.dPl',
  'T1.lateral.dPl',
  'T1.sigmaOverProminence',
] as const;
/** Las que tienen que compararse (sin censura) a ±3 dB del preajuste: la prueba tiene dientes. */
const MUST_COMPARE = [
  'dPl.px',
  'M.wall',
  'M.haze',
  'N4',
  'P1',
  'P4.dPl',
  'T1.axial.dPl',
  'T1.lateral.dPl',
  'T1.sigmaOverProminence',
] as const;
/** El barrido conserva sus desplazamientos respecto a la ganancia vigente del preajuste. */
const PRESET_GAIN_DB = LUNG_PRESET.params.gainDb.value;
const GAIN_OFFSETS_DB = [-9, -3, 0, 3, 6, 9] as const;
const GAINS = GAIN_OFFSETS_DB.map((offsetDb) => PRESET_GAIN_DB + offsetDb);
const GAIN_TOLERANCE = 0.05;

test('barrido de ganancia (−9…+9 dB respecto al preajuste): lo que se declara invariante lo es en el simulador, y N1–N3 con el suelo en el negro salen censuradas', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const errors = await openBench(page);
  const runs: FidelityBenchReport[] = [];
  for (const gainDb of GAINS)
    runs.push(
      await page.evaluate(
        (g) => window.__lusTest!.fidelity({ startPoint: 'blueUpper', respiration: 'apnea-expiratory', frames: 3, gainDb: g }),
        gainDb,
      ),
    );
  // la ganancia llegó al equipo en cada corrida
  expect(runs.map((r) => r.display.gainDb)).toEqual([...GAINS]);
  const ref = runs[GAIN_OFFSETS_DB.indexOf(0)].metrics;
  const table = GAIN_INVARIANT.map((k) => ({
    metric: k,
    byGain: runs.map((r, i) => ({ gainDb: GAINS[i], value: r.metrics[k]?.median ?? null, censored: r.metrics[k]?.censored ?? null })),
  }));
  const file = testInfo.outputPath('fidelidad-ganancia.json');
  writeFileSync(
    file,
    JSON.stringify(
      {
        presetGainDb: PRESET_GAIN_DB,
        gainOffsetsDb: GAIN_OFFSETS_DB,
        table,
        floorBased: ['N1', 'N2', 'N3'].map((k) => ({ metric: k, byGain: runs.map((r, i) => ({ gainDb: GAINS[i], ...r.metrics[k] })) })),
        clipped: [
          'levels.peaks.pleura.clippedHigh',
          'levels.peaks.aLine1.clippedHigh',
          'levels.floor.clippedLow',
          'levels.deep.clippedLow',
          'levels.wall.clippedLow',
        ].map((k) => ({ metric: k, byGain: runs.map((r, i) => ({ gainDb: GAINS[i], median: r.metrics[k]?.median })) })),
      },
      null,
      1,
    ),
  );
  await testInfo.attach('fidelidad-ganancia.json', { path: file, contentType: 'application/json' });
  const compared = new Set<string>();
  for (const row of table)
    for (const c of row.byGain) {
      const r0 = ref[row.metric];
      if (c.censored || r0.censored || c.value === null || !Number.isFinite(r0.median)) continue;
      compared.add(`${row.metric}@${c.gainDb}`);
      expect(Math.abs(c.value - r0.median), `${row.metric} a ${c.gainDb} dB: ${JSON.stringify(row.byGain)}`).toBeLessThanOrEqual(
        GAIN_TOLERANCE * Math.max(1, Math.abs(r0.median)),
      );
    }
  for (const g of [PRESET_GAIN_DB - 3, PRESET_GAIN_DB + 3])
    for (const k of MUST_COMPARE) expect(compared.has(`${k}@${g}`), `${k} a ${g} dB: ${JSON.stringify(table)}`).toBe(true);
  // con el suelo de la sombra en el gris 0, N1–N3 no son medidas en ninguna ganancia del barrido; el campo profundo del
  // preajuste, en el negro, da M como cota inferior
  for (const r of runs) for (const k of ['N1', 'N2', 'N3']) expect(r.metrics[k].censored, `${k} a ${r.display.gainDb} dB`).not.toBeNull();
  expect(ref['M.deep'].censored).toBe('lower');
  expect(errors).toEqual([]);
});
