import { apertureTransmission, type ApertureGeometry, type BoneCoherence } from '../ultrasound/aperture';
import { pleuraCapMm } from '../ultrasound/pleura';
import { lineHits, prefixDb, type PrefixSample, type SegmentGrid } from '../ultrasound/transmission';

/**
 * Paridad de la pasada A de la mirada 0 con sus gemelos de TS (lus-sim, decisión 20), sin WebGL: la transmisión con
 * apertura (A o0.x, con la fase del hueso de cada toma) y la que dibuja la pasada B (A o2.z: bajo la pleura registrada,
 * la de su fila tope), sobre los segmentos de A0/A1 que la GPU acaba de escribir: el prefijo de A2 (`prefixDb`, con el
 * hueso de la línea), los obstáculos de A0 (`lineHits`) y `apertureTransmission`. Lo usa el gancho
 * `transmissionParity` de la mirada 0 y lo prueba `boneTransmission.test.ts`.
 *
 * Empates de redondeo: la GPU redondea en float32 las tomas del cono (`floor(off + 0,5)`); una muestra cuyo resultado
 * cambia al desplazar ese argumento ±`LOOK0_TIE_LINES` líneas está en un empate y no entra en el máximo.
 *
 * Condicionamiento (decisión 39, nota de la paridad con la mano): con hueso en el cono la media es la raíz de una suma de
 * fasores, p = Σ_j Σ_m a_j·a_m·cos(k·ΔL)·e^(−(σ·ΔL)²/2), que bajo una costilla casi se anula (hasta 28 dB por debajo de la
 * media incoherente en el BLUE inferior con la mano). Un error en los términos de esa suma es un error absoluto en la
 * potencia, del tamaño de los términos (la incoherente al cuadrado), y en la diferencia cruda en dB crece como
 * (T_incoherente/T)²: el atribuible a las trascendentes float32 de la GPU (SwiftShader) llegaba así a 0,03 dB con la mano del
 * operador, que recorre geometrías, y no cambiaba con el gemelo emulando float32 en toda la aritmética del cono. Por eso el
 * desacuerdo se exige en la escala de los términos, en potencia: `powerDiffDb` = 10·log10(1 + |T_TS² − T_GPU²|/T_inc²), con
 * T_inc la media incoherente (el mismo gemelo sin la fase del hueso, en la misma fila). Sin cancelación es la diferencia
 * cruda en dB; con ella no crece (medido con SwiftShader: ≤ 0,0006 dB con la mano en 24 instantes, frente a 0,030 la cruda).
 * Se descartó medir las amplitudes frente a la incoherente, 20·log10(1 + |ΔT|/T_inc): solo frena el crecimiento a
 * T_inc/T (≤ 0,0016 dB), y su margen se acabaría hacia los 44 dB de cancelación. La cruda, la cancelación máxima y la
 * fracción con cancelación profunda quedan en el informe.
 */
export const LOOK0_TIE_LINES = 1e-4;

/** Diferencia (dB) a partir de la cual el desplazamiento del redondeo cambia una muestra. */
const TIE_DB = 1e-3;

/** Cancelación (dB entre la media incoherente y la coherente) a partir de la cual una muestra cuenta como profunda. */
export const DEEP_CANCELLATION_DB = 20;

/** Lo que la paridad lee de la GPU: transmisión con apertura y dibujada, fila k·líneas + línea. */
export interface Look0GpuRead {
  lines: number;
  samples: number;
  aperture: ArrayLike<number>;
  drawn: ArrayLike<number>;
}

/** Una muestra del peor desacuerdo: dónde, los dos valores (dB de atenuación) y su cancelación coherente (dB). */
export interface Look0Worst {
  line: number;
  depthMm: number;
  tsDb: number;
  gpuDb: number;
  cancellationDb: number;
}

