import type { Vec3 } from '../core/vec3';
import {
  addExact,
  subtractExact,
  multiplyExact,
  exactPolynomial,
  firstNonpositive,
  rationalFromNumber,
  subtractRational,
  divideRational,
  compareRational,
  type ExactPolynomial,
  type Rational,
} from '../core/exactPolynomial';
import { axialSurfaceDepth, axialSurfaceDepthGradient, createAxialRestSurface, type AxialRestSurface } from './axialRestSurface';
import { AXIAL_REST_NUMERICS } from './axialRestMap';
import { ellipticSkinEntry, type SkinSurface } from './skinSurface';

/** Precisión técnica del intervalo del primer cruce, no grosor de gel ni tolerancia de acoplamiento. */
export const SKIN_ENTRY_NUMERICS = Object.freeze({ rootMm: 1e-6 });

function validateRay(E: Vec3, dir: Vec3, r0: number, r1: number): void {
  const n = AXIAL_REST_NUMERICS;
  const physicalLimit = n.materialLimitMm * n.maxScale + n.maxShiftMm;
  if (
    !E.every((v) => Number.isFinite(v) && Math.abs(v) <= physicalLimit) ||
    !dir.every((v) => Number.isFinite(v) && Math.abs(v) <= n.vectorLimit) ||
    ![r0, r1].every((v) => Number.isFinite(v) && Math.abs(v) <= n.materialLimitMm) ||
    r0 > r1 ||
    ![r0, r1].every((r) => Math.abs(E[2] + r * dir[2]) <= n.materialLimitMm)
  )
    throw new Error('axialSkinSurface: rayo fuera del dominio numérico axial');
}

const constant = (x: number) => exactPolynomial([x]);
const square = (p: ExactPolynomial) => multiplyExact(p, p);

/** Multiplicar por L⁴>0 convierte ρ²−1 en X²B²+Y²A²−A²B², de grado ≤12, sin dividir ni redondear coeficientes. */
function implicitPolynomial(surface: AxialRestSurface, E: Vec3, dir: Vec3, region: 0 | 1 | 2): ExactPolynomial {
  const m = surface.map;
  let L = constant(1);
  let H = constant(region === 2 ? 1 : 0);
  if (region === 1) {
    const span = subtractExact(constant(m.zEnd), constant(m.zStart));
    const z = subtractExact(exactPolynomial([dir[2], E[2]]), constant(m.zStart));
    L = multiplyExact(square(span), span);
    H = multiplyExact(square(z), subtractExact(multiplyExact(constant(3), span), multiplyExact(constant(2), z)));
  }
  const axis = (radius: number, scale: number) =>
    multiplyExact(constant(radius), addExact(L, multiplyExact(subtractExact(constant(scale), constant(1)), H)));
  const coordinate = (i: number, shift: number) =>
    subtractExact(multiplyExact(exactPolynomial([dir[i], E[i]]), L), multiplyExact(constant(shift), H));
  const A2 = square(axis(surface.a, m.scaleX));
  const B2 = square(axis(surface.b, m.scaleY));
  return subtractExact(
    addExact(multiplyExact(square(coordinate(0, m.shiftX)), B2), multiplyExact(square(coordinate(1, m.shiftY)), A2)),
    multiplyExact(A2, B2),
  );
}

/** Entradas y tangencias se aíslan con aritmética exacta; no se infieren de un paso mínimo o de una distancia pequeña. */
export function axialSkinSurface(input: AxialRestSurface): SkinSurface {
  const surface = createAxialRestSurface(input.a, input.b, input.map);
  const m = surface.map;
  const identity = m.scaleX === 1 && m.scaleY === 1 && m.shiftX === 0 && m.shiftY === 0;
  return {
    depth: (p) => axialSurfaceDepth(p, surface),
    gradient: (p) => axialSurfaceDepthGradient(p, surface),
    entry: (E, dir, r0, r1) => {
      validateRay(E, dir, r0, r1);
      if (identity) return ellipticSkinEntry(E, dir, surface, r0, r1);
      const lo = rationalFromNumber(r0);
      const hi = rationalFromNumber(r1);
      const plane = (z: number) =>
        divideRational(subtractRational(rationalFromNumber(z), rationalFromNumber(E[2])), rationalFromNumber(dir[2]));
      const start = dir[2] === 0 ? null : plane(m.zStart);
      const end = dir[2] === 0 ? null : plane(m.zEnd);
      const cuts = [
        lo,
        ...[start, end].filter((p): p is Rational => p !== null && compareRational(lo, p) < 0 && compareRational(p, hi) < 0),
        hi,
      ].sort(compareRational);
      const tolerance = SKIN_ENTRY_NUMERICS.rootMm / Math.max(1, Math.hypot(...dir));
      for (let i = 0; i < cuts.length - 1; i++) {
        const left = cuts[i];
        const right = cuts[i + 1];
        let region: 0 | 1 | 2;
        if (start === null || end === null) region = E[2] <= m.zStart ? 0 : E[2] >= m.zEnd ? 2 : 1;
        else if (dir[2] > 0) region = compareRational(right, start) <= 0 ? 0 : compareRational(left, end) >= 0 ? 2 : 1;
        else region = compareRational(left, start) >= 0 ? 0 : compareRational(right, end) <= 0 ? 2 : 1;
        const hit = firstNonpositive(implicitPolynomial(surface, E, dir, region), left, right, tolerance);
        if (hit !== null) return hit;
      }
      return null;
    },
  };
}
