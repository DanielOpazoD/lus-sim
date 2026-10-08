import {
  ALVEOLAR_SOURCE,
  B_LINES,
  DIFFUSE_SALT,
  DRAW_CELL_FRACTION,
  DRAW_PITCH_FRACTION,
  ETA_MAX,
  MIN_CHART_DET,
  MIN_TRAP_WEIGHT,
  RING_LATTICE_MM,
  RING_SALT,
  TRAP_SOURCE,
  WINDOW_SIGMAS,
} from './bLines';
import { CELL_INDEX_OFFSET, SUBPLEURAL_TRAPS } from '../anatomy/organs/subpleural';
import { alveolarAccessFraction, pcgHash, septalOpenFraction, trapCell, u24 } from '../anatomy/organs/subpleuralTraps';
import { quadGas, type SubpleuralQuad } from '../physiology/lungAeration';

/**
 * Gemelo TS de `B_LINES_GLSL` (lus-sim, decisión 51; `bLines.ts`): las trampas que ve una línea, su reirradiación y la reflexión
 * especular que queda. Lo usan las pruebas, el gemelo de la pleura y la equivalencia con la GPU; vive aparte para no viajar en la
 * entrada del bundle (la imagen usa la GLSL).
 */
const BP = B_LINES.params;
const TP = SUBPLEURAL_TRAPS.params;

/** ¿Puede abrirse algo con la menor fracción de gas del pulmón? (la guarda barata de la pasada B). */
export function lungMayOpen(minGas: number): boolean {
  return minGas < Math.max(TP.septalOnsetGas.value, TP.alveolarOnsetGas.value);
}

/** Valor complejo gaussiano (varianza 1 por componente) del nodo `h` de una retícula: Box–Muller con dos hashes. */
export function gaussNode(h: number): [number, number] {
  const a = u24(pcgHash(h)) + 1 / 33554432;
  const b = u24(pcgHash((h ^ 0x9e3779b9) >>> 0));
  const r = Math.sqrt(-2 * Math.log(a));
  return [r * Math.cos(6.2831853 * b), r * Math.sin(6.2831853 * b)];
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Pesos de la interpolación entre dos nodos independientes, normalizados para que la varianza no cambie entre nodos: con
 * (1 − f, f) a secas, a medio camino la energía cae a la mitad (−3 dB) y el campo deja bandas a cada paso de la retícula.
 */
export function nodeWeights(t: number): [number, number] {
  const f = smooth(t);
  const n = 1 / Math.sqrt((1 - f) * (1 - f) + f * f);
  return [(1 - f) * n, f * n];
}

/**
 * La reirradiación de la trampa de hash `h` a la profundidad aparente τ ≥ 0 (sin la caída): una señal aleatoria fija a la trampa,
 * con su correlación en τ del paso `RING_LATTICE_MM` (luego la de la pasada C).
 */
export function ringDown(h: number, tau: number): [number, number] {
  const x = tau / RING_LATTICE_MM;
  const k = Math.floor(x);
  const [wa, wb] = nodeWeights(x - k);
  const a = gaussNode(pcgHash((h ^ pcgHash((k + RING_SALT) >>> 0)) >>> 0));
  const b = gaussNode(pcgHash((h ^ pcgHash((k + 1 + RING_SALT) >>> 0)) >>> 0));
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
}

/**
 * Campo difuso de la inundación alveolar en el punto (u, z) del mapa de la pleura a τ: fuentes por debajo de la resolución en una
 * retícula de `diffuseGrainMm` en el mapa, cada una con su reirradiación en τ al paso de las trampas (`RING_LATTICE_MM`), con los
 * pesos normalizados (`nodeWeights`) en los tres ejes.
 */
export function diffuseField(u: number, z: number, tau: number, seedU: number): [number, number] {
  const g = BP.diffuseGrainMm.value;
  const x = u / g;
  const y = z / g;
  const t = tau / RING_LATTICE_MM;
  const [i0, j0, k0] = [Math.floor(x), Math.floor(y), Math.floor(t)];
  const wx = nodeWeights(x - i0);
  const wy = nodeWeights(y - j0);
  const wt = nodeWeights(t - k0);
  const node = (i: number, j: number, k: number): [number, number] =>
    gaussNode(
      pcgHash(
        (seedU ^ pcgHash((i + CELL_INDEX_OFFSET * 16) ^ pcgHash((j + CELL_INDEX_OFFSET * 16) ^ pcgHash((k + DIFFUSE_SALT) >>> 0)))) >>> 0,
      ),
    );
  let re = 0;
  let im = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++) {
        const w = wx[a] * wy[b] * wt[c];
        const v = node(i0 + a, j0 + b, k0 + c);
        re += w * v[0];
        im += w * v[1];
      }
  return [re, im];
}

