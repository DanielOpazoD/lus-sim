import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import type { Torso } from '../primitives';
import { ribTableZ, type RibCage } from './ribcage';
import { kidneyCutDistance, smoothMax, type LiverShape } from './liver';
import { wallArc } from './wall';

/**
 * El bazo bajo la cúpula izquierda (lus-sim, decisión 37; VExUS no lo tiene). Gray lo describe así: su eje largo sigue la
 * 10.ª costilla izquierda; en vertical queda entre el borde superior de la 9.ª y el inferior de la 11.ª; su punto más bajo, en la
 * línea axilar media («Surface Markings of the Abdomen»); su cara diafragmática, convexa, está contra el diafragma, que la separa
 * de las costillas 9.ª–11.ª y del borde inferior del pulmón y la pleura; mide unos 12 cm de largo, 7 de ancho y 3–4 de grueso
 * («The Spleen»).
 *
 * Modelo: medio elipsoide en las coordenadas de la pared (el arco `wallArc` de su columna pasado a mm a la cara interna de la
 * pared, la altura z y la profundidad bajo esa cara, `inside`), centrado en la cara interna: su cara diafragmática es la de la
 * pared (la sigue, como la del órgano, convexa con ella) y la visceral, la mitad de dentro del elipsoide. El eje largo, el de la
 * 10.ª costilla en su centro, con su punto más bajo en la axilar media; el ancho, a lo largo de la pared y a través de las costillas
 * (los 7 cm caben de la 9.ª a la 11.ª); el grosor, el semieje hacia dentro, en el centro. La clasificación lo mira tras la cúpula, la ZOA y el hígado: arriba lo tapa el pulmón del receso, y por detrás lo
 * recorta el espacio del riñón izquierdo (`kidneyCutDistance`, el paralelogramo de Morris). La distancia de las coordenadas de la
 * pared no es euclídea lejos de su centro (≤ unos %: la escala del arco se toma en él).
 *
 * TS y GLSL (uniforms `uSpleen*` del esquema único) viven aquí juntos.
 */
export const SPLEEN = defineParameters('anatomy.spleen', {
  lengthMm: {
    value: 120,
    unit: 'mm',
    range: [100, 140],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918', 'chow-bazo-2016'],
    note:
      'Gray («The Spleen»): «In the adult it is usually about 12 cm. in length, 7 cm. in breadth, and 3 or 4 cm. in thickness». ' +
      'Chow y cols. (ecografía, 1230 adultos sanos): el largo crece con la talla y es mayor en el varón; pasa de 12 cm en el 26 % ' +
      'de los varones y el 6 % de las mujeres (resumen): el rango llega a 14',
  },
  breadthMm: {
    value: 70,
    unit: 'mm',
    range: [60, 80],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: 7 cm de ancho; la banda de la 9.ª a la 11.ª costilla en la que lo pone Gray mide ≈ 7 cm en la LAP del avatar',
  },
  thicknessMm: {
    value: 35,
    unit: 'mm',
    range: [30, 40],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: 3 o 4 cm de grueso',
  },
  capsuleMm: {
    value: 0.8,
    unit: 'mm',
    range: [0.5, 1.5],
    evidence: 'estimado',
    sources: [],
    note:
      'La cápsula del bazo, la lámina de su cara que dibuja la pasada B: la misma que la hepática de VExUS (`LIVER_CAPSULE_MM`) ' +
      '[SUPUESTO]; su grosor en el adulto, NO ENCONTRADO',
  },
  axisRib: {
    value: 10,
    unit: 'costilla',
    range: [10, 10],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: «the tenth rib is taken as representing its long axis»',
  },
});

/** El bazo de la escena (sube a la GPU en `uSpleen*`). */
export interface SpleenShape {
  /** Centro: arco de la pared (u > 0, a la izquierda) y z. */
  readonly u0: number;
  readonly z0: number;
  /** Coseno y seno del eje largo en el plano (arco en mm, z): la pendiente de la 10.ª costilla en el centro. */
  readonly cos: number;
  readonly sin: number;
  /** mm por unidad de arco en la cara interna de la pared (el centro del medio elipsoide está en el diafragma). */
  readonly arcScale: number;
  /** Semiejes: largo, ancho y el grueso entero (hacia dentro). */
  readonly radii: Vec3;
  /**
   * Profundidad máxima bajo la piel (mm): la de la rampa de la cúpula junto a la pared (`rimFarMm`) más el grueso. Las
   * coordenadas de la pared siguen la dirección radial del tronco: sin esta cota, el medio elipsoide seguiría bajo la cúpula hasta
   * el centro del tronco.
   */
  readonly maxSkinDepth: number;
}

/** Punto a la profundidad `d` (mm bajo la piel, por la dirección radial del tronco) bajo el punto de la piel del arco u y la altura z. */
function pointAtArc(u: number, z: number, d: number, t: Torso): Vec3 {
  let lo = -Math.PI;
  let hi = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < u) lo = mid;
    else hi = mid;
  }
  const tau = 0.5 * (lo + hi);
  const sx = t.a * Math.sin(tau);
  const sy = t.b * Math.cos(tau);
  const r = Math.hypot(sx, sy);
  const k = 1 - d / r;
  return [sx * k, sy * k, z];
}

