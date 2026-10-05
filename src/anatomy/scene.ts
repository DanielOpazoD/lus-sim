import { defineParameters } from '../core/evidence';
import { smoothstep, type Vec3 } from '../core/vec3';
import type { PatientState } from '../physiology/patientState';
import type { LungAeration } from '../physiology/lungAeration';
import { subpleuralTable } from './organs/subpleural';
import {
  sdSpine,
  sdDiaphragm,
  torsoDepth,
  torsoSkinPoint,
  type Dome,
  type Spine,
  type Diaphragm,
  type Torso,
  tubeFaceGradient,
  tubeQuery,
  type TubeHit,
  type WallLayersAt,
} from './primitives';
import { inLungCurtain, inLungRecess, lungCurtainDistance, lungCurtainEdgeMm } from './organs/lungCurtain';
import {
  LUNG_BD_CAP_MM,
  LUNG_BORDER,
  buildLungBorder,
  lungEdgeZ,
  zoaDistance,
  zoaGap,
  zoaThicknessMm,
  type LungBorder,
} from './organs/lungBorder';
import { buildHeart, heartAtWall, heartQuery, heartStillWeight, heartWindowDistance, type Heart } from './organs/heart';
import {
  CLAVICLE,
  RIBCAGE,
  RIBS_PER_SIDE,
  clavicleMedialTopZ,
  buildRibCage,
  faceRib,
  ribCurvature,
  ribLineArc,
  ribScan,
  ribSd,
  ribTableZ,
  ribTangent,
  setRibPosteriorEnds,
  fitScapula,
  type RibCage,
  type RibCageOptions,
  type RibSpec,
} from './organs/ribcage';
import {
  CHEST_WALL,
  DEFAULT_CHEST_HABITUS,
  buildChestWall,
  respiratoryWallBlendMm,
  respiratoryWallOf,
  setChestWallApex,
  setChestWallFossa,
  wallFossaMm,
  setChestWallCage,
  skinArc,
  wallCupolaBd,
  wallCupolaRoofBd,
  wallCupolaMm,
  wallColumnTexel,
  wallLayersAt,
  type ChestWall,
} from './organs/chestWall';
import { preperitonealMm, wallArc, wallDepths, wallFace, wallFaceSd, wallLayers, wallTotalMm } from './organs/wall';
import { CUPOLA_CAP_MM, LUNG_APEX, lungApexColumns } from './organs/lungApex';
import { SPINE, spinousSd, type SpinousSpec } from './organs/spine';
import {
  KIDNEY_NEAR_MARGIN_MM,
  KIDNEY_REACH_MM,
  PERIRENAL,
  RENAL_CAPSULE_MM,
  buildKidneys,
  kidneyCenterY,
  kidneyLocal,
  kidneyOuterSdf,
  kidneyQuery,
  perirenalDistance,
  perirenalBlend,
  perirenalFar,
  perirenalThicknessMm,
  renalImpression,
  type Kidney,
} from './organs/kidney';
import { retroFrame, retroperitoneum, type RetroFrame } from './organs/retroperitoneum';
import { LIVER_EARLY_OUT_MM, ORGAN_SDF_LIPSCHITZ, buildLiver, liverLobesSd, liverSdf, type LiverShape } from './organs/liver';
import { SPLEEN, SPLEEN_GASTRIC_ACROSS, buildSpleen, pointAtArc, spleenCandidate, spleenSdf, type SpleenShape } from './organs/spleen';
import {
  HILUM_VESSEL_COUNT,
  SUBCLAVIAN_GATE_MM,
  VESSEL_BOUND_MARGIN_MM,
  VESSEL_TABLE_COUNT,
  buildHilumVessels,
  buildSubclavianVessels,
  tubeBoundingSphere,
  type HilumVessel,
} from './organs/vessels';
import { STOMACH, buildStomach, stomachCandidate, stomachSdf, type StomachShape } from './organs/stomach';
import { thoraxLinePhi } from './thoraxLines';
import { BOWEL_BD_CAP_MM, DIAPHRAGM_THICKNESS_MM, LIVER_CAPSULE_MM, Tissue } from './tissues';
import { FACE_GRADIENT_EPS_MM, Interface, isRibInterface, isWallLayerInterface } from './interfaces';

/**
 * Escena anatómica del avatar adulto de referencia (guía §9): el tórax de la escena de VExUS
 * (lus-sim, decisión 10). Quedan el tronco, la pared en capas, el diafragma en dos cúpulas, la columna, la cortina
 * pulmonar y el pulmón del tórax sobre la cúpula; la parrilla costal (las 12 costillas de cada lado, sus cartílagos y el
 * esternón) es la del adulto promedio de la base (`organs/ribcage.ts`, decisión 16), no las costillas 5.ª–10.ª derechas
 * de VExUS. No se portan el hígado, la vesícula, los riñones, los ligamentos, la
 * aurícula derecha, el árbol vascular ni el intestino: bajo el diafragma queda el tejido por defecto de
 * la clasificación de VExUS, su «resto» del abdomen (`Tissue.Bowel`, sin bolsas de gas), declarado como
 * `abdomen-generic-tissue`. El hígado vuelve en la fase 3 como módulo portado.
 *
 * Todas las coordenadas son del marco MATERIAL (espiración, sin deformación):
 * +x izquierda del paciente, +y anterior, +z craneal (marco levógiro, decisión 22).
 * Las dimensiones son las de VExUS: [EXTRAPOLACIÓN PROPIA] de un adulto de IMC 25; ningún ángulo o
 * longitud se presenta como dato anatómico medido. Las del tórax de la base de conocimiento (metas A)
 * llegan en el paso C (`anatomyTargets.test.ts` mide cuáles no se cumplen aún, con lo medido).
 */

/**
 * El tronco del tórax (lus-sim, decisión 28): el cilindro elíptico de VExUS, con la profundidad de la base. VExUS usa 320 × 210
 * mm (un adulto de IMC 25 en el abdomen); con 210 la pared posterior de las fuentes no cabía junto a la caja de Robinson (la
 * cavidad quedaba en 155 mm de delante atrás en la paravertebral).
 */
export const TORSO = defineParameters('anatomy.torso', {
  semiWidthMm: {
    value: 160,
    unit: 'mm',
    range: [144, 161],
    evidence: 'estimado',
    sources: ['gordon-ansur-1989'],
    note:
      'Semiancho de la piel: el de VExUS (320 mm), que no cambia (la anchura mueve todas las líneas del tórax y sus calibraciones). ' +
      'La anchura del tórax de ANSUR 1988 al nivel del pezón, de pie, en respiración tranquila y sin comprimir (sin la mama ni el ' +
      'dorsal ancho que sobresalgan de la parrilla): 321,5 ± 25,5 mm en 1774 varones (Gordon y cols. 1989); en los de IMC 18,5–25 de ' +
      'sus datos públicos (n 811, IMC medio 22,9), 304,6 ± 17,0: 320 queda +0,9 DE. El rango, de −1 DE del subgrupo (287,6 mm) a la media de todos los varones (321,5). ANSUR II la mide ' +
      'comprimida en inspiración máxima (289 mm): no es la misma medida',
  },
  semiDepthMm: {
    value: 113,
    unit: 'mm',
    range: [105, 121],
    evidence: 'derivado',
    sources: ['gordon-ansur-2014'],
    note:
      'Semiprofundidad de la piel: la profundidad del tórax de ANSUR II (Gordon y cols. 2014, medida 25: del punto más anterior ' +
      'del tórax a la espalda al mismo nivel, de pie, en el máximo de la respiración tranquila; varones 253,8 ± 26,2 mm, n 4082, ' +
      'IMC 27,7) en los varones con IMC 18,5–25 de los datos públicos de la misma encuesta (n 1061, IMC medio 22,9, el del ' +
      'avatar): 225,8 ± 15,8 mm, la mitad (ANSUR 1988, los varones de IMC 18,5–25: 228,4 ± 15,1). El rango, ± 1 DE. VExUS usa 105 ' +
      '(210 mm)',
  },
});

export interface Classification {
  tissue: Tissue;
  /** Distancia con signo a la interfaz más cercana relevante (mm). */
  boundaryDistance: number;
  /** Normal aproximada de esa interfaz (apunta hacia fuera del tejido actual). */
  boundaryNormal: Vec3;
  /**
   * Cara de interfaz que dibuja este punto (decisión 57, `anatomy/interfaces.ts`): la misma que la GPU
   * en `Cls.iface`. `Interface.None` si el punto no es dueño de ninguna.
   */
  interface: Interface;
  /**
   * Valor (mm) de la distancia de esa cara en el punto (`Cls.ifd`; |`faceSdf`| de su geometría); 1e3 sin
   * cara. No siempre es euclídea: la distancia por la normal es, a primer orden, este valor dividido por
   * la norma de su gradiente (`faceGradient`; 1/apScale en las paredes AP de la VCI elíptica).
   */
  interfaceDistance: number;
  /**
   * Vaso que contiene el punto: siempre null (sin Doppler; los vasos del hilio de la decisión 46 dan su `vesselHit`, no un id de
   * la fisiología). El campo, como `vesselHit` y `flowFactor`, conserva la forma de la clasificación de VExUS.
   */
  vessel: null;
  vesselHit: TubeHit | null;
  /** Velocidad relativa a la del vaso `vessel` (ramas procedurales < 1). */
  flowFactor: number;
}

