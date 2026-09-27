import { FB } from './parameters';
import { median, otsu, parabolicPeak, quantile } from './stats';

/**
 * Detección de las estructuras del patrón normal en el espacio del haz (decisión 21): la línea pleural, las sombras
 * costales y las líneas A, automática y desde la imagen (en los clips reales no hay verdad de terreno). Todo lo que
 * decide es equivariante a g → a·g + b (máximos, umbral de Otsu exacto, medianas, cocientes), así que la detección no
 * cambia con la ganancia ni con el rango dinámico mientras nada se sature.
 *
 *  1. La cresta más brillante de cada columna (suavizada) en la mitad alta del sector: la línea pleural en un espacio
 *     intercostal, la superficie de la costilla sobre una sombra.
 *  2. La energía bajo esa cresta (de 1,2 a 2,2 veces su profundidad: la neblina y la primera línea A). Las columnas con
 *     poca energía (umbral de Otsu) forman tramos candidatos a sombra; un tramo es sombra si es ancho y si su cresta está
 *     por encima de la pleura (la costilla está más cerca de la piel que la pleura: F-T08, signo del murciélago).
 *  3. La pleura de cada columna intercostal, lejos de la penumbra de las sombras, y d_pl, su mediana.
 *  4. El perfil axial de las columnas intercostales, cada una alineada en su pleura (u = r/p_j), y sus picos cerca de
 *     u = k (métricas A1 y A2 de `docs/knowledge/reference-images.md` §3.2): el pico en la media de las columnas, su fondo
 *     en la mediana.
 */
export interface BeamImage {
  rows: number;
  cols: number;
  /** filas × columnas, NaN fuera del cuadro. */
  data: Float64Array;
}

export interface ShadowRun {
  /** Columnas [from, to] del tramo de sombra. */
  from: number;
  to: number;
  /** Profundidad (px) de la superficie costal: la mediana de la cresta en su núcleo. */
  ribTopPx: number;
}

export interface ALinePeak {
  /** Orden (1 = la línea pleural). */
  k: number;
  /** Posición del pico en múltiplos de la pleura de cada columna, y su gris en el perfil. */
  u: number;
  grey: number;
  /** Fondo local (mediana del perfil en k ± `aLineBackground`) y prominencia sobre él. */
  background: number;
  prominence: number;
  /** r_k = prominencia/prominencia de la línea pleural (A2). */
  ratio: number;
  /** Máximo local dentro de la ventana (no en su borde). */
  found: boolean;
  /** Encontrado, r_k ≥ `aLineMinRatio` y prominencia ≥ 3 veces el ruido del perfil. */
  visible: boolean;
}

export interface Structures {
  /** Distancia piel–pleura (px, mediana de las columnas intercostales). */
  dPlPx: number;
  /** Pleura de cada columna (px; NaN si la columna no es intercostal útil). */
  pleuraPx: Float64Array;
  /** Columnas intercostales útiles (fuera de las sombras y de su penumbra, con pleura). */
  intercostal: number[];
  shadows: ShadowRun[];
  /** Columnas del núcleo de las sombras (sin la penumbra). */
  shadowCore: number[];
  /** Perfil axial de las columnas intercostales (su media en cada u), en pasos de `du` desde u = 0. */
  profile: Float64Array;
  du: number;
  /** Perfil de las columnas del núcleo de sombra, en las mismas u con la d_pl global (vacío sin sombras). */
  shadowProfile: Float64Array;
  aLines: ALinePeak[];
  /** Órdenes visibles seguidos desde k = 2 (las líneas A que se ven). */
  visibleALines: number;
  /** Ruido del perfil (σ estimada con la segunda diferencia). */
  profileNoise: number;
  /** Diagnóstico de la separación de sombras: umbral de Otsu y η. */
  shadowSplit: { threshold: number; eta: number };
  /** Tramos oscuros con la cresta sobre la pleura descartados por tener crestas de varias poblaciones (compuerta del banco). */
  rejectedShadows: number;
}

/** B(i, j) con NaN fuera. */
const at = (b: BeamImage, i: number, j: number): number => b.data[i * b.cols + j];

/** Suavizado de caja (±`lat` columnas, ±`ax` filas) que ignora los NaN. */
export function boxSmooth(b: BeamImage, lat: number, ax: number): Float64Array {
  const { rows, cols } = b;
  const tmp = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      let s = 0;
      let n = 0;
      for (let d = -lat; d <= lat; d++) {
        const jj = j + d;
        if (jj < 0 || jj >= cols) continue;
        const v = at(b, i, jj);
        if (Number.isFinite(v)) {
          s += v;
          n++;
        }
      }
      tmp[i * cols + j] = n ? s / n : Number.NaN;
    }
  const out = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      let s = 0;
      let n = 0;
      for (let d = -ax; d <= ax; d++) {
        const ii = i + d;
        if (ii < 0 || ii >= rows) continue;
        const v = tmp[ii * cols + j];
        if (Number.isFinite(v)) {
          s += v;
          n++;
        }
      }
      out[i * cols + j] = n ? s / n : Number.NaN;
    }
  return out;
}

