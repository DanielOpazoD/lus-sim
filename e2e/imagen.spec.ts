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
  // el volumen tiene dientes: los tejidos del tórax de la escena (medido con la parrilla del paso C1, decisión 16, y la pared
  // por región del C2, decisión 17, con GPU real y con SwiftShader: pulmón 18 418, «resto» 15 036, músculo 4915, columna
  // 1968, grasa 1556, piel 864, hueso 424 (costillas y esternón) y cartílago 62 de 43 352 interiores; con la pared heredada,
  // grasa 8548 y músculo 3881; con las costillas 5.ª–10.ª derechas de VExUS, 106 de hueso)
  for (const t of ['Lung', 'Fat', 'Muscle', 'Bowel', 'Vertebra', 'Skin', 'Bone'])
    expect(vol.byTissue[t] ?? 0, `${t}: ${vtag}`).toBeGreaterThan(200);
  expect(vol.byTissue.Cartilage ?? 0, vtag).toBeGreaterThan(20);
  expect(vol.interfacePoints, vtag).toBeGreaterThan(3000);
  expect(vol.interfaceAgreement, vtag).toBe(1);
  // GPU real (M4): 2·10⁻⁵ mm; SwiftShader, 0,014 mm (en VExUS, la cara del diafragma): una décima del eco
  expect(vol.interfaceDistanceMaxErr, vtag).toBeLessThan(0.02);
  // la distancia al borde del tejido, la que funde los bordes en la pasada B (hasta 10 mm, lo que puede importar;
  // lo añadió la revisión), donde es continua (`boundaryStable`: sin el salto del pulmón de la cortina al del tórax, el
  // mismo tejido, a 3 mm de la pleura): GPU real 1·10⁻⁴ mm, SwiftShader 0,014 mm
  expect(vol.boundaryDistanceMaxErr, vtag).toBeLessThan(0.02);
  // y lo que no se compara es poco: los puntos junto a la cara interna de la lámina de la cortina
  expect(vol.boundaryUnstable, vtag).toBeLessThan(0.005 * vol.interiorPoints);
  // Los extremos de las 24 costillas (lo pidió la revisión del paso C1: el volumen apenas los toca): nubes de 22 680 puntos
  // alrededor de las uniones esternocostales, las condrocostales, las puntas y los extremos posteriores, hasta 0,05 mm de
  // los bordes. GPU real y SwiftShader, con la pared por región (decisión 17): 19 613 interiores (hueso 3450, cartílago
  // 1880), acuerdo 1 de tejido y de cara, |Δifd| ≤ 0,0004 mm y, en 2294 puntos de la banda del eco de la cortical o del
  // pericondrio, |n_GPU·n_TS| ≥ 0,9999997
  const ends = await page.evaluate(() => window.__lusTest!.ribEnds());
  const etag = JSON.stringify(ends);
  expect(ends.interiorPoints, etag).toBeGreaterThan(15_000);
  expect(ends.byTissue.Bone ?? 0, etag).toBeGreaterThan(1000);
  expect(ends.byTissue.Cartilage ?? 0, etag).toBeGreaterThan(1000);
  expect(ends.tissueAgreement, etag).toBe(1);
  expect(ends.faceAgreement, etag).toBe(1);
  expect(ends.faceDistanceMaxErr, etag).toBeLessThan(0.02);
  expect(ends.normalPoints, etag).toBeGreaterThan(1000);
  expect(ends.normalMin, etag).toBeGreaterThan(0.9999);
  // Cáscara: los puntos a 0,01–0,6 mm de una cara donde se dibuja su eco, según la CPU o la GPU. En el tórax la cara
  // interna de la pared (Peritoneum en la tabla de VExUS) es la pleura parietal. Con la parrilla del paso C1 y la pared por
  // región del C2, 17 626 puntos (2726 de la cortical costal) y acuerdo 1 con GPU real (con SwiftShader, 0,99994: un empate
  // en el umbral de prioridad de la cortical, a 1,300 mm)
  const shell = await page.evaluate(() => window.__lusTest!.interfaceShell());
  const stag = JSON.stringify(shell);
  expect(shell.points, stag).toBeGreaterThan(5000);
  // (lus-sim, decisión 17: en la pared torácica el primer plano intermuscular se funde con la fascia profunda; el oblicuo es
  // del abdomen, fuera de los planos de partida)
  for (const face of ['SkinFat', 'Scarpa', 'DeepFascia', 'TransversusPlane', 'Transversalis', 'Peritoneum', 'RibCortex'])
    expect(shell.byInterface[face] ?? 0, `${face}: ${stag}`).toBeGreaterThan(50);
  expect(shell.byInterface.ObliquePlane ?? 0, stag).toBe(0);
  expect(shell.agreement, stag).toBeGreaterThanOrEqual(0.999);
  expect(shell.distanceMaxErr, stag).toBeLessThan(0.02);
  // La pleura parietal de A0 frente a su gemelo, línea a línea: la registran las dos en las mismas líneas y en el mismo
  // sitio. GPU real: 0 mm (la bisección cae en múltiplos exactos de su paso final). SwiftShader: una decisión de la
  // bisección en una línea de 576 cambia con el redondeo y mueve D un paso final (0,0117 mm a 12 cm, 1/60 del eco de
  // 0,7 mm), y dz hasta 0,061 mm: con σ del borde blando ≥ σ_taper = 4 mm, la fracción de aire cambia < 1 %
  const pleura = await page.evaluate(() => window.__lusTest!.pleuraEquivalence());
  const ptag = JSON.stringify(pleura);
  // los tres puntos de partida y (lus-sim, decisión 18) la ventana cardiaca, sin pleura en su centro (el corazón toca la
  // pared), y el borde del pulmón en la axilar media izquierda
  expect(pleura.lines, ptag).toBe(5 * 192);
  expect(pleura.cpuPleura, ptag).toBeGreaterThan(0.7 * pleura.lines);
  expect(pleura.centralDepthMm.cardiacWindow, ptag).toBe(-1);
  expect(pleura.centralDepthMm.leftBorder, ptag).toBeGreaterThan(0);
  expect(pleura.registrationMismatch, ptag).toBe(0);
  expect(pleura.depthMaxErrMm, ptag).toBeLessThanOrEqual(pleura.quantumMm + 1e-5);
  // (lus-sim, decisión 17: con la pared torácica por región ese paso final cae, en la línea 150 del punto BLUE superior,
  // donde el borde del pulmón sube 5 mm por mm: dz 0,061 mm con SwiftShader, 0,0006 con la GPU real; antes, 0,032)
  expect(pleura.edgeMaxErrMm, ptag).toBeLessThan(0.1);
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
  // lus-sim (decisión 20): la transmisión con apertura de A, con la fase del hueso de cada toma, y la que dibuja B, frente a
  // sus gemelos sobre los segmentos de la GPU (con GPU real y con SwiftShader: ≤ 3·10⁻⁵ dB, ningún empate; ≈ 5200 de las
  // ≈ 5800 muestras con hueso en el cono en el BLUE inferior con una línea de cada 4); y la costilla de cada línea de A0
  // (su entrada y su salida exactas, la bisección del espejo) frente a la de TS sobre la clasificación de la CPU: 0 mm
  const la = t.look0Aperture!;
  const latag = JSON.stringify(la);
  expect(la.boneSamples, latag).toBeGreaterThan(0.5 * la.samples);
  expect(la.apertureMaxDiffDb, latag).toBeLessThan(0.01);
  expect(la.drawnMaxDiffDb, latag).toBeLessThan(0.01);
  expect(la.ambiguous, latag).toBeLessThan(0.01 * la.samples);
  const bc = t.boneChord!;
  expect(bc.lines, JSON.stringify(bc)).toBeGreaterThan(5);
  expect(bc.mismatched, JSON.stringify(bc)).toBe(0);
  expect(bc.maxErrMm, JSON.stringify(bc)).toBeLessThanOrEqual(bc.quantumMm + 1e-5);
  // Lo mismo en inspiración máxima: el diafragma 53 mm más abajo (la deformación respiratoria entra en los dos
  // gemelos; en reposo, con el descenso en 0, un signo cambiado de su uniform solo se veía por azar). Desde la decisión 22 la
  // excursión es la de la base y la inversa del campo, una bisección en la vertical (TS y GLSL): el barrido suma los planos
  // donde el campo cambia deprisa (la ventana cardiaca, el borde de la LAM izquierda y la cortina de la derecha) y la pleura
  // de A0 en los cinco planos de la equivalencia de la pleura
  const caudal = await page.evaluate(() => {
    const sim = window.__lusTest!.sim();
    sim.patient.respiratoryPattern = 'apnea-inspiratory';
    window.__lusTest!.advance(4);
    return sim.sample.resp.diaphragmCaudalMm;
  });
  expect(caudal).toBeGreaterThan(50);
  const insp = await page.evaluate(() => ({
    vol: window.__lusTest!.volumeEquivalence(20_000),
    sweep: window.__lusTest!.equivalenceSweep({ inspiration: true }),
    shell: window.__lusTest!.interfaceShell(),
    pleura: window.__lusTest!.pleuraEquivalence(),
  }));
  const itag = JSON.stringify({ caudal, ...insp });
  expect(insp.vol.interiorPoints, itag).toBeGreaterThan(15_000);
  expect(insp.vol.tissueAgreement, itag).toBe(1);
  expect(insp.vol.interfaceAgreement, itag).toBe(1);
  expect(insp.vol.interfaceDistanceMaxErr, itag).toBeLessThan(0.02);
  expect(insp.vol.boundaryDistanceMaxErr, itag).toBeLessThan(0.02);
  expect(insp.sweep.map((r) => r.id)).toEqual(['blueUpper', 'blueLower', 'plaps', 'cardiacWindow', 'leftBorder', 'rightCurtain']);
  for (const r of insp.sweep) expect(r.interiorAgreement, itag).toBeGreaterThanOrEqual(0.99);
  expect(insp.shell.agreement, itag).toBeGreaterThanOrEqual(0.999);
  expect(insp.shell.distanceMaxErr, itag).toBeLessThan(0.02);
  expect(insp.pleura.lines, itag).toBe(5 * 192);
  expect(insp.pleura.centralDepthMm.cardiacWindow, itag).toBe(-1);
  expect(insp.pleura.registrationMismatch, itag).toBe(0);
  expect(insp.pleura.depthMaxErrMm, itag).toBeLessThanOrEqual(insp.pleura.quantumMm + 1e-5);
  expect(insp.pleura.edgeMaxErrMm, itag).toBeLessThan(0.1);
  expect(errors).toEqual([]);
});

