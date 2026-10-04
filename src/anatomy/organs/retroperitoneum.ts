import type { Vec3 } from '../../core/vec3';
import { Tissue } from '../tissues';
import { PERIRENAL, sdRoundCone } from './kidney';
import { spinousTipZ, vertebraZ } from './ribcage';
import { SPINE } from './spine';

/**
 * Retroperitoneo (decisión 81 de VExUS) como módulo de órgano (decisión 46): el psoas mayor y el cuadrado lumbar de los dos
 * lados y la grasa retroperitoneal (pararrenal anterior y posterior, perivascular) que llena lo que queda detrás del
 * peritoneo parietal posterior. Antes todo lo que no era órgano modelado era «resto» con la textura de asas (decisión
 * 74), también detrás del riñón y junto a la columna. Simétricos en x (el marco es levógiro: x < 0 es la derecha del
 * paciente); las constantes del shader salen de aquí.
 *
 * lus-sim (decisión 43): portado de VExUS (c6c81ad) con el lecho del riñón. Su marco se ancla al de lus-sim: en z, la unión de
 * T12 y L1 (en VExUS, z ≈ −45; aquí, la de la parrilla, `vertebraZ(12.5)`) con el paso lumbar de VExUS (~35 mm por nivel: la
 * parrilla de lus-sim tiene el paso torácico, que en la columna lumbar se queda corto); en y, la piel de la espalda (la columna
 * va con ella en los dos, decisión 28: lo de VExUS con b = 105, más 105 − b) salvo el borde anterior del compartimento, que en
 * VExUS pasa por delante de los riñones y aquí va a la misma distancia de sus centros (los de lus-sim están a la profundidad de
 * Xue, 11 mm más adelante respecto de la espalda que en VExUS). El borde medial del cuadrado, en la punta de las transversas de
 * lus-sim (`anatomy.spine.transverseTipMm`; en VExUS, 40 mm).
 */

/** Desplazamiento en z del marco de VExUS al de lus-sim: la unión T12–L1 (VExUS −45). */
export const RETRO_DZ_MM = vertebraZ(12.5) + 45;
/** La espalda de VExUS (−b, con b = 105): las y de VExUS se pasan a distancias desde ella. */
const VEXUS_BACK = -105;
/** En VExUS, el borde anterior del compartimento (−4) está 33 mm por delante del centro medio de los riñones (−38 y −36). */
const FRONT_OVER_KIDNEYS_MM = -4 - 0.5 * (-38 + -36);

/** Marco del retroperitoneo en la escena: la y de la piel de la espalda (−b) y la del borde anterior del compartimento. */
export interface RetroFrame {
  back: number;
  front: number;
}

/** El marco con el tronco de semieje b y la y de los centros de los riñones (gemelo GLSL: `retroBack`, `retroFront`). */
export function retroFrame(b: number, kidneyY: readonly [number, number]): RetroFrame {
  return { back: -b, front: 0.5 * (kidneyY[0] + kidneyY[1]) + FRONT_OVER_KIDNEYS_MM };
}

/**
 * Psoas mayor: cadena de conos redondeados por su eje, del lado derecho y con |x| (el izquierdo es su espejo). Nace de
 * las caras laterales de T12–L5 y de sus apófisis transversas (Gray; Radiopaedia): fino arriba y ancho abajo, por delante
 * de las transversas y pegado al cuerpo vertebral, se separa de él y avanza hacia fuera y adelante hasta el estrecho
 * superior de la pelvis. Radio por nivel desde el área de sección publicada [LITERATURA, orden de magnitud: la de los
 * dos psoas en L3 del adulto sano, ~12–15 cm² en la mujer y ~20 en el varón, con cortes de sarcopenia de ~10 y ~19 cm²]
 * y [ESTIMADO] para cada nodo: 5 mm en T12–L1, 12 en L2, 16 en L3, 18 en L4 y 15 en S1 (por lado, 1,8 cm² en L1, 8,0 en
 * L3 y 10,2 en L4: un adulto medio). Entre el cuerpo vertebral (radio 17 en el modelo) y la aorta o la VCI por delante y
 * las transversas por detrás. lus-sim: (|x|, y desde la espalda, z en el marco de VExUS, radio).
 */
export const PSOAS_NODES: ReadonlyArray<readonly [number, number, number, number]> = [
  [22, -52 - VEXUS_BACK, -45, 5],
  [30, -45.5 - VEXUS_BACK, -97, 12],
  [37, -41 - VEXUS_BACK, -131, 16],
  [40, -39 - VEXUS_BACK, -165, 18],
  [51, -30 - VEXUS_BACK, -240, 15],
];

