import { insideSector, GREY_8BIT, type GreyFrame, type GreyScale, type Rect, type SectorGeometry } from './sector';
import { median, quantile } from './stats';

/**
 * El mapa de grises de un clip estimado desde su moteado (decisión 31; `docs/knowledge/physics.md` §2.12).
 *
 * En el moteado plenamente desarrollado la amplitud A de la envolvente es de Rayleigh: su forma no depende del nivel, y la
 * DE de 20·log₁₀A es fija, 5,57 dB (Kaplan y Ma 1994; Wagner y cols. 1983). Lo que la pantalla hace con los dB sale del
 * moteado de las regiones homogéneas: la dispersión del gris a cada nivel es la pendiente local del mapa por esa dispersión
 * fija. Con la familia de mapas del simulador (la de EchoTwin), g/G = ((1 + c)^y − 1)/c con y = 1 + dB/RD (G = 255 en 8
 * bits, recortado a [0, 1]), la relación es exacta: con β = ln(1 + c)/RD por dB y q = 20·β/ln 10,
 *
 *     g + G/c = (G/c)·(1 + c)·e^{β·L}·A^q        (L, el nivel medio de la región en dB)
 *
 * así que el cuantil p del gris en una región cumple g_p + G/c ∝ Q(p)^q, con Q(p) = √(−ln(1 − p)) el cuantil de Rayleigh
 * (E[A²] = 1), y la diferencia entre dos cuantiles es una recta en el gris:
 *
 *     g₉₀ − g₅₀ = S·(g₅₀ + G/c),   S = (Q(0,9)/Q(0,5))^q − 1
 *
 * De la pendiente S sale q y de pendiente/ordenada sale c = G·S/ordenada; RD = ln(1 + c)/β. Con c → 0 (un mapa logarítmico
 * puro, el de Prager y cols. 2003, I = exp(g/D)) la diferencia es constante: RD = 5,21 dB·G/(g₉₀ − g₅₀), con 5,21 dB la
 * distancia entre esos cuantiles de Rayleigh. Se usan la mediana y el p90 y no la DE: el negro recorta la cola baja del
 * logaritmo del moteado (sus nulos, 1 % de los píxeles 20 dB bajo la media), que no toca a esos cuantiles mientras la
 * mediana no esté recortada.
 *
 * Lo que la sesga, y cómo se vigila:
 *  - el suavizado del moteado (la interpolación de la conversión de barrido entre líneas, la persistencia, los filtros, la
 *    recompresión del vídeo) estrecha la dispersión por igual en todos los niveles: no cambia c, pero sube RD. RD es una
 *    cota superior si el moteado puede estar suavizado; la asimetría del logaritmo (en dB, por el mapa estimado),
 *    (g₅₀ − g₁₀)/(g₉₀ − g₅₀) = 1,57 sin suavizar y → 1 promediando, lo delata cuando el suavizado es un promedio (no cuando
 *    es una interpolación, que mezcla píxeles intactos y promediados: ver la autoprueba);
 *  - lo que no es moteado (bordes, interfaces, texturas, sombras): fuera las teselas con estructura (la diferencia de medias
 *    entre sus mitades), con la mediana recortada, fuera del sector o en zonas quemadas; el ajuste es robusto (medianas por
 *    franja de gris y descarte iterativo).
 */

/** DE de 20·log₁₀ de una envolvente de Rayleigh: 20·log₁₀(e)·π/√24 (dB). */
export const SPECKLE_LOG_SD_DB = ((20 / Math.LN10) * Math.PI) / Math.sqrt(24);
/** Cuantil p de una amplitud de Rayleigh con E[A²] = 1. */
export const rayleighQuantile = (p: number): number => Math.sqrt(-Math.log(1 - p));
/** Distancia en dB entre el p90 y la mediana de 20·log₁₀A (5,21 dB). */
export const RAYLEIGH_P90_P50_DB = 20 * Math.log10(rayleighQuantile(0.9) / rayleighQuantile(0.5));
/** Asimetría por cuantiles del logaritmo del moteado sin suavizar: (p50 − p10)/(p90 − p50) en dB (1,57). */
export const RAYLEIGH_QUANTILE_ASYMMETRY =
  Math.log(rayleighQuantile(0.5) / rayleighQuantile(0.1)) / Math.log(rayleighQuantile(0.9) / rayleighQuantile(0.5));

