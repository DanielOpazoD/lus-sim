import { smoothstep, type Vec3 } from '../core/vec3';
import type { PatientState } from '../physiology/patientState';
import {
  diaphragmHeight,
  sdSpine,
  sdDiaphragm,
  sdRib,
  torsoDepth,
  type Spine,
  type Diaphragm,
  type Rib,
  type Torso,
  type TubeHit,
} from './primitives';
import { inLungCurtain, inLungRecess, lungCurtainDistance, lungCurtainEdgeMm } from './organs/lungCurtain';
import {
  nearestRib,
  preperitonealMm,
  ribCurvature,
  ribSd,
  ribSearchDepth,
  ribTangent,
  wallArc,
  wallDepths,
  wallFace,
  wallFaceSd,
} from './organs/wall';
import { BOWEL_BD_CAP_MM, DIAPHRAGM_THICKNESS_MM, Tissue } from './tissues';
import { FACE_GRADIENT_EPS_MM, Interface, isRibInterface, isWallLayerInterface } from './interfaces';

/**
 * Escena anatómica del avatar adulto de referencia (guía §9): el tórax de la escena de VExUS
 * (lus-sim, decisión 10). Quedan el tronco, la pared en capas, las costillas (las derechas de VExUS:
 * `no-spleen-no-left-ribs`), el diafragma en dos cúpulas, la columna, la cortina pulmonar y el pulmón
 * del tórax sobre la cúpula. No se portan el hígado, la vesícula, los riñones, los ligamentos, la
 * aurícula derecha, el árbol vascular ni el intestino: bajo el diafragma queda el tejido por defecto de
 * la clasificación de VExUS, su «resto» del abdomen (`Tissue.Bowel`, sin bolsas de gas), declarado como
 * `abdomen-generic-tissue`. El hígado vuelve en la fase 3 como módulo portado.
 *
 * Todas las coordenadas son del marco MATERIAL (espiración, sin deformación):
 * +x izquierda del paciente, +y anterior, +z craneal (marco levógiro, decisión 22).
 * Las dimensiones son las de VExUS: [EXTRAPOLACIÓN PROPIA] de un adulto de IMC 25; ningún ángulo o
 * longitud se presenta como dato anatómico medido. Las del tórax de la base de conocimiento (metas A)
 * llegan en el paso C (`anatomy.test.ts` las fija como `it.fails` con lo medido).
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
 * lus-sim (decisión 10): las caras de los tubos, del hígado, del riñón, de la grasa perirrenal y de la
 * vesícula de VExUS no existen en el tórax.
 */
export type FaceGeometry = 'dome';
export const FACE_GEOMETRIES: readonly FaceGeometry[] = ['dome'];

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

/** Ascenso posterior del arco costal (mm) según el número de costilla: 60 mm la 5.ª, +6 mm por costilla. */
export function ribTiltMm(ribNo: number): number {
  return 60 + 6 * (ribNo - 5);
}

export class AnatomyScene {
  readonly torso: Torso;
  readonly ribs: Rib[];
  readonly diaphragm: Diaphragm;
  readonly spine: Spine;

  constructor(patient: PatientState) {
    const fat = patient.habitus.subcutaneousFatMm;
    const muscle = patient.habitus.muscleMm;
    // Tronco 32 × 21 cm (adulto de IMC 25): la VCI queda a ≈ 12–13 cm del xifoides
    // la grasa preperitoneal es la parte más honda del espesor muscular del hábito (decisión 62)
    this.torso = { a: 160, b: 105, zMin: -300, zMax: 300, skinMm: 2, fatMm: fat, muscleMm: muscle, preperitonealMm: preperitonealMm(fat) };
    // Referencia craneocaudal: z = 0 en la punta del xifoides (T9–T10). Cúpula derecha
    // en T8–T9 (+45 mm), reborde costal en la línea medioclavicular ≈ −80 mm, unión
    // cavoauricular ≈ +55 mm, hilio hepático ≈ −45 mm (T12–L1) [B.5].
    this.diaphragm = {
      right: { kind: 'dome', x0: -55, y0: -5, rx: 85, ry: 92, apex: 55 },
      left: { kind: 'dome', x0: 70, y0: -5, rx: 70, ry: 85, apex: 25 },
      edgeZ: -50,
      edgeRise: 50,
    };
    // Columna: cuerpo vertebral de 36 mm justo por detrás de cava y aorta (su cara
    // posterior queda ≈ 5 cm de la piel dorsal, como en un adulto); arco posterior con
    // apófisis transversas de 40 mm a cada lado. Las costillas terminan en ellas.
    this.spine = { kind: 'cylinderZ', x0: 0, y0: -46, r: 17, archHalfWidth: 40, archY0: -78, archY1: -58 };
    this.ribs = [];
    // Costillas derechas 5–10: el 7.º cartílago llega al esternón a la altura del xifoides (z 0).
    // Oblicuidad creciente hacia abajo: la cabeza de la 5.ª está en T5 (≈ 6 cm sobre su
    // extremo anterior) y la de la 10.ª en T10, a la altura del xifoides (≈ 9 cm sobre el
    // reborde) — `ribTiltMm`, la misma ley que dibuja el navegador 3D.
    const anterior = [40, 20, 0, -25, -50, -75];
    for (let i = 0; i < anterior.length; i++) {
      this.ribs.push({
        zAnterior: anterior[i],
        tilt: ribTiltMm(5 + i),
        halfWidth: 6,
        halfThickness: 3.2,
        scale: 0.85,
        // cartílago a ±45° de la línea media: la unión costocondral en la línea medioclavicular (x ≈ 96 mm en la
        // elipse de la costilla, 136 × 89 mm), la del reborde costal de las costillas 7–10 (decisión 62)
        cartilageFromPhi: Math.PI / 4,
        rightOnly: true,
      });
    }
  }

