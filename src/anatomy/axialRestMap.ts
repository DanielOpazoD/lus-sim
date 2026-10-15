import type { Vec3 } from '../core/vec3';

/**
 * Contrato geométrico de reposo, no un nuevo paciente (decisión 56). F conserva z y transforma cada
 * sección XY mediante escala positiva y traslación. Es identidad bajo zStart; sobre zEnd es afín.
 * El tramo intermedio es C¹. Las coordenadas de entrada son materiales; las de salida, físicas.
 * No se activa todavía en la escena: faltan contacto, composición y dimensiones anatómicas finales.
 */
export interface AxialRestMap {
  readonly zStart: number;
  readonly zEnd: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly shiftX: number;
  readonly shiftY: number;
}

export interface AxialRestSection {
  scaleX: number;
  scaleY: number;
  shiftX: number;
  shiftY: number;
  dScaleX: number;
  dScaleY: number;
  dShiftX: number;
  dShiftY: number;
}

/** Se valida también la representación float32 que recibirá GLSL; no admite secciones degeneradas. */
export function createAxialRestMap(input: AxialRestMap): Readonly<AxialRestMap> {
  const { zStart, zEnd, scaleX, scaleY, shiftX, shiftY } = input;
  const values = [zStart, zEnd, scaleX, scaleY, shiftX, shiftY];
  const span = Math.fround(zEnd) - Math.fround(zStart);
  if (
    !values.every((v) => Number.isFinite(v) && Number.isFinite(Math.fround(v))) ||
    !(span > 0) ||
    !Number.isFinite(Math.fround(span)) ||
    !Number.isFinite(Math.fround(1.5 / span)) ||
    !(scaleX > 0 && scaleY > 0) ||
    ![scaleX, scaleY].every((s) => Number.isFinite(Math.fround(1 / Math.fround(s))))
  )
    throw new Error('axialRestMap: intervalo o escalas no invertibles en float32');
  return Object.freeze({ zStart, zEnd, scaleX, scaleY, shiftX, shiftY });
}

export function axialRestSection(z: number, map: AxialRestMap): AxialRestSection {
  const u = Math.max(0, Math.min(1, (z - map.zStart) / (map.zEnd - map.zStart)));
  const h = Math.max(0, Math.min(1, u * u * (3 - 2 * u)));
  const dh = (6 * u * (1 - u)) / (map.zEnd - map.zStart);
  return {
    scaleX: 1 - h + map.scaleX * h,
    scaleY: 1 - h + map.scaleY * h,
    shiftX: map.shiftX * h,
    shiftY: map.shiftY * h,
    dScaleX: (map.scaleX - 1) * dh,
    dScaleY: (map.scaleY - 1) * dh,
    dShiftX: map.shiftX * dh,
    dShiftY: map.shiftY * dh,
  };
}

export function axialRestForward(m: Vec3, map: AxialRestMap): Vec3 {
  const s = axialRestSection(m[2], map);
  return [s.scaleX * m[0] + s.shiftX, s.scaleY * m[1] + s.shiftY, m[2]];
}

export function axialRestInverse(p: Vec3, map: AxialRestMap): Vec3 {
  const s = axialRestSection(p[2], map);
  return [(p[0] - s.shiftX) / s.scaleX, (p[1] - s.shiftY) / s.scaleY, p[2]];
}

/** J·v: transporta una tangente material sin normalizarla. */
export function axialRestTangent(m: Vec3, v: Vec3, map: AxialRestMap): Vec3 {
  const s = axialRestSection(m[2], map);
  return [s.scaleX * v[0] + (s.dScaleX * m[0] + s.dShiftX) * v[2], s.scaleY * v[1] + (s.dScaleY * m[1] + s.dShiftY) * v[2], v[2]];
}