/**
 * La asimetría por cuantiles en dB que se acepta como moteado de Rayleigh. Se declaró 1,35–1,80 antes de mirar los clips; la
 * revisión adversarial la estrechó a 1,57 ± 0,1 (solo puede rechazar más): el moteado de Rayleigh sintético da 1,56–1,59, y
 * la persistencia de dos cuadros (1,36) y la interpolación entre líneas (1,43–1,45), que suben RD un 21–35 %, caían dentro.
 */
export const ASYMMETRY_BAND = [1.48, 1.68] as const;

export interface SpeckleTile {
  x: number;
  y: number;
  frame: number;
  /** Cuantiles 10, 50 y 90 del gris tras quitar el plano ajustado (la media se conserva). */
  q10: number;
  q50: number;
  q90: number;
  /** El p10 está recortado en el negro (la asimetría no se mide en esta tesela). */
  lowClipped: boolean;
  /** Lado de la tesela (px). */
  size: number;
  /**
   * El grano del moteado en la tesela: el desfase (px) al que la autocorrelación del gris sin el plano cae a 0,5, en x y
   * en y (interpolado; si no cae antes de la mitad de la tesela, esa mitad).
   */
  grainX: number;
  grainY: number;
}

/**
 * Lado mínimo de la tesela en granos (el desfase con autocorrelación 0,5): con menos, la dispersión dentro de la tesela sale
 * corta y RD alto. En los sintéticos: +4–5 % con 17 granos, +8 % con 12, +12 % con 9,5 y +25 % con 7 (decisión 31).
 */
export const MIN_TILE_GRAINS = 12;
/** Dispersión mínima de una tesela (p90 − p50) en cuantos: con menos, la cuantización la domina. */
export const MIN_SPREAD_QUANTA = 6;

export interface SpeckleTileOptions {
  scale?: GreyScale;
  /** Lado de la tesela (px) y separación entre teselas (px). */
  tile?: number;
  stride?: number;
  exclude?: readonly Rect[];
  /** Como mucho, tantos cuadros (repartidos). */
  maxFrames?: number;
  /** Diferencia máxima entre las medias de dos mitades de la tesela, en unidades de su p90 − p50: más es estructura. */
  maxHalfDiff?: number;
  /** Dispersión mínima (p90 − p50) en cuantos (MIN_SPREAD_QUANTA). */
  minSpreadQuanta?: number;
}

/** El desfase al que la autocorrelación (de `v`, t×t, media cero) cae a 0,5 a lo largo de x (dx = 1) o de y (dx = t). */
function halfCorrelationLag(v: Float64Array, t: number, alongX: boolean): number {
  let v0 = 0;
  for (let i = 0; i < v.length; i++) v0 += v[i] * v[i];
  v0 /= v.length;
  if (!(v0 > 0)) return Number.NaN;
  const maxLag = Math.floor(t / 2);
  let prev = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    let acc = 0;
    let m = 0;
    for (let a = 0; a < t; a++)
      for (let b = 0; b + lag < t; b++) {
        const i = alongX ? a * t + b : b * t + a;
        const j = alongX ? i + lag : i + lag * t;
        acc += v[i] * v[j];
        m++;
      }
    const rho = acc / m / v0;
    if (rho <= 0.5) return lag - 1 + (prev - 0.5) / (prev - rho);
    prev = rho;
  }
  return maxLag;
}

function tileInside(g: SectorGeometry, x0: number, y0: number, t: number, exclude: readonly Rect[], margin: number): boolean {
  for (const [x, y] of [
    [x0 - margin, y0 - margin],
    [x0 + t - 1 + margin, y0 - margin],
    [x0 - margin, y0 + t - 1 + margin],
    [x0 + t - 1 + margin, y0 + t - 1 + margin],
  ])
    if (!insideSector(g, x, y)) return false;
  return !exclude.some((r) => x0 <= r.x1 + margin && x0 + t - 1 >= r.x0 - margin && y0 <= r.y1 + margin && y0 + t - 1 >= r.y0 - margin);
}

/**
 * Las teselas homogéneas de moteado de un clip: dentro del sector, sin estructura, con la mediana lejos del negro y el p90
 * sin recortar en el blanco. De cada una, los cuantiles 10, 50 y 90 del gris tras quitar el plano que mejor la ajusta.
 */
