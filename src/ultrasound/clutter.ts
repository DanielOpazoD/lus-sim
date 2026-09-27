/**
 * Ecos parásitos del modo fundamental (decisión 76): lo que en un ecógrafo real ensucia las luces anecoicas
 * (vasos, vesícula) y que el simulador no tenía («luces sin ruido», el juez ciego de la ronda 2).
 *
 *  - Lóbulos laterales: la PSF lateral de dos vías no es solo el lóbulo principal gaussiano de `beamModel.ts`;
 *    los lóbulos laterales de la apertura, y sobre todo la aberración de fase de la pared (grasa y músculo con otra
 *    velocidad del sonido), reparten una fracción de la energía en un pedestal ancho. Se modela como una segunda
 *    gaussiana en el núcleo de la pasada D, de anchura `sidelobeWidth` veces la del lóbulo principal, con una
 *    pantalla de fase fija (`SIDELOBE_PHASES`) y con energía relativa ISLR exacta en el núcleo discreto: dentro del
 *    tejido no cambia nada visible, pero junto a una cara brillante (diafragma, pared de la VCI, costilla) lleva al
 *    interior de la luz vecina una neblina moteada.
 *  - Reverberación de la pared: el eco de las caras fuertes de la pared (piel, fascias, peritoneo, costillas) vuelve
 *    a reflejarse en la cara de la sonda y recorre la pared otra vez: llega de nuevo a una y dos veces el grosor de
 *    la pared más abajo. La pasada C suma al campo dos réplicas del propio campo tomadas W y 2W más arriba (aparecen
 *    más hondas), ancladas a la sonda (no al tejido), y cada una paga su viaje extra por la pared: la transmisión de
 *    ida y vuelta de la línea hasta W, una vez por orden. Tras una costilla o un gas esa transmisión es ~0 y no hay
 *    réplica en su sombra; con la TGC nominal, que compensa el camino extra, en pantalla quedan a
 *    `reverbFirstDb`/`reverbSecondDb` de su fuente. En el tejido quedan bajo el moteado; en una luz cercana a la pared
 *    (vesícula, VCI subxifoidea) dan bandas tenues paralelas a la piel.
 *
 *
 * lus-sim (ciclo 2, decisión 20): los lóbulos laterales son de la apertura de la línea de destino. El eco de una muestra
 * vecina entra por ellos a través de lo que esa apertura tiene delante: bajo una costilla, la costilla. La pasada D
 * convolucionaba el campo de las vecinas, que lleva su propia transmisión, y así el pedestal traía al núcleo de la sombra
 * la línea pleural y las líneas A de los espacios intercostales vecinos (6–10 dB sobre lo que deja pasar la costilla).
 * Ahora cada vecina entra en el pedestal con la menor de las dos transmisiones (`pedestalShadowFactor`, la de ida y
 * vuelta con que la pasada B dibujó cada muestra): donde nada tapa la apertura, como antes. El lóbulo principal no
 * cambia: su anchura es la del haz, y la penumbra que deja en el borde de la sombra es la de la apertura (decisión 54).
 *
 * Los dos crecen con la grasa subcutánea (la aberración y la reverberación empeoran en el obeso) y la armónica
 * tisular los reduce (decisión 77); en las réplicas, por orden (la segunda paga dos veces la pendiente de la grasa y
 * la reducción de la armónica). Niveles [ESTIMADO] con capturas de GPU frente a las referencias de la revisión.
 * Gemelos: `lateralKernel` (el núcleo de `FRAG_LATERAL`, misma fórmula), `reverbGains` y `reverbGateWeight` (las
 * réplicas de `FRAG_AXIAL`); los usan los gemelos de CPU (`wallTwin`, `interfaceTwin`, la prueba del receptor).
 */
