import type { Vec3 } from '../../core/vec3';
import { echoTwinCmToLus, swapYZ, type EchoTwinOrigin } from '../../core/units';
import { Tissue, TISSUE_GLSL_NAME } from '../tissues';
import type { CycleState } from './cycleModel';
import { classifyHeart, computeHeartPose, createHeartModel, type HeartModel, type HeartPose } from './heartModel';
import { normalExcellentCase } from './normal-excellent';
import type { CardiacCase, Vec3Config } from './schema';
import { makeSample, Tissue as EtTissue, type TissueSample } from './tissue';
import { GLSL_COMMON } from './gpu/glslCommon';
import { GLSL_HEART } from './gpu/glslHeart';
import { allocPacked, packHeart, PARAM_COUNT } from './gpu/paramLayout';

/**
 * El corazón de EchoTwin en el tórax de lus-sim (lus-sim, decisión 49, fase 1 del corazón: estático en telediástole).
 *
 * El modelo del corazón (`heartModel.ts` y lo que importa: geometría del VI y del VD, aurículas, válvulas, raíz aórtica, tronco
 * pulmonar, venas, pericardio) y su clasificador (`classify.ts`) son los de EchoTwin, portados con su gemelo GLSL escrito a mano
 * (`gpu/glslHeart.ts`) y sus parámetros en una textura (`gpu/paramLayout.ts`). Este módulo, propio, los une al tórax de lus-sim:
 *  - el marco: el del caso normal de EchoTwin (eje de Engblom), con el origen que `organs/heart.ts` ajusta sobre la parrilla de
 *    lus-sim (el ápex de Gray y el pericardio contra la pleura en la ventana de Latham);
 *  - el instante: el fin de diástole del latido de EchoTwin (`HEART_ED_STATE`); el movimiento llega en la fase 2;
 *  - los tejidos: los de EchoTwin sobre los de lus-sim (`ET_TO_LUS_TISSUE`): no caben tejidos nuevos (`TISSUE_COUNT`, 32);
 *  - las unidades y el marco: lus-sim en mm (levógiro), EchoTwin en cm (dextrógiro; `core/units.ts`);
 *  - una caja en el marco del corazón que contiene todo lo cardiaco (`CARDIAC_BOX_CM`): fuera de ella el clasificador de EchoTwin
 *    no se evalúa (en TS ni en GLSL), y su distancia acota la del corazón.
 */

/**
 * Estado del latido en telediástole: el de `cycleStateAt(tables, 0)` del caso normal de EchoTwin (c15aec7, 65 lpm, supino, en
 * espiración), la fase 0 de su latido, el comienzo del QRS: el VI con su volumen telediastólico, las válvulas cerradas salvo la
 * tricúspide que acaba de cerrarse (0,14) y el anillo mitral 0,15 mm hacia el ápex (1 % del MAPSE). Fase 2: lo dará el reloj.
 */
export const HEART_ED_STATE: CycleState = {
  phase: 0,
  timeInBeatS: 0,
  rrS: 0.9230769230769231,
  lvVolumeMl: 120,
  contraction: 8.137981924931796e-7,
  mvOpen: 0,
  avOpen: 0,
  tvOpen: 0.14086627842071503,
  pvOpen: 0,
  longitudinal: 0.010911422781646252,
  rvLongitudinal: 0.01091143861413002,
  atrialContraction: 0,
  atrialHold: 1,
  mitralFlowMlps: 0,
  aorticFlowMlps: 0,
  edvMl: 120.00006103515625,
  esvMl: 44.99970245361328,
  aorticPressure: 0.10264569994712097,
};

/**
 * Los tejidos de EchoTwin (`tissue.ts`) sobre los de lus-sim (`anatomy/tissues.ts`), que tiene sus 32 llenos (`TISSUE_VEC4`):
 * la sangre y el miocardio, los suyos; las valvas, las cuerdas y la pared de los vasos, la pared arterial (fibrosa, ecogénica);
 * el pericardio y los anillos fibrosos, el ligamento venoso (una lámina fibrosa muy ecogénica: el pericardio es la interfaz más
 * brillante del corazón); la grasa epicárdica, la grasa; el líquido, el líquido. Los tejidos del tórax de EchoTwin no salen del
 * clasificador del corazón; se dan por completitud.
 */
