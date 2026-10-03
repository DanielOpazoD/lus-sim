import { START_POINTS, type StartPoint } from './startPoints';
import type { Simulator } from './simulator';
import { Interface, isRibInterface } from '../anatomy/interfaces';
import { ribCenterDepth, ribLineArc, ribTableZ } from '../anatomy/organs/ribcage';
import { wallArc, wallTotalMm } from '../anatomy/organs/wall';
import { HEART } from '../anatomy/organs/heart';
import { lungBorderAt } from '../anatomy/organs/lungBorder';
import { torsoSkinPoint } from '../anatomy/primitives';
import { thoraxLinePhi, type ThoraxLine } from '../anatomy/thoraxLines';
import type { AnatomyScene } from '../anatomy/scene';
import type { Vec3 } from '../core/vec3';
import { Tissue } from '../anatomy/tissues';
import type { ProbeCompression } from '../anatomy/compression';
import { probeContact } from '../probe/contact';
import { pointOnLine, type ProbeFrame, type ProbePose } from '../probe/probe';
import { MIRROR_BISECTION_STEPS, pleuraCrossingLine } from '../ultrasound/transmission';
import { COARSE_DEPTH } from '../ultrasound/renderer';
import { compareTissueGrids } from './equivalenceCheck';

/**
 * Gate de equivalencia TS ↔ GLSL (Fase 0): para cada punto de partida se muestrea la
 * misma rejilla (líneas × profundidad) del plano con la anatomía TS (`classifyWorld`)
 * y con la GLSL (`queryPoints`), en el MISMO instante fisiológico, y se comparan en tejido: acuerdo
 * total e interior (lejos de bordes, `compareTissueGrids`). La e2e lo ejecuta con SwiftShader en CI; así la
 * regla central del proyecto deja de depender de mirar la pestaña Docente. En cada punto de partida el tejido
 * está deformado por la compresión de la sonda en esa pose (decisión 63), en la CPU y en la GPU: el acuerdo se
 * exige con la deformación activa.
 *
 * lus-sim (decisión 12): el tórax no tiene vasos (sin el acuerdo de vaso ni el error de velocidad de la sangre de
 * VExUS); el volumen cubre el tórax en lugar del abdomen, y se añade la pleura parietal de A0 frente a su gemelo
 * (`pleuraEquivalence`).
 */

/**
 * Ejecuta `fn` con la compresión de la sonda `k` en la anatomía TS (la de la GPU se pasa a `gpuQuery`) y deja
 * después la del simulador.
 */
function withCompression<T>(sim: Simulator, k: ProbeCompression, fn: () => T): T {
  const saved = sim.anatomy.probeCompression;
  sim.anatomy.setProbeCompression(k);
  try {
    return fn();
  } finally {
    sim.anatomy.setProbeCompression(saved);
  }
}
export interface EquivalencePoseReport {
  id: string;
  agreement: number;
  interiorAgreement: number;
  worst: string;
}

const LINES = 48;
const SAMPLES = 72;
const DEPTH_MM = 160;
/** «Sin cara» como número: la GPU devuelve las caras en un Int32Array. */
const NO_FACE: number = Interface.None;

/** Pose de un punto de partida (sin levantar la sonda). */
function poseOf(sp: (typeof START_POINTS)[number]): ProbePose {
  return { phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 };
}

/**
 * Los planos de los tres puntos de partida y, después, los de `extra` (lus-sim, decisión 22: en la inspiración profunda, los
 * de `inspirationSweepPoses`).
 */
export function equivalenceSweep(sim: Simulator, extra: ReadonlyArray<{ id: string; pose: ProbePose }> = []): EquivalencePoseReport[] {
  const tr = sim.transducer;
  const out: EquivalencePoseReport[] = [];
  for (const sp of [...START_POINTS.map((p) => ({ id: p.id, pose: poseOf(p) })), ...extra]) {
    // el marco efectivo (la sonda hundida) y su compresión: los del simulador en esa pose (decisión 63)
    const k = probeContact(sp.pose, tr, sim.scene.torso);
    const frame = k.frame;
    out.push(withCompression(sim, k, () => poseReport(sim, sp.id, frame, k)));
  }
  return out;
}

/**
 * Planos que el barrido añade en la inspiración profunda (lus-sim, decisión 22), donde el campo respiratorio cambia deprisa:
 * la ventana cardiaca (el corazón no respira y el pulmón baja a su lado), el borde del pulmón en la LAM izquierda y, en la LAM
 * derecha, la cortina 25 mm bajo el borde de FRC (el receso por el que baja el pulmón, la ZOA y la cúpula junto a la pared).
 */
export function inspirationSweepPoses(scene: AnatomyScene): Array<{ id: string; pose: ProbePose }> {
  const t = scene.torso;
  const lam = thoraxLinePhi('midaxillary', t, -1);
  const zL = lungBorderAt(scene.lungBorder, wallArc(torsoSkinPoint(lam, 0, t), t))[0];
  return [...extraPleuraPoses(scene), { id: 'rightCurtain', pose: { phi: lam, z: zL - 25, lift: 0, yaw: 0, rock: 0, tilt: 0 } }];
}

function poseReport(sim: Simulator, id: string, frame: ProbeFrame, k: ProbeCompression): EquivalencePoseReport {
  const tr = sim.transducer;
  const n = LINES * SAMPLES;
  const pts = new Float32Array(n * 3);
  for (let v = 0; v < SAMPLES; v++)
    for (let u = 0; u < LINES; u++) {
      const theta = -tr.halfSector + (2 * tr.halfSector * (u + 0.5)) / LINES;
      const p = pointOnLine(frame, tr, theta, ((v + 0.5) / SAMPLES) * DEPTH_MM);
      pts.set(p, (v * LINES + u) * 3);
    }
  const gpu = sim.gpuQuery(pts, frame, false, { compression: k });
  const cpuTissue = new Uint8Array(n);
  const gpuTissue = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cpuTissue[i] = sim.anatomy.classifyWorld([pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]], sim.sample).tissue;
    gpuTissue[i] = gpu.tissue[i];
  }
  const rep = compareTissueGrids(
    { width: LINES, height: SAMPLES, tissue: cpuTissue },
    { width: LINES, height: SAMPLES, tissue: gpuTissue },
  )!;
  return {
    id,
    agreement: rep.agreement,
    interiorAgreement: rep.interiorAgreement,
    worst: rep.worst.map((w) => `${Tissue[w.cpu]}→${Tissue[w.gpu]}×${w.count}`).join(', '),
  };
}

