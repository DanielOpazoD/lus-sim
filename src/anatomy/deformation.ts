import type { Vec3 } from '../core/vec3';
import { DIAPHRAGM_EXCURSION, type RespiratorySample } from '../physiology/respiratory';
import { compressionElevation, compressionSample, uncompress, type ProbeCompression } from './compression';
import type { AnatomyScene } from './scene';

/**
 * Deformación respiratoria (guía §15; base B.4): un único campo de
 * desplazamiento material→mundo compartido por órganos, vasos, dispersores y
 * volumen de muestra. No es una traslación rígida de la escena: el peso
 * espacial anula el movimiento en pared, costillas y columna, y lo aplica
 * íntegro a diafragma, hígado, cava y vasos.
 *
 *   p_mundo = m + D(t)·w(m)·dir
 *
 * lus-sim (decisión 22): dir = (0, 0, −1), caudal (en VExUS, (0, 0,15, −1) normalizada: caudal y algo anterior), y en el
 * peso, la ley de altura del pulmón (`AnatomyScene.respiratoryHeight`) y la pared que mira el campo (`respiratoryWallOf`,
 * que no engruesa hacia abajo más de `anatomy.respiratoryWall.slopeMax`). El mapa es un difeomorfismo por construcción: a lo
 * largo de cada vertical es z ↦ z − D·w(x, y, z), creciente mientras D·∂w/∂z < 1; el término de la pared queda ≤ 0,006·D y
 * el del corazón, pequeño por la ley de altura: el jacobiano, 1 − D·∂w/∂z, queda ≥ 0,57 con la excursión profunda de la base
 * (53 mm) y ≥ 0,39 con el máximo de su rango (75), en todas las variantes del tórax y con cualquier grasa del abdomen
 * (`respiratoryField.test.ts`). En VExUS, con la dirección anterior y sin la ley de altura, se plegaba con 53 mm sobre el
 * corazón (que no respira) y bajo el reborde costal anterior (≈ 350 cm³ con el jacobiano negativo).
 *
 * La inversa (mundo → material) es exacta a `RESPIRATORY_INVERSE.toleranceMm` en el punto material: en la vertical del punto, la raíz de
 * z − D·w(z) = q_z, que está en [q_z, q_z + D] (0 ≤ w ≤ 1), por bisección con un número fijo de pasos (el mismo en la GLSL).
 * VExUS la aproxima con dos pasos de punto fijo, m = q − d(m), que no convergen donde el peso cambia deprisa (con los 30 mm
 * de VExUS erraban > 1 mm en el 9,6 % de las muestras a menos de 8 cm de la piel, hasta 15 mm: `respiratory-inverse-fixed-point`).
 *
 * Encima, la compresión de la sonda (decisión 63, `compression.ts`): la sonda aprieta el tejido que la
 * respiración ha llevado bajo ella, así que mundo → material deshace primero la compresión y después la
 * respiración (el mismo orden que `toMaterial` en la GLSL). `compression` es el estado del contacto del cuadro
 * (null: sin sonda, el tronco rígido); lo pone el simulador con cada pose.
 */
const DIR: Vec3 = [0, 0, -1];

/**
 * La inversa del campo respiratorio (lus-sim, decisión 22): bisección en z con `steps` pasos. El intervalo inicial mide D (la
 * excursión del instante), así que tras los pasos el punto medio queda a ≤ D/2^(steps + 1) de la raíz: con la excursión
 * profunda (53 mm), ≤ 0,026 mm, bajo la tolerancia declarada. Una bisección y no Newton: el error queda acotado con un número
 * fijo de pasos sin derivadas del peso (sus rampas son C¹ a trozos: la ley de altura tiene esquinas) y, con el campo
 * vertical, cada paso solo relee la tabla de la pared en la columna del punto y el corazón (lo demás no depende de z).
 */
export const RESPIRATORY_INVERSE = Object.freeze({ steps: 10, toleranceMm: 0.05 });
if (DIAPHRAGM_EXCURSION.params.deepMm.range![1] / 2 ** (RESPIRATORY_INVERSE.steps + 1) > RESPIRATORY_INVERSE.toleranceMm)
  throw new Error('la bisección del campo respiratorio no alcanza su tolerancia con la mayor excursión');

