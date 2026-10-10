import type { ProbeCompression } from '../compression';
import { CHEST_WALL } from '../organs/chestWall';
import { LUNG_CURTAIN } from '../organs/lungCurtain';
import { LUNG_BORDER } from '../organs/lungBorder';
import { heartFinePhase } from '../organs/heart';
import { MAX_RIBS, RIBS_PER_SIDE } from '../organs/ribcage';
import type { AnatomyScene } from '../scene';
import type { PhysiologySample } from '../../physiology/engine';

/**
 * Esquema ÚNICO de los uniforms de la anatomía (Fase 2): cada entrada declara nombre, tipo,
 * tamaño, documentación y cómo se obtiene su valor de la escena y del instante. De aquí salen
 * a la vez las declaraciones GLSL (`SCENE_UNIFORMS_GLSL`, incluidas en `ANATOMY_GLSL`) y la
 * subida desde el renderer (`evaluateSceneUniforms` + `uploadSceneUniforms`). Antes había que
 * escribir cada nombre dos veces (≈ 85 líneas en el renderer) y un olvido fallaba en silencio.
 *
 * lus-sim (decisión 12): los uniforms del tórax de la escena (tronco, pared, cúpulas, columna, costillas,
 * respiración, compresión de la sonda y cortina), en el orden de VExUS; sin los del hígado, la vesícula, la
 * aurícula, el gas intestinal, los riñones ni los tubos, que la escena no tiene, ni la velocidad del diafragma
 * (`uRespVel`: solo la leía el color, con la velocidad del tejido). La parrilla costal (decisión 16) sube por costilla su
 * extensión y su alto (`uRibs`, las 24: derechas y después izquierdas), sus constantes (`uRibParams`) y el esternón; las
 * alturas de sus líneas medias van en la textura de escena (`organs/ribcage.ts`). Desde la decisión 22 el campo respiratorio
 * es vertical: `uResp` lleva, en lugar de su dirección, su ley de altura.
 */
export { MAX_RIBS } from '../organs/ribcage';

type GlslType = 'float' | 'int' | 'vec2' | 'vec3' | 'vec4';
const SIZE: Record<GlslType, number> = { float: 1, int: 1, vec2: 2, vec3: 3, vec4: 4 };

export interface UniformContext {
  sample: PhysiologySample;
  /** Contacto de la sonda del cuadro (decisión 63); null: sin compresión (uCompC.w = 0). */
  compression: ProbeCompression | null;
}

interface UniformSpec {
  name: string;
  type: GlslType;
  /** Tamaño del array GLSL (sin él, escalar/vector simple). */
  count?: number;
  doc: string;
  value: (s: AnatomyScene, c: UniformContext) => ArrayLike<number>;
}

const pad = (values: number[][], count: number, filler: number[]): number[] =>
  Array.from({ length: count }, (_, i) => values[i] ?? filler).flat();

