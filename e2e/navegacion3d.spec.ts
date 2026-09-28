import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// Playwright 1.63.0 ya incluye y exporta pngjs para sus comparaciones de capturas.
// Decodificar en Node evita una segunda tarea asíncrona en el renderer ocupado por SwiftShader.
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer): { data: Buffer } } };
};

/** Los mandos y gestos recorren la UI real. __lusTest solo observa; no coloca la sonda ni avanza el reloj. */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning' && /WebGL: INVALID|GL_INVALID/.test(message.text())) errors.push(`warning: ${message.text()}`);
  });
  await page.goto('/?e2e=1');
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  await expect(page.locator('#thorax-navigator')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(page.locator('.thorax-canvas')).toBeVisible();
  return errors;
}

const pose = (page: Page) => page.evaluate(() => ({ ...window.__lusTest!.sim().pose }));
const twoFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function canvasBox(page: Page) {
  const canvas = page.locator('.thorax-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box, 'el navegador debe tener un área de interacción visible').not.toBeNull();
  return box!;
}

/** Humo visual, no métrica clínica: distingue un modelo con luces de un canvas uniforme tras restaurar WebGL. */
async function navigatorContrast(page: Page): Promise<number> {
  const { data: pixels } = PNG.sync.read(await page.locator('.thorax-canvas').screenshot());
  let low = 255;
  let high = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const grey = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    low = Math.min(low, grey);
    high = Math.max(high, grey);
  }
  return high - low;
}

