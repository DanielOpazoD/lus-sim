import { FB } from './parameters';
import {
  beamSampler,
  detectSector,
  GREY_8BIT,
  type BeamSampler,
  type GreyFrame,
  type GreyScale,
  type Rect,
  type SectorDetection,
  type SectorGeometry,
} from './sector';
import { crossingLag, finite, mean, median, medianIqr, pearson, quantile, slope, std } from './stats';
import { detectStructures, sampleRow, type BeamImage, type Structures } from './structures';

/**
 * Métricas de fidelidad de imagen (decisión 21; `docs/knowledge/reference-images.md` §3.2) sobre cuadros de gris: las del
 * patrón normal (P1, P2, P4, A1, A2, T1, T2 y S1) y las propuestas del banco:
 *
 *  - **M** (sin suelo): cada nivel medido hacia abajo desde la línea pleural en «caídas de línea A»,
 *    M_x = (g_pl − g_x)/(g_pl − g_A1), para la pared, la neblina subpleural y el campo profundo; y **N4**, el cociente de
 *    brechas (g_pl − g_pared)/(g_A1 − g_A2). Invariantes a g → a·g + b sin necesitar un suelo.
 *  - **N1–N3**: los mismos niveles sobre el suelo de la sombra costal, (g_x − g_suelo)/(g_pl − g_suelo). Solo son
 *    invariantes si el suelo se mide; si está recortado en el negro (el simulador con el preajuste), dependen de la ganancia
 *    y se marcan censurados.
 *
 * Cada métrica que usa píxeles recortados, o una anchura al límite del muestreo, se marca en `censored` (una cota o un
 * valor sin dirección conocida): nunca se compara como una medida. Las longitudes van en px, en múltiplos de d_pl y, si hay
 * escala, en mm.
 */

/** Una longitud en px del cuadro, en múltiplos de la distancia piel–pleura y en mm (null sin escala). */
export interface Length {
  px: number;
  dPl: number;
  mm: number | null;
}

/**
 * Nivel de gris de una banda: la mediana de sus píxeles (en la escala del cuadro), cuántos son y la fracción recortada en
 * el negro (≤ lo + ½ escalón) o en el blanco (≥ hi − ½ escalón). Si la mitad o más está recortada, la mediana no es una
 * medida sino una cota (`censored`): el nivel real está por debajo del negro o por encima del blanco.
 */
export interface Level {
  grey: number;
  n: number;
  clippedLow: number;
  clippedHigh: number;
  censored: 'low' | 'high' | null;
}

/**
 * Cómo está censurada una métrica: `lower`, el valor es una cota inferior (el verdadero es ≥); `upper`, una superior;
 * `unknown`, entra un dato recortado en una dirección que no se sabe; `resolution`, una anchura al límite del muestreo.
 */
export type Censor = 'lower' | 'upper' | 'unknown' | 'resolution';

/** Un pico del perfil (la línea pleural o una línea A): su gris y la fracción de columnas recortadas en su posición. */
export interface PeakLevel {
  grey: number;
  clippedLow: number;
  clippedHigh: number;
}

export interface FrameMetrics {
  structures: {
    dPl: Length;
    intercostalColumns: number;
    shadows: { fromCol: number; toCol: number; ribTop: Length }[];
    shadowCoreColumns: number;
    shadowSplitEta: number;
    rejectedShadows: number;
    visibleALines: number;
    aLines: { k: number; u: number; grey: number; background: number; ratio: number; visible: boolean }[];
  };
  levels: {
    /** Bandas de §3.2 y de las propuestas (ver `FIDELITY_BENCH`). */
    wall: Level;
    haze: Level;
    deep: Level;
    floor: Level;
    /** P1: el tejido 10–40 % de d_pl sobre la pleura, la pleura (p95) y la cortical costal (p95). */
    p1Tissue: Level;
    pleuraP95: Level;
    ribP95: Level;
    /** Picos del perfil axial (la mediana de las columnas): línea pleural (k = 1) y líneas A de orden 2 y 3. */
    pleuraPeak: number;
    a1Peak: number;
    a2Peak: number;
    peaks: { pleura: PeakLevel; aLine1: PeakLevel; aLine2: PeakLevel };
  };
  /** P1 ρ = (g_pl − g_tej)/(g_cost − g_tej). */
  P1: number;
  /** P2: anchura a media altura axial de la línea pleural sobre su fondo local (mediana de las columnas). */
  P2: Length & { clippedPeaks: number };
  /** P4: profundidad de la pleura bajo la superficie costal (geométrica). */
  P4: Length;
  /** A1: |Δu_k − 1| entre órdenes visibles consecutivos (error relativo del espaciado, en d_pl); NaN si la piel no está arriba. */
  A1: { errors: number[]; max: number; mean: number };
  /** A2: r_k por orden (1 = pleura), pendiente de ln r_k contra k en los órdenes visibles y cuántas líneas A se ven. */
  A2: { ratios: number[]; slopeLn: number; visible: number };
  /** T1: tamaño del moteado de la pared (FWHM de la autocorrelación axial y lateral) y σ del moteado sobre la prominencia pleural. */
  T1: { axial: Length; lateral: Length; sigmaOverProminence: number };
  /** Sin suelo: la pared, la neblina y el campo profundo bajo la pleura en caídas de línea A (pleura → primera línea A). */
  M: { wall: number; haze: number; deep: number };
  /** Con el suelo de la sombra costal. */
  N1: number;
  N2: number;
  N3: number;
  /** Cociente de brechas: (g_pl − g_pared)/(g_A1 − g_A2). */
  N4: number;
  /** Las métricas (por su nombre plano, `flattenMetrics`) que son cotas o no son medidas. */
  censored: Record<string, Censor>;
}

