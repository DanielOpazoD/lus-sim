/**
 * Medidas geométricas del tórax en el plano de imagen de la sonda (lus-sim, decisión 10), solo para las
 * pruebas. Mide lo que la clasificación de la escena pone a lo largo de cada línea de la sonda apoyada con su
 * contacto (`probeContact`: la cara hundida y la compresión, «presión estándar») y la respiración en fin de
 * espiración: la profundidad de la pleura parietal con la marcha de A0 (`pleuraCrossingLine`), la línea costal,
 * las sombras de las costillas y los espacios intercostales. Es el procedimiento de medida de las metas A de
 * docs/KNOWLEDGE.md: `anatomyTargets.test.ts` lo aplica a la escena heredada de VExUS y seguirá valiendo
 * cuando el paso C cambie la anatomía.
 */
import { AnatomyQuery } from '../../anatomy/query';
import type { Rib } from '../../anatomy/primitives';
import type { AnatomyScene, SceneInstant } from '../../anatomy/scene';
import { Tissue } from '../../anatomy/tissues';
import type { Vec3 } from '../../core/vec3';
import type { RespiratorySample } from '../../physiology/respiratory';
import { probeContact, type ProbeContact } from '../../probe/contact';
import { CONVEX_C35, lineAngle, lineDirection, pointOnLine, type ProbePose, type Transducer } from '../../probe/probe';
import { pleuraCrossingLine } from '../../ultrasound/transmission';

/** Profundidad (mm) que se recorre por línea: la pleura y las costillas de la pared quedan muy por encima. */
export const SCAN_DEPTH_MM = 80;
/** Pasos gruesos de la marcha de A0 en esa profundidad (0,5 mm; la bisección baja a 0,008 mm). */
export const SCAN_COARSE = 160;
/** Paso (mm) con que se busca la primera costilla a lo largo de la línea. */
export const BONE_STEP_MM = 0.05;

/** Respiración en fin de espiración: la pared y la cortina en su sitio (sin descenso del diafragma). */
export const END_EXPIRATION: RespiratorySample = {
  phase: 0,
  volume: 0,
  volumeRate: 0,
  pleuralMmHg: 0,
  abdominalMmHg: 0,
  diaphragmCaudalMm: 0,
  diaphragmVelocityMmS: 0,
};

export interface ChestView {
  scene: AnatomyScene;
  pose: ProbePose;
  tr: Transducer;
  contact: ProbeContact;
  query: AnatomyQuery;
  resp: RespiratorySample;
  instant: SceneInstant;
  /** Punto MATERIAL de un punto del mundo (con la compresión de la sonda y la respiración). */
  material: (p: Vec3) => Vec3;
}

/** La sonda apoyada en `pose` con su contacto, la respiración `resp` (fin de espiración por omisión). */
export function chestView(scene: AnatomyScene, pose: ProbePose, resp: RespiratorySample = END_EXPIRATION, tr = CONVEX_C35): ChestView {
  const contact = probeContact(pose, tr, scene.torso);
  const query = new AnatomyQuery(scene);
  query.setProbeCompression(contact);
  const instant: SceneInstant = { diaphragmCaudalMm: resp.diaphragmCaudalMm };
  return { scene, pose, tr, contact, query, resp, instant, material: (p) => query.deformation.toMaterial(p, resp) };
}

/** Lo que una línea θ de la sonda encuentra: la pleura (A0) y la primera costilla (hueso o cartílago). */
export interface LineScan {
  theta: number;
  /** Profundidad (mm desde la cara) del cruce exacto de la pleura parietal; null si la línea no la registra. */
  pleuraMm: number | null;
  /** Profundidad (mm) del primer punto de costilla antes de la pleura (la línea costal); null si no hay. */
  ribMm: number | null;
  /** La costilla encontrada es cartílago (transmite: no hace sombra limpia). */
  cartilage: boolean;
}

export function scanLine(v: ChestView, theta: number): LineScan {
  const origin = pointOnLine(v.contact.frame, v.tr, theta, 0);
  const dir = lineDirection(v.contact.frame, theta);
  const crossing = pleuraCrossingLine(
    (p) => v.scene.insideWallMm(v.material(p)),
    (p) => v.scene.lungEdgeMm(v.material(p), v.instant),
    origin,
    dir,
    SCAN_DEPTH_MM,
    SCAN_COARSE,
  );
  const limit = crossing ? crossing.D : SCAN_DEPTH_MM;
  let ribMm: number | null = null;
  let cartilage = false;
  for (let r = BONE_STEP_MM; r < limit; r += BONE_STEP_MM) {
    const t = v.scene.classify(v.material(pointOnLine(v.contact.frame, v.tr, theta, r)), v.instant).tissue;
    if (t === Tissue.Bone || t === Tissue.Cartilage) {
      ribMm = r;
      cartilage = t === Tissue.Cartilage;
      break;
    }
  }
  return { theta, pleuraMm: crossing ? crossing.D : null, ribMm, cartilage };
}

