import { expect, test, type Page } from '@playwright/test';

/**
 * Formación de imagen en la GPU (fase 1, paso B2a, decisión 12), con Chromium y SwiftShader: con `/?e2e=1` la
 * aplicación expone los ganchos de prueba (`window.__lusTest`) sobre su simulador vivo. La anatomía existe dos veces,
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
  // el volumen tiene dientes: los tejidos del tórax de la escena (medido, igual con GPU real y con SwiftShader: pulmón
  // 14 787, «resto» 13 069, grasa 8559, músculo 4519, columna 1900 y piel 719 de 43 797 interiores; las costillas, 106,
  // las cubre la cáscara)
  for (const t of ['Lung', 'Fat', 'Muscle', 'Bowel', 'Vertebra', 'Skin'])
    expect(vol.byTissue[t] ?? 0, `${t}: ${vtag}`).toBeGreaterThan(200);
  expect(vol.interfacePoints, vtag).toBeGreaterThan(3000);
  expect(vol.interfaceAgreement, vtag).toBe(1);
  // GPU real (M4): 2·10⁻⁵ mm; SwiftShader llegó a 0,014 mm en VExUS (la cara del diafragma): una décima del eco
  expect(vol.interfaceDistanceMaxErr, vtag).toBeLessThan(0.02);
  // la distancia al borde del tejido, la que funde los bordes en la pasada B (hasta 10 mm, lo que puede importar;
  // lo añadió la revisión): GPU real 1·10⁻⁴ mm, SwiftShader 0,014 mm
  expect(vol.boundaryDistanceMaxErr, vtag).toBeLessThan(0.02);
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
  // sitio. GPU real: 0 mm (la bisección cae en múltiplos exactos de su paso final). SwiftShader: una decisión de la
  // bisección en una línea de 576 cambia con el redondeo y mueve D un paso final (0,0117 mm a 12 cm, 1/60 del eco de
  // 0,7 mm), y dz 0,032 mm: con σ del borde blando ≥ σ_taper = 4 mm, la fracción de aire cambia < 0,5 %
  const pleura = await page.evaluate(() => window.__lusTest!.pleuraEquivalence());
  const ptag = JSON.stringify(pleura);
  expect(pleura.lines, ptag).toBe(3 * 192);
  expect(pleura.cpuPleura, ptag).toBeGreaterThan(0.95 * pleura.lines);
  expect(pleura.registrationMismatch, ptag).toBe(0);
  expect(pleura.depthMaxErrMm, ptag).toBeLessThanOrEqual(pleura.quantumMm + 1e-5);
  expect(pleura.edgeMaxErrMm, ptag).toBeLessThan(0.05);
  // Las caras de la pared y de las costillas: la misma cara, normal y norma del gradiente en la GPU que en TS
  for (const startPoint of ['blueUpper', 'plaps'] as const) {
    const n = await page.evaluate((id) => window.__lusTest!.wallNormals({ startPoint: id }), startPoint);
    const ntag = `${startPoint}: ${JSON.stringify(n)}`;
    expect(n.points, ntag).toBeGreaterThan(300);
    expect(n.mismatched / (n.points + n.mismatched), ntag).toBeLessThan(0.01);
    // GPU real y SwiftShader: 1 − p05 ≈ 1·10⁻⁷ (VExUS pedía > 0,98, que deja pasar la normal del tronco en lugar de
    // la de la cara: 0,994, lo halló la revisión)
    expect(n.p05, ntag).toBeGreaterThan(0.9999);
    expect(n.normErrP95, ntag).toBeLessThan(0.01);
  }
  // La pasada A en cuatro etapas: la transmisión de un solo rayo es la del modelo de CPU (con costillas en el plano)
  const t = await page.evaluate(() => window.__lusTest!.transmissionParity({ startPoint: 'blueLower', every: 8, compound: false }));
  const ttag = JSON.stringify(t);
  expect(t.lines, ttag).toBeGreaterThan(5);
  expect(t.samples, ttag).toBeGreaterThan(300);
  expect(t.maxDiffDb, ttag).toBeLessThan(0.01);
  // Lo mismo en inspiración máxima: el diafragma 30 mm más abajo (la deformación respiratoria entra en los dos
  // gemelos; en reposo, con el descenso en 0, un signo cambiado de su uniform solo se veía por azar)
  const caudal = await page.evaluate(() => {
    const sim = window.__lusTest!.sim();
    sim.patient.respiratoryPattern = 'apnea-inspiratory';
    window.__lusTest!.advance(4);
    return sim.sample.resp.diaphragmCaudalMm;
  });
  expect(caudal).toBeGreaterThan(25);
  const insp = await page.evaluate(() => ({
    vol: window.__lusTest!.volumeEquivalence(20_000),
    sweep: window.__lusTest!.equivalenceSweep(),
    shell: window.__lusTest!.interfaceShell(),
  }));
  const itag = JSON.stringify({ caudal, ...insp });
  expect(insp.vol.interiorPoints, itag).toBeGreaterThan(15_000);
  expect(insp.vol.tissueAgreement, itag).toBe(1);
  expect(insp.vol.interfaceAgreement, itag).toBe(1);
  expect(insp.vol.interfaceDistanceMaxErr, itag).toBeLessThan(0.02);
  expect(insp.vol.boundaryDistanceMaxErr, itag).toBeLessThan(0.02);
  for (const r of insp.sweep) expect(r.interiorAgreement, itag).toBeGreaterThanOrEqual(0.99);
  expect(insp.shell.agreement, itag).toBeGreaterThanOrEqual(0.999);
  expect(insp.shell.distanceMaxErr, itag).toBeLessThan(0.02);
  expect(errors).toEqual([]);
});

test('el moteado del músculo de la pared tiene estadística de Rayleigh', async ({ page }) => {
  // Guarda de fidelidad de imagen (la de VExUS en el hígado): la envolvente de un speckle plenamente desarrollado tiene
  // SNR = 1,91; detectar intensidad (1,0), sumar magnitudes antes del haz (≈ 9) o suavizar la envolvente (≈ 3,7) salen
  // de la banda (`src/validation/speckle.test.ts`). El tórax no tiene un tejido sin estructura tan grande como el
  // hígado: el músculo de la pared entre sus estrías y sus caras, en la zona paraesternal, donde es una sola capa de
  // ~7 mm (en la lateral, dos planos intermusculares cada ~2,5 mm no dejan sitio a un parche de 16 × 8). Se juntan los
  // parches de cinco vistas (con GPU real y con SwiftShader: 51 parches, SNR 1,91–2,14 por vista, 2,07 de media).
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

test('líneas A en la envolvente de la GPU: a k veces la línea pleural mostrada (F-T01) y separadas por la profundidad de la pleura', async ({
  page,
}) => {
  // Meta F-T01 (`docs/knowledge/physics.md` §3.3): la línea A de orden k a k·z_pl MOSTRADO ± 0,5 mm (o 1 píxel), medida
  // a lo largo de cada haz, con el perfil axial promediado lateralmente como la métrica A1 del banco de referencia.
  // Desde la decisión 15 la rama del pulmón de la pasada B dibuja la línea pleural y sus réplicas centradas en su cruce
  // (`pleuraSeriesEcho`), en la mirada 0 y en la dirigida. Con SwiftShader y con GPU real (Apple M4), en los tres puntos de
  // partida y en apnea espiratoria (26-09-2026; los extremos de varias pasadas, que cambian con el ruido del receptor):
  //  - frente al cruce de la pleura D del gemelo de A0: los órdenes 1–4, a −0,11…+0,07 mm de k·D (antes, con el perfil de
  //    la cara de un lado, −0,43…−0,26: toda la serie 0,35 mm por encima de su cruce), y la separación entre órdenes a
  //    ≤ 0,08 mm de D;
  //  - frente a la línea pleural mostrada (F-T01): los órdenes 2–4 a −0,20…+0,05 mm (antes el 2 a +0,27…+0,39, el 3 a
  //    +0,56…+0,76 y el 4 a +0,87…+1,13: 0,35·(k − 1), fuera de la meta en los órdenes 3 y 4). 1 píxel = 0,268 mm;
  //  - con la composición espacial (la envolvente de K con el anillo lleno; el preajuste pulmonar la apaga, pero la consola
  //    la enciende): a −0,07…+0,07 mm de k·D y F-T01 a −0,28…0,00 mm. El peso de las miradas dirigidas en K cambia en D
  //    (`curtainSteerWeight`: 1 encima, 1 − fAir debajo), sobre el pico de la línea pleural.
  test.setTimeout(300_000);
  const errors = await openBench(page);
  /** Cuántos errores caben en la tolerancia, y cuántos se exigen: todos, o el 90 % en el orden 4. */
  const within = (errs: number[], tol: number): number => errs.filter((e) => Math.abs(e) <= tol).length;
  const needed = (o: { k: number; errMm: number[] }, n = o.errMm.length): number => (o.k <= 3 ? n : Math.floor(0.9 * n));
  for (const compound of [false, true])
    for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const) {
      const a = await page.evaluate(
        ([id, c]) => window.__lusTest!.aLines({ startPoint: id, respiration: 'apnea-expiratory', compound: c }),
        [startPoint, compound] as const,
      );
      const tag = `${startPoint}${compound ? ' (compuesto)' : ''}: ${JSON.stringify(a)}`;
      expect(a.groups, tag).toBeGreaterThanOrEqual(6);
      // la pleura heredada a 25–29 mm (la pared del abdomen de VExUS, `thorax-wall-abdominal-habitus`): caben 4 órdenes
      expect(
        a.orders.map((o) => o.k),
        tag,
      ).toEqual([1, 2, 3, 4]);
      for (const o of a.orders) {
        // cada orden se ve en casi todos los grupos: la línea A de orden 4, a ~10 cm, es la más débil (16 dB de
        // prominencia en el PLAPS) y en unas pasadas se pierde en 1 de sus 6 grupos, con GPU real y con SwiftShader
        expect(o.peaks, tag).toBeGreaterThanOrEqual(Math.floor(0.9 * o.groups));
        // la serie, la línea pleural incluida, en k·D: un tercio de la FWHM axial del pulso (el perfil de la cara de un
        // lado la dejaba 0,35 mm por encima y fallaba aquí). En todos los grupos, salvo en el orden 4, la línea A más débil
        // (16–22 dB), donde el detector puede tomar otro máximo de su ventana en un grupo (una vez, −1,08 mm en 1 de 6
        // grupos del orden 4 compuesto del PLAPS con SwiftShader; no se repitió en 16 pasadas): ahí, en el 90 %
        expect(within(o.errMm, 0.2), tag).toBeGreaterThanOrEqual(needed(o));
        // la separación entre líneas A es la profundidad de la pleura (guía §18): un tercio de la FWHM axial del pulso
        if (o.k >= 2) expect(within(o.spacingErrMm, 0.2), tag).toBeGreaterThanOrEqual(needed(o, o.spacingErrMm.length));
      }
      // F-T01 frente a la línea pleural mostrada, en los órdenes 1–4 (el 1 es la línea pleural: r_1 − 1·r_1 = 0)
      const tol = Math.max(0.5, a.pixelMm);
      for (const o of a.orders.filter((x) => x.k >= 2)) {
        const worst = Math.max(Math.abs(o.minShownErrMm), Math.abs(o.maxShownErrMm));
        expect(
          within(o.shownErrMm, tol),
          `F-T01, orden ${o.k}: el peor ${worst.toFixed(2)} mm frente a ${tol} mm (${tag})`,
        ).toBeGreaterThanOrEqual(needed(o, o.shownErrMm.length));
      }
    }
  expect(errors).toEqual([]);
});