/** Máximo de la columna j entre las filas [a, b] (con refinado parabólico): fila y valor; NaN si no hay datos. */
function columnPeak(s: Float64Array, cols: number, j: number, a: number, b: number): { row: number; value: number } {
  let best = -1;
  let v = Number.NEGATIVE_INFINITY;
  for (let i = Math.max(0, a); i <= b; i++) {
    const x = s[i * cols + j];
    if (Number.isFinite(x) && x > v) {
      v = x;
      best = i;
    }
  }
  if (best < 0) return { row: Number.NaN, value: Number.NaN };
  const ym = best > 0 ? s[(best - 1) * cols + j] : Number.NaN;
  const yp = s[(best + 1) * cols + j];
  if (!Number.isFinite(ym) || !Number.isFinite(yp)) return { row: best, value: v };
  const p = parabolicPeak(ym, v, yp);
  return { row: best + p.offset, value: p.value };
}

/** Media de la columna j entre las filas [a, b] (NaN fuera); NaN si no hay datos. */
function columnMean(s: Float64Array, cols: number, rows: number, j: number, a: number, b: number): number {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, Math.floor(a)); i <= Math.min(rows - 1, Math.ceil(b)); i++) {
    const x = s[i * cols + j];
    if (Number.isFinite(x)) {
      sum += x;
      n++;
    }
  }
  return n ? sum / n : Number.NaN;
}

/** B en la fila fraccionaria r de la columna j (interpolación lineal); NaN fuera. */
export function sampleRow(b: BeamImage, r: number, j: number): number {
  if (!(r >= 0 && r <= b.rows - 1)) return Number.NaN;
  const i = Math.min(Math.floor(r), b.rows - 2);
  const f = r - i;
  const a = at(b, i, j);
  const c = at(b, i + 1, j);
  return a + (c - a) * f;
}

/** Tramos de columnas consecutivas que cumplen `pred`. */
function runs(n: number, pred: (j: number) => boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = -1;
  for (let j = 0; j <= n; j++) {
    const on = j < n && pred(j);
    if (on && start < 0) start = j;
    if (!on && start >= 0) {
      out.push({ from: start, to: j - 1 });
      start = -1;
    }
  }
  return out;
}

/**
 * `prior`: la pleura del cuadro medio del clip (px). Con ella, la pleura de cada cuadro se busca a ±30 % de esa profundidad
 * y no como la cresta más brillante de la columna: en un clip real la sonda y el pulmón se mueven poco entre cuadros, pero
 * una fascia o un eco hondo pueden ser, en un cuadro suelto, más brillantes que la pleura (la d_pl saltaba entre cuadros en
 * los clips convexos de Born). Sin ella, la cresta.
 */