/**
 * Cara geométrica cuya distancia con signo da la normal que usa la GPU (`Cls.n`) en esa cara: la
 * miden el banco de fidelidad (incidencia de paredes y órganos) y la e2e de normales.
 *  - `dome`: la superficie pleural del diafragma (su cara hepática es paralela).
 *  - `zoa`: la cara abdominal de la lámina del diafragma de la zona de aposición (lus-sim, decisión 18), paralela a la
 *    cara interna de la pared: la de `Interface.DiaphragmLiver` donde la muestra está en la ZOA.
 *  - `liverSurface` y `spleenSurface` (lus-sim, decisión 37): el borde del hígado y el del bazo, recortados por el diafragma y
 *    la pared, como en `classifyOrgans` (la `liverSurface` de VExUS).
 *  - `kidneyOuter` (lus-sim, decisión 43): el contorno del riñón del lado del punto (`kidneyOuterSdf`, la de VExUS), la cara de la
 *    cápsula renal.
 * lus-sim (decisión 10): las caras de los tubos, del hígado, del riñón, de la grasa perirrenal y de la
 * vesícula de VExUS no existen en el tórax.
 */
export type FaceGeometry = 'dome' | 'zoa' | 'liverSurface' | 'spleenSurface' | 'kidneyOuter';
export const FACE_GEOMETRIES: readonly FaceGeometry[] = ['dome', 'zoa', 'liverSurface', 'spleenSurface', 'kidneyOuter'];

/**
 * Geometría cuya distancia (`faceSdf`) da la cara de interfaz `i`, o null sin cara (o las pleuras: la del
 * espejo y la parietal, que no salen de `classify`). Las caras de la pared y de las costillas (decisión 62)
 * tampoco tienen geometría de `faceSdf`: su distancia es la de su capa (`wallFaceSd`) o la de su costilla
 * (`ribSd`), y `faceGradient` las trata aparte. Las caras de estructuras que el tórax no tiene (tubos,
 * vesícula, cápsula hepática, riñón) tampoco: null.
 */
export function faceGeometryOf(i: Interface): FaceGeometry | null {
  if (i === Interface.LiverCapsule) return 'liverSurface';
  if (i === Interface.SpleenCapsule) return 'spleenSurface';
  if (i === Interface.RenalCapsule) return 'kidneyOuter';
  return i === Interface.DiaphragmLiver ? 'dome' : null;
}

/**
 * Gradiente de la distancia de la cara que dibuja un punto (`AnatomyScene.faceGradient`, gemelo de
 * `faceGradient` en la GLSL; decisión 57).
 */
export interface FaceGradient {
  /** Dirección del gradiente: la normal de la cara que usa el eco. */
  normal: Vec3;
  /**
   * Norma del gradiente: `interfaceDistance` es el valor de la distancia de la cara, y
   * `interfaceDistance / norm` es, a primer orden, la distancia por la normal (la VCI elíptica: 1/apScale
   * en sus paredes AP; las fusiones suaves de la cápsula: < 1).
   */
  norm: number;
  /**
   * Curvatura circunferencial de la cara de un tubo (1/mm, `tubeFaceGradient`) o de la sección de una
   * costilla (`ribCurvature`, decisión 62); 0 en el resto.
   */
  curvature: number;
  /** Eje del cilindro cuya sección da `curvature` (tubo o costilla); ausente en el resto. */
  axis?: Vec3;
}

export class AnatomyScene {
  readonly torso: Torso;
  /**
   * La pared torácica por región (lus-sim, decisión 17: `organs/chestWall.ts`), la del hábito torácico del paciente; bajo el
   * reborde costal, la del abdomen del hábito (VExUS). Es `torso.chestWall`.
   */
  readonly chestWall: ChestWall;
  /** La parrilla costal (decisión 16): costillas, cartílagos, esternón y la tabla de alturas que sube a la GPU. */
  readonly ribCage: RibCage;
  /** Las 24 costillas de la parrilla: derechas 1–12 y después izquierdas 1–12 (cada una con su número y su lado). */
  readonly ribs: readonly RibSpec[];
  /**
   * Número anatómico de cada costilla de `ribs`, en el mismo orden. Las medidas buscan una costilla por su número y su
   * lado, nunca por su posición en la lista.
   */
  readonly ribNumbers: number[];
  readonly diaphragm: Diaphragm;
  /**
   * Bordes del pulmón y de la pleura frente a la parrilla (lus-sim, decisión 18: `organs/lungBorder.ts`): el borde del
   * pulmón en FRC, la reflexión pleural y la ZOA por columna de |u|. Es `torso.lungBorder`.
   */
  readonly lungBorder: LungBorder;
  /** El corazón y la ventana cardiaca (lus-sim, decisión 18: `organs/heart.ts`). */
  readonly heart: Heart;
  /**
   * Cota de la altura del diafragma (mm): el mayor de sus vértices, de su inserción y del borde del pulmón de la tabla. Más
   * arriba que ella más `LUNG_BD_CAP_MM` la clasificación no evalúa la cúpula (uCurtain.w en la GPU).
   */
  readonly domeTopZ: number;
  /**
   * La ley de altura del campo respiratorio (lus-sim, decisión 22): el tejido baja el descenso entero del diafragma hasta
   * `baseZ`, la cota de la cúpula (`domeTopZ`: la cúpula y todo lo que hay bajo ella bajan con ella), y en recta hasta 0 en
   * `topZ`, la altura del deslizamiento más arriba (`LungBorder.slideSpanMm`, decisión 19): el pulmón se expande con la
   * distancia a su vértice, que no baja. El pulmón sobre el corazón, que no respira, apenas baja: sin la ley, bajaba entero y
   * el campo se plegaba sobre el corazón con los 53 mm de la inspiración profunda.
   */
  readonly respiratoryHeight: { readonly baseZ: number; readonly topZ: number };
  readonly spine: Spine;
  /** El hígado bajo la cúpula derecha (lus-sim, decisión 37: `organs/liver.ts`, portado de VExUS y anclado a Gray). */
  readonly liver: LiverShape;
  /** El bazo bajo la cúpula izquierda (lus-sim, decisión 37: `organs/spleen.ts`). */
  readonly spleen: SpleenShape;
  /** El estómago bajo la cúpula izquierda, en el espacio de Traube (lus-sim, decisión 43: `organs/stomach.ts`). */
  readonly stomach: StomachShape;
  /** Los riñones, 0 el derecho (lus-sim, decisión 43: `organs/kidney.ts`, portado de VExUS y anclado a Gray, Morris y Xue). */
  readonly kidneys: readonly [Kidney, Kidney];
  /** El marco del retroperitoneo (lus-sim, decisión 43: `organs/retroperitoneum.ts`, portado de VExUS), el lecho del riñón. */
  readonly retro: RetroFrame;
  /** Las apófisis espinosas (lus-sim, decisión 29). */
  readonly spinous: SpinousSpec;
  /** Los vasos del hilio del bazo y de los riñones (lus-sim, decisión 46: `organs/vessels.ts`), con su esfera envolvente. */
  readonly vessels: readonly HilumVessel[];
  readonly vesselBounds: ReadonlyArray<{ center: Vec3; r: number }>;
  /**
   * La aireación subpleural del paciente en la tabla de la textura de escena (lus-sim, decisión 51: `organs/subpleural.ts`), de
   * la que salen las trampas de las líneas B. Cambia con el estado del paciente (`setLungAeration`): `version` sube en cada
   * cambio y el renderizador vuelve a subir la tabla.
   */
  readonly subpleural: { table: Float32Array; version: number };

