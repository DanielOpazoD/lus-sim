import type { EnvelopeFrame } from './speckle';

/**
 * La firma del gas del estómago (lus-sim, decisión 43): bajo la cúpula izquierda, en el espacio de Traube, el gas del estómago
 * refleja casi todo; detrás no se ve el tejido, sino la sombra «sucia» y las reverberaciones entre la sonda y el gas (Sommer y
 * Taylor; Rubin y cols.). La imagen no lo pinta: la pasada A encuentra el primer gas de cada línea y la B forma, detrás de él, las
 * reverberaciones a 2, 3 y 4 veces su profundidad y la cola sucia (la física del gas que no es pulmón, de VExUS).
 *
 * Se mide, como el espejo (`mirrorBench.ts`), en el nivel mostrado, línea por línea, en ventanas a distancias fijas del gas de cada
 * línea (`GAS_WINDOW`): delante, la pared del estómago; detrás, la sombra; y la primera reverberación (a 2 veces la profundidad del
 * gas) frente al valle entre ella y el gas (a 1,5 veces).
 */
export const GAS_WINDOW = {
  /** Delante del gas (mm antes de él): la pared del estómago y el diafragma. */
  before: [2, 8] as const,
  /** Detrás del gas (mm después de él): la sombra, donde sin el gas se vería la pared de detrás y el tejido de debajo. */
  shadow: [10, 40] as const,
  /** Semiancho (mm) de la ventana de la reverberación (2·g), del valle (1,5·g) y de la cara del gas (g). */
  halfMm: 1.5,
} as const;

export interface GasStats {
  /** Líneas con gas y todas sus ventanas dentro de la imagen. */
  lines: number;
  /** Profundidad mediana del gas en ellas (mm). */
  gasMm: number;
  /** Nivel mostrado medio (dB, en potencia) delante del gas, en su cara, en la sombra, en la reverberación y en el valle. */
  beforeDb: number;
  faceDb: number;
  shadowDb: number;
  reverbDb: number;
  troughDb: number;
}

/** Media en potencia (dB) de niveles en dB. */
function powerMeanDb(sumLinear: number, n: number): number {
  return 10 * Math.log10(sumLinear / n);
}

/**
 * Las ventanas del gas en la envolvente `env` (profundidad `depthMm`), con la profundidad del gas de cada línea (`gas[u]`, mm; −1
 * sin gas) y el nivel mostrado `level(envDb, r)` de una muestra de envolvente `envDb` (dB re 1) a la distancia r (mm).
 */
export function gasWindows(
  env: EnvelopeFrame,
  gas: readonly number[],
  depthMm: number,
  level: (envDb: number, r: number) => number,
): GasStats {
  if (gas.length !== env.lines) throw new RangeError(`gasWindows: ${gas.length} gases para ${env.lines} líneas`);
  const W = GAS_WINDOW;
  const dz = depthMm / env.samples;
  const acc = { before: 0, face: 0, shadow: 0, reverb: 0, trough: 0, nb: 0, nf: 0, ns: 0, nr: 0, nt: 0 };
  const used: number[] = [];
  for (let u = 0; u < env.lines; u++) {
    const g = gas[u];
    if (g < W.before[1] || 2 * g + W.halfMm > depthMm || g + W.shadow[1] > depthMm) continue;
    used.push(g);
    for (let k = 0; k < env.samples; k++) {
      const r = (k + 0.5) * dz;
      const shown = 10 ** (level(20 * Math.log10(Math.max(env.data[k * env.lines + u], 1e-12)), r) / 10);
      if (r >= g - W.before[1] && r <= g - W.before[0]) {
        acc.before += shown;
        acc.nb++;
      }
      if (Math.abs(r - g) <= W.halfMm) {
        acc.face += shown;
        acc.nf++;
      }
      if (r >= g + W.shadow[0] && r <= g + W.shadow[1]) {
        acc.shadow += shown;
        acc.ns++;
      }
      if (Math.abs(r - 2 * g) <= W.halfMm) {
        acc.reverb += shown;
        acc.nr++;
      }
      if (Math.abs(r - 1.5 * g) <= W.halfMm) {
        acc.trough += shown;
        acc.nt++;
      }
    }
  }
  if (used.length === 0 || !acc.nb || !acc.nf || !acc.ns || !acc.nr || !acc.nt)
    return { lines: 0, gasMm: NaN, beforeDb: NaN, faceDb: NaN, shadowDb: NaN, reverbDb: NaN, troughDb: NaN };
  used.sort((a, b) => a - b);
  return {
    lines: used.length,
    gasMm: used[Math.floor(used.length / 2)],
    beforeDb: powerMeanDb(acc.before, acc.nb),
    faceDb: powerMeanDb(acc.face, acc.nf),
    shadowDb: powerMeanDb(acc.shadow, acc.ns),
    reverbDb: powerMeanDb(acc.reverb, acc.nr),
    troughDb: powerMeanDb(acc.trough, acc.nt),
  };
}