/**
 * Geometría de una línea en la pleura para las trampas: el punto de la pleura en el mapa (u, z) (con el pulmón en su posición de
 * espiración: z + lo que ha bajado), las derivadas del mapa a lo largo de las direcciones lateral y elevacional de la imagen,
 * k = (∂u/∂lat, ∂z/∂lat, ∂u/∂elev, ∂z/∂elev) —con el mapa en mm de la superficie, la distancia de una trampa (Δu, Δz) al eje del
 * haz es Δlat = k₀·Δu + k₁·Δz y su distancia elevacional, Δelev = k₂·Δu + k₃·Δz (la proyección: Jᵀ, no J⁻¹: en incidencia
 * oblicua el haz corta la pleura en una huella cos θ veces más corta en su dirección)— y las anchuras del haz en la pleura: la
 * lateral de dos vías (σl, la que fija cuánto entra), la de dibujo y la elevacional de dos vías.
 */
export interface TrapGeometry {
  u: number;
  z: number;
  k: readonly [number, number, number, number];
  sigmaPhysMm: number;
  sigmaDrawMm: number;
  sigmaElevMm: number;
}

/**
 * La geometría desde las derivadas del mapa a lo largo de la dirección lateral de la imagen (`uLat`, `zLat`: mm de u y de z por
 * mm) y de la elevacional (`uElev`, `zElev`), el paso entre líneas en la pleura y las dos σ del haz. null si el plano corre a lo
 * largo de la normal de la pleura (sin trampas que ver).
 */
export function trapGeometry(
  u: number,
  z: number,
  uLat: number,
  zLat: number,
  uElev: number,
  zElev: number,
  sigmaTxMm: number,
  pitchMm: number,
  sigmaElevMm: number,
): TrapGeometry | null {
  const det = uLat * zElev - uElev * zLat;
  if (!(Math.abs(det) >= MIN_CHART_DET)) return null;
  const draw = Math.min(Math.max(sigmaTxMm, DRAW_PITCH_FRACTION * pitchMm), DRAW_CELL_FRACTION * TP.septalCellMm.value);
  return { u, z, k: [uLat, zLat, uElev, zElev], sigmaPhysMm: sigmaTxMm, sigmaDrawMm: draw, sigmaElevMm };
}

/** Distancias lateral y elevacional al eje del haz de una trampa desplazada (Δu, Δz) en el mapa. */
export function trapOffset(g: TrapGeometry, du: number, dz: number): [number, number] {
  return [g.k[0] * du + g.k[1] * dz, g.k[2] * du + g.k[3] * dz];
}

/** Lo que la pasada B suma en una muestra de una línea con pleura: la reirradiación (re, im) y la reflexión especular que queda. */
export interface BLineSample {
  re: number;
  im: number;
  /** ρ = (1 − η)·(1 − ηa): el factor de cada reflexión en la pleura de la línea. */
  rho: number;
  /** η de las trampas (con su tope) y ηa del campo medio. */
  eta: number;
  alveolar: number;
  /** Trampas abiertas que ve la línea (peso ≥ `MIN_TRAP_WEIGHT`). */
  traps: number;
}