export interface StackMetrics {
  /** T2: correlación de Pearson cuadro a cuadro en la pared y bajo la pleura (mediana e IQR sobre los pares). */
  T2: { wall: ReturnType<typeof medianIqr>; subPleura: ReturnType<typeof medianIqr> };
  /**
   * S1 (modo M reconstruido con columnas de la pila): σ_t media bajo la pleura / σ_t media sobre ella, cada una al menos el
   * ruido de cuantización (escalón/√12), y el tiempo de decorrelación bajo la pleura (1/e) en cuadros y en segundos.
   * `columns`, las columnas usadas.
   */
  S1: {
    ratio: number;
    sigmaBelow: number;
    sigmaAbove: number;
    decorrelationFrames: number;
    decorrelationS: number | null;
    columns: number;
  };
  /** Pares de cuadros consecutivos que no cambian en la banda de la pared (< ½ escalón de media: un vídeo que repite cuadros). */
  repeatedPairs: number;
  censored: Record<string, Censor>;
}

export interface AnalyzeOptions {
  scale?: GreyScale;
  /** mm por píxel del cuadro, si se conoce (regla del equipo, o el simulador). */
  mmPerPx?: number | null;
  /** Geometría del sector ya conocida (la verdadera del simulador o la fijada en el manifiesto); si no, se detecta. */
  geometry?: SectorGeometry;
  /** Zonas del cuadro que no se miden (texto o marcas quemados dentro del sector). */
  exclude?: readonly Rect[];
  /** La piel está en el borde superior del sector (si no, A1 mide el recorte y no se da). */
  skinAtTop?: boolean;
  /** Intervalo entre cuadros (s), para S1. */
  frameIntervalS?: number | null;
  /** Como mucho, tantos cuadros se analizan uno a uno (repartidos en el clip). */
  maxFrames?: number;
}

/** Resumen de una métrica sobre los cuadros: mediana e IQR de todos, y la censura si la mitad o más de los cuadros la tiene. */
export type MetricSummary = ReturnType<typeof medianIqr> & { censored: Censor | null; censoredFraction: number };

export interface ClipAnalysis {
  sector: SectorDetection | { geometry: SectorGeometry; maskSource: 'given' };
  frames: number;
  analyzedFrames: number;
  perFrame: FrameMetrics[];
  /** Mediana e IQR de cada métrica escalar sobre los cuadros analizados (`flattenMetrics`), con su censura. */
  summary: Record<string, MetricSummary>;
  /** Métricas de la pila (T2, S1) con las estructuras del cuadro medio; null con menos de 3 cuadros. */
  stack: StackMetrics | null;
  /** Estructuras del cuadro medio. */
  meanStructures: FrameMetrics['structures'];
}

/** Una anchura (FWHM) por debajo de esto, en px, está al límite del muestreo: P2 (pico) y T1 (autocorrelación). */
export const RESOLUTION_MIN_PX = { P2: 5, T1: 3 } as const;

/**
 * Cuánto recorte aguanta cada estadístico. Una mediana (los niveles de las bandas y los fondos de las líneas A) no cambia
 * mientras menos de la mitad de sus datos esté recortada; una media o un momento (los picos del perfil axial, que es la media
 * de las columnas; la σ y la autocorrelación del moteado; las correlaciones y σ temporales de la pila) sí: con un 5 % o más de
 * sus píxeles en el negro o en el blanco deja de ser una medida. El barrido de ganancia del simulador lo mostró: con el 44 %
 * de las columnas de la pleura en el blanco (−12 dB) M de la pared subía un 9 % sin marcarse, y con el 12 % de la pared en el
 * negro (−30 dB) σ/prominencia bajaba un 13 %.
 */
export const CLIP_MEAN_MAX = 0.05;

function levelOf(values: number[], scale: GreyScale): Level {
  const f = finite(values);
  if (!f.length) return { grey: Number.NaN, n: 0, clippedLow: Number.NaN, clippedHigh: Number.NaN, censored: null };
  const q = 0.5 * scale.quantum;
  const low = f.filter((v) => v <= scale.lo + q).length / f.length;
  const high = f.filter((v) => v >= scale.hi - q).length / f.length;
  return { grey: median(f), n: f.length, clippedLow: low, clippedHigh: high, censored: low >= 0.5 ? 'low' : high >= 0.5 ? 'high' : null };
}

