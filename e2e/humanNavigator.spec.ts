import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?e2e=1');
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
  const toggle = page.locator('#navigator-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(page.locator('#thorax-navigator')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  return errors;
}
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const stats = (page: Page) => page.locator('#thorax-navigator').evaluate((e) => ({ ...(e as HTMLElement).dataset }));

test('humano procedural: vistas, presupuesto, contacto histórico y cámara sin reconstrucciones', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await boot(page);
  await page.locator('#freeze').click();
  await settle(page);
  const nav = page.locator('#thorax-navigator');
  const initial = await stats(page);
  expect(Number(initial.triangles)).toBeLessThanOrEqual(18_000);
  expect(Number(initial.calls)).toBeLessThanOrEqual(16);
  expect(Number(initial.warpedVertices)).toBeGreaterThan(0);
  const frame = await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition);
  expect(initial.frameFace).toBe(frame.frame.face.join(','));
  const b = await page.locator('#gl').screenshot();
  await page.screenshot({ path: info.outputPath('mmode-human-desktop.png') });
  for (const view of ['Anterior', 'Lateral', 'Posterior', 'Centrar modelo']) {
    await nav.getByRole('button', { name: view, exact: true }).click();
    await settle(page);
    const now = await stats(page);
    expect(now.bodyUpdates).toBe(initial.bodyUpdates);
    expect(now.cableUpdates).toBe(initial.cableUpdates);
    expect(now.geometries).toBe(initial.geometries);
    expect((await page.locator('#gl').screenshot()).equals(b)).toBe(true);
    expect(await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition)).toEqual(frame);
    await page.locator('.thorax-canvas').screenshot({ path: info.outputPath(`mmode-human-${view.split(' ')[0]}.png`) });
  }
  const idle = await stats(page);
  await settle(page);
  await settle(page);
  expect((await stats(page)).renders).toBe(idle.renders);
  await nav.getByRole('button', { name: 'Costillas', exact: true }).click();
  await settle(page);
  expect(Number((await stats(page)).triangles)).toBeLessThanOrEqual(50_000);
  expect(Number((await stats(page)).calls)).toBeLessThanOrEqual(44);
  await page.locator('.thorax-canvas').screenshot({ path: info.outputPath('mmode-human-ribs.png') });
  await nav.getByRole('button', { name: 'Costillas', exact: true }).click();
  // Cualquier nueva adquisición mantiene el contrato del marco efectivo mostrado.
  await page.locator('#freeze').click();
  await nav.locator('.thorax-fine > summary').click();
  await nav.getByRole('button', { name: 'Hacia la izquierda', exact: true }).click();
  await nav.getByRole('button', { name: 'Craneal', exact: true }).click();
  await expect.poll(async () => Number((await stats(page)).bodyUpdates)).toBeGreaterThan(Number(initial.bodyUpdates));
  await page.locator('#freeze').click();
  await settle(page);
  const cine = page.locator('#cine');
  await expect(cine).toBeVisible();
  await cine.focus();
  await cine.press('Home');
  await settle(page);
  const old = await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.frame.face.join(','));
  expect((await stats(page)).frameFace).toBe(old);
  // Órbita por el fondo descubre el lateral contrario sin mutar la adquisición.
  await nav.getByRole('button', { name: 'Anterior', exact: true }).click();
  const box = (await page.locator('.thorax-canvas').boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 208, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await settle(page);
  await page.locator('.thorax-canvas').screenshot({ path: info.outputPath('mmode-human-lateral-opuesto.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await nav.getByRole('button', { name: 'Centrar modelo' }).click();
  await settle(page);
  await page.screenshot({ path: info.outputPath('mmode-human-laptop.png') });
  console.log('HUMAN_NAVIGATOR', JSON.stringify({ initial, final: await stats(page) }));
  expect(errors).toEqual([]);
});

test('humano táctil: cuerpo de contexto no seleccionable y navegador sin desbordamiento', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    const errors = await boot(page);
    const toggle = page.locator('#navigator-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    const nav = page.locator('#thorax-navigator');
    await nav.getByRole('button', { name: 'Anterior', exact: true }).click();
    await settle(page);
    await page.locator('.thorax-canvas').scrollIntoViewIfNeeded();
    const box = (await page.locator('.thorax-canvas').boundingBox())!;
    const before = await page.evaluate(() => ({ ...window.__lusTest!.sim().pose }));
    // Centro cefálico en el encuadre ortográfico, región no acústica: gesto real, no setter del motor.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.13);
    await settle(page);
    expect(await page.evaluate(() => window.__lusTest!.sim().pose)).toEqual(before);
    await expect(nav.locator('.thorax-caption')).toContainText('Zona no explorable');
    await page.locator('#freeze').click();
    await settle(page);
    for (const width of [390, 320, 720]) {
      await page.setViewportSize({ width, height: 844 });
      await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.thorax-canvas').screenshot({ path: info.outputPath(`mmode-human-mobile-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.thorax-canvas').scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: info.outputPath('mmode-human-mobile-screen.png') });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