  constructor(patient: PatientState, ribOptions: RibCageOptions = {}) {
    const fat = patient.habitus.subcutaneousFatMm;
    const muscle = patient.habitus.muscleMm;
    // Tronco 32 × 22,6 cm (`TORSO`, decisión 28; en VExUS, 32 × 21, el de un adulto de IMC 25 con la VCI a ≈ 12–13 cm del
    // xifoides: lus-sim no tiene VCI)
    // la grasa preperitoneal es la parte más honda del espesor muscular del hábito (decisión 62)
    const base: Torso = {
      a: TORSO.params.semiWidthMm.value,
      b: TORSO.params.semiDepthMm.value,
      zMin: -300,
      zMax: 300,
      skinMm: 2,
      fatMm: fat,
      muscleMm: muscle,
      preperitonealMm: preperitonealMm(fat),
    };
    // lus-sim (decisión 17): la pared del tórax por región y por hábito; las capas del hábito quedan como las del abdomen
    const chest = patient.habitus.chest ?? DEFAULT_CHEST_HABITUS;
    this.chestWall = buildChestWall(base, chest, RIBCAGE.params.pleuraComplexMm.value);
    const walled: Torso = { ...base, chestWall: this.chestWall };
    // Referencia craneocaudal: z = 0 en la unión xifoesternal, al nivel del disco T9–T10 (Gray; la punta del xifoides
    // a −30 mm, `anatomy.ribcage.xiphoidLengthMm`, decisión 16); el reborde costal es el de la parrilla (la medioclavicular
    // lo cruza en el 9.º cartílago, con su línea media a −90 mm).
    // Columna: cuerpo vertebral de 36 mm justo por detrás de cava y aorta (su cara
    // posterior queda a 42 mm de la piel dorsal); arco posterior con
    // apófisis transversas a cada lado (lus-sim, decisión 29: hasta 29,3 mm de la línea media, `anatomy.spine`; en VExUS, 40).
    // Las costillas terminan en ellas.
    // lus-sim (decisión 28): la columna va con la piel de la espalda (en VExUS, con b = 105: el cuerpo en −46, el arco de −78 a
    // −58)
    const back = -base.b;
    const SP = SPINE.params;
    this.spine = {
      kind: 'cylinderZ',
      x0: 0,
      y0: back + 59,
      r: 17,
      archHalfWidth: SP.transverseTipMm.value,
      archY0: back + 27,
      archY1: back + 47,
    };
    // lus-sim (decisión 29): las apófisis espinosas, de la cara posterior del arco a su punta bajo la piel; con la piel y la grasa
    // del hábito en la línea media posterior (la punta, en el avatar, 4,5 mm bajo ellas)
    const midline = wallLayersAt(this.chestWall, this.chestWall.stations.posteriorMidline, 80);
    const CW = CHEST_WALL.params;
    const tipDepth = SP.spinousTipDepthMm.value + midline.skin + midline.fat - CW.skinPosteriorMm.value - CW.fatPosteriorMm.value;
    this.spinous = { tipY: back + tipDepth, radius: SP.spinousRadiusMm.value };
    // La parrilla del adulto promedio (decisión 16): forra la cara interna de la pared de este hábito, con z = 0 en la
    // unión xifoesternal (el 7.º cartílago), al nivel del disco T9–T10 (Gray), y sus extremos posteriores en las
    // apófisis transversas de la columna
    const female = chest.sex === 'female';
    // la escápula (decisión 29), bajo la piel y la grasa de la espalda del hábito: las de la línea escapular, a media altura del
    // tórax
    const scapulaLayers = wallLayersAt(this.chestWall, skinArc(thoraxLinePhi('scapular', walled), walled), 80);
    this.ribCage = buildRibCage(walled, this.spine, {
      icsDeltaMm: female ? -RIBCAGE.params.femaleIcsNarrowingMm.value : 0,
      female,
      scapulaCoverMm: scapulaLayers.skin + scapulaLayers.fat,
      ...ribOptions,
    });
    this.ribs = this.ribCage.ribs;
    this.ribNumbers = this.ribs.map((r) => r.number);
    // las alturas de la pared: la axila alta y la baja en la axilar media, y el reborde costal por columna de |u|
    const cage = this.ribCage;
    const lam = ribLineArc(thoraxLinePhi('midaxillary', walled), walled, cage);
    setChestWallCage(
      this.chestWall,
      (n) => ribTableZ(cage, n - 1, lam),
      (au) => {
        let low: number | null = null;
        for (let k = 0; k < RIBS_PER_SIDE; k++) {
          const r = cage.ribs[k];
          if (au < r.uEnd || au > r.uPost) continue;
          const z = ribTableZ(cage, k, au) - r.halfWidth;
          low = low === null ? z : Math.min(low, z);
        }
        return low;
      },
      cage.sternum.zTip,
    );
    // lus-sim (decisión 18): los bordes del pulmón y de la pleura sobre la parrilla y la pared construidas; la cúpula baja
    // junto a la pared al borde del pulmón en FRC
    this.lungBorder = buildLungBorder(walled, cage, this.chestWall);
    // lus-sim (cobertura torácica): la cúpula pleural (`organs/lungApex.ts`), sobre la 1.ª costilla de cada columna; el vértice,
    // sobre el tercio medial de la clavícula (Gray), y bajando bajo el tercio medio hasta la 1.ª costilla
    const apex = lungApexColumns(
      { firstRibZ: (au) => ribTableZ(cage, 0, au), firstRibHalfWidth: cage.ribs[0].halfWidth },
      clavicleMedialTopZ(cage) + LUNG_APEX.params.apexAboveClavicleMm.value,
      cage.clavicle.u0 + (cage.clavicle.u1 - cage.clavicle.u0) / 3,
      cage.clavicle.u0 + (2 * (cage.clavicle.u1 - cage.clavicle.u0)) / 3,
      cage.sternum.zTop,
      cage.clavicle.u0,
      // detrás, la misma distancia a la línea media (delante de la columna)
      Math.abs(wallArc(torsoSkinPoint(-Math.acos(CLAVICLE.params.medialEndXMm.value / walled.a), 0, walled), walled)),
    );
    setChestWallApex(this.chestWall, apex.zApex, apex.zTop);
    // lus-sim (decisión 50): la fosa supraclavicular sobre la clavícula (`organs/supraclavicular.ts`)
    setChestWallFossa(this.chestWall, cage.clavicle, walled);
    // lus-sim (decisión 29): con la pared ya construida (la espalda alta, más gruesa), los extremos posteriores de las costillas
    // vuelven a la punta de las transversas más 6 mm
    setRibPosteriorEnds(cage, walled, this.spine.archHalfWidth + 6);
    // y la escápula, recortada por fuera hasta caber sobre las costillas (la pared adelgaza hacia la axila)
    fitScapula(cage, walled, female, scapulaLayers.skin + scapulaLayers.fat);
    this.torso = { ...walled, lungBorder: this.lungBorder };
    // Las cúpulas de VExUS: sus elipses van con la cara interna de la pared (decisión 17: con la pared torácica por región se
    // escalan con ella, al lado y delante); lus-sim (decisión 18): sus vértices, el de la base en FRC (la derecha en el 5.º
    // EIC anterior, la izquierda `leftDomeDropMm` más baja; en VExUS, 55 y 25 mm, T8–T9)
    const wall0 = base.skinMm + base.fatMm + base.muscleMm;
    const sx = (base.a - this.chestWall.total(this.chestWall.stations.midaxillary, 0)) / (base.a - wall0);
    const sy = (base.b - this.chestWall.total(0, 0)) / (base.b - wall0);
    const dome = (x0: number, y0: number, rx: number, ry: number, apex: number): Dome => ({
      kind: 'dome',
      x0: x0 * sx,
      y0: y0 * sy,
      rx: rx * sx,
      ry: ry * sy,
      apex,
    });
    const LB = LUNG_BORDER.params;
    const ics = LB.rightDomeIcs.value;
    const ps = ribLineArc(thoraxLinePhi('parasternal', walled), walled, cage);
    const rightApex = 0.5 * (ribTableZ(cage, ics - 1, ps) + ribTableZ(cage, ics, ps));
    this.diaphragm = {
      right: dome(-55, -5, 85, 92, rightApex),
      left: dome(70, -5, 70, 85, rightApex - LB.leftDomeDropMm.value),
      edgeZ: -50,
      edgeRise: 50,
    };
    // el corazón (decisión 18): su ápex donde lo pone Gray y la ventana cardiaca izquierda
    this.heart = buildHeart(this.torso, cage);
    // lus-sim (decisión 37): el hígado (la envolvente de VExUS con la escala de las cúpulas y el borde de Gray) y el bazo (la
    // 10.ª costilla izquierda, con el polo inferior en la axilar media)
    this.liver = buildLiver(this.torso, cage, this.spine, sx, sy, (u) => wallColumnTexel(this.chestWall, u)[2]);
    // lus-sim (decisión 43): los riñones, cuya grasa marca la impresión renal del hígado y del bazo
    this.kidneys = buildKidneys([kidneyCenterY(0, this.torso.a, this.torso.b), kidneyCenterY(1, this.torso.a, this.torso.b)]);
    this.retro = retroFrame(this.torso.b, [this.kidneys[0].center[1], this.kidneys[1].center[1]]);
    const lamLeft = wallArc(torsoSkinPoint(thoraxLinePhi('midaxillary', walled, 1), 0, walled), walled);
    // lus-sim (decisión 43): el bazo normal, en el sitio de la TC (a lo largo de la 11.ª costilla, dentro del reborde costal)
    this.spleen = buildSpleen(this.torso, cage, lamLeft, (u, z) => this.chestWall.total(u, z), this.lungBorder.rimFarMm);
    // lus-sim (decisión 43): el estómago, en el espacio de Traube (del lóbulo izquierdo al bazo, del pulmón al reborde costal)
    this.stomach = buildStomach(
      this.torso,
      cage,
      thoraxLinePhi('midclavicular', walled, 1),
      this.spleen.u0,
      (u, z) => this.chestWall.total(u, z),
      this.lungBorder.rimFarMm,
    );
    const d = this.diaphragm;
    this.domeTopZ = Math.max(d.right.apex, d.left.apex, d.edgeZ + d.edgeRise, this.lungBorder.zLMax);
    this.respiratoryHeight = { baseZ: this.domeTopZ, topZ: this.domeTopZ + this.lungBorder.slideSpanMm };
    // lus-sim (decisión 46): los vasos del hilio, anclados al hilio del bazo (que se busca con la clasificación, aún sin vasos),
    // al de cada riñón y a la columna
    this.vessels = [];
    this.vesselBounds = [];
    const hilum = this.spleenHilum();
    // lus-sim (decisión 50): y los subclavios, sobre la pleura de la cúpula y tras la clavícula (`organs/vessels.ts`)
    this.vessels = [
      ...buildHilumVessels(hilum.point, hilum.inward, this.kidneys, this.spine),
      ...buildSubclavianVessels(
        this.torso,
        cage.clavicle,
        (u, z) => this.chestWall.total(u, z),
        (u, z) => this.chestWall.layers(u, z).skin,
      ),
    ];
    // el margen pasa del tope de la distancia del «resto» (`BOWEL_BD_CAP_MM`, 5 mm): fuera de la esfera la pared queda más lejos
    this.vesselBounds = this.vessels.map((v) => tubeBoundingSphere(v.tube, v.wallMm + VESSEL_BOUND_MARGIN_MM));
    this.subpleural = { table: subpleuralTable(patient.lung), version: 0 };
  }

