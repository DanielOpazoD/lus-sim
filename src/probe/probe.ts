import { defineParameters } from '../core/evidence';
import { clamp, cross, dot, normalize, rotateAxis, scale, smoothstep, sub, type Vec3 } from '../core/vec3';
import type { Torso } from '../anatomy/primitives';
import { torsoNormal, torsoSkinPoint } from '../anatomy/primitives';

/**
 * Sonda virtual (guía §8): objeto rígido con seis grados de libertad apoyado
 * sobre la piel del tronco. La pose se describe con coordenadas de superficie
 * (φ alrededor del tronco, z craneocaudal), separación de la piel (lift) y
 * tres rotaciones respecto al marco local de la piel:
 *   yaw   — rotación alrededor de la normal cutánea (marcador craneal → axila);
 *   rock  — basculación dentro del plano de imagen (talón-punta);
 *   tilt  — inclinación fuera del plano (abanicar).
 * Cualquier dispositivo de entrada (ratón, táctil, IMU, seguimiento) produce
 * esta misma pose (base F.5).
 */
export interface ProbePose {
  phi: number;
  z: number;
  /** Separación de la piel en mm (0 = contacto; <0 = presión). */
  lift: number;
  yaw: number;
  rock: number;
  tilt: number;
}

export type TransducerType = 'convex' | 'phased';

export interface Transducer {
  type: TransducerType;
  /** Radio de curvatura de la superficie (mm); ∞ ≈ lineal. */
  curvatureRadius: number;
  /** Ancho de la huella a lo largo del plano (mm). */
  footprintMm: number;
  /** Espesor elevacional de la huella (mm). */
  elevationMm: number;
  /** Semiángulo del sector (rad). */
  halfSector: number;
  /** Número de líneas. */
  lines: number;
  /** Frecuencia central B (Hz) y Doppler (Hz). */
  f0B: number;
  f0Doppler: number;
  /** Profundidad del foco elevacional fijo de la lente (mm). */
  elevationFocusMm: number;
}

export const CONVEX_C35: Transducer = {
  type: 'convex',
  curvatureRadius: 60,
  footprintMm: 62,
  elevationMm: 13,
  halfSector: (34 * Math.PI) / 180,
  lines: 192,
  f0B: 3.5e6,
  f0Doppler: 2.5e6,
  elevationFocusMm: 80,
};

/** Marco ortonormal de la sonda en coordenadas del paciente (mm). */
export interface ProbeFrame {
  /** Centro de la superficie de contacto. */
  face: Vec3;
  /** Eje axial (hacia dentro del paciente). */
  axial: Vec3;
  /** Eje lateral en el plano de imagen (hacia el marcador). */
  lateral: Vec3;
  /** Normal al plano de imagen. */
  elevation: Vec3;
  /** Centro de curvatura (origen de las líneas radiales). */
  curvatureCenter: Vec3;
  /** Normal exterior de la piel bajo la sonda. */
  skinNormal: Vec3;
  /** Punto de la piel. */
  skinPoint: Vec3;
}

export function probeFrame(pose: ProbePose, torso: Torso, tr: Transducer): ProbeFrame {
  const skinPoint = torsoSkinPoint(pose.phi, pose.z, torso);
  const n = torsoNormal(skinPoint, torso);
  let axial = scale(n, -1);
  // lateral inicial: proyección de +z (craneal) sobre el plano tangente
  let lateral = normalize(sub([0, 0, 1], scale(n, dot([0, 0, 1], n))));
  let elevation = cross(axial, lateral);
  // yaw alrededor de la normal
  lateral = rotateAxis(lateral, n, pose.yaw);
  elevation = rotateAxis(elevation, n, pose.yaw);
  // rock alrededor del eje de elevación (dentro del plano)
  axial = rotateAxis(axial, elevation, pose.rock);
  lateral = rotateAxis(lateral, elevation, pose.rock);
  // tilt alrededor del eje lateral (fuera del plano)
  axial = rotateAxis(axial, lateral, pose.tilt);
  elevation = rotateAxis(elevation, lateral, pose.tilt);
  const face: Vec3 = [skinPoint[0] + n[0] * pose.lift, skinPoint[1] + n[1] * pose.lift, skinPoint[2] + n[2] * pose.lift];
  const curvatureCenter: Vec3 = [
    face[0] - axial[0] * tr.curvatureRadius,
    face[1] - axial[1] * tr.curvatureRadius,
    face[2] - axial[2] * tr.curvatureRadius,
  ];
  return { face, axial, lateral, elevation, curvatureCenter, skinNormal: n, skinPoint };
}

