import { expect, test, type Page } from '@playwright/test';

/**
 * Formación de imagen en la GPU (fase 1, paso B2a, decisión 12), con Chromium y SwiftShader: el banco de la e2e
 * (`/?e2e=1`) monta el simulador sin mostrarlo y expone los ganchos (`window.__lusTest`). La anatomía existe dos veces,
 * en TypeScript (pruebas, medidas) y en GLSL (la imagen): aquí se exige que coincidan en el tórax y que la imagen de la
 * GPU tenga el moteado y las líneas A que dice la física.
 */
async function openBench(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?e2e=1');
  // los ganchos se cargan de forma diferida (import dinámico) tras montar el simulador (SwiftShader compila los
  // programas: 20–60 s con la máquina cargada)
  await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
  return errors;
}

test('la anatomía GLSL del tórax coincide con la TypeScript: planos, volumen, caras, pleura, normales y transmisión', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await openBench(page);
  // Planos de los tres puntos de partida (la rejilla de VExUS, 48 × 72 hasta 16 cm): acuerdo lejos de bordes
  const sweep = await page.evaluate(() => window.__lusTest!.equivalenceSweep());
  expect(sweep.map((r) => r.id)).toEqual(['blueUpper', 'blueLower', 'plaps']);
  for (const r of sweep) expect(r.interiorAgreement, JSON.stringify(r)).toBeGreaterThanOrEqual(0.99);
  // Volumen: 50 000 puntos del tórax (z −100…180 mm). Lejos de interfaces (≥ 1 mm y la misma cara a ±0,02 mm) las dos
  // anatomías deben coincidir EXACTAMENTE en tejido y en cara; la distancia a la cara, a la precisión de float32
  const vol = await page.evaluate(() => window.__lusTest!.volumeEquivalence(50_000));
  const vtag = JSON.stringify(vol);
  expect(vol.interiorPoints, vtag).toBeGreaterThan(40_000);
  expect(vol.tissueAgreement, vtag).toBe(1);
  // el volumen tiene dientes: los tejidos del tórax de la escena (medido con GPU real: pulmón 5901, grasa 3431, «resto»
  // 5230, músculo 1790 y columna 776 de 17 501 interiores con 20 000 puntos)
  for (const t of ['Lung', 'Fat', 'Muscle', 'Bowel', 'Vertebra', 'Skin'])
    expect(vol.byTissue[t] ?? 0, `${t}: ${vtag}`).toBeGreaterThan(200);
  expect(vol.interfacePoints, vtag).toBeGreaterThan(3000);
  expect(vol.interfaceAgreement, vtag).toBe(1);
  // GPU real (M4): 2·10⁻⁵ mm; SwiftShader llegó a 0,014 mm en VExUS (la cara del diafragma): una décima del eco
  expect(vol.interfaceDistanceMaxErr, vtag).toBeLessThan(0.02);
  // Cáscara: los puntos a 0,01–0,6 mm de una cara donde se dibuja su eco, según la CPU o la GPU. En el tórax la cara
  // interna de la pared (Peritoneum en la tabla de VExUS) es la pleura parietal
  const shell = await page.evaluate(() => window.__lusTest!.interfaceShell());
  const stag = JSON.stringify(shell);
  expect(shell.points, stag).toBeGreaterThan(5000);
  for (const face of ['SkinFat', 'Scarpa', 'DeepFascia', 'ObliquePlane', 'TransversusPlane', 'Transversalis', 'Peritoneum', 'RibCortex'])
    expect(shell.byInterface[face] ?? 0, `${face}: ${stag}`).toBeGreaterThan(50);
  expect(shell.agreement, stag).toBeGreaterThanOrEqual(0.999);
  expect(shell.distanceMaxErr, stag).toBeLessThan(0.02);
  // La pleura parietal de A0 frente a su gemelo, línea a línea: la registran las dos en las mismas líneas y en el mismo
  // sitio (GPU real: 0 mm; la bisección cae en múltiplos exactos del paso)
  const pleura = await page.evaluate(() => window.__lusTest!.pleuraEquivalence());
  const ptag = JSON.stringify(pleura);
  expect(pleura.lines, ptag).toBe(3 * 192);
  expect(pleura.cpuPleura, ptag).toBeGreaterThan(0.95 * pleura.lines);
  expect(pleura.registrationMismatch, ptag).toBe(0);
  expect(pleura.depthMaxErrMm, ptag).toBeLessThan(0.01);
  expect(pleura.edgeMaxErrMm, ptag).toBeLessThan(0.01);
  // Las caras de la pared y de las costillas: la misma cara, normal y norma del gradiente en la GPU que en TS
  for (const startPoint of ['blueUpper', 'plaps'] as const) {
    const n = await page.evaluate((id) => window.__lusTest!.wallNormals({ startPoint: id }), startPoint);
    const ntag = `${startPoint}: ${JSON.stringify(n)}`;
    expect(n.points, ntag).toBeGreaterThan(300);
    expect(n.mismatched / (n.points + n.mismatched), ntag).toBeLessThan(0.01);
    expect(n.p05, ntag).toBeGreaterThan(0.98);
    expect(n.normErrP95, ntag).toBeLessThan(0.01);
  }
  // La pasada A en cuatro etapas: la transmisión de un solo rayo es la del modelo de CPU (con costillas en el plano)
  const t = await page.evaluate(() => window.__lusTest!.transmissionParity({ startPoint: 'blueLower', every: 8, compound: false }));
  const ttag = JSON.stringify(t);
  expect(t.lines, ttag).toBeGreaterThan(5);
  expect(t.samples, ttag).toBeGreaterThan(300);
  expect(t.maxDiffDb, ttag).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('el moteado del músculo de la pared tiene estadística de Rayleigh', async ({ page }) => {
  // Guarda de fidelidad de imagen (la de VExUS en el hígado): la envolvente de un speckle plenamente desarrollado tiene
  // SNR = 1,91; detectar intensidad (1,0), sumar magnitudes antes del haz (≈ 9) o suavizar la envolvente (≈ 3,7) salen
  // de la banda (`src/validation/speckle.test.ts`). El tórax no tiene un tejido sin estructura tan grande como el
  // hígado: el músculo de la pared entre sus estrías y sus caras, en la zona paraesternal, donde es una sola capa de
  // ~7 mm (en la lateral, dos planos intermusculares cada ~2,5 mm no dejan sitio a un parche de 16 × 8). Se juntan los
  // parches de cinco vistas (con GPU real: 51 parches, SNR 1,89–2,14 por vista).
  test.setTimeout(300_000);
  const errors = await openBench(page);
  const stats = await page.evaluate(() => {
    const views = [
      [0.5, 110, 0],
      [0.53, 140, 0],
      [0.56, 150, 0],
      [0.53, 120, Math.PI / 2],
      [0.47, 125, 0],
    ] as const;
    return views.map(([phi, z, yaw]) =>
      window.__lusTest!.speckle({ compound: false, pose: { phi: phi * Math.PI, z, lift: 0, yaw, rock: 0, tilt: 0 } }),
    );
  });
  const patches = stats.reduce((s, v) => s + v.patches, 0);
  const snr = stats.reduce((s, v) => s + (v.patches ? v.snr * v.patches : 0), 0) / patches;
  const tag = JSON.stringify({ patches, snr, stats });
  expect(patches, tag).toBeGreaterThan(40);
  expect(snr, tag).toBeGreaterThan(1.6);
  expect(snr, tag).toBeLessThan(2.25);
  expect(errors).toEqual([]);
});

test('líneas A a múltiplos de la profundidad de la pleura en la envolvente de la GPU (meta F-T01)', async ({ page }) => {
  // Meta F-T01 (`docs/knowledge/physics.md` §3.3): la línea A de orden k a k·z_pl ± 0,5 mm (o 1 píxel), medida a lo
  // largo de cada haz, con el perfil axial promediado lateralmente como la métrica A1 del banco de referencia. z_pl es la
  // profundidad de la pleura del gemelo de A0 (TS), la que la GPU usa sin error. Con GPU real, en los tres puntos de
  // partida y en apnea espiratoria: todos los órdenes 1–4 en todos los grupos, a −0,42…−0,25 mm de k·z_pl, y la
  // separación entre órdenes a ≤ 0,084 mm de z_pl.
  test.setTimeout(300_000);
  const errors = await openBench(page);
  for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const) {
    const a = await page.evaluate((id) => window.__lusTest!.aLines({ startPoint: id, respiration: 'apnea-expiratory' }), startPoint);
    const tag = `${startPoint}: ${JSON.stringify(a)}`;
    expect(a.groups, tag).toBeGreaterThanOrEqual(6);
    // la pleura heredada a 25–29 mm (la pared del abdomen de VExUS, `thorax-wall-abdominal-habitus`): caben 4 órdenes
    expect(
      a.orders.map((o) => o.k),
      tag,
    ).toEqual([1, 2, 3, 4]);
    for (const o of a.orders) {
      // cada orden se ve en casi todos los grupos (la línea A de orden 4, a ~10 cm, es la más débil)
      expect(o.peaks, tag).toBeGreaterThanOrEqual(Math.ceil(0.9 * o.groups));
      expect(Math.max(Math.abs(o.minErrMm), Math.abs(o.maxErrMm)), tag).toBeLessThanOrEqual(0.5);
      // la desviación declarada (`pleura-echo-offset`): toda la serie, la línea pleural incluida, se dibuja 0,35 mm
      // (IFACE_SHIFT_MM, la cara de un lado de VExUS) por encima de su cruce
      expect(o.maxErrMm, tag).toBeLessThan(-0.2);
      expect(o.minErrMm, tag).toBeGreaterThan(-0.5);
      // la separación entre líneas A es la profundidad de la pleura (guía §18): un tercio de la FWHM axial del pulso
      if (o.k >= 2) expect(o.maxSpacingErrMm, tag).toBeLessThanOrEqual(0.2);
    }
  }
  expect(errors).toEqual([]);
});
