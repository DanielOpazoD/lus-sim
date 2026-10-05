import { expect, test, type Page } from '@playwright/test';

/**
 * Las líneas B en la GPU (lus-sim, decisión 51):
 *  - el gemelo: las trampas que ve cada línea y su reirradiación (`bLineField` de la GLSL, en la consulta de puntos) son las de
 *    TS (`trapScan`) en la pleura de las líneas de una vista de medida, con el pulmón congestionado;
 *  - la imagen: con el pulmón normal el detector no ve ninguna línea B; al perder aire aparecen líneas discretas y, con poco
 *    aire, el blanco confluente (F-T27), medido sobre el nivel mostrado de la mirada 0 con `measure/bLines.ts`.
 */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    if (m.type() === 'warning' && /WebGL: INVALID|GL_INVALID/.test(m.text())) errors.push(`warning: ${m.text()}`);
  });
  // el BLUE inferior y la equivalencia de las trampas, lejos del corazón: sin su horneado (decisión 49)
  await page.goto('/?e2e=1&corazon=0');
  await expect(page.locator('#status')).toContainText(/\d+ fps/, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 60_000 }).toBe('object');
  return errors;
}

test('líneas B: el gemelo GLSL de las trampas y el patrón que emerge al perder aire (F-T27)', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await boot(page);
  // el gemelo, en el BLUE inferior: con un pulmón a medio camino (trampas que se abren o no según su susceptibilidad: φ 0,62),
  // con todos los tabiques abiertos y el campo difuso (φ 0,5) y con un mapa no uniforme (de 0,45 en la base a 0,75 en el vértice:
  // las trampas vecinas se deciden con la bilineal del cuadrilátero de cada línea)
  for (const gas of [0.62, 0.5, { top: 0.75, bottom: 0.45 }] as const) {
    const eq = await page.evaluate((gas) => {
      const t = window.__lusTest!;
      t.goToMeasurementView('blueLower');
      t.advance(0.5);
      t.setLungGas(gas);
      return t.bLineEquivalence();
    }, gas);
    const tag = `${JSON.stringify(gas)}: ${JSON.stringify(eq)}`;
    console.log(`LÍNEAS B gemelo ${tag}`);
    expect(eq.points, tag).toBeGreaterThan(200);
    expect(eq.traps, tag).toBeGreaterThan(20);
    expect(eq.sameTraps, tag).toBeGreaterThanOrEqual(0.98);
    expect(eq.rhoMaxDiff, tag).toBeLessThan(0.01);
    expect(eq.fieldMedianRelErr, tag).toBeLessThan(0.02);
  }
  // la imagen: el pulmón normal, uno que pierde aire y uno casi sin aire, en la misma vista
  const clips = await page.evaluate(() => {
    const t = window.__lusTest!;
    const out: Record<string, ReturnType<typeof t.bLineClip>> = {};
    for (const [k, gas] of [
      ['normal', null],
      ['leve', 0.62],
      ['grave', 0.38],
    ] as const) {
      t.setLungGas(gas);
      t.goToMeasurementView('blueLower');
      out[k] = t.bLineClip({ frames: 2, intervalS: 0.5 });
    }
    // fuera del rango de operación del contador (+30 dB sobre el preajuste de −20): el pulmón blanco no se lee (NaN), no da 0
    out.graveGanancia = t.bLineClip({ frames: 2, intervalS: 0.5, gainDb: 10 });
    t.setLungGas(null);
    return out;
  });
  const all = JSON.stringify({ normal: clips.normal.counts, leve: clips.leve.clip, grave: clips.grave.clip });
  console.log(`LÍNEAS B clips: ${all}`);
  // el detector halla la pleura en la imagen: la misma que la anatomía (A0) a ≤ 1,5 mm, y ninguna donde la anatomía no tiene
  for (const c of [clips.normal, clips.leve, clips.grave]) {
    expect(c.pleura.extra, all).toBe(0);
    expect(c.pleura.within / c.pleura.both, JSON.stringify(c.pleura)).toBeGreaterThanOrEqual(0.85);
  }
  expect(clips.normal.clip.count, all).toBe(0);
  expect(clips.leve.clip.discrete, all).toBeGreaterThanOrEqual(1);
  expect(clips.leve.clip.whiteFraction, all).toBeLessThan(0.5);
  expect(clips.grave.clip.confluent, all).toBe(true);
  expect(clips.grave.clip.whiteFraction, all).toBeGreaterThan(0.6);
  expect(clips.graveGanancia.clip.saturatedBy, all).toBe('gain');
  expect(
    clips.graveGanancia.counts.every((c) => Number.isNaN(c)),
    all,
  ).toBe(true);
  expect(errors).toEqual([]);
});
