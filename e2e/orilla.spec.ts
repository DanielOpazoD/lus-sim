import { expect, test, type Page } from '@playwright/test';

/**
 * El modo M a la cadencia del reloj (lus-sim, decisión 54; meta F-T10): la franja registra, además de la columna de cada
 * cuadro, las de los pasos del reloj entre cuadros (hasta `M_SUBSTEPS_MAX`), con las pasadas B–K repetidas solo en la
 * banda de la línea M y la transmisión del cuadro.
 *  - La cadencia: en el banco (`seashore`, cuadros a 1/20 s → 12 pasos del reloj por cuadro, 4 registrados), 5 columnas
 *    por cuadro, con el paso mediano de 8 ms (los pasos de 4 ms repartidos de 4 en 4 cada 50 ms).
 *  - La orilla de mar (F-T10): sobre la pleura la pared correlaciona con 0,5 s de retardo; bajo la pleura, la arena del
 *    deslizamiento correlaciona menos, y la decorrelación empieza bajo la línea pleural. La meta pide ±1 mm; hoy, en el
 *    PLAPS con respiración tranquila, empieza 1–3 mm bajo la pleura de A0 (la línea pleural, que no se desliza, ocupa el
 *    primer milímetro y la arena de la neblina es débil: `display-uncalibrated`): la guarda fija ese estado y falla cuando
 *    mejore, para que se registre.
 */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    if (m.type() === 'warning' && /WebGL: INVALID|GL_INVALID/.test(m.text())) errors.push(`warning: ${m.text()}`);
  });
  await page.goto('/?e2e=1');
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 300_000 }).toBe('object');
  return errors;
}

test('modo M a la cadencia del reloj: 5 columnas por cuadro y la orilla de mar empieza bajo la pleura (F-T10, estado)', async ({
  page,
}) => {
  // en el CI (SwiftShader, 4 núcleos) cada cuadro del banco con sus 4 columnas cuesta ≥ 7 s: 60 cuadros pasaron de 7 min; 24 cuadros
  // a 1/8 s (3 s de franja, 120 columnas) bastan para la cuenta con 1 s de retardo. La estratósfera en apnea la cubre `pulso.spec.ts`.
  test.setTimeout(600_000);
  const errors = await boot(page);
  const t0 = Date.now();
  const r = await page.evaluate(() =>
    window.__lusTest!.seashore({ site: 'plaps', respiration: 'quiet', seconds: 3, frameIntervalS: 1 / 8, lagS: 1 }),
  );
  console.log(`ORILLA plaps tranquila: ${((Date.now() - t0) / 1000).toFixed(1)} s ${JSON.stringify(r)}`);
  const tag = JSON.stringify(r);
  expect(r.frames, tag).toBe(24);
  expect(r.columns, tag).toBe(5 * r.frames);
  // 31 pasos del reloj por cuadro, 4 registrados: columnas cada ≈ 25 ms
  expect(r.medianStepS, tag).toBeLessThanOrEqual(0.03);
  expect(r.columnsPerSecond, tag).toBeGreaterThan(36);
  // con 1 s de retardo, la pared (que respira bajo la sonda) correlaciona bastante más que el pulmón que se desliza (GPU
  // real: 0,73 frente a 0,27 con 300 columnas)
  expect(r.wallCorrelation, tag).toBeGreaterThan(0.6);
  expect(r.lungCorrelation, tag).toBeLessThan(r.wallCorrelation - 0.3);
  // F-T10: la decorrelación empieza bajo la pleura, hoy 1–3 mm por debajo (GPU real: 1,22; la meta, ±1 mm, aún no se cumple)
  expect(r.onsetMinusPleuraMm, tag).toBeGreaterThan(1);
  expect(r.onsetMinusPleuraMm, tag).toBeLessThan(3);
  expect(errors).toEqual([]);
});
