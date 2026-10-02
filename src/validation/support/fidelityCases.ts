import fc from 'fast-check';
import type { ClipAnalysis } from '../../measure/fidelity/metrics';
import type { GreyFrame } from '../../measure/fidelity/sector';
import { SYNTHETIC_CONVEX, syntheticLus, type SyntheticLusOptions } from './syntheticLus';

/**
 * Casos de la invariancia afín del banco de fidelidad (`fidelityInvariance.test.ts`, decisión 21): sintéticos pequeños del
 * patrón normal generados por fast-check, las métricas que se declaran invariantes y la tolerancia de 8 bits.
 */

/** Las métricas que se declaran invariantes, con nombre (las longitudes en px: la geometría no cambia con el gris). */
export function invariants(c: ClipAnalysis, withFloor = true): Record<string, number> {
  const m = c.perFrame[0];
  const out: Record<string, number> = {
    'dPl.px': m.structures.dPl.px,
    shadows: m.structures.shadows.length,
    'intercostal.columns': m.structures.intercostalColumns,
    P1: m.P1,
    'P2.px': m.P2.px,
    'P4.px': m.P4.px,
    'A1.max': m.A1.max,
    'A2.slopeLn': m.A2.slopeLn,
    'A2.visible': m.A2.visible,
    'T1.axial.px': m.T1.axial.px,
    'T1.lateral.px': m.T1.lateral.px,
    'T1.sigmaOverProminence': m.T1.sigmaOverProminence,
    'M.wall': m.M.wall,
    'M.haze': m.M.haze,
    'M.deep': m.M.deep,
    N4: m.N4,
  };
  // N1–N3 solo son invariantes con el suelo medido (la continua; en 8 bits el suelo del sintético roza el negro)
  if (withFloor) Object.assign(out, { N1: m.N1, N2: m.N2, N3: m.N3 });
  // r_k de cada orden encontrado, visible o no: A2 solo informa los visibles (decisión 31), y la visibilidad de un orden en
  // el umbral ya la cuenta A2.visible; la medida es la misma
  m.structures.aLines.slice(1, 4).forEach((p, i) => (out[`A2.r${i + 2}`] = p.ratio));
  if (c.stack) {
    out['T2.wall'] = c.stack.T2.wall.median;
    out['T2.subPleura'] = c.stack.T2.subPleura.median;
    out['S1.ratio'] = c.stack.S1.ratio;
    out['S1.decorrelationFrames'] = c.stack.S1.decorrelationFrames;
  }
  return out;
}

export const caseArb = fc.record({
  dPlMm: fc.double({ min: 12, max: 22, noNaN: true }),
  rib1: fc.double({ min: -0.38, max: -0.2, noNaN: true }),
  rib2: fc.double({ min: 0.02, max: 0.2, noNaN: true }),
  ribTopFraction: fc.double({ min: 0.55, max: 0.8, noNaN: true }),
  wall: fc.double({ min: 0.2, max: 0.4, noNaN: true }),
  haze: fc.double({ min: 0.1, max: 0.19, noNaN: true }),
  floor: fc.double({ min: 0.03, max: 0.08, noNaN: true }),
  decay: fc.double({ min: 0.35, max: 0.65, noNaN: true }),
  seed: fc.integer({ min: 1, max: 1_000_000 }),
});
export type Case = typeof caseArb extends fc.Arbitrary<infer T> ? T : never;

/**
 * Un sintético pequeño (300 × 260, 2,2 px/mm; tres cuadros con deslizamiento), o, con `cut`, su abanico corrido a la
 * derecha para que el borde derecho salga del cuadro en su mitad honda (como LUS-01). `lo` y `hi`: su rango en el sector.
 */
export function build(c: Case, cut = false): { o: SyntheticLusOptions; frames: GreyFrame[]; lo: number; hi: number } {
  const o: SyntheticLusOptions = {
    ...SYNTHETIC_CONVEX,
    width: 300,
    height: 260,
    scale: 2.2,
    apexX: cut ? 215 : 150,
    apexY: -70,
    halfSector: 0.45,
    dPlMm: c.dPlMm,
    depthMm: 100,
    hazeUntilMm: 70,
    ribs: [
      { from: c.rib1, to: c.rib1 + 0.14, topMm: c.ribTopFraction * c.dPlMm },
      { from: c.rib2, to: c.rib2 + 0.14, topMm: c.ribTopFraction * c.dPlMm },
    ],
    wall: c.wall,
    haze: c.haze,
    deep: 0.5 * (c.haze + c.floor),
    floor: c.floor,
    decay: c.decay,
    seed: c.seed,
  };
  const frames = syntheticLus(o, 3, 1.5, 0.02);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const f of frames)
    for (let i = 0; i < f.data.length; i++) if (f.data[i] !== o.outside) [lo, hi] = [Math.min(lo, f.data[i]), Math.max(hi, f.data[i])];
  return { o, frames, lo, hi };
}

