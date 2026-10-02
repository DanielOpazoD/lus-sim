import type { AnatomyScene } from '../../anatomy/scene';
import { ribMetric, ribTableZ } from '../../anatomy/organs/ribcage';
import { wallArc, wallPerimeter, wallTotalMm } from '../../anatomy/organs/wall';
import { torsoSkinPoint, type Torso } from '../../anatomy/primitives';
import { add, cross, normalize, scale, type Vec3 } from '../../core/vec3';
import {
  clampPose,
  defaultPose,
  pointOnLine,
  type PatientPosition,
  type ProbeFrame,
  type ProbePose,
  type Transducer,
} from '../../probe/probe';

/** Adaptador único: paciente (izquierda, anterior, craneal; mm) → visor (izquierda, arriba, frente; m).
 * El intercambio y/z invierte la orientación: el tercer eje de la sonda se reconstruye con cross.
 * Ninguna de estas coordenadas modifica la anatomía ni la adquisición.
 */
export const patientToView = (p: Vec3): Vec3 => [p[0] / 1000, p[2] / 1000, p[1] / 1000];
export const viewToPatient = (p: Vec3): Vec3 => [p[0] * 1000, p[2] * 1000, p[1] * 1000];

const minimum = clampPose({ ...defaultPose(), phi: -Infinity, z: -Infinity });
const maximum = clampPose({ ...defaultPose(), phi: Infinity, z: Infinity });
/** El alcance en supino (el de siempre); la altura es la misma sentado. */
export const SCAN_LIMITS = { phiMin: minimum.phi, phiMax: maximum.phi, zMin: minimum.z, zMax: maximum.z } as const;

/**
 * El arco de φ que alcanza la sonda con el paciente en `position` (lus-sim, decisión 33): en supino, de −0,2π a 1,2π; sentado,
 * toda la vuelta (la línea media posterior es el corte, −π/2 ≡ 3π/2).
 */
export function scanArc(position: PatientPosition): { phiMin: number; phiMax: number } {
  return position === 'sitting'
    ? { phiMin: -Math.PI / 2, phiMax: (3 * Math.PI) / 2 }
    : { phiMin: SCAN_LIMITS.phiMin, phiMax: SCAN_LIMITS.phiMax };
}

/** La inversa de atan2 debe desenvolver π: PLAPS derecho 1,15π vuelve como −0,85π.
 * Fuera del arco alcanzable en la posición del paciente se rechaza el punto; no se salta al borde contrario. Sentado
 * (decisión 33), toda la espalda.
 */
export function surfacePose(point: Vec3, torso: Torso, previous: ProbePose, position: PatientPosition = 'supine'): ProbePose | null {
  if (!point.every(Number.isFinite)) return null;
  const raw = Math.atan2(point[1] / torso.b, point[0] / torso.a);
  const arc = scanArc(position);
  const phi = [raw, raw + 2 * Math.PI, raw - 2 * Math.PI].find((p) => p >= arc.phiMin - 1e-9 && p <= arc.phiMax + 1e-9);
  if (phi === undefined || point[2] < SCAN_LIMITS.zMin - 1e-6 || point[2] > SCAN_LIMITS.zMax + 1e-6) return null;
  return clampPose({ ...previous, phi, z: point[2] }, position);
}

/** Base visual ortonormal: +x hacia el marcador, +y por el mango hacia fuera del paciente. */
export function probeViewAxes(frame: ProbeFrame): { x: Vec3; y: Vec3; z: Vec3 } {
  const x = normalize(patientToView(frame.lateral));
  const y = normalize(patientToView(scale(frame.axial, -1)));
  return { x, y, z: normalize(cross(x, y)) };
}

/** El marcador de la huella es el mismo borde +theta que se muestra a la izquierda del modo B. */
export function markerPoint(frame: ProbeFrame, tr: Transducer): Vec3 {
  return pointOnLine(frame, tr, tr.halfSector, 0);
}

/** Indicador de orientación sobre la carcasa, por encima de la piel incluso al comprimir.
 * Las dimensiones son del objeto de interfaz: no modifican ni la huella ni el campo acústico.
 */
export function housingMarkerPoint(frame: ProbeFrame, tr: Transducer): Vec3 {
  return add(add(frame.face, scale(frame.lateral, 14.4)), scale(frame.axial, -(tr.curvatureRadius * (1 - Math.cos(tr.halfSector)) + 61)));
}

/** Paso de interfaz en mm de arco, independiente del ancho de pantalla y del lado de cámara. */
export function nudgePose(
  pose: ProbePose,
  torso: Torso,
  aroundMm = 0,
  cranialMm = 0,
  yawRad = 0,
  position: PatientPosition = 'supine',
): ProbePose {
  const radius = Math.hypot(torso.a * Math.sin(pose.phi), torso.b * Math.cos(pose.phi));
  return clampPose({ ...pose, phi: pose.phi + aroundMm / radius, z: pose.z + cranialMm, yaw: pose.yaw + yawRad }, position);
}

export interface MeshData {
  positions: number[];
  indices: number[];
}

