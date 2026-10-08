import { expect, test, type Page } from '@playwright/test';

/**
 * Los protocolos de insuficiencia cardiaca (lus-sim, decisión 52): el mando hemodinámico lleva el agua a la aireación del paciente
 * y los protocolos se miden con el detector de líneas B sobre la imagen formada en la pose ideal de cada sitio; y el panel de IC,
 * un chunk diferido, se abre desde los ajustes y dibuja el mapa del protocolo.
 */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    if (m.type() === 'warning' && /WebGL: INVALID|GL_INVALID/.test(m.text())) errors.push(`warning: ${m.text()}`);
  });
  // los sitios de los protocolos con la física de las líneas B, sin el horneado del corazón (decisión 49) en SwiftShader
  await page.goto('/?e2e=1&corazon=0');
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  return errors;
}

test('protocolos de IC: la presión de llenado mueve el puntaje medido sobre la señal; el panel dibuja el mapa', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await boot(page);
  const r = await page.evaluate(() => {
    const t = window.__lusTest!;
    const out: Record<string, { evlwi: number; total: number; flags: string[] }> = {};
    for (const [k, mmHg, ph] of [
      ['bajo la bisagra', 12, 'hfpef'],
      ['sobre la bisagra', 30, 'hfref'],
    ] as const) {
      const ev = t.setHeartFailure({ control: { kind: 'pcwp', mmHg }, phenotype: ph, rapMmHg: 8 });
      const z = t.protocolSweep('zones8count', { frames: 2 });
      out[k] = { evlwi: ev.now, total: z.total, flags: z.flags };
    }
    t.setHeartFailure(null);
    return out;
  });
  const tag = JSON.stringify(r);
  console.log(`PROTOCOLOS IC: ${tag}`);
  expect(r['bajo la bisagra'].total, tag).toBeLessThanOrEqual(1);
  expect(r['sobre la bisagra'].total, tag).toBeGreaterThanOrEqual(6);
  expect(r['sobre la bisagra'].evlwi, tag).toBeGreaterThan(r['bajo la bisagra'].evlwi);

  // el panel: se carga al abrirlo, aplica el mando y mide la verdad del modelo del protocolo de 4 sitios de estrés
  await page.locator('#settings-toggle').click();
  // el puntero quedó sobre la ⓘ de alguna sección y su ayuda (que se abre al pasar) tapa el botón de la de abajo
  await page.mouse.move(2, 2);
  await page.getByRole('button', { name: 'Insuficiencia cardiaca', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir el panel de IC' }).click();
  const dialog = page.getByRole('dialog', { name: /Insuficiencia cardiaca/ });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole('combobox', { name: 'Protocolo' }).selectOption('stress4');
  await dialog.getByRole('button', { name: 'Aplicar en equilibrio' }).click();
  await dialog.getByRole('button', { name: 'Verdad del modelo' }).click();
  await expect(dialog.locator('.hf-totals')).toContainText(/Modelo/, { timeout: 120_000 });
  await expect(dialog.locator('svg.hf-map rect')).toHaveCount(2 * 4);
  await expect(dialog).toContainText('predicción del modelo');
  expect(errors).toEqual([]);
});
