import { lateralSigmaMm, type BeamParams } from '../ultrasound/beamModel';
import { applyLateralKernel, lateralKernelParts, pedestalShadowFactor, type ClutterParams } from '../ultrasound/clutter';

/**
 * Paridad de la pasada D con su gemelo de TS (lus-sim, decisión 20), sin WebGL: sobre el campo que la GPU le dio a D (tras
 * la pasada C), el núcleo lateral de `lateralKernelParts` con el pedestal atenuado en sombra (`pedestalShadowFactor` con la
 * transmisión dibujada de A, interpolada en profundidad como la GPU) y la envolvente calibrada, frente a la envolvente de la
 * GPU. Lo usa el gancho `lateralParity` y lo prueba `lateralParity.test.ts`.
 */

/** Lo que la paridad lee de la GPU y de su cuadro. */
export interface LateralParityInputs {
  lines: number;
  /** Filas finas de D y filas gruesas de la transmisión. */
  samples: number;
  coarseRows: number;
  depthMm: number;
  focusMm: number;
  curvatureRadius: number;
  halfSector: number;
  beam: BeamParams;
  clutter: Pick<ClutterParams, 'sidelobeIslr' | 'sidelobeWidth'>;
  /** Campo complejo de entrada de D (fila·líneas + línea). */
  re: ArrayLike<number>;
  im: ArrayLike<number>;
  /** Acoplamiento por línea. */
  coupling: ArrayLike<number>;
  /** Transmisión dibujada de A (A o2.z) por fila gruesa·líneas + línea. */
  drawn: ArrayLike<number>;
  /** Envolvente de la GPU (fila·líneas + línea). */
  envelope: ArrayLike<number>;
}

export interface LateralParity {
  samples: number;
  /** Peor diferencia (dB) entre la GPU y el gemelo, en las muestras a menos de 100 dB del máximo de la envolvente. */
  maxDiffDb: number;
  /** Muestras donde el pedestal en sombra cambia la envolvente > 3 dB frente al pedestal de siempre (que la guarda muerda). */
  shadowedSamples: number;
  worst: { line: number; row: number; twinDb: number; gpuDb: number } | null;
}

/** Envolvente calibrada de D: E|z| de una gaussiana compleja unitaria es √π/2. */
const ENVELOPE_GAIN = 1.1283792;

/** Gemelo de D en (línea u, fila v), con o sin la atenuación del pedestal en sombra. */
export function lateralTwin(inp: LateralParityInputs, u: number, v: number, shadow = true): number {
  const { lines, samples } = inp;
  const r = ((v + 0.5) / samples) * inp.depthMm;
  const sigmaMm = lateralSigmaMm(r, inp.focusMm, inp.beam);
  const lineSpacing = (inp.curvatureRadius + r) * ((2 * inp.halfSector) / (lines - 1));
  const sigmaTex = Math.max(0.35, sigmaMm / lineSpacing);
  const parts = lateralKernelParts(sigmaTex, inp.clutter, inp.coupling[u]);
  // la transmisión dibujada con el filtro lineal de la GPU en profundidad (la línea, en el centro de su téxel)
  const y = ((v + 0.5) / samples) * inp.coarseRows - 0.5;
  const y0 = Math.max(0, Math.min(inp.coarseRows - 1, Math.floor(y)));
  const y1 = Math.max(0, Math.min(inp.coarseRows - 1, Math.floor(y) + 1));
  const fy = Math.min(1, Math.max(0, y - Math.floor(y)));
  const tAt = (l: number): number => {
    const a = inp.drawn[y0 * lines + l];
    return a + (inp.drawn[y1 * lines + l] - a) * fy;
  };
  const clampLine = (l: number) => Math.min(lines - 1, Math.max(0, l));
  const tDest = tAt(u);
  const [re, im] = applyLateralKernel(
    parts,
    (k) => {
      const i = v * lines + clampLine(u + k);
      return [inp.re[i], inp.im[i]];
    },
    (k) => (shadow ? pedestalShadowFactor(tDest, tAt(clampLine(u + k))) : 1),
  );
  return Math.hypot(re, im) * ENVELOPE_GAIN;
}

/** Compara, cada `every` líneas y `rowEvery` filas, la envolvente de la GPU con el gemelo. */
export function compareLateral(inp: LateralParityInputs, every: number, rowEvery: number): LateralParity {
  let peak = 0;
  for (let i = 0; i < inp.lines * inp.samples; i++) peak = Math.max(peak, inp.envelope[i]);
  // hasta 100 dB bajo el máximo: el núcleo de las sombras, donde el pedestal en sombra cambia la envolvente
  const floor = peak * 1e-5;
  const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));
  let samples = 0;
  let shadowedSamples = 0;
  let maxDiffDb = 0;
  let worst: LateralParity['worst'] = null;
  for (let u = 0; u < inp.lines; u += every)
    for (let v = 0; v < inp.samples; v += rowEvery) {
      const gpu = inp.envelope[v * inp.lines + u];
      const twin = lateralTwin(inp, u, v);
      if (gpu < floor && twin < floor) continue;
      samples++;
      if (Math.abs(db(lateralTwin(inp, u, v, false)) - db(twin)) > 3) shadowedSamples++;
      const d = Math.abs(db(gpu) - db(twin));
      if (d > maxDiffDb) {
        maxDiffDb = d;
        worst = { line: u, row: v, twinDb: db(twin), gpuDb: db(gpu) };
      }
    }
  return { samples, maxDiffDb, shadowedSamples, worst };
}
