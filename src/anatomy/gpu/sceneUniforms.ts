import type { ProbeCompression } from '../compression';
import { RespiratoryDeformation } from '../deformation';
import { LUNG_CURTAIN } from '../organs/lungCurtain';
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
 * (`uRespVel`: solo la leía el color, con la velocidad del tejido).
 */
export const MAX_RIBS = 6;

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
    doc: 'piel, grasa, músculo (con la grasa preperitoneal), grasa preperitoneal (mm)',
    value: (s) => [s.torso.skinMm, s.torso.fatMm, s.torso.muscleMm, s.torso.preperitonealMm],
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
    doc: 'semiancho, y0, y1 del arco posterior, 0',
    value: (s) => [s.spine.archHalfWidth, s.spine.archY0, s.spine.archY1, 0],
  },
  {
    name: 'uRibs',
    type: 'vec4',
    count: MAX_RIBS,
    doc: 'costillas: zAnterior, tilt, halfWidth, halfThickness',
    value: (s) =>
      pad(
        s.ribs.slice(0, MAX_RIBS).map((r) => [r.zAnterior, r.tilt, r.halfWidth, r.halfThickness]),
        MAX_RIBS,
        [9999, 0, 1, 1],
      ),
  },
  {
    name: 'uRibParams',
    type: 'vec2',
    doc: 'escala, cartilageFromPhi',
    value: (s) => [s.ribs[0]?.scale ?? 0.85, s.ribs[0]?.cartilageFromPhi ?? 9],
  },
  {
    name: 'uResp',
    type: 'vec4',
    doc: 'descenso diafragmático (mm), dirección xyz',
    value: (_s, c) => [c.sample.resp.diaphragmCaudalMm, ...RespiratoryDeformation.direction],
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
    doc: 'cortina pulmonar: borde caudal z, espesor, xMax, yMax',
    value: (_s, c) => [LUNG_CURTAIN.z0 - c.sample.resp.diaphragmCaudalMm, LUNG_CURTAIN.thicknessMm, LUNG_CURTAIN.xMax, LUNG_CURTAIN.yMax],
  },
];

/** Declaraciones GLSL generadas del esquema (más el sampler de la textura de escena). */
export const SCENE_UNIFORMS_GLSL = [
  ...SCENE_UNIFORMS.map((u) => `uniform ${u.type} ${u.name}${u.count ? `[${u.count}]` : ''}; // ${u.doc}`),
  'uniform sampler2D uSceneTex; // tabla de la compresión de la sonda (lus-sim: sin tubos)',
].join('\n');

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