  /** Cambia la aireación subpleural (la del paciente, decisión 51); sin argumento, la normal. */
  setLungAeration(lung: LungAeration | undefined): void {
    this.subpleural.table = subpleuralTable(lung);
    this.subpleural.version++;
  }

  /**
   * El hilio del bazo (decisión 46): en la parte gástrica de su cara visceral (`gastricImpressionCenter`, sobre la mitad de
   * arriba), el punto donde la línea radial de la pared sale del bazo hacia dentro, y la dirección de vuelta hacia el bazo.
   */
  private spleenHilum(): { point: Vec3; inward: Vec3 } {
    const sp = this.spleen;
    const across = SPLEEN_GASTRIC_ACROSS * sp.radii[1];
    const u = sp.u0 - (across * sp.sin) / sp.arcScale;
    const z = sp.z0 + across * sp.cos;
    const isSpleen = (d: number) => this.classify(pointAtArc(u, z, d, this.torso), BASELINE_INSTANT).tissue === Tissue.Spleen;
    let last = -1;
    for (let d = 0; d < sp.maxSkinDepth + 20; d += 0.5) if (isSpleen(d)) last = d;
    if (last < 0) throw new Error('spleenHilum: la línea radial del hilio no cruza el bazo');
    let lo = last;
    let hi = last + 0.5;
    for (let i = 0; i < 30; i++) {
      const mid = 0.5 * (lo + hi);
      if (isSpleen(mid)) lo = mid;
      else hi = mid;
    }
    const point = pointAtArc(u, z, hi, this.torso);
    const back = pointAtArc(u, z, hi - 5, this.torso);
    const l = Math.hypot(back[0] - point[0], back[1] - point[1], back[2] - point[2]);
    return { point, inward: [(back[0] - point[0]) / l, (back[1] - point[1]) / l, (back[2] - point[2]) / l] };
  }

  /** Espesor total de la pared (mm, métrica radial) bajo el punto MATERIAL m (lus-sim, decisión 17: por región). */
  wallThicknessAt(m: Vec3): number {
    return wallTotalMm(m, this.torso);
  }

  /** Capas de la pared bajo la piel del ángulo del tronco φ a la altura z (la de la sonda apoyada ahí). */
  wallAtSkin(phi: number, z: number): WallLayersAt {
    const s = torsoSkinPoint(phi, z, this.torso);
    return wallLayers(this.torso, wallArc(s, this.torso), z);
  }

  /**
   * Profundidad (mm) de un punto MATERIAL bajo la cara interna de la pared: negativa en la pared, 0 en la
   * pleura parietal (gemelo GLSL `insideWallMm`). A0 busca en ella el cruce exacto de la pleura (decisión 61).
   */
  insideWallMm(m: Vec3): number {
    return -torsoDepth(m, this.torso) - wallTotalMm(m, this.torso);
  }

  /**
   * El punto MATERIAL es pulmón de la cortina (la lámina bajo la pared), no del tórax bajo la cúpula
   * (decisión 61; gemelo GLSL `inLungCurtain`). Solo tiene sentido donde `classify` da pulmón.
   */
  inLungCurtain(m: Vec3, instant: SceneInstant): boolean {
    return inLungCurtain(m, this.insideWallMm(m), lungEdgeZ(this.lungBorder, wallArc(m, this.torso), instant.diaphragmCaudalMm));
  }

  /**
   * El punto MATERIAL, si `classify` da pulmón, toca la pared en el receso (la cortina o el tórax por encima de
   * la inserción del diafragma): ahí empieza la pleura parietal (decisión 61; gemelo GLSL `inLungRecess`).
   */
  inLungRecess(m: Vec3): boolean {
    return inLungRecess(m, this.insideWallMm(m));
  }

  /**
   * Distancia (mm) de un punto MATERIAL de la cara interna de la pared al borde caudal del pulmón que la toca: z − el borde
   * de su columna con el descenso del diafragma (gemelo GLSL `lungCurtainEdgeMm`, decisión 61); lus-sim (decisión 18): en
   * los dos hemitórax, −1e3 en la ventana cardiaca (el corazón toca ahí la pared).
   */
  lungEdgeMm(m: Vec3, instant: SceneInstant): number | null {
    if (heartAtWall(this.heart, m, this.torso)) return -1e3;
    return lungCurtainEdgeMm(m, lungEdgeZ(this.lungBorder, wallArc(m, this.torso), instant.diaphragmCaudalMm));
  }

  /**
   * Peso del campo de desplazamiento respiratorio en un punto material: 1 en
   * las vísceras, 0 en pared, costillas y columna (B.4, [EXTRAPOLACIÓN PROPIA]). lus-sim (decisión 22): y por encima de la
   * cúpula más alta, la ley de altura (`respiratoryHeight`).
   */
  respiratoryWeight(m: Vec3): number {
    return this.respiratoryWeightAt(this.respiratoryColumn(m[0], m[1]), m[2]);
  }

  /**
   * Lo que el peso respiratorio no cambia a lo largo de la vertical de (x, y) (lus-sim, decisión 22: el campo es vertical, y
   * su inversa, una búsqueda en z): la profundidad bajo la piel, la columna de la tabla de la pared y el peso de la columna
   * vertebral (gemelo GLSL `respColumn`).
   */
  respiratoryColumn(x: number, y: number): RespiratoryColumn {
    const p: Vec3 = [x, y, 0];
    const dSpine = Math.hypot(x - this.spine.x0, y - this.spine.y0);
    const wall = wallColumnTexel(this.chestWall, wallArc(p, this.torso));
    return {
      x,
      y,
      depth: torsoDepth(p, this.torso),
      wall,
      wallBlendMm: respiratoryWallBlendMm(this.chestWall, wall),
      spine: smoothstep(this.spine.r + 5, this.spine.r + 35, dSpine),
    };
  }

  /** Peso respiratorio en (x, y, z) de la vertical `c` (gemelo GLSL `respWeightAt`). */
  respiratoryWeightAt(c: RespiratoryColumn, z: number): number {
    if (c.spine === 0) return 0;
    // la pared que mira el campo (decisión 22): nunca más fina que la de verdad, y sin engrosar hacia abajo más deprisa que
    // `anatomy.respiratoryWall.slopeMax` (el paso al abdomen bajo el reborde costal, alargado)
    const wWall = smoothstep(0, 25, -c.depth - respiratoryWallOf(this.chestWall, c.wall, c.wallBlendMm, z));
    // lus-sim (decisión 18): el corazón y su ventana no respiran (sin cizalla entre el tapón pegado a la pared y el corazón)
    const wHeart = heartStillWeight(this.heart, [c.x, c.y, z]);
    // lus-sim (decisión 22): el pulmón se expande con la distancia a su vértice
    const h = this.respiratoryHeight;
    const wHeight = Math.min(1, Math.max(0, (h.topZ - z) / (h.topZ - h.baseZ)));
    return wWall * c.spine * wHeart * wHeight;
  }