/** Teselación visual; los tamaños anatómicos vienen íntegros del modelo. */
export function skinMesh(torso: Torso, segments = 96): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const phi = (i / segments) * 2 * Math.PI;
    for (const z of [SCAN_LIMITS.zMin, SCAN_LIMITS.zMax]) positions.push(...patientToView(torsoSkinPoint(phi, z, torso)));
    if (i < segments) {
      const a = 2 * i;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return { positions, indices };
}

/** Sector convexo con su arco de entrada real, usando SIEMPRE el marco efectivo del cuadro. */
export function sectorMesh(frame: ProbeFrame, tr: Transducer, depthMm: number, segments = 40): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = -tr.halfSector + (2 * tr.halfSector * i) / segments;
    for (const r of [0, depthMm]) positions.push(...patientToView(pointOnLine(frame, tr, theta, r)));
    if (i < segments) {
      const a = 2 * i;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return { positions, indices };
}

/** Huella acústica curva; se dibuja en el mundo del cuadro, no desde la pose nominal. */
export function footprintMesh(frame: ProbeFrame, tr: Transducer, segments = 24): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = -tr.halfSector + (2 * tr.halfSector * i) / segments;
    const center = pointOnLine(frame, tr, theta, 0);
    for (const side of [-1, 1]) positions.push(...patientToView(add(center, scale(frame.elevation, (side * tr.elevationMm) / 2))));
    if (i < segments) {
      const a = 2 * i;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return { positions, indices };
}

/** Inversa de la coordenada de arco que ya usa la tabla costal. */
function phiAtArc(u: number, torso: Torso): number {
  let lo = -Math.PI / 2;
  let hi = Math.PI / 2;
  for (let i = 0; i < 28; i++) {
    const phi = (lo + hi) / 2;
    if (wallArc(torsoSkinPoint(phi, 0, torso), torso) > u) lo = phi;
    else hi = phi;
  }
  return (lo + hi) / 2;
}

/** Superficie costal en REPOSO, calculada desde u, z(u), semianchos y profundidad de la misma parrilla.
 * Las iteraciones resuelven su métrica radial; son teselación del visor, no parámetros anatómicos nuevos.
 */
