import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface ReviewExport {
  synthetic: boolean;
  containsRawSignal: boolean;
  acquisition: unknown;
  bmode: unknown;
  measurement: { distanceMm: number } | null;
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?e2e=1');
  await expect(page).toHaveTitle(/lus-sim/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().renderer.cineCount), { timeout: 120_000 }).toBeGreaterThan(5);
  return errors;
}

async function freeze(page: Page): Promise<void> {
  await page.locator('#freeze').click();
  await expect(page.locator('#review-tools')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#review-measure')).toBeEnabled();
}

async function mark(page: Page, touch: boolean): Promise<number> {
  await page.locator('#review-measure').click();
  await page.locator('#sector-wrap').scrollIntoViewIfNeeded();
  const points = await page.evaluate(() => {
    const s = window.__lusTest!.sim();
    const r = s.renderer;
    const box = document.getElementById('sector-wrap')!.getBoundingClientRect();
    const pixel = (depth: number) => {
      const p = r.beamToPixel(0, depth, s.transducer);
      return { x: box.left + (p.x / r.canvas.width) * box.width, y: box.top + (p.y / r.canvas.height) * box.height };
    };
    const a = pixel(20);
    const b = pixel(50);
    return { a: { x: Math.round(a.x), y: Math.round(a.y) }, b: { x: Math.round(b.x), y: Math.round(b.y) }, ppm: (b.y - a.y) / 30 };
  });
  for (const point of [points.a, points.b]) {
    if (touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
  }
  const expected = Math.hypot(points.b.x - points.a.x, points.b.y - points.a.y) / points.ppm;
  await expect.poll(async () => Number(await page.locator('#review-value').getAttribute('data-mm'))).toBeCloseTo(expected, 5);
  return expected;
}

test('revisión B: medida, historial y exportación local coherentes sin cambiar la adquisición', async ({ page }, info) => {
  test.setTimeout(240_000);
  const reviewRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/frozenReview-.*\.js/.test(request.url())) reviewRequests.push(request.url());
  });
  const errors = await boot(page);
  expect(reviewRequests).toHaveLength(0);
  // Un ajuste posterior hace distintos los datos vivos y los del primer cuadro del cine.
  await page.locator('#quick-gain').click();
  await page.getByLabel('Ganancia', { exact: true }).press('ArrowRight');
  await page.keyboard.press('Escape');
  await page.locator('#mmode-toggle').click();
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().renderer.mStrip.count), { timeout: 60_000 }).toBeGreaterThan(5);
  await freeze(page);
  expect(reviewRequests).toHaveLength(1);
  const before = await page.evaluate(() => {
    const s = window.__lusTest!.sim();
    return { acquisition: s.displayedAcquisition, bmode: s.displayed.bmode, clock: s.physiology.clock.t, pose: s.pose };
  });
  const host = (await page.locator('#sector-wrap').boundingBox())!;
  const bar = (await page.locator('#cine-bar').boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(host.y + host.height - 1);
  const expected = await mark(page, false);
  await page.screenshot({ path: info.outputPath('mmode-review-desktop.png') });
  const jsonDownload = page.waitForEvent('download');
  await page.locator('#review-json').click();
  const json = await jsonDownload;
  const data = JSON.parse(await readFile(await json.path(), 'utf8')) as ReviewExport;
  expect(data.synthetic).toBe(true);
  expect(data.containsRawSignal).toBe(false);
  expect(data.acquisition).toEqual(before.acquisition);
  expect(data.bmode).toEqual(before.bmode);
  expect(data.measurement).not.toBeNull();
  if (!data.measurement) throw new Error('La exportación perdió el calibre confirmado');
  expect(data.measurement.distanceMm).toBeCloseTo(expected, 5);
  const dimensions = await page
    .locator('#gl')
    .evaluate((c) => ({ width: (c as HTMLCanvasElement).width, height: (c as HTMLCanvasElement).height }));
  const pngDownload = page.waitForEvent('download');
  await page.locator('#review-png').click();
  const png = await pngDownload;
  const bytes = await readFile(await png.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(dimensions.width);
  expect(bytes.readUInt32BE(20)).toBe(dimensions.height + 100);
  // Señal debajo del encabezado, excluyendo los ejes: una imagen negra con texto no pasa.
  const signal = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + base64;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(Math.floor(c.width * 0.4), 110, Math.floor(c.width * 0.2), c.height - 130).data;
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 30 && pixels[i] === pixels[i + 1] && pixels[i] === pixels[i + 2]) visible++;
    return visible;
  }, bytes.toString('base64'));
  expect(signal).toBeGreaterThan(20);
  expect(await page.evaluate(() => ({ clock: window.__lusTest!.sim().physiology.clock.t, pose: window.__lusTest!.sim().pose }))).toEqual({
    clock: before.clock,
    pose: before.pose,
  });
  await page.locator('#cine').press('Home');
  await expect(page.locator('#review-value')).toHaveAttribute('data-mm', '');
  await expect(page.locator('#review-help')).toContainText('borrada');
  const historic = await page.evaluate(() => {
    const s = window.__lusTest!.sim();
    return { acquisition: s.displayedAcquisition, bmode: s.displayed.bmode, liveGain: s.bmode.gainDb };
  });
  expect(historic.bmode.gainDb).not.toBe(historic.liveGain);
  const historicalDownload = page.waitForEvent('download');
  await page.locator('#review-json').click();
  const historicalJson = await historicalDownload;
  const historicalData = JSON.parse(await readFile(await historicalJson.path(), 'utf8')) as ReviewExport;
  expect(historicalData.acquisition).toEqual(historic.acquisition);
  expect(historicalData.bmode).toEqual(historic.bmode);
  expect(historicalData.measurement).toBeNull();
  expect(errors).toEqual([]);
});

test('revisión táctil y teclado: geometría estable al rotar y sin mediciones sobre otro cuadro', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const errors = await boot(page);
    await freeze(page);
    const expected = await mark(page, true);
    for (const width of [720, 320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(Number(await page.locator('#review-value').getAttribute('data-mm'))).toBeCloseTo(expected, 5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const id of ['review-measure', 'review-png', 'review-json']) {
        const box = (await page.locator(`#${id}`).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.locator('#review-b').click();
    await expect(page.locator('#sector-wrap')).toBeFocused();
    const selected = await page.locator('#cine').inputValue();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await page.locator('#cine').inputValue()).toBe(selected);
    expect(Number(await page.locator('#review-value').getAttribute('data-mm'))).toBeGreaterThan(expected);
    await page.locator('.center').screenshot({ path: info.outputPath('mmode-review-mobile.png') });
    await page.locator('#review-clear').click();
    await expect(page.locator('#review-measure')).toBeFocused();
    // Recorrido completo sin puntero: dos extremos confirmados por Enter.
    await page.locator('#review-measure').press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Enter');
    expect(Number(await page.locator('#review-value').getAttribute('data-mm'))).toBeGreaterThan(0);
    await page.locator('#freeze').click();
    await expect(page.locator('#review-tools')).toBeHidden();
    await freeze(page);
    await expect(page.locator('#review-value')).toHaveAttribute('data-mm', '');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