export const ET_TO_LUS_TISSUE: Readonly<Record<EtTissue, Tissue>> = {
  [EtTissue.None]: Tissue.Fat,
  [EtTissue.Blood]: Tissue.Blood,
  [EtTissue.Myocardium]: Tissue.Myocardium,
  [EtTissue.Valve]: Tissue.ArteryWall,
  [EtTissue.Pericardium]: Tissue.LigamentumVenosum,
  [EtTissue.Fat]: Tissue.Fat,
  [EtTissue.Muscle]: Tissue.Muscle,
  [EtTissue.Bone]: Tissue.Bone,
  [EtTissue.Cartilage]: Tissue.Cartilage,
  [EtTissue.Lung]: Tissue.Lung,
  [EtTissue.Fluid]: Tissue.Fluid,
  [EtTissue.VesselWall]: Tissue.ArteryWall,
  [EtTissue.Calcium]: Tissue.Bone,
  [EtTissue.Skin]: Tissue.Skin,
  [EtTissue.Liver]: Tissue.Liver,
  [EtTissue.Spine]: Tissue.Vertebra,
  [EtTissue.Fibrous]: Tissue.LigamentumVenosum,
  [EtTissue.Chordae]: Tissue.ArteryWall,
};
const ET_TISSUE_COUNT = 18;

/**
 * Los tejidos de lus-sim que en el tórax solo da el corazón (la sangre de sus cavidades y vasos, el miocardio, la pared arterial
 * de valvas, cuerdas y vasos, y el ligamento venoso del pericardio y los anillos): lo que una medida reconoce como corazón. La grasa
 * epicárdica y la del tapón no (también es la de la pared).
 */
export const CARDIAC_TISSUES: ReadonlySet<Tissue> = new Set([Tissue.Blood, Tissue.Myocardium, Tissue.ArteryWall, Tissue.LigamentumVenosum]);

/**
 * Caja (marco del corazón, cm) que contiene todo lo que el clasificador da como cardiaco en telediástole, con 3 mm de margen:
 * medida sobre una rejilla de 2 mm del caso normal (las venas cavas, las pulmonares, el tronco pulmonar con sus ramas y la aorta
 * ascendente la estiran); `cardiac.test.ts` lo comprueba en la pose de lus-sim. Más allá, el corazón no se evalúa.
 */
export const CARDIAC_BOX_CM = { min: [-7.5, -7.5, -6.9] as Vec3, max: [6.9, 6.3, 9.7] as Vec3 } as const;

/** Distancia con signo (cm) a la caja del corazón, en su marco (gemelo GLSL `cardiacBoxSd`). */
export function cardiacBoxSd(q: Vec3): number {
  const ex = Math.max(CARDIAC_BOX_CM.min[0] - q[0], q[0] - CARDIAC_BOX_CM.max[0]);
  const ey = Math.max(CARDIAC_BOX_CM.min[1] - q[1], q[1] - CARDIAC_BOX_CM.max[1]);
  const ez = Math.max(CARDIAC_BOX_CM.min[2] - q[2], q[2] - CARDIAC_BOX_CM.max[2]);
  return Math.hypot(Math.max(ex, 0), Math.max(ey, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ey, ez), 0);
}

/** El corazón de EchoTwin colocado en el tórax de lus-sim. */
export interface Cardiac {
  readonly model: HeartModel;
  readonly pose: HeartPose;
  /** Origen del marco del corazón (el centro del anillo mitral en telediástole) en lus-sim (mm). */
  readonly originMm: Vec3;
  /** Ejes del marco del corazón en lus-sim (unitarios): ex (septal → lateral), ey (inferior → anterior), ez (base → ápex). */
  readonly ex: Vec3;
  readonly ey: Vec3;
  readonly ez: Vec3;
  /** La textura de parámetros (`uHeartTex`): la de EchoTwin y, desde `PARAM_COUNT`, el marco en lus-sim (`CL_*`). */
  readonly params: Float32Array;
  /** La retícula de ruido de la pared (128³ bytes, `uHeartNoise`). */
  readonly noise: Uint8Array;
}

/** Parámetros propios de lus-sim tras los de EchoTwin en la textura: el origen y los tres ejes del marco del corazón (mm). */
export const CARDIAC_LUS_PARAMS = 12;
/** Téxeles de la textura de parámetros del corazón. */
export const CARDIAC_TEX_TEXELS = Math.ceil((PARAM_COUNT + CARDIAC_LUS_PARAMS) / 4);

/**
 * Los últimos corazones construidos, por origen (el más reciente al final): cada uno lleva su retícula de 128³ y la pose. Con
 * `CARDIAC_CACHE_SIZE` caben el de partida y el colocado de dos pacientes; el más antiguo sale.
 */
