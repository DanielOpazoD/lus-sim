import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// Playwright 1.63.0 incluye y exporta pngjs (como en e2e/navegacion3d.spec.ts): la captura se decodifica en Node
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer): { data: Buffer } } };
};

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
/**
 * La línea pleural en la pantalla: casi blanca y por encima del HUD y la regla (~200). Gris 243–249 medido con el preajuste
 * de entonces; con R_t 0,1 (decisión 35), 227 tras bajar 2 dB la ganancia del preajuste (GPU real, 02-10-2026). El pico
 * de la línea pleural del banco de fidelidad no cambia con R_t (217/197/225 en los tres puntos); el máximo de la pantalla es
 * el de todo el cuadro.
 */
const PLEURA_GREY = 220;
/** Espera dos cuadros de la página: el bucle de la aplicación (también en `requestAnimationFrame`) ya pintó uno. */
const twoFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/**
 * Lo que se ve en el lienzo de la imagen: una captura de su recuadro en la pantalla (con la superposición y el HUD
 * encima, que son finos y grises). `max` es el gris más brillante (la línea pleural; el HUD y la regla no pasan de ~200) y
 * `lit`, la fracción de píxeles con gris > 40. lus-sim (decisión 20): con el preajuste pulmonar la línea pleural no satura
 * (consenso: Demi 2023) y queda a 1–2 dB del blanco, gris 243–249. La captura se decodifica en Node y no en la página
 * (decisión 30): en el CI, con la imagen en vivo, decodificarla en la página (una imagen y un lienzo 2D que la GPU de
 * SwiftShader, ocupada con los cuadros, tiene que devolver) tarda 19–41 s, y en Node 0,02 s.
 */
async function screen(page: Page): Promise<{ max: number; lit: number; mean: number; png: string }> {
  const buf = await page.locator('#gl').screenshot();
  const d = PNG.sync.read(buf).data;
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
  return { max, lit: lit / n, mean: sum / n, png: buf.toString('base64') };
}

test('arranca, dibuja cuadros con el reloj en marcha, se presenta y avisa de que no es un dispositivo médico', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await expect(page).toHaveTitle(/lus-sim/);
  await expect(page.getByRole('heading', { name: 'lus-sim' })).toBeVisible();
  await expect(page.getByText('No es un dispositivo médico')).toBeVisible();
  await expect(page.getByTestId('build')).toContainText(`v${version}`);
  // la imagen es la del preajuste pulmonar: 12 cm y la frecuencia del transductor en el HUD
  await expect(page.locator('#hud-tr')).toContainText('12,0 cm · 3,5 MHz');
  const t1 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 60_000 }).toBeGreaterThan(t1);
  // en la pantalla hay imagen (no un rectángulo negro): la línea pleural casi blanca pero sin saturar (el preajuste del
  // consenso, decisión 20: 243 medido) y la pared encendida (el 3 % de los píxeles sobre 40 de gris; con la línea pleural
  // saturada y 0 dB de ganancia, antes, más del 5 %)
  const s = await screen(page);
  const tag = JSON.stringify({ max: s.max, lit: s.lit, mean: s.mean });
  expect(s.max, tag).toBeGreaterThanOrEqual(PLEURA_GREY);
  expect(s.max, `línea pleural saturada (${tag})`).toBeLessThan(255);
  expect(s.lit, tag).toBeGreaterThan(0.02);
  expect(errors).toEqual([]);
});