test('navegador 3D: botones, arrastre sobre el tórax, orientación y cámara independiente al congelar', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  const navigator = page.locator('#thorax-navigator');
  const initial = await pose(page);
  await navigator.locator('.thorax-fine > summary').click();
  await navigator.getByRole('button', { name: 'Craneal', exact: true }).click();
  await expect.poll(async () => (await pose(page)).z).toBeCloseTo(initial.z + 5, 8);
  await navigator.getByRole('button', { name: 'Girar +', exact: true }).click();
  await expect.poll(async () => (await pose(page)).yaw).toBeGreaterThan(initial.yaw + 0.05);

  await navigator.getByRole('button', { name: 'Anterior', exact: true }).click();
  await navigator.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(navigator.getByRole('button', { name: 'Mover', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // En el encuadre anterior, el centro del canvas cae sobre la piel. Las coordenadas proceden del DOM,
  // sin acceder al raycaster ni inyectar una pose. Se mide el arrastre desde la posición del pointerdown.
  let box = await canvasBox(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const down = await pose(page);
  await page.mouse.move(x + box.width * 0.08, y - box.height * 0.06, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await pose(page)).phi).toBeLessThan(down.phi - 0.02);
  await expect.poll(async () => (await pose(page)).z).toBeGreaterThan(down.z + 2);

  await navigator.getByRole('button', { name: 'Orientar', exact: true }).click();
  await expect(navigator.getByRole('button', { name: 'Orientar', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const beforeOrientation = await pose(page);
  box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 - 14, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await pose(page)).rock).toBeGreaterThan(beforeOrientation.rock + 0.04);
  await expect.poll(async () => (await pose(page)).tilt).toBeLessThan(beforeOrientation.tilt - 0.03);

  await page.locator('#freeze').click();
  await expect(page.locator('#live-chip')).toHaveText('Congelada');
  await expect(navigator.getByRole('button', { name: 'Craneal', exact: true })).toBeDisabled();
  await expect(navigator.getByRole('button', { name: 'Girar +', exact: true })).toBeDisabled();
  await expect(navigator.locator('.thorax-caption')).toContainText('cuadro congelado');
  const frozen = await pose(page);
  const frozenTime = await page.evaluate(() => window.__lusTest!.sim().physiology.clock.t);
  await navigator.getByRole('button', { name: 'Anterior', exact: true }).click();
  await twoFrames(page);
  const front = await page.locator('.thorax-canvas').screenshot();
  await navigator.getByRole('button', { name: 'Posterior', exact: true }).click();
  await twoFrames(page);
  const back = await page.locator('.thorax-canvas').screenshot();
  expect(back.equals(front), 'cambiar la cámara debe redibujar el modelo incluso con la imagen congelada').toBe(false);

  // Un arrastre congelado permite inspeccionar el cuerpo, pero no cambia el transductor ni el tiempo.
  box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 12, { steps: 3 });
  await page.mouse.up();
  await twoFrames(page);
  expect(await pose(page)).toEqual(frozen);
  expect(await page.evaluate(() => window.__lusTest!.sim().physiology.clock.t)).toBe(frozenTime);
  await page.locator('#freeze').click();
  await expect(navigator.getByRole('button', { name: 'Craneal', exact: true })).toBeEnabled();
  await navigator.getByRole('button', { name: 'Craneal', exact: true }).click();
  await expect.poll(async () => (await pose(page)).z).toBeCloseTo(frozen.z + 5, 8);
  expect(errors).toEqual([]);
});

test('navegador 3D: adquisición con contexto perdido y recuperación, con inyección en pausa', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  const navigator = page.locator('#thorax-navigator');
  // Como en el humo de WebGL, se preparan las inyecciones de pérdida/restauración y capturas en pausa.
  // En CI con SwiftShader, la evaluación posterior a la captura en vivo agotó el plazo; no se conoce
  // el punto interno del bloqueo. Se comprueba adquisición durante la pérdida, no su inyección en vivo.
  await page.locator('#freeze').click();
  await expect(page.locator('#live-chip')).toHaveText('Congelada');
  await twoFrames(page);
  const extension = await page.locator('.thorax-canvas').evaluateHandle((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    if (!gl) throw new Error('El navegador listo no tiene contexto WebGL2');
    return gl.getExtension('WEBGL_lose_context');
  });
  const supported = await extension.evaluate((ext) => ext !== null);
  if (!supported) await extension.dispose();
  test.skip(!supported, 'Este navegador no ofrece WEBGL_lose_context; los demás flujos 3D se prueban igualmente.');
  const ultrasoundRenderer = await page.evaluateHandle(() => window.__lusTest!.sim().renderer);
  const before = await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.sample.t);
  await test.step('Captura 3D antes de perder el contexto', async () => {
    expect(await navigatorContrast(page)).toBeGreaterThan(60);
  });
  try {
    // Solo se provoca la pérdida del canvas 3D; la imagen #gl conserva su contexto y su renderizador.
    await test.step('Solicitar pérdida del contexto 3D en pausa', () => extension.evaluate((ext) => ext!.loseContext()));
    await expect(navigator).toHaveAttribute('data-ready', 'lost', { timeout: 30_000 });
    await expect(navigator.locator('.thorax-caption')).toContainText('La imagen ecográfica continúa');
    await expect(page.locator('#live-chip')).toHaveText('Congelada');
    expect(await page.locator('#gl').evaluate((element) => (element as HTMLCanvasElement).getContext('webgl2')!.isContextLost())).toBe(
      false,
    );
    expect(await ultrasoundRenderer.evaluate((renderer) => window.__lusTest!.sim().renderer === renderer)).toBe(true);
    expect(await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.sample.t)).toBe(before);

    await page.locator('#freeze').click();
    await expect(page.locator('#live-chip')).toHaveText('En vivo');
    await expect(navigator).toHaveAttribute('data-ready', 'lost');
    const duringLoss = await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.sample.t);
    await expect
      .poll(() => page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.sample.t), { timeout: 60_000 })
      .toBeGreaterThan(duringLoss);
    await expect(navigator).toHaveAttribute('data-ready', 'lost');
    expect(
      await ultrasoundRenderer.evaluate((renderer) => ({
        same: window.__lusTest!.sim().renderer === renderer,
        lost: (document.getElementById('gl') as HTMLCanvasElement).getContext('webgl2')!.isContextLost(),
      })),
    ).toEqual({ same: true, lost: false });

    await page.locator('#freeze').click();
    await expect(page.locator('#live-chip')).toHaveText('Congelada');
    await twoFrames(page);
    await test.step('Solicitar restauración del contexto 3D en pausa', () => extension.evaluate((ext) => ext!.restoreContext()));
    await expect(navigator).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await twoFrames(page);
    await test.step('Captura 3D después de restaurar el contexto', async () => {
      expect(await navigatorContrast(page), 'el contexto restaurado debe volver a dibujar el tórax').toBeGreaterThan(60);
    });
    expect(await ultrasoundRenderer.evaluate((renderer) => window.__lusTest!.sim().renderer === renderer)).toBe(true);
    await page.locator('#freeze').click();
    await expect(page.locator('#live-chip')).toHaveText('En vivo');
    const restored = await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.sample.t);
    await expect
      .poll(() => page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.sample.t), { timeout: 60_000 })
      .toBeGreaterThan(restored);
    expect(
      await ultrasoundRenderer.evaluate((renderer) => ({
        same: window.__lusTest!.sim().renderer === renderer,
        lost: (document.getElementById('gl') as HTMLCanvasElement).getContext('webgl2')!.isContextLost(),
      })),
    ).toEqual({ same: true, lost: false });
    await navigator.locator('.thorax-fine > summary').click();
    const previous = await pose(page);
    await navigator.getByRole('button', { name: 'Craneal', exact: true }).click();
    await expect.poll(async () => (await pose(page)).z).toBeCloseTo(previous.z + 5, 8);
    expect(errors).toEqual(['console: [ui] Se perdió el contexto WebGL del navegador del tórax']);
  } finally {
    await extension.dispose();
    await ultrasoundRenderer.dispose();
  }
});
