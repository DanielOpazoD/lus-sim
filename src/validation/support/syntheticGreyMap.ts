import type { GreyFrame, SectorGeometry } from '../../measure/fidelity/sector';
import { psf, whiteField } from '../syntheticSpeckle';

/**
 * Cuadros sintéticos de moteado de Rayleigh con un mapa de grises conocido, para probar el estimador del mapa
 * (`speckleMap.ts`, decisión 31): franjas horizontales de distinto nivel medio (dB sobre el blanco), moteado plenamente
 * desarrollado con grano gaussiano (campo complejo gaussiano y PSF), el mapa g = 255·((1 + c)^y − 1)/c con
 * y = 1 + dB/RD recortado a [0, 1] (c = 0: logarítmico puro, g = 255·y) y cuantizado a 8 bits. Con `interpolate` > 1, la
 * envolvente se calcula en una de cada `interpolate` columnas y se interpola linealmente entre ellas (en amplitud), como la
 * conversión de barrido entre líneas: el moteado queda suavizado.
 */
export interface SyntheticGreyMapOptions {
  width: number;
  height: number;
  /** Niveles medios de las franjas, en dB sobre el blanco (≤ 0), de arriba abajo. */
  levelsDb: number[];
  c: number;
  rangeDb: number;
  /** σ del grano (px, axial y lateral). */
  grain: number;
  interpolate: number;
  seed: number;
  /**
   * DE (dB) de una textura gaussiana en dB que multiplica el moteado (con el mismo grano): el moteado deja de ser de
   * Rayleigh (más ancho y más simétrico en dB), como la pared del simulador. 0 por omisión.
   */
  textureDb?: number;
  /**
   * La persistencia: el gris mostrado es la media de tantos cuadros de moteado independiente (1 por omisión). Promedia en
   * el gris, como el filtro temporal de un ecógrafo: estrecha la dispersión en todos los niveles.
   */
  looks?: number;
  /** El ruido de recepción, en dB sobre el blanco: blanco, complejo y sumado al eco antes de la detección (sin él por omisión). */
  noiseDb?: number;
}

export const SYNTHETIC_GREY_MAP: SyntheticGreyMapOptions = {
  width: 360,
  height: 480,
  levelsDb: [-62, -56, -50, -44, -38, -32, -26, -20, -14, -8],
  c: 3.5,
  rangeDb: 70,
  grain: 1,
  interpolate: 1,
  seed: 11,
};

/** El gris (0–255, sin cuantizar) de un nivel en dB sobre el blanco con el mapa (c, RD). */
export function greyOfDb(db: number, c: number, rangeDb: number): number {
  const y = Math.min(1, Math.max(0, 1 + db / rangeDb));
  return Math.abs(c) > 1e-9 ? (255 * (Math.pow(1 + c, y) - 1)) / c : 255 * y;
}

/** La geometría lineal que cubre el cuadro (con un margen de 3 px). */
export function syntheticGreyMapGeometry(o: SyntheticGreyMapOptions): SectorGeometry {
  return { kind: 'linear', xLeft: 3, xRight: o.width - 4, yTop: 3, yBottom: o.height - 4 };
}

export function syntheticGreyMapFrames(o: SyntheticGreyMapOptions, frames = 1): GreyFrame[] {
  const out: GreyFrame[] = [];
  const k = Math.max(1, Math.round(o.interpolate));
  const looks = Math.max(1, Math.round(o.looks ?? 1));
  const cols = Math.ceil((o.width - 1) / k) + 2;
  const band = o.height / o.levelsDb.length;
  const noiseAmp = o.noiseDb === undefined ? 0 : Math.pow(10, o.noiseDb / 20);
  for (let f = 0; f < frames; f++) {
    const g = { lines: cols, samples: o.height };
    const grey = new Float64Array(o.width * o.height);
    for (let look = 0; look < looks; look++) {
      const seed = o.seed + 7919 * f + 31337 * look;
      const field = psf(g, whiteField(g, seed), o.grain, o.grain / k);
      // la textura multiplica la amplitud: la parte real de otro campo complejo con el mismo grano es gaussiana de DE 1
      const tex = o.textureDb ? psf(g, whiteField(g, seed + 104729), o.grain, o.grain / k) : null;
      // el ruido de recepción: blanco, complejo, sumado al eco antes de la detección (la suma sigue siendo de Rayleigh)
      const noise = noiseAmp > 0 ? whiteField({ lines: o.width, samples: o.height }, seed + 15485863) : null;
      for (let y = 0; y < o.height; y++) {
        const level = Math.pow(10, o.levelsDb[Math.min(o.levelsDb.length - 1, Math.floor(y / band))] / 20);
        for (let x = 0; x < o.width; x++) {
          const u = x / k;
          const u0 = Math.floor(u);
          const w = u - u0;
          const i0 = y * cols + u0;
          const lerp = (arr: Float32Array, j: number): number => arr[2 * i0 + j] + (arr[2 * (i0 + 1) + j] - arr[2 * i0 + j]) * w;
          let amp: number;
          if (k === 1 || !noise) {
            const a0 = Math.hypot(field[2 * i0], field[2 * i0 + 1]);
            const a1 = Math.hypot(field[2 * (i0 + 1)], field[2 * (i0 + 1) + 1]);
            // interpolación en amplitud (la de la conversión de barrido)
            amp = (a0 + (a1 - a0) * w) / Math.SQRT2;
          } else amp = Math.hypot(lerp(field, 0), lerp(field, 1)) / Math.SQRT2;
          if (tex) amp *= Math.pow(10, (o.textureDb! * lerp(tex, 0)) / 20);
          let a = level * amp;
          if (noise) {
            // con fase: el eco con la fase de su campo (sin interpolar) más el ruido
            const re = level * lerp(field, 0) * (tex ? Math.pow(10, (o.textureDb! * lerp(tex, 0)) / 20) : 1);
            const im = level * lerp(field, 1) * (tex ? Math.pow(10, (o.textureDb! * lerp(tex, 0)) / 20) : 1);
            const j = 2 * (y * o.width + x);
            a = Math.hypot(re + noiseAmp * noise[j], im + noiseAmp * noise[j + 1]) / Math.SQRT2;
          }
          grey[y * o.width + x] += greyOfDb(20 * Math.log10(Math.max(a, 1e-9)), o.c, o.rangeDb) / looks;
        }
      }
    }
    out.push({ width: o.width, height: o.height, data: Uint8Array.from(grey, (v) => Math.round(v)) });
  }
  return out;
}