/**
 * Equivalencia VOLUMÉTRICA (Fase 2): `n` puntos pseudoaleatorios (semilla fija) repartidos por
 * todo el tórax — no solo los planos de las ventanas — clasificados en TS y en GLSL. Mide el
 * acuerdo de tejido lejos de interfaces (distancia a la frontera ≥ 1 mm en la CPU y la misma cara a
 * ±`FACE_STABLE_MM`: la pared de la decisión 62 cambia de dueño dentro de sus capas) y el de la cara de
 * interfaz que dibuja cada punto (decisión 57: misma cara y la misma distancia a ella). Es la red para
 * cualquier cambio de anatomía.
 */
export interface VolumeEquivalenceReport {
  points: number;
  interiorPoints: number;
  tissueAgreement: number;
  worst: string;
  /** Puntos interiores que dibujan una cara en la CPU (capas de la pared, pericondrio, diafragma). */
  interfacePoints: number;
  /** Fracción de los puntos interiores con la misma cara (o ninguna) en la GPU. */
  interfaceAgreement: number;
  /** Máximo de |distancia a la cara de la GPU − la de la CPU| con la misma cara (mm). */
  interfaceDistanceMaxErr: number;
  /**
   * Lo mismo sobre la cúpula pleural (cobertura torácica, decisión 27: z sobre la menor `zApex`), aparte: ahí la pared cambia
   * deprisa con el arco u (la ladera de la cúpula) y el error de float32 de `wallArc` en la GPU pesa más en la cara.
   */
  interfaceDistanceMaxErrCupola: number;
  /** Parejas de caras CPU → GPU con más desacuerdos. */
  interfaceWorst: string;
  /**
   * Máximo de |distancia al borde del tejido de la GPU − la de la CPU| con el mismo tejido, ambas saturadas en
   * `BOUNDARY_RELEVANT_MM` (mm; lus-sim, decisión 12): la que funde los bordes en la pasada B (`c.bd`), y dónde. Solo donde
   * la de la CPU es continua (`boundaryStable`, decisión 17).
   */
  boundaryDistanceMaxErr: number;
  boundaryWorst: string;
  /** Puntos interiores donde la distancia al borde de la CPU no es continua (`boundaryStable`) y no se compara. */
  boundaryUnstable: number;
  /** Puntos interiores por tejido (en la CPU), para ver que la prueba tiene dientes. */
  byTissue: Record<string, number>;
}

/**
 * Altura del volumen (mm, marco material; z = 0 en la unión xifoesternal): de −100 (bajo las cúpulas heredadas) a +180
 * (sobre la escotadura yugular, a 163), con la cortina, las cúpulas, el pulmón, la parrilla del paso C1 salvo las puntas
 * de la 10.ª–12.ª (hasta −140) y los extremos posteriores de la 1.ª (198), y la ventana del punto BLUE superior. VExUS
 * muestrea de −160 a +120 (el abdomen alto); los 280 mm de altura son los mismos. El vértice, en `APEX_VOLUME_Z_MM`. Los extremos de las 24 costillas, dentro
 * y fuera de este tramo, los mira `ribEndsEquivalence`.
 */
export const VOLUME_Z_MM = [-150, 180] as const;
/**
 * El volumen del vértice (cobertura torácica, decisión 27): de z 150, bajo la 1.ª costilla de delante, a 230, sobre el techo
 * de la cúpula pleural (≈ 213 detrás), con la clavícula. Aparte del de arriba para no cambiar sus muestras.
 */
export const APEX_VOLUME_Z_MM = [150, 230] as const;