  /** Espesor total de la pared del tronco (mm). */
  wallThickness(): number {
    return this.torso.skinMm + this.torso.fatMm + this.torso.muscleMm;
  }

  /**
   * Profundidad (mm) de un punto MATERIAL bajo la cara interna de la pared: negativa en la pared, 0 en la
   * pleura parietal (gemelo GLSL `insideWallMm`). A0 busca en ella el cruce exacto de la pleura (decisión 61).
   */
  insideWallMm(m: Vec3): number {
    return -torsoDepth(m, this.torso) - this.wallThickness();
  }

  /**
   * El punto MATERIAL es pulmón de la cortina (la lámina bajo la pared), no del tórax bajo la cúpula
   * (decisión 61; gemelo GLSL `inLungCurtain`). Solo tiene sentido donde `classify` da pulmón.
   */
  inLungCurtain(m: Vec3, instant: SceneInstant): boolean {
    return inLungCurtain(m, this.insideWallMm(m), instant.diaphragmCaudalMm);
  }

  /**
   * El punto MATERIAL, si `classify` da pulmón, toca la pared en el receso (la cortina o el tórax por encima de
   * la inserción del diafragma): ahí empieza la pleura parietal (decisión 61; gemelo GLSL `inLungRecess`).
   */
  inLungRecess(m: Vec3): boolean {
    return inLungRecess(m, this.insideWallMm(m));
  }

  /**
   * Distancia (mm) de un punto MATERIAL de la cara interna de la pared al borde del pulmón que la toca en el
   * receso: z − min(borde de la cortina, inserción del diafragma); null fuera de la huella (gemelo GLSL
   * `lungCurtainEdgeMm`, decisión 61).
   */
  lungEdgeMm(m: Vec3, instant: SceneInstant): number | null {
    return lungCurtainEdgeMm(m, instant.diaphragmCaudalMm, diaphragmHeight(m[0], m[1], this.diaphragm, this.torso));
  }

  /**
   * Peso del campo de desplazamiento respiratorio en un punto material: 1 en
   * las vísceras, 0 en pared, costillas y columna (B.4, [EXTRAPOLACIÓN PROPIA]).
   */
  respiratoryWeight(m: Vec3): number {
    const inside = -torsoDepth(m, this.torso) - this.wallThickness();
    const wWall = smoothstep(0, 25, inside);
    const dSpine = Math.hypot(m[0] - this.spine.x0, m[1] - this.spine.y0);
    const wSpine = smoothstep(this.spine.r + 5, this.spine.r + 35, dSpine);
    return wWall * wSpine;
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
    const wall = this.classifyWall(m, -depth);
    if (wall.final) return wall.cls;
    const curtain = withCurtain ? this.classifyLungCurtain(m, -depth - wall.wallMm, instant.diaphragmCaudalMm) : null;
    if (curtain) return curtain;
    const dDome = sdDiaphragm(m, this.diaphragm, this.torso);
    if (dDome < 0) return { ...NONE, tissue: Tissue.Lung, boundaryDistance: -dDome };
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
    const bd = Math.min(BOWEL_BD_CAP_MM, dDome - DIAPHRAGM_THICKNESS_MM, -depth - wall.wallMm);
    return { ...NONE, tissue: Tissue.Bowel, boundaryDistance: Math.max(0, bd) };
  }

