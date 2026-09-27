import { apertureTransmission, type ApertureGeometry, type BoneCoherence } from '../ultrasound/aperture';
import { pleuraCapMm } from '../ultrasound/pleura';
import { lineHits, prefixDb, type PrefixSample, type SegmentGrid } from '../ultrasound/transmission';

/**
 * Paridad de la pasada A de la mirada 0 con sus gemelos de TS (lus-sim, decisión 20), sin WebGL: la transmisión con
 * apertura (A o0.x, con la fase del hueso de cada toma) y la que dibuja la pasada B (A o2.z: bajo la pleura registrada,
 * la de su fila tope), sobre los segmentos de A0/A1 que la GPU acaba de escribir: el prefijo de A2 (`prefixDb`, con el
 * hueso de la línea), los obstáculos de A0 (`lineHits`) y `apertureTransmission`. Lo usa el gancho
 * `transmissionParity` de la mirada 0 y lo prueba `apertureParity.test.ts`.
 *
 * Empates de redondeo: la GPU redondea en float32 las tomas del cono (`floor(off + 0,5)`); una muestra cuyo resultado
 * cambia al desplazar ese argumento ±`LOOK0_TIE_LINES` líneas está en un empate y no entra en el máximo.
 */
export const LOOK0_TIE_LINES = 1e-4;

/** Diferencia (dB) a partir de la cual el desplazamiento del redondeo cambia una muestra. */
const TIE_DB = 1e-3;

/** Lo que la paridad lee de la GPU: transmisión con apertura y dibujada, fila k·líneas + línea. */
export interface Look0GpuRead {
  lines: number;
  samples: number;
  aperture: ArrayLike<number>;
  drawn: ArrayLike<number>;
}

export interface Look0ApertureParity {
  lines: number;
  samples: number;
  ambiguous: number;
  /** Peor desacuerdo (dB) de la transmisión con apertura y de la dibujada, donde alguna de las dos pasa de −60 dB. */
  apertureMaxDiffDb: number;
  drawnMaxDiffDb: number;
  /** Muestras con hueso en el cono (las que ejercen la fase), para que la prueba tenga dientes. */
  boneSamples: number;
  worst: { line: number; depthMm: number; tsDb: number; gpuDb: number } | null;
}

/** Gemelo de A de la mirada 0 en (línea, fila k), con el redondeo de las tomas desplazado `roundBias`. */
export function look0ApertureTwin(
  grid: SegmentGrid,
  ap: ApertureGeometry,
  coherence: BoneCoherence,
  roundBias = 0,
): { at: (l: number, k: number) => number; drawn: (l: number, k: number) => number; boneInCone: (l: number, k: number) => boolean } {
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
  const at = (l: number, k: number): number =>
    apertureTransmission(
      ap,
      l,
      (k + 0.5) * grid.stepMm,
      (m) => Math.pow(10, -pre(m, k).db / 40),
      (m) => obstacleMm[m],
      roundBias,
      { mm: (m) => pre(m, k).boneMm, coherence },
    );
  const drawn = (l: number, k: number): number => {
    const D = grid.pleuraD ? grid.pleuraD[l] : -1;
    if (D > 0) {
      const kCap = Math.floor(pleuraCapMm(D, grid.stepMm) / grid.stepMm);
      if (k > kCap) return at(l, kCap);
    }
    return at(l, k);
  };
  // hueso en alguna línea del alcance del cono (la búsqueda del obstáculo): muestras donde la fase puede actuar
  const W = Math.ceil((0.5 * ap.apertureTxMm) / (ap.curvatureRadius * ((2 * ap.halfSector) / ap.lines)));
  const boneInCone = (l: number, k: number): boolean => {
    for (let d = -W; d <= W; d++) {
      const m = l + d;
      if (m >= 0 && m < grid.lines && pre(m, k).boneMm > 0) return true;
    }
    return false;
  };
  return { at, drawn, boneInCone };
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
  let apertureMaxDiffDb = 0;
  let drawnMaxDiffDb = 0;
  let worst: Look0ApertureParity['worst'] = null;
  for (let u = 0; u < gpu.lines; u += every) {
    lines++;
    for (let k = 0; k < gpu.samples; k++) {
      const i = k * gpu.lines + u;
      const ts = db(exact.at(u, k));
      const tsDrawn = db(exact.drawn(u, k));
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
        const diff = Math.abs(ts - g);
        if (diff > apertureMaxDiffDb) {
          apertureMaxDiffDb = diff;
          worst = { line: u, depthMm: (k + 0.5) * grid.stepMm, tsDb: ts, gpuDb: g };
        }
      }
      if (tsDrawn < 60 || gDrawn < 60) drawnMaxDiffDb = Math.max(drawnMaxDiffDb, Math.abs(tsDrawn - gDrawn));
    }
  }
  return { lines, samples, ambiguous, apertureMaxDiffDb, drawnMaxDiffDb, boneSamples, worst };
}
