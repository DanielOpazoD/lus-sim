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
import { ribLineArc, ribLinePoint, ribScan, ribTableZ, type RibSpec } from '../../anatomy/organs/ribcage';
import { torsoDepth } from '../../anatomy/primitives';
import { wallArc } from '../../anatomy/organs/wall';
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

/** ¿Tiene la escena la costilla de número n (del lado derecho, −1, o izquierdo, +1)? */
export function hasRib(scene: AnatomyScene, n: number, side: -1 | 1 = -1): boolean {
  return scene.ribs.some((r) => r.number === n && r.side === side);
}

/** Índice en `scene.ribs` de la costilla n del lado `side`; lanza si la escena no la tiene. */
export function ribIndex(scene: AnatomyScene, n: number, side: -1 | 1 = -1): number {
  const i = scene.ribs.findIndex((r) => r.number === n && r.side === side);
  if (i < 0) throw new Error(`la escena no tiene la costilla ${n} del lado ${side}`);
  return i;
}

/** La costilla de número n del lado `side` (derecho por omisión); lanza si la escena no la tiene. */
export function ribOf(scene: AnatomyScene, n: number, side: -1 | 1 = -1): RibSpec {
  return scene.ribs[ribIndex(scene, n, side)];
}

/** Lado de la línea de piel φ: derecho (x < 0) o izquierdo. */
export const sideOfPhi = (phi: number): -1 | 1 => (Math.cos(phi) < 0 ? -1 : 1);

/**
 * |u| (mm de piel) donde la sonda apoyada en la línea φ, marcador craneal, corta la parrilla: el punto de su línea media a
 * lo largo de la normal de la piel (el que miden las ecografías de la base).
 */
export function lineRibArc(scene: AnatomyScene, phi: number): number {
  return ribLineArc(phi, scene.torso, scene.ribCage);
}

/**
 * Altura z (mm) de la línea media de la costilla n bajo la línea de piel φ (su tabla, la que ve la GPU); lanza si falta.
 * No comprueba que la costilla llegue a esa línea (`ribSpans`).
 */
export function ribZ(scene: AnatomyScene, n: number, phi: number): number {
  return ribTableZ(scene.ribCage, ribIndex(scene, n, sideOfPhi(phi)), lineRibArc(scene, phi));
}

