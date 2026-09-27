import { smoothstep, type Vec3 } from '../core/vec3';
import type { PatientState } from '../physiology/patientState';
import {
  sdSpine,
  sdDiaphragm,
  torsoDepth,
  torsoSkinPoint,
  type Dome,
  type Spine,
  type Diaphragm,
  type Torso,
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
import { HEART, buildHeart, heartAtWall, heartClearance, heartDistance, heartStillWeight, type Heart } from './organs/heart';
import {
  RIBCAGE,
  RIBS_PER_SIDE,
  buildRibCage,
  faceRib,
  ribCurvature,
  ribLineArc,
  ribScan,
  ribSd,
  ribTableZ,
  ribTangent,
  type RibCage,
  type RibCageOptions,
  type RibSpec,
} from './organs/ribcage';
import { DEFAULT_CHEST_HABITUS, buildChestWall, setChestWallCage, wallColumnTexel, wallTotalOf, type ChestWall } from './organs/chestWall';
import { preperitonealMm, wallArc, wallDepths, wallFace, wallFaceSd, wallLayers, wallTotalMm } from './organs/wall';
import { thoraxLinePhi } from './thoraxLines';
import { BOWEL_BD_CAP_MM, DIAPHRAGM_THICKNESS_MM, Tissue } from './tissues';
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
   * Vaso que contiene el punto. El tórax portado no tiene vasos (decisión 10): siempre null. El campo, como
   * `vesselHit` y `flowFactor`, conserva la forma de la clasificación de VExUS para los módulos que la leen.
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
 * lus-sim (decisión 10): las caras de los tubos, del hígado, del riñón, de la grasa perirrenal y de la
 * vesícula de VExUS no existen en el tórax.
 */
export type FaceGeometry = 'dome' | 'zoa';
export const FACE_GEOMETRIES: readonly FaceGeometry[] = ['dome', 'zoa'];

/**
 * Geometría cuya distancia (`faceSdf`) da la cara de interfaz `i`, o null sin cara (o las pleuras: la del
 * espejo y la parietal, que no salen de `classify`). Las caras de la pared y de las costillas (decisión 62)
 * tampoco tienen geometría de `faceSdf`: su distancia es la de su capa (`wallFaceSd`) o la de su costilla
 * (`ribSd`), y `faceGradient` las trata aparte. Las caras de estructuras que el tórax no tiene (tubos,
 * vesícula, cápsula hepática, riñón) tampoco: null.
 */
export function faceGeometryOf(i: Interface): FaceGeometry | null {
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

  constructor(patient: PatientState, ribOptions: RibCageOptions = {}) {
    const fat = patient.habitus.subcutaneousFatMm;
    const muscle = patient.habitus.muscleMm;
    // Tronco 32 × 21 cm (adulto de IMC 25): la VCI queda a ≈ 12–13 cm del xifoides
    // la grasa preperitoneal es la parte más honda del espesor muscular del hábito (decisión 62)
    const base: Torso = {
      a: 160,
      b: 105,
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
    // posterior queda ≈ 5 cm de la piel dorsal, como en un adulto); arco posterior con
    // apófisis transversas de 40 mm a cada lado. Las costillas terminan en ellas.
    this.spine = { kind: 'cylinderZ', x0: 0, y0: -46, r: 17, archHalfWidth: 40, archY0: -78, archY1: -58 };
    // La parrilla del adulto promedio (decisión 16): forra la cara interna de la pared de este hábito, con z = 0 en la
    // unión xifoesternal (el 7.º cartílago), al nivel del disco T9–T10 (Gray), y sus extremos posteriores en las
    // apófisis transversas de la columna
    const female = chest.sex === 'female';
    this.ribCage = buildRibCage(walled, this.spine, {
      icsDeltaMm: female ? -RIBCAGE.params.femaleIcsNarrowingMm.value : 0,
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
    const d = this.diaphragm;
    this.domeTopZ = Math.max(d.right.apex, d.left.apex, d.edgeZ + d.edgeRise, this.lungBorder.zLMax);
    this.respiratoryHeight = { baseZ: this.domeTopZ, topZ: this.domeTopZ + this.lungBorder.slideSpanMm };
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
    return {
      x,
      y,
      depth: torsoDepth(p, this.torso),
      wall: wallColumnTexel(this.chestWall, wallArc(p, this.torso)),
      spine: smoothstep(this.spine.r + 5, this.spine.r + 35, dSpine),
    };
  }

  /** Peso respiratorio en (x, y, z) de la vertical `c` (gemelo GLSL `respWeightAt`). */
  respiratoryWeightAt(c: RespiratoryColumn, z: number): number {
    if (c.spine === 0) return 0;
    const wWall = smoothstep(0, 25, -c.depth - wallTotalOf(this.chestWall, c.wall, z));
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
    // cuenta su cara en la distancia a la frontera
    const heart = heartDistance(this.heart, m, inside, u);
    if (heart) {
      const dHeartDome = sdDiaphragm(m, this.diaphragm, torso);
      if (dHeartDome < 0) {
        // la cúpula corta el corazón: su cara inferior es pared (la cavidad no llega al diafragma)
        const floor = -dHeartDome - HEART.params.sideWallMm.value;
        if (heart.blood && floor > 0) return { ...NONE, tissue: Tissue.Blood, boundaryDistance: Math.min(heart.d, floor) };
        const d = heart.blood ? Math.min(-floor, -dHeartDome) : Math.min(heart.d, -dHeartDome, Math.abs(floor));
        return { ...NONE, tissue: Tissue.Myocardium, boundaryDistance: d };
      }
    }
    const clearance = heartClearance(this.heart, m, inside, u);
    const curtain = withCurtain ? this.classifyLungCurtain(m, inside, u, caudal) : null;
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
    // Bajo el diafragma, el «resto» (decisión 10, `abdomen-generic-tissue`): el tejido por defecto de la
    // clasificación de VExUS, sin órganos ni gas. Su distancia a la frontera es la de las interfaces que ganan
    // antes (el diafragma y la pared), con el tope de VExUS: con 5 mm fijos el gate volumétrico daba por
    // interior un punto pegado al diafragma que float32 clasificaba al otro lado (CI de #39 de VExUS).
    const bd = Math.min(BOWEL_BD_CAP_MM, dDome - DIAPHRAGM_THICKNESS_MM, inside, zoaGap(this.lungBorder, m, inside, u, caudal), clearance);
    return { ...NONE, tissue: Tissue.Bowel, boundaryDistance: Math.max(0, bd) };
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
    // la cara de la capa más cercana; la distancia a la frontera cuenta el hueso o cartílago más cercano (|∇| ≤ 1,1)
    const layer = (tissue: Tissue, bd: number, ribD: number, ribAny: number): { final: true; cls: Classification } => {
      const [face, dist] = wallFace(d, u, m[2], ribD, torso, caudalMm);
      const boundaryDistance = Math.min(bd, ribAny / 1.1);
      return { final: true, cls: { ...NONE, tissue, boundaryDistance, interface: face, interfaceDistance: dist } };
    };
    if (d < skin) return layer(Tissue.Skin, skin - d, 1e3, 1e3);
    // La parrilla, antes de la grasa subcutánea donde puede llegar (la grasa no la corta): el esternón y las costillas del
    // lado de la muestra; el hueso más cercano da la cortical, el cartílago su pericondrio (bajo la pared, `ribScan` no
    // mira nada)
    const scan = ribScan(m, d, u, torso, this.ribCage, wall);
    if (scan.inside >= 0) {
      const face = scan.cartilage ? { interface: Interface.Perichondrium, interfaceDistance: -scan.inD } : {};
      return {
        final: true,
        cls: { ...NONE, tissue: scan.cartilage ? Tissue.Cartilage : Tissue.Bone, boundaryDistance: -scan.inD, ...face },
      };
    }
    if (d >= wall) {
      const dSpine = sdSpine(m, this.spine);
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
  /** Peso de la columna vertebral, que solo depende de (x, y). */
  readonly spine: number;
}

/** Instante de referencia: fin de espiración (sin descenso del diafragma); el `BASELINE_CALIBER` de VExUS. */
export const BASELINE_INSTANT: SceneInstant = {
  diaphragmCaudalMm: 0,
};

/** Cortina pulmonar: módulo de órgano `organs/lungCurtain` (se reexporta por compatibilidad). */
export { LUNG_CURTAIN } from './organs/lungCurtain';