/** p95 de una banda como `Level` (censurado si el 5 % alto está recortado en el blanco). */
function level95(values: number[], scale: GreyScale): Level {
  const l = levelOf(values, scale);
  const f = finite(values);
  return { ...l, grey: quantile(f, 0.95), censored: l.clippedHigh >= 0.05 ? 'high' : l.clippedLow >= 0.95 ? 'low' : null };
}

/** Píxeles de las columnas `cols` entre las filas [from(j), to(j)]. */
function band(b: BeamImage, cols: number[], from: (j: number) => number, to: (j: number) => number): number[] {
  const out: number[] = [];
  for (const j of cols) {
    const a = Math.max(0, Math.ceil(from(j)));
    const z = Math.min(b.rows - 1, Math.floor(to(j)));
    for (let i = a; i <= z; i++) out.push(b.data[i * b.cols + j]);
  }
  return out;
}

/**
 * Las bandas de nivel de un cuadro (`FIDELITY_BENCH`), como segmentos (columna, fila inicial, fila final) del espacio
 * del haz: las usan las métricas y el gancho del simulador, que mide las mismas bandas en la envolvente sin recortar.
 */
export function levelBands(
  st: Structures,
  rows: number,
): Record<'wall' | 'haze' | 'deep' | 'floor', { col: number; from: number; to: number }[]> {
  const ic = st.intercostal;
  const p = st.pleuraPx;
  return {
    wall: ic.map((j) => ({ col: j, from: FB.wallFrom * p[j], to: FB.wallTo * p[j] })),
    haze: ic.map((j) => ({ col: j, from: FB.hazeFrom * p[j], to: FB.hazeTo * p[j] })),
    deep: ic
      .map((j) => ({ col: j, from: FB.deepFrom * p[j], to: Math.min(rows - 1, FB.deepTo * p[j]) }))
      .filter((x) => FB.deepTo * p[x.col] <= rows - 1),
    floor: st.shadowCore.map((j) => ({ col: j, from: FB.floorFrom * st.dPlPx, to: FB.floorTo * st.dPlPx })),
  };
}

function bandOf(b: BeamImage, segs: { col: number; from: number; to: number }[]): number[] {
  const out: number[] = [];
  for (const s of segs)
    for (let i = Math.max(0, Math.ceil(s.from)); i <= Math.min(b.rows - 1, Math.floor(s.to)); i++) out.push(b.data[i * b.cols + s.col]);
  return out;
}

const lengthOf = (px: number, dPlPx: number, mmPerPx: number | null | undefined): Length => ({
  px,
  dPl: px / dPlPx,
  mm: mmPerPx ? px * mmPerPx : null,
});

/** FWHM axial de la línea pleural en la columna j (media de j − 1…j + 1) sobre su fondo local (±¼ d_pl). */
function pleuraFwhm(b: BeamImage, j: number, p: number, dPl: number): { width: number; peak: number } {
  const col = (i: number): number => {
    let s = 0;
    let n = 0;
    for (let d = -1; d <= 1; d++) {
      const v = j + d >= 0 && j + d < b.cols ? b.data[i * b.cols + j + d] : Number.NaN;
      if (Number.isFinite(v)) {
        s += v;
        n++;
      }
    }
    return n ? s / n : Number.NaN;
  };
  const reach = Math.max(3, Math.round(0.25 * dPl));
  const c = Math.round(p);
  if (c - reach < 0 || c + reach >= b.rows) return { width: Number.NaN, peak: Number.NaN };
  let top = c;
  for (let i = c - 2; i <= c + 2; i++) if (col(i) > col(top)) top = i;
  const peak = col(top);
  const bgv: number[] = [];
  for (let i = c - reach; i <= c + reach; i++) bgv.push(col(i));
  const half = median(bgv) + 0.5 * (peak - median(bgv));
  let up = Number.NaN;
  for (let i = top; i > c - reach; i--)
    if (col(i - 1) < half) {
      up = i - (col(i) - half) / (col(i) - col(i - 1));
      break;
    }
  let down = Number.NaN;
  for (let i = top; i < c + reach; i++)
    if (col(i + 1) < half) {
      down = i + (col(i) - half) / (col(i) - col(i + 1));
      break;
    }
  return { width: down - up, peak };
}

/**
 * Autocorrelación normalizada de la pared, axial (filas) y lateral (columnas), sobre el moteado sin las capas: a cada
 * píxel se le resta la media de su fila en ±15 columnas (las fascias son horizontales). FWHM = 2 × el desfase en que cae
 * a ½.
 */