  /**
   * Clasifica un punto MATERIAL. `instant` aporta lo que dicta la fisiología en este instante (el descenso
   * del diafragma, que baja la cortina). Orden de prioridad (el primero que contiene el punto gana):
   * pared → costillas → columna → cortina pulmonar → tórax/diafragma → el «resto» bajo el diafragma. Cada
   * paso es un método propio; el mismo orden vivirá en GLSL (`classifyWith`, paso B).
   *
   * `withCurtain = false` es la variante sin la cortina pulmonar (decisión 61): lo que hay detrás de la
   * lámina de pulmón, igual que `classify` en todos los demás puntos. La usan el tejido que se ve en
   * parte a través del borde blando de la cortina y su transmisión (gemelo GLSL `classifyWith(m, false)`).
   * La clasificación sigue siendo binaria: la fracción de aire del haz es de la imagen, no de la anatomía.
   */
  classify(m: Vec3, instant: SceneInstant, withCurtain = true): Classification {
    const torso = this.torso;
    const depth = torsoDepth(m, torso);
    if (m[2] < torso.zMin || m[2] > torso.zMax || depth > 0) return NONE;
    const wall = this.classifyWall(m, -depth, instant.diaphragmCaudalMm);
    if (wall.final) return wall.cls;
    const inside = -depth - wall.wallMm;
    const caudal = instant.diaphragmCaudalMm;
    const u = wallArc(m, torso);
    // lus-sim (decisión 18): el corazón y el tapón de la ventana cardiaca, sobre la cúpula (se apoya en ella); lo de fuera
    // cuenta su cara en la distancia a la frontera. Decisión 49: el corazón de EchoTwin, y el tapón y la franja de grasa
    const heart = heartQuery(this.heart, m, inside, u, instant.heartPhase ?? 0);
    // la lámina de la cortina gana al corazón fuera del disco de la ventana (decisión 49): el borde fino del pulmón sobre él, y la
    // pleura que A0 registra fuera de la ventana tiene pulmón debajo
    const curtain = withCurtain ? this.classifyLungCurtain(m, inside, u, caudal) : null;
    const sheet = curtain !== null && heartWindowDistance(this.heart, u, m[2]) >= 0;
    if (heart.tissue !== -1 && !sheet) {
      const dHeartDome = sdDiaphragm(m, this.diaphragm, torso);
      if (dHeartDome < 0) return { ...NONE, tissue: heart.tissue, boundaryDistance: Math.min(heart.d, -dHeartDome) };
    }
    // bajo la cúpula (o bajo la lámina), lo que el corazón tendría ahí es de otro: su distancia a la frontera, 0
    const clearance = heart.tissue !== -1 ? 0 : heart.clear;
    if (curtain) return { ...curtain, boundaryDistance: Math.min(curtain.boundaryDistance, clearance) };
    // la zona de aposición (decisión 18): bajo el borde del pulmón en FRC, el diafragma contra la pared; su mitad de dentro
    // dibuja la cara abdominal, con la normal de la pared
    const zoa = zoaDistance(this.lungBorder, m, inside, u, caudal);
    if (zoa !== null) {
      const t = zoaThicknessMm(caudal);
      const face = inside > 0.5 * t ? { interface: Interface.DiaphragmLiver, interfaceDistance: t - inside } : {};
      return { ...NONE, tissue: Tissue.Diaphragm, boundaryDistance: Math.min(zoa, clearance), ...face };
    }
    // por encima de la cúpula más alta más el tope de la distancia del pulmón, pulmón sin evaluarla (su distancia pasa del
    // tope: la cúpula es una altura, y su pendiente ≥ 1 solo acorta la distancia)
    if (m[2] > this.domeTopZ + LUNG_BD_CAP_MM)
      return { ...NONE, tissue: Tissue.Lung, boundaryDistance: Math.min(LUNG_BD_CAP_MM, clearance) };
    const dDome = sdDiaphragm(m, this.diaphragm, this.torso);
    if (dDome < 0) return { ...NONE, tissue: Tissue.Lung, boundaryDistance: Math.min(-dDome, LUNG_BD_CAP_MM, clearance) };
    if (dDome < DIAPHRAGM_THICKNESS_MM) {
      // la mitad abdominal dibuja la cara hepática; la pleural la dibuja el espejo exacto de la pasada A
      const liverFace = dDome > 0.5 * DIAPHRAGM_THICKNESS_MM;
      return {
        ...NONE,
        tissue: Tissue.Diaphragm,
        boundaryDistance: Math.min(dDome, DIAPHRAGM_THICKNESS_MM - dDome),
        ...(liverFace ? { interface: Interface.DiaphragmLiver, interfaceDistance: DIAPHRAGM_THICKNESS_MM - dDome } : {}),
      };
    }
    // lus-sim (decisión 46): los vasos del hilio ganan a los órganos (entran en el bazo y en el seno del riñón); fuera de ellos,
    // la distancia a su pared cuenta en la de los órganos y el «resto»
    const tubes = this.classifyTubes(m, 0, HILUM_VESSEL_COUNT);
    if (tubes.cls) return tubes.cls;
    // lus-sim (decisión 37): bajo el diafragma, el hígado y el bazo
    const gap = zoaGap(this.lungBorder, m, inside, u, caudal);
    const organ = this.classifyOrgans(m, dDome - DIAPHRAGM_THICKNESS_MM, inside, u, gap);
    if (organ.cls) return { ...organ.cls, boundaryDistance: Math.min(organ.cls.boundaryDistance, tubes.dOut) };
    // Bajo el diafragma, fuera de los órganos, el «resto» (decisión 10, `abdomen-generic-tissue`): el tejido por defecto de la
    // clasificación de VExUS. Su distancia a la frontera es la de las interfaces que ganan antes (el diafragma, la pared, los
    // órganos), con el tope de VExUS: con 5 mm fijos el gate volumétrico daba por interior un punto pegado al diafragma que
    // float32 clasificaba al otro lado (CI de #39 de VExUS). Detrás del peritoneo parietal posterior, el retroperitoneo (lus-sim,
    // decisión 43; decisión 81 de VExUS): psoas, cuadrado lumbar y grasa; su distancia cuenta también la columna, que se
    // clasifica antes (el psoas la bordea)
    const bd = Math.min(BOWEL_BD_CAP_MM, dDome - DIAPHRAGM_THICKNESS_MM, inside, gap, clearance, organ.dOut);
    const [tissue, dRetro] = retroperitoneum(m, inside, organ.perirenal, this.retro);
    return { ...NONE, tissue, boundaryDistance: Math.max(0, Math.min(bd, dRetro, organ.spine, tubes.dOut)) };
  }

  /** El vaso del hilio de menor distancia a su luz en m (dentro de su esfera envolvente), o null. */
  private nearestVessel(m: Vec3): { v: HilumVessel; hit: TubeHit } | null {
    let best: { v: HilumVessel; hit: TubeHit } | null = null;
    for (let i = 0; i < this.vessels.length; i++) {
      const b = this.vesselBounds[i];
      if (Math.hypot(m[0] - b.center[0], m[1] - b.center[1], m[2] - b.center[2]) > b.r) continue;
      const hit = tubeQuery(m, this.vessels[i].tube);
      if (!best || hit.d < best.hit.d) best = { v: this.vessels[i], hit };
    }
    return best;
  }

  /**
   * Los vasos del hilio (decisión 46; `classifyTubes` de VExUS sin los conductos ni el Doppler; gemelo GLSL en `classifyWith`):
   * el tubo cuya pared o luz contiene el punto (el de menor distancia a su luz), con la sangre dentro y su pared fuera, y la cara
   * de su luz a |d|. `dOut`: la distancia a la cara externa de su pared, el menor de los tubos cercanos (1e3 lejos de todos). t0, t1:
   * el tramo de la tabla (los del hilio bajo el diafragma; los subclavios en la pared, decisión 50).
   */
  private classifyTubes(m: Vec3, t0: number, t1: number): { cls: Classification | null; dOut: number } {
    let best: { v: HilumVessel; hit: TubeHit } | null = null;
    let dOut = 1e3;
    for (let i = t0; i < Math.min(t1, this.vessels.length); i++) {
      const b = this.vesselBounds[i];
      // fuera de la esfera, su pared queda al menos a lo que la esfera tiene de margen sobre ella (decisión 50; gemelo GLSL)
      const ds = Math.hypot(m[0] - b.center[0], m[1] - b.center[1], m[2] - b.center[2]);
      if (ds > b.r) {
        dOut = Math.min(dOut, ds - b.r + VESSEL_BOUND_MARGIN_MM);
        continue;
      }
      const v = this.vessels[i];
      const hit = tubeQuery(m, v.tube);
      dOut = Math.min(dOut, hit.d - v.wallMm);
      if (hit.d < v.wallMm && (!best || hit.d < best.hit.d)) best = { v, hit };
    }
    if (!best) return { cls: null, dOut };
    const { v, hit } = best;
    const face = { interface: v.lumenInterface, interfaceDistance: Math.abs(hit.d) };
    if (hit.d < 0) return { cls: { ...NONE, tissue: Tissue.Blood, boundaryDistance: -hit.d, vesselHit: hit, ...face }, dOut };
    return {
      cls: { ...NONE, tissue: v.wallTissue, boundaryDistance: Math.min(hit.d, v.wallMm - hit.d), vesselHit: hit, ...face },
      dOut,
    };
  }

