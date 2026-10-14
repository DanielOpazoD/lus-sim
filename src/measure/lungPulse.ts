/**
 * El pulso pulmonar y la estratósfera medidos en el modo M (lus-sim, decisión 32): sobre las columnas de la franja (el gris de
 * 8 bits que se ve), en la banda bajo la línea pleural. Mide la señal, no el modelo (guía §20): la misma cuenta serviría
 * para un clip real con su modo M.
 *
 *  - F-T11, la estratósfera (`docs/knowledge/physics.md` §3.3): «con deslizamiento 0 y pulso pulmonar 0, la correlación
 *    temporal de las líneas de modo M bajo la pleura es ≥ 0,95 en 2 s». `bandCorrelation` da la menor correlación de Pearson
 *    entre dos columnas separadas ≤ `windowS` en la banda.
 *  - S3, el pulso pulmonar (`docs/knowledge/reference-images.md` §3.2): «pico espectral del desplazamiento pleural a la
 *    frecuencia cardiaca cuando el deslizamiento es mínimo». `bandSpectrum` da la potencia media de las filas de la banda
 *    (el gris de cada fila en el tiempo, sin su media) por frecuencia, y su pico.
 */

/** Columna de una franja: gris por fila (fila 0 = la cara). */
export type MColumn = ArrayLike<number>;

/** Filas de la franja entre `fromMm` y `toMm` bajo la pleura (a `pleuraMm`), con `samples` filas en `depthMm`. */
export function bandRows(pleuraMm: number, fromMm: number, toMm: number, samples: number, depthMm: number): number[] {
  const rows: number[] = [];
  for (let r = 0; r < samples; r++) {
    const d = ((r + 0.5) / samples) * depthMm - pleuraMm;
    if (d >= fromMm && d <= toMm) rows.push(r);
  }
  return rows;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  // dos columnas planas e iguales están correlacionadas del todo; una plana y otra no, nada
  if (saa === 0 || sbb === 0) return saa === sbb && a.every((v, i) => v === b[i]) ? 1 : 0;
  return sab / Math.sqrt(saa * sbb);
}

/** La menor correlación entre dos columnas de la banda separadas como mucho `windowS` (F-T11). */
export function bandCorrelation(columns: readonly MColumn[], times: readonly number[], rows: readonly number[], windowS: number): number {
  if (columns.length !== times.length) throw new RangeError('bandCorrelation: columnas e instantes de largo distinto');
  if (rows.length < 3) throw new RangeError('bandCorrelation: banda de menos de 3 filas');
  const band = columns.map((c) => rows.map((r) => c[r]));
  let min = 1;
  for (let i = 0; i < band.length; i++)
    for (let j = i + 1; j < band.length && times[j] - times[i] <= windowS + 1e-9; j++) min = Math.min(min, pearson(band[i], band[j]));
  return min;
}

/**
 * La orilla de mar (F-T10, decisión 54): por fila de la franja, la correlación de Pearson media entre pares de columnas
 * separadas `lagS` (± medio paso de la franja) en el tiempo del gris de esa fila frente al de las filas vecinas (± `halfRows`,
 * para que una fila sola, casi plana, no decida). Fila 0 = la cara. Sobre la pared, que no se mueve respecto de la sonda,
 * la correlación es alta («líneas»); bajo la pleura, que se desliza, cae («arena»). Mide la señal, no el modelo: la misma
 * cuenta sirve para el modo M de un clip real.
 */