function wallAutocorrelation(
  b: BeamImage,
  st: Structures,
  sampler: Pick<BeamSampler, 'lateralPx'>,
): { axialPx: number; lateralPx: number; sigma: number } {
  const ic = new Set(st.intercostal);
  const inBand = (i: number, j: number): boolean => ic.has(j) && i >= FB.wallFrom * st.pleuraPx[j] && i <= FB.wallTo * st.pleuraPx[j];
  const hp = new Float64Array(b.rows * b.cols).fill(Number.NaN);
  const vals: number[] = [];
  const rowsUsed: number[] = [];
  const W = 15;
  for (const j of st.intercostal)
    for (let i = Math.ceil(FB.wallFrom * st.pleuraPx[j]); i <= Math.floor(FB.wallTo * st.pleuraPx[j]); i++) {
      let s = 0;
      let n = 0;
      for (let d = -W; d <= W; d++) {
        const v = j + d >= 0 && j + d < b.cols ? b.data[i * b.cols + j + d] : Number.NaN;
        if (Number.isFinite(v)) {
          s += v;
          n++;
        }
      }
      const v = b.data[i * b.cols + j];
      if (!Number.isFinite(v) || !n) continue;
      hp[i * b.cols + j] = v - s / n;
      vals.push(v - s / n);
      rowsUsed.push(i);
    }
  const m = mean(vals);
  const varAll = vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length;
  const curve = (di: number, dj: number, maxLag: number): number[] => {
    const out = [1];
    for (let lag = 1; lag <= maxLag; lag++) {
      let s = 0;
      let n = 0;
      for (const j of st.intercostal)
        for (let i = Math.ceil(FB.wallFrom * st.pleuraPx[j]); i <= Math.floor(FB.wallTo * st.pleuraPx[j]); i++) {
          const i2 = i + di * lag;
          const j2 = j + dj * lag;
          if (!inBand(i2, j2)) continue;
          const a = hp[i * b.cols + j];
          const c = hp[i2 * b.cols + j2];
          if (Number.isFinite(a) && Number.isFinite(c)) {
            s += (a - m) * (c - m);
            n++;
          }
        }
      out.push(n && varAll > 0 ? s / n / varAll : Number.NaN);
      if (out[lag] < 0.5) break;
    }
    return out;
  };
  const maxLag = Math.max(4, Math.round(0.5 * st.dPlPx));
  const axialPx = 2 * crossingLag(curve(1, 0, maxLag), 0.5);
  const lateralCols = 2 * crossingLag(curve(0, 1, maxLag), 0.5);
  return { axialPx, lateralPx: lateralCols * sampler.lateralPx(median(rowsUsed)), sigma: Math.sqrt(varAll) };
}

/** El gris de cada columna intercostal en la posición de un pico (u·p_j) y la fracción recortada en el negro y en el blanco. */
function peakLevel(b: BeamImage, st: Structures, u: number, grey: number, scale: GreyScale): PeakLevel {
  if (!Number.isFinite(u)) return { grey: Number.NaN, clippedLow: Number.NaN, clippedHigh: Number.NaN };
  const q = 0.5 * scale.quantum;
  let low = 0;
  let high = 0;
  let n = 0;
  for (const j of st.intercostal) {
    const v = sampleRow(b, u * st.pleuraPx[j], j);
    if (!Number.isFinite(v)) continue;
    n++;
    if (v <= scale.lo + q) low++;
    if (v >= scale.hi - q) high++;
  }
  return { grey, clippedLow: n ? low / n : Number.NaN, clippedHigh: n ? high / n : Number.NaN };
}

/** Un pico del perfil es la media de las columnas: con un 5 % o más de ellas recortadas en su posición no es una medida. */
const peakCensored = (p: PeakLevel): boolean => p.clippedLow >= CLIP_MEAN_MAX || p.clippedHigh >= CLIP_MEAN_MAX;
const meanClipped = (l: Level): boolean => l.clippedLow >= CLIP_MEAN_MAX || l.clippedHigh >= CLIP_MEAN_MAX;