test('el moteado del músculo de la pared tiene estadística de Rayleigh', async ({ page }) => {
  // Guarda de fidelidad de imagen (la de VExUS en el hígado): la envolvente de un speckle plenamente desarrollado tiene
  // SNR = 1,91; detectar intensidad (1,0), sumar magnitudes antes del haz (≈ 9) o suavizar la envolvente (≈ 3,7) salen
  // de la banda (`src/validation/speckle.test.ts`). El tórax no tiene un tejido sin estructura tan grande como el
  // hígado: el músculo de la pared entre sus estrías y sus caras, en la zona paraesternal, donde es una sola capa (en la
  // lateral, dos planos intermusculares cada ~2,5 mm no dejan sitio a un parche de 16 × 8). Con la parrilla del paso C1
  // (decisión 16) el esternón ocupa la línea media y las costillas la parte honda del músculo: las vistas van a 20–45 mm
  // de la línea media, a los dos lados, sobre los cartílagos. Se juntan los parches de siete vistas (con GPU real y con
  // SwiftShader: 59 parches, SNR 1,95–2,30 por vista, 2,13 de media; antes de la parrilla, 51 y 2,07).
  test.setTimeout(300_000);
  const errors = await openBench(page);
  const stats = await page.evaluate(() => {
    const views = [
      [0.56, 140, 0],
      [0.55, 70, 0],
      [0.45, 70, 0],
      [0.57, 160, 0],
      [0.43, 160, 0],
      [0.55, 100, 0],
      [0.45, 100, 0],
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
  // partida y en apnea espiratoria (27-09-2026, con la parrilla del paso C1, decisión 16, y la pared torácica por región del
  // C2, decisión 17: la pleura a 17,3, 14,0 y 16,7 mm, en 12, 10 y 7 grupos; las líneas del borde caudal del PLAPS que caen
  // bajo el borde del pulmón, sin pulmón detrás, no cuentan):
  //  - frente al cruce de la pleura D del gemelo de A0: los órdenes 1–4, a −0,15…+0,11 mm de k·D (antes de la decisión 15,
  //    con el perfil de la cara de un lado, −0,43…−0,26: toda la serie 0,35 mm por encima de su cruce), y la separación
  //    entre órdenes a ≤ 0,11 mm de D;
  //  - frente a la línea pleural mostrada (F-T01): los órdenes 2–4 a −0,31…+0,11 mm (antes de la decisión 15, el 2 a
  //    +0,27…+0,39, el 3 a +0,56…+0,76 y el 4 a +0,87…+1,13). 1 píxel = 0,268 mm;
  //  - con la composición espacial (la envolvente de K con el anillo lleno; el preajuste pulmonar la apaga, pero la consola
  //    la enciende): a −0,15…+0,11 mm de k·D y F-T01 a −0,41…+0,02 mm. El peso de las miradas dirigidas en K cambia en D
  //    (`curtainSteerWeight`: 1 encima, 1 − fAir debajo), sobre el pico de la línea pleural.
  test.setTimeout(300_000);
  const errors = await openBench(page);
  /** Cuántos errores caben en la tolerancia, y cuántos se exigen: todos, o el 90 % en el orden 4. */
  const within = (errs: number[], tol: number): number => errs.filter((e) => Math.abs(e) <= tol).length;
  const needed = (o: { k: number; errMm: number[] }, n = o.errMm.length): number => (o.k <= 3 ? n : Math.floor(0.9 * n));
  /** Grupos en que se exige ver el orden: casi todos; el 4.º, a 9–11 dB de prominencia con la pleura a 14–17 mm, en la mitad. */
  const seenIn = (o: { k: number; groups: number }): number => Math.floor((o.k <= 3 ? 0.9 : 0.5) * o.groups);
  for (const compound of [false, true])
    for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const) {
      const a = await page.evaluate(
        ([id, c]) => window.__lusTest!.aLines({ startPoint: id, respiration: 'apnea-expiratory', compound: c }),
        [startPoint, compound] as const,
      );
      const tag = `${startPoint}${compound ? ' (compuesto)' : ''}: ${JSON.stringify(a)}`;
      expect(a.groups, tag).toBeGreaterThanOrEqual(6);
      // la pleura a 14–17 mm (la pared torácica por región, decisión 17; antes, la del abdomen de VExUS, a 25–29 mm, con 4
      // órdenes): caben 6–8 órdenes en los 12 cm del preajuste. Se exigen los 1–4; los de más allá, a 6–8 dB de
      // prominencia (el 5.º en 4 de 12 grupos del punto BLUE superior, el 6.º en 1–2), no se distinguen del fondo
      expect(a.orders.map((o) => o.k).slice(0, 4), tag).toEqual([1, 2, 3, 4]);
      for (const o of a.orders.filter((x) => x.k <= 4)) {
        // cada orden se ve en casi todos los grupos; la línea A de orden 4 es la más débil: con la pared heredada, a ~10 cm y
        // 16 dB de prominencia en el PLAPS, se perdía en 1 de sus 6 grupos; con la pared torácica por región (decisión 17), a
        // 6–7 cm y 9–11 dB, en 3 de 7–10 grupos (GPU real y SwiftShader, 27-09-2026). No es que se debilite: en el punto BLUE
        // superior su pico sube de −32,2 a −28,8 dB (envolvente), pero el fondo de su ventana de ±4 mm sube de −57,7 a −41,7:
        // la serie de las copias de la pared, más delgada, pierde 12 dB por orden en lugar de 17, y las réplicas de la pleura
        // siguen perdiendo ≈ 24
        expect(o.peaks, tag).toBeGreaterThanOrEqual(seenIn(o));
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
      for (const o of a.orders.filter((x) => x.k >= 2 && x.k <= 4)) {
        const worst = Math.max(Math.abs(o.minShownErrMm), Math.abs(o.maxShownErrMm));
        expect(
          within(o.shownErrMm, tol),
          `F-T01, orden ${o.k}: el peor ${worst.toFixed(2)} mm frente a ${tol} mm (${tag})`,
        ).toBeGreaterThanOrEqual(needed(o, o.shownErrMm.length));
      }
    }
  expect(errors).toEqual([]);
});

test('sombra costal en la envolvente de la GPU (F-T08): oscura, con la penumbra de la apertura; bajo la costilla, ni línea pleural ni líneas A en la pantalla', async ({
  page,
}) => {
  // Meta F-T08 (`docs/knowledge/physics.md` §3.3): bajo la costilla no hay línea pleural ni líneas A, y la intensidad
  // media de la sombra es ≥ 20 dB menor que la del eco pleural intercostal (su primera parte, la pleura 5 ± 1 mm bajo la
  // superficie costal, es geometría: `src/validation/anatomyTargets.test.ts`). Se mide en la envolvente de la GPU, línea a
  // línea (`ribShadow`), con la sombra clasificada con los datos de la pasada A: las líneas que cruzan hueso antes de la
  // pleura, la sombra completa (todas las tomas de sus conos de apertura cruzan hueso) y las líneas libres (ninguna toma
  // cruza hueso), cuyo eco pleural es la referencia. Lo que se ve se juzga en la pantalla, con el nivel del equipo del
  // cuadro (`displayLevelDb`) y el negro de 8 bits de la curva de grises (`blackLevelDb`, −69,7 dB con 70 de rango).
  //
  // La penumbra es física (decisión 20): una línea bajo el borde de la costilla ve la pleura vecina por las tomas de su
  // cono de emisión que pasan junto a la costilla o por su borde redondo, que es fino (el semiancho del cono en la
  // profundidad de la costilla, `coneHalfLines`), y por el lóbulo principal de su PSF lateral (2,5σ, `mainLobeLines`). El
  // núcleo de la sombra son las líneas de la sombra completa más allá de esa penumbra (25–36 por punto de partida). Medido
  // con GPU real (Apple M4) y con SwiftShader, en apnea espiratoria, con la parrilla del paso C1 y la pared por región del C2,
  // relativo al eco pleural intercostal (ciclo 2, 27-09-2026):
  //  - la línea pleural intercostal, sin saturar con el preajuste (consenso: Demi 2023): −0,9…−8,6 dB en la pantalla
  //    (antes, con 0 dB de ganancia, +12,4…+20,1 dB: saturada);
  //  - la intensidad media de cada sombra en la ventana D − 1 … 2·D + 1 mm, −38,0…−42,9 dB (−27,0 la sombra parcial del
  //    borde del sector del BLUE inferior; F-T08 pide −20);
  //  - la pleura a más de −40 dB solo dentro de la penumbra, a 6–8 líneas de su límite;
  //  - en el núcleo, la línea pleural a −68,7…−86,1 dB y en la pantalla a −71,1…−88,5 dB: negro (antes de la decisión 20,
  //    −40,6…−62,7 dB y −21,9…−43,4 en la pantalla, gris de 57 a 137); la ventana, ≥ 67,7 dB más oscura que la de las
  //    líneas libres;
  //  - la línea A de orden 2 en toda la sombra completa, −100,4…−114,9 dB en la pantalla (antes, tenue en 14–18 líneas por
  //    punto: el pedestal de lóbulos laterales de la pasada D la traía de los espacios vecinos).
  test.setTimeout(300_000);
  const errors = await openBench(page);
  for (const startPoint of ['blueUpper', 'blueLower', 'plaps'] as const) {
    const s = await page.evaluate((id) => window.__lusTest!.ribShadow({ startPoint: id, respiration: 'apnea-expiratory' }), startPoint);
    const ref = s.intercostalPleuraDb;
    const bone = s.lines.filter((x) => x.bone);
    const fully = bone.filter((x) => x.fullyShadowed);
    const penumbra = (x: (typeof bone)[number]): number => x.coneHalfLines + x.mainLobeLines;
    const core = fully.filter((x) => x.edgeLines > penumbra(x));
    const free = s.lines.filter((x) => x.free && !Number.isNaN(x.pleuraMm) && x.coupling >= 0.99);
    const rel = (db: number): string => (db - ref).toFixed(1);
    const tag = `${startPoint}: ref ${ref.toFixed(1)} dB; ${bone.length} líneas con hueso, ${fully.length} en sombra completa, ${core.length} en su núcleo; ${JSON.stringify(
      bone.map((x) => [
        x.line,
        x.edgeLines,
        penumbra(x).toFixed(1),
        x.fullyShadowed ? 1 : 0,
        rel(x.pleuraDb),
        x.pleuraDisplayDb.toFixed(1),
        x.a2DisplayDb.toFixed(1),
      ]),
    )}`;
    // cada punto de partida corta costillas enteras (el signo del murciélago; desde el paso C1, también el BLUE superior)
    expect(bone.length, tag).toBeGreaterThan(50);
    expect(core.length, tag).toBeGreaterThan(20);
    // la línea pleural intercostal no satura con el preajuste y sigue siendo lo más brillante (consenso, decisión 20)
    const freeShown = free.map((x) => x.pleuraDisplayDb);
    expect(Math.max(...freeShown), `línea pleural intercostal saturada (${tag})`).toBeLessThanOrEqual(0);
    expect(Math.max(...freeShown), tag).toBeGreaterThan(-3);
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
    // lo que se ve de la pleura dentro de la sombra es su borde: la penumbra de la apertura y del haz
    for (const x of bone) if (x.pleuraDb - ref > -40) expect(x.edgeLines, `línea ${x.line} (${tag})`).toBeLessThanOrEqual(penumbra(x));
    for (const x of core) {
      // la costilla apaga la pleura y oscurece el núcleo de la sombra
      expect(x.pleuraDb - ref, tag).toBeLessThanOrEqual(-60);
      expect(x.belowDb - s.intercostalWindowDb, tag).toBeLessThanOrEqual(-60);
      // F-T08 en la pantalla: bajo la costilla no hay línea pleural ni línea A (el negro de la pantalla)
      expect(x.pleuraDisplayDb, `F-T08, línea pleural en la pantalla, línea ${x.line} (${tag})`).toBeLessThanOrEqual(s.blackLevelDb);
    }
    // y la línea A no se ve en ninguna línea de la sombra completa
    for (const x of fully)
      expect(x.a2DisplayDb, `F-T08, línea A en la pantalla, línea ${x.line} (${tag})`).toBeLessThanOrEqual(s.blackLevelDb);
    // la pasada D, con el pedestal que entra por lo que la apertura de cada línea tiene delante, frente a su gemelo sobre el
    // campo que le dio la C (decisión 20; GPU real y SwiftShader: ≤ 2·10⁻⁵ dB hasta 100 dB bajo el máximo, y el pedestal
    // en sombra cambia la envolvente más de 3 dB en decenas de muestras de cada punto)
    const d = await page.evaluate((id) => window.__lusTest!.lateralParity({ startPoint: id }), startPoint);
    const dtag = `${startPoint}: ${JSON.stringify(d)}`;
    expect(d.samples, dtag).toBeGreaterThan(3000);
    expect(d.maxDiffDb, dtag).toBeLessThan(0.01);
    expect(d.shadowedSamples, dtag).toBeGreaterThan(20);
  }
  expect(errors).toEqual([]);
});
