import type { EnvelopeFrame } from './speckle';

/**
 * El espejo del diafragma (meta F-T34 de la base, `docs/knowledge/physics.md` §5; lus-sim, decisión 37): con el pulmón aireado
 * sobre el diafragma, la interfaz diafragma–pulmón refleja casi todo y el hígado o el bazo reaparecen al otro lado, virtuales; la
 * base pide que el virtual esté presente y sea ≥ 3 dB más débil que el real, y que la columna no se vea sobre el diafragma. La
 * imagen no lo pinta: la pasada A sigue el rayo reflejado en el primer pulmón del tórax y la B forma lo que encuentra por ese
 * camino.
 *
 * Se mide lo que ve el alumno: el nivel mostrado (`level`: la envolvente con la TGC del usuario, la compensación nominal y la
 * ganancia, `displayLevelDb`), línea por línea, en una ventana de tejido real antes del espejo y en otra de virtual detrás, a la
 * misma distancia de él (`MIRROR_WINDOW`). Con la envolvente sin compensar la diferencia sería sobre todo la atenuación del
 * camino de más (≈ 9 dB en 30 mm de hígado), no el espejo.
 */
export const MIRROR_WINDOW = {
  /** Separación de cada ventana del espejo (mm): fuera del eco de la cara del diafragma. */
  gapMm: 5,
  /** Largo de cada ventana (mm). */
  lengthMm: 20,
} as const;

/**
 * Nivel mostrado (dB) desde el que el virtual cuenta como presente, con el preajuste pulmonar a 16 cm: 6 dB sobre el ruido del
 * receptor medido donde no hay tejido que ver (la mutación «sin espejo, el rayo sigue recto» deja detrás del espejo solo gas: el
 * virtual medido en las mismas vistas, −87,9 a −89,5 dB con GPU real, 03-10-2026) [SUPUESTO: el margen de 6 dB].
 */
export const PRESENT_MIN_DB = -82;

export interface MirrorStats {
  /** Líneas con espejo y las dos ventanas dentro de la imagen. */
  lines: number;
  /** Profundidad mediana del espejo en ellas (mm). */
  mirrorMm: number;
  /** Nivel mostrado medio (dB, en potencia) del tejido real antes del espejo y del virtual detrás. */
  realDb: number;
  virtualDb: number;
  /** Real menos virtual en el nivel mostrado (dB): F-T34 pide ≥ 3. */
  contrastDb: number;
  /** Lo mismo con la envolvente sin compensar (dB): sobre todo la atenuación del camino de más; solo como referencia. */
  rawContrastDb: number;
}

/**
 * El espejo de cada línea (mm a lo largo de ella; −1 sin espejo) a partir de la transmisión de la pasada A
 * (`TransmissionRead.mirrorHit`, por fila: −1 hasta la fila del espejo): la primera fila que lo tiene.
 */
export function mirrorDepths(lines: number, samples: number, mirrorHit: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let u = 0; u < lines; u++) {
    let m = -1;
    for (let k = 0; k < samples && m < 0; k++) if (mirrorHit[k * lines + u] >= 0) m = mirrorHit[k * lines + u];
    out.push(m);
  }
  return out;
}

/** Media en potencia (dB) de niveles en dB. */
function powerMeanDb(sumLinear: number, n: number): number {
  return 10 * Math.log10(sumLinear / n);
}

/**
 * Contraste real − virtual del espejo en la envolvente `env` (profundidad `depthMm`), con el espejo de cada línea y el nivel
 * mostrado `level(envDb, r)` de una muestra de envolvente `envDb` (dB re 1) a la distancia r (mm).
 */
export function mirrorContrast(
  env: EnvelopeFrame,
  mirror: readonly number[],
  depthMm: number,
  level: (envDb: number, r: number) => number,
): MirrorStats {
  if (mirror.length !== env.lines) throw new RangeError(`mirrorContrast: ${mirror.length} espejos para ${env.lines} líneas`);
  const W = MIRROR_WINDOW;
  const dz = depthMm / env.samples;
  const acc = { real: 0, virt: 0, rawReal: 0, rawVirt: 0, nReal: 0, nVirt: 0 };
  const used: number[] = [];
  for (let u = 0; u < env.lines; u++) {
    const m = mirror[u];
    if (m < W.gapMm + W.lengthMm || m + W.gapMm + W.lengthMm > depthMm) continue;
    used.push(m);
    for (let k = 0; k < env.samples; k++) {
      const r = (k + 0.5) * dz;
      const a = env.data[k * env.lines + u];
      const shown = 10 ** (level(20 * Math.log10(Math.max(a, 1e-12)), r) / 10);
      if (r >= m - W.gapMm - W.lengthMm && r < m - W.gapMm) {
        acc.real += shown;
        acc.rawReal += a * a;
        acc.nReal++;
      } else if (r > m + W.gapMm && r <= m + W.gapMm + W.lengthMm) {
        acc.virt += shown;
        acc.rawVirt += a * a;
        acc.nVirt++;
      }
    }
  }
  if (used.length === 0 || acc.nReal === 0 || acc.nVirt === 0)
    return { lines: 0, mirrorMm: NaN, realDb: NaN, virtualDb: NaN, contrastDb: NaN, rawContrastDb: NaN };
  used.sort((a, b) => a - b);
  const realDb = powerMeanDb(acc.real, acc.nReal);
  const virtualDb = powerMeanDb(acc.virt, acc.nVirt);
  return {
    lines: used.length,
    mirrorMm: used[Math.floor(used.length / 2)],
    realDb,
    virtualDb,
    contrastDb: realDb - virtualDb,
    rawContrastDb: powerMeanDb(acc.rawReal, acc.nReal) - powerMeanDb(acc.rawVirt, acc.nVirt),
  };
}

export interface ColumnStats {
  /** Líneas con espejo cuya prolongación recta encuentra la columna dentro de la imagen. */
  lines: number;
  /** Nivel mostrado medio (dB, en potencia) a ±`COLUMN_HALF_MM` de donde la línea recta la encontraría. */
  columnDb: number;
}

/** Semiventana alrededor del eco que daría la columna (mm). */
export const COLUMN_HALF_MM = 3;

/**
 * La columna sobre el diafragma (F-T34): con el pulmón aireado no se ve. `vertebra[u]`: la distancia (mm) a la que la línea u,
 * siguiendo recta tras su espejo, encontraría la columna (−1 si no la encuentra). Devuelve el nivel mostrado ahí, que la prueba
 * compara con el del virtual: una columna visible sería un eco de hueso muy por encima del tejido.
 */
export function columnLevel(
  env: EnvelopeFrame,
  vertebra: readonly number[],
  depthMm: number,
  level: (envDb: number, r: number) => number,
): ColumnStats {
  const dz = depthMm / env.samples;
  let sum = 0;
  let n = 0;
  let lines = 0;
  for (let u = 0; u < env.lines; u++) {
    const v = vertebra[u];
    if (v < 0 || v + COLUMN_HALF_MM > depthMm) continue;
    lines++;
    for (let k = 0; k < env.samples; k++) {
      const r = (k + 0.5) * dz;
      if (Math.abs(r - v) > COLUMN_HALF_MM) continue;
      sum += 10 ** (level(20 * Math.log10(Math.max(env.data[k * env.lines + u], 1e-12)), r) / 10);
      n++;
    }
  }
  return { lines, columnDb: n ? powerMeanDb(sum, n) : NaN };
}