export function speckleTiles(frames: readonly GreyFrame[], geometry: SectorGeometry, opts: SpeckleTileOptions = {}): SpeckleTile[] {
  if (!frames.length) throw new RangeError('speckleTiles: sin cuadros');
  const scale = opts.scale ?? GREY_8BIT;
  const t = opts.tile ?? 16;
  const stride = opts.stride ?? t;
  const exclude = opts.exclude ?? [];
  const maxHalf = opts.maxHalfDiff ?? 1;
  const minSpread = (opts.minSpreadQuanta ?? MIN_SPREAD_QUANTA) * scale.quantum;
  const { width: W, height: H } = frames[0];
  const maxFrames = Math.max(1, opts.maxFrames ?? 8);
  const step = Math.max(1, Math.ceil(frames.length / maxFrames));
  const q = 0.5 * scale.quantum;
  const out: SpeckleTile[] = [];
  const positions: [number, number][] = [];
  for (let y0 = 0; y0 + t <= H; y0 += stride)
    for (let x0 = 0; x0 + t <= W; x0 += stride) if (tileInside(geometry, x0, y0, t, exclude, 2)) positions.push([x0, y0]);
  const c = (t - 1) / 2;
  const sxx = (t * t * (t * t - 1)) / 12;
  const n = t * t;
  const vals = new Float64Array(n);
  const raw = new Float64Array(n);
  for (let fi = 0; fi < frames.length; fi += step) {
    const d = frames[fi].data;
    for (const [x0, y0] of positions) {
      let s = 0;
      let sx = 0;
      let sy = 0;
      let left = 0;
      let top = 0;
      let highClipped = 0;
      let lowClipped = 0;
      for (let yy = 0; yy < t; yy++)
        for (let xx = 0; xx < t; xx++) {
          const v = d[(y0 + yy) * W + x0 + xx];
          raw[yy * t + xx] = v;
          if (v >= scale.hi - q) highClipped++;
          if (v <= scale.lo + q) lowClipped++;
          s += v;
          sx += v * (xx - c);
          sy += v * (yy - c);
          if (xx < t / 2) left += v;
          if (yy < t / 2) top += v;
        }
      // el p90 no puede estar en el blanco ni la mediana cerca del negro
      if (highClipped > 0.05 * n || lowClipped > 0.25 * n) continue;
      const m = s / n;
      const bx = sx / sxx;
      const by = sy / sxx;
      for (let yy = 0; yy < t; yy++) for (let xx = 0; xx < t; xx++) vals[yy * t + xx] = raw[yy * t + xx] - bx * (xx - c) - by * (yy - c);
      const sorted = Array.from(vals).sort((a, b) => a - b);
      const at = (p: number): number => {
        const h = p * (n - 1);
        const i = Math.floor(h);
        return sorted[i] + (sorted[Math.min(n - 1, i + 1)] - sorted[i]) * (h - i);
      };
      const q10 = at(0.1);
      const q50 = at(0.5);
      const q90 = at(0.9);
      const spread = q90 - q50;
      if (!(spread > 0) || spread < minSpread) continue;
      const half = n / 2;
      const dx = Math.abs(left / half - (s - left) / half);
      const dy = Math.abs(top / half - (s - top) / half);
      if (Math.max(dx, dy) > maxHalf * spread) continue;
      // los recortes: ningún píxel recortado por encima de la mediana; la mediana, a más de dos dispersiones del negro
      if (q50 - 2 * spread <= scale.lo) continue;
      let mean = 0;
      for (let i = 0; i < n; i++) mean += vals[i];
      mean /= n;
      for (let i = 0; i < n; i++) vals[i] -= mean;
      out.push({
        x: x0,
        y: y0,
        frame: fi,
        q10,
        q50,
        q90,
        lowClipped: lowClipped > 0.05 * n,
        size: t,
        grainX: halfCorrelationLag(vals, t, true),
        grainY: halfCorrelationLag(vals, t, false),
      });
      void m;
    }
  }
  return out;
}