/** ¿Llega la costilla n a la línea φ (su extensión en |u| contiene el corte de la sonda)? */
export function ribSpans(scene: AnatomyScene, n: number, phi: number): boolean {
  const r = ribOf(scene, n, sideOfPhi(phi));
  const au = lineRibArc(scene, phi);
  return au >= r.uEnd && au <= r.uPost;
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
 * Signo del murciélago en cualquier plano (meta F-T08, lus-sim): para cada sombra costal entera del plano (las que tocan
 * el borde del sector no cuentan: su cresta puede quedar fuera de la imagen), la línea costal (la cresta de la costilla,
 * `RibShadow.ribTopMm`) y la pleura de la primera línea sin hueso a cada lado; devuelve, por sombra, cuánto más honda está
 * la pleura que la cresta a cada lado (mm): [antes, después] en el orden de las líneas. En una sombra fuera del centro del
 * convexo, el lado de fuera mira la pared más oblicua que el de dentro (su pleura cae ≈ 1,7 mm más honda, y la cresta, la
 * mínima de la sombra, es la del lado de dentro): la media de los dos lados es la separación sin ese sesgo (decisión 16).
 */
export function pleuraBelowRibCrestMm(v: ChestView): Array<[number, number]> {
  const scans = scanView(v);
  const out: Array<[number, number]> = [];
  for (const s of ribShadows(scans)) {
    const i0 = scans.findIndex((x) => x.theta === s.theta0);
    const i1 = scans.findIndex((x) => x.theta === s.theta1);
    if (i0 === 0 || i1 === scans.length - 1) continue;
    const [a, b] = [scans[i0 - 1], scans[i1 + 1]];
    if (a.ribMm === null && a.pleuraMm !== null && b.ribMm === null && b.pleuraMm !== null)
      out.push([a.pleuraMm - s.ribTopMm, b.pleuraMm - s.ribTopMm]);
  }
  return out;
}

/** Alto craneocaudal anatómico de la costilla n del lado `side` (mm): el de su sección elíptica, 2 × `halfWidth`. */
export function ribHeightMm(scene: AnatomyScene, n: number, side: -1 | 1 = -1): number {
  return 2 * ribOf(scene, n, side).halfWidth;
}

/**
 * Ancho craneocaudal anatómico (mm) del espacio intercostal n (entre las costillas n y n + 1) en el ángulo del tronco φ:
 * la distancia entre las líneas medias de las dos costillas (`ribZ`) menos sus dos semialtos (el método de A-T9).
 */
export function intercostalWidthMm(scene: AnatomyScene, n: number, phi: number): number {
  const side = sideOfPhi(phi);
  return ribZ(scene, n, phi) - ribZ(scene, n + 1, phi) - ribOf(scene, n, side).halfWidth - ribOf(scene, n + 1, side).halfWidth;
}

/** Arco (mm) de `lines` líneas contiguas de la sonda a la profundidad r (el ancho de su tramo en la imagen). */
function linesArcMm(v: ChestView, lines: number, r: number): number {
  return arcMm(v.tr, (lines * 2 * v.tr.halfSector) / (v.tr.lines - 1), r);
}

/**
 * Lo que mide una ecografía (la base mide así el alto de la costilla y los espacios: `docs/knowledge/anatomy.md` §1.3):
 * en un corte longitudinal centrado en la costilla n de la línea φ, con la sonda apoyada (su compresión incluida), el
 * ancho de su sombra en la imagen a la profundidad de su cresta (mm); null si la línea central no cruza hueso.
 */
export function ribImageHeightMm(scene: AnatomyScene, n: number, phi: number): number | null {
  const v = chestView(scene, longitudinalPose(phi, ribZ(scene, n, phi)));
  const scans = scanView(v);
  const c = Math.floor(scans.length / 2);
  const s = ribShadows(scans).find((x) => x.theta0 <= scans[c].theta && scans[c].theta <= x.theta1);
  if (!s) return null;
  const count = scans.findIndex((x) => x.theta === s.theta1) - scans.findIndex((x) => x.theta === s.theta0) + 1;
  return linesArcMm(v, count, s.ribTopMm);
}

/**
 * Lo mismo para el espacio intercostal n de la línea φ: en el corte longitudinal centrado en él, el hueco entre las dos
 * sombras que lo rodean a la profundidad media de sus crestas (mm); null si no hay sombra a los dos lados.
 */
export function intercostalImageWidthMm(scene: AnatomyScene, n: number, phi: number): number | null {
  const v = chestView(scene, longitudinalPose(phi, intercostalZ(scene, n, phi)));
  const scans = scanView(v);
  const shadows = ribShadows(scans);
  const left = shadows.filter((x) => x.theta1 < 0).pop();
  const right = shadows.find((x) => x.theta0 > 0);
  if (!left || !right) return null;
  const gap = scans.findIndex((x) => x.theta === right.theta0) - scans.findIndex((x) => x.theta === left.theta1) - 1;
  return linesArcMm(v, gap, 0.5 * (left.ribTopMm + right.ribTopMm));
}

/** Un cruce de la línea craneocaudal con la parrilla: la costilla (o el esternón), su tramo en z y si es cartílago. */
export interface RibCrossing {
  /** Índice en `scene.ribs`, o `MAX_RIBS` para el esternón. */
  index: number;
  number: number;
  side: -1 | 1 | 0;
  zTop: number;
  zBottom: number;
  cartilage: boolean;
}

/**
 * Lo que encuentra, de arriba abajo, una línea craneocaudal de la piel (φ) a la profundidad de la línea media de las
 * costillas bajo ella (por la normal de la piel, como la sonda apoyada): cada costilla que cruza, en orden, con su número.
 * La cuenta de costillas y de espacios intercostales por línea (decisión 16) sale de aquí, de la clasificación de la
 * parrilla (`ribScan`, la de la GPU), no de la tabla.
 */
export function ribsAlongLine(scene: AnatomyScene, phi: number, zTop = 260, zBottom = -220, step = 0.25): RibCrossing[] {
  const t = scene.torso;
  const hit = ribLinePoint(phi, t, scene.ribCage);
  const out: RibCrossing[] = [];
  let cur: RibCrossing | null = null;
  for (let z = zTop; z >= zBottom; z -= step) {
    const m: Vec3 = [hit[0], hit[1], z];
    const d = -torsoDepth(m, t);
    const scan = ribScan(m, d, wallArc(m, t), t, scene.ribCage);
    const i = scan.inside;
    if (cur && cur.index === i) {
      cur.zBottom = z;
      cur.cartilage ||= scan.cartilage;
      continue;
    }
    cur = null;
    if (i < 0) continue;
    const rib = scene.ribs[i] as RibSpec | undefined;
    cur = { index: i, number: rib?.number ?? 0, side: rib?.side ?? 0, zTop: z, zBottom: z, cartilage: scan.cartilage };
    out.push(cur);
  }
  return out;
}
