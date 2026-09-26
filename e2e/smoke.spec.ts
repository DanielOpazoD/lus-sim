import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/**
 * Humo de la aplicación (paso B2b, decisión 13; adaptado del de VExUS): lo que ninguna prueba unitaria puede ver —
 * que el build arranca en el navegador, que WebGL2 dibuja cuadros con el reloj en marcha, que la interfaz está
 * cableada (equipo, congelar con el cine, sonda y puntos de partida, paciente e informe), que sobrevive a la pérdida
 * del contexto WebGL y que no hay errores de consola (la aplicación manda allí cada entrada de su registro de errores).
 * La imagen se mira en la pantalla, no en un búfer de la GPU: una captura del lienzo, como la vería el alumno. Con
 * SwiftShader un cuadro puede tardar segundos: se espera a que el reloj avance en vez de fijar un plazo por cuadro.
 */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    // un uso inválido de WebGL es un aviso, no un error, en la consola de Chromium
    if (m.type() === 'warning' && /WebGL: INVALID|GL_INVALID/.test(m.text())) errors.push(`warning: ${m.text()}`);
  });
  await page.goto('/?e2e=1');
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  // los ganchos de prueba se cargan de forma diferida (import dinámico)
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  return errors;
}
const tOf = (s: string | null) => Number(/t ([\d.]+) s/.exec(s ?? '')?.[1] ?? 0);
/** Espera dos cuadros de la página: el bucle de la aplicación (también en `requestAnimationFrame`) ya pintó uno. */
const twoFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/**
 * Lo que se ve en el lienzo de la imagen: una captura de su recuadro en la pantalla (con la superposición y el HUD
 * encima, que son finos y grises), decodificada en la página. `max` es el gris más brillante (la línea pleural
 * satura, 255; el HUD y la regla no pasan de ~200) y `lit`, la fracción de píxeles con gris > 40.
 */
async function screen(page: Page): Promise<{ max: number; lit: number; mean: number; png: string }> {
  const png = (await page.locator('#gl').screenshot()).toString('base64');
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let max = 0;
    let lit = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (g > max) max = g;
      if (g > 40) lit++;
      sum += g;
    }
    const n = d.length / 4;
    return { max, lit: lit / n, mean: sum / n };
  }, png);
  return { ...stats, png };
}

test('arranca, dibuja cuadros con el reloj en marcha, se presenta y avisa de que no es un dispositivo médico', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await expect(page).toHaveTitle(/lus-sim/);
  await expect(page.getByRole('heading', { name: 'lus-sim' })).toBeVisible();
  await expect(page.getByText('No es un dispositivo médico')).toBeVisible();
  await expect(page.getByTestId('build')).toContainText(`v${version}`);
  // la imagen es la del preajuste pulmonar: 12 cm y la frecuencia del transductor en el HUD
  await expect(page.locator('#hud-tr')).toContainText('12 cm · 3,5 MHz');
  const t1 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 60_000 }).toBeGreaterThan(t1);
  // en la pantalla hay imagen: la línea pleural saturada y la pared y la neblina encendidas (no un rectángulo negro)
  const s = await screen(page);
  const tag = JSON.stringify({ max: s.max, lit: s.lit, mean: s.mean });
  expect(s.max, tag).toBeGreaterThanOrEqual(250);
  expect(s.lit, tag).toBeGreaterThan(0.05);
  expect(errors).toEqual([]);
});