/** J⁻ᵀ·g: gradiente físico de f(F⁻¹(p)); conserva su magnitud para distancias y ecos. */
export function axialRestGradient(m: Vec3, g: Vec3, map: AxialRestMap): Vec3 {
  const s = axialRestSection(m[2], map);
  const x = g[0] / s.scaleX;
  const y = g[1] / s.scaleY;
  return [x, y, g[2] - (s.dScaleX * m[0] + s.dShiftX) * x - (s.dScaleY * m[1] + s.dShiftY) * y];
}

/**
 * Cota de ||J⁻¹||₂ en |m.x|≤radiusX, |m.y|≤radiusY, para cualquier z. Usa
 * ||A||₂ ≤ √(||A||₁·||A||∞) y max h'=1,5/(zEnd−zStart). Es 1 para identidad.
 * Fuera de ese dominio no vale. No convierte f∘F⁻¹ en una distancia euclídea ni se puede usar sola
 * como cota del campo: falta multiplicar por la cota original y las de los demás mapas compuestos.
 */
export function axialRestInverseBound(map: AxialRestMap, radiusX: number, radiusY: number): number {
  if (![radiusX, radiusY].every((r) => Number.isFinite(r) && r >= 0)) throw new Error('axialRestMap: dominio inválido para la cota');
  const dx = 1 / Math.min(1, map.scaleX);
  const dy = 1 / Math.min(1, map.scaleY);
  const slope = 1.5 / (map.zEnd - map.zStart);
  const bx = (Math.abs(map.scaleX - 1) * radiusX + Math.abs(map.shiftX)) * slope * dx;
  const by = (Math.abs(map.scaleY - 1) * radiusY + Math.abs(map.shiftY)) * slope * dy;
  return Math.sqrt(Math.max(dx, dy, 1 + bx + by)) * Math.sqrt(Math.max(dx + bx, dy + by, 1));
}

/** Gemelos puros: el llamador proporciona el mismo mapa validado, sin uniforms o reloj propios. */
export const AXIAL_REST_MAP_GLSL = /* glsl */ `
struct AxialRestMap { vec2 z; vec2 scale; vec2 shift; };
struct AxialRestSection { vec2 scale; vec2 shift; vec2 dScale; vec2 dShift; };
AxialRestSection axialRestSection(float z, AxialRestMap map) {
  float u = clamp((z - map.z.x) / (map.z.y - map.z.x), 0., 1.);
  float h = clamp(u * u * (3. - 2. * u), 0., 1.);
  float dh = 6. * u * (1. - u) / (map.z.y - map.z.x);
  return AxialRestSection(vec2(1. - h) + map.scale * h, map.shift * h, (map.scale - 1.) * dh, map.shift * dh);
}
vec3 axialRestForward(vec3 m, AxialRestMap map) {
  AxialRestSection s = axialRestSection(m.z, map);
  return vec3(s.scale * m.xy + s.shift, m.z);
}
vec3 axialRestInverse(vec3 p, AxialRestMap map) {
  AxialRestSection s = axialRestSection(p.z, map);
  return vec3((p.xy - s.shift) / s.scale, p.z);
}
vec3 axialRestTangent(vec3 m, vec3 v, AxialRestMap map) {
  AxialRestSection s = axialRestSection(m.z, map);
  return vec3(s.scale * v.xy + (s.dScale * m.xy + s.dShift) * v.z, v.z);
}
vec3 axialRestGradient(vec3 m, vec3 g, AxialRestMap map) {
  AxialRestSection s = axialRestSection(m.z, map);
  vec2 xy = g.xy / s.scale;
  return vec3(xy, g.z - dot(s.dScale * m.xy + s.dShift, xy));
}
float axialRestInverseBound(AxialRestMap map, vec2 radius) {
  vec2 d = 1. / min(vec2(1.), map.scale);
  vec2 b = (abs(map.scale - 1.) * radius + abs(map.shift)) * (1.5 / (map.z.y - map.z.x)) * d;
  return sqrt(max(max(d.x, d.y), 1. + b.x + b.y)) * sqrt(max(max(d.x + b.x, d.y + b.y), 1.));
}
`;