export interface Look0ApertureParity {
  lines: number;
  samples: number;
  ambiguous: number;
  /**
   * Peor desacuerdo (dB) de la transmisión con apertura y de la dibujada, donde alguna de las dos pasa de −60 dB: crudo
   * (`…DiffDb`, solo informa) y en potencia en la escala de los términos del cono (`…PowerDiffDb`, el que se exige).
   */
  apertureMaxDiffDb: number;
  drawnMaxDiffDb: number;
  apertureMaxPowerDiffDb: number;
  drawnMaxPowerDiffDb: number;
  /** Muestras con hueso en el cono (las que ejercen la fase), para que la prueba tenga dientes. */
  boneSamples: number;
  /**
   * Muestras donde se compara la apertura (alguna de las dos por encima de −60 dB), la fracción de ellas con la media coherente
   * más de `DEEP_CANCELLATION_DB` por debajo de la incoherente, y la cancelación máxima (dB) entre ellas.
   */
  apertureCompared: number;
  deepCancellationFraction: number;
  maxCancellationDb: number;
  worst: Look0Worst | null;
  worstPower: (Look0Worst & { powerDiffDb: number }) | null;
}

/** Gemelo de A de la mirada 0 en (línea, fila k), con el redondeo de las tomas desplazado `roundBias`. */
export function look0ApertureTwin(
  grid: SegmentGrid,
  ap: ApertureGeometry,
  coherence: BoneCoherence,
  roundBias = 0,
): {
  at: (l: number, k: number) => number;
  drawn: (l: number, k: number) => number;
  /** Lo mismo sin la fase del hueso: la media incoherente del cono, la escala de sus términos. */
  incoherent: (l: number, k: number) => number;
  drawnIncoherent: (l: number, k: number) => number;
  boneInCone: (l: number, k: number) => boolean;
} {
  const cache = new Map<number, PrefixSample>();
  const pre = (l: number, k: number): PrefixSample => {
    const key = l * grid.rows + k;
    let p = cache.get(key);
    if (!p) {
      p = prefixDb(grid, l, k);
      cache.set(key, p);
    }
    return p;
  };
  const obstacleMm = Array.from({ length: grid.lines }, (_, l) => {
    const h = lineHits(grid, l);
    const seg = h.gasSeg >= 0 ? (h.boneSeg >= 0 ? Math.min(h.gasSeg, h.boneSeg) : h.gasSeg) : h.boneSeg;
    return seg >= 0 ? (seg + 0.5) * grid.stepMm : Infinity;
  });
  const transmission = (l: number, k: number, phase: boolean): number =>
    apertureTransmission(
      ap,
      l,
      (k + 0.5) * grid.stepMm,
      (m) => Math.pow(10, -pre(m, k).db / 40),
      (m) => obstacleMm[m],
      roundBias,
      phase ? { mm: (m) => pre(m, k).boneMm, coherence } : undefined,
    );
  // bajo la pleura registrada, la de su fila tope
  const capped = (l: number, k: number): number => {
    const D = grid.pleuraD ? grid.pleuraD[l] : -1;
    return D > 0 ? Math.min(k, Math.floor(pleuraCapMm(D, grid.stepMm) / grid.stepMm)) : k;
  };
  const at = (l: number, k: number): number => transmission(l, k, true);
  const incoherent = (l: number, k: number): number => transmission(l, k, false);
  // hueso en alguna línea del alcance del cono (la búsqueda del obstáculo): muestras donde la fase puede actuar
  const W = Math.ceil((0.5 * ap.apertureTxMm) / (ap.curvatureRadius * ((2 * ap.halfSector) / ap.lines)));
  const boneInCone = (l: number, k: number): boolean => {
    for (let d = -W; d <= W; d++) {
      const m = l + d;
      if (m >= 0 && m < grid.lines && pre(m, k).boneMm > 0) return true;
    }
    return false;
  };
  return {
    at,
    drawn: (l, k) => at(l, capped(l, k)),
    incoherent,
    drawnIncoherent: (l, k) => incoherent(l, capped(l, k)),
    boneInCone,
  };
}

/** Desacuerdo en potencia en la escala de los términos del cono: 10·log10(1 + |T_TS² − T_GPU²|/T_incoherente²). */
function powerDiffDb(ts: number, gpu: number, incoherent: number): number {
  return 10 * Math.log10(1 + Math.abs(ts * ts - gpu * gpu) / Math.max(incoherent * incoherent, 1e-24));
}