/** Métricas de un cuadro ya muestreado en el espacio del haz. */
export function frameMetrics(
  b: BeamImage,
  sampler: Pick<BeamSampler, 'lateralPx'>,
  scale: GreyScale = GREY_8BIT,
  mmPerPx: number | null = null,
  st: Structures = detectStructures(b),
  skinAtTop = true,
): FrameMetrics {
  const d = st.dPlPx;
  const len = (px: number): Length => lengthOf(px, d, mmPerPx);
  const bands = levelBands(st, b.rows);
  const wall = levelOf(bandOf(b, bands.wall), scale);
  const haze = levelOf(bandOf(b, bands.haze), scale);
  const deep = levelOf(bandOf(b, bands.deep), scale);
  const floor = levelOf(bandOf(b, bands.floor), scale);
  // P2 (antes que P1: la banda de la pleura es su FWHM)
  const fw = st.intercostal.map((j) => pleuraFwhm(b, j, st.pleuraPx[j], d));
  const fwhmPx = median(fw.map((f) => f.width));
  const clippedPeaks = fw.filter((f) => f.peak >= scale.hi - 0.5 * scale.quantum).length / Math.max(1, fw.length);
  const hw = Math.max(1, 0.5 * (Number.isFinite(fwhmPx) ? fwhmPx : 2));
  const p1Tissue = levelOf(
    band(
      b,
      st.intercostal,
      (j) => 0.6 * st.pleuraPx[j],
      (j) => 0.9 * st.pleuraPx[j],
    ),
    scale,
  );
  const pleuraP95 = level95(
    band(
      b,
      st.intercostal,
      (j) => st.pleuraPx[j] - hw,
      (j) => st.pleuraPx[j] + hw,
    ),
    scale,
  );
  // la cortical costal: la cresta de cada columna del núcleo de la sombra (±½ FWHM)
  const ribTopOf = new Map<number, number>();
  for (const r of st.shadows) for (let j = r.from; j <= r.to; j++) ribTopOf.set(j, r.ribTopPx);
  const ribP95 = level95(
    band(
      b,
      st.shadowCore,
      (j) => (ribTopOf.get(j) ?? Number.NaN) - hw,
      (j) => (ribTopOf.get(j) ?? Number.NaN) + hw,
    ),
    scale,
  );
  const [k1, k2, k3] = [st.aLines[0], st.aLines[1], st.aLines[2]];
  const g1 = k1?.grey ?? Number.NaN;
  const gA1 = k2?.visible ? k2.grey : Number.NaN;
  const gA2 = k2?.visible && k3?.visible ? k3.grey : Number.NaN;
  const peaks = {
    pleura: peakLevel(b, st, k1?.u ?? Number.NaN, g1, scale),
    aLine1: peakLevel(b, st, k2?.visible ? k2.u : Number.NaN, gA1, scale),
    aLine2: peakLevel(b, st, k2?.visible && k3?.visible ? k3.u : Number.NaN, gA2, scale),
  };
  const floorG = floor.grey;
  const overFloor = (g: number): number => (g - floorG) / (g1 - floorG);
  const underPleura = (g: number): number => (g1 - g) / (g1 - gA1);
  // A1: espaciado entre órdenes visibles consecutivos (la línea pleural y las líneas A que se ven)
  const seen = st.aLines.filter((p) => p.k === 1 || p.k <= st.visibleALines + 1);
  const a1: number[] = [];
  if (skinAtTop)
    for (let i = 1; i < seen.length; i++) if (seen[i].found && seen[i - 1].found) a1.push(Math.abs(seen[i].u - seen[i - 1].u - 1));
  // A2: ln r_k contra k en los órdenes visibles (con la pleura, r_1 = 1)
  const vis = st.aLines.filter((p) => p.k === 1 || (p.k <= st.visibleALines + 1 && p.visible));
  const ac = wallAutocorrelation(b, st, sampler);
  // la censura: lo recortado nunca pasa por una medida
  const censored: Record<string, Censor> = {};
  const mark = (name: string, c: Censor | null): void => {
    if (c && !censored[name]) censored[name] = c;
  };
  const levelCensor = (l: Level): Censor | null => (l.censored === 'low' ? 'upper' : l.censored === 'high' ? 'lower' : null);
  const plCens = peakCensored(peaks.pleura);
  for (const [name, l] of Object.entries({ wall, haze, deep, floor, p1Tissue, pleuraP95, ribP95 }))
    mark(`levels.${name}.grey`, levelCensor(l));
  for (const [name, x] of [
    ['N1', wall],
    ['N2', haze],
    ['N3', deep],
  ] as const)
    if (floor.censored || x.censored || plCens) mark(name, 'unknown');
  for (const [name, x] of [
    ['M.wall', wall],
    ['M.haze', haze],
    ['M.deep', deep],
  ] as const) {
    if (plCens || peakCensored(peaks.aLine1)) mark(name, 'unknown');
    // x recortado en el negro: el verdadero g_x es menor y M, mayor (cota inferior); en el blanco, al revés
    mark(name, x.censored === 'low' ? 'lower' : x.censored === 'high' ? 'upper' : null);
  }
  if (plCens || peakCensored(peaks.aLine1) || peakCensored(peaks.aLine2) || wall.censored) mark('N4', 'unknown');
  if (pleuraP95.censored || ribP95.censored || p1Tissue.censored) mark('P1', 'unknown');
  if (clippedPeaks >= 0.5) mark('P2.dPl', 'upper');
  if (fwhmPx < RESOLUTION_MIN_PX.P2) mark('P2.dPl', 'resolution');
  // T1 es de momentos (σ, autocorrelación) del moteado de la pared: el recorte los cambia antes que a la mediana
  if (meanClipped(wall) || plCens) mark('T1.sigmaOverProminence', 'unknown');
  if (meanClipped(wall)) for (const k of ['T1.axial.dPl', 'T1.lateral.dPl']) mark(k, 'unknown');
  if (ac.axialPx < RESOLUTION_MIN_PX.T1) mark('T1.axial.dPl', 'resolution');
  if (ac.lateralPx < RESOLUTION_MIN_PX.T1) mark('T1.lateral.dPl', 'resolution');
  // r_k: su pico o su fondo local recortados, o la pleura de referencia
  let slopeCensored = false;
  st.aLines.forEach((p, i) => {
    if (i === 0) return;
    const bg: number[] = [];
    for (const j of st.intercostal)
      for (let r = Math.ceil((p.u - FB.aLineBackground) * st.pleuraPx[j]); r <= (p.u + FB.aLineBackground) * st.pleuraPx[j]; r++)
        if (r >= 0 && r < b.rows) bg.push(b.data[r * b.cols + j]);
    if (!p.found) return;
    const cens = plCens || levelOf(bg, scale).clippedLow >= 0.5 || peakCensored(peakLevel(b, st, p.u, p.grey, scale));
    if (cens) {
      if (i <= 5) mark(`A2.r${i + 1}`, 'unknown');
      if (p.k <= st.visibleALines + 1 && p.visible) slopeCensored = true;
    }
  });
  if (slopeCensored) mark('A2.slopeLn', 'unknown');
  for (const [k, lv] of Object.entries(censored)) if (k.endsWith('.dPl')) mark(k.replace('.dPl', '.mm'), lv);
  return {
    structures: {
      dPl: len(d),
      intercostalColumns: st.intercostal.length,
      shadows: st.shadows.map((r) => ({ fromCol: r.from, toCol: r.to, ribTop: len(r.ribTopPx) })),
      shadowCoreColumns: st.shadowCore.length,
      shadowSplitEta: st.shadowSplit.eta,
      rejectedShadows: st.rejectedShadows,
      visibleALines: st.visibleALines,
      aLines: st.aLines.map((p) => ({ k: p.k, u: p.u, grey: p.grey, background: p.background, ratio: p.ratio, visible: p.visible })),
    },
    levels: {
      wall,
      haze,
      deep,
      floor,
      p1Tissue,
      pleuraP95,
      ribP95,
      pleuraPeak: g1,
      a1Peak: k2?.grey ?? Number.NaN,
      a2Peak: k3?.grey ?? Number.NaN,
      peaks,
    },
    P1: (pleuraP95.grey - p1Tissue.grey) / (ribP95.grey - p1Tissue.grey),
    P2: { ...len(fwhmPx), clippedPeaks },
    P4: len(d - median(st.shadows.map((r) => r.ribTopPx))),
    A1: { errors: a1, max: a1.length ? Math.max(...a1) : Number.NaN, mean: mean(a1) },
    A2: {
      // r_k solo de los órdenes visibles: el de uno que no se ve es la prominencia de un máximo de ruido (decisión 31)
      ratios: st.aLines.map((p) => (p.k === 1 || p.visible ? p.ratio : Number.NaN)),
      slopeLn: slope(
        vis.map((p) => p.k),
        vis.map((p) => Math.log(p.ratio)),
      ),
      visible: st.visibleALines,
    },
    T1: { axial: len(ac.axialPx), lateral: len(ac.lateralPx), sigmaOverProminence: ac.sigma / (g1 - wall.grey) },
    M: { wall: underPleura(wall.grey), haze: underPleura(haze.grey), deep: underPleura(deep.grey) },
    N1: overFloor(wall.grey),
    N2: overFloor(haze.grey),
    N3: overFloor(deep.grey),
    N4: (g1 - wall.grey) / (gA1 - gA2),
    censored,
  };
}