/**
 * Construye el bazo: la pendiente de la 10.ª costilla izquierda en su centro, su punto más bajo en la línea axilar media
 * (`midaxillaryU`, el arco de la LAM) y la cara diafragmática en la cara interna de la pared (`wallMm`, el grosor de la pared en
 * la columna del centro).
 */
export function buildSpleen(
  t: Torso,
  cage: RibCage,
  midaxillaryU: number,
  wallMm: (u: number, z: number) => number,
  rimFarMm: number,
): SpleenShape {
  const P = SPLEEN.params;
  const k = cage.ribs.findIndex((r) => r.number === P.axisRib.value && r.side === 1);
  const zRib = (u: number) => ribTableZ(cage, k, u);
  const L = P.lengthMm.value;
  const T = P.thicknessMm.value;
  let u0 = midaxillaryU + 0.5 * L;
  let shape: SpleenShape | null = null;
  // el centro se busca a lo largo de la costilla: el punto más bajo (Gray) cae en la LAM
  for (let it = 0; it < 8; it++) {
    const z0 = zRib(u0);
    const depth = wallMm(u0, z0);
    const a = pointAtArc(u0 - 1, z0, depth, t);
    const b = pointAtArc(u0 + 1, z0, depth, t);
    const arcScale = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
    const dz = (zRib(u0 + 2) - zRib(u0 - 2)) / 4;
    const len = Math.hypot(arcScale, dz);
    const cos = arcScale / len;
    const sin = dz / len;
    shape = { u0, z0, cos, sin, arcScale, radii: [0.5 * L, 0.5 * P.breadthMm.value, T], maxSkinDepth: rimFarMm + T };
    // el punto más bajo de la elipse de la pared (semiejes A a lo largo del eje y B de ancho, inclinada con la costilla) está a
    // s = −sen·cos·(A² − B²)/√(A²·sen² + B²·cos²) mm de arco del centro; en unidades de arco, ÷ arcScale
    const A = 0.5 * L;
    const B = 0.5 * P.breadthMm.value;
    const sLow = (-sin * cos * (A * A - B * B)) / Math.sqrt(A * A * sin * sin + B * B * cos * cos);
    u0 = midaxillaryU - sLow / arcScale;
  }
  return shape!;
}

/** Coordenadas locales del bazo (largo, ancho, grueso; mm) en (u, z, inside) de la pared (gemelo GLSL con el mismo nombre). */
export function spleenLocal(u: number, z: number, inside: number, s: SpleenShape): Vec3 {
  const a = (u - s.u0) * s.arcScale;
  const b = z - s.z0;
  return [a * s.cos + b * s.sin, -a * s.sin + b * s.cos, inside];
}

/**
 * Distancia con signo al bazo, negativa dentro, sin la cúpula ni la pared (las pone la clasificación) y con el espacio del riñón
 * izquierdo recortado (gemelo GLSL con el mismo nombre). `u`: el arco de la columna del punto; `below`: su profundidad bajo el
 * diafragma (la cara abdominal de la cúpula, o la de la ZOA o la pared), así la cara diafragmática del bazo sigue al diafragma;
 * `skinDepth`: su profundidad bajo la piel (`maxSkinDepth`).
 */
export function spleenSdf(m: Vec3, u: number, below: number, skinDepth: number, s: SpleenShape, liver: LiverShape): number {
  const q = spleenLocal(u, m[2], below, s);
  const r = s.radii;
  const kx = q[0] / r[0];
  const ky = q[1] / r[1];
  const kz = q[2] / r[2];
  const k1 = Math.hypot(kx, ky, kz);
  const k2 = Math.hypot(kx / r[0], ky / r[1], kz / r[2]);
  const d = k2 > 0 ? (k1 * (k1 - 1)) / k2 : -Math.min(r[0], r[1], r[2]);
  return Math.max(smoothMax(d, -kidneyCutDistance(m, liver), SPLEEN_KIDNEY_ROUND_MM), skinDepth - s.maxSkinDepth);
}

/** Redondeo del recorte del riñón en el bazo (mm, el del hígado). */
export const SPLEEN_KIDNEY_ROUND_MM = 8;

/**
 * Gemelo GLSL. Uniforms: `uSpleen` (u0, z0, cos, sen) y `uSpleenR` (semiejes, escala del arco); `maxSkinDepth` es `uCurtain.z`
 * (la cota de la rampa de la cúpula, `rimFarMm`) más el grueso.
 */
export const SPLEEN_GLSL = /* glsl */ `
vec3 spleenLocal(float u, float z, float inside) {
  float a = (u - uSpleen.x) * uSpleenR.w;
  float b = z - uSpleen.y;
  return vec3(a * uSpleen.z + b * uSpleen.w, -a * uSpleen.w + b * uSpleen.z, inside);
}
float spleenSdf(vec3 m, float u, float below, float skinDepth) {
  vec3 q = spleenLocal(u, m.z, below);
  vec3 r = uSpleenR.xyz;
  vec3 k = q / r;
  float k1 = length(k);
  float k2 = length(k / r);
  float d = k2 > 0.0 ? k1 * (k1 - 1.0) / k2 : -min(r.x, min(r.y, r.z));
  return max(smoothMax(d, -kidneyCutDistance(m), ${SPLEEN_KIDNEY_ROUND_MM.toFixed(1)}), skinDepth - (uCurtain.z + uSpleenR.z));
}
`;