export const SCENE_UNIFORMS: readonly UniformSpec[] = [
  { name: 'uTorso', type: 'vec4', doc: 'a, b, zMin, zMax', value: (s) => [s.torso.a, s.torso.b, s.torso.zMin, s.torso.zMax] },
  {
    name: 'uWall',
    type: 'vec4',
    doc: 'pared del abdomen (bajo el reborde costal; decisión 17): piel, grasa, músculo (con la preperitoneal), preperitoneal (mm)',
    value: (s) => [s.torso.skinMm, s.torso.fatMm, s.torso.muscleMm, s.torso.preperitonealMm],
  },
  {
    name: 'uChestWall',
    type: 'vec4',
    doc:
      'pared torácica por región (decisión 17, organs/chestWall.ts; la tabla va en uSceneTex, CW_BASE): z de la pared alta y ' +
      'de la baja, engrosamiento inspiratorio de la banda intercostal por mm de descenso, grosor máximo de la pared (mm)',
    value: (s) => {
      const P = CHEST_WALL.params;
      return [s.chestWall.zHigh, s.chestWall.zLow, P.intercostalInspirationMm.value / P.inspirationReferenceMm.value, s.chestWall.maxTotal];
    },
  },
  {
    name: 'uCupola',
    type: 'vec4',
    doc:
      'lus-sim (cobertura torácica): la cúpula pleural (organs/lungApex.ts; zApex y zTop por columna en la tabla de la pared): ' +
      'la menor zApex (desde ella la pared puede pasar de su grosor máximo); decisión 50: el borde superior de la clavícula ' +
      'más bajo de la tabla (desde él, la fosa supraclavicular), 0, 0',
    value: (s) => [s.chestWall.apexMinZ, s.chestWall.fossaMinZ, 0, 0],
  },
  {
    name: 'uDomeR',
    type: 'vec4',
    doc: 'hemicúpula derecha: x0, y0, rx, ry',
    value: (s) => [s.diaphragm.right.x0, s.diaphragm.right.y0, s.diaphragm.right.rx, s.diaphragm.right.ry],
  },
  {
    name: 'uDomeL',
    type: 'vec4',
    doc: 'hemicúpula izquierda',
    value: (s) => [s.diaphragm.left.x0, s.diaphragm.left.y0, s.diaphragm.left.rx, s.diaphragm.left.ry],
  },
  {
    name: 'uDiaphragm',
    type: 'vec4',
    doc: 'apexR, apexL, edgeZ, edgeRise',
    value: (s) => [s.diaphragm.right.apex, s.diaphragm.left.apex, s.diaphragm.edgeZ, s.diaphragm.edgeRise],
  },
  { name: 'uSpine', type: 'vec3', doc: 'x0, y0, r (cuerpo vertebral)', value: (s) => [s.spine.x0, s.spine.y0, s.spine.r] },
  {
    name: 'uSpineArch',
    type: 'vec4',
    doc: 'semiancho, y0, y1 del arco posterior; y de la punta de las apófisis espinosas (lus-sim, decisión 29)',
    value: (s) => [s.spine.archHalfWidth, s.spine.archY0, s.spine.archY1, s.spinous.tipY],
  },
  {
    name: 'uRibs',
    type: 'vec4',
    count: MAX_RIBS,
    doc: 'costillas (derechas 1–12, izquierdas 1–12): |u| del extremo medial, de la unión condrocostal y del posterior, semialto',
    value: (s) => {
      // el orden es el de la tabla y el del bucle del shader: el lado por bloques de 12, el número dentro del bloque
      s.ribs.forEach((r, i) => {
        if (r.side !== (i < RIBS_PER_SIDE ? -1 : 1) || r.number !== (i % RIBS_PER_SIDE) + 1)
          throw new Error(`uRibs: la costilla ${i} es la ${r.number}.ª del lado ${r.side}, fuera del orden del shader`);
      });
      return pad(
        s.ribs.slice(0, MAX_RIBS).map((r) => [r.uEnd, r.uCc, r.uPost, r.halfWidth]),
        MAX_RIBS,
        [1e4, 1e4, -1, 1],
      );
    },
  },
  {
    name: 'uClavicle',
    type: 'vec4',
    doc: 'lus-sim (cobertura torácica): la clavícula (organs/ribcage.ts): |u| del extremo esternal y del acromial, z del eje en el esternal, subida',
    value: (s) => [s.ribCage.clavicle.u0, s.ribCage.clavicle.u1, s.ribCage.clavicle.z0, s.ribCage.clavicle.rise],
  },
  {
    name: 'uClavicleR',
    type: 'vec4',
    doc: 'la clavícula: radio y profundidad del eje bajo la piel por la normal (mm), 0, 0',
    value: (s) => [s.ribCage.clavicle.radius, s.ribCage.clavicle.depth, 0, 0],
  },
  {
    name: 'uScapula',
    type: 'vec4',
    doc:
      'lus-sim (decisión 29): la escápula (organs/ribcage.ts): s (a la línea media posterior por la piel) y z del ángulo superior y ' +
      'del inferior',
    value: (s) => [...s.ribCage.scapula.superior, ...s.ribCage.scapula.inferior],
  },
  {
    name: 'uScapulaB',
    type: 'vec4',
    doc: 'la escápula: s y z de la glena, profundidad de la cara posterior bajo la piel por la normal y grosor (mm)',
    value: (s) => [...s.ribCage.scapula.glenoid, s.ribCage.scapula.depth, s.ribCage.scapula.thickness],
  },
  {
    name: 'uRibParams',
    type: 'vec4',
    doc: 'semigrosor radial de la costilla, complejo pleural, cáscara calcificada del cartílago, 0',
    value: (s) => [s.ribCage.halfThickness, s.ribCage.pleuraComplex, s.ribCage.calcifiedRim, 0],
  },
  {
    name: 'uSternum',
    type: 'vec4',
    doc: 'esternón: z de la escotadura yugular, del ángulo esternal y de la punta del xifoides, grosor',
    value: (s) => [s.ribCage.sternum.zTop, s.ribCage.sternum.zAngle, s.ribCage.sternum.zTip, s.ribCage.sternum.thickness],
  },
  {
    name: 'uSternumW',
    type: 'vec4',
    doc: 'esternón: semiancho del manubrio en la escotadura, del cuerpo y del xifoides en su base, 0',
    value: (s) => [s.ribCage.sternum.halfWidthTop, s.ribCage.sternum.halfWidthBody, s.ribCage.sternum.halfWidthXiphoid, 0],
  },
  {
    name: 'uResp',
    type: 'vec4',
    doc:
      'descenso diafragmático (mm); lus-sim (decisión 22): el campo baja en −z, y en yz su ley de altura (la altura a la que ' +
      'se apaga y la inversa de su tramo), 0',
    value: (s, c) => [
      c.sample.resp.diaphragmCaudalMm,
      s.respiratoryHeight.topZ,
      1 / (s.respiratoryHeight.topZ - s.respiratoryHeight.baseZ),
      0,
    ],
  },
  {
    name: 'uLungPulse',
    type: 'vec2',
    doc:
      'pulso pulmonar (decisión 32, organs/lungPulse.ts): la fracción del volumen latido expulsada en el instante (0 en la ' +
      'telediástole, 1 en la telesístole), que escala el campo del latido; y (fase 2 del corazón, en la misma ranura) la fase ' +
      'fina del latido (0–255; 0 mientras la escena no tiene el latido) que lee el volumen del corazón (heartVoxel): la misma ' +
      'curva mueve el corazón y el pulmón',
    value: (s, c) => [c.sample.cardiacEjection, s.heart.beat ? heartFinePhase(c.sample.heartPhase) : 0],
  },
  {
    name: 'uCompC',
    type: 'vec4',
    doc: 'compresión de la sonda (decisión 63): centro de curvatura de la cara, radio + alcance (0 = sin compresión)',
    value: (_s, c) => (c.compression ? [...c.compression.center, c.compression.radiusMm + c.compression.reachMm] : [0, 0, 0, 0]),
  },
  {
    name: 'uCompAx',
    type: 'vec4',
    doc: 'eje axial de la sonda, sen del semiángulo de la cara (la tabla por nodo, con el radio, va en uSceneTex, COMP_BASE)',
    value: (_s, c) => (c.compression ? [...c.compression.axial, Math.sin(c.compression.halfAngle)] : [0, 0, 1, 1]),
  },
  {
    name: 'uCompLat',
    type: 'vec4',
    doc: 'eje lateral de la sonda, media huella elevacional (mm)',
    value: (_s, c) => (c.compression ? [...c.compression.lateral, c.compression.halfElevationMm] : [1, 0, 0, 0]),
  },
  {
    name: 'uCurtain',
    type: 'vec4',
    doc:
      'cortina pulmonar (decisión 18: los dos hemitórax, con los bordes de organs/lungBorder.ts): descenso del borde del ' +
      'pulmón (mm), espesor de la lámina, cota de la rampa de la cúpula bajo la piel (rimFarMm), cota de la altura de la ' +
      'cúpula (domeTopZ)',
    value: (s, c) => [
      LUNG_BORDER.params.curtainDescentRatio.value * Math.max(c.sample.resp.diaphragmCaudalMm, 0),
      LUNG_CURTAIN.thicknessMm,
      s.lungBorder.rimFarMm,
      s.domeTopZ,
    ],
  },
  {
    name: 'uHeartC',
    type: 'vec4',
    doc: 'corazón (decisión 18, organs/heart.ts): centro del elipsoide y profundidad del tapón de la ventana (decisión 49: hasta el pericardio)',
    value: (s) => [...s.heart.center, s.heart.plugDepthMm],
  },
  {
    name: 'uHeartE1',
    type: 'vec4',
    doc: 'eje largo del corazón (hacia el ápex) y su semieje',
    value: (s) => [...s.heart.e1, s.heart.radii[0]],
  },
  { name: 'uHeartE2', type: 'vec4', doc: 'eje ancho del corazón y su semieje', value: (s) => [...s.heart.e2, s.heart.radii[1]] },
  {
    name: 'uHeartE3',
    type: 'vec4',
    doc: 'eje corto del corazón (hacia la pared de la ventana) y su semieje',
    value: (s) => [...s.heart.e3, s.heart.radii[2]],
  },
  {
    name: 'uHeartBase',
    type: 'vec4',
    doc:
      'lus-sim (decisión 49): esfera de la base del corazón de EchoTwin (centro y radio, mm), que con el elipsoide no respira ' +
      '(heartStillWeight); el volumen del corazón va aparte (uHeartVol, con su rejilla en uSceneTex)',
    value: (s) => [...s.heart.base.c, s.heart.base.r],
  },
  {
    name: 'uHeartWin',
    type: 'vec4',
    doc: 'ventana cardiaca sobre la piel: arco u, altura z y radio (mm), ancho de la franja que llega a la lámina de la cortina',
    value: (s) => [s.heart.window.u, s.heart.window.z, s.heart.window.r, s.heart.skirtMm],
  },
  {
    name: 'uLiverS',
    type: 'vec4',
    doc:
      'lus-sim (decisión 37, organs/liver.ts): escala de la cavidad frente a la de VExUS (sx, sy) para los lóbulos, la cara ' +
      'visceral y el recorte posteromedial; decisión 43, en sus ranuras libres: los mm por unidad de arco y la y del nivel del gas ' +
      'del estómago (organs/stomach.ts)',
    value: (s) => [s.liver.sx, s.liver.sy, s.stomach.arcScale, s.stomach.gasY],
  },
  {
    name: 'uLiverEdge',
    type: 'vec4',
    doc: 'borde inferior por delante (Gray): arco y z del 9.º cartílago derecho, arco y z del 8.º izquierdo',
    value: (s) => [s.liver.edge.uRight, s.liver.edge.zRight, s.liver.edge.uLeft, s.liver.edge.zLeft],
  },
  {
    name: 'uLiverTip',
    type: 'vec4',
    doc:
      'límite lateral izquierdo en proyección frontal: x del 8.º cartílago, z del final del límite superior, convexidad; en la ' +
      'ranura libre, el grueso del estómago (decisión 43)',
    value: (s) => [s.liver.tip.x8, s.liver.tip.zEnd, s.liver.tip.convexMm, s.stomach.radii[2]],
  },
  {
    name: 'uSpleen',
    type: 'vec4',
    doc: 'lus-sim (decisión 37, organs/spleen.ts): centro del bazo (arco de la pared, z) y coseno y seno de su eje largo',
    value: (s) => [s.spleen.u0, s.spleen.z0, s.spleen.cos, s.spleen.sin],
  },
  {
    name: 'uSpleenR',
    type: 'vec4',
    doc: 'bazo: semiejes del largo y el ancho, el grueso y mm por unidad de arco',
    value: (s) => [...s.spleen.radii, s.spleen.arcScale],
  },
  {
    name: 'uStomach',
    type: 'vec4',
    doc:
      'lus-sim (decisión 43, organs/stomach.ts): centro del estómago (arco de la pared, z) y sus semiejes a lo largo de la pared y ' +
      'en z (el grueso, en uLiverTip.w; los mm por unidad de arco, en uLiverS.z; el nivel del gas, en uLiverS.w)',
    value: (s) => [s.stomach.u0, s.stomach.z0, s.stomach.radii[0], s.stomach.radii[1]],
  },
];