export function volumeEquivalence(
  sim: Simulator,
  n = 20_000,
  seed = 20260922,
  zRange: readonly [number, number] = VOLUME_Z_MM,
): VolumeEquivalenceReport {
  let state = seed >>> 0;
  const rnd = () => {
    // mulberry32: determinista y suficiente para muestrear
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const torso = sim.scene.torso;
  const pts = new Float32Array(n * 3);
  const [z0, z1] = zRange;
  for (let i = 0; i < n; i++) {
    // dentro de la elipse del tronco (radio ≤ 1), a la altura del tórax
    const r = Math.sqrt(rnd());
    const a = 2 * Math.PI * rnd();
    pts.set([torso.a * r * Math.cos(a), torso.b * r * Math.sin(a), z0 + (z1 - z0) * rnd()], i * 3);
  }
  const gpu = sim.gpuQuery(pts, sim.frame, true);
  let interior = 0;
  let same = 0;
  const pairs = new Map<string, number>();
  const byTissue: Record<string, number> = {};
  const face = new FaceTally();
  const faceCupola = new FaceTally();
  const apexMinZ = sim.scene.chestWall.apexMinZ;
  let bdMax = 0;
  let bdWorst = '';
  let bdUnstable = 0;
  for (let i = 0; i < n; i++) {
    const p: [number, number, number] = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
    const q = sim.anatomy.classifyWorld(p, sim.sample);
    if (q.boundaryDistance < 1 || !faceStable(sim, p, q.interface)) continue;
    const bdComparable = boundaryStable(sim, p, q.boundaryDistance);
    if (!bdComparable) bdUnstable++;
    interior++;
    byTissue[Tissue[q.tissue]] = (byTissue[Tissue[q.tissue]] ?? 0) + 1;
    const cpuTissue: number = q.tissue;
    if (cpuTissue === gpu.tissue[i]) {
      same++;
      const e = bdComparable ? Math.abs(Math.min(gpu.bd[i], BOUNDARY_RELEVANT_MM) - Math.min(q.boundaryDistance, BOUNDARY_RELEVANT_MM)) : 0;
      if (e > bdMax) {
        bdMax = e;
        bdWorst = `${Tissue[q.tissue]} en (${p.map((x) => x.toFixed(1)).join(', ')}): CPU ${q.boundaryDistance.toFixed(4)}, GPU ${gpu.bd[i].toFixed(4)} mm`;
      }
    } else {
      const k = `${Tissue[q.tissue]}→${Tissue[gpu.tissue[i]]}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    (q.material[2] > apexMinZ ? faceCupola : face).add(
      q.interface,
      q.interfaceDistance,
      gpu.iface[i],
      gpu.ifd[i],
      `(${p.map((x) => x.toFixed(1)).join(', ')})`,
    );
  }
  return {
    points: n,
    interiorPoints: interior,
    tissueAgreement: interior ? same / interior : 1,
    worst: topPairs(pairs),
    interfacePoints: face.withFace + faceCupola.withFace,
    interfaceAgreement: face.points + faceCupola.points ? (face.same + faceCupola.same) / (face.points + faceCupola.points) : 1,
    interfaceDistanceMaxErr: face.maxErr,
    interfaceDistanceMaxErrCupola: faceCupola.maxErr,
    interfaceWorst: [
      topPairs(face.pairs),
      topPairs(faceCupola.pairs),
      face.maxErrAt && `máx. |Δifd| en ${face.maxErrAt}`,
      faceCupola.maxErrAt && `en la cúpula, en ${faceCupola.maxErrAt}`,
    ]
      .filter(Boolean)
      .join('; '),
    boundaryDistanceMaxErr: bdMax,
    boundaryWorst: bdWorst,
    boundaryUnstable: bdUnstable,
    byTissue,
  };
}

/**
 * Hasta dónde importa la distancia al borde del tejido (mm): la pasada B solo pregunta si `c.bd > σe + 0,5` (la
 * semianchura elevacional del haz, de pocos mm) para mezclar los tejidos de un borde. Más lejos, un error relativo
 * de float32 (SwiftShader: 0,15 mm a 100 mm dentro del pulmón) no cambia nada de la imagen.
 */
export const BOUNDARY_RELEVANT_MM = 10;

/** Desplazamiento (mm) con que se comprueba que la cara de un punto interior no está en un cambio de dueño. */
export const FACE_STABLE_MM = 0.02;

/**
 * La cara de la CPU es la misma a ±`FACE_STABLE_MM` en cada eje: el punto no está en una superficie donde el
 * dueño cambia sin cambiar el tejido (la mitad del diafragma, la capa más cercana de la pared, el umbral de la
 * cortical costal, la fusión de un plano intermuscular; decisiones 57 y 62). Allí un redondeo de float32
 * cambia la cara: el acuerdo exacto del volumen solo se exige lejos (a 1e-5 mm la GPU aún coincide).
 */
function faceStable(sim: Simulator, p: readonly [number, number, number], face: Interface): boolean {
  for (let a = 0; a < 3; a++)
    for (const s of [-FACE_STABLE_MM, FACE_STABLE_MM]) {
      const q: [number, number, number] = [p[0], p[1], p[2]];
      q[a] += s;
      if (sim.anatomy.classifyWorld(q, sim.sample).interface !== face) return false;
    }
  return true;
}

/**
 * La distancia al borde de la CPU es continua a ±`FACE_STABLE_MM` en cada eje (varía ≤ 0,05 mm): el punto no está donde
 * la clasificación cambia de rama sin cambiar de tejido (lus-sim, decisión 17: el pulmón de la cortina, a 3 mm de la pleura,
 * y el del tórax detrás de ella son el mismo pulmón con distancias distintas, a su lámina y a la cúpula). Allí el redondeo
 * de float32 elige la otra rama y la distancia salta: se compara solo lejos, como la cara (`faceStable`).
 */
function boundaryStable(sim: Simulator, p: readonly [number, number, number], bd: number): boolean {
  const cap = (x: number) => Math.min(x, BOUNDARY_RELEVANT_MM);
  for (let a = 0; a < 3; a++)
    for (const s of [-FACE_STABLE_MM, FACE_STABLE_MM]) {
      const q: [number, number, number] = [p[0], p[1], p[2]];
      q[a] += s;
      if (Math.abs(cap(sim.anatomy.classifyWorld(q, sim.sample).boundaryDistance) - cap(bd)) > 0.05) return false;
    }
  return true;
}

/** Las 4 parejas con más desacuerdos, como «A→B×n». */
function topPairs(pairs: ReadonlyMap<string, number>): string {
  return [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, c]) => `${k}×${c}`)
    .join(', ');
}

/**
 * Tolerancia de la distancia de una cara, TS ↔ GLSL, en la cáscara (lus-sim, decisión 42). Un error de posición δx de la
 * coma flotante de la GPU da un error de distancia ≈ |∇d|·δx, con |∇d| la norma del gradiente de la distancia de la cara en la
 * CPU (`shellGradNorm`: diferencias de un solo lado, la menor de las dos en cada eje, para que un salto de la pared junto al punto
 * no dé un gradiente enorme; no `FaceGradient.norm`, que es central y lo cruzaría). Donde |∇d| ≈ 1 manda la tolerancia de siempre, `SHELL_DISTANCE_TOL_MM`; solo donde el gradiente es
 * empinado crece con él, con el δx de SwiftShader medido (`SHELL_POSITION_ERR_MM`). Hasta |∇d| = 0,02/δx la prueba es tan
 * exigente como antes. Se puso por la ladera de la cúpula pleural de la decisión 27 (≈ 16 mm de pared por mm en z, hasta ≈ 100 en
 * la inspiración profunda); con la de la decisión 44 (|∇W| ≤ 1,9) ya no se activa: con SwiftShader el mayor |Δd| de la cáscara es
 * 0,0088 mm en espiración y 0,0129 en la inspiración profunda.
 */
export const SHELL_DISTANCE_TOL_MM = 0.02;
/**
 * Error de posición (mm) de la GLSL con SwiftShader: el mayor |Δd|/|∇d| de los puntos de la cáscara fuera de la tolerancia
 * fija (`impliedPositionErrMm`), medido el 03-10-2026 en los planos de los puntos de partida: 0,00101 mm en espiración y 0,00114
 * en la inspiración profunda (los puntos sobre la cúpula, |∇d| ≈ 25–100: Δd hasta 0,025 y 0,11 mm). 0,0015 con margen: la
 * tolerancia fija manda hasta |∇d| ≈ 13. Con la GPU real (Metal) el error máximo es 0,0001 y 0,0067 mm: la fija basta.
 */
export const SHELL_POSITION_ERR_MM = 0.0015;
export function shellDistanceTolerance(gradNorm: number): number {
  return Math.max(SHELL_DISTANCE_TOL_MM, SHELL_POSITION_ERR_MM * gradNorm);
}

/** Recuento del acuerdo de la cara de interfaz (TS frente a GLSL) en un conjunto de puntos (exportado para sus pruebas). */
export class FaceTally {
  points = 0;
  withFace = 0;
  same = 0;
  maxErr = 0;
  /** Cara y distancia del peor desacuerdo de distancia (diagnóstico). */
  maxErrAt = '';
  /** El peor |Δd| / `shellDistanceTolerance(|∇d|)` (< 1 pasa) y dónde; solo si `add` recibe el gradiente. */
  maxErrOverTol = 0;
  maxErrOverTolAt = '';
  /** El mayor |Δd|/|∇d| de los puntos fuera de la tolerancia fija: el δx que la GPU necesitó (la medida de `SHELL_POSITION_ERR_MM`). */
  maxImpliedDxMm = 0;
  readonly pairs = new Map<string, number>();
  /**
   * Registra un punto; devuelve si la GPU dibuja la misma cara que la CPU. `gradNorm` (perezoso: solo se calcula si el error pasa
   * de la tolerancia fija) es la norma del gradiente de la distancia de la cara en la CPU.
   */
  add(cpu: Interface, cpuDist: number, gpu: number, gpuDist: number, where = '', gradNorm?: () => number): boolean {
    this.points++;
    if (cpu !== Interface.None) this.withFace++;
    const cpuFace: number = cpu;
    if (gpu === cpuFace) {
      this.same++;
      const err = Math.abs(gpuDist - cpuDist);
      const at = (): string => `${Interface[cpu]} a ${cpuDist.toFixed(3)} mm${where ? ` en ${where}` : ''}`;
      if (cpu !== Interface.None && err > this.maxErr) {
        this.maxErr = err;
        this.maxErrAt = at();
      }
      if (cpu !== Interface.None && gradNorm) {
        let ratio = err / SHELL_DISTANCE_TOL_MM;
        if (err > SHELL_DISTANCE_TOL_MM) {
          const g = gradNorm();
          ratio = err / shellDistanceTolerance(g);
          this.maxImpliedDxMm = Math.max(this.maxImpliedDxMm, err / Math.max(g, 1));
          if (ratio > this.maxErrOverTol) this.maxErrOverTolAt = `${at()}, |∇d| ${g.toFixed(1)}`;
        } else if (ratio > this.maxErrOverTol) this.maxErrOverTolAt = `${at()}, |∇d| sin calcular`;
        this.maxErrOverTol = Math.max(this.maxErrOverTol, ratio);
      }
      return true;
    }
    const k = `${Interface[cpu]}→${Interface[gpu] ?? gpu}`;
    this.pairs.set(k, (this.pairs.get(k) ?? 0) + 1);
    return false;
  }
}

/**
 * Cáscara de las caras (decisión 57): en los planos de los puntos de partida, los puntos a
 * 0,01–0,6 mm de una cara donde el eco de interfaz se dibuja, según la CPU o según la GPU (así cuenta
 * también una cara que la GPU dibuja y la CPU no). Allí las dos deben dar la misma cara y la misma
 * distancia: el reparto de dueños (las capas de la pared, la cortical y el pericondrio de las costillas, las
 * mitades del diafragma) es una comparación real, sin el margen de 1 mm del volumen. Rejilla de `lines` líneas ×
 * `COARSE_MM`; alrededor de las celdas que (o cuyas vecinas) dibujan una cara en la CPU, pasos de `stepMm`. En el
 * tórax la cara interna de la pared (la que VExUS llama peritoneo, `Interface.Peritoneum`) es la pleura parietal.
 */
export interface InterfaceShellReport {
  points: number;
  /** Fracción de los puntos con la misma cara en la GPU. */
  agreement: number;
  /** Máximo de |distancia de la GPU − la de la CPU| con la misma cara (mm). */
  distanceMaxErr: number;
  /** Dónde (lus-sim, decisión 33): la cara, su distancia en la CPU, el plano y el punto. */
  distanceWorst: string;
  /**
   * lus-sim (decisión 42): el peor |Δd| sobre su tolerancia, `shellDistanceTolerance(|∇d|)` (< 1 pasa), y dónde; y el mayor
   * |Δd|/|∇d| de los puntos fuera de la tolerancia fija (el δx de esta GPU).
   */
  distanceMaxErrOverTol: number;
  distanceWorstOverTol: string;
  impliedPositionErrMm: number;
  /** Puntos por cara (en la CPU), para ver que la prueba tiene dientes. */
  byInterface: Record<string, number>;
  /** Los primeros desacuerdos: vista, cara CPU → GPU, tejido, punto del mundo y distancia de la CPU. */
  disagreements: string[];
}

/** Banda de la cáscara (mm): donde el perfil del eco de interfaz es distinto de cero. */
export const SHELL_BAND_MM = [0.01, 0.6] as const;
const COARSE_MM = 0.5;
const MAX_LISTED = 12;

/**
 * |∇d| de la cara `iface` en el punto del mundo `p` según la CPU (decisión 42), por diferencias de un solo lado de
 * `SHELL_GRADIENT_STEP_MM`: en cada eje, la menor pendiente de las dos (junto a un salto de la pared, la del lado continuo; una
 * diferencia central que lo cruzara daría un gradiente enorme y dejaría pasar cualquier error). Si la cara cambia a los dos
 * lados de un eje, 1: la tolerancia fija.
 */
export const SHELL_GRADIENT_STEP_MM = 0.004;
export function shellGradNorm(sim: Simulator, p: readonly number[], iface: Interface, dist: number): number {
  const h = SHELL_GRADIENT_STEP_MM;
  let sum = 0;
  for (let a = 0; a < 3; a++) {
    let best = Number.POSITIVE_INFINITY;
    for (const sign of [1, -1]) {
      const q: [number, number, number] = [p[0], p[1], p[2]];
      q[a] += sign * h;
      const r = sim.anatomy.classifyWorld(q, sim.sample);
      if (r.interface === iface) best = Math.min(best, Math.abs(r.interfaceDistance - dist) / h);
    }
    if (!Number.isFinite(best)) return 1;
    sum += best * best;
  }
  return Math.sqrt(sum);
}

export function interfaceShellEquivalence(sim: Simulator, lines = 48, stepMm = 0.05): InterfaceShellReport {
  const tr = sim.transducer;
  const tally = new FaceTally();
  const byInterface: Record<string, number> = {};
  const disagreements: string[] = [];
  const nCoarse = Math.floor(DEPTH_MM / COARSE_MM);
  const perCell = Math.round(COARSE_MM / stepMm);
  for (const sp of START_POINTS) {
    // el marco efectivo (la sonda hundida) y su compresión: los del simulador en esa pose (decisión 63)
    const k = probeContact(poseOf(sp), tr, sim.scene.torso);
    const frame = k.frame;
    withCompression(sim, k, () => {
      const near: { p: [number, number, number]; iface: Interface; dist: number; tissue: Tissue }[] = [];
      for (let u = 0; u < lines; u++) {
        const theta = -tr.halfSector + (2 * tr.halfSector * (u + 0.5)) / lines;
        const faceAt = Array.from(
          { length: nCoarse },
          (_, k) =>
            sim.anatomy.classifyWorld(pointOnLine(frame, tr, theta, (k + 0.5) * COARSE_MM), sim.sample).interface !== Interface.None,
        );
        for (let k = 0; k < nCoarse; k++) {
          if (!faceAt[k] && !faceAt[k - 1] && !faceAt[k + 1]) continue;
          for (let j = 0; j < perCell; j++) {
            const p = pointOnLine(frame, tr, theta, k * COARSE_MM + (j + 0.5) * stepMm);
            const q = sim.anatomy.classifyWorld(p, sim.sample);
            near.push({ p, iface: q.interface, dist: q.interfaceDistance, tissue: q.tissue });
          }
        }
      }
      const pts = new Float32Array(near.length * 3);
      near.forEach((s, i) => pts.set(s.p, i * 3));
      const gpu = sim.gpuQuery(pts, frame, false, { compression: k });
      const inBand = (face: number, d: number) => face !== NO_FACE && d >= SHELL_BAND_MM[0] && d <= SHELL_BAND_MM[1];
      near.forEach((s, i) => {
        if (!inBand(s.iface, s.dist) && !inBand(gpu.iface[i], gpu.ifd[i])) return;
        byInterface[Interface[s.iface]] = (byInterface[Interface[s.iface]] ?? 0) + 1;
        const where = `${sp.id} (${s.p.map((x) => x.toFixed(2)).join(', ')})`;
        const gradNorm = (): number => shellGradNorm(sim, s.p, s.iface, s.dist);
        if (tally.add(s.iface, s.dist, gpu.iface[i], gpu.ifd[i], where, gradNorm) || disagreements.length >= MAX_LISTED) return;
        disagreements.push(
          `${sp.id}: ${Interface[s.iface]}→${Interface[gpu.iface[i]] ?? gpu.iface[i]} (${Tissue[s.tissue]}) en ` +
            `(${s.p.map((x) => x.toFixed(2)).join(', ')}), a ${s.dist.toFixed(3)} mm`,
        );
      });
    });
  }
  return {
    points: tally.points,
    agreement: tally.points ? tally.same / tally.points : 1,
    distanceMaxErr: tally.maxErr,
    distanceWorst: tally.maxErrAt,
    distanceMaxErrOverTol: tally.maxErrOverTol,
    distanceWorstOverTol: tally.maxErrOverTolAt,
    impliedPositionErrMm: tally.maxImpliedDxMm,
    byInterface,
    disagreements,
  };
}

/**
 * La pleura parietal de A0 (decisión 61) frente a su gemelo de TS, línea a línea (lus-sim, decisión 12): en cada
 * punto de partida, un cuadro con la sonda allí y, por línea, si la GPU registra la pleura (h2.x ≥ 0) cuando la CPU
 * la registra (`pleuraCrossingLine` con la misma marcha: `COARSE_DEPTH` pasos en la profundidad del equipo y la
 * misma bisección), y la diferencia de su cruce D y de la distancia al borde dz. Es lo que dibuja la línea pleural,
 * las líneas A a múltiplos de D y el deslizamiento: si la GPU y la CPU no la ponen en el mismo sitio, la imagen y las
 * pruebas en TS miden cosas distintas.
 */
export interface PleuraEquivalenceReport {
  /** Líneas comparadas (todas las del sector en los tres puntos de partida). */
  lines: number;
  /** Líneas con la pleura registrada en la CPU. */
  cpuPleura: number;
  /** Líneas en las que una registra la pleura y la otra no. */
  registrationMismatch: number;
  /** Máximo de |D_GPU − D_CPU| y de |dz_GPU − dz_CPU| en las líneas registradas por las dos (mm). */
  depthMaxErrMm: number;
  edgeMaxErrMm: number;
  /** Por plano, el máximo de |D_GPU − D_CPU| en pasos finales de la bisección (`quantumMm`). */
  depthQuantaByPose: Record<string, number>;
  /**
   * Paso final de la bisección del cruce (mm): el paso grueso de la marcha entre 2^MIRROR_BISECTION_STEPS. Una
   * decisión de la bisección que cambia con el redondeo de float32 mueve D exactamente eso.
   */
  quantumMm: number;
  /** D de la línea central de cada punto de partida en la CPU (mm), para el mensaje. */
  centralDepthMm: Record<string, number>;
  worst: string;
}

/**
 * Poses de la pleura además de los puntos de partida (lus-sim, decisión 18): la ventana cardiaca (A0 no registra pleura
 * donde el corazón toca la pared) y el borde del pulmón en FRC en la axilar media izquierda (la cortina del otro lado).
 */
export function extraPleuraPoses(scene: AnatomyScene): Array<{ id: string; pose: ProbePose }> {
  const t = scene.torso;
  const lam = thoraxLinePhi('midaxillary', t, 1);
  const zL = lungBorderAt(scene.lungBorder, wallArc(torsoSkinPoint(lam, 0, t), t))[0];
  const flat = { lift: 0, yaw: 0, rock: 0, tilt: 0 };
  return [
    { id: 'cardiacWindow', pose: { phi: Math.acos(HEART.params.windowOffsetMm.value / t.a), z: scene.heart.window.z, ...flat } },
    { id: 'leftBorder', pose: { phi: lam, z: zL, ...flat } },
    // lus-sim (cobertura torácica): la cúpula pleural vista por la fosa supraclavicular, con el haz hacia los pies
    coveragePoses(scene)[0],
  ];
}

/**
 * Planos de la cobertura torácica que el barrido de equivalencia suma a los puntos de partida: la fosa supraclavicular (la
 * cúpula pleural, con el haz hacia los pies), la clavícula en la LMC y la axila alta sobre la 1.ª costilla (donde la pared
 * engruesa hasta cerrarse sobre el vértice); (decisión 29) la espalda: la escápula, la paravertebral, junto a las transversas
 * y la línea media posterior; y (decisión 37) las bases bajo el borde del pulmón: el hígado en el EIC9 de la axilar media derecha,
 * con el haz hacia la cabeza (el hígado, el diafragma y su espejo sobre la cúpula), y el bazo en el EIC10 de la axilar posterior
 * izquierda; (decisión 43) el estómago con su gas en el espacio de Traube (la LMC izquierda en el EIC7), y en la escapular
 * izquierda la grasa retroperitoneal bajo el diafragma (EIC10, donde Gray pone el polo posterior del bazo, que el bazo normal no
 * alcanza) y el riñón con el retroperitoneo (EIC11).
 */
export function coveragePoses(scene: AnatomyScene): Array<{ id: string; pose: ProbePose }> {
  const t = scene.torso;
  const c = scene.ribCage.clavicle;
  const flat = { lift: 0, yaw: 0, rock: 0, tilt: 0 };
  const fossa = Math.PI - Math.acos(70 / t.a);
  const lam = thoraxLinePhi('midaxillary', t, -1);
  return [
    { id: 'supraclavicular', pose: { ...flat, phi: fossa, z: c.z0 + c.radius + 13, rock: -0.35 } },
    { id: 'clavicle', pose: { ...flat, phi: thoraxLinePhi('midclavicular', t, 1), z: c.z0 + c.rise * 0.5 } },
    { id: 'lateralApex', pose: { ...flat, phi: lam, z: ribTableZ(scene.ribCage, 0, Math.abs(wallArc(torsoSkinPoint(lam, 0, t), t))) } },
    // lus-sim (decisión 29), la espalda (sentado): la escápula sobre la fosa infraespinosa, la paravertebral, la columna junto a
    // las transversas y la línea media posterior con las apófisis espinosas
    { id: 'scapula', pose: { ...flat, phi: Math.PI + Math.acos(100 / t.a), z: 90 } },
    { id: 'paravertebral', pose: { ...flat, phi: thoraxLinePhi('paravertebral', t, -1), z: 60 } },
    { id: 'paraspinal', pose: { ...flat, phi: Math.PI + Math.acos(25 / t.a), z: 60 } },
    { id: 'spinous', pose: { ...flat, phi: 1.5 * Math.PI, z: 60 } },
    { id: 'rightBase', pose: { ...flat, ...icsCenter(scene, 'midaxillary', -1, 9), rock: 0.35 } },
    { id: 'leftBase', pose: { ...flat, ...icsCenter(scene, 'posteriorAxillary', 1, 10) } },
    { id: 'traube', pose: { ...flat, ...icsCenter(scene, 'midclavicular', 1, 7) } },
    { id: 'leftScapularBase', pose: { ...flat, ...icsCenter(scene, 'scapular', 1, 10) } },
    { id: 'leftKidney', pose: { ...flat, ...icsCenter(scene, 'scapular', 1, 11) } },
  ];
}

/** φ y z del centro del EIC n de la línea en el lado `side` (entre las costillas n y n + 1 bajo su piel). */
export function icsCenter(scene: AnatomyScene, line: ThoraxLine, side: -1 | 1, n: number): { phi: number; z: number } {
  const phi = thoraxLinePhi(line, scene.torso, side);
  const au = ribLineArc(phi, scene.torso, scene.ribCage);
  const k = (m: number) => scene.ribs.findIndex((r) => r.number === m && r.side === side);
  return { phi, z: 0.5 * (ribTableZ(scene.ribCage, k(n), au) + ribTableZ(scene.ribCage, k(n + 1), au)) };
}

export function pleuraEquivalence(sim: Simulator): PleuraEquivalenceReport {
  const tr = sim.transducer;
  const depth = sim.bmode.depthMm;
  const pose0 = { ...sim.pose };
  const position0 = sim.patient.position;
  let lines = 0;
  let cpuPleura = 0;
  let mismatch = 0;
  let depthMax = 0;
  let edgeMax = 0;
  let worst = '';
  const centralDepthMm: Record<string, number> = {};
  const depthByPose: Record<string, number> = {};
  try {
    // lus-sim (decisión 33): los puntos de la espalda, con el paciente sentado (en supino, `setPose` los dejaría en el borde)
    const poses: Array<{ id: string; pose: ProbePose; position?: StartPoint['position'] }> = [
      ...START_POINTS.map((sp) => ({ id: sp.id, pose: poseOf(sp), position: sp.position })),
      ...extraPleuraPoses(sim.scene),
    ];
    for (const sp of poses) {
      sim.patient.position = sp.position ?? position0;
      sim.setPose(sp.pose);
      sim.advance(0.05);
      sim.render();
      const h2 = sim.renderer.readPleuraHits();
      const scene = sim.scene;
      const instant = sim.anatomy.instantFor(sim.sample);
      const toMaterial = (p: readonly number[]) => sim.anatomy.deformation.toMaterial([p[0], p[1], p[2]], sim.sample.resp);
      for (let l = 0; l < tr.lines; l++) {
        lines++;
        // el ángulo de la línea l en la GPU (`lineTheta(vUv.x)`, centro del téxel), no `lineAngle`
        const theta = -tr.halfSector + (2 * tr.halfSector * (l + 0.5)) / tr.lines;
        const origin = pointOnLine(sim.frame, tr, theta, 0);
        const end = pointOnLine(sim.frame, tr, theta, 1);
        const dir: [number, number, number] = [end[0] - origin[0], end[1] - origin[1], end[2] - origin[2]];
        const cpu = pleuraCrossingLine(
          (p) => scene.insideWallMm(toMaterial(p)),
          (p) => scene.lungEdgeMm(toMaterial(p), instant),
          origin,
          dir,
          depth,
          COARSE_DEPTH,
        );
        const gD = h2[l * 4];
        const gpuHas = gD >= 0;
        if (cpu) cpuPleura++;
        if (l === tr.lines >> 1) centralDepthMm[sp.id] = cpu?.D ?? -1;
        if (!!cpu !== gpuHas) {
          mismatch++;
          if (!worst) worst = `${sp.id}, línea ${l}: CPU ${cpu ? cpu.D.toFixed(3) : '—'} mm, GPU ${gpuHas ? gD.toFixed(3) : '—'} mm`;
          continue;
        }
        if (!cpu) continue;
        const dD = Math.abs(gD - cpu.D);
        const dZ = Math.abs(h2[l * 4 + 1] - cpu.dz);
        depthByPose[sp.id] = Math.max(depthByPose[sp.id] ?? 0, dD);
        if (dD > depthMax) {
          depthMax = dD;
          worst = `${sp.id}, línea ${l}: D CPU ${cpu.D.toFixed(4)}, GPU ${gD.toFixed(4)} mm`;
        }
        edgeMax = Math.max(edgeMax, dZ);
      }
    }
  } finally {
    sim.patient.position = position0;
    sim.setPose(pose0);
    sim.advance(0.05);
  }
  const quantumMm = depth / COARSE_DEPTH / 2 ** MIRROR_BISECTION_STEPS;
  return {
    lines,
    cpuPleura,
    registrationMismatch: mismatch,
    depthMaxErrMm: depthMax,
    edgeMaxErrMm: edgeMax,
    depthQuantaByPose: Object.fromEntries(Object.entries(depthByPose).map(([k, v]) => [k, v / quantumMm])),
    quantumMm,
    centralDepthMm,
    worst,
  };
}

/**
 * Los extremos de la parrilla (lus-sim, decisión 16; lo pidió la revisión del paso C1): nubes de puntos alrededor de los
 * tres extremos de cada una de las 24 costillas (el medial —la unión esternocostal, la punta del cartílago del reborde o la
 * libre—, la unión condrocostal y el posterior), donde cambian el tejido (hueso, cartílago, esternón), la cara y la
 * costilla que la dibuja. El volumen aleatorio apenas los toca (60 puntos de cartílago en 50 000). Se comparan como en el
 * volumen, pero hasta 0,05 mm de los bordes: el tejido, la cara y su distancia; y, en los puntos con la misma cara de
 * costilla (cortical o pericondrio) en las dos y en la banda donde se dibuja su eco (`SHELL_BAND_MM`), la normal de
 * `faceGradient` (la de la costilla que elige `faceRib`).
 */
export interface RibEndsReport {
  points: number;
  interiorPoints: number;
  tissueAgreement: number;
  worst: string;
  /** Puntos interiores por tejido (en la CPU), para ver que la prueba tiene dientes. */
  byTissue: Record<string, number>;
  facePoints: number;
  faceAgreement: number;
  faceDistanceMaxErr: number;
  faceWorst: string;
  /** Puntos con la misma cara de costilla en las dos; |n_GPU·n_TS|: percentil 5 y mínimo. */
  normalPoints: number;
  normalP05: number;
  normalMin: number;
  normalWorst: string;
}

/** Desplazamientos de las nubes (mm): a lo largo de la costilla (|u|), en altura y en profundidad radial. */
const RIB_END_DU = [-3, -1, 0, 1, 3];
const RIB_END_DZ = [-9, -7.4, -6, -3, 0, 3, 6, 7.4, 9];
const RIB_END_DD = [-3.5, -2.2, -1, 0, 1, 2.2, 3.5];
/** Distancia mínima al borde del tejido (mm) de los puntos que se comparan: lejos del redondeo de float32. */
const RIB_END_MARGIN_MM = 0.05;

export function ribEndsEquivalence(sim: Simulator): RibEndsReport {
  const scene = sim.scene;
  const t = scene.torso;
  const cage = scene.ribCage;
  /** τ ≥ 0 del arco de piel |u| (la inversa de `wallArc` en el lado izquierdo). */
  const tauOf = (au: number): number => {
    let lo = 0;
    let hi = Math.PI;
    for (let i = 0; i < 50; i++) {
      const mid = 0.5 * (lo + hi);
      if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < au) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  const pts: Vec3[] = [];
  cage.ribs.forEach((r, k) => {
    for (const end of [r.uEnd, r.uCc, r.uPost])
      for (const du of RIB_END_DU) {
        const au = end + du;
        if (au < 0) continue;
        const tau = tauOf(au);
        const sx = r.side * t.a * Math.sin(tau);
        const sy = t.b * Math.cos(tau);
        const R = Math.hypot(sx, sy);
        const zc = ribTableZ(cage, k, au);
        let dc = wallTotalMm([sx, sy, zc], t);
        for (let i = 0; i < 3; i++) dc = ribCenterDepth([sx * (1 - dc / R), sy * (1 - dc / R), zc], t, cage);
        for (const dz of RIB_END_DZ) for (const dd of RIB_END_DD) pts.push([sx * (1 - (dc + dd) / R), sy * (1 - (dc + dd) / R), zc + dz]);
      }
  });
  const flat = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => flat.set(p, i * 3));
  const gpu = sim.gpuQuery(flat, sim.frame, false, { normals: true });
  const instant = sim.anatomy.instantFor(sim.sample);
  let interior = 0;
  let same = 0;
  const pairs = new Map<string, number>();
  const byTissue: Record<string, number> = {};
  const face = new FaceTally();
  const dots: { dot: number; at: string }[] = [];
  pts.forEach((p, i) => {
    // los puntos se leen en float32, como los recibe la GPU
    const q32: [number, number, number] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]];
    const q = sim.anatomy.classifyWorld(q32, sim.sample);
    if (q.boundaryDistance < RIB_END_MARGIN_MM || !faceStable(sim, q32, q.interface)) return;
    interior++;
    byTissue[Tissue[q.tissue]] = (byTissue[Tissue[q.tissue]] ?? 0) + 1;
    const cpuTissue: number = q.tissue;
    if (cpuTissue === gpu.tissue[i]) same++;
    else {
      const key = `${Tissue[q.tissue]}→${Tissue[gpu.tissue[i]]}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    if (!face.add(q.interface, q.interfaceDistance, gpu.iface[i], gpu.ifd[i]) || !isRibInterface(q.interface)) return;
    // la normal solo importa donde la cara dibuja su eco (la banda de la cáscara); hacia el centro de la sección elíptica
    // el gradiente de su distancia se anula y su dirección no está definida
    if (q.interfaceDistance < SHELL_BAND_MM[0] || q.interfaceDistance > SHELL_BAND_MM[1]) return;
    const g = scene.faceGradient(q.material, instant);
    const n = gpu.normal!;
    if (!g) return;
    const dot = Math.abs(n[i * 3] * g.normal[0] + n[i * 3 + 1] * g.normal[1] + n[i * 3 + 2] * g.normal[2]);
    dots.push({ dot, at: `${Interface[q.interface]} en (${q32.map((x) => x.toFixed(2)).join(', ')})` });
  });
  dots.sort((a, b) => a.dot - b.dot);
  return {
    points: pts.length,
    interiorPoints: interior,
    tissueAgreement: interior ? same / interior : 1,
    worst: topPairs(pairs),
    byTissue,
    facePoints: face.withFace,
    faceAgreement: face.points ? face.same / face.points : 1,
    faceDistanceMaxErr: face.maxErr,
    faceWorst: [topPairs(face.pairs), face.maxErrAt && `máx. |Δifd| en ${face.maxErrAt}`].filter(Boolean).join('; '),
    normalPoints: dots.length,
    normalP05: dots.length ? dots[Math.floor(0.05 * dots.length)].dot : Number.NaN,
    normalMin: dots.length ? dots[0].dot : Number.NaN,
    normalWorst: dots.length ? `${dots[0].at}: ${dots[0].dot.toFixed(5)}` : '',
  };
}

export interface CapsuleReport {
  /** Puntos de la cáscara de las cápsulas (según la CPU o la GPU), por cara. */
  points: number;
  byInterface: Record<string, number>;
  /** Acuerdo de la cara y error máximo de su distancia (mm) entre la CPU y la GPU. */
  agreement: number;
  distanceMaxErr: number;
  /** Puntos con la normal comparada y el menor coseno entre la de la GPU y el gradiente de TS (`faceGradient`). */
  normalPoints: number;
  normalMin: number;
  worst: string;
}

/**
 * Las cápsulas del hígado y del bazo (lus-sim, decisión 37) y la renal (decisión 43), TS ↔ GLSL: en las bases (`coveragePoses`:
 * el hígado bajo la cúpula derecha, el bazo bajo la izquierda), en la LAA derecha con el haz hacia los pies (el borde inferior del
 * hígado contra el «resto») y en la escapular izquierda en el EIC11 (el riñón), las muestras a 0,05 mm de las líneas cerca de una
 * cara de cápsula: la cara y su distancia, y la normal de la GPU frente al gradiente de TS donde la cara dibuja su eco (la banda de
 * la cáscara). El volumen aleatorio no las mira: deja fuera lo que está a menos de 1 mm de un borde.
 */
/**
 * Los tejidos de cuyo borde se toman las muestras de `capsuleEquivalence`: el hígado, el bazo y el riñón (sin su grasa: la cara de
 * la cápsula renal está entre el riñón y ella).
 */
const ORGAN_EDGE_TISSUES: ReadonlySet<Tissue> = new Set([
  Tissue.LiverCapsule,
  Tissue.Liver,
  Tissue.Spleen,
  Tissue.RenalCapsule,
  Tissue.RenalCortex,
  Tissue.RenalMedulla,
  Tissue.RenalSinus,
  Tissue.RenalPelvis,
]);

export function capsuleEquivalence(sim: Simulator, lines = 48, stepMm = 0.05): CapsuleReport {
  const tr = sim.transducer;
  const scene = sim.scene;
  const CAPS = new Set<number>([Interface.LiverCapsule, Interface.SpleenCapsule, Interface.RenalCapsule]);
  const flat = { lift: 0, yaw: 0, tilt: 0 };
  const laa = icsCenter(scene, 'anteriorAxillary', -1, 9);
  const bases = coveragePoses(scene).filter((p) => ['rightBase', 'leftBase', 'leftKidney'].includes(p.id));
  const poses = [...bases, { id: 'rightEdge', pose: { ...flat, ...laa, rock: -0.35 } }];
  const tally = new FaceTally();
  const byInterface: Record<string, number> = {};
  let normalPoints = 0;
  let normalMin = 1;
  let worst = '';
  const nCoarse = Math.floor(DEPTH_MM / COARSE_MM);
  const perCell = Math.round(COARSE_MM / stepMm);
  for (const sp of poses) {
    const k = probeContact(sp.pose, tr, scene.torso);
    withCompression(sim, k, () => {
      const near: [number, number, number][] = [];
      for (let u = 0; u < lines; u++) {
        const theta = -tr.halfSector + (2 * tr.halfSector * (u + 0.5)) / lines;
        const capAt = Array.from({ length: nCoarse }, (_, c) => {
          const q = sim.anatomy.classifyWorld(pointOnLine(k.frame, tr, theta, (c + 0.5) * COARSE_MM), sim.sample);
          return ORGAN_EDGE_TISSUES.has(q.tissue);
        });
        for (let c = 0; c < nCoarse; c++) {
          // las celdas en el borde del hígado o del bazo (una vecina dentro y otra fuera)
          const edge = capAt[c] !== (capAt[c - 1] ?? capAt[c]) || capAt[c] !== (capAt[c + 1] ?? capAt[c]);
          if (!edge) continue;
          for (let j = 0; j < perCell; j++) near.push(pointOnLine(k.frame, tr, theta, c * COARSE_MM + (j + 0.5) * stepMm));
        }
      }
      const pts = new Float32Array(near.length * 3);
      near.forEach((p, i) => pts.set(p, i * 3));
      const gpu = sim.gpuQuery(pts, k.frame, false, { normals: true, compression: k });
      const instant = sim.anatomy.instantFor(sim.sample);
      near.forEach((_, i) => {
        const q32: [number, number, number] = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
        const q = sim.anatomy.classifyWorld(q32, sim.sample);
        const inBand = (face: number, d: number) => CAPS.has(face) && d >= SHELL_BAND_MM[0] && d <= SHELL_BAND_MM[1];
        if (!inBand(q.interface, q.interfaceDistance) && !inBand(gpu.iface[i], gpu.ifd[i])) return;
        byInterface[Interface[q.interface]] = (byInterface[Interface[q.interface]] ?? 0) + 1;
        tally.add(q.interface, q.interfaceDistance, gpu.iface[i], gpu.ifd[i], `${sp.id} (${q32.map((x) => x.toFixed(2)).join(', ')})`);
        if (!inBand(q.interface, q.interfaceDistance) || gpu.iface[i] !== Number(q.interface) || !gpu.normal) return;
        const g = scene.faceGradient(q.material, instant);
        if (!g) return;
        // la normal del mundo de la GPU frente al gradiente material de TS: sin respiración ni compresión notable en las bases
        const n = [gpu.normal[i * 3], gpu.normal[i * 3 + 1], gpu.normal[i * 3 + 2]];
        const dot = Math.abs(n[0] * g.normal[0] + n[1] * g.normal[1] + n[2] * g.normal[2]);
        normalPoints++;
        if (dot < normalMin) {
          normalMin = dot;
          worst = `${sp.id} ${Interface[q.interface]} (${q32.map((x) => x.toFixed(2)).join(', ')}): ${dot.toFixed(6)}`;
        }
      });
    });
  }
  return {
    points: tally.points,
    byInterface,
    agreement: tally.points ? tally.same / tally.points : 1,
    distanceMaxErr: tally.maxErr,
    normalPoints,
    normalMin,
    worst,
  };
}