  /**
   * Distancia con signo (mm) de un punto MATERIAL a una cara geométrica, positiva fuera de lo que la
   * cara encierra (el abdomen bajo la cúpula). Es la misma cantidad que decide la clasificación en esa
   * cara, así que su gradiente es la normal de la interfaz:
   *  - `dome`: `sdDiaphragm`.
   * Solo banco de fidelidad y pruebas: la clasificación no la llama.
   */
  faceSdf(m: Vec3, _instant: SceneInstant, face: FaceGeometry): number | null {
    switch (face) {
      case 'dome':
        return sdDiaphragm(m, this.diaphragm, this.torso);
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
      if (isWallLayerInterface(iface)) return this.numericGradient(m, (p) => wallFaceSd(p, iface, this.torso), 0);
      if (isRibInterface(iface)) {
        const rib = this.ribs[nearestRib(m, this.ribs, this.torso, this.spine)];
        const g = this.numericGradient(m, (p) => ribSd(p, rib, this.torso, this.spine), ribCurvature(m, rib, this.torso));
        return { ...g, axis: ribTangent(m, rib, this.torso) };
      }
      face = faceGeometryOf(iface);
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
   * Capas parietales y costillas (decisión 62, módulo `organs/wall`). `final` = el punto está en piel,
   * grasa subcutánea, costilla/cartílago, músculo, grasa preperitoneal o columna (no hay nada más que
   * mirar); si no, devuelve el espesor total de la pared (lo que queda debajo empieza ahí). Cada muestra de las capas
   * dibuja la cara de la capa más cercana (`wallFace`); junto a una costilla ósea, su cortical; el cartílago,
   * su pericondrio. El hueso no dibuja cara (su cortical la dibuja el tejido blando de fuera).
   */
  private classifyWall(m: Vec3, d: number): { final: true; cls: Classification } | { final: false; wallMm: number } {
    const torso = this.torso;
    const skin = torso.skinMm;
    const wall = skin + torso.fatMm + torso.muscleMm;
    // la cara de la capa más cercana; la distancia a la frontera cuenta la costilla más cercana (|∇| ≤ 1,1)
    const layer = (tissue: Tissue, bd: number, u: number, ribD: number, ribAny: number): { final: true; cls: Classification } => {
      const [face, dist] = wallFace(d, u, m[2], ribD, torso);
      const boundaryDistance = Math.min(bd, ribAny / 1.1);
      return { final: true, cls: { ...NONE, tissue, boundaryDistance, interface: face, interfaceDistance: dist } };
    };
    if (d < skin) return layer(Tissue.Skin, skin - d, 0, 1e3, 1e3);
    // Costillas, antes de la grasa subcutánea donde una puede llegar (la grasa no las corta): dentro de la
    // pared o justo por debajo; la ósea más cercana da la cortical, el cartílago su pericondrio
    let ribD = 1e3;
    let ribAny = 1e3;
    if (d >= ribSearchDepth(torso, this.ribs[0]?.scale ?? 1))
      for (const rib of this.ribs) {
        const r = sdRib(m, rib, torso, this.spine);
        if (r.d < 0) {
          const tissue = r.cartilage ? Tissue.Cartilage : Tissue.Bone;
          const face = r.cartilage ? { interface: Interface.Perichondrium, interfaceDistance: -r.d } : {};
          return { final: true, cls: { ...NONE, tissue, boundaryDistance: -r.d, ...face } };
        }
        ribAny = Math.min(ribAny, r.d);
        if (!r.cartilage) ribD = Math.min(ribD, r.d);
      }
    if (d >= wall) {
      const dSpine = sdSpine(m, this.spine);
      if (dSpine < 0) return { final: true, cls: { ...NONE, tissue: Tissue.Vertebra, boundaryDistance: -dSpine } };
      return { final: false, wallMm: wall };
    }
    // las coordenadas de la pared solo dentro de ella: fascia profunda y transversalis onduladas en (u, z)
    const u = wallArc(m, torso);
    const w = wallDepths(torso, u, m[2]);
    if (d < w.fascia) return layer(Tissue.Fat, Math.min(d - skin, w.fascia - d), u, ribD, ribAny);
    if (d < w.transversalis) return layer(Tissue.Muscle, Math.min(d - w.fascia, w.transversalis - d), u, ribD, ribAny);
    // grasa preperitoneal (extraperitoneal) entre la transversalis y el peritoneo parietal
    return layer(Tissue.Fat, Math.min(d - w.transversalis, wall - d), u, ribD, ribAny);
  }

  /** Lámina de pulmón en el receso costofrénico derecho (lateral y posterior), bajo la pared. */
  private classifyLungCurtain(m: Vec3, insideWallMm: number, diaphragmCaudalMm: number): Classification | null {
    const bd = lungCurtainDistance(m, insideWallMm, diaphragmCaudalMm);
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

/** Instante de referencia: fin de espiración (sin descenso del diafragma); el `BASELINE_CALIBER` de VExUS. */
export const BASELINE_INSTANT: SceneInstant = {
  diaphragmCaudalMm: 0,
};

/** Cortina pulmonar: módulo de órgano `organs/lungCurtain` (se reexporta por compatibilidad). */
export { LUNG_CURTAIN } from './organs/lungCurtain';