  /**
   * El hígado y el bazo bajo el diafragma (lus-sim, decisión 37; gemelo GLSL en `classifyWith`), recortados arriba por la cúpula
   * (`dDia`, la distancia a la cara abdominal del diafragma) y fuera por la pared o la lámina de la ZOA (`min(inside, gap)`).
   * Como en VExUS (`classifyLiver`), la cápsula es la lámina de `LIVER_CAPSULE_MM` junto al borde, y dibuja su cara salvo donde
   * la manda el diafragma (su cara es la del diafragma, la de la cúpula o la de la ZOA). El bazo, igual, con su cápsula como cara
   * del propio bazo (sin tejido aparte). Antes, los riñones (decisión 43, `classifyKidneys`): su grasa gana a la impresión renal
   * del hígado y del bazo, que la solapa. `dOut`: la distancia a todos (positiva fuera) para el «resto».
   */
  private classifyOrgans(
    m: Vec3,
    dDia: number,
    inside: number,
    u: number,
    gap: number,
  ): { cls: Classification | null; dOut: number; perirenal: number; spine: number } {
    const wallSide = Math.min(inside, gap);
    // la distancia a la frontera: la de la columna (el hígado la bordea por detrás) y la de los órganos, cuya distancia es una
    // aproximación (mínimos y máximos suaves, coordenadas de la pared) que puede pasarse: por `ORGAN_SDF_LIPSCHITZ`
    const spine = Math.min(spinousSd(m, this.spine, this.spinous), sdSpine(m, this.spine));
    const kidney = this.classifyKidneys(m);
    if (kidney.cls) {
      const bd = Math.min(kidney.cls.boundaryDistance * ORGAN_SDF_LIPSCHITZ, dDia * ORGAN_SDF_LIPSCHITZ, wallSide, spine);
      return { cls: { ...kidney.cls, boundaryDistance: bd }, dOut: 0, perirenal: kidney.perirenal, spine };
    }
    const perirenal = kidney.perirenal;
    // lejos de los lóbulos y de donde puede estar el bazo, sin más cuentas (la GPU se ahorra la columna de la pared del punto)
    const lobes = liverLobesSd(m, this.liver);
    const skin = -torsoDepth(m, this.torso);
    const spleenNear = spleenCandidate(m, skin, this.spleen);
    const stomachNear = stomachCandidate(m, skin, this.stomach);
    if (lobes > LIVER_EARLY_OUT_MM && !spleenNear && !stomachNear)
      return { cls: null, dOut: Math.min(lobes, perirenal) * ORGAN_SDF_LIPSCHITZ, perirenal, spine };
    // la impresión renal, solo si la usan el hígado (cerca de sus lóbulos) o el bazo; el estómago no la usa
    const renal = lobes <= LIVER_EARLY_OUT_MM || spleenNear ? renalImpression(m, this.kidneys, perirenal) : 1e3;
    const dLiver = liverSdf(m, u, inside, wallColumnTexel(this.chestWall, u)[2], this.liver, renal);
    // la grasa perirrenal, que se clasifica antes, ocupa el solape de la impresión renal
    const fat = perirenal * ORGAN_SDF_LIPSCHITZ;
    if (dLiver < 0) {
      const inner = Math.min(-dLiver, dDia, wallSide);
      const bd = Math.min(-dLiver * ORGAN_SDF_LIPSCHITZ, dDia * ORGAN_SDF_LIPSCHITZ, wallSide, spine, fat);
      if (inner < LIVER_CAPSULE_MM) {
        // `Math.min` devuelve uno de sus argumentos: la igualdad con la cara del diafragma o de la ZOA es exacta
        const other = inner === dDia || (inner === gap && gap < inside);
        const face = other ? {} : { interface: Interface.LiverCapsule, interfaceDistance: inner };
        return { cls: { ...NONE, tissue: Tissue.LiverCapsule, boundaryDistance: bd, ...face }, dOut: 0, perirenal, spine };
      }
      return { cls: { ...NONE, tissue: Tissue.Liver, boundaryDistance: bd }, dOut: 0, perirenal, spine };
    }
    const dSpleen = spleenNear ? spleenSdf(m, u, Math.min(dDia, wallSide), skin, inside, this.spleen, renal) : 1e3;
    if (dSpleen < 0) {
      const inner = Math.min(-dSpleen, dDia, wallSide);
      const other = inner === dDia || (inner === gap && gap < inside);
      const face = inner < SPLEEN.params.capsuleMm.value && !other ? { interface: Interface.SpleenCapsule, interfaceDistance: inner } : {};
      return {
        cls: {
          ...NONE,
          tissue: Tissue.Spleen,
          boundaryDistance: Math.min(-dSpleen * ORGAN_SDF_LIPSCHITZ, dDia * ORGAN_SDF_LIPSCHITZ, wallSide, spine, fat),
          ...face,
        },
        dOut: 0,
        perirenal,
        spine,
      };
    }
    // lus-sim (decisión 43): el estómago, tras el bazo (que lo recorta): la pared gástrica (el tejido del «resto», el intestino de
    // VExUS) a `wallMm` de su borde (el suyo, el del diafragma o el de la pared) y, dentro, la luz: gas sobre su nivel (supino) y
    // líquido debajo
    const below = Math.min(dDia, wallSide);
    const dStomach = stomachNear ? stomachSdf(m, u, below, skin, this.stomach) : 1e3;
    if (dStomach < 0) {
      // su borde: el suyo, el del diafragma, el de la pared y el del hígado o el bazo que lo recortan (su pared sigue ahí)
      const inner = Math.min(-dStomach, dDia, wallSide, dLiver, dSpleen);
      const W = STOMACH.params.wallMm.value;
      if (inner < W) {
        const bd = Math.min(Math.min(inner, W - inner) * ORGAN_SDF_LIPSCHITZ, spine, fat);
        return { cls: { ...NONE, tissue: Tissue.Bowel, boundaryDistance: bd }, dOut: 0, perirenal, spine };
      }
      const level = m[1] - this.stomach.gasY;
      const bd = Math.min((inner - W) * ORGAN_SDF_LIPSCHITZ, Math.abs(level), spine, fat);
      return { cls: { ...NONE, tissue: level > 0 ? Tissue.BowelGas : Tissue.Fluid, boundaryDistance: bd }, dOut: 0, perirenal, spine };
    }
    return { cls: null, dOut: Math.min(dLiver, dSpleen, dStomach, perirenal) * ORGAN_SDF_LIPSCHITZ, perirenal, spine };
  }