export class RespiratoryDeformation {
  /** Contacto de la sonda del cuadro (decisión 63); null sin compresión. */
  compression: ProbeCompression | null = null;

  constructor(private readonly scene: AnatomyScene) {}

  /** Desplazamiento (mm) en un punto material para la muestra respiratoria. */
  displacement(m: Vec3, resp: RespiratorySample): Vec3 {
    const a = resp.diaphragmCaudalMm * this.scene.respiratoryWeight(m);
    return [DIR[0] * a, DIR[1] * a, DIR[2] * a];
  }

  toWorld(m: Vec3, resp: RespiratorySample): Vec3 {
    const d = this.displacement(m, resp);
    return recompress([m[0] + d[0], m[1] + d[1], m[2] + d[2]], this.compression);
  }

  toMaterial(p: Vec3, resp: RespiratorySample): Vec3 {
    // la compresión de la sonda y después la respiración (decisión 22: la bisección en la vertical, gemelo GLSL `toMaterial`)
    return respiratoryInverse(this.scene, uncompress(p, this.compression), resp.diaphragmCaudalMm);
  }

  /** Velocidad del tejido (mm/s) en un punto material. */
  tissueVelocity(m: Vec3, resp: RespiratorySample): Vec3 {
    const a = resp.diaphragmVelocityMmS * this.scene.respiratoryWeight(m);
    return [DIR[0] * a, DIR[1] * a, DIR[2] * a];
  }

  static get direction(): Vec3 {
    return DIR;
  }
}

/**
 * El punto material m del punto q (sin la compresión de la sonda) con el diafragma bajado `caudalMm` (lus-sim, decisión 22;
 * gemelo GLSL `toMaterial`): m = (q_x, q_y, z) con z − D·w(q_x, q_y, z) = q_z. Sin peso en q (la pared, la columna, el corazón
 * o el pulmón alto) es q; con el peso entero en q + D (las vísceras bajo la cúpula), q + D; si no, la bisección.
 */
export function respiratoryInverse(scene: AnatomyScene, q: Vec3, caudalMm: number): Vec3 {
  const D = caudalMm;
  if (!(D > 0)) return q;
  const c = scene.respiratoryColumn(q[0], q[1]);
  if (scene.respiratoryWeightAt(c, q[2]) === 0) return q;
  let lo = q[2];
  let hi = q[2] + D;
  if (scene.respiratoryWeightAt(c, hi) === 1) return [q[0], q[1], hi];
  for (let i = 0; i < RESPIRATORY_INVERSE.steps; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid - D * scene.respiratoryWeightAt(c, mid) < q[2]) lo = mid;
    else hi = mid;
  }
  return [q[0], q[1], 0.5 * (lo + hi)];
}

/**
 * Inversa de `uncompress` (solo TS: `toWorld`): el punto del mundo p con p + s(p)·r̂ = q. El mapa es radial en el
 * plano de la cara y monótono a lo largo de cada línea (ρ + s crece con ρ), así que basta una bisección en ρ.
 */
function recompress(q: Vec3, k: ProbeCompression | null): Vec3 {
  if (!k) return q;
  const el = compressionElevation(k);
  const e = (q[0] - k.center[0]) * el[0] + (q[1] - k.center[1]) * el[1] + (q[2] - k.center[2]) * el[2];
  const P: Vec3 = [q[0] - k.center[0] - e * el[0], q[1] - k.center[1] - e * el[1], q[2] - k.center[2] - e * el[2]];
  const rhoQ = Math.hypot(P[0], P[1], P[2]);
  if (rhoQ < 1e-6) return q;
  const at = (rho: number): Vec3 => {
    const f = rho / rhoQ;
    return [k.center[0] + P[0] * f + e * el[0], k.center[1] + P[1] * f + e * el[1], k.center[2] + P[2] * f + e * el[2]];
  };
  const mapped = (rho: number): number => rho + compressionSample(at(rho), k).shift;
  let lo = Math.max(1e-3, rhoQ - 200);
  let hi = rhoQ + 200;
  if (mapped(lo) > rhoQ || mapped(hi) < rhoQ) return q;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (mapped(mid) < rhoQ) lo = mid;
    else hi = mid;
  }
  return at(0.5 * (lo + hi));
}