/** Ángulo de la línea i (rad) respecto al eje axial. */
export function lineAngle(i: number, tr: Transducer): number {
  const u = tr.lines > 1 ? i / (tr.lines - 1) : 0.5;
  return -tr.halfSector + 2 * tr.halfSector * u;
}

/** Dirección unitaria de la línea con ángulo θ. */
export function lineDirection(frame: ProbeFrame, theta: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return normalize([
    frame.axial[0] * c + frame.lateral[0] * s,
    frame.axial[1] * c + frame.lateral[1] * s,
    frame.axial[2] * c + frame.lateral[2] * s,
  ]);
}

/** Punto del mundo a distancia r (mm) de la cara a lo largo de la línea θ. */
export function pointOnLine(frame: ProbeFrame, tr: Transducer, theta: number, r: number): Vec3 {
  const d = lineDirection(frame, theta);
  const R = tr.curvatureRadius + r;
  return [frame.curvatureCenter[0] + d[0] * R, frame.curvatureCenter[1] + d[1] * R, frame.curvatureCenter[2] + d[2] * R];
}

/**
 * Punto del mundo a distancia s (mm) del elemento φ a lo largo de la línea dirigida θ (composición
 * espacial, decisión 58): sale de la cara en el elemento φ con dirección φ + θ. Con θ = 0 es la línea
 * radial (`pointOnLine` con r = s).
 */
export function pointOnSteeredLine(frame: ProbeFrame, tr: Transducer, phi: number, th: number, s: number): Vec3 {
  if (th === 0) return pointOnLine(frame, tr, phi, s);
  const e = lineDirection(frame, phi);
  const d = lineDirection(frame, phi + th);
  const R = tr.curvatureRadius;
  const c = frame.curvatureCenter;
  return [c[0] + e[0] * R + d[0] * s, c[1] + e[1] * R + d[1] * s, c[2] + e[2] * R + d[2] * s];
}

/**
 * Blandura de la pared bajo la sonda (0–1): fracción del hueco por basculación e
 * inclinación que la pared absorbe al hundirse. Epigastrio y abdomen anterior sin
 * costillas (bajo el xifoides) ≈ 0,65: la sonda se «entierra» y se bascula hacia la
 * cabeza sin perder contacto; flanco bajo el reborde ≈ 0,35; sobre las costillas ≈ 0,15. La usa el criterio
 * de contacto (`probe/contact.ts`, decisión 63): cuánto hueco cierra la presión del examen.
 */
export function skinSoftness(pose: ProbePose): number {
  const anterior = smoothstep(0.2 * Math.PI, 0.3 * Math.PI, pose.phi) * (1 - smoothstep(0.7 * Math.PI, 0.8 * Math.PI, pose.phi));
  const belowXiphoid = 1 - smoothstep(-5, 15, pose.z);
  const belowMargin = 1 - smoothstep(-70, -40, pose.z);
  return 0.15 + 0.5 * anterior * belowXiphoid + 0.2 * (1 - anterior) * belowMargin;
}

/** Vector de velocidad de la sonda estimado a partir de dos poses (mm/s). */
export function probeVelocity(prev: ProbeFrame, next: ProbeFrame, dtSeconds: number): Vec3 {
  if (dtSeconds <= 0) return [0, 0, 0];
  return scale(sub(next.face, prev.face), 1 / dtSeconds);
}

/**
 * Posición del paciente (lus-sim, decisión 29): decide hasta dónde llega la sonda. En decúbito supino, la cama deja la espalda
 * fuera de su alcance; sentado (la exploración de la cara posterior de la clínica), la sonda da toda la vuelta al tronco. La
 * misma unión que `PatientState.position` (la capa de la sonda no lee la fisiología).
 */