  /**
   * Los riñones (lus-sim, decisión 43; `classifyKidneys` de VExUS; gemelo GLSL en `classifyKidneys`): la cápsula, la corteza, las
   * pirámides, el seno y la pelvis, y la grasa perirrenal de grosor variable. La cápsula dibuja la cara del contorno
   * (`Interface.RenalCapsule`) por los dos lados: desde la cápsula y desde la grasa fina o la mitad interna de la gruesa. La
   * mitad externa de la gruesa se funde sin línea: lus-sim no tiene la cara de Morison de VExUS (su cara la dibuja la cápsula
   * del hígado o del bazo, que apoya en ella). `boundaryDistance`, la del riñón (la clasificación la acota con el diafragma, la
   * pared y la columna); `perirenal`, `perirenalDistance` si ninguno contiene el punto.
   */
  private classifyKidneys(m: Vec3): { cls: Classification | null; perirenal: number } {
    let perirenal = 1e3;
    for (const k of this.kidneys) {
      const dc = Math.hypot(m[0] - k.center[0], m[1] - k.center[1], m[2] - k.center[2]);
      if (dc > KIDNEY_REACH_MM + KIDNEY_NEAR_MARGIN_MM) {
        perirenal = Math.min(perirenal, perirenalFar(m, k));
        continue;
      }
      const kh = kidneyQuery(m, k);
      const q = kidneyLocal(m, k);
      const fat = perirenalThicknessMm(q, k);
      perirenal = Math.min(perirenal, perirenalBlend(kh.dOuter - fat, q, dc));
      if (kh.dOuter < 0) {
        if (-kh.dOuter < RENAL_CAPSULE_MM) {
          const cls: Classification = {
            ...NONE,
            tissue: Tissue.RenalCapsule,
            boundaryDistance: Math.min(-kh.dOuter, RENAL_CAPSULE_MM + kh.dOuter),
            interface: Interface.RenalCapsule,
            interfaceDistance: -kh.dOuter,
          };
          return { cls, perirenal };
        }
        const tissue =
          kh.region === 'pelvis'
            ? Tissue.RenalPelvis
            : kh.region === 'sinus'
              ? Tissue.RenalSinus
              : kh.region === 'medulla'
                ? Tissue.RenalMedulla
                : Tissue.RenalCortex;
        // la distancia a la frontera, también la de la cápsula (`RENAL_CAPSULE_MM` bajo el contorno)
        return { cls: { ...NONE, tissue, boundaryDistance: Math.min(kh.inner, -kh.dOuter - RENAL_CAPSULE_MM) }, perirenal };
      }
      if (kh.dOuter < fat) {
        const face = kh.dOuter <= 0.5 * fat || fat <= PERIRENAL.faceMaxMm;
        const cls: Classification = {
          ...NONE,
          tissue: Tissue.PerirenalFat,
          boundaryDistance: Math.min(kh.dOuter, fat - kh.dOuter),
          ...(face ? { interface: Interface.RenalCapsule, interfaceDistance: kh.dOuter } : {}),
        };
        return { cls, perirenal };
      }
    }
    return { cls: null, perirenal };
  }

  /**
   * ¿Está el punto MATERIAL dentro del estómago (lus-sim, decisión 43)? Su medio elipsoide, con la profundidad bajo el diafragma
   * de `classifyOrgans` (nunca por fuera de la cara abdominal del diafragma o de la pared); lo que lo recorta (el hígado, el bazo,
   * la cúpula, la pared) se clasifica antes. Solo cobertura y pruebas.
   */
  inStomach(m: Vec3, instant: SceneInstant): boolean {
    const skin = -torsoDepth(m, this.torso);
    if (!stomachCandidate(m, skin, this.stomach)) return false;
    const u = wallArc(m, this.torso);
    const inside = this.insideWallMm(m);
    const wallSide = Math.min(inside, zoaGap(this.lungBorder, m, inside, u, instant.diaphragmCaudalMm));
    const dDia = sdDiaphragm(m, this.diaphragm, this.torso) - DIAPHRAGM_THICKNESS_MM;
    // sobre la cara abdominal del diafragma o de la pared no hay estómago (su medio elipsoide sigue por fuera)
    const below = Math.min(dDia, wallSide);
    return below >= 0 && stomachSdf(m, u, below, skin, this.stomach) < 0;
  }

  /**
   * Distancia con signo (mm) de un punto MATERIAL a una cara geométrica, positiva fuera de lo que la
   * cara encierra (el abdomen bajo la cúpula). Es la misma cantidad que decide la clasificación en esa
   * cara, así que su gradiente es la normal de la interfaz:
   *  - `dome`: `sdDiaphragm`.
   * Solo banco de fidelidad y pruebas: la clasificación no la llama.
   */
  faceSdf(m: Vec3, instant: SceneInstant, face: FaceGeometry): number | null {
    switch (face) {
      case 'dome':
        return sdDiaphragm(m, this.diaphragm, this.torso);
      case 'zoa':
        return this.insideWallMm(m) - zoaThicknessMm(instant.diaphragmCaudalMm);
      case 'kidneyOuter': {
        const k = this.kidneys[m[0] < 0 ? 0 : 1];
        return kidneyOuterSdf(kidneyLocal(m, k), k);
      }
      case 'liverSurface':
      case 'spleenSurface': {
        // −min(−dÓrgano, dDia, pared): la distancia que decide la clasificación en la cápsula (`classifyOrgans`)
        const u = wallArc(m, this.torso);
        const inside = this.insideWallMm(m);
        const caudal = instant.diaphragmCaudalMm;
        const wallSide = Math.min(inside, zoaGap(this.lungBorder, m, inside, u, caudal));
        const dDia = sdDiaphragm(m, this.diaphragm, this.torso) - DIAPHRAGM_THICKNESS_MM;
        const renal = renalImpression(m, this.kidneys, perirenalDistance(m, this.kidneys));
        const d =
          face === 'liverSurface'
            ? liverSdf(m, u, inside, wallColumnTexel(this.chestWall, u)[2], this.liver, renal)
            : spleenSdf(m, u, Math.min(dDia, wallSide), -torsoDepth(m, this.torso), inside, this.spleen, renal);
        return -Math.min(-d, dDia, wallSide);
      }
    }
  }

  /**
   * Gradiente de la distancia de la cara que dibuja un punto MATERIAL (gemelo de `faceGradient` en la
   * GLSL, decisión 57), o null si el punto no dibuja ninguna. Diferencias centrales de paso
   * `FACE_GRADIENT_EPS_MM` de la distancia de su cara (la de su capa o su costilla, o `faceSdf`), como la
   * GPU. El eco de interfaz divide `interfaceDistance` por su norma: así el perfil, muestreado a lo largo
   * del rayo, integra 1 aunque la distancia de la cara no sea euclídea (la cúpula lejos de la pleura).
   * `face` fuerza la geometría (la GPU la elige por tejido, también donde no hay cara: la e2e de normales).
   * Solo pruebas: la clasificación no la llama.
   */
  faceGradient(m: Vec3, instant: SceneInstant, face?: FaceGeometry | null): FaceGradient | null {
    if (face === undefined) {
      // las caras de la pared y de las costillas (decisión 62) no tienen geometría de faceSdf
      const iface = this.classify(m, instant).interface;
      if (isWallLayerInterface(iface))
        return this.numericGradient(m, (p) => wallFaceSd(p, iface, this.torso, instant.diaphragmCaudalMm), 0);
      if (isRibInterface(iface)) {
        const k = faceRib(m, this.torso, this.ribCage);
        const g = this.numericGradient(m, (p) => ribSd(p, k, this.torso, this.ribCage), ribCurvature(m, k, this.torso, this.ribCage));
        return { ...g, axis: ribTangent(m, k, this.torso, this.ribCage) };
      }
      // los vasos del hilio (decisión 46): el gradiente analítico de su tubo (`tubeFaceGradient`, el de la GPU en `Cls.n`)
      if (iface === Interface.VeinLumen || iface === Interface.ArteryLumen) {
        const v = this.nearestVessel(m);
        if (v) {
          const { gradient, curvature } = tubeFaceGradient(m, v.v.tube, 1, v.hit);
          const l = Math.hypot(gradient[0], gradient[1], gradient[2]);
          return { normal: [gradient[0] / l, gradient[1] / l, gradient[2] / l], norm: l, curvature };
        }
      }
      face = faceGeometryOf(iface);
      // la cara abdominal del diafragma en la ZOA (decisión 18) es la de su lámina, no la de la cúpula
      if (face === 'dome' && this.inZoa(m, instant)) face = 'zoa';
    }
    if (face === null) return null;
    const geometry = face;
    return this.numericGradient(m, (p) => this.faceSdf(p, instant, geometry)!, 0);
  }