test('sombra costal en la envolvente de la GPU (F-T08): oscura, con la penumbra de la apertura; bajo el centro de la costilla la pleura (y, tenue, la línea A) aún se ven (rib-shadow-pleura-residual)', async ({
  page,
}) => {
  // Meta F-T08 (`docs/knowledge/physics.md` §3.3): bajo la costilla no hay línea pleural ni líneas A, y la intensidad
  // media de la sombra es ≥ 20 dB menor que la del eco pleural intercostal (su primera parte, la pleura 5 ± 1 mm bajo la
  // superficie costal, es geometría: `src/validation/anatomyTargets.test.ts`, paso C). Se mide en la envolvente de la
  // GPU, línea a línea (`ribShadow`), con la sombra clasificada con los datos de la pasada A: las líneas que cruzan hueso
  // antes de la pleura, la sombra completa (todas las tomas de sus conos de apertura cruzan hueso) y las líneas libres
  // (ninguna toma cruza hueso), cuyo eco pleural es la referencia. Lo que se ve se juzga en la pantalla, con el nivel del
  // equipo del cuadro (`displayLevelDb`: ≥ 0 satura, ≤ −70 dB es negro). Medido con GPU real (Apple M4) y con
  // SwiftShader, en apnea espiratoria (26-09-2026), relativo al eco pleural intercostal:
  //  - la intensidad media de cada sombra en la ventana D − 1 … 2·D + 1 mm, −37…−39 dB (F-T08 pide −20). Frente a la misma
  //    ventana de las líneas libres, que incluye su propia línea pleural, la sombra entera queda solo 19,5–21 dB más oscura:
  //    la penumbra pesa;
  //  - la penumbra (el cono de la pasada A, 6,7–8,2 líneas de semiancho, aún pasa junto a la costilla) ocupa 37 de las 69
  //    líneas con hueso del BLUE inferior y 58 de las 103 del PLAPS: la pleura se ve (> −40 dB) solo ahí;
  //  - en la sombra completa, la ventana queda 45–68 dB más oscura que la de las líneas libres;
  //  - pero la línea pleural sigue a −46…−67 dB, en pantalla a −29…−50 dB (gris sobre negro), y la línea A de orden 2, a
  //    −56…−83 dB en pantalla, se ve tenue en 22–23 de 32 y 33 de 45 líneas: `rib-shadow-pleura-residual`. La pleura recibe la
  //    transmisión de la apertura, una media de amplitudes en la que pesan las tomas del borde redondo de la costilla (sin
  //    la fase que añadiría el hueso), y la línea A en la sombra la trae el pedestal de lóbulos laterales de la pasada D
  //    (sin él, 0 líneas); el preajuste deja la línea pleural 15–18 dB por encima del blanco.
  test.setTimeout(300_000);
  const errors = await openBench(page);
  for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const) {
    const s = await page.evaluate((id) => window.__lusTest!.ribShadow({ startPoint: id, respiration: 'apnea-expiratory' }), startPoint);
    const ref = s.intercostalPleuraDb;
    const bone = s.lines.filter((x) => x.bone);
    const fully = bone.filter((x) => x.fullyShadowed);
    const rel = (db: number): string => (db - ref).toFixed(1);
    const tag = `${startPoint}: ref ${ref.toFixed(1)} dB; ${bone.length} líneas con hueso, ${fully.length} en sombra completa; ${JSON.stringify(
      bone.map((x) => [
        x.line,
        x.edgeLines,
        x.fullyShadowed ? 1 : 0,
        rel(x.pleuraDb),
        x.pleuraDisplayDb.toFixed(1),
        x.a2DisplayDb.toFixed(1),
      ]),
    )}`;
    // cada punto de partida corta al menos una costilla (el BLUE superior, solo el borde de la 5.ª: `ribs-5-10-only`)
    expect(bone.length, tag).toBeGreaterThan(startPoint === 'blueUpper' ? 5 : 50);
    if (startPoint !== 'blueUpper') expect(fully.length, tag).toBeGreaterThan(20);
    // F-T08: la intensidad media de cada sombra (sus líneas con hueso, contiguas), ≥ 20 dB bajo el eco pleural intercostal
    const runs: (typeof bone)[] = [];
    for (const x of s.lines) {
      if (!x.bone) continue;
      const last = runs[runs.length - 1];
      if (last && last[last.length - 1].line === x.line - 1) last.push(x);
      else runs.push([x]);
    }
    for (const run of runs) {
      const mean = 10 * Math.log10(run.reduce((a, x) => a + 10 ** (x.belowDb / 10), 0) / run.length);
      expect(mean - ref, `sombra ${run[0].line}–${run[run.length - 1].line} (${tag})`).toBeLessThanOrEqual(-20);
    }
    // lo que se ve de la pleura dentro de la sombra es la penumbra de la apertura (física: parte del cono pasa junto a la
    // costilla): a más de −40 dB (a medio camino entre el borde, −8 dB, y la sombra completa) solo fuera de la completa
    for (const x of bone) if (x.pleuraDb - ref > -40) expect(x.fullyShadowed, `línea ${x.line} (${tag})`).toBe(false);
    for (const x of fully) {
      // la costilla apaga la pleura y oscurece la sombra completa (su transmisión, −64…−79 dB ida y vuelta por un rayo)
      expect(x.pleuraDb - ref, tag).toBeLessThanOrEqual(-40);
      expect(x.belowDb - s.intercostalWindowDb, tag).toBeLessThanOrEqual(-40);
    }
    if (fully.length) {
      // F-T08, sin línea pleural ni líneas A bajo la costilla: aún no. La desviación declarada
      // (`rib-shadow-pleura-residual`), con su tamaño medido (±2,5 dB): cuando se corrija, esta prueba fallará aquí;
      // entonces se exige la meta (nada sobre el negro de la pantalla en la sombra completa) y se borra la limitación
      const top = Math.max(...fully.map((x) => x.pleuraDb - ref));
      expect(top, tag).toBeGreaterThan(-50);
      expect(top, tag).toBeLessThan(-43.5);
      const topShown = Math.max(...fully.map((x) => x.pleuraDisplayDb));
      expect(topShown, tag).toBeGreaterThan(-32);
      expect(topShown, tag).toBeLessThan(-27);
      const a2Shown = Math.max(...fully.map((x) => x.a2DisplayDb));
      expect(a2Shown, tag).toBeGreaterThan(-61);
      expect(a2Shown, tag).toBeLessThan(-53);
      expect(
        fully.every((x) => x.pleuraDisplayDb <= -s.dynamicRangeDb && x.a2DisplayDb <= -s.dynamicRangeDb),
        `F-T08: nada sobre el negro de la pantalla en la sombra completa (${tag})`,
      ).toBe(false);
    }
  }
  expect(errors).toEqual([]);
});