/** Declaraciones GLSL generadas del esquema (más los samplers de la textura de escena y del corazón). */
export const SCENE_UNIFORMS_GLSL = [
  ...SCENE_UNIFORMS.map((u) => `uniform ${u.type} ${u.name}${u.count ? `[${u.count}]` : ''}; // ${u.doc}`),
  'uniform sampler2D uSceneTex; // tablas de la compresión de la sonda y de las alturas costales (lus-sim: sin tubos)',
  // lus-sim (decisión 49): el volumen del corazón de EchoTwin horneado (RG8UI 3D: código del tejido y décimas de mm; su rejilla,
  // en uSceneTex desde HEART_VOL_BASE)
  'uniform highp usampler3D uHeartVol;',
].join('\n');

/** Samplers de la escena y sus unidades de textura (el renderizador los liga en cada programa que usa la anatomía). */
export const SCENE_SAMPLERS = { uSceneTex: 6, uHeartVol: 8 } as const;

/** Valores de un cuadro, evaluados UNA vez y subidos a cada programa que usa la anatomía. */
export type SceneUniformValues = ReadonlyArray<{ spec: UniformSpec; data: Float32Array }>;

export function evaluateSceneUniforms(s: AnatomyScene, c: UniformContext): SceneUniformValues {
  return SCENE_UNIFORMS.map((spec) => {
    const raw = spec.value(s, c);
    const expected = SIZE[spec.type] * (spec.count ?? 1);
    if (raw.length !== expected) throw new Error(`uniform ${spec.name}: ${raw.length} valores, se esperaban ${expected}`);
    return { spec, data: Float32Array.from(raw) };
  });
}

