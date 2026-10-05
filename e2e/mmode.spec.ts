import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?e2e=1&corazon=0');
  await expect(page).toHaveURL(/\/\?e2e=1$/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  return errors;
}

const frame = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const count = (page: Page) => page.evaluate(() => window.__lusTest!.sim().renderer.mStrip.count);
const first = (page: Page) => page.evaluate(() => window.__lusTest!.sim().renderer.mStrip.time(0));
async function acquired(page: Page): Promise<void> {
  await expect.poll(() => count(page), { timeout: 60_000 }).toBeGreaterThan(5);
  await expect(page.locator('#mmode-pane')).toHaveAttribute('data-available', 'true');
}

test('B + M: señal visible, B restaurado, reloj congelado y cine sin historia inventada', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await expect(page.locator('#mmode-pane')).toBeHidden();
  expect(await count(page)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().renderer.cineCount), { timeout: 60_000 }).toBeGreaterThan(3);
  const initial = await page.evaluate(() => {
    const sim = window.__lusTest!.sim();
    return { pose: sim.pose, bmode: sim.bmode };
  });
  await page.getByRole('button', { name: 'Modo B + M', exact: true }).click();
  await acquired(page);
  await expect(page.locator('#mmode-status')).toHaveText('M a la cadencia de B. Congela para revisar con el cine.');
  await expect(page.locator('.mmode-fine')).not.toHaveAttribute('open');
  expect(await page.evaluate(() => ({ pose: window.__lusTest!.sim().pose, bmode: window.__lusTest!.sim().bmode }))).toEqual(initial);
  await page.locator('#freeze').click();
  await expect(page.locator('#live-chip')).toHaveText('Congelada');
  await expect(page.locator('#mmode-status')).toHaveText('Imagen congelada. Revisa B y M con el cine.');
  await frame(page);
  const sealed = await page.evaluate(() => {
    const sim = window.__lusTest!.sim();
    const m = sim.renderer.mStrip;
    return { count: m.count, end: m.time(m.count - 1), shown: sim.displayedAcquisition.sample.t };
  });
  expect(sealed.end).toBe(sealed.shown);
  for (const id of ['mmode-toggle', 'mmode-place', 'mmode-reset', 'mmode-line']) await expect(page.locator(`#${id}`)).toBeDisabled();
  // Región interior reciente, sin ejes ni rótulos: detecta una franja negra o un recorte de canvas incorrecto.
  const pixels = await page.locator('#mmode-canvas').evaluate((element) => {
    const c = element as HTMLCanvasElement;
    const ratio = c.width / c.clientWidth;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let max = 0;
    let min = 255;
    for (let y = Math.ceil(12 * ratio); y < c.height - 28 * ratio; y++) {
      for (let x = Math.ceil(c.width - 60 * ratio); x < c.width - 20 * ratio; x++) {
        const value = data[(y * c.width + x) * 4];
        max = Math.max(max, value);
        min = Math.min(min, value);
      }
    }
    return { min, max };
  });
  expect(pixels.max - pixels.min, 'debe haber señal dentro de la franja, no solo sus etiquetas').toBeGreaterThan(20);
  const before = await page.locator('#gl').screenshot();
  await page.locator('#mmode-duration').selectOption('8');
  await frame(page);
  expect(await page.locator('#gl').screenshot(), 'mostrar M no debe dejar la franja dibujada encima de B').toEqual(before);
  expect(await count(page)).toBe(sealed.count);
  await page.locator('#cine').press('Home');
  await frame(page);
  await expect(page.locator('#mmode-pane')).toHaveAttribute('data-available', 'false');
  await expect(page.locator('#mmode-status')).toHaveText('Sin datos M para este cuadro del cine.');
  await page.locator('#cine').press('End');
  await frame(page);
  await expect(page.locator('#mmode-pane')).toHaveAttribute('data-available', 'true');
  await expect(page.locator('#mmode-status')).toHaveText('Imagen congelada. Revisa B y M con el cine.');
  const canvas = info.outputPath('mmode-desktop.png');
  await page.locator('.center').screenshot({ path: canvas });
  await info.attach('B y M congelados', { path: canvas, contentType: 'image/png' });
  await page.screenshot({ path: info.outputPath('mmode-workspace.png'), fullPage: true });
  console.log('MMODE_EVIDENCE', JSON.stringify({ sealed, pixels, bRestoredExactly: true }));
  expect(errors).toEqual([]);
});

/**
 * Un teléfono (390 × 844, táctil). Las dos pruebas «M móvil» eran una sola: con SwiftShader cada cuadro con B + M tarda de
 * 3 a 20 s en el CI y cada clic espera un par de cuadros, y la prueba entera pasaba en 2,7–4,0 min con un plazo de 4 min
 * (decisión 30). Partida en dos, cada una arranca su página y conserva todas sus comprobaciones.
 */
