import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/**
 * Humo de la aplicación (paso B2b, decisión 13; adaptado del de VExUS): lo que ninguna prueba unitaria puede ver —
 * que el build arranca en el navegador, que WebGL2 dibuja cuadros con el reloj en marcha, que la interfaz está
 * cableada (equipo, congelar, sonda y puntos de partida), que sobrevive a la pérdida del contexto WebGL y que no hay
 * errores de consola. Con SwiftShader un cuadro puede tardar segundos: se espera a que el reloj avance en vez de
 * fijar un plazo por cuadro.
 */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?e2e=1');
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  // los ganchos de prueba se cargan de forma diferida (import dinámico)
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  return errors;
}
const tOf = (s: string | null) => Number(/t ([\d.]+) s/.exec(s ?? '')?.[1] ?? 0);

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
  // el lienzo tiene imagen: la línea pleural blanca y la pared encima (no un rectángulo negro)
  const grey = await page.evaluate(() => {
    const d = window.__lusTest!.sim().renderer.readDisplay();
    let max = 0;
    let lit = 0;
    for (const g of d.gray) {
      if (g > max) max = g;
      if (g > 40) lit++;
    }
    return { max, litFraction: lit / d.gray.length };
  });
  expect(grey.max, JSON.stringify(grey)).toBeGreaterThanOrEqual(250);
  expect(grey.litFraction, JSON.stringify(grey)).toBeGreaterThan(0.05);
  expect(errors).toEqual([]);
});

test('los mandos del equipo y congelar: el teclado y la consola cambian la imagen y el HUD lo dice', async ({ page }) => {
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
  // Espacio congela (el reloj se detiene) y vuelve a soltar
  await page.keyboard.press(' ');
  await expect(page.locator('#live-chip')).toHaveText('FREEZE');
  await expect(page.locator('#hud-tl')).toContainText('congelada');
  const frozenT = await page.evaluate(() => window.__lusTest!.sim().physiology.clock.t);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__lusTest!.sim().physiology.clock.t)).toBe(frozenT);
  // el cine (decisión 80 de VExUS): ← recorre los cuadros guardados hacia atrás
  await expect(page.locator('#cine-bar')).toBeVisible();
  await expect(page.locator('#cine-time')).toHaveText('0,00 s');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#cine-time')).toHaveText(/^−0,\d\d s$/);
  // con la imagen congelada el HUD dice lo que se ve: cambiar la profundidad no cambia el cuadro mostrado
  await page.keyboard.press(']');
  await expect(hud).toContainText('13 cm');
  await page.getByRole('button', { name: 'Congelar' }).click();
  await expect(page.locator('#live-chip')).toHaveText('LIVE');
  await expect(page.locator('#cine-bar')).toBeHidden();
  await expect(hud).toContainText('14 cm');
  // la respiración: apnea en la consola
  await page.getByRole('button', { name: 'Apnea espiratoria' }).click();
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().patient.respiratoryPattern)).toBe('apnea-expiratory');
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

test('sobrevive a la pérdida del contexto WebGL: avisa, se recupera y el reloj sigue', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const gl = (document.getElementById('gl') as HTMLCanvasElement).getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __lc: WEBGL_lose_context }).__lc = ext;
    ext.loseContext();
  });
  await expect(page.locator('.banner')).toContainText('Contexto GPU perdido', { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __lc: WEBGL_lose_context }).__lc.restoreContext());
  await expect(page.locator('.banner')).toHaveCount(0, { timeout: 120_000 });
  const t1 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 60_000 }).toBeGreaterThan(t1);
  // el renderizador nuevo dibuja: la línea pleural vuelve a estar en el lienzo
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const d = window.__lusTest!.sim().renderer.readDisplay();
          let max = 0;
          for (const g of d.gray) if (g > max) max = g;
          return max;
        }),
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(250);
  expect(errors).toEqual([]);
});