export interface GreyMapEstimate {
  tiles: number;
  bins: number;
  /** Rango de grises (mediana de las teselas) que cubren las franjas usadas. */
  greySpan: [number, number];
  /** g₉₀ − g₅₀ = slope·(g₅₀ − negro) + intercept. */
  slope: number;
  intercept: number;
  /** Curvatura del mapa (c de greyMap) y su intervalo de remuestreo (p10–p90). */
  c: number;
  cRange: [number, number];
  /** Rango dinámico (dB) suponiendo el moteado sin suavizar (una cota superior si lo está) y su intervalo. */
  rangeDb: number;
  rangeDbRange: [number, number];
  /** Asimetría por cuantiles en dB, (p50 − p10)/(p90 − p50): 1,57 sin suavizar, → 1 promediando. */
  asymmetry: number;
  /**
   * El grano del moteado (mediana de las teselas, px en x y en y: el desfase con autocorrelación 0,5). Si la autocorrelación
   * no cae antes de media tesela, la media tesela: una cota inferior.
   */
  grainPx: [number, number];
  /** dB(g₂) − dB(g₁) con el mapa estimado (grises de la escala del clip); NaN fuera de los grises que cubren las teselas. */
  dbBetween: (g1: number, g2: number) => number;
  reliable: boolean;
  reasons: string[];
}

export interface FitOptions {
  scale?: GreyScale;
  binWidth?: number;
  minPerBin?: number;
  minBins?: number;
  minSpan?: number;
  minTiles?: number;
  bootstrap?: number;
  seed?: number;
  /** Lado mínimo de la tesela en granos (MIN_TILE_GRAINS). */
  minTileGrains?: number;
}

function robustLine(points: { g: number; s: number; w: number }[]): { a: number; b: number } {
  let pts = points;
  let a = Number.NaN;
  let b = Number.NaN;
  for (let iter = 0; iter < 4; iter++) {
    let sw = 0;
    let sg = 0;
    let ss = 0;
    for (const p of pts) {
      sw += p.w;
      sg += p.w * p.g;
      ss += p.w * p.s;
    }
    const mg = sg / sw;
    const ms = ss / sw;
    let num = 0;
    let den = 0;
    for (const p of pts) {
      num += p.w * (p.g - mg) * (p.s - ms);
      den += p.w * (p.g - mg) ** 2;
    }
    b = den > 0 ? num / den : 0;
    a = ms - b * mg;
    const res = pts.map((p) => Math.abs(p.s - a - b * p.g));
    const mad = 1.4826 * median(res);
    const keep = pts.filter((_, i) => !(mad > 0) || res[i] <= 3 * mad);
    if (keep.length === pts.length || keep.length < 3) break;
    pts = keep;
  }
  return { a, b };
}

function binned(tiles: readonly SpeckleTile[], lo: number, binWidth: number, minPerBin: number) {
  const bins = new Map<number, SpeckleTile[]>();
  for (const t of tiles) {
    const k = Math.floor((t.q50 - lo) / binWidth);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k)!.push(t);
  }
  const points = [...bins.values()]
    .filter((v) => v.length >= minPerBin)
    .map((v) => ({ g: median(v.map((t) => t.q50 - lo)), s: median(v.map((t) => t.q90 - t.q50)), w: v.length }));
  const line = points.length >= 2 ? robustLine(points) : { a: Number.NaN, b: Number.NaN };
  return { points, slope: line.b, intercept: line.a };
}

const LN_Q_RATIO = Math.log(rayleighQuantile(0.9) / rayleighQuantile(0.5));

/**
 * c y RD de la recta g₉₀ − g₅₀ = S·g₅₀ + I (grises desde el negro). S = (Q₉₀/Q₅₀)^q − 1 lleva el signo de c: positiva si el
 * mapa levanta los grises bajos (c > 0), cero en el logarítmico puro y negativa si los aplasta (−1 < c < 0); la ordenada
 * I = S·G/c es positiva en los tres. Fuera de eso (I ≤ 0, S ≤ −1 o c ≤ −1) la recta no es de un mapa de la familia: NaN.
 */
export function mapOfLine(slope: number, intercept: number, G: number): { c: number; rangeDb: number } {
  const none = { c: Number.NaN, rangeDb: Number.NaN };
  if (!(intercept > 0) || !Number.isFinite(slope)) return none;
  if (Math.abs(slope) <= 1e-6) return { c: 0, rangeDb: (RAYLEIGH_P90_P50_DB * G) / intercept };
  if (slope <= -1) return none;
  const c = (G * slope) / intercept;
  if (c <= -1) return none;
  const q = Math.log(1 + slope) / LN_Q_RATIO;
  const beta = (q * Math.LN10) / 20;
  return { c, rangeDb: Math.log(1 + c) / beta };
}

/**
 * dB (desde una referencia fija) del gris g, contado desde el negro, por el mapa (c, RD) sobre G grises: con
 * g + G/c ∝ A^q, dB = ln|g + G/c|/β, β = ln(1 + c)/RD (los dos negativos si c < 0); con c = 0, g·RD/G.
 */
