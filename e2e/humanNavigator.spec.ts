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
  // en vivo, con la sonda quieta, la mano del operador mueve el marco en cada cuadro (decisión 39), pero el navegador dibuja
  // la sonda de la pose: no rehace el cable ni el sector
  const live = await stats(page);
  for (let i = 0; i < 6; i++) await settle(page);
  expect((await stats(page)).cableUpdates).toBe(live.cableUpdates);
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

/**
 * Lus-sim (decisión 48): el punto de la piel del paciente (mm) en la pantalla, con la cámara ortográfica del navegador
 * (`ui/thorax/index.ts`: mira a (0, 0,13 m, 0) desde el acimut az y la elevación el; medio alto max(0,44, 0,305/aspecto)).
 */
function project(p: [number, number, number], az: number, el: number, box: { x: number; y: number; width: number; height: number }) {
  const v = [p[0] / 1000, p[2] / 1000 - 0.13, p[1] / 1000];
  const forward = [-Math.cos(el) * Math.cos(az), -Math.sin(el), -Math.cos(el) * Math.sin(az)];
  const up = [-Math.sin(el) * Math.cos(az), Math.cos(el), -Math.sin(el) * Math.sin(az)];
  const right = [forward[1] * up[2] - forward[2] * up[1], forward[2] * up[0] - forward[0] * up[2], forward[0] * up[1] - forward[1] * up[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const half = Math.max(0.44, 0.305 / (box.width / box.height));
  const scale = box.height / (2 * half);
  return { x: box.x + box.width / 2 + dot(v, right) * scale, y: box.y + box.height / 2 - dot(v, up) * scale };
}

test('brazos arriba (decisión 48): la sonda sube por la axilar media hasta la axila y por la fosa supraclavicular', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await boot(page);
  const nav = page.locator('#thorax-navigator');
  const canvas = page.locator('.thorax-canvas');
  const torso = await page.evaluate(() => ({ a: window.__lusTest!.sim().scene.torso.a, b: window.__lusTest!.sim().scene.torso.b }));
  const drag = async (az: number, points: Array<[number, number, number]>) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const screen = points.map((p) => project(p, az, 0.1, box));
    await page.mouse.move(screen[0].x, screen[0].y);
    await page.mouse.down();
    for (const s of screen.slice(1)) {
      await page.mouse.move(s.x, s.y);
      await settle(page);
    }
    await page.mouse.up();
    return page.evaluate(() => ({ ...window.__lusTest!.sim().pose }));
  };
  // la axila derecha, de frente (la vista lateral del lado de la sonda): de la 5.ª costilla a 2 mm del tope, por la axilar media
  await nav.getByRole('button', { name: 'Lateral', exact: true }).click();
  await settle(page);
  const axilla = await drag(
    Math.PI,
    Array.from({ length: 25 }, (_, i) => [-torso.a, 0, 60 + (163 * i) / 24] as [number, number, number]),
  );
  expect(Math.abs(axilla.phi - Math.PI), JSON.stringify(axilla)).toBeLessThan(0.05);
  // por encima de la 1.ª costilla de la axilar media (z 172,8): con los brazos a los lados, el brazo tapaba desde z −63
  expect(axilla.z, JSON.stringify(axilla)).toBeGreaterThan(215);
  await expect(nav.locator('.thorax-caption')).not.toContainText('Zona no explorable');
  await canvas.screenshot({ path: info.outputPath('brazos-axila.png') });
  // la fosa supraclavicular derecha, de frente: a 70 mm de la línea media, de la clavícula al tope (antes, z ≤ 200)
  await nav.getByRole('button', { name: 'Anterior', exact: true }).click();
  await settle(page);
  const y = torso.b * Math.sqrt(1 - (70 / torso.a) ** 2);
  const fossa = await drag(
    Math.PI / 2,
    Array.from({ length: 15 }, (_, i) => [-70, y, 150 + (73 * i) / 14] as [number, number, number]),
  );
  expect(fossa.z, JSON.stringify(fossa)).toBeGreaterThan(215);
  expect(fossa.z).toBeLessThanOrEqual(225);
  await expect(nav.locator('.thorax-caption')).not.toContainText('Zona no explorable');
  await canvas.screenshot({ path: info.outputPath('brazos-fosa.png') });
  expect(errors).toEqual([]);
});
