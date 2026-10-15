import type { Vec3 } from '../core/vec3';
import {
  AXIAL_REST_MAP_GLSL,
  AXIAL_REST_NUMERICS,
  axialRestInverse,
  axialRestSection,
  createAxialRestMap,
  type AxialRestMap,
} from './axialRestMap';

/** Superficie de reposo físico, no un campo de tejidos deformado (decisión 57). Todavía fuera de la escena. */
export interface AxialRestSurface {
  readonly a: number;
  readonly b: number;
  readonly map: Readonly<AxialRestMap>;
}

/** Dominio técnico de este proveedor, no antropometría ni autorización para activar un paciente. */
export const AXIAL_SURFACE_NUMERICS = Object.freeze({
  minRadiusMm: 32,
  maxRadiusMm: 256,
  maxAspect: 8,
  minChartRho: 0.25,
  maxAbsPhi: Math.PI,
});

export function createAxialRestSurface(a: number, b: number, map: AxialRestMap): Readonly<AxialRestSurface> {
  const n = AXIAL_SURFACE_NUMERICS;
  if (![a, b].every((r) => Number.isFinite(r) && r >= n.minRadiusMm && r <= n.maxRadiusMm))
    throw new Error('axialRestSurface: semieje de referencia fuera del dominio numérico');
  const profile = createAxialRestMap(map);
  // a(z)/b(z) es un cociente de funciones afines de h con denominador positivo: sus extremos están en los extremos de h.
  if (![a / b, (a * profile.scaleX) / (b * profile.scaleY)].every((r) => r >= 1 / n.maxAspect && r <= n.maxAspect))
    throw new Error('axialRestSurface: sección excesivamente excéntrica para float32');
  return Object.freeze({ a, b, map: profile });
}

export function axialSurfaceSection(z: number, surface: AxialRestSurface) {
  const s = axialRestSection(z, surface.map);
  return {
    a: surface.a * s.scaleX,
    b: surface.b * s.scaleY,
    x: s.shiftX,
    y: s.shiftY,
    da: surface.a * s.dScaleX,
    db: surface.b * s.dScaleY,
    dx: s.dShiftX,
    dy: s.dShiftY,
  };
}

function query(p: Vec3, surface: AxialRestSurface) {
  axialRestInverse(p, surface.map); // valida el dominio de referencia, no un cubo físico de ±512 mm
  const s = axialSurfaceSection(p[2], surface);
  const x = p[0] - s.x;
  const y = p[1] - s.y;
  const rho = Math.hypot(x / s.a, y / s.b);
  checkChart(rho);
  return { s, x, y, r: Math.hypot(x, y), rho };
}

function checkChart(rho: number): void {
  // Solo el redondeo TS al restar el centro; no amplía el dominio geométrico.
  const roundoff =
    8 * Number.EPSILON * (1 + AXIAL_REST_NUMERICS.maxShiftMm / (AXIAL_SURFACE_NUMERICS.minRadiusMm * AXIAL_REST_NUMERICS.minScale));
  if (rho < AXIAL_SURFACE_NUMERICS.minChartRho - roundoff) throw new Error('axialRestSurface: consulta fuera del chart regular');
}

function checkPhi(phi: number): void {
  if (!Number.isFinite(phi) || Math.abs(phi) > AXIAL_SURFACE_NUMERICS.maxAbsPhi)
    throw new Error('axialRestSurface: ángulo fuera del dominio float32');
}

/** Profundidad radial física en mm, solo en el chart regular; NO distancia euclídea ni d(F⁻¹(p)). */
export function axialSurfaceDepth(p: Vec3, surface: AxialRestSurface): number {
  const q = query(p, surface);
  return q.r - q.r / q.rho;
}

/** ∇d en el reposo físico: incluye escala y desplazamiento axiales, sin normalizar. */
export function axialSurfaceDepthGradient(p: Vec3, surface: AxialRestSurface): Vec3 {
  const { s, x, y, r, rho } = query(p, surface);
  const k = 1 - 1 / rho;
  const c = r / (rho * rho * rho);
  const gx = (x / r) * k + (c * x) / (s.a * s.a);
  const gy = (y / r) * k + (c * y) / (s.b * s.b);
  return [gx, gy, -s.dx * gx - s.dy * gy - c * ((x * x * s.da) / s.a ** 3 + (y * y * s.db) / s.b ** 3)];
}

/** Etiqueta angular de referencia, en radianes; no longitud ni distancia física sobre la piel. */
export function axialSurfacePhi(p: Vec3, surface: AxialRestSurface): number {
  const { s, x, y } = query(p, surface);
  return Math.atan2(y / s.b, x / s.a);
}

/** ∇φ físico, local a una rama del ángulo; el chart tiene una costura en ±π. */
export function axialSurfacePhiGradient(p: Vec3, surface: AxialRestSurface): Vec3 {
  const { s, x, y, rho } = query(p, surface);
  const u = x / s.a;
  const v = y / s.b;
  const gx = -v / (s.a * rho * rho);
  const gy = u / (s.b * rho * rho);
  return [gx, gy, -s.dx * gx - s.dy * gy + (u * v * (s.da / s.a - s.db / s.b)) / (rho * rho)];
}