export function dbOfGreyMap(g: number, c: number, rangeDb: number, G: number): number {
  if (!Number.isFinite(c) || !Number.isFinite(rangeDb)) return Number.NaN;
  if (Math.abs(c) <= 1e-9) return (g * rangeDb) / G;
  return Math.log(Math.abs(g + G / c)) / (Math.log(1 + c) / rangeDb);
}

/** El mapa de grises de un conjunto de teselas (ver la cabecera). */
export function fitGreyMap(tiles: readonly SpeckleTile[], opts: FitOptions = {}): GreyMapEstimate {
  const scale = opts.scale ?? GREY_8BIT;
  const G = scale.hi - scale.lo;
  const lo = scale.lo;
  const binWidth = opts.binWidth ?? 8;
  const minPerBin = opts.minPerBin ?? 5;
  const minTileGrains = opts.minTileGrains ?? MIN_TILE_GRAINS;
  const fit = binned(tiles, lo, binWidth, minPerBin);
  const { c, rangeDb } = mapOfLine(fit.slope, fit.intercept, G);
  let seed = opts.seed ?? 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const cs: number[] = [];
  const rs: number[] = [];
  for (let b = 0; b < (opts.bootstrap ?? 100) && tiles.length; b++) {
    const sample = Array.from({ length: tiles.length }, () => tiles[Math.floor(rnd() * tiles.length)]);
    const f = binned(sample, lo, binWidth, minPerBin);
    const m = mapOfLine(f.slope, f.intercept, G);
    if (Number.isFinite(m.c)) {
      cs.push(m.c);
      rs.push(m.rangeDb);
    }
  }
  const toDb = (g: number): number => dbOfGreyMap(g - lo, c, rangeDb, G);
  const asym = median(
    tiles.filter((t) => !t.lowClipped && t.q10 > lo + scale.quantum).map((t) => (toDb(t.q50) - toDb(t.q10)) / (toDb(t.q90) - toDb(t.q50))),
  );
  const reasons: string[] = [];
  const span: [number, number] = fit.points.length
    ? [lo + Math.min(...fit.points.map((p) => p.g)), lo + Math.max(...fit.points.map((p) => p.g))]
    : [Number.NaN, Number.NaN];
  if (tiles.length < (opts.minTiles ?? 200)) reasons.push(`pocas teselas de moteado (${tiles.length})`);
  if (fit.points.length < (opts.minBins ?? 4)) reasons.push(`pocas franjas de gris (${fit.points.length})`);
  if (!(span[1] - span[0] >= (opts.minSpan ?? 40))) reasons.push(`las teselas cubren pocos grises (${(span[1] - span[0]).toFixed(0)})`);
  if (!Number.isFinite(c)) reasons.push('la dispersión no es una recta del gris de un mapa de la familia');
  const cR: [number, number] = cs.length ? [quantile(cs, 0.1), quantile(cs, 0.9)] : [Number.NaN, Number.NaN];
  const rR: [number, number] = rs.length ? [quantile(rs, 0.1), quantile(rs, 0.9)] : [Number.NaN, Number.NaN];
  if (Number.isFinite(c) && !(cR[1] - cR[0] <= Math.max(1, 0.5 * c)))
    reasons.push(`c inestable (p10–p90 ${cR[0].toFixed(2)}–${cR[1].toFixed(2)})`);
  // el moteado tiene que ser de Rayleigh: la asimetría en dB, 1,57 (la pared del simulador, con su textura, da 1,1–1,3)
  if (Number.isFinite(asym) && !(asym >= ASYMMETRY_BAND[0] && asym <= ASYMMETRY_BAND[1]))
    reasons.push(`asimetría en dB ${asym.toFixed(2)}: no es moteado de Rayleigh sin suavizar (${ASYMMETRY_BAND.join('–')})`);
  else if (!Number.isFinite(asym)) reasons.push('sin mapa no se mide la asimetría en dB');
  // el grano: con teselas de menos de MIN_TILE_GRAINS granos, la dispersión dentro de cada una sale corta y RD alto
  const grainPx: [number, number] = [median(tiles.map((t) => t.grainX)), median(tiles.map((t) => t.grainY))];
  const size = median(tiles.map((t) => t.size));
  if (tiles.length && !(size >= minTileGrains * Math.max(...grainPx)))
    reasons.push(
      `grano grueso para la tesela (${grainPx.map((v) => (v >= size / 2 ? '≥ ' : '') + v.toFixed(1)).join(' × ')} px; tesela ${size} px < ${minTileGrains} granos)`,
    );
  return {
    tiles: tiles.length,
    bins: fit.points.length,
    greySpan: span,
    slope: fit.slope,
    intercept: fit.intercept,
    c,
    cRange: cR,
    rangeDb,
    rangeDbRange: rR,
    asymmetry: asym,
    grainPx,
    // solo dentro de los grises que cubren las teselas: fuera, el mapa extrapola (un mapa fuera de la familia, una sigmoide o
    // una gamma, puede dar ±7 % dentro y el doble fuera; segunda revisión de la decisión 31)
    dbBetween: (g1, g2) =>
      [g1, g2].every((g) => g >= span[0] - binWidth / 2 && g <= span[1] + binWidth / 2) ? toDb(g2) - toDb(g1) : Number.NaN,
    reliable: reasons.length === 0,
    reasons,
  };
}