export const CLUTTER = {
  /** Energía del pedestal de lóbulos laterales respecto a la del principal (dB), en el paciente de referencia. */
  sidelobeIslrDb: -24,
  /** Anchura del pedestal (σ, en múltiplos de la σ del lóbulo principal). */
  sidelobeWidth: 7,
  /** Radio máximo del núcleo lateral (líneas). */
  lateralMaxLines: 40,
  /** Réplicas de reverberación de la pared: primera (a W) y segunda (a 2W), dB de amplitud sobre su fuente. */
  reverbFirstDb: -50,
  reverbSecondDb: -62,
  /**
   * Solo reverberan los ecos fuertes: umbral suave sobre el módulo del campo en bruto (con la atenuación hasta la
   * fuente). Solo lo pasan las caras fuertes de la pared y las costillas, en los primeros ~4,5 cm (5 puntos de
   * partida × 2 casos: la fuente más honda a 30–44 mm); el moteado, nunca.
   */
  reverbGate: [1.5, 3.5] as const,
  /**
   * Solo la pared reverbera: la fuente de una réplica está a lo sumo a W + esto (su cara interna, el peritoneo). Una
   * costilla más honda que la pared (la intercostal) se copiaba a z + W dentro de su propia sombra; su múltiplo real
   * (costilla–sonda, a 2z) es otro camino que el modelo no dibuja.
   */
  reverbSourceMarginMm: 3,
  /** Grasa subcutánea de referencia (mm): con más grasa, más aberración y más reverberación. */
  fatRefMm: 14,
  /** Pendiente con la grasa (dB por mm por encima de la referencia; negativa por debajo), por orden en las réplicas. */
  fatSlopeDbPerMm: 0.35,
  /** La armónica tisular (decisión 77) reduce el pedestal y cada orden de reverberación estos dB. */
  harmonicReductionDb: 12,
} as const;

/** Parámetros de los ecos parásitos para una pared y un modo: energía del pedestal y ganancias de las réplicas. */
export interface ClutterParams {
  /** Energía del pedestal sobre la del lóbulo principal (potencia lineal, ISLR). 0: sin pedestal. */
  sidelobeIslr: number;
  sidelobeWidth: number;
  /** Profundidad de la cara interna de la pared (mm): el desplazamiento de las réplicas y el fondo de sus fuentes. */
  wallMm: number;
  /** Ganancias de amplitud de la primera y la segunda réplica sobre su fuente, sin la transmisión de la pared. */
  reverb: [number, number];
}

const dbAmp = (db: number): number => Math.pow(10, db / 20);

/** Parámetros para una pared de `wallMm` con `fatMm` de grasa subcutánea, en fundamental o en armónica. */
export function clutterParams(wallMm: number, fatMm: number, harmonic = false): ClutterParams {
  const c = CLUTTER;
  const fatDb = c.fatSlopeDbPerMm * (fatMm - c.fatRefMm) - (harmonic ? c.harmonicReductionDb : 0);
  return {
    sidelobeIslr: Math.pow(10, (c.sidelobeIslrDb + fatDb) / 10),
    sidelobeWidth: c.sidelobeWidth,
    wallMm,
    reverb: [dbAmp(c.reverbFirstDb + fatDb), dbAmp(c.reverbSecondDb + 2 * fatDb)],
  };
}

/**
 * Pantalla de fase del pedestal por desplazamiento de línea k ∈ [−R, R] (R = `lateralMaxLines`, índice k + R): la
 * aberración de la pared da a los lóbulos laterales una fase aleatoria fija. Antisimétrica, φ(−k) = φ(k) + π y
 * φ(0) = π/2: sobre un reflector continuo (el mismo campo en todas las líneas) los pares ±k se cancelan y el término
 * central queda en cuadratura con el principal, así que el eco especular calibrado no cambia (≤ 0,5 %), mientras su
 * energía (ISLR) lleva a las luces el moteado de lo que las rodea. Con una fase cualquiera, la suma del paseo
 * aleatorio sesgaba ese eco de −2,4 % a +3,5 % según la anchura del haz. Generador congruencial determinista: la misma
 * tabla en TS y en GLSL.
 */
export const SIDELOBE_PHASES: readonly number[] = (() => {
  const R = CLUTTER.lateralMaxLines;
  let s = 20260926;
  const out = new Array<number>(2 * R + 1);
  out[R] = Math.PI / 2;
  for (let k = 1; k <= R; k++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const phi = (s / 2147483648) * 2 * Math.PI;
    out[R + k] = phi;
    out[R - k] = phi + Math.PI;
  }
  return out;
})();