/** Las métricas escalares de un cuadro con nombre plano (lo que se resume por clip con mediana e IQR). */
export function flattenMetrics(m: FrameMetrics): Record<string, number> {
  const out: Record<string, number> = {
    'dPl.px': m.structures.dPl.px,
    'dPl.mm': m.structures.dPl.mm ?? Number.NaN,
    'intercostal.columns': m.structures.intercostalColumns,
    'shadows.count': m.structures.shadows.length,
    'shadows.rejected': m.structures.rejectedShadows,
    P1: m.P1,
    'P2.px': m.P2.px,
    'P2.dPl': m.P2.dPl,
    'P2.mm': m.P2.mm ?? Number.NaN,
    'P4.dPl': m.P4.dPl,
    'P4.mm': m.P4.mm ?? Number.NaN,
    'A1.max': m.A1.max,
    'A1.mean': m.A1.mean,
    'A2.slopeLn': m.A2.slopeLn,
    'A2.visible': m.A2.visible,
    'T1.axial.px': m.T1.axial.px,
    'T1.axial.dPl': m.T1.axial.dPl,
    'T1.axial.mm': m.T1.axial.mm ?? Number.NaN,
    'T1.lateral.dPl': m.T1.lateral.dPl,
    'T1.lateral.mm': m.T1.lateral.mm ?? Number.NaN,
    'T1.sigmaOverProminence': m.T1.sigmaOverProminence,
    'M.wall': m.M.wall,
    'M.haze': m.M.haze,
    'M.deep': m.M.deep,
    N1: m.N1,
    N2: m.N2,
    N3: m.N3,
    N4: m.N4,
  };
  m.A2.ratios.forEach((r, i) => {
    if (i >= 1 && i <= 5) out[`A2.r${i + 1}`] = r;
  });
  // la fracción de columnas recortadas en la posición de cada pico (lo que decide su censura)
  for (const [k, p] of Object.entries(m.levels.peaks)) {
    out[`levels.peaks.${k}.clippedHigh`] = p.clippedHigh;
    out[`levels.peaks.${k}.clippedLow`] = p.clippedLow;
  }
  for (const [k, l] of Object.entries(m.levels))
    if (typeof l === 'number') out[`levels.${k}`] = l;
    else if (k !== 'peaks') {
      const lv = l as Level;
      out[`levels.${k}.grey`] = lv.grey;
      out[`levels.${k}.clippedLow`] = lv.clippedLow;
      out[`levels.${k}.clippedHigh`] = lv.clippedHigh;
    }
  return out;
}

