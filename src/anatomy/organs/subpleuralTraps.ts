import { SUBPLEURAL_NODES, quadGas, type SubpleuralQuad } from '../../physiology/lungAeration';
import { CELL_INDEX_OFFSET, SEPTAL_SALT, SUBPLEURAL_TRAPS } from './subpleural';

/**
 * Gemelo TS de `SUBPLEURAL_GLSL` (lus-sim, decisión 51; `subpleural.ts`): la rampa de apertura, el hash entero de las celdas y
 * las trampas septales. Vive aparte para no viajar en la entrada del bundle (la imagen usa la GLSL).
 */
const TP = SUBPLEURAL_TRAPS.params;

/** La fracción de gas de cada nodo, leída de la tabla (lo que ve la GPU, en float32). */
export function tableGas(table: Float32Array): number[] {
  return Array.from({ length: SUBPLEURAL_NODES }, (_, i) => table[i * 4]);
}

/** La rampa de apertura: 0 con φ ≥ `onset`, 1 con φ ≤ `full`, `smoothstep` entre los dos (la de GLSL). */
export function openingRamp(gas: number, onset: number, full: number): number {
  const t = Math.min(1, Math.max(0, (onset - gas) / (onset - full)));
  return t * t * (3 - 2 * t);
}

/** Fracción de las trampas septales abiertas con la fracción de gas φ. */
export function septalOpenFraction(gas: number): number {
  return openingRamp(gas, TP.septalOnsetGas.value, TP.septalFullGas.value);
}

/** Fracción de la pleura accesible por la inundación alveolar con la fracción de gas φ (el campo medio). */
export function alveolarAccessFraction(gas: number): number {
  return TP.alveolarAccess.value * openingRamp(gas, TP.alveolarOnsetGas.value, TP.alveolarFullGas.value);
}

/** PCG de 32 bits (Jarzynski y Olano 2020), exacto en TS y en GLSL (`pcgHash`). */
export function pcgHash(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** Los 24 bits altos de un hash en [0, 1): exacto en float32 (`u24` en GLSL). */
export const u24 = (h: number): number => (h >>> 8) / 16777216;

/**
 * Semilla entera de las trampas del paciente: la que la GPU recupera de `uSeed` = (semilla mod 1000)/7 (el moteado de la pasada
 * B), `uint(uSeed·7 + 0,5)`.
 */
export const seedBits = (seed: number): number => (((seed % 1000) + 1000) % 1000) >>> 0;

/** Una celda de la retícula septal: la trampa (su posición en el mapa (u, z), mm), su susceptibilidad y su tamaño. */
export interface TrapCell {
  u: number;
  z: number;
  /** Susceptibilidad: la trampa está abierta si ξ < la fracción abierta de su región. */
  xi: number;
  /** Área de acceso relativa (1 − `accessSpread`·η, con η uniforme). */
  size: number;
  /** El hash de la celda (identifica su reirradiación). */
  hash: number;
}

/** La celda (i, j) de la retícula septal de la semilla `seedU` (`seedBits`). Gemelo de `trapCell` (GLSL). */
export function trapCell(i: number, j: number, seedU: number): TrapCell {
  const a = TP.septalCellMm.value;
  const h0 = pcgHash((seedU ^ pcgHash((i + CELL_INDEX_OFFSET) ^ pcgHash((j + CELL_INDEX_OFFSET + SEPTAL_SALT) >>> 0))) >>> 0);
  const h1 = pcgHash(h0);
  const h2 = pcgHash(h1);
  const h3 = pcgHash(h2);
  const jit = TP.siteJitter.value;
  return {
    u: (i + 0.5 + jit * (u24(h0) - 0.5)) * a,
    z: (j + 0.5 + jit * (u24(h1) - 0.5)) * a,
    xi: u24(h2),
    size: 1 - TP.accessSpread.value * u24(h3),
    hash: h3,
  };
}

/** ¿Está abierta la trampa de la celda con la aireación del cuadrilátero `q`? Su fracción de gas es la del punto de la trampa. */
export function trapOpen(c: TrapCell, q: SubpleuralQuad): boolean {
  return c.xi < septalOpenFraction(quadGas(q, c.u, c.z));
}