/** Todas las líneas de la sonda (cada `every`). */
export function scanView(v: ChestView, every = 1): LineScan[] {
  const out: LineScan[] = [];
  for (let i = 0; i < v.tr.lines; i += every) out.push(scanLine(v, lineAngle(i, v.tr)));
  return out;
}

/** Una sombra costal: tramo de líneas contiguas cuya costilla ósea está antes de la pleura. */
export interface RibShadow {
  /** Primera y última línea del tramo (ángulos, rad). */
  theta0: number;
  theta1: number;
  /** Línea costal: la profundidad mínima del hueso en el tramo (la cresta de la costilla), mm. */
  ribTopMm: number;
}

/** Sombras costales del plano: tramos de líneas con hueso (no cartílago) antes de la pleura. */
export function ribShadows(scans: readonly LineScan[]): RibShadow[] {
  const out: RibShadow[] = [];
  let cur: RibShadow | null = null;
  for (const s of scans) {
    const bone = s.ribMm !== null && !s.cartilage;
    if (bone) {
      if (cur) {
        cur.theta1 = s.theta;
        cur.ribTopMm = Math.min(cur.ribTopMm, s.ribMm!);
      } else cur = { theta0: s.theta, theta1: s.theta, ribTopMm: s.ribMm! };
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Longitud de arco (mm) a la profundidad r de un tramo angular de la imagen del convexo. */
export function arcMm(tr: Transducer, dTheta: number, r: number): number {
  return (tr.curvatureRadius + r) * dTheta;
}

/** ¿Tiene la escena la costilla de número n? */
export function hasRib(scene: AnatomyScene, n: number): boolean {
  return scene.ribNumbers.includes(n);
}

/** La costilla de número n (por su número, `AnatomyScene.ribNumbers`); lanza si la escena no la tiene. */
export function ribOf(scene: AnatomyScene, n: number): Rib {
  const i = scene.ribNumbers.indexOf(n);
  if (i < 0) throw new Error(`la escena no tiene la costilla ${n} (tiene ${scene.ribNumbers.join(', ')})`);
  return scene.ribs[i];
}

/** Altura z (mm) de la línea media de la costilla n en el ángulo del tronco φ (la ley de `sdRib`); lanza si falta. */
export function ribZ(scene: AnatomyScene, n: number, phi: number): number {
  const rib = ribOf(scene, n);
  return rib.zAnterior + rib.tilt * (0.5 - 0.5 * Math.sin(phi));
}

/** Altura z (mm) del centro del espacio intercostal n (entre las costillas n y n + 1) en φ; lanza si falta una. */
export function intercostalZ(scene: AnatomyScene, n: number, phi: number): number {
  return 0.5 * (ribZ(scene, n, phi) + ribZ(scene, n + 1, phi));
}

/** Pose longitudinal (marcador craneal) sobre la piel en (φ, z), sin basculación ni inclinación. */
export function longitudinalPose(phi: number, z: number): ProbePose {
  return { phi, z, lift: 0, yaw: 0, rock: 0, tilt: 0 };
}

/**
 * Signo del murciélago en cualquier plano (meta F-T08, lus-sim): para cada sombra costal del plano, la línea costal (la
 * cresta de la costilla, `RibShadow.ribTopMm`) y la pleura de la primera línea sin hueso a cada lado; devuelve, por
 * sombra y lado, cuánto más honda está la pleura que la cresta (mm). Los lados sin línea con pleura (el borde del
 * sector) no cuentan.
 */
export function pleuraBelowRibCrestMm(v: ChestView): number[] {
  const scans = scanView(v);
  const out: number[] = [];
  for (const s of ribShadows(scans)) {
    const i0 = scans.findIndex((x) => x.theta === s.theta0);
    const i1 = scans.findIndex((x) => x.theta === s.theta1);
    for (const j of [i0 - 1, i1 + 1]) {
      const n = scans[j];
      if (n && n.ribMm === null && n.pleuraMm !== null) out.push(n.pleuraMm - s.ribTopMm);
    }
  }
  return out;
}

/** Alto craneocaudal de la costilla n (mm): el de su sección elíptica, 2 × `Rib.halfWidth` (constante a lo largo del arco). */
export function ribHeightMm(scene: AnatomyScene, n: number): number {
  return 2 * ribOf(scene, n).halfWidth;
}

/**
 * Ancho craneocaudal (mm) del espacio intercostal n (entre las costillas n y n + 1) en el ángulo del tronco φ: la
 * distancia entre las líneas medias de las dos costillas (`ribZ`) menos sus dos semialtos (el método de A-T9).
 */
export function intercostalWidthMm(scene: AnatomyScene, n: number, phi: number): number {
  return ribZ(scene, n, phi) - ribZ(scene, n + 1, phi) - ribOf(scene, n).halfWidth - ribOf(scene, n + 1).halfWidth;
}