export function rowLagCorrelation(columns: readonly MColumn[], times: readonly number[], lagS: number, halfRows = 2): number[] {
  if (columns.length !== times.length) throw new RangeError('rowLagCorrelation: columnas e instantes de largo distinto');
  if (columns.length < 2) throw new RangeError('rowLagCorrelation: menos de 2 columnas');
  if (!(lagS > 0)) throw new RangeError('rowLagCorrelation: retardo no positivo');
  const samples = columns[0].length;
  // pares (i, j): j la primera columna a ≥ lagS de i
  const pairs: [number, number][] = [];
  let j = 0;
  for (let i = 0; i < columns.length; i++) {
    while (j < columns.length && times[j] - times[i] < lagS - 1e-9) j++;
    if (j >= columns.length) break;
    pairs.push([i, j]);
  }
  if (pairs.length === 0) throw new RangeError('rowLagCorrelation: la franja dura menos que el retardo');
  const out = new Array<number>(samples).fill(0);
  for (let r = 0; r < samples; r++) {
    const r0 = Math.max(0, r - halfRows);
    const r1 = Math.min(samples - 1, r + halfRows);
    let acc = 0;
    for (const [i, k] of pairs) {
      const a: number[] = [];
      const b: number[] = [];
      for (let q = r0; q <= r1; q++) {
        a.push(columns[i][q]);
        b.push(columns[k][q]);
      }
      acc += pearson(a, b);
    }
    out[r] = acc / pairs.length;
  }
  return out;
}

/**
 * Profundidad (mm) a la que empieza la decorrelación temporal (F-T10): la primera fila, desde la cara, cuya correlación
 * (`rowLagCorrelation`) baja de `threshold` y se queda por debajo en las `run` filas siguientes; NaN si ninguna. Las filas
 * por encima de `fromMm` (el transitorio de la cara) no cuentan.
 */
export function decorrelationOnsetMm(rowCorr: readonly number[], depthMm: number, threshold = 0.5, run = 3, fromMm = 2): number {
  const n = rowCorr.length;
  for (let r = 0; r + run <= n; r++) {
    const d = ((r + 0.5) / n) * depthMm;
    if (d < fromMm) continue;
    let ok = true;
    for (let k = 0; k < run && ok; k++) ok = rowCorr[r + k] < threshold;
    if (ok) return d;
  }
  return Number.NaN;
}

export interface BandSpectrum {
  /** Frecuencias (Hz) de 1/T a la de Nyquist. */
  hz: number[];
  /** Potencia media de las filas de la banda en cada frecuencia (gris²). */
  power: number[];
  /** Frecuencia del pico entre `minHz` y `maxHz`. */
  peakHz: number;
  /** Potencia del pico sobre la mediana de la potencia entre `minHz` y `maxHz`. */
  peakOverMedian: number;
}

/**
 * Espectro de la banda (S3): columnas a intervalos iguales (`dtS`); la potencia de la DFT del gris de cada fila sin su media,
 * promediada en las filas. El pico se busca entre `minHz` y `maxHz` (por omisión, 0,5–4 Hz: 30–240 lpm).
 */
export function bandSpectrum(columns: readonly MColumn[], dtS: number, rows: readonly number[], minHz = 0.5, maxHz = 4): BandSpectrum {
  const n = columns.length;
  if (n < 8) throw new RangeError('bandSpectrum: menos de 8 columnas');
  if (!(dtS > 0)) throw new RangeError('bandSpectrum: intervalo no positivo');
  const kMax = Math.floor(n / 2);
  const power = new Array<number>(kMax).fill(0);
  for (const r of rows) {
    const g = columns.map((c) => c[r]);
    const mean = g.reduce((a, b) => a + b, 0) / n;
    for (let k = 1; k <= kMax; k++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        const w = (-2 * Math.PI * k * i) / n;
        re += (g[i] - mean) * Math.cos(w);
        im += (g[i] - mean) * Math.sin(w);
      }
      power[k - 1] += (re * re + im * im) / (n * n * rows.length);
    }
  }
  const hz = power.map((_, i) => (i + 1) / (n * dtS));
  const inBand = power.map((p, i) => ({ p, f: hz[i] })).filter((x) => x.f >= minHz && x.f <= maxHz);
  if (inBand.length === 0) throw new RangeError('bandSpectrum: ninguna frecuencia en la banda pedida');
  const peak = inBand.reduce((a, b) => (b.p > a.p ? b : a));
  const sorted = inBand.map((x) => x.p).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { hz, power, peakHz: peak.f, peakOverMedian: median > 0 ? peak.p / median : peak.p > 0 ? Infinity : 0 };
}