export function ribMesh(scene: AnatomyScene, index: number, rings = 72, sides = 8): MeshData {
  const { torso, ribCage: cage } = scene;
  const rib = cage.ribs[index];
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = rib.uEnd + ((rib.uPost - rib.uEnd) * i) / rings;
    const phiLeft = phiAtArc(u, torso);
    const phi = rib.side < 0 ? Math.PI - phiLeft : phiLeft;
    const zc = ribTableZ(cage, index, u);
    for (let j = 0; j < sides; j++) {
      const theta = (j / sides) * 2 * Math.PI;
      const z = zc + rib.halfWidth * Math.sin(theta);
      const skin = torsoSkinPoint(phi, z, torso);
      const r = Math.hypot(skin[0], skin[1]);
      const pleuraGap = cage.pleuraComplex + cage.halfThickness * (1 + Math.cos(theta));
      let p = skin;
      for (let k = 0; k < 8; k++) {
        const d = wallTotalMm(p, torso) - ribMetric(p, torso) * pleuraGap;
        p = [skin[0] * (1 - d / r), skin[1] * (1 - d / r), z];
      }
      positions.push(...patientToView(p));
      if (i < rings) {
        const a = i * sides + j;
        const b = i * sides + ((j + 1) % sides);
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  return { positions, indices };
}

/** El punto bajo `skin`, por la radial, a la profundidad `depth` de la clasificación (la métrica de la parrilla, como `ribMesh`). */
function atDepth(skin: Vec3, depth: number, torso: Torso): Vec3 {
  const r = Math.hypot(skin[0], skin[1]);
  let p = skin;
  for (let k = 0; k < 8; k++) {
    const d = ribMetric(p, torso) * depth;
    p = [skin[0] * (1 - d / r), skin[1] * (1 - d / r), skin[2]];
  }
  return p;
}

/**
 * La clavícula en REPOSO (lus-sim, decisión 33), del modelo de la parrilla (`anatomy.clavicle`): un tubo de su radio a lo largo de
 * la piel, con el eje a su profundidad bajo ella por la normal y subiendo hacia el extremo acromial. Un lado: −1 derecho, 1 izquierdo.
 */
export function clavicleMesh(scene: AnatomyScene, side: -1 | 1, rings = 40, sides = 10): MeshData {
  const { torso, ribCage: cage } = scene;
  const c = cage.clavicle;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const f = i / rings;
    const u = c.u0 + (c.u1 - c.u0) * f;
    const phiLeft = phiAtArc(u, torso);
    const phi = side < 0 ? Math.PI - phiLeft : phiLeft;
    const zAxis = c.z0 + c.rise * f;
    for (let j = 0; j < sides; j++) {
      const theta = (j / sides) * 2 * Math.PI;
      const z = zAxis + c.radius * Math.sin(theta);
      positions.push(...patientToView(atDepth(torsoSkinPoint(phi, z, torso), c.depth + c.radius * Math.cos(theta), torso)));
      if (i < rings) {
        const a = i * sides + j;
        const b = i * sides + ((j + 1) % sides);
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  return { positions, indices };
}

/**
 * La escápula en REPOSO (lus-sim, decisión 33), la lámina del modelo (`anatomy.scapula`): su triángulo en (s, z) —s, la distancia a
 * la línea media posterior por la piel a la profundidad de la mitad de la lámina— a esa profundidad, en una rejilla. Un lado.
 */
export function scapulaMesh(scene: AnatomyScene, side: -1 | 1, steps = 16): MeshData {
  const { torso, ribCage: cage } = scene;
  const sc = cage.scapula;
  const half = 0.5 * wallPerimeter(torso);
  const depth = sc.depth + 0.5 * sc.thickness;
  const positions: number[] = [];
  const indices: number[] = [];
  // el triángulo en coordenadas baricéntricas: filas del ángulo inferior al borde superior
  const [a, b, c] = [sc.inferior, sc.superior, sc.glenoid];
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= steps - i; j++) {
      const wb = i / steps;
      const wc = j / steps;
      const wa = 1 - wb - wc;
      const s = wa * a[0] + wb * b[0] + wc * c[0];
      const z = wa * a[1] + wb * b[1] + wc * c[1];
      // la piel de arco u = mitad del perímetro − s (el de la radial: el de la clasificación) y, por la radial, la profundidad
      const phiLeft = phiAtArc(half - s, torso);
      const phi = side < 0 ? Math.PI - phiLeft : phiLeft;
      positions.push(...patientToView(atDepth(torsoSkinPoint(phi, z, torso), depth, torso)));
    }
  const index = (i: number, j: number) => {
    let k = 0;
    for (let r = 0; r < i; r++) k += steps - r + 1;
    return k + j;
  };
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < steps - i; j++) {
      indices.push(index(i, j), index(i + 1, j), index(i, j + 1));
      if (j < steps - i - 1) indices.push(index(i + 1, j), index(i + 1, j + 1), index(i, j + 1));
    }
  return { positions, indices };
}

/** Perfil VISUAL en mm: altura, semiancho, semiespesor, centro lateral y anterior.
 * No es anatomía acústica. Anillos sin vértices duplicados en la costura angular.
 */
export type VisualProfile = readonly [number, number, number, number, number];
export function loftMesh(
  profiles: readonly VisualProfile[],
  subdivisions = 2,
  segments = 48,
  caps: boolean | readonly [boolean, boolean] = true,
): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  const rings: number[][] = [];
  for (let i = 0; i < profiles.length - 1; i++) {
    for (let j = 0; j < subdivisions; j++) {
      const t = j / subdivisions;
      const dz = profiles[i + 1][0] - profiles[i][0];
      // Hermite monótono: conserva perfiles y tangentes comunes sin escalones en cada anillo.
      // Los extremos planos permiten unir contexto y piel funcional sin modificar esta última.
      const slope = (row: number, k: number): number => {
        if (row === 0 || row === profiles.length - 1) return 0;
        const dl = (profiles[row][k] - profiles[row - 1][k]) / (profiles[row][0] - profiles[row - 1][0]);
        const dr = (profiles[row + 1][k] - profiles[row][k]) / (profiles[row + 1][0] - profiles[row][0]);
        return dl * dr > 0 ? (2 * dl * dr) / (dl + dr) : 0;
      };
      rings.push(
        profiles[i].map((v, k) =>
          k === 0
            ? v + dz * t
            : (2 * t ** 3 - 3 * t ** 2 + 1) * v +
              (t ** 3 - 2 * t ** 2 + t) * dz * slope(i, k) +
              (-2 * t ** 3 + 3 * t ** 2) * profiles[i + 1][k] +
              (t ** 3 - t ** 2) * dz * slope(i + 1, k),
        ),
      );
    }
  }
  rings.push([...profiles[profiles.length - 1]]);
  for (let i = 0; i < rings.length; i++) {
    const [h, a, b, x, z] = rings[i];
    for (let j = 0; j < segments; j++) {
      const phi = (2 * Math.PI * j) / segments;
      positions.push((x + a * Math.cos(phi)) / 1000, h / 1000, (z + b * Math.sin(phi)) / 1000);
      if (i < rings.length - 1) {
        const p = i * segments + j;
        const q = i * segments + ((j + 1) % segments);
        indices.push(p, p + segments, q, q, p + segments, q + segments);
      }
    }
  }
  if (caps) {
    for (const i of [0, rings.length - 1]) {
      if (Array.isArray(caps) && !caps[i === 0 ? 0 : 1]) continue;
      const [h, , , x, z] = rings[i];
      const center = positions.length / 3;
      positions.push(x / 1000, h / 1000, z / 1000);
      for (let j = 0; j < segments; j++) {
        const p = i * segments + j;
        const q = i * segments + ((j + 1) % segments);
        indices.push(...(i === 0 ? [center, p, q] : [center, q, p]));
      }
    }
  }
  return { positions, indices };
}