test('los mandos del equipo y congelar: el HUD dice lo que se ve, el cine recorre cuadros y la sonda no se mueve', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  const hud = page.locator('#hud-tr');
  const initialGain = await page.evaluate(() => window.__lusTest!.sim().equipment.bmode.gainDb);
  await expect(hud).toContainText('12,0 cm');
  await page.locator('#sector-wrap').click({ position: { x: 5, y: 5 } }); // foco en la página, no en un control
  await page.keyboard.press(']');
  await expect(hud).toContainText('13,0 cm');
  await page.keyboard.press('-');
  // El atajo baja 2 dB desde el preajuste vigente; el HUD debe reflejar el nuevo valor.
  await expect(hud).toContainText(`G ${initialGain - 2} dB`);
  // la consola: el deslizador de la profundidad sigue al equipo
  await expect(page.getByLabel('Profundidad', { exact: true })).toHaveValue('130');
  // Espacio congela (el reloj se detiene)
  await page.keyboard.press(' ');
  await expect(page.locator('#live-chip')).toHaveText('Congelada');
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
  expect(older.max).toBeGreaterThanOrEqual(PLEURA_GREY);
  // congelada: ni el equipo ni el cuadro cambian por un atajo de adquisición
  await page.keyboard.press(']');
  await twoFrames(page);
  await twoFrames(page);
  await expect(hud).toContainText('13,0 cm');
  await expect(hud).not.toContainText('14,0 cm');
  // cambiar el tamaño de la ventana congelada vuelve a dibujar el cuadro (no deja el lienzo negro)
  await page.setViewportSize({ width: 1100, height: 700 });
  await twoFrames(page);
  await twoFrames(page);
  const resized = await screen(page);
  expect(resized.max, 'lienzo negro tras cambiar el tamaño con la imagen congelada').toBeGreaterThanOrEqual(PLEURA_GREY);
  // la sonda no se mueve con la imagen congelada: ni arrastrando, ni con sus mandos, ni con una tarjeta
  const pose = () => page.evaluate(() => window.__lusTest!.sim().pose);
  const p0 = await pose();
  const box = (await page.locator('#sector-wrap').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 - 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('[data-start-point="plaps"]')).toBeDisabled();
  expect(await pose()).toEqual(p0);
  // el diálogo permite consultar valores, con maniobras y ajustes deshabilitados
  await page.locator('#settings-toggle').click();
  await page.getByRole('button', { name: 'Sonda', exact: true }).click();
  await expect(page.getByLabel('Rotación', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Apnea espiratoria' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
  // reanudar conserva el equipo: el atajo no dejó un cambio pendiente
  await page.getByRole('button', { name: 'Reanudar' }).click();
  await expect(page.locator('#live-chip')).toHaveText('En vivo');
  await expect(page.locator('#cine-bar')).toBeHidden();
  await expect(hud).toContainText('13,0 cm');
  expect(await page.evaluate(() => window.__lusTest!.sim().bmode.depthMm)).toBe(130);
  await expect(page.getByLabel('Rotación', { exact: true })).toBeEnabled();
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

test('«Restablecer paciente» vuelve a la respiración de su definición y el informe técnico se descarga', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await page.locator('#settings-toggle').click();
  await page.getByRole('button', { name: 'Apnea espiratoria' }).click();
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().patient.respiratoryPattern)).toBe('apnea-expiratory');
  await page.evaluate(() => ((window.__lusTest!.sim() as unknown as { mark?: number }).mark = 1));
  await page.getByRole('button', { name: 'Restablecer paciente' }).click();
  // un simulador nuevo, con el paciente de su definición (respiración tranquila) y la misma sonda
  await expect.poll(() => page.evaluate(() => (window.__lusTest!.sim() as unknown as { mark?: number }).mark ?? 0)).toBe(0);
  expect(await page.evaluate(() => window.__lusTest!.sim().patient.respiratoryPattern)).toBe('quiet');
  const t1 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 60_000 }).toBeGreaterThan(t1);
  // con la imagen en vivo al menos tres cuadros más (el reloj avanza ≤ 0,25 s por cuadro): el informe tiene FPS del modo B
  const t2 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 120_000 }).toBeGreaterThan(t2 + 0.6);
  // el informe técnico: un JSON con el formato, la versión y el equipo (sin datos del usuario)
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
  await page.locator('.help-menu > summary').click();
  const download = page.waitForEvent('download');
  await page.locator('#tech-report').click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^lus-diagnostico-.*\.json$/);
  const report = JSON.parse(readFileSync(await d.path(), 'utf8')) as {
    format: string;
    version: string;
    equipment: { bmode: { depthMm: number } };
    coverage: { met: number; total: number } | null;
    bmodeFps: { fps: number; frames: number; frameMsP95: number } | null;
  };
  expect(report.format).toBe('lus-diagnostico/1');
  // los FPS reales del modo B (decisión 40, el indicador de O6): solo cuadros dibujados en vivo, en los últimos 10 s
  expect(report.bmodeFps).not.toBeNull();
  expect(report.bmodeFps!.frames).toBeGreaterThanOrEqual(2);
  expect(report.bmodeFps!.fps).toBeGreaterThan(0);
  expect(report.bmodeFps!.frameMsP95).toBeGreaterThan(0);
  // la cobertura de exploración de la escena (requisito de cobertura de docs/MISSION.md): N de M celdas
  expect(report.coverage?.total).toBeGreaterThan(0);
  expect(report.coverage!.met).toBeLessThanOrEqual(report.coverage!.total);
  expect(report.version).toBe(version);
  expect(report.equipment.bmode.depthMm).toBe(120);
  expect(errors).toEqual([]);
});