/** Diferencias entre las métricas de dos análisis (relativas, o absolutas bajo 1); NaN solo casa con NaN. */
export function mismatches(x: Record<string, number>, y: Record<string, number>, tol: (k: string) => number): string[] {
  const out: string[] = [];
  for (const k of Object.keys(x)) {
    const u = x[k];
    const v = y[k];
    if (Number.isNaN(u) || Number.isNaN(v)) {
      if (Number.isNaN(u) !== Number.isNaN(v)) out.push(`${k}: ${u} → ${v}`);
      continue;
    }
    if (Math.abs(u - v) > tol(k) * Math.max(1, Math.abs(u))) out.push(`${k}: ${u} → ${v}`);
  }
  return out;
}

/** a y b tales que el sector entero quede en [lo8, hi8] (de 0–1) con `width` de ancho; `fraction` elige b en su rango. */
export function mapInto(lo: number, hi: number, width: number, fraction: number, lo8 = 8 / 255, hi8 = 250 / 255): [number, number] {
  const a = width / (hi - lo);
  const bMin = lo8 - a * lo;
  const bMax = hi8 - a * hi;
  return [a, bMin + fraction * (bMax - bMin)];
}

/** Dos contrastes de 8 bits: el ancho del sector entero entre 60 y 240 grises y su posición. */
export const eightBitArb = fc.record({
  width1: fc.double({ min: 60 / 255, max: 240 / 255, noNaN: true }),
  width2: fc.double({ min: 60 / 255, max: 240 / 255, noNaN: true }),
  b1: fc.double({ min: 0, max: 1, noNaN: true }),
  b2: fc.double({ min: 0, max: 1, noNaN: true }),
});

/**
 * Tolerancia de 8 bits por métrica (relativa, o absoluta bajo 1). Entre paréntesis, el peor de 200 corridas (02-10-2026, con el detector de líneas A sin la tendencia de la decisión 31) con
 * la geometría dada y con la fijada desde el detector; la tolerancia deja ≈ 2–3×. Lo que más se mueve es lo que depende del
 * ruido del cuadro frente al escalón: S1 (σ temporal de 1,2 grises en el contraste más bajo, junto al escalón/√12) y la
 * anchura lateral del moteado (en columnas enteras); A2.visible puede ganar o perder la línea A que está en el umbral (y con
 * ella cambian A1 y la pendiente de A2, que se ajustan sobre las visibles).
 */
export const TOL_8BIT: Record<string, number> = {
  'dPl.px': 0.02, // (0,0003 / 0,0003): una fila sobre ≈ 50
  shadows: 0,
  'intercostal.columns': 0.08, // (0,024 / 0,024)
  P1: 0.06, // (0,022 / 0,032)
  'P2.px': 0.03, // (0,007 / 0,009)
  'P4.px': 0.04, // (0,002 / 0,002): una fila sobre ≈ 25
  'A1.max': 0.03, // (0,001 / 0,017: con la geometría del detector, un orden en el umbral)
  // la pendiente se ajusta sobre los órdenes visibles: cambia cuando un orden débil cruza el umbral (decisión 31: 0,095; la
  // tolerancia pasó de 0,1 a 0,2 después de ver ese resultado)
  'A2.slopeLn': 0.2, // (0,095 / 0,083)
  'A2.visible': 0.5, // (0,5 / 0,5: una línea A en el umbral, con dos o más visibles)
  'A2.r2': 0.012, // (0,004 / 0,003)
  'A2.r3': 0.012, // (0,003 / 0,003)
  'A2.r4': 0.012, // (0,003 / 0,003)
  'T1.axial.px': 0.08, // (0,030 / 0,034)
  'T1.lateral.px': 0.15, // (0,046 / 0,084)
  'T1.sigmaOverProminence': 0.01, // (0,002 / 0,006)
  'M.wall': 0.015, // (0,005 / 0,008)
  'M.haze': 0.015, // (0,005 / 0,005)
  'M.deep': 0.015, // (0,004 / 0,005)
  N4: 0.04, // (0,014 / 0,014)
  'T2.wall': 0.06, // (0,026 / 0,023)
  'T2.subPleura': 0.05, // (0,026 / 0,024)
  'S1.ratio': 0.25, // (0,101 / 0,085)
  'S1.decorrelationFrames': 0.03, // (0,012 / 0,013)
};
