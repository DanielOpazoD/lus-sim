import { expect, test, type Page } from '@playwright/test';

/**
 * El pulso pulmonar en la imagen (lus-sim, decisión 32): lo que la física del latido hace ver en el modo M, en la GPU.
 *  - El gemelo: el deslizamiento del latido de la GLSL (`queryPoints`) es el de TS en el pulmón junto al corazón.
 *  - A-T16 y S3: en apnea, sobre el ápex (la língula tapa el corazón), la banda bajo la pleura del modo M tiene su pico
 *    espectral a la frecuencia cardiaca, y no es una estratósfera (F-T11 no se cumple: hay pulso).
 *  - F-T11: en apnea, en el punto BLUE superior derecho (lejos del corazón: sin deslizamiento ni pulso), la banda es una
 *    estratósfera: correlación ≥ 0,95 en 2 s.
 * Sin el latido en la GLSL (`lungPulseInverse` fuera de `slidingField`) el pico se va a 3 Hz y la banda es una estratósfera
 * (0,9999): la prueba falla (mutación comprobada al escribirla, decisión 32); un error en la GLSL del pulso mismo lo atrapa el
 * gemelo.
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
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  return errors;
}

/** Una llamada a los ganchos, con su duración en el registro de la prueba (para medir el costo en el CI). */
async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const out = await run();
  console.log(`PULSO ${label}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return out;
}

test('pulso pulmonar: el gemelo GLSL y la estratósfera lejos del corazón en apnea (F-T11)', async ({ page }) => {
  // en el CI (#42) la prueba entera con 73 columnas pasó de 240 s: se parte en dos y se mide cada paso
  test.setTimeout(240_000);
  const errors = await timed('arranque', () => boot(page));
  // el gemelo, en la telesístole (el corazón vacío del todo): float32 frente a float64
  const eq = await timed('gemelo', () => page.evaluate(() => window.__lusTest!.lungPulseEquivalence()));
  expect(eq.points, JSON.stringify(eq)).toBeGreaterThan(500);
  expect(eq.maxShiftMm, JSON.stringify(eq)).toBeGreaterThan(2);
  expect(eq.maxDiffMm, JSON.stringify(eq)).toBeLessThan(0.01);
  // lejos del corazón, en apnea: estratósfera (12 columnas en 2,2 s: la ventana de 2 s de F-T11)
  const far = await timed('BLUE superior', () =>
    page.evaluate(() =>
      window.__lusTest!.lungPulse({ site: 'blueUpper', respiration: 'apnea-expiratory', seconds: 2.2, frameIntervalS: 0.2 }),
    ),
  );
  const tagF = JSON.stringify(far);
  expect(far.pulseMm, tagF).toBe(0);
  expect(far.correlation2s, tagF).toBeGreaterThanOrEqual(0.95);
  expect(errors).toEqual([]);
});

test('pulso pulmonar: sobre el ápex en apnea, el pico del modo M a la FC (S3) y sin estratósfera', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await timed('arranque', () => boot(page));
  // 3 s de modo M a 10 columnas por segundo (Nyquist 5 Hz; resolución 1/3 Hz)
  const apex = await timed('ápex', () =>
    page.evaluate(() => window.__lusTest!.lungPulse({ site: 'apex', respiration: 'apnea-expiratory', seconds: 3, frameIntervalS: 0.1 })),
  );
  const tagA = JSON.stringify(apex);
  expect(apex.columns, tagA).toBe(30);
  expect(apex.pulseMm, tagA).toBeGreaterThan(1);
  // el pico de la banda, a la FC (± una línea del espectro): en GPU real, 19–33 veces la mediana con 30 columnas
  expect(Math.abs(apex.peakHz - apex.heartHz), tagA).toBeLessThanOrEqual(1 / 3 + 1e-6);
  expect(apex.peakOverMedian, tagA).toBeGreaterThan(8);
  // hay pulso: no es una estratósfera (F-T11 exige pulso 0)
  expect(apex.correlation2s, tagA).toBeLessThan(0.9);
  expect(errors).toEqual([]);
});