test('sobrevive a la pérdida del contexto WebGL, también con la imagen congelada: avisa, se recupera en vivo y el reloj sigue', async ({
  page,
}) => {
  // Decisión 30: se esperan hechos (el renderizador nuevo dibujó sus cuadros) y no un plazo para la pantalla. Medido en el
  // CI (PR #38, 12 medidas en 3 corredores): el renderizador nuevo se arma en 13–22 ms y dibuja su primer cuadro a los 3,4–6,7 s
  // de restaurar el contexto; lo lento era mirar: con la imagen en vivo, una captura del lienzo tarda 26–42 s y decodificarla en
  // la página otros 19–41 s, y la espera de 90 s se agotaba sin terminar una sola muestra.
  test.setTimeout(240_000);
  const errors = await boot(page);
  await page.locator('#sector-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(' ');
  await expect(page.locator('#live-chip')).toHaveText('Congelada');
  await page.evaluate(() => {
    const gl = (document.getElementById('gl') as HTMLCanvasElement).getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __lc: WEBGL_lose_context }).__lc = ext;
    // el renderizador que se pierde: el nuevo se reconoce por no ser este
    (window as unknown as { __lost: unknown }).__lost = window.__lusTest!.sim().renderer;
    ext.loseContext();
  });
  await expect(page.locator('.banner')).toContainText('Contexto GPU perdido', { timeout: 30_000 });
  // El aviso de la recuperación dura 5 s y el primer cuadro del renderizador nuevo (SwiftShader compila sus programas)
  // puede bloquear la página más que eso: el temporizador que lo quita corre en cuanto la página se libera, antes de que
  // la prueba lo vea (ciclo 2: con un trabajador por fragmento pasó en los dos intentos). Los avisos se registran al
  // aparecer, con un MutationObserver, y se espera a que el de la recuperación haya aparecido
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __banners: string[] }).__banners = seen;
    new MutationObserver(() => document.querySelectorAll('.banner').forEach((b) => seen.push(b.textContent ?? ''))).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await page.evaluate(() => (window as unknown as { __lc: WEBGL_lose_context }).__lc.restoreContext());
  // la imagen congelada era del renderizador perdido: vuelve la imagen en vivo, y se dice
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __banners: string[] }).__banners.some((t) => t.includes('GPU recuperada'))), {
      timeout: 120_000,
    })
    .toBe(true);
  await expect(page.locator('#live-chip')).toHaveText('En vivo');
  await expect(page.locator('.banner')).toHaveCount(0, { timeout: 30_000 });
  const t1 = tOf(await page.locator('#status').textContent());
  await expect.poll(async () => tOf(await page.locator('#status').textContent()), { timeout: 60_000 }).toBeGreaterThan(t1);
  // el renderizador nuevo dibuja en vivo: dos cuadros suyos en el cine (el primero llega a los 3,4–6,7 s en el CI)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const r = window.__lusTest!.sim().renderer;
          return r === (window as unknown as { __lost: unknown }).__lost ? -1 : r.cineCount;
        }),
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(2);
  // y se ve: la línea pleural vuelve a la pantalla. En el CI la primera captura tras restaurar ya la tenía en las 12 medidas
  // (gris 234–243), con 26–45 s por captura (54 s la más lenta de las trazas fallidas): basta la primera
  await expect.poll(async () => (await screen(page)).max, { timeout: 90_000 }).toBeGreaterThanOrEqual(PLEURA_GREY);
  // el registro de errores dice la pérdida (en la consola, con su origen), y nada más
  expect(errors).toEqual(['console: [gpu] contexto WebGL perdido']);
});