async function onPhone(browser: Browser, info: TestInfo, body: (page: Page, errors: string[]) => Promise<void>): Promise<void> {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  try {
    const errors = await boot(page);
    await page.locator('#mmode-toggle').click();
    await acquired(page);
    await body(page, errors);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

test('M móvil: seleccionar una línea no mueve la sonda; teclado, equipo y respiración conservan sus contratos', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  await onPhone(browser, info, async (page) => {
    const pose = await page.evaluate(() => ({ ...window.__lusTest!.sim().pose }));
    await page.locator('#mmode-place').click();
    await expect(page.locator('#sector-wrap')).toBeFocused();
    await expect(page.locator('#mmode-status')).toHaveText('Toca el sector para colocar la línea; Escape cancela.');
    await page.locator('#sector-wrap').press('Escape');
    await expect(page.locator('#mmode-place')).toBeFocused();
    await expect(page.locator('#mmode-status')).toHaveText('M a la cadencia de B. Congela para revisar con el cine.');
    await page.locator('#mmode-place').click();
    // Coordenada obtenida del marco real, no de una imagen o geometría paralela.
    const point = await page.evaluate(() => {
      const sim = window.__lusTest!.sim();
      const r = sim.renderer;
      const p = r.beamToPixel(sim.transducer.halfSector * 0.25, 40, sim.transducer);
      const box = document.getElementById('sector-wrap')!.getBoundingClientRect();
      return { x: box.left + (p.x / r.canvas.width) * box.width, y: box.top + (p.y / r.canvas.height) * box.height };
    });
    await page.touchscreen.tap(Math.round(point.x), Math.round(point.y));
    await expect(page.locator('#mmode-place')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.__lusTest!.sim().pose)).toEqual(pose);
    await page.getByText('Ajuste fino de la línea', { exact: true }).click();
    await expect(page.locator('#mmode-note')).toBeVisible();
    await page.locator('#mmode-line').press('Home');
    await expect(page.locator('#mmode-line')).toHaveValue('-100');
    await page.locator('#mmode-line').press('End');
    await expect(page.locator('#mmode-line')).toHaveValue('100');
    await page.locator('#mmode-line').click();
    await acquired(page);
    const originalStart = await first(page);
    await page.locator('#quick-gain').click();
    await page.getByLabel('Ganancia', { exact: true }).press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect.poll(() => first(page), { timeout: 60_000 }).toBeGreaterThan(originalStart);
    const gainStart = await first(page);
    await page.locator('#settings-toggle').click();
    await page.getByRole('button', { name: 'Profunda', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
    await frame(page);
    expect(await first(page), 'una maniobra respiratoria continúa la misma línea temporal').toBe(gainStart);
    await page.getByText('Ajuste fino de la línea', { exact: true }).click();
    await expect(page.locator('#mmode-note')).toBeHidden();
  });
});

test('M móvil: los mandos caben de 320 a 720 px, congelar revisa B y M y apagar M vacía la franja', async ({ browser }, info) => {
  test.setTimeout(240_000);
  await onPhone(browser, info, async (page) => {
    for (const width of [320, 390, 720]) {
      await page.setViewportSize({ width, height: 844 });
      await frame(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const id of ['mmode-toggle', 'mmode-place', 'mmode-reset', 'mmode-duration']) {
        const box = (await page.locator(`#${id}`).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#freeze').click();
    await expect(page.locator('#mmode-status')).toHaveText('Imagen congelada. Revisa B y M con el cine.');
    const screenshot = info.outputPath('mmode-mobile.png');
    await page.locator('.center').screenshot({ path: screenshot });
    await info.attach('B más M a 390 px', { path: screenshot, contentType: 'image/png' });
    await page.locator('#freeze').click();
    await page.locator('#mmode-toggle').click();
    await expect(page.locator('#mmode-pane')).toBeHidden();
    await expect.poll(() => count(page), { timeout: 60_000 }).toBe(0);
  });
});

test('M: pérdida de GPU congelada descarta la franja y recupera adquisición viva', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await page.locator('#mmode-toggle').click();
  await acquired(page);
  await page.locator('#freeze').click();
  const before = await first(page);
  expect(errors).toEqual([]);
  await page.evaluate(() => {
    const r = window.__lusTest!.sim().renderer;
    const ext = r.gl.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('La prueba requiere WEBGL_lose_context');
    r.canvas.addEventListener('webglcontextlost', () => setTimeout(() => ext.restoreContext(), 500), { once: true });
    ext.loseContext();
  });
  await expect(page.locator('#live-chip')).toHaveText('En vivo', { timeout: 120_000 });
  await acquired(page);
  expect(await first(page)).toBeGreaterThan(before);
  await expect(page.locator('#mmode-place')).toBeEnabled();
  // Exactamente el aviso de la pérdida inyectada, sin admitir errores adicionales ni silenciamiento.
  expect(errors).toEqual(['[gpu] contexto WebGL perdido']);
});