export function detectStructures(b: BeamImage, prior?: { dPlPx: number }): Structures {
  const { rows, cols } = b;
  const lat = Math.max(1, Math.round(0.006 * cols));
  const s = boxSmooth(b, lat, 1);
  const r0 = Math.round(FB.pleuraSearchFrom * rows);
  const r1 = Math.round(FB.pleuraSearchTo * rows);
  // 1–2: la cresta de cada columna y la energía bajo ella
  const crest = Array.from({ length: cols }, (_, j) => columnPeak(s, cols, j, r0, r1));
  const below = crest.map((c, j) =>
    Number.isFinite(c.row) ? columnMean(s, cols, rows, j, c.row + Math.max(2, 0.2 * c.row), c.row + 1.2 * c.row) : Number.NaN,
  );
  const split = otsu(below);
  const minRun = Math.max(2, Math.round(FB.minShadowFraction * cols));
  const margin = Math.max(2, Math.round(FB.penumbraFraction * cols));
  // tramos bajo el umbral, unidos a través de huecos de menos de media penumbra (el moteado parte una sombra)
  const merged: { from: number; to: number }[] = [];
  if (Number.isFinite(split.threshold))
    for (const r of runs(cols, (j) => Number.isFinite(below[j]) && below[j] <= split.threshold)) {
      const last = merged[merged.length - 1];
      if (last && r.from - last.to - 1 <= Math.max(2, Math.floor(0.5 * margin))) last.to = r.to;
      else merged.push({ ...r });
    }
  let candidates = merged.filter((r) => r.to - r.from + 1 >= minRun);
  const near = (j: number, rs: { from: number; to: number }[]): boolean => rs.some((r) => j >= r.from - margin && j <= r.to + margin);
  const edge = (j: number): boolean => j < margin || j >= cols - margin;
  const usePrior = !!prior && Number.isFinite(prior.dPlPx) && prior.dPlPx > 0;
  // la pleura de referencia: la cresta mediana lejos de los tramos oscuros; si no queda ninguna columna (sin costillas, Otsu
  // parte el ruido de una energía pareja y sus tramos, con su penumbra, lo cubren todo), la de todas
  const crestRows = (keep: (j: number) => boolean): number[] => crest.filter((_, j) => keep(j) && !edge(j)).map((c) => c.row);
  const clear = median(crestRows((j) => !near(j, candidates)));
  const dPl0 = usePrior ? prior.dPlPx : Number.isFinite(clear) ? clear : median(crestRows(() => true));
  // un tramo es sombra si su cresta (la superficie costal) está por encima de la pleura
  const core = (r: { from: number; to: number }): number[] => {
    const a = r.from + margin;
    const z = r.to - margin;
    if (a > z) return [Math.round(0.5 * (r.from + r.to))];
    return Array.from({ length: z - a + 1 }, (_, i) => a + i);
  };
  // y si esa cresta es una sola superficie: con crestas de dos o tres poblaciones (una fascia, la costilla, un eco hondo),
  // su mediana no es la superficie costal y el tramo no es una sombra limpia (IQR/mediana ≤ `ribCrestMaxSpread`)
  const crestSpread = (r: { from: number; to: number }): number => {
    const rows = core(r).map((j) => crest[j].row);
    return (quantile(rows, 0.75) - quantile(rows, 0.25)) / median(rows);
  };
  const aboveThePleura = candidates.filter((r) => median(core(r).map((j) => crest[j].row)) < dPl0 - Math.max(1, 0.05 * dPl0));
  const rejectedShadows = aboveThePleura.filter((r) => !(crestSpread(r) <= FB.ribCrestMaxSpread)).length;
  candidates = aboveThePleura.filter((r) => crestSpread(r) <= FB.ribCrestMaxSpread);
  // 3: la pleura de cada columna intercostal es su cresta (la pleura inclinada cambia de profundidad a lo largo del
  // sector: en el BLUE inferior, de 9 a 16 mm), sin saltos respecto de sus vecinas
  const pleuraPx = new Float64Array(cols).fill(Number.NaN);
  for (let j = 0; j < cols; j++) {
    if (edge(j) || near(j, candidates) || !Number.isFinite(dPl0)) continue;
    const r = usePrior ? columnPeak(s, cols, j, Math.floor(0.7 * dPl0), Math.ceil(1.3 * dPl0)).row : crest[j].row;
    if (Number.isFinite(r) && r > 0.5 * dPl0 && r < 1.5 * dPl0 && (!usePrior || (r > Math.floor(0.7 * dPl0) && r < Math.ceil(1.3 * dPl0))))
      pleuraPx[j] = r;
  }
  const win = Math.max(2, Math.round(0.05 * cols));
  const intercostal: number[] = [];
  for (let j = 0; j < cols; j++) {
    if (!Number.isFinite(pleuraPx[j])) continue;
    const local: number[] = [];
    for (let d = -win; d <= win; d++) if (j + d >= 0 && j + d < cols && Number.isFinite(pleuraPx[j + d])) local.push(pleuraPx[j + d]);
    if (Math.abs(pleuraPx[j] - median(local)) <= 0.15 * dPl0) intercostal.push(j);
    else pleuraPx[j] = Number.NaN;
  }
  const dPlPx = median(intercostal.map((j) => pleuraPx[j]));
  const shadows: ShadowRun[] = candidates.map((r) => ({ ...r, ribTopPx: median(core(r).map((j) => crest[j].row)) }));
  const shadowCore = candidates.flatMap(core);
  // 4: el perfil axial alineado en la pleura de cada columna: la media de las columnas en cada u (suave: la posición de los
  // picos) y su mediana (los fondos de las líneas A: sigue siendo una medida mientras menos de la mitad de sus columnas esté
  // en el negro, como la neblina casi negra del simulador; la media deja de serlo con un 5 %, `CLIP_MEAN_MAX`)
  const uMax = intercostal.length ? (rows - 1) / Math.max(...intercostal.map((j) => pleuraPx[j])) : 0;
  const du = Number.isFinite(dPlPx) && dPlPx > 0 ? 1 / dPlPx : 1;
  const nU = Math.max(0, Math.floor(uMax / du) + 1);
  const profile = new Float64Array(nU);
  const profileMedian = new Float64Array(nU);
  for (let k = 0; k < nU; k++) {
    const v = intercostal.map((j) => sampleRow(b, k * du * pleuraPx[j], j)).filter((x) => Number.isFinite(x));
    profile[k] = v.length ? v.reduce((a, x) => a + x, 0) / v.length : Number.NaN;
    profileMedian[k] = median(v);
  }
  const nS = shadowCore.length && Number.isFinite(dPlPx) ? Math.floor((rows - 1) / dPlPx / du) + 1 : 0;
  const shadowProfile = new Float64Array(nS);
  for (let k = 0; k < nS; k++) {
    const v = shadowCore.map((j) => sampleRow(b, k * du * dPlPx, j)).filter((x) => Number.isFinite(x));
    shadowProfile[k] = v.length ? v.reduce((a, x) => a + x, 0) / v.length : Number.NaN;
  }
  const { peaks, visible, noise } = aLinePeaks(profile, du, profileMedian);
  return {
    dPlPx,
    pleuraPx,
    intercostal,
    shadows,
    shadowCore,
    profile,
    du,
    shadowProfile,
    aLines: peaks,
    visibleALines: visible,
    profileNoise: noise,
    shadowSplit: split,
    rejectedShadows,
  };
}