const cache = new Map<string, Cardiac>();
export const CARDIAC_CACHE_SIZE = 4;

/**
 * El corazón del caso con el origen de su marco en `baseCm` (tórax de EchoTwin, cm) sobre el tórax de lus-sim de origen `o`: el
 * modelo, la pose de telediástole y su textura. La pose cuesta (ajusta las valvas a la cavidad): se guarda por origen.
 */
export function buildCardiac(baseCm: Vec3Config, o: EchoTwinOrigin, c: CardiacCase = normalExcellentCase): Cardiac {
  const key = `${c.id}|${baseCm.x}|${baseCm.y}|${baseCm.z}|${o.zIcs4Mm}|${o.skinYMm}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const anatomy = { ...c.anatomy, heartPosition: { ...c.anatomy.heartPosition, baseCm: { ...baseCm } } };
  const model = createHeartModel(anatomy, c.physiology, { x: 0, y: 0, z: 0 }, c.seed, 0, 0);
  const pose = computeHeartPose(model, HEART_ED_STATE);
  const f = model.frame;
  const originMm = echoTwinCmToLus([f.origin.x, f.origin.y, f.origin.z], o);
  const ex = swapYZ([f.ex.x, f.ex.y, f.ex.z]);
  const ey = swapYZ([f.ey.x, f.ey.y, f.ey.z]);
  const ez = swapYZ([f.ez.x, f.ez.y, f.ez.z]);
  const packed = allocPacked();
  packHeart(model, pose, packed);
  const params = new Float32Array(CARDIAC_TEX_TEXELS * 4);
  params.set(packed.data.subarray(0, PARAM_COUNT));
  params.set([...originMm, ...ex, ...ey, ...ez], PARAM_COUNT);
  const out: Cardiac = { model, pose, originMm, ex, ey, ez, params, noise: model.wallNoise };
  cache.set(key, out);
  if (cache.size > CARDIAC_CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return out;
}

/** Punto de lus-sim (mm) en el marco del corazón (cm) (gemelo GLSL `cardiacLocal`). */
export function cardiacLocal(c: Cardiac, m: Vec3): Vec3 {
  const d: Vec3 = [(m[0] - c.originMm[0]) * 0.1, (m[1] - c.originMm[1]) * 0.1, (m[2] - c.originMm[2]) * 0.1];
  const dot = (e: Vec3) => d[0] * e[0] + d[1] * e[1] + d[2] * e[2];
  return [dot(c.ex), dot(c.ey), dot(c.ez)];
}

/** Punto del marco del corazón (cm) en lus-sim (mm): la inversa de `cardiacLocal`. */
export function cardiacPoint(c: Cardiac, q: Vec3): Vec3 {
  return [
    c.originMm[0] + 10 * (q[0] * c.ex[0] + q[1] * c.ey[0] + q[2] * c.ez[0]),
    c.originMm[1] + 10 * (q[0] * c.ex[1] + q[1] * c.ey[1] + q[2] * c.ez[1]),
    c.originMm[2] + 10 * (q[0] * c.ex[2] + q[1] * c.ey[2] + q[2] * c.ez[2]),
  ];
}

/**
 * Esfera (marco del corazón, cm) que cubre lo del saco pericárdico que el elipsoide de la decisión 18 deja fuera (las aurículas,
 * las raíces de los grandes vasos): con él, la región que no respira (`organs/heart.ts`, `heartStillWeight`). `cardiac.test.ts`
 * comprueba que cubre el saco en la pose de lus-sim.
 */
export const CARDIAC_BASE_SPHERE_CM = { c: [-1.5, 2.1, 1.6] as Vec3, r: 7.8 } as const;

/** Lo que el corazón dice de un punto: su tejido (de lus-sim) o −1 fuera, y las distancias (mm). */
export interface CardiacSample {
  /** Tejido de lus-sim, o −1 si el punto no es cardiaco. */
  tissue: Tissue | -1;
  /** Dentro: la distancia (mm) a la frontera de su estructura (la `sdf` de EchoTwin). */
  bd: number;
  /** Dentro: la normal de esa frontera en lus-sim. */
  n: Vec3;
  /**
   * Fuera: cota de la distancia (mm) al corazón: la del saco pericárdico (o la pared de la aorta) que da EchoTwin dentro de la
   * caja, la de la caja fuera de ella; 0 dentro.
   */
  clear: number;
}

const sample: TissueSample = makeSample();

/** Clasifica un punto de lus-sim (mm) con el corazón de EchoTwin (gemelo GLSL `cardiacSample`). */
export function cardiacSample(c: Cardiac, m: Vec3): CardiacSample {
  const q = cardiacLocal(c, m);
  const box = cardiacBoxSd(q);
  if (box >= 0) return { tissue: -1, bd: 0, n: [0, 1, 0], clear: box * 10 };
  if (!classifyHeart(c.model, c.pose, q[0], q[1], q[2], sample))
    return { tissue: -1, bd: 0, n: [0, 1, 0], clear: Math.max(0, sample.sdf * 10) };
  const s = sample;
  const n: Vec3 = [
    s.nx * c.ex[0] + s.ny * c.ey[0] + s.nz * c.ez[0],
    s.nx * c.ex[1] + s.ny * c.ey[1] + s.nz * c.ez[1],
    s.nx * c.ex[2] + s.ny * c.ey[2] + s.nz * c.ez[2],
  ];
  return { tissue: ET_TO_LUS_TISSUE[s.tissue], bd: Math.max(0, -s.sdf) * 10, n, clear: 0 };
}

/**
 * Prefijo de todo lo que define la GLSL portada de EchoTwin (funciones, constantes, `#define` y estructuras): sus nombres
 * (`smin`, `sdRoundCone`, `T_BLOOD`, `P`…) chocan con los de lus-sim. Va escrito en el fuente portado (`gpu/*.ts`), no se pone
 * al ejecutar: así el renombrado del build (`tools/build/glslMangle.ts`) ve los nombres finales. Los uniforms y los campos no lo
 * llevan. `cardiac.test.ts` comprueba que todo lo que define la GLSL portada lo lleva.
 */
export const CARDIAC_GLSL_PREFIX = 'et_';

const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const v3s = (v: Vec3): string => `vec3(${v.map(f).join(', ')})`;

/**
 * El corazón en la GPU: la GLSL de EchoTwin con su prefijo et_ (`GLSL_COMMON` con los parámetros, el ruido y las primitivas, y
 * `GLSL_HEART`, el clasificador) y las gemelas de `cardiacLocal`, `cardiacBoxSd` y `cardiacSample`. Va en `ANATOMY_GLSL` tras los
 * `#define` de los tejidos de lus-sim (`T_…`), antes de los módulos de órgano.
 */
export const CARDIAC_GLSL = /* glsl */ `
${GLSL_COMMON}
${GLSL_HEART}
#define CL_BASE ${PARAM_COUNT}
const int ET_TO_LUS_TISSUE[${ET_TISSUE_COUNT}] = int[${ET_TISSUE_COUNT}](${Array.from({ length: ET_TISSUE_COUNT }, (_, i) => TISSUE_GLSL_NAME[ET_TO_LUS_TISSUE[i as EtTissue]]).join(', ')});
const vec3 CARDIAC_BOX_MIN = ${v3s(CARDIAC_BOX_CM.min)};
const vec3 CARDIAC_BOX_MAX = ${v3s(CARDIAC_BOX_CM.max)};
vec3 cardiacAxis(int k) { return vec3(et_P(CL_BASE + 3 * k), et_P(CL_BASE + 3 * k + 1), et_P(CL_BASE + 3 * k + 2)); }
vec3 cardiacLocal(vec3 m) {
  vec3 d = (m - cardiacAxis(0)) * 0.1;
  return vec3(dot(d, cardiacAxis(1)), dot(d, cardiacAxis(2)), dot(d, cardiacAxis(3)));
}
float cardiacBoxSd(vec3 q) {
  vec3 e = max(CARDIAC_BOX_MIN - q, q - CARDIAC_BOX_MAX);
  return length(max(e, 0.0)) + min(max(e.x, max(e.y, e.z)), 0.0);
}
// tejido de lus-sim o −1; dentro, bd (mm) y n; fuera, clear (mm)
int cardiacSample(vec3 m, out float bd, out vec3 n, out float clear) {
  vec3 q = cardiacLocal(m);
  float box = cardiacBoxSd(q);
  bd = 0.0;
  n = vec3(0.0, 1.0, 0.0);
  if (box >= 0.0) { clear = box * 10.0; return -1; }
  et_Sample s;
  if (!et_classifyHeart(q, s)) { clear = max(0.0, s.sdf * 10.0); return -1; }
  clear = 0.0;
  bd = max(0.0, -s.sdf) * 10.0;
  n = s.n.x * cardiacAxis(1) + s.n.y * cardiacAxis(2) + s.n.z * cardiacAxis(3);
  return ET_TO_LUS_TISSUE[s.tissue];
}
`;