/**
 * Cuadrado lumbar: lámina muscular contra la cara interna de la pared posterior, lateral al psoas, de la 12.ª costilla
 * a la cresta ilíaca, entre la punta de las apófisis transversas y su borde lateral (más ancho abajo). Grosor
 * anteroposterior de 8 mm arriba a 14 mm en L3 [ESTIMADO sobre 1–2 cm de las guías del bloqueo del cuadrado lumbar].
 * Donde el riñón apoya en la pared (su grasa perirrenal gruesa de detrás, decisión 68, llega a ella) el músculo le
 * deja sitio. Lo decide el orden de `classify` (el riñón y su grasa van antes); el término de la grasa en `quadratusSdf` deja su
 * distancia fuera de ella y hace que la distancia a la frontera la cuente. lus-sim: z en el marco de VExUS; `yMax`, desde la
 * espalda.
 */
export const QUADRATUS = {
  /** z del borde craneal (12.ª costilla) y caudal (cresta ilíaca). */
  zTop: -45,
  zBottom: -190,
  /** |x| del borde medial (la punta de las transversas, más 1 mm como en VExUS). */
  xMedial: SPINE.params.transverseTipMm.value + 1,
  /** |x| del borde lateral arriba y abajo. */
  xLateralTop: 72,
  xLateralBottom: 94,
  /** Grosor (mm, desde la cara interna de la pared) arriba y máximo (hacia L3, z = zPeak). */
  thicknessTop: 8,
  thicknessMax: 14,
  zPeak: -130,
  /** Solo en la pared posterior: y por debajo de la espalda más esto (en VExUS, y < −30). */
  yMax: -30 - VEXUS_BACK,
} as const;

/**
 * Compartimento retroperitoneal: detrás del peritoneo parietal posterior, y < yPeri(|x|, z). Por delante de los grandes
 * vasos y del riñón (y = `front` en |x| ≤ xFront) y hacia fuera baja hasta la pared lateral detrás de la línea axilar
 * posterior (el espacio pararrenal posterior se continúa con la grasa preperitoneal del flanco); bajo los riñones
 * (z < zLow) solo queda la gotera paravertebral (y < yLow). Lo de delante es el «resto» con sus asas (duodeno, colon,
 * intestino delgado). [ESTIMADO sobre la anatomía seccional: Meyers, radiología del retroperitoneo.] lus-sim: z en el marco de
 * VExUS; `yLateral` e `yLow`, desde la espalda.
 */
export const RETRO_FAT = {
  xFront: 70,
  /** |x| donde el borde anterior llega a yLateral, en la pared lateral detrás de la línea axilar posterior. */
  xLateral: 132,
  yLateral: -45 - VEXUS_BACK,
  /** Por debajo de zLow el borde baja a yLow (hasta zLow − zRamp). */
  zLow: -150,
  zRamp: 50,
  yLow: -30 - VEXUS_BACK,
} as const;

/**
 * lus-sim (decisión 43): por encima de los riñones (el borde superior del izquierdo, la punta de la espinosa de T11, más su grasa
 * más gruesa) la grasa retroperitoneal queda en la gotera paravertebral (|x| hasta el borde medial del cuadrado, la punta de las
 * transversas): ahí, detrás, el diafragma toca el bazo, el estómago o el hígado [ESTIMADO; en VExUS, sin tope: su tronco
 * empezaba más abajo].
 */
export const RETRO_TOP = {
  z: spinousTipZ(11) + PERIRENAL.maxMm,
  gutterX: QUADRATUS.xMedial,
} as const;

const smooth01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Distancia con signo al psoas más cercano (mm; negativa dentro). */
export function psoasSdf(m: Vec3, f: RetroFrame): number {
  const q: Vec3 = [Math.abs(m[0]), m[1], m[2]];
  let d = 1e3;
  for (let i = 0; i + 1 < PSOAS_NODES.length; i++) {
    const a = PSOAS_NODES[i];
    const b = PSOAS_NODES[i + 1];
    d = Math.min(d, sdRoundCone(q, [a[0], f.back + a[1], a[2] + RETRO_DZ_MM], [b[0], f.back + b[1], b[2] + RETRO_DZ_MM], a[3], b[3]));
  }
  return d;
}

/**
 * Cotas de la norma del gradiente de los términos del cuadrado que no son planos: la profundidad bajo la pared es la
 * métrica radial del tronco (|∇| ≤ 1,21 en la franja del músculo, medida en los tres casos), la cara externa de la grasa
 * perirrenal no es euclídea (≤ 1,18 en la franja del músculo; hasta 2,7 junto al hilio, lejos de él) y el borde lateral
 * se inclina con z. Divididos por ellas, el máximo es una cota inferior de la distancia (la del gate volumétrico).
 */
