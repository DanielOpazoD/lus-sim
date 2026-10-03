import { expect, test } from '@playwright/test';

/**
 * El costo por cuadro espera a la GPU (decisión 40; O6: modo B a ≥ 30 FPS). `frameCostMs` mide el tiempo de pared de n cuadros
 * entre dos `finishForTiming`, que lee un píxel de la pantalla. Lo que se prueba en el navegador (SwiftShader en el CI, la GPU
 * real con `LUS_E2E_GPU=1`):
 *  - la lectura de sincronización espera: dibujar n cuadros pesados solo encola su trabajo (en la GPU real, ≈ 0,1 ms por
 *    cuadro) y la lectura no vuelve hasta que la GPU los termina, así que el tiempo sincronizado pasa con creces al de encolar.
 *    Sin la lectura (o con una que no espere), los dos serían iguales;
 *  - ninguna medida deja un error de WebGL: la sincronización de antes leía RGBA/UNSIGNED_BYTE del framebuffer ligado, que tras
 *    guardar un cuadro en el cine es la envolvente (R32F), y dejaba un `GL_INVALID_OPERATION` por medida.
 */
test('el costo por cuadro espera a la GPU y no deja errores de WebGL (decisión 40)', async ({ page }) => {
  test.setTimeout(600_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    if (m.type() === 'warning' && /WebGL: INVALID|GL_INVALID/.test(m.text())) problems.push(`warning: ${m.text()}`);
  });
  await page.goto('/?e2e=1');
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
  const r = await page.evaluate(() => {
    const hooks = window.__lusTest!;
    const sim = hooks.sim();
    const gl = sim.renderer.gl;
    // (decisión 42) todo en la vista de medida del BLUE superior, la misma pose que mide `frameCostMs` con `startPoint`
    hooks.goToMeasurementView('blueUpper');
    const heavy = { repeat: { pass: 'rawField' as const, times: 2 } };
    const n = 2;
    sim.render(heavy);
    sim.renderer.finishForTiming();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) sim.render(heavy);
    const t1 = performance.now();
    sim.renderer.finishForTiming();
    const t2 = performance.now();
    const light = hooks.frameCostMs(n, { startPoint: 'blueUpper' });
    const loaded = hooks.frameCostMs(n, { startPoint: 'blueUpper', repeatPass: 'rawField', repeatCount: 2 });
    return { enqueueMs: (t1 - t0) / n, syncedMs: (t2 - t0) / n, light, loaded, error: gl.getError(), noError: gl.NO_ERROR };
  });
  const tag = JSON.stringify(r);
  console.log(`FRAME_COST_JSON ${tag}`);
  // la lectura esperó a la GPU: al menos 3 veces lo que cuesta encolar los cuadros, y 1 ms más por cuadro
  expect(r.syncedMs, tag).toBeGreaterThan(3 * r.enqueueMs);
  expect(r.syncedMs - r.enqueueMs, tag).toBeGreaterThan(1);
  // la medida del gancho sigue a la carga de la GPU: el campo crudo dos veces más cuesta más
  expect(r.loaded, tag).toBeGreaterThan(r.light);
  expect(r.error, tag).toBe(r.noError);
  expect(problems).toEqual([]);
});