/** Mediana del perfil entre u = a y u = b. */
export function profileBand(profile: Float64Array, du: number, a: number, b: number): number {
  const out: number[] = [];
  for (let k = Math.max(0, Math.ceil(a / du)); k <= Math.min(profile.length - 1, Math.floor(b / du)); k++) out.push(profile[k]);
  return median(out);
}

/**
 * Picos del perfil (k = 1 la línea pleural): la línea pleural y la de orden 2 en k ± `aLineWindow`; desde el orden 3, en
 * 1 + (k − 1)·Δ ± ½·`aLineWindow`, con Δ = u₂ − 1 el primer espaciado medido: las líneas A son equidistantes, y si la
 * piel no está en el borde superior del clip (un desfase c) todas se corren igual, u_k = 1 + (k − 1)·d/(d − c), así que
 * la serie se busca con su propio paso y no con el de la piel. Un pico cuenta si es un máximo local dentro de su ventana,
 * con refinado parabólico; el fondo, la mediana en u ± `aLineBackground`; r_k, la prominencia sobre la de la línea pleural.
 * El ruido del perfil se estima con la segunda diferencia (σ = 1,4826·MAD/√6) desde u = 1,25, donde no está la subida de
 * la pleura.
 */
export function aLinePeaks(
  profile: Float64Array,
  du: number,
  backgroundProfile: Float64Array = profile,
): { peaks: ALinePeak[]; visible: number; noise: number } {
  const n = profile.length;
  const uMax = (n - 1) * du;
  const d2: number[] = [];
  for (let k = Math.ceil(1.25 / du) + 1; k < n - 1; k++) {
    const v = profile[k - 1] - 2 * profile[k] + profile[k + 1];
    if (Number.isFinite(v)) d2.push(Math.abs(v));
  }
  const noise = d2.length ? (1.4826 * median(d2)) / Math.sqrt(6) : Number.NaN;
  const peaks: ALinePeak[] = [];
  for (let k = 1; k + FB.aLineBackground <= uMax; k++) {
    const step = peaks[1]?.found ? peaks[1].u - 1 : 1;
    const center = k <= 2 ? k : 1 + (k - 1) * step;
    const half = k <= 2 ? FB.aLineWindow : 0.5 * FB.aLineWindow;
    if (center + FB.aLineBackground > uMax) break;
    const a = Math.max(1, Math.ceil((center - half) / du));
    const z = Math.min(n - 2, Math.floor((center + half) / du));
    let best = -1;
    for (let i = a; i <= z; i++) if (Number.isFinite(profile[i]) && (best < 0 || profile[i] > profile[best])) best = i;
    const background = profileBand(backgroundProfile, du, center - FB.aLineBackground, center + FB.aLineBackground);
    const found = best > a && best < z;
    const p = found ? parabolicPeak(profile[best - 1], profile[best], profile[best + 1]) : { offset: 0, value: Number.NaN };
    const grey = found ? p.value : Number.NaN;
    peaks.push({
      k,
      u: found ? (best + p.offset) * du : Number.NaN,
      grey,
      background,
      prominence: grey - background,
      ratio: Number.NaN,
      found,
      visible: false,
    });
  }
  const p1 = peaks[0];
  let visible = 0;
  let run = true;
  for (const pk of peaks) {
    pk.ratio = p1 && p1.found && p1.prominence > 0 ? pk.prominence / p1.prominence : Number.NaN;
    pk.visible = pk.found && pk.ratio >= FB.aLineMinRatio && (!(noise > 0) || pk.prominence >= 3 * noise);
    if (pk.k >= 2) {
      if (run && pk.visible) visible++;
      else run = false;
    }
  }
  return { peaks, visible, noise };
}