/** Resume una métrica de varios cuadros: mediana e IQR, y censurada si la mitad o más de sus cuadros lo están. */
export function summarize(values: readonly number[], censors: readonly (Censor | undefined)[]): MetricSummary {
  const base = medianIqr(values);
  const cs = censors.filter((c): c is Censor => !!c);
  const fraction = values.length ? cs.length / values.length : 0;
  let censored: Censor | null = null;
  if (fraction >= 0.5) {
    const counts = new Map<Censor, number>();
    for (const c of cs) counts.set(c, (counts.get(c) ?? 0) + 1);
    censored = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return { ...base, censored, censoredFraction: fraction };
}

/** T2 y S1 sobre una pila en el espacio del haz, con las estructuras de su cuadro medio. */
export function stackMetrics(
  stack: readonly BeamImage[],
  st: Structures,
  frameIntervalS: number | null = null,
  scale: GreyScale = GREY_8BIT,
): StackMetrics {
  const b0 = stack[0];
  const ic = st.intercostal;
  const p = st.pleuraPx;
  const wallSegs = ic.map((j) => ({ col: j, from: FB.wallFrom * p[j], to: FB.wallTo * p[j] }));
  const subSegs = ic.map((j) => ({ col: j, from: 1.1 * p[j], to: FB.subPleuraTo * p[j] }));
  const wallC: number[] = [];
  const subC: number[] = [];
  let repeatedPairs = 0;
  const q = 0.5 * scale.quantum;
  const isClipped = (v: number): boolean => v <= scale.lo + q || v >= scale.hi - q;
  const clippedFraction = (v: number[]): number => {
    const f = v.filter((x) => Number.isFinite(x));
    return f.length ? f.filter(isClipped).length / f.length : 0;
  };
  let wallClipped = 0;
  let subClipped = 0;
  for (let t = 0; t + 1 < stack.length; t++) {
    const w0 = bandOf(stack[t], wallSegs);
    const w1 = bandOf(stack[t + 1], wallSegs);
    // un cuadro repetido: la pared cambia menos de medio escalón de media (Theora recodifica el cuadro repetido con un
    // temblor de < 0,5 grises: en LUS-03, 94 de 165 pares, solo 4 idénticos bit a bit)
    let diff = 0;
    let n = 0;
    for (let i = 0; i < w0.length; i++)
      if (Number.isFinite(w0[i]) && Number.isFinite(w1[i])) {
        diff += Math.abs(w0[i] - w1[i]);
        n++;
      }
    if (n && diff / n <= 0.5 * scale.quantum) repeatedPairs++;
    const s0 = bandOf(stack[t], subSegs);
    wallC.push(pearson(w0, w1));
    subC.push(pearson(s0, bandOf(stack[t + 1], subSegs)));
    wallClipped = Math.max(wallClipped, clippedFraction(w0));
    subClipped = Math.max(subClipped, clippedFraction(s0));
  }
  // S1: el modo M reconstruido en el centro del tramo intercostal más ancho (su 20 % central, ≥ 3 columnas)
  const runsIc: number[][] = [];
  for (const j of ic) {
    const last = runsIc[runsIc.length - 1];
    if (last && last[last.length - 1] === j - 1) last.push(j);
    else runsIc.push([j]);
  }
  const widest = runsIc.reduce<number[]>((a, r) => (r.length > a.length ? r : a), []);
  const nCols = Math.min(widest.length, Math.max(3, Math.round(0.2 * widest.length)));
  const start = Math.floor(0.5 * (widest.length - nCols));
  const mCols = widest.slice(start, start + nCols);
  const sigAbove: number[] = [];
  const sigBelow: number[] = [];
  let clippedSamples = 0;
  let samples = 0;
  const acurves: number[][] = [];
  const T = stack.length;
  const maxLag = Math.max(1, Math.floor(T / 2));
  for (const j of mCols)
    for (let i = Math.ceil(FB.wallFrom * p[j]); i <= Math.floor(2 * p[j]) && i < b0.rows; i++) {
      const series = stack.map((b) => b.data[i * b.cols + j]);
      const sd = std(series);
      samples += series.length;
      clippedSamples += series.filter(isClipped).length;
      const above = i <= FB.wallTo * p[j];
      const belowBand = i >= 1.1 * p[j];
      if (above) sigAbove.push(sd);
      if (belowBand) {
        sigBelow.push(sd);
        if (sd > 0) {
          const m = mean(series);
          const v = series.reduce((a, x) => a + (x - m) ** 2, 0) / T;
          const curve = [1];
          for (let lag = 1; lag <= maxLag; lag++) {
            let s = 0;
            for (let t = 0; t + lag < T; t++) s += (series[t] - m) * (series[t + lag] - m);
            curve.push(s / (T - lag) / v);
          }
          acurves.push(curve);
        }
      }
    }
  const avgCurve = acurves.length ? acurves[0].map((_, k) => mean(acurves.map((c) => c[k]))) : [];
  const decorrelationFrames = avgCurve.length ? crossingLag(avgCurve, 1 / Math.E) : Number.NaN;
  // el ruido de cuantización (escalón/√12) es lo menos que se puede medir en un vídeo de 8 bits: por debajo, σ no es una
  // medida (el simulador en apnea: 0,004–0,009 grises) y el cociente sería el de dos ceros
  const qNoise = scale.quantum / Math.sqrt(12);
  const sigmaAbove = mean(sigAbove);
  const sigmaBelow = mean(sigBelow);
  const censored: Record<string, Censor> = {};
  if (sigmaAbove < qNoise && sigmaBelow < qNoise) censored['S1.ratio'] = 'unknown';
  else if (sigmaAbove < qNoise) censored['S1.ratio'] = 'lower';
  else if (sigmaBelow < qNoise) censored['S1.ratio'] = 'upper';
  // σ_t y las correlaciones son momentos: con un 5 % o más de las muestras recortadas no son una medida
  if (samples && clippedSamples / samples >= CLIP_MEAN_MAX) {
    censored['S1.ratio'] ??= 'unknown';
    censored['S1.decorrelationS'] = 'unknown';
  }
  if (wallClipped >= CLIP_MEAN_MAX) censored['T2.wall'] = 'unknown';
  if (subClipped >= CLIP_MEAN_MAX) censored['T2.subPleura'] = 'unknown';
  return {
    T2: { wall: medianIqr(wallC), subPleura: medianIqr(subC) },
    S1: {
      ratio: Math.max(sigmaBelow, qNoise) / Math.max(sigmaAbove, qNoise),
      sigmaBelow,
      sigmaAbove,
      decorrelationFrames,
      decorrelationS: frameIntervalS && Number.isFinite(decorrelationFrames) ? decorrelationFrames * frameIntervalS : null,
      columns: mCols.length,
    },
    repeatedPairs,
    censored,
  };
}

/**
 * Analiza un clip (o un cuadro): con la geometría dada o, si no, la detectada; muestrea cada cuadro en el espacio del haz,
 * mide cada cuadro con sus propias estructuras (a lo sumo `maxFrames`, repartidos) y resume cada métrica con su mediana, su
 * IQR y su censura; con ≥ 3 cuadros, T2 y S1 con las estructuras del cuadro medio.
 */
export function analyzeClip(frames: readonly GreyFrame[], opts: AnalyzeOptions = {}): ClipAnalysis {
  if (!frames.length) throw new RangeError('analyzeClip: sin cuadros');
  if (
    opts.frameIntervalS !== undefined &&
    opts.frameIntervalS !== null &&
    (!Number.isFinite(opts.frameIntervalS) || opts.frameIntervalS < 0)
  )
    throw new RangeError('analyzeClip: intervalo entre cuadros inválido');
  const scale = opts.scale ?? GREY_8BIT;
  const sector = opts.geometry ? { geometry: opts.geometry, maskSource: 'given' as const } : detectSector(frames, scale);
  const { width, height } = frames[0];
  const sampler = beamSampler(sector.geometry, width, height, opts.exclude ?? []);
  const beams: BeamImage[] = frames.map((f) => ({ rows: sampler.rows, cols: sampler.cols, data: sampler.sample(f) }));
  const maxFrames = Math.max(1, opts.maxFrames ?? 60);
  const stride = Math.max(1, Math.ceil(beams.length / maxFrames));
  const chosen = beams.filter((_, i) => i % stride === 0);
  const skinAtTop = opts.skinAtTop ?? true;
  // el cuadro medio: su pleura guía la de cada cuadro y sus estructuras fijan las bandas de T2 y S1
  const meanBeam: BeamImage = { rows: sampler.rows, cols: sampler.cols, data: new Float64Array(sampler.rows * sampler.cols) };
  for (const b of beams) for (let k = 0; k < b.data.length; k++) meanBeam.data[k] += b.data[k] / beams.length;
  const meanSt = detectStructures(meanBeam);
  const prior = beams.length >= 3 ? { dPlPx: meanSt.dPlPx } : undefined;
  const perFrame = chosen.map((b) => frameMetrics(b, sampler, scale, opts.mmPerPx ?? null, detectStructures(b, prior), skinAtTop));
  const flat = perFrame.map(flattenMetrics);
  const keys = [...new Set(flat.flatMap((f) => Object.keys(f)))];
  const summary = Object.fromEntries(
    keys.map((k) => [
      k,
      summarize(
        flat.map((f) => f[k] ?? Number.NaN),
        perFrame.map((m) => m.censored[k]),
      ),
    ]),
  );
  const meanM = frameMetrics(meanBeam, sampler, scale, opts.mmPerPx ?? null, meanSt, skinAtTop);
  // dt=0 identifica réplicas simultáneas: sus diferencias de receptor no son movimiento temporal.
  // dt desconocido conserva las medidas por cuadro del banco, sin convertirlas a segundos.
  const stack = beams.length >= 3 && opts.frameIntervalS !== 0 ? stackMetrics(beams, meanSt, opts.frameIntervalS ?? null, scale) : null;
  return { sector, frames: frames.length, analyzedFrames: chosen.length, perFrame, summary, stack, meanStructures: meanM.structures };
}