/** Radio del núcleo lateral (líneas): 2,5 σ del principal o, con pedestal, del pedestal; a lo sumo `lateralMaxLines`. */
function kernelRadius(sigmaLines: number, sigmaPed: number, pedestal: boolean): number {
  return Math.min(CLUTTER.lateralMaxLines, Math.ceil(Math.max(sigmaLines * 2.5, pedestal ? sigmaPed * 2.5 : 0)));
}

/**
 * Núcleo lateral de la pasada D (pesos complejos por línea, energía unidad): la gaussiana principal real de σ líneas
 * más el pedestal con su fase (`SIDELOBE_PHASES`), con la amplitud que da en el núcleo DISCRETO la energía
 * ISLR × acoplamiento² frente al principal (a² = ISLR·c²·Σg_m²/Σg_p²; la fórmula continua se quedaba 2 dB corta con
 * σ 0,35). `coupling` es el acoplamiento de la línea de destino: una línea sin contacto no recibe lóbulos laterales.
 * Gemelo de `FRAG_LATERAL`, que acumula el principal y el pedestal aparte y normaliza con Σ|w|² = Σg_m² + a²Σg_p²
 * + 2aΣg_m·g_p·cos φ.
 */
export function lateralKernel(
  sigmaLines: number,
  p: Pick<ClutterParams, 'sidelobeIslr' | 'sidelobeWidth'>,
  coupling = 1,
): Array<[number, number]> {
  const pedestal = p.sidelobeIslr > 0 && coupling > 0;
  const sp = sigmaLines * p.sidelobeWidth;
  const R = kernelRadius(sigmaLines, sp, pedestal);
  const Rmax = CLUTTER.lateralMaxLines;
  let sm = 0;
  let spp = 0;
  const gm: number[] = [];
  const gp: number[] = [];
  for (let k = -R; k <= R; k++) {
    const m = Math.exp(-0.5 * (k / sigmaLines) ** 2);
    const q = pedestal ? Math.exp(-0.5 * (k / sp) ** 2) : 0;
    gm.push(m);
    gp.push(q);
    sm += m * m;
    spp += q * q;
  }
  const amp = pedestal ? coupling * Math.sqrt((p.sidelobeIslr * sm) / spp) : 0;
  const w: Array<[number, number]> = gm.map((m, i) => {
    const ph = SIDELOBE_PHASES[i - R + Rmax];
    return [m + amp * gp[i] * Math.cos(ph), amp * gp[i] * Math.sin(ph)];
  });
  const n = Math.sqrt(w.reduce((a, [re, im]) => a + re * re + im * im, 0));
  return w.map(([re, im]) => [re / n, im / n]);
}

/**
 * Factor con que una muestra vecina entra en el pedestal de la línea de destino (lus-sim, decisión 20): la menor de las
 * dos transmisiones de ida y vuelta sobre la de la vecina, min(1, T_destino/T_vecina). Gemelo de `pedestalShadow` en
 * `FRAG_LATERAL`. Una vecina sin transmisión (0) no aporta nada que atenuar.
 */
export function pedestalShadowFactor(tDest: number, tSource: number): number {
  return tSource > tDest ? tDest / tSource : 1;
}

/** GLSL de `pedestalShadowFactor`. */
export const PEDESTAL_SHADOW_GLSL = /* glsl */ `
float pedestalShadow(float tDest, float tSource) { return tSource > tDest ? tDest / tSource : 1.0; }
`;

/**
 * El núcleo de `lateralKernel` en sus dos partes, con la normalización de energía de la suma (lus-sim, decisión 20): el
 * principal (real) y el pedestal (complejo, con su amplitud y su fase), para atenuar cada vecina del pedestal por
 * separado. `main[i] + ped[i]` es `lateralKernel`.
 */