const QL_LIPSCHITZ = {
  wall: 1.25,
  peri: 1.25,
  lateral: Math.hypot(1, (QUADRATUS.xLateralBottom - QUADRATUS.xLateralTop) / (QUADRATUS.zTop - QUADRATUS.zBottom)),
};

/**
 * Distancia (cota inferior, mm; negativa dentro) al cuadrado lumbar. `insideWallMm`, la profundidad bajo la cara interna
 * de la pared; `dPeriMm`, la distancia a la cara externa de la grasa perirrenal (el músculo le deja sitio).
 */
export function quadratusSdf(m: Vec3, insideWallMm: number, dPeriMm: number, f: RetroFrame): number {
  const Q = QUADRATUS;
  const L = QL_LIPSCHITZ;
  const ax = Math.abs(m[0]);
  const z = m[2] - RETRO_DZ_MM;
  const s = (Q.zTop - z) / (Q.zTop - Q.zBottom);
  const xLat = Q.xLateralTop + (Q.xLateralBottom - Q.xLateralTop) * s;
  const t = Q.thicknessTop + (Q.thicknessMax - Q.thicknessTop) * smooth01((Q.zTop - z) / (Q.zTop - Q.zPeak));
  return Math.max(
    (insideWallMm - t) / L.wall,
    Q.xMedial - ax,
    (ax - xLat) / L.lateral,
    z - Q.zTop,
    Q.zBottom - z,
    m[1] - (f.back + Q.yMax),
    -dPeriMm / L.peri,
  );
}

/** Borde anterior del compartimento retroperitoneal, y (mm), en (|x|, z). */
export function retroFrontY(ax: number, z: number, f: RetroFrame): number {
  const R = RETRO_FAT;
  const lat = smooth01((ax - R.xFront) / (R.xLateral - R.xFront));
  const y = f.front + (f.back + R.yLateral - f.front) * lat;
  return y + (Math.min(y, f.back + R.yLow) - y) * smooth01((R.zLow - (z - RETRO_DZ_MM)) / R.zRamp);
}

/**
 * Pendiente máxima del borde anterior (|∂y/∂x|, |∂y/∂z| del smoothstep, 1,5 veces la media): la distancia al borde es
 * al menos |y − yPeri| / √(1 + gx² + gz²). lus-sim: con el borde anterior de la escena (`front − back` en vez de los 41 mm de
 * VExUS: 50,5 mm en los seis hábitos; `stomachKidney.test.ts` comprueba que no pasa de la cota).
 */
export const RETRO_FRONT_SPAN_MAX_MM = 60;
const RETRO_FRONT_LIPSCHITZ = Math.hypot(
  1,
  (1.5 * RETRO_FRONT_SPAN_MAX_MM) / (RETRO_FAT.xLateral - RETRO_FAT.xFront),
  (1.5 * RETRO_FRONT_SPAN_MAX_MM) / RETRO_FAT.zRamp,
);

/** Distancia con signo (cota inferior, mm) al borde anterior del compartimento retroperitoneal: negativa dentro. */
export function retroFatSdf(m: Vec3, f: RetroFrame): number {
  const ax = Math.abs(m[0]);
  const top = Math.min(m[2] - RETRO_TOP.z, ax - RETRO_TOP.gutterX);
  return Math.max((m[1] - retroFrontY(ax, m[2], f)) / RETRO_FRONT_LIPSCHITZ, ax - RETRO_FAT.xLateral, top);
}

/**
 * Lo que no es órgano (decisión 81): psoas, cuadrado lumbar, grasa retroperitoneal o, delante del peritoneo parietal
 * posterior, el «resto» (intestino). Devuelve el tejido y la distancia a la frontera más cercana entre ellos (el psoas
 * gana al cuadrado y los dos a la grasa). `insideWallMm` y `dPeriMm`, como en `quadratusSdf`.
 */
export function retroperitoneum(m: Vec3, insideWallMm: number, dPeriMm: number, f: RetroFrame): [Tissue, number] {
  const dP = psoasSdf(m, f);
  if (dP < 0) return [Tissue.Psoas, -dP];
  const dQ = quadratusSdf(m, insideWallMm, dPeriMm, f);
  if (dQ < 0) return [Tissue.QuadratusLumborum, Math.min(-dQ, dP)];
  const dF = retroFatSdf(m, f);
  return dF < 0 ? [Tissue.RetroperitonealFat, Math.min(-dF, dP, dQ)] : [Tissue.Bowel, Math.min(dF, dP, dQ)];
}