/** Teselas y mapa de un clip, de una vez. */
export function estimateGreyMap(
  frames: readonly GreyFrame[],
  geometry: SectorGeometry,
  opts: SpeckleTileOptions & FitOptions = {},
): GreyMapEstimate {
  return fitGreyMap(speckleTiles(frames, geometry, opts), opts);
}

export interface GainSweepEstimate {
  /** Ubicaciones (teselas en el mismo sitio a ≥ 4 ganancias) y la mediana e IQR de c y RD sobre ellas. */
  locations: number;
  c: number;
  cIqr: [number, number];
  rangeDb: number;
  rangeDbIqr: [number, number];
}

/**
 * La familia de mapas con un barrido de ganancia conocido (la autoprueba en el simulador): en cada ubicación la dispersión
 * g₉₀ − g₅₀ es una recta de g₅₀ a través de las ganancias, cuya pendiente y ordenada dan c sin suponer nada sobre la forma del
 * moteado (solo que no cambia con el nivel), y ln(g₅₀ + G/c) crece con la ganancia con pendiente β = ln(1 + c)/RD. No usa la
 * DE de Rayleigh: prueba que el mapa se puede leer de la imagen mostrada; el estimador de una imagen necesita además que el
 * moteado sea de Rayleigh.
 */
export function fitGreyMapAcrossGains(
  series: readonly { gainDb: number; tiles: readonly SpeckleTile[] }[],
  scale: GreyScale = GREY_8BIT,
): GainSweepEstimate {
  const G = scale.hi - scale.lo;
  const byLoc = new Map<string, { g: number; m: number; s: number }[]>();
  for (const { gainDb, tiles } of series)
    for (const t of tiles) {
      const k = `${t.x}:${t.y}:${t.frame}`;
      if (!byLoc.has(k)) byLoc.set(k, []);
      byLoc.get(k)!.push({ g: gainDb, m: t.q50 - scale.lo, s: t.q90 - t.q50 });
    }
  const cs: number[] = [];
  const rs: number[] = [];
  for (const v of byLoc.values()) {
    if (v.length < 4) continue;
    const n = v.length;
    const mm = v.reduce((a, p) => a + p.m, 0) / n;
    const ms = v.reduce((a, p) => a + p.s, 0) / n;
    const den = v.reduce((a, p) => a + (p.m - mm) ** 2, 0);
    if (!(den > 0)) continue;
    const S = v.reduce((a, p) => a + (p.m - mm) * (p.s - ms), 0) / den;
    const I = ms - S * mm;
    if (!(I > 0 && S > 0)) continue;
    const c = (G * S) / I;
    const y = v.map((p) => Math.log(p.m + G / c));
    const mg = v.reduce((a, p) => a + p.g, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    const dg = v.reduce((a, p) => a + (p.g - mg) ** 2, 0);
    const beta = v.reduce((a, p, i) => a + (p.g - mg) * (y[i] - my), 0) / dg;
    if (!(beta > 0)) continue;
    cs.push(c);
    rs.push(Math.log(1 + c) / beta);
  }
  return {
    locations: cs.length,
    c: median(cs),
    cIqr: [quantile(cs, 0.25), quantile(cs, 0.75)],
    rangeDb: median(rs),
    rangeDbIqr: [quantile(rs, 0.25), quantile(rs, 0.75)],
  };
}
