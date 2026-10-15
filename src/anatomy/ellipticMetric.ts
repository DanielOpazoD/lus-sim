import type { Vec3 } from '../core/vec3';

/** Radios físicos de una sección y sus derivadas axiales; las traslaciones ya se han restado de (x, y). */
export interface EllipticMetric {
  readonly a: number;
  readonly b: number;
  readonly da: number;
  readonly db: number;
  readonly dx: number;
  readonly dy: number;
}

/** Álgebra de la sección regular (r, ρ > 0). El llamador valida su dominio; no define el límite en el eje. */
export function ellipticRadialDepth(r: number, rho: number): number {
  return (rho - 1) * (r / rho);
}

/** ∇d físico completo, no unitario; x, y relativos al centro, r = hypot(x,y), ρ = hypot(x/a,y/b). */
export function ellipticRadialGradient(x: number, y: number, r: number, rho: number, s: EllipticMetric): Vec3 {
  const k = 1 - 1 / rho;
  const c = r / (rho * rho * rho);
  const gx = (x / r) * k + (c * x) / (s.a * s.a);
  const gy = (y / r) * k + (c * y) / (s.b * s.b);
  if (s.da === 0 && s.db === 0 && s.dx === 0 && s.dy === 0) return [gx, gy, 0];
  const gz = -s.dx * gx - s.dy * gy - c * ((x * x * s.da) / s.a ** 3 + (y * y * s.db) / s.b ** 3);
  return [gx, gy, gz === 0 ? 0 : gz];
}

export const ELLIPTIC_METRIC_GLSL = /* glsl */ `
struct EllipticMetric { vec2 radius; vec2 dRadius; vec2 dCenter; };
float ellipticRadialDepth(float r, float rho) { return (rho - 1.0) * (r / rho); }
vec3 ellipticRadialGradient(vec2 xy, float r, float rho, EllipticMetric s) {
  float c = r / (rho * rho * rho);
  vec2 g = xy / r * (1.0 - 1.0 / rho) + c * xy / (s.radius * s.radius);
  if (all(equal(s.dRadius, vec2(0.0))) && all(equal(s.dCenter, vec2(0.0)))) return vec3(g, 0.0);
  return vec3(g, -dot(s.dCenter, g) - c * dot(xy * xy * s.dRadius, 1.0 / (s.radius * s.radius * s.radius)));
}
`;