const f4 = (v: number): string => v.toFixed(4);
const Q = QUADRATUS;
const R = RETRO_FAT;

/**
 * Gemelo GLSL (usa `sdRoundCone` del riñón): `retroperitoneum` devuelve el tejido (T_PSOAS, T_QUADRATUS, T_RETROFAT o
 * T_BOWEL) y su distancia a la frontera en `bd`. lus-sim: la espalda, −`uTorso.y`; el borde anterior, de la y de los centros
 * de los riñones (`kidneyCenter`).
 */
export const RETROPERITONEUM_GLSL = /* glsl */ `
const vec4 PSOAS[${PSOAS_NODES.length}] = vec4[${PSOAS_NODES.length}](${PSOAS_NODES.map((n) => `vec4(${n.map(f4).join(', ')})`).join(', ')});
const vec4 QL_Z = vec4(${f4(Q.zTop)}, ${f4(Q.zBottom)}, ${f4(Q.zPeak)}, ${f4(Q.yMax)});
const vec4 QL_X = vec4(${f4(Q.xMedial)}, ${f4(Q.xLateralTop)}, ${f4(Q.xLateralBottom)}, ${f4(RETRO_DZ_MM)});
const vec2 QL_T = vec2(${f4(Q.thicknessTop)}, ${f4(Q.thicknessMax)});
const vec3 QL_L = vec3(${f4(QL_LIPSCHITZ.wall)}, ${f4(QL_LIPSCHITZ.peri)}, ${f4(QL_LIPSCHITZ.lateral)});
const vec4 RF_A = vec4(${f4(FRONT_OVER_KIDNEYS_MM)}, ${f4(R.xFront)}, ${f4(R.xLateral)}, ${f4(R.yLateral)});
const vec4 RF_B = vec4(${f4(R.zLow)}, ${f4(R.zRamp)}, ${f4(R.yLow)}, ${f4(RETRO_FRONT_LIPSCHITZ)});
const vec2 RF_TOP = vec2(${f4(RETRO_TOP.z)}, ${f4(RETRO_TOP.gutterX)});
float retroBack() { return -uTorso.y; }
float retroFront() { return 0.5 * (kidneyCenter(0).y + kidneyCenter(1).y) + RF_A.x; }
float psoasSdf(vec3 m) {
  vec3 q = vec3(abs(m.x), m.yz);
  vec3 o = vec3(0.0, retroBack(), QL_X.w);
  float d = 1e3;
  for (int i = 0; i < ${PSOAS_NODES.length - 1}; i++) d = min(d, sdRoundCone(q, PSOAS[i].xyz + o, PSOAS[i + 1].xyz + o, PSOAS[i].w, PSOAS[i + 1].w));
  return d;
}
float quadratusSdf(vec3 m, float insideWall, float dPeri) {
  float ax = abs(m.x);
  float z = m.z - QL_X.w;
  float f = (QL_Z.x - z) / (QL_Z.x - QL_Z.y);
  float t = QL_T.x + (QL_T.y - QL_T.x) * smoothstep(0.0, 1.0, (QL_Z.x - z) / (QL_Z.x - QL_Z.z));
  float d = max(max((insideWall - t) / QL_L.x, QL_X.x - ax), max((ax - (QL_X.y + (QL_X.z - QL_X.y) * f)) / QL_L.z, z - QL_Z.x));
  return max(max(d, QL_Z.y - z), max(m.y - (retroBack() + QL_Z.w), -dPeri / QL_L.y));
}
float retroFrontY(float ax, float z) {
  float front = retroFront();
  float y = front + (retroBack() + RF_A.w - front) * smoothstep(0.0, 1.0, (ax - RF_A.y) / (RF_A.z - RF_A.y));
  return y + (min(y, retroBack() + RF_B.z) - y) * smoothstep(0.0, 1.0, (RF_B.x - (z - QL_X.w)) / RF_B.y);
}
float retroFatSdf(vec3 m) {
  float ax = abs(m.x);
  float top = min(m.z - RF_TOP.x, ax - RF_TOP.y);
  return max(max((m.y - retroFrontY(ax, m.z)) / RF_B.w, ax - RF_A.z), top);
}
int retroperitoneum(vec3 m, float insideWall, float dPeri, out float bd) {
  float dP = psoasSdf(m);
  bd = -dP;
  if (dP < 0.0) return T_PSOAS;
  float dQ = quadratusSdf(m, insideWall, dPeri);
  bd = min(-dQ, dP);
  if (dQ < 0.0) return T_QUADRATUS;
  float dF = retroFatSdf(m);
  bd = min(abs(dF), min(dP, dQ));
  return dF < 0.0 ? T_RETROFAT : T_BOWEL;
}
`;