const NONE: BLineSample = { re: 0, im: 0, rho: 1, eta: 0, alveolar: 0, traps: 0 };

/**
 * Las trampas que ve una línea y su reirradiación a la profundidad aparente τ = r − D (τ < 0: sobre la pleura, solo ρ). `q`: el
 * cuadrilátero de la aireación que contiene el punto de la línea (las trampas vecinas se deciden con él, `quadGas`); `minGas`: la
 * menor fracción de gas del pulmón (`lungMayOpen`). Gemelo de `bLineField` (GLSL).
 */
export function trapScan(g: TrapGeometry | null, q: SubpleuralQuad, minGas: number, seedU: number, tau: number): BLineSample {
  if (!lungMayOpen(minGas)) return NONE;
  const gasP = quadGas(q, g?.u ?? 0, g?.z ?? 0);
  const alveolar = g ? alveolarAccessFraction(gasP) : 0;
  let eta = 0;
  let re = 0;
  let im = 0;
  let traps = 0;
  const lo = Math.min(...q.g);
  const hi = Math.max(...q.g);
  if (g && septalOpenFraction(lo - 0.5 * (hi - lo)) > 0) {
    const a = TP.septalCellMm.value;
    const kappa0 = Math.min(1, TP.septalAccessMm2.value / (2 * Math.PI * g.sigmaPhysMm * g.sigmaElevMm));
    const rl = WINDOW_SIGMAS * g.sigmaDrawMm;
    const rel = WINDOW_SIGMAS * g.sigmaElevMm;
    // la caja en el mapa de la ventana |Δlat| ≤ rl, |Δelev| ≤ rel: (Δu, Δz) = M·(Δlat, Δelev), M = k⁻¹
    const det = g.k[0] * g.k[3] - g.k[1] * g.k[2];
    const M = [g.k[3] / det, -g.k[1] / det, -g.k[2] / det, g.k[0] / det];
    const hu = Math.min(Math.hypot(rl * M[0], rel * M[1]), 1.5 * a);
    const hz = Math.min(Math.hypot(rl * M[2], rel * M[3]), 1.5 * a);
    const i0 = Math.floor((g.u - hu) / a);
    const j0 = Math.floor((g.z - hz) / a);
    const ni = Math.min(Math.floor((g.u + hu) / a) - i0, 3);
    const nj = Math.min(Math.floor((g.z + hz) / a) - j0, 3);
    for (let di = 0; di <= ni; di++)
      for (let dj = 0; dj <= nj; dj++) {
        const c = trapCell(i0 + di, j0 + dj, seedU);
        if (!(c.xi < septalOpenFraction(quadGas(q, c.u, c.z)))) continue;
        const du = c.u - g.u;
        const dz = c.z - g.z;
        const [dl, de] = trapOffset(g, du, dz);
        const w = Math.exp(-0.5 * ((dl * dl) / (g.sigmaDrawMm * g.sigmaDrawMm) + (de * de) / (g.sigmaElevMm * g.sigmaElevMm)));
        if (w < MIN_TRAP_WEIGHT) continue;
        const kw = kappa0 * c.size * w;
        eta += kw;
        traps++;
        if (tau >= 0) {
          const s = ringDown(c.hash, tau);
          re += kw * s[0];
          im += kw * s[1];
        }
      }
  }
  eta = Math.min(eta, ETA_MAX);
  const decay = tau >= 0 ? Math.exp(-tau / BP.ringDownEfoldMm.value) : 0;
  re *= TRAP_SOURCE * decay;
  im *= TRAP_SOURCE * decay;
  if (g && alveolar > 0 && tau >= 0) {
    const d = diffuseField(g.u, g.z, tau, seedU);
    re += ALVEOLAR_SOURCE * alveolar * decay * d[0];
    im += ALVEOLAR_SOURCE * alveolar * decay * d[1];
  }
  return { re, im, rho: (1 - eta) * (1 - alveolar), eta, alveolar, traps };
}