  /** Gradiente por diferencias centrales de paso `FACE_GRADIENT_EPS_MM` (el de la GPU) de una distancia. */
  private numericGradient(m: Vec3, sd: (p: Vec3) => number, curvature: number): FaceGradient {
    const h = FACE_GRADIENT_EPS_MM;
    const g: Vec3 = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const plus: Vec3 = [m[0], m[1], m[2]];
      const minus: Vec3 = [m[0], m[1], m[2]];
      plus[a] += h;
      minus[a] -= h;
      g[a] = sd(plus) - sd(minus);
    }
    const l = Math.hypot(g[0], g[1], g[2]);
    if (l === 0) return { normal: [0, 1, 0], norm: 1, curvature };
    return { normal: [g[0] / l, g[1] / l, g[2] / l], norm: l / (2 * h), curvature };
  }

  /**
   * Capas parietales y parrilla costal (decisión 62, módulo `organs/wall`; la parrilla, decisión 16, `organs/ribcage`).
   * `final` = el punto está en piel, grasa subcutánea, costilla, cartílago, esternón, músculo, grasa preperitoneal o
   * columna (no hay nada más que mirar); si no, devuelve el espesor total de la pared (lo que queda debajo empieza ahí).
   * Cada muestra de las capas dibuja la cara de la capa más cercana (`wallFace`); junto al hueso (una costilla ósea o el
   * esternón), su cortical; el cartílago, su pericondrio. El hueso no dibuja cara (su cortical la dibuja el tejido blando
   * de fuera).
   */
  private classifyWall(m: Vec3, d: number, caudalMm: number): { final: true; cls: Classification } | { final: false; wallMm: number } {
    const torso = this.torso;
    // lus-sim (decisión 17): la pared por región, en el (u, z) de la muestra; sus capas, solo dentro de ella
    const u = wallArc(m, torso);
    const wall = torso.chestWall ? torso.chestWall.total(u, m[2]) : torso.skinMm + torso.fatMm + torso.muscleMm;
    const L = d < wall ? wallLayers(torso, u, m[2]) : null;
    const skin = L ? L.skin : 0;
    // lus-sim (decisión 29): la distancia a la columna, con las apófisis espinosas (la pared de la espalda, 28–35 mm, cruza las
    // espinosas y la cara posterior del arco, a 27 mm)
    const spine = Math.min(spinousSd(m, this.spine, this.spinous), sdSpine(m, this.spine));
    // la cara de la capa más cercana; la distancia a la frontera cuenta el hueso o cartílago más cercano (|∇| ≤ 1,1)
    // lus-sim (decisión 50): los vasos subclavios, en la pared sobre la clavícula; fuera de ellos, la distancia a su pared
    const sub =
      d < wall && m[2] > this.chestWall.fossaMinZ - SUBCLAVIAN_GATE_MM
        ? this.classifyTubes(m, HILUM_VESSEL_COUNT, VESSEL_TABLE_COUNT)
        : { cls: null, dOut: 1e3 };
    const layer = (tissue: Tissue, bd: number, ribD: number, ribAny: number): { final: true; cls: Classification } => {
      const [face, dist] = wallFace(d, u, m[2], ribD, torso, caudalMm);
      // lus-sim (cobertura torácica): sobre la cúpula pleural, la cota vertical (`wallCupolaBd`)
      const boundaryDistance = Math.min(bd, ribAny / 1.1, spine, wallCupolaBd(this.chestWall, u, m[2]), sub.dOut);
      return { final: true, cls: { ...NONE, tissue, boundaryDistance, interface: face, interfaceDistance: dist } };
    };
    // (la piel, sin la distancia a los vasos subclavios: ninguno sube hasta ella; gemelo GLSL)
    if (d < skin) {
      const [face, dist] = wallFace(d, u, m[2], 1e3, torso, caudalMm);
      const boundaryDistance = Math.min(skin - d, 1e3 / 1.1, spine, wallCupolaBd(this.chestWall, u, m[2]));
      return { final: true, cls: { ...NONE, tissue: Tissue.Skin, boundaryDistance, interface: face, interfaceDistance: dist } };
    }
    // La parrilla, antes de la grasa subcutánea donde puede llegar (la grasa no la corta): el esternón y las costillas del
    // lado de la muestra; el hueso más cercano da la cortical, el cartílago su pericondrio (bajo la pared, `ribScan` no
    // mira nada)
    const scan = ribScan(m, d, u, torso, this.ribCage, wall);
    if (scan.inside >= 0) {
      const face = scan.cartilage ? { interface: Interface.Perichondrium, interfaceDistance: -scan.inD } : {};
      return {
        final: true,
        cls: { ...NONE, tissue: scan.cartilage ? Tissue.Cartilage : Tissue.Bone, boundaryDistance: Math.min(-scan.inD, sub.dOut), ...face },
      };
    }
    // lus-sim (decisión 29): la columna dentro de la pared de la espalda (las espinosas y la cara posterior del arco)
    if (spine < 0) return { final: true, cls: { ...NONE, tissue: Tissue.Vertebra, boundaryDistance: -spine } };
    if (sub.cls) return { final: true, cls: sub.cls };
    // lus-sim (cobertura torácica): sobre el techo de la cúpula pleural, más hondo que la pared del tórax, las partes blandas
    // del cuello y del hombro: músculo sin caras (las de la pared quedarían más allá del centro del tronco)
    // (decisión 50) desde la pared del tórax sin la depresión de la fosa: lo que hay encima son las capas del cuello
    const cup = wallCupolaMm(this.chestWall, u, m[2]);
    const roofTop = wall - cup + wallFossaMm(this.chestWall, u, m[2]);
    if (cup >= CUPOLA_CAP_MM && d < wall && d >= roofTop) {
      // (decisión 44) y el techo de la cúpula, horizontal en zTop desde la profundidad D de su ladera
      const roof = wallCupolaRoofBd(this.chestWall, u, m[2], d - roofTop);
      const bd = Math.min(d - roofTop, scan.ribAny / 1.1, spine, wallCupolaBd(this.chestWall, u, m[2]), roof, sub.dOut);
      return { final: true, cls: { ...NONE, tissue: Tissue.Muscle, boundaryDistance: bd } };
    }
    if (d >= wall) {
      const dSpine = spine;
      if (dSpine < 0) return { final: true, cls: { ...NONE, tissue: Tissue.Vertebra, boundaryDistance: -dSpine } };
      return { final: false, wallMm: wall };
    }
    // las capas de la pared: fascia profunda y transversalis onduladas en (u, z)
    const w = wallDepths(torso, u, m[2], L!);
    if (d < w.fascia) return layer(Tissue.Fat, Math.min(d - skin, w.fascia - d), scan.ribD, scan.ribAny);
    if (d < w.transversalis) return layer(Tissue.Muscle, Math.min(d - w.fascia, w.transversalis - d), scan.ribD, scan.ribAny);
    // grasa preperitoneal (extraperitoneal) entre la transversalis y el peritoneo parietal; en el tórax, el complejo pleura +
    // fascia endotorácica (decisión 17)
    return layer(Tissue.Fat, Math.min(d - w.transversalis, wall - d), scan.ribD, scan.ribAny);
  }

  /** El punto MATERIAL es de la lámina del diafragma de la zona de aposición (decisión 18): la clasificación lo da así. */
  inZoa(m: Vec3, instant: SceneInstant): boolean {
    const c = this.classify(m, instant);
    if (c.tissue !== Tissue.Diaphragm) return false;
    return zoaDistance(this.lungBorder, m, this.insideWallMm(m), wallArc(m, this.torso), instant.diaphragmCaudalMm) !== null;
  }

  /** Lámina de pulmón bajo la pared, del borde del pulmón al que ha bajado con el diafragma (decisión 18: los dos lados). */
  private classifyLungCurtain(m: Vec3, insideWallMm: number, u: number, diaphragmCaudalMm: number): Classification | null {
    const bd = lungCurtainDistance(m, insideWallMm, lungEdgeZ(this.lungBorder, u, diaphragmCaudalMm));
    return bd === null ? null : { ...NONE, tissue: Tissue.Lung, boundaryDistance: bd };
  }
}

/** Clasificación «nada» (aire fuera del cuerpo): base de todas las demás. */
const NONE: Classification = Object.freeze({
  tissue: Tissue.Air,
  boundaryDistance: 1e3,
  boundaryNormal: [0, 1, 0] as Vec3,
  interface: Interface.None,
  interfaceDistance: 1e3,
  vessel: null,
  vesselHit: null,
  flowFactor: 1,
});

/**
 * Lo que la fisiología impone a la anatomía en un instante (decisión 10). En VExUS es `VesselCaliber`, que
 * además lleva las escalas de calibre de los vasos; el tórax solo necesita el descenso del diafragma.
 */
export interface SceneInstant {
  /** Descenso caudal del diafragma en este instante (mm, 0 en espiración): baja la cortina pulmonar. */
  diaphragmCaudalMm: number;
  /**
   * Fase fina del latido (0–255, `heartFinePhase` de `PhysiologySample.heartPhase`): la del volumen del corazón de EchoTwin (fase 2
   * del corazón). Sin ella, telediástole (0).
   */
  heartPhase?: number;
}

/**
 * La vertical del campo respiratorio en (x, y) (lus-sim, decisión 22): lo que su peso no cambia con z (`respiratoryColumn`).
 */
export interface RespiratoryColumn {
  readonly x: number;
  readonly y: number;
  /** `torsoDepth` en (x, y) (el tronco es un cilindro: no depende de z). */
  readonly depth: number;
  /** El téxel de la columna de la pared torácica en su arco (`wallColumnTexel`). */
  readonly wall: readonly [number, number, number, number];
  /** El largo del paso al abdomen de la pared que mira el campo (`respiratoryWallBlendMm`). */
  readonly wallBlendMm: number;
  /** Peso de la columna vertebral, que solo depende de (x, y). */
  readonly spine: number;
}

/** Instante de referencia: fin de espiración (sin descenso del diafragma); el `BASELINE_CALIBER` de VExUS. */
export const BASELINE_INSTANT: SceneInstant = {
  diaphragmCaudalMm: 0,
  heartPhase: 0,
};

/** Cortina pulmonar: módulo de órgano `organs/lungCurtain` (se reexporta por compatibilidad). */
export { LUNG_CURTAIN } from './organs/lungCurtain';
