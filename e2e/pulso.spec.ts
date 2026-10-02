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

test('pulso pulmonar: el gemelo GLSL, el pico a la FC sobre el ápex en apnea (S3) y la estratósfera lejos del corazón (F-T11)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  // el gemelo, en la telesístole (el corazón vacío del todo): float32 frente a float64
  const eq = await page.evaluate(() => window.__lusTest!.lungPulseEquivalence());
  expect(eq.points, JSON.stringify(eq)).toBeGreaterThan(500);
  expect(eq.maxShiftMm, JSON.stringify(eq)).toBeGreaterThan(2);
  expect(eq.maxDiffMm, JSON.stringify(eq)).toBeLessThan(0.01);
  // sobre el ápex en apnea: 4 s de modo M a 12 columnas por segundo (Nyquist 6 Hz; resolución 0,25 Hz)
  const apex = await page.evaluate(() =>
    window.__lusTest!.lungPulse({ site: 'apex', respiration: 'apnea-expiratory', seconds: 4, frameIntervalS: 1 / 12 }),
  );
  const tagA = JSON.stringify(apex);
  expect(apex.columns, tagA).toBe(48);
  expect(apex.pulseMm, tagA).toBeGreaterThan(1);
  // el pico de la banda, a la FC (± una línea del espectro); en GPU real 405 veces la mediana con 120 columnas, 22 con 48
  expect(Math.abs(apex.peakHz - apex.heartHz), tagA).toBeLessThanOrEqual(1 / 4 + 1e-6);
  expect(apex.peakOverMedian, tagA).toBeGreaterThan(8);
  // hay pulso: no es una estratósfera (F-T11 exige pulso 0)
  expect(apex.correlation2s, tagA).toBeLessThan(0.9);
  // lejos del corazón, en apnea: estratósfera
  const far = await page.evaluate(() =>
    window.__lusTest!.lungPulse({ site: 'blueUpper', respiration: 'apnea-expiratory', seconds: 2.5, frameIntervalS: 1 / 10 }),
  );
  const tagF = JSON.stringify(far);
  expect(far.pulseMm, tagF).toBe(0);
  expect(far.correlation2s, tagF).toBeGreaterThanOrEqual(0.95);
  expect(errors).toEqual([]);
});