/** Compara, cada `every` líneas y en todas las filas, la GPU con el gemelo (se saltan las muestras bajo −60 dB). */
export function compareLook0Aperture(
  grid: SegmentGrid,
  ap: ApertureGeometry,
  coherence: BoneCoherence,
  gpu: Look0GpuRead,
  every: number,
  tieLines = LOOK0_TIE_LINES,
): Look0ApertureParity {
  const exact = look0ApertureTwin(grid, ap, coherence);
  const lo = look0ApertureTwin(grid, ap, coherence, -tieLines);
  const hi = look0ApertureTwin(grid, ap, coherence, tieLines);
  const db = (x: number) => -20 * Math.log10(Math.max(x, 1e-12));
  let lines = 0;
  let samples = 0;
  let ambiguous = 0;
  let boneSamples = 0;
  let deep = 0;
  let compared = 0;
  let maxCancellationDb = 0;
  let apertureMaxDiffDb = 0;
  let drawnMaxDiffDb = 0;
  let apertureMaxPowerDiffDb = 0;
  let drawnMaxPowerDiffDb = 0;
  let worst: Look0ApertureParity['worst'] = null;
  let worstPower: Look0ApertureParity['worstPower'] = null;
  for (let u = 0; u < gpu.lines; u += every) {
    lines++;
    for (let k = 0; k < gpu.samples; k++) {
      const i = k * gpu.lines + u;
      const tsT = exact.at(u, k);
      const tsDrawnT = exact.drawn(u, k);
      const ts = db(tsT);
      const tsDrawn = db(tsDrawnT);
      const g = db(gpu.aperture[i]);
      const gDrawn = db(gpu.drawn[i]);
      if (ts > 60 && g > 60 && tsDrawn > 60 && gDrawn > 60) continue;
      const tie =
        Math.abs(db(lo.at(u, k)) - ts) > TIE_DB ||
        Math.abs(db(hi.at(u, k)) - ts) > TIE_DB ||
        Math.abs(db(lo.drawn(u, k)) - tsDrawn) > TIE_DB ||
        Math.abs(db(hi.drawn(u, k)) - tsDrawn) > TIE_DB;
      if (tie) {
        ambiguous++;
        continue;
      }
      samples++;
      if (exact.boneInCone(u, k)) boneSamples++;
      if (ts < 60 || g < 60) {
        const inc = exact.incoherent(u, k);
        const cancellationDb = ts - db(inc);
        compared++;
        if (cancellationDb > DEEP_CANCELLATION_DB) deep++;
        maxCancellationDb = Math.max(maxCancellationDb, cancellationDb);
        const diff = Math.abs(ts - g);
        const at = { line: u, depthMm: (k + 0.5) * grid.stepMm, tsDb: ts, gpuDb: g, cancellationDb };
        if (diff > apertureMaxDiffDb) {
          apertureMaxDiffDb = diff;
          worst = at;
        }
        const power = powerDiffDb(tsT, gpu.aperture[i], inc);
        if (power > apertureMaxPowerDiffDb) {
          apertureMaxPowerDiffDb = power;
          worstPower = { ...at, powerDiffDb: power };
        }
      }
      if (tsDrawn < 60 || gDrawn < 60) {
        drawnMaxDiffDb = Math.max(drawnMaxDiffDb, Math.abs(tsDrawn - gDrawn));
        drawnMaxPowerDiffDb = Math.max(drawnMaxPowerDiffDb, powerDiffDb(tsDrawnT, gpu.drawn[i], exact.drawnIncoherent(u, k)));
      }
    }
  }
  return {
    lines,
    samples,
    ambiguous,
    apertureMaxDiffDb,
    drawnMaxDiffDb,
    apertureMaxPowerDiffDb,
    drawnMaxPowerDiffDb,
    boneSamples,
    apertureCompared: compared,
    deepCancellationFraction: compared > 0 ? deep / compared : 0,
    maxCancellationDb,
    worst,
    worstPower,
  };
}