export function lateralKernelParts(
  sigmaLines: number,
  p: Pick<ClutterParams, 'sidelobeIslr' | 'sidelobeWidth'>,
  coupling = 1,
): { main: number[]; ped: Array<[number, number]> } {
  const pedestal = p.sidelobeIslr > 0 && coupling > 0;
  const sp = sigmaLines * p.sidelobeWidth;
  const R = kernelRadius(sigmaLines, sp, pedestal);
  const Rmax = CLUTTER.lateralMaxLines;
  let sm = 0;
  let spp = 0;
  const gm: number[] = [];
  const gp: number[] = [];
  for (let k = -R; k <= R; k++) {
    const m = Math.exp(-0.5 * (k / sigmaLines) ** 2);
    const q = pedestal ? Math.exp(-0.5 * (k / sp) ** 2) : 0;
    gm.push(m);
    gp.push(q);
    sm += m * m;
    spp += q * q;
  }
  const amp = pedestal ? coupling * Math.sqrt((p.sidelobeIslr * sm) / spp) : 0;
  const ped: Array<[number, number]> = gp.map((q, i) => {
    const ph = SIDELOBE_PHASES[i - R + Rmax];
    return [amp * q * Math.cos(ph), amp * q * Math.sin(ph)];
  });
  const n = Math.sqrt(gm.reduce((a, m, i) => a + (m + ped[i][0]) ** 2 + ped[i][1] ** 2, 0));
  return { main: gm.map((m) => m / n), ped: ped.map(([re, im]) => [re / n, im / n]) };
}

/**
 * Pasada D con el pedestal en sombra (lus-sim, decisión 20): Σ (principal + pedestal·factor(k))·f(k), con el factor de
 * `pedestalShadowFactor` de cada vecina. Con todos los factores en 1 es `applyComplexKernel(lateralKernel(…))`.
 */
export function applyLateralKernel(
  parts: { main: readonly number[]; ped: ReadonlyArray<readonly [number, number]> },
  at: (k: number) => readonly [number, number],
  pedestalFactor: (k: number) => number,
): [number, number] {
  const R = (parts.main.length - 1) / 2;
  let re = 0;
  let im = 0;
  for (let k = -R; k <= R; k++) {
    const m = parts.main[k + R];
    const f = pedestalFactor(k);
    const wr = m + f * parts.ped[k + R][0];
    const wi = f * parts.ped[k + R][1];
    const [fr, fi] = at(k);
    re += wr * fr - wi * fi;
    im += wr * fi + wi * fr;
  }
  return [re, im];
}

/** Aplica un núcleo complejo a un campo complejo: Σ w·f (producto complejo). */
export function applyComplexKernel(
  w: ReadonlyArray<readonly [number, number]>,
  at: (k: number) => readonly [number, number],
): [number, number] {
  const R = (w.length - 1) / 2;
  let re = 0;
  let im = 0;
  for (let k = -R; k <= R; k++) {
    const [wr, wi] = w[k + R];
    const [fr, fi] = at(k);
    re += wr * fr - wi * fi;
    im += wr * fi + wi * fr;
  }
  return [re, im];
}

/** Tabla GLSL de la pantalla de fase (cos, sin) indexada por k + R. */
export const SIDELOBE_PHASE_GLSL = `const vec2 PED_PHASE[${2 * CLUTTER.lateralMaxLines + 1}] = vec2[${2 * CLUTTER.lateralMaxLines + 1}](${SIDELOBE_PHASES.map(
  (ph) => `vec2(${Math.cos(ph).toFixed(7)}, ${Math.sin(ph).toFixed(7)})`,
).join(', ')});`;

/** Peso de un eco en las réplicas de reverberación según el módulo de su campo en bruto (smoothstep de `reverbGate`). */
export function reverbGateWeight(fieldMagnitude: number): number {
  const [a, b] = CLUTTER.reverbGate;
  const t = Math.min(1, Math.max(0, (fieldMagnitude - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Ganancias de la primera y la segunda réplica de `FRAG_AXIAL` en una línea cuya transmisión de ida y vuelta hasta la
 * cara interna de la pared es `tWall`: cada orden paga un viaje más por la pared (tWall, tWall²).
 */
export function reverbGains(p: Pick<ClutterParams, 'reverb'>, tWall: number): [number, number] {
  return [p.reverb[0] * tWall, p.reverb[1] * tWall * tWall];
}