export type PatientPosition = 'supine' | 'sitting';
export const PATIENT_POSITIONS: readonly PatientPosition[] = ['supine', 'sitting'];

/** φ llevado a [−π/2, 3π/2): la línea media posterior es el corte (sentado, la sonda la cruza dando la vuelta). */
function wrapPhi(phi: number): number {
  const turn = 2 * Math.PI;
  // idempotente dentro de la vuelta (decisión 33): sin la deriva de un ulp por cuadro que deja el módulo
  if (phi >= -Math.PI / 2 && phi < 1.5 * Math.PI) return phi;
  return ((((phi + Math.PI / 2) % turn) + turn) % turn) - Math.PI / 2;
}

export function clampPose(p: ProbePose, position: PatientPosition = 'supine'): ProbePose {
  return {
    // De la línea axilar posterior izquierda a la derecha en decúbito supino (lus-sim, decisión 10): VExUS
    // llegaba a la derecha (1,2π, su ventana renal); la izquierda es su simétrica respecto de la línea media
    // anterior (π/2), para explorar los dos hemitórax. Sentado (decisión 29), toda la vuelta
    phi: position === 'sitting' ? wrapPhi(p.phi) : clamp(p.phi, -Math.PI * 0.2, Math.PI * 1.2),
    z: clamp(p.z, -200, 200),
    lift: clamp(p.lift, -6, 25),
    yaw: ((((p.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI,
    rock: clamp(p.rock, -0.7, 0.7),
    tilt: clamp(p.tilt, -0.7, 0.7),
  };
}

/**
 * Punto BLUE superior derecho aproximado (lus-sim, decisión 10): la pose por omisión. La regla de las manos
 * (centro de la mano superior) no tiene correspondencia medida con los espacios intercostales ni con las
 * líneas (docs/knowledge/anatomy.md §4, NO ENCONTRADO): se supone el EIC2 en la línea medioclavicular, el
 * sitio de la meta A-T1. Desde la decisión 16, sobre la parrilla del adulto promedio (`anatomy/organs/ribcage.ts`) y la
 * medioclavicular de `anatomy/thoraxLines.ts`. Números nuevos, así que con su evidencia (docs/APPROXIMATIONS.md).
 */
export const BLUE_UPPER_POSE = defineParameters('probe.blueUpperPose', {
  phi: {
    value: Math.PI - Math.acos(95 / 160),
    unit: 'rad',
    range: [0.65 * Math.PI, 0.8 * Math.PI],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'gray-anatomia-1918'],
    note:
      'Línea medioclavicular derecha (decisión 16, `anatomy.thoraxLines.midclavicularXMm`): 95 mm de la línea media en la ' +
      'piel del tronco de 160 mm de semiancho, φ = π − acos(95/160) = 0,702π. Que el punto BLUE caiga en ella es el ' +
      'supuesto; calibrar con la regla de las manos y la antropometría de la mano',
  },
  z: {
    value: 83.7,
    unit: 'mm',
    range: [53.7, 124.7],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'seong-espaciosic-2020'],
    note:
      'Centro del EIC2 en la línea medioclavicular con la parrilla del adulto promedio (decisión 16): la 2.ª costilla a 99,7 ' +
      'mm y la 3.ª a 67,7 (el EIC2 de 18 mm de la base). El rango va del centro del EIC3 (53,7) al del EIC1 (124,7): la ' +
      'regla de las manos no dice en qué espacio cae (anatomy.md §4)',
  },
});

/** Pose inicial: el punto BLUE superior derecho aproximado (`BLUE_UPPER_POSE`), marcador craneal (corte longitudinal). */
export function defaultPose(): ProbePose {
  // φ ≈ 0,70π → línea medioclavicular derecha (−x, +y); yaw 0: el marcador hacia la cabeza.
  return { phi: BLUE_UPPER_POSE.params.phi.value, z: BLUE_UPPER_POSE.params.z.value, lift: 0, yaw: 0, rock: 0, tilt: 0 };
}