export function axialSurfaceSkinPoint(phi: number, z: number, surface: AxialRestSurface): Vec3 {
  checkPhi(phi);
  const s = axialSurfaceSection(z, surface);
  return [s.x + s.a * Math.cos(phi), s.y + s.b * Math.sin(phi), z];
}

/** Derivadas físicas ∂p/∂φ (mm/rad) y ∂p/∂z (mm/mm), no vectores unitarios. */
export function axialSurfaceSkinTangents(phi: number, z: number, surface: AxialRestSurface): { phi: Vec3; z: Vec3 } {
  checkPhi(phi);
  const s = axialSurfaceSection(z, surface);
  return { phi: [-s.a * Math.sin(phi), s.b * Math.cos(phi), 0], z: [s.dx + s.da * Math.cos(phi), s.dy + s.db * Math.sin(phi), 1] };
}

/** Incluye el contrato axial; el llamador debe garantizar el mismo dominio TS antes del despacho GLSL. */
export const AXIAL_REST_SURFACE_GLSL =
  AXIAL_REST_MAP_GLSL +
  /* glsl */ `
struct AxialRestSurface { vec2 radius; AxialRestMap map; };
struct AxialSurfaceSection { vec2 radius; vec2 center; vec2 dRadius; vec2 dCenter; };
AxialSurfaceSection axialSurfaceSection(float z, AxialRestSurface surface) {
  AxialRestSection s = axialRestSection(z, surface.map);
  return AxialSurfaceSection(surface.radius * s.scale, s.shift, surface.radius * s.dScale, s.dShift);
}
float axialSurfaceDepth(vec3 p, AxialRestSurface surface) {
  AxialSurfaceSection s = axialSurfaceSection(p.z, surface);
  vec2 xy = p.xy - s.center;
  float rho = length(xy / s.radius);
  float r = length(xy);
  return r - r / rho;
}
vec3 axialSurfaceDepthGradient(vec3 p, AxialRestSurface surface) {
  AxialSurfaceSection s = axialSurfaceSection(p.z, surface);
  vec2 xy = p.xy - s.center;
  float r = length(xy);
  float rho = length(xy / s.radius);
  float c = r / (rho * rho * rho);
  vec2 g = xy / r * (1.0 - 1.0 / rho) + c * xy / (s.radius * s.radius);
  return vec3(g, -dot(s.dCenter, g) - c * dot(xy * xy * s.dRadius, 1.0 / (s.radius * s.radius * s.radius)));
}
float axialSurfacePhi(vec3 p, AxialRestSurface surface) {
  AxialSurfaceSection s = axialSurfaceSection(p.z, surface);
  vec2 uv = (p.xy - s.center) / s.radius;
  return atan(uv.y, uv.x);
}
vec3 axialSurfacePhiGradient(vec3 p, AxialRestSurface surface) {
  AxialSurfaceSection s = axialSurfaceSection(p.z, surface);
  vec2 uv = (p.xy - s.center) / s.radius;
  float rho2 = dot(uv, uv);
  vec2 g = vec2(-uv.y, uv.x) / (s.radius * rho2);
  vec2 d = s.dRadius / s.radius;
  return vec3(g, -dot(s.dCenter, g) + uv.x * uv.y * (d.x - d.y) / rho2);
}
// cos/sin de |phi|<=pi: reducción por simetría y Taylor de grados 12/13 en [0,pi/2].
// Restos exactos <=6.4e-9/6.7e-10, antes del redondeo float32. Evita depender de la precisión
// no uniforme del cos nativo (SwiftShader desviaba la piel 0.016 mm en el rango moderado).
vec2 axialSurfaceCosSin(float phi) {
  float x = abs(phi);
  float cSign = 1.0;
  if (x > 1.5707963267948966) { x = 3.141592653589793 - x; cSign = -1.0; }
  float q = x * x;
  float c = 1.0 + q * (-0.5 + q * (1.0/24.0 + q * (-1.0/720.0 + q * (1.0/40320.0 + q * (-1.0/3628800.0 + q/479001600.0)))));
  float s = x * (1.0 + q * (-1.0/6.0 + q * (1.0/120.0 + q * (-1.0/5040.0 + q * (1.0/362880.0 + q * (-1.0/39916800.0 + q/6227020800.0))))));
  return vec2(cSign * c, phi < 0.0 ? -s : s);
}
vec3 axialSurfaceSkinPoint(float phi, float z, AxialRestSurface surface) {
  AxialSurfaceSection s = axialSurfaceSection(z, surface);
  return vec3(s.center + s.radius * axialSurfaceCosSin(phi), z);
}
vec3 axialSurfaceSkinPhiTangent(float phi, float z, AxialRestSurface surface) {
  AxialSurfaceSection s = axialSurfaceSection(z, surface);
  vec2 cs = axialSurfaceCosSin(phi);
  return vec3(s.radius * vec2(-cs.y, cs.x), 0.0);
}
vec3 axialSurfaceSkinZTangent(float phi, float z, AxialRestSurface surface) {
  AxialSurfaceSection s = axialSurfaceSection(z, surface);
  return vec3(s.dCenter + s.dRadius * axialSurfaceCosSin(phi), 1.0);
}
`;