/** Mínima interfaz de programa que necesita la subida (la cumple `GLProgram`). */
export interface UniformSink {
  f(name: string, v: number): void;
  i(name: string, v: number): void;
  v2(name: string, a: number, b: number): void;
  v3(name: string, v: ArrayLike<number>): void;
  v4(name: string, a: number, b: number, c: number, d: number): void;
  v3v(name: string, v: Float32Array): void;
  v4v(name: string, v: Float32Array): void;
}

export function uploadSceneUniforms(p: UniformSink, values: SceneUniformValues): void {
  for (const { spec, data: d } of values) {
    if (spec.count) {
      if (spec.type === 'vec4') p.v4v(spec.name, d);
      else if (spec.type === 'vec3') p.v3v(spec.name, d);
      else throw new Error(`array de ${spec.type} no soportado (${spec.name})`);
      continue;
    }
    switch (spec.type) {
      case 'float':
        p.f(spec.name, d[0]);
        break;
      case 'int':
        p.i(spec.name, d[0]);
        break;
      case 'vec2':
        p.v2(spec.name, d[0], d[1]);
        break;
      case 'vec3':
        p.v3(spec.name, d);
        break;
      case 'vec4':
        p.v4(spec.name, d[0], d[1], d[2], d[3]);
        break;
    }
  }
}