test('los mandos del equipo y congelar: el HUD dice lo que se ve, el cine recorre cuadros y la sonda no se mueve', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  const hud = page.locator('#hud-tr');
  await expect(hud).toContainText('12 cm');
  await page.locator('#sector-wrap').click({ position: { x: 5, y: 5 } }); // foco en la página, no en un control
  await page.keyboard.press(']');
  await expect(hud).toContainText('13 cm');
  await page.keyboard.press('-');
  await expect(hud).toContainText('G -2 dB');
  // la consola: el deslizador de la profundidad sigue al equipo
  await expect(page.getByLabel('Profundidad')).toHaveValue('130');
  // Espacio congela (el reloj se detiene)
  await page.keyboard.press(' ');
  await expect(page.locator('#live-chip')).toHaveText('FREEZE');
  await expect(page.locator('#hud-tl')).toContainText('congelada');
  const frozenT = await page.evaluate(() => window.__lusTest!.sim().physiology.clock.t);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__lusTest!.sim().physiology.clock.t)).toBe(frozenT);
  // el cine (decisión 80 de VExUS): ← dibuja cuadros anteriores (la imagen de la pantalla cambia)
  await expect(page.locator('#cine-bar')).toBeVisible();
  await twoFrames(page);
  const last = await screen(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#cine-time')).toHaveText(/^−0,\d\d s$/);
  await twoFrames(page);
  const older = await screen(page);
  expect(older.png, 'el cuadro del cine no se dibujó').not.toBe(last.png);
  expect(older.max).toBeGreaterThanOrEqual(250);
  // con la imagen congelada el HUD dice lo que se ve: cambiar la profundidad no cambia el cuadro mostrado
  await page.keyboard.press(']');
  await twoFrames(page);
  await twoFrames(page);
  await expect(hud).toContainText('13 cm');
  await expect(hud).not.toContainText('14 cm');
  // cambiar el tamaño de la ventana congelada vuelve a dibujar el cuadro (no deja el lienzo negro)
  await page.setViewportSize({ width: 1100, height: 700 });
  await twoFrames(page);
  await twoFrames(page);
  const resized = await screen(page);
  expect(resized.max, 'lienzo negro tras cambiar el tamaño con la imagen congelada').toBeGreaterThanOrEqual(250);
  // la sonda no se mueve con la imagen congelada: ni arrastrando, ni con sus mandos, ni con una tarjeta
  const pose = () => page.evaluate(() => window.__lusTest!.sim().pose);
  const p0 = await pose();
  const box = (await page.locator('#sector-wrap').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 - 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel('Rotación')).toBeDisabled();
  await expect(page.locator('[data-start-point="plaps"]')).toBeDisabled();
  expect(await pose()).toEqual(p0);
  // descongelar: en vivo con el equipo que se cambió mientras tanto
  await page.getByRole('button', { name: 'Congelar' }).click();
  await expect(page.locator('#live-chip')).toHaveText('LIVE');
  await expect(page.locator('#cine-bar')).toBeHidden();
  await expect(hud).toContainText('14 cm');
  await expect(page.getByLabel('Rotación')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('la sonda: arrastrar sobre la imagen la desliza y una tarjeta la lleva, deslizándose, a su punto de partida', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  const pose = () => page.evaluate(() => window.__lusTest!.sim().pose);
  const p0 = await pose();
  const box = (await page.locator('#sector-wrap').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 - 30, { steps: 4 });
  await page.mouse.up();
  const p1 = await pose();
  expect(p1.phi).toBeLessThan(p0.phi); // a la derecha de la pantalla
  expect(p1.z).toBeGreaterThan(p0.z); // hacia arriba
  const card = page.locator('[data-start-point="plaps"]');
  await card.click();
  await expect(card).toHaveAttribute('aria-current', 'true');
  // llega deslizándose (≈ 1 s con la constante de tiempo de 0,3 s del animador): el punto PLAPS está a más de 12 cm
  await expect.poll(async () => (await pose()).phi, { timeout: 60_000 }).toBeGreaterThan(1.14 * Math.PI);
  expect(errors).toEqual([]);
});

test('«Reiniciar paciente» vuelve a la respiración de su definición y el informe técnico se descarga', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await page.getByRole('button', { name: 'Apnea espiratoria' }).click();
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().patient.respiratoryPattern)).toBe('apnea-expiratory');
  await page.evaluate(() => ((window.__lusTest!.sim() as unknown as { mark?: number }).mark = 1));
  await page.getByRole('button', { name: 'Reiniciar paciente' }).click();
  // un simulador nuevo, con el paciente de su definición (respiración tranquila) y la misma sonda
  await expect.poll(() => page.evaluate(() => (window.__lusTest!.sim() as unknown as { mark?: number }).mark ?? 0)).toBe(0);
  expect(await page.evaluate(() => window.__lusTest!.sim().patient.respiratoryPattern)).toBe('quiet');
  const t1 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 60_000 }).toBeGreaterThan(t1);
  // el informe técnico: un JSON con el formato, la versión y el equipo (sin datos del usuario)
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Informe técnico' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^lus-diagnostico-.*\.json$/);
  const report = JSON.parse(readFileSync(await d.path(), 'utf8')) as {
    format: string;
    version: string;
    equipment: { bmode: { depthMm: number } };
  };
  expect(report.format).toBe('lus-diagnostico/1');
  expect(report.version).toBe(version);
  expect(report.equipment.bmode.depthMm).toBe(120);
  expect(errors).toEqual([]);
});

test('sobrevive a la pérdida del contexto WebGL, también con la imagen congelada: avisa, se recupera en vivo y el reloj sigue', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await page.locator('#sector-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(' ');
  await expect(page.locator('#live-chip')).toHaveText('FREEZE');
  await page.evaluate(() => {
    const gl = (document.getElementById('gl') as HTMLCanvasElement).getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __lc: WEBGL_lose_context }).__lc = ext;
    ext.loseContext();
  });
  await expect(page.locator('.banner')).toContainText('Contexto GPU perdido', { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __lc: WEBGL_lose_context }).__lc.restoreContext());
  // la imagen congelada era del renderizador perdido: vuelve la imagen en vivo, y se dice
  await expect(page.locator('.banner')).toContainText('GPU recuperada', { timeout: 120_000 });
  await expect(page.locator('#live-chip')).toHaveText('LIVE');
  await expect(page.locator('.banner')).toHaveCount(0, { timeout: 30_000 });
  const t1 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 60_000 }).toBeGreaterThan(t1);
  // el renderizador nuevo dibuja: la línea pleural vuelve a la pantalla
  await expect.poll(async () => (await screen(page)).max, { timeout: 60_000 }).toBeGreaterThanOrEqual(250);
  // el registro de errores dice la pérdida (en la consola, con su origen), y nada más
  expect(errors).toEqual(['console: [gpu] contexto WebGL perdido']);
});
