/**
 * Estadística del banco de fidelidad (decisión 21): funciones puras, deterministas y sin azar. Todas son equivariantes a
 * una transformación afín creciente del dato (x → a·x + b, a > 0) donde eso tiene sentido: los cuantiles, la media, el
 * umbral de Otsu y el pico parabólico se transforman con el dato; la desviación típica escala con a; la correlación y
 * los cocientes de diferencias no cambian. Es lo que hace invariantes a las métricas que se construyen encima
 * (`docs/knowledge/reference-images.md` §3.1, principio 5).
 */

/** Valores finitos de una lista. */
export function finite(v: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i])) out.push(v[i]);
  return out;
}

/** Cuantil q (0–1) con interpolación lineal entre órdenes (tipo 7 de Hyndman y Fan); NaN si no hay valores finitos. */
export function quantile(v: ArrayLike<number>, q: number): number {
  const s = finite(v).sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const x = Math.min(Math.max(q, 0), 1) * (s.length - 1);
  const i = Math.floor(x);
  const j = Math.min(i + 1, s.length - 1);
  return s[i] + (s[j] - s[i]) * (x - i);
}

export const median = (v: ArrayLike<number>): number => quantile(v, 0.5);

/** Mediana y rango intercuartílico (p25–p75) de una lista; NaN si no hay valores finitos. */
export function medianIqr(v: ArrayLike<number>): { median: number; p25: number; p75: number; n: number } {
  const f = finite(v);
  return { median: quantile(f, 0.5), p25: quantile(f, 0.25), p75: quantile(f, 0.75), n: f.length };
}

/** Media de los valores finitos; NaN si no hay ninguno. */
export function mean(v: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < v.length; i++)
    if (Number.isFinite(v[i])) {
      s += v[i];
      n++;
    }
  return n ? s / n : Number.NaN;
}

/** Desviación típica poblacional de los valores finitos; NaN si no hay ninguno. */
export function std(v: ArrayLike<number>): number {
  const m = mean(v);
  if (!Number.isFinite(m)) return Number.NaN;
  let s = 0;
  let n = 0;
  for (let i = 0; i < v.length; i++)
    if (Number.isFinite(v[i])) {
      s += (v[i] - m) ** 2;
      n++;
    }
  return Math.sqrt(s / n);
}

/**
 * Correlación de Pearson de dos listas del mismo largo (los pares con algún valor no finito se descartan); NaN si alguna
 * de las dos es constante o quedan menos de 3 pares.
 */
export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++)
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      sa += a[i];
      sb += b[i];
      n++;
    }
  if (n < 3) return Number.NaN;
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++)
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      const da = a[i] - ma;
      const db = b[i] - mb;
      cov += da * db;
      va += da * da;
      vb += db * db;
    }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : Number.NaN;
}

/**
 * Umbral de Otsu exacto (sin histograma, sobre los valores ordenados): el corte que maximiza la varianza entre las dos
 * clases. Devuelve el umbral (el punto medio entre los dos valores del corte: bajo = ≤ umbral) y η = σ²_entre/σ²_total.
 * Sin binning, el corte es equivariante a x → a·x + b. NaN con menos de dos valores distintos.
 */
export function otsu(v: ArrayLike<number>): { threshold: number; eta: number } {
  const s = finite(v).sort((a, b) => a - b);
  const n = s.length;
  if (n < 2 || s[0] === s[n - 1]) return { threshold: Number.NaN, eta: Number.NaN };
  const total = s.reduce((a, x) => a + x, 0);
  const m = total / n;
  const varT = s.reduce((a, x) => a + (x - m) ** 2, 0) / n;
  let best = -1;
  let cut = 0;
  let sum0 = 0;
  for (let i = 0; i < n - 1; i++) {
    sum0 += s[i];
    if (s[i] === s[i + 1]) continue;
    const w0 = (i + 1) / n;
    const m0 = sum0 / (i + 1);
    const m1 = (total - sum0) / (n - i - 1);
    const between = w0 * (1 - w0) * (m0 - m1) ** 2;
    if (between > best) {
      best = between;
      cut = i;
    }
  }
  return { threshold: 0.5 * (s[cut] + s[cut + 1]), eta: best / varT };
}

