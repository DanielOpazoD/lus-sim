import { expect, test, type Page } from '@playwright/test';
import { START_POINTS } from '../src/app/startPoints';

const PLAPS = START_POINTS.find((sp) => sp.id === 'plaps')!;

/** Los flujos usan mandos reales; __lusTest solo lee el estado que esos mandos producen. */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?e2e=1&corazon=0');
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  return errors;
}

const frame = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test('adquisición compacta: profundidad exacta, foco limitado y foco de teclado al congelar', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  const image = (await page.locator('.center').boundingBox())!;
  const navigator = (await page.locator('.navigator-pane').boundingBox())!;
  expect(image.width / (image.width + navigator.width)).toBeGreaterThan(0.65);
  await expect(page.locator('input[type="range"]:visible')).toHaveCount(0);
  await expect(page.locator('#acquisition-settings')).not.toBeVisible();

  await page.locator('#quick-depth').click();
  const depth = page.getByLabel('Profundidad', { exact: true });
  await depth.press('Home');
  await depth.press('ArrowRight');
  await expect(depth).toHaveValue('65');
  await expect(page.locator('#quick-depth')).toContainText('6,5 cm');
  await expect(page.locator('#hud-tr')).toContainText('6,5 cm');
  expect(await page.evaluate(() => window.__lusTest!.sim().bmode.depthMm)).toBe(65);

  await page.locator('#quick-focus').click();
  const focus = page.getByLabel('Foco', { exact: true });
  await expect(page.locator('#quick-depth-panel')).toBeHidden();
  await expect(focus).toHaveAttribute('max', '65');
  await focus.press('End');
  await expect(focus).toHaveValue('65');
  expect(await page.evaluate(() => window.__lusTest!.sim().bmode.focusMm)).toBe(65);
  await focus.press('Home');
  await expect(focus).toHaveValue('8');
  await expect(page.locator('#quick-focus')).toContainText('0,8 cm');
  // Espacio sobre un rango congela; el foco no puede quedarse en un control oculto e inhabilitado.
  await focus.press(' ');
  await expect(page.locator('#live-chip')).toHaveText('Congelada');
  await expect(page.locator('#quick-focus-panel')).toBeHidden();
  await expect(page.locator('#freeze')).toBeFocused();
  await expect(page.locator('#quick-depth')).toBeDisabled();
  await page.keyboard.press(']');
  expect(await page.evaluate(() => window.__lusTest!.sim().bmode.depthMm)).toBe(65);
  // El botón nativo recibe Espacio una sola vez: reanuda, sin que ProbeInput consuma la tecla.
  await page.locator('#freeze').press(' ');
  await expect(page.locator('#live-chip')).toHaveText('En vivo');
  await expect(page.locator('#quick-depth')).toBeEnabled();

  await page.locator('#settings-toggle').click();
  const advanced = page.getByRole('button', { name: 'Avanzado', exact: true });
  await expect(advanced).toHaveAttribute('aria-expanded', 'false');
  const probe = page.getByRole('button', { name: 'Sonda', exact: true });
  await probe.focus();
  await probe.press(' ');
  await expect(probe).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#live-chip')).toHaveText('En vivo');
  await expect(page.getByLabel('Contacto', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#acquisition-settings')).toBeHidden();
  await expect(page.locator('#settings-toggle')).toBeFocused();
  expect(errors).toEqual([]);
});

test('cine conserva ubicación, equipo y maniobra del cuadro mostrado', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  const start = await page.evaluate(() => {
    const sim = window.__lusTest!.sim();
    return { pose: { ...sim.pose }, gainDb: sim.bmode.gainDb };
  });
  const changedGainDb = start.gainDb + 1;
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().renderer.cineCount), { timeout: 60_000 }).toBeGreaterThan(2);
  await page.locator('#settings-toggle').click();
  await page.getByRole('button', { name: 'Profunda', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
  // El historial mezcla ajustes de ganancia a la misma escala polar. Cambiar profundidad inicia
  // otro cine por diseño; esa frontera se comprueba al final del recorrido.
  await page.locator('#quick-gain').click();
  await page.getByLabel('Ganancia', { exact: true }).press('ArrowRight');
  await page.keyboard.press('Escape');
  // (decisión 47) sin las tarjetas de los puntos BLUE: la sonda va al PLAPS derecho por el gancho de pruebas
  await page.evaluate(
    (sp) => window.__lusTest!.setPose({ lift: 0, phi: sp.phi, z: sp.z, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 }),
    PLAPS,
  );
  await expect.poll(() => page.evaluate(() => window.__lusTest!.sim().pose.phi), { timeout: 60_000 }).toBeGreaterThan(1.14 * Math.PI);
  await expect
    .poll(
      () =>
        page.evaluate((expectedGainDb) => {
          const sim = window.__lusTest!.sim();
          const n = sim.renderer.cineCount;
          if (!n) return false;
          const f = sim.renderer.cineFrame(n - 1);
          return (
            f.acquisition.pose.phi > 1.14 * Math.PI && f.bmode.gainDb === expectedGainDb && f.acquisition.respiratoryPattern === 'deep'
          );
        }, changedGainDb),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.locator('#freeze').click();
  await expect(page.locator('#live-chip')).toHaveText('Congelada');
  const currentPose = await page.evaluate(() => ({ ...window.__lusTest!.sim().pose }));
  expect(await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.pose.phi)).toBeGreaterThan(1.14 * Math.PI);
  await expect(page.locator('#quick-gain')).toContainText(`${changedGainDb} dB`);

  // Escoge con el cine nativo un cuadro adquirido al inicio; el índice se encuentra por sus metadatos,
  // sin modificar ni el anillo ni la pose, y se recorre con las mismas teclas que usa el alumno.
  const old = await page.evaluate((initial) => {
    const r = window.__lusTest!.sim().renderer;
    for (let i = 0; i < r.cineCount; i++) {
      const f = r.cineFrame(i);
      if (
        f.bmode.depthMm === 120 &&
        f.bmode.gainDb === initial.gainDb &&
        Math.abs(f.acquisition.pose.phi - initial.pose.phi) < 0.001 &&
        f.acquisition.respiratoryPattern === 'quiet'
      ) {
        return { index: i, pose: f.acquisition.pose };
      }
    }
    return null;
  }, start);
  expect(old, 'el cine debe conservar una adquisición anterior al cambio de ubicación').not.toBeNull();
  const cine = page.locator('#cine');
  await cine.press('Home');
  for (let i = 0; i < old!.index; i++) await cine.press('ArrowRight');
  await frame(page);
  await expect(page.locator('#quick-depth')).toContainText('12,0 cm');
  await expect(page.locator('#quick-gain')).toContainText(`${start.gainDb} dB`);
  await expect(page.locator('#quick-gain')).toBeDisabled();
  await expect(page.locator('#hud-tr')).toContainText('12,0 cm');
  await expect(page.locator('#hud-tr')).toContainText(`G ${start.gainDb} dB`);
  expect(await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.pose)).toEqual(old!.pose);
  expect(await page.evaluate(() => window.__lusTest!.sim().pose)).toEqual(currentPose);
  await page.locator('#settings-toggle').click();
  await expect(page.getByRole('button', { name: 'Tranquila', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Profunda', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click();

  await cine.press('End');
  await frame(page);
  await expect(page.locator('#quick-gain')).toContainText(`${changedGainDb} dB`);
  expect(await page.evaluate(() => window.__lusTest!.sim().displayedAcquisition.pose.phi)).toBeGreaterThan(1.14 * Math.PI);
  await page.locator('#freeze').click();
  expect(await page.evaluate(() => window.__lusTest!.sim().pose)).toEqual(currentPose);
  await expect(page.locator('#quick-gain')).toContainText(`${changedGainDb} dB`);
  // Una profundidad distinta inicia un historial nuevo: no conserva cuadros de la escala anterior.
  await page.locator('#quick-depth').click();
  await expect(page.locator('#quick-depth-panel')).toContainText('Cambiar la profundidad inicia un nuevo cine.');
  await page.getByLabel('Profundidad', { exact: true }).press('Home');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const r = window.__lusTest!.sim().renderer;
          if (!r.cineCount) return false;
          return Array.from({ length: r.cineCount }, (_, i) => r.cineFrame(i).bmode.depthMm).every((depth) => depth === 60);
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('pantalla de 320 px: equipo visible y navegador plegable sin desbordamiento horizontal', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 320, height: 740 });
  const errors = await boot(page);
  const initialGainDb = await page.evaluate(() => window.__lusTest!.sim().bmode.gainDb);
  const changedGainDb = initialGainDb + 1;
  await expect(page.locator('#navigator-content')).toBeHidden();
  const visibleEquipment = async () => {
    for (const id of ['freeze', 'quick-depth', 'quick-gain', 'quick-focus', 'settings-toggle']) {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.y + box.height).toBeLessThanOrEqual(740);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await visibleEquipment();
  await page.locator('#navigator-toggle').click();
  await expect(page.locator('#navigator-content')).toBeVisible();
  await expect(page.locator('.thorax-canvas')).toBeVisible({ timeout: 60_000 });
  await visibleEquipment();
  await page.locator('#navigator-toggle').click();
  await expect(page.locator('#navigator-content')).toBeHidden();
  await page.locator('#quick-gain').click();
  const popup = (await page.locator('#quick-gain-panel').boundingBox())!;
  expect(popup.x).toBeGreaterThanOrEqual(0);
  expect(popup.x + popup.width).toBeLessThanOrEqual(320);
  await page.getByLabel('Ganancia', { exact: true }).press('ArrowRight');
  await expect(page.locator('#quick-gain')).toContainText(`${changedGainDb} dB`);
  await visibleEquipment();
  expect(errors).toEqual([]);
});