/**
 * Recta x = a + b·y ajustada a puntos (y, x) con RANSAC determinista: se prueban los pares de una submuestra regular de
 * a lo sumo `maxPoints` puntos, gana la recta con más puntos a ≤ `tol` y se refina por mínimos cuadrados sobre ellos.
 * null con menos de dos puntos de y distinta.
 */
export function robustLine(
  ys: readonly number[],
  xs: readonly number[],
  tol: number,
  maxPoints = 80,
): { a: number; b: number; inliers: number } | null {
  const n = ys.length;
  if (n < 2) return null;
  const step = Math.max(1, Math.floor(n / maxPoints));
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  let best: { a: number; b: number; count: number } | null = null;
  for (let p = 0; p < idx.length; p++)
    for (let q = p + 1; q < idx.length; q++) {
      const i = idx[p];
      const j = idx[q];
      if (ys[i] === ys[j]) continue;
      const b = (xs[j] - xs[i]) / (ys[j] - ys[i]);
      const a = xs[i] - b * ys[i];
      let count = 0;
      for (let k = 0; k < n; k++) if (Math.abs(xs[k] - (a + b * ys[k])) <= tol) count++;
      if (!best || count > best.count) best = { a, b, count };
    }
  if (!best) return null;
  // refinado por mínimos cuadrados sobre los puntos que caen en la tolerancia
  let sy = 0;
  let sx = 0;
  let syy = 0;
  let sxy = 0;
  let m = 0;
  for (let k = 0; k < n; k++)
    if (Math.abs(xs[k] - (best.a + best.b * ys[k])) <= tol) {
      sy += ys[k];
      sx += xs[k];
      syy += ys[k] * ys[k];
      sxy += xs[k] * ys[k];
      m++;
    }
  const den = m * syy - sy * sy;
  if (m < 2 || den === 0) return { a: best.a, b: best.b, inliers: best.count };
  const b = (m * sxy - sy * sx) / den;
  return { a: (sx - b * sy) / m, b, inliers: m };
}

/**
 * Vértice de la parábola por tres muestras equiespaciadas (y−1, y0, y+1): desplazamiento (−½…½) y valor. Si no es un
 * máximo (curvatura ≥ 0), el centro sin desplazar.
 */
export function parabolicPeak(ym: number, y0: number, yp: number): { offset: number; value: number } {
  const den = ym - 2 * y0 + yp;
  if (!(den < 0)) return { offset: 0, value: y0 };
  const offset = Math.min(0.5, Math.max(-0.5, (0.5 * (ym - yp)) / den));
  return { offset, value: y0 - 0.25 * (ym - yp) * offset };
}

/**
 * Pendiente por mínimos cuadrados de y contra x (pares finitos); NaN con menos de dos x distintas.
 */
export function slope(xs: readonly number[], ys: readonly number[]): number {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++)
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) {
      n++;
      sx += xs[i];
      sy += ys[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * ys[i];
    }
  const den = n * sxx - sx * sx;
  return n >= 2 && den !== 0 ? (n * sxy - sx * sy) / den : Number.NaN;
}

/**
 * Primer desfase (con interpolación lineal) en que una curva que empieza en 1 cae por debajo de `level`; NaN si no cae
 * dentro de la curva. Sirve para la anchura a media altura de una autocorrelación (level ½) y el tiempo de
 * decorrelación (1/e).
 */
export function crossingLag(curve: readonly number[], level: number): number {
  for (let k = 1; k < curve.length; k++)
    if (curve[k] < level) {
      const a = curve[k - 1];
      const b = curve[k];
      return a === b ? k : k - 1 + (a - level) / (a - b);
    }
  return Number.NaN;
}
