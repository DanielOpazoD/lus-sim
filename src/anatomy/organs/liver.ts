import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import { sdEllipsoid, smoothMax, smoothMin, torsoSkinPoint, type Ellipsoid, type Spine, type Torso } from '../primitives';
import { ribTableZ, spinousTipZ, type RibCage } from './ribcage';
import { wallArc } from './wall';

export { smoothMax, smoothMin } from '../primitives';

/**
 * El hígado bajo la cúpula derecha (lus-sim, decisión 37), como módulo de órgano (decisión 46 de VExUS). Portado de VExUS
 * (`src/anatomy/organs/liver.ts` en c6c81ad) y adaptado al tórax de lus-sim:
 *
 *  - **La envolvente** es la de VExUS: dos lóbulos (elipsoides; el izquierdo afilado hacia +x) unidos con un mínimo suave, con
 *    el recorte posteromedial (`MEDIAL_CUT`) y la cara visceral interior (la cuádrica de VExUS). Como las cúpulas (decisión 17),
 *    se escala a la cavidad de lus-sim (`sx`, `sy`: el tronco de 226 mm y la pared torácica por región); el lóbulo izquierdo es
 *    más ancho que el de VExUS para llegar a la pared anterior donde lo pone Gray.
 *  - **El borde inferior contra la pared** sale de la base en lugar de las faldas ajustadas de VExUS (sus costillas 5.ª–10.ª
 *    derechas no son la parrilla del adulto promedio, decisión 16): Gray («Surface Markings of the Abdomen») lo traza 1 cm bajo el
 *    margen inferior del tórax a la derecha hasta el 9.º cartílago costal, de ahí en oblicuo hasta el 8.º cartílago izquierdo
 *    (cruza la línea media justo sobre el plano transpilórico) y, con una leve convexidad a la izquierda, hasta el final del
 *    límite superior, el 6.º cartílago a 5 cm de la línea media. Por columna de la pared (`liverEdgeZ`): el reborde costal de la
 *    tabla de la pared torácica menos `belowMarginMm` lateral y posteriormente, la recta de Gray por delante; y el límite lateral
 *    izquierdo, en proyección frontal (`leftTipDistance`). Desde ese borde la cara visceral sube hacia dentro con la cotangente de
 *    VExUS (0,75 en el lóbulo derecho: el borde agudo; 1,6 en el izquierdo) hasta la cuádrica interior.
 *  - **La impresión renal** de VExUS (contra su riñón) pasa a ser un recorte del espacio del riñón, que lus-sim no tiene: el
 *    paralelogramo de Morris de Gray (de 2,5 a 9,5 cm de la línea media, desde la punta de la apófisis de T11; el riñón derecho
 *    1 cm más bajo) por detrás de la cara anterior del cuerpo vertebral [SUPUESTO]. Bajo el diafragma, en la espalda baja, queda
 *    el «resto» del abdomen donde la base pone el riñón (`abdomen-generic-tissue`).
 *  - Sin la fosa vesicular, la fisura umbilical ni el ligamento venoso (lus-sim no tiene vesícula ni ligamentos), y sin el
 *    tamaño variable (`sizeFactor`, la hepatomegalia de VExUS): el hígado del adulto promedio.
 *
 * Arriba lo limita la cúpula y por fuera la pared o la lámina de la ZOA: lo hace la clasificación (`AnatomyScene.classify`),
 * que mira el hígado después de ellas. TS y GLSL (uniforms `uLiver*` del esquema único) viven aquí juntos.
 */
export const LIVER = defineParameters('anatomy.liver', {
  belowMarginMm: {
    value: 10,
    unit: 'mm',
    range: [10, 12.5],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray («Surface Markings of the Abdomen», hígado): el límite inferior, «1 cm below the lower margin of the thorax on the right ' +
      'side as far as the ninth costal cartilage». El rango llega a la marca de Birmingham que recoge el mismo texto: 1,25 cm bajo ' +
      'la punta de la 10.ª costilla',
  },
  rightCartilage: {
    value: 9,
    unit: 'cartílago',
    range: [9, 9],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: el borde sigue el margen del tórax «as far as the ninth costal cartilage» (su punta, en el reborde)',
  },
  leftCartilage: {
    value: 8,
    unit: 'cartílago',
    range: [8, 8],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray: del 9.º cartílago derecho «obliquely upward to the eighth left costal cartilage, crossing the middle line just above ' +
      'the transpyloric plane» (el extremo del 8.º cartílago izquierdo, en el reborde)',
  },
  leftEndXMm: {
    value: 50,
    unit: 'mm',
    range: [50, 95],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray: el límite superior del lóbulo izquierdo llega «to the sixth costal cartilage, 5 cm. from the middle line», donde lo ' +
      'cierra el inferior. [DISCREPANCIA]: la marca de Birmingham del mismo texto lleva el lóbulo hasta 2,5 cm bajo el pezón ' +
      'izquierdo (la LMC, 9,5 cm); se sigue el texto de Gray',
  },
  leftEndCartilage: {
    value: 6,
    unit: 'cartílago',
    range: [6, 6],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: el final del límite superior del lóbulo izquierdo, en el 6.º cartílago costal',
  },
  leftConvexityMm: {
    value: 8,
    unit: 'mm',
    range: [0, 15],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray: del 8.º cartílago izquierdo al final del límite superior el borde va «with a slight left convexity»; cuánto, NO ' +
      'ENCONTRADO [SUPUESTO]: el arco sale de la recta hasta 8 mm hacia la izquierda',
  },
  kidneyTopSpinous: {
    value: 11,
    unit: 'vértebra',
    range: [11, 11],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray («Surface Markings of the Abdomen», riñones): el paralelogramo de Morris, cuyo lado superior va a la altura de la punta ' +
      'de la apófisis espinosa de T11',
  },
  rightKidneyLowerMm: {
    value: 10,
    unit: 'mm',
    range: [0, 20],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: «The right kidney usually lies about 1 cm. lower than the left»',
  },
  kidneyMedialXMm: {
    value: 25,
    unit: 'mm',
    range: [25, 25],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: el paralelogramo de Morris, entre dos verticales a 2,5 y 9,5 cm de la línea media',
  },
  kidneyLateralXMm: {
    value: 95,
    unit: 'mm',
    range: [95, 95],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: el paralelogramo de Morris, entre dos verticales a 2,5 y 9,5 cm de la línea media',
  },
  kidneyAnteriorMm: {
    value: 0,
    unit: 'mm',
    range: [-15, 15],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'La cara anterior del espacio del riñón, a la altura de la cara anterior del cuerpo vertebral más esto [SUPUESTO]: Gray pone ' +
      'los riñones «on either side of the vertebral column»; su profundidad en el tronco no la da la base (NO ENCONTRADO)',
  },
});

/**
 * Factor con que la distancia a la frontera toma la distancia aproximada del hígado y del bazo (lus-sim, decisión 37): sus
 * mínimos y máximos suaves y las coordenadas de la pared la hacen pasarse de la euclídea (medido: hasta ×1,72 junto al
 * «resto»). Con 0,5 la cota no pasa de la distancia real; la cara de la cápsula usa la distancia sin el factor.
 */
export const ORGAN_SDF_LIPSCHITZ = 0.5;

/** Transición de la pendiente del borde del lóbulo derecho al izquierdo (x de VExUS, mm). */
export const TIP_SLOPE_X = [-60, 10] as const;
/** Cotangente del ángulo del borde inferior (VExUS, f = 1): lóbulo derecho e izquierdo [ESTIMADO, de VExUS]. */
export const TIP_SLOPE = [0.75, 1.6] as const;
/** Mínimo suave de la falda y la cara interior (mm, el de VExUS). */
export const VISCERAL_BLEND_MM = 6;
/** Redondeo de la arista entre los lóbulos y la cara visceral (mm, VExUS con f = 1). */
export const EDGE_ROUND_MM = 3;
/** Unión suave de los lóbulos (mm, la de VExUS). */
export const LIVER_BLEND_MM = 15;
/** Más lejos que esto (mm) de los lóbulos, `liverSdf` devuelve la distancia a ellos sin los recortes (el tope del «resto»). */
export const LIVER_EARLY_OUT_MM = 5;
/** Redondeo del recorte del riñón (mm: el de la impresión renal de VExUS) y del límite lateral izquierdo. */
export const KIDNEY_CUT_ROUND_MM = 8;
export const LEFT_TIP_ROUND_MM = 4;
/**
 * La cara visceral interior de VExUS, z = c₀ + c₁x + c₂y + c₃x² + c₄xy + c₅y² en su marco (≈ −62 sobre el riñón derecho, −45 en
 * el hilio, −38 en el lóbulo izquierdo junto a la línea media) [ESTIMADO, de VExUS].
 */
export const VISCERAL_INNER = [-41.6, 0.36066, -0.28777, -0.00023999, -0.0022207, 0.0031832] as const;
/** Recorte posteromedial de VExUS (su marco): el hígado no pasa a la izquierda y por detrás del borde izquierdo de la VCI. */
export const MEDIAL_CUT = { xPost: -10, x0: -6, y0: -4, k: 1.2, yMax: 10, roundMm: 6 } as const;

/**
 * Los lóbulos en el marco de VExUS (se escalan con la cavidad: x por sx, y por sy): el derecho, el de VExUS; el izquierdo, más
 * ancho y más alto hacia delante que el de VExUS ((5, 42, −20), (100, 45, 85), 0,5), para llegar a la pared anterior bajo el
 * 6.º cartílago a 5 cm (Gray) [ESTIMADO]. Constantes también en la GLSL: solo sx y sy suben como uniforms.
 */
export const RIGHT_LOBE = { center: [-70, -8, -42], radii: [92, 108, 145], taperX: 0.12 } as const;
export const LEFT_LOBE = { center: [15, 45, -20], radii: [100, 60, 85], taperX: 0.4 } as const;

/** El hígado de la escena: lo que su distancia necesita (sube a la GPU en `uLiver*`). */
export interface LiverShape {
  /** Lóbulos en el marco de lus-sim (escalados con la cavidad). */
  readonly right: Ellipsoid;
  readonly left: Ellipsoid;
  /** Escala de la cavidad frente a la de VExUS (la de las cúpulas). */
  readonly sx: number;
  readonly sy: number;
  /** El borde inferior por delante (Gray): arco y z del 9.º cartílago derecho (u < 0) y del 8.º izquierdo. */
  readonly edge: { readonly uRight: number; readonly zRight: number; readonly uLeft: number; readonly zLeft: number };
  /** Límite lateral izquierdo en proyección frontal: x del 8.º cartílago izquierdo, x y z del final del límite superior. */
  readonly tip: { readonly x8: number; readonly xEnd: number; readonly zEnd: number; readonly convexMm: number };
  /** Espacio del riñón (Morris): |x| medial y lateral, y de su cara anterior, z de su borde superior izquierdo y derecho. */
  readonly kidney: { readonly xMed: number; readonly xLat: number; readonly yAnt: number; readonly zLeft: number; readonly zRight: number };
}

/**
 * Construye el hígado del adulto promedio sobre la parrilla de la escena: los lóbulos de VExUS escalados (`sx`, `sy`, los de
 * las cúpulas), el borde de Gray y el riñón de Morris.
 */
export function buildLiver(t: Torso, cage: RibCage, spine: Spine, sx: number, sy: number, marginAt: (u: number) => number): LiverShape {
  const P = LIVER.params;
  const rib = (n: number, side: -1 | 1) => cage.ribs.findIndex((r) => r.number === n && r.side === side);
  const kR = rib(P.rightCartilage.value, -1);
  const kL = rib(P.leftCartilage.value, 1);
  // la punta (el extremo anterior) del 9.º cartílago derecho, con el borde a `belowMarginMm` bajo el reborde de la tabla de la
  // pared torácica en su columna (`marginAt`, el mismo que usa `liverEdgeZ` a su derecha: sin escalón en la punta); y el 8.º
  // izquierdo, en la línea media de su cartílago
  const uRight = -cage.ribs[kR].uEnd;
  const zRight = marginAt(uRight) - P.belowMarginMm.value;
  const uLeft = cage.ribs[kL].uEnd;
  const zLeft = ribTableZ(cage, kL, cage.ribs[kL].uEnd);
  // x en la piel del extremo del 8.º cartílago izquierdo, y la altura del 6.º cartílago a `leftEndXMm` de la línea media
  const xAt = (u: number) => skinPointAtArc(u, t)[0];
  const k6 = rib(P.leftEndCartilage.value, 1);
  const uEnd = arcAtSkinX(P.leftEndXMm.value, t);
  const zEnd = ribTableZ(cage, k6, uEnd);
  return {
    // los lóbulos (`RIGHT_LOBE`, `LEFT_LOBE`), escalados a la cavidad
    right: scaledLobe(RIGHT_LOBE, sx, sy),
    left: scaledLobe(LEFT_LOBE, sx, sy),
    sx,
    sy,
    edge: { uRight, zRight, uLeft, zLeft },
    tip: { x8: xAt(uLeft), xEnd: P.leftEndXMm.value, zEnd, convexMm: P.leftConvexityMm.value },
    kidney: {
      xMed: P.kidneyMedialXMm.value,
      xLat: P.kidneyLateralXMm.value,
      yAnt: spine.y0 + spine.r + P.kidneyAnteriorMm.value,
      zLeft: spinousTipZ(P.kidneyTopSpinous.value),
      zRight: spinousTipZ(P.kidneyTopSpinous.value) - P.rightKidneyLowerMm.value,
    },
  };
}

function scaledLobe(l: typeof RIGHT_LOBE | typeof LEFT_LOBE, sx: number, sy: number): Ellipsoid {
  return {
    kind: 'ellipsoid',
    center: [l.center[0] * sx, l.center[1] * sy, l.center[2]],
    radii: [l.radii[0] * sx, l.radii[1] * sy, l.radii[2]],
    taperX: l.taperX,
  };
}

/** El punto de la piel (z = 0) cuyo arco de la pared (`wallArc`) es u. */
function skinPointAtArc(u: number, t: Torso): Vec3 {
  let lo = -Math.PI;
  let hi = Math.PI;
  // wallArc crece con el ángulo de la elipse desde la línea media anterior (+x a la izquierda)
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const p: Vec3 = [t.a * Math.sin(mid), t.b * Math.cos(mid), 0];
    if (wallArc(p, t) < u) lo = mid;
    else hi = mid;
  }
  const tau = 0.5 * (lo + hi);
  return [t.a * Math.sin(tau), t.b * Math.cos(tau), 0];
}

/** El arco de la pared (`wallArc`, ≥ 0) del punto anterior de la piel a x de la línea media. */
function arcAtSkinX(x: number, t: Torso): number {
  return wallArc(torsoSkinPoint(Math.acos(x / t.a), 0, t), t);
}

/**
 * El borde inferior del hígado contra la pared en la columna u (mm; gemelo GLSL con el mismo nombre). `marginZ`: el reborde
 * costal de la columna (`wallColumnTexel`, el tercer valor). A la derecha del 9.º cartílago (u ≤ uRight), el reborde menos
 * `belowMarginMm`; de él al 8.º cartílago izquierdo, la recta de Gray; más a la izquierda, a la altura del 8.º (el límite
 * lateral lo pone `leftTipDistance`).
 */
export function liverEdgeZ(u: number, marginZ: number, s: LiverShape): number {
  const e = s.edge;
  if (u <= e.uRight) return marginZ - LIVER.params.belowMarginMm.value;
  if (u >= e.uLeft) return e.zLeft;
  return e.zRight + ((e.zLeft - e.zRight) * (u - e.uRight)) / (e.uLeft - e.uRight);
}

/** La cuádrica interior de VExUS en (x, y) de lus-sim: [z, |∇z|] (con la escala de la cavidad). */
function visceralInner(x: number, y: number, s: LiverShape): [number, number] {
  const c = VISCERAL_INNER;
  const X = x / s.sx;
  const Y = y / s.sy;
  const z = c[0] + c[1] * X + c[2] * Y + c[3] * X * X + c[4] * X * Y + c[5] * Y * Y;
  const gx = (c[1] + 2 * c[3] * X + c[4] * Y) / s.sx;
  const gy = (c[2] + c[4] * X + 2 * c[5] * Y) / s.sy;
  return [z, Math.hypot(gx, gy)];
}

/** Cotangente del borde en x (lus-sim): la del lóbulo derecho y la del izquierdo, con la transición de VExUS escalada. */
function edgeSlope(x: number, s: LiverShape): number {
  const t = Math.min(1, Math.max(0, (x / s.sx - TIP_SLOPE_X[0]) / (TIP_SLOPE_X[1] - TIP_SLOPE_X[0])));
  return TIP_SLOPE[0] + (TIP_SLOPE[1] - TIP_SLOPE[0]) * t * t * (3 - 2 * t);
}

/**
 * La cara visceral en m (gemelo GLSL con el mismo nombre): [z, |∇|] del mínimo suave de la cuádrica interior y la falda, el
 * borde de Gray de su columna (`u`, `marginZ`) que sube hacia dentro (`inside`, la profundidad bajo la cara interna de la pared)
 * con la cotangente del borde. Por encima de ella está el hígado.
 */
export function visceralHeight(x: number, y: number, u: number, inside: number, marginZ: number, s: LiverShape): [number, number] {
  const [zi, gi] = visceralInner(x, y, s);
  const slope = edgeSlope(x, s);
  const zs = liverEdgeZ(u, marginZ, s) + slope * Math.max(inside, 0);
  const k = VISCERAL_BLEND_MM;
  const h = Math.max(k - Math.abs(zi - zs), 0) / k;
  const wi = zi < zs ? 1 - h / 2 : h / 2;
  return [Math.min(zi, zs) - h * h * k * 0.25, wi * gi + (1 - wi) * slope];
}

/** Distancia con signo a la cara visceral, positiva por encima (dentro del hígado; gemelo GLSL con el mismo nombre). */
export function visceralFaceDistance(m: Vec3, u: number, inside: number, marginZ: number, s: LiverShape): number {
  const [zv, g] = visceralHeight(m[0], m[1], u, inside, marginZ, s);
  return (m[2] - zv) / Math.sqrt(1 + g * g);
}

/** Distancia con signo al recorte posteromedial de VExUS (positiva dentro: fuera del hígado; su marco, escalado). */
export function medialCutDistance(m: Vec3, s: LiverShape): number {
  const C = MEDIAL_CUT;
  const x = m[0] / s.sx;
  const y = m[1] / s.sy;
  const plane = (x - C.x0 - C.k * (y - C.y0)) / Math.hypot(1, C.k);
  return Math.min(x - C.xPost, plane, C.yMax - y) * Math.min(s.sx, s.sy);
}

/** Distancia (aprox.) al espacio del riñón de Morris del lado de m, positiva fuera (gemelo GLSL con el mismo nombre). */
export function kidneyCutDistance(m: Vec3, s: LiverShape): number {
  const K = s.kidney;
  const ax = Math.abs(m[0]);
  const zTop = m[0] < 0 ? K.zRight : K.zLeft;
  return Math.max(K.xMed - ax, ax - K.xLat, m[1] - K.yAnt, m[2] - zTop);
}

/**
 * Distancia al límite lateral izquierdo del hígado en proyección frontal, positiva fuera (a su izquierda; gemelo GLSL con el
 * mismo nombre): de la x del 8.º cartílago a la altura del borde a la del final del límite superior (`leftEndXMm`), con la
 * convexidad de Gray.
 */
export function leftTipDistance(m: Vec3, s: LiverShape): number {
  const T = s.tip;
  const z0 = s.edge.zLeft;
  const t = Math.min(1, Math.max(0, (m[2] - z0) / (T.zEnd - z0)));
  const xTip = T.x8 + (T.xEnd - T.x8) * t + T.convexMm * Math.sin(Math.PI * t);
  return m[0] - xTip;
}

/**
 * La envolvente de los dos lóbulos, su mínimo suave (gemelo GLSL con el mismo nombre): `liverSdf` sin los recortes. Más allá
 * de `LIVER_EARLY_OUT_MM` es `liverSdf`, y la clasificación no necesita la columna de la pared del punto.
 */
export function liverLobesSd(m: Vec3, s: LiverShape): number {
  return smoothMin(liverLobeSd(m, s.right), liverLobeSd(m, s.left), LIVER_BLEND_MM);
}

/** Distancia con signo a un lóbulo (el elipsoide afilado de VExUS; gemelo GLSL con el mismo nombre). */
export function liverLobeSd(m: Vec3, e: Ellipsoid): number {
  return sdEllipsoid(m, e);
}

/**
 * Distancia con signo al hígado, negativa dentro, sin la cúpula ni la pared (las pone la clasificación; gemelo GLSL con el
 * mismo nombre): los lóbulos, la cara visceral, el recorte posteromedial, el riñón y el límite lateral izquierdo. `u`, `inside`
 * y `marginZ` son los de su columna de la pared.
 */
export function liverSdf(m: Vec3, u: number, inside: number, marginZ: number, s: LiverShape): number {
  let d = liverLobesSd(m, s);
  // los recortes son intersecciones suaves (smoothMax ≥ max): lejos de los lóbulos la distancia ya es una cota, y basta para el
  // «resto» (cuya distancia a la frontera no pasa de `BOWEL_BD_CAP_MM`)
  if (d > LIVER_EARLY_OUT_MM) return d;
  d = smoothMax(d, -visceralFaceDistance(m, u, inside, marginZ, s), EDGE_ROUND_MM);
  d = smoothMax(d, medialCutDistance(m, s), MEDIAL_CUT.roundMm);
  d = smoothMax(d, -kidneyCutDistance(m, s), KIDNEY_CUT_ROUND_MM);
  return smoothMax(d, leftTipDistance(m, s), LEFT_TIP_ROUND_MM);
}

const f4 = (x: number): string => x.toFixed(4);
/** Literal GLSL exacto (el mismo número que la TS). */
const g = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const VI = VISCERAL_INNER.map(g);
/** Centro y afilamiento, y semiejes de un lóbulo escalado con `uLiverS.xy` (los argumentos de `liverLobeSd`). */
const lobeGlsl = (l: typeof RIGHT_LOBE | typeof LEFT_LOBE): string =>
  `vec4(${g(l.center[0])} * uLiverS.x, ${g(l.center[1])} * uLiverS.y, ${g(l.center[2])}, ${g(l.taperX)}), ` +
  `vec3(${g(l.radii[0])} * uLiverS.x, ${g(l.radii[1])} * uLiverS.y, ${g(l.radii[2])})`;

/**
 * Gemelo GLSL. Uniforms: `uLiverS` (sx, sy, y de la cara anterior del riñón, z de su borde superior izquierdo; el derecho,
 * `rightKidneyLowerMm` más abajo), `uLiverEdge` (uRight, zRight, uLeft, zLeft) y `uLiverTip` (x8, zEnd, convexidad, 0); los
 * lóbulos, las |x| del riñón y `leftEndXMm`, constantes.
 */
export const LIVER_GLSL = /* glsl */ `
#define LIVER_BLEND ${f4(LIVER_BLEND_MM)}
#define LIVER_EARLY_OUT ${g(LIVER_EARLY_OUT_MM)}
#define LIVER_EDGE_ROUND ${f4(EDGE_ROUND_MM)}
#define LIVER_VIS_BLEND ${f4(VISCERAL_BLEND_MM)}
#define LIVER_KIDNEY_ROUND ${f4(KIDNEY_CUT_ROUND_MM)}
#define LIVER_TIP_ROUND ${f4(LEFT_TIP_ROUND_MM)}
#define LIVER_MEDIAL_ROUND ${f4(MEDIAL_CUT.roundMm)}
#define LIVER_BELOW_MARGIN ${g(LIVER.params.belowMarginMm.value)}
#define KIDNEY_RIGHT_LOWER ${g(LIVER.params.rightKidneyLowerMm.value)}
#define KIDNEY_X_MED ${g(LIVER.params.kidneyMedialXMm.value)}
#define KIDNEY_X_LAT ${g(LIVER.params.kidneyLateralXMm.value)}
#define LIVER_X_END ${g(LIVER.params.leftEndXMm.value)}
float smoothMin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smoothMax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}
float liverLobeSd(vec3 p, vec4 c, vec3 r) {
  float dx = p.x - c.x;
  float taper = max(0.15, 1.0 - c.w * (dx / r.x));
  vec3 rr = vec3(r.x, r.y * taper, r.z * taper);
  vec3 k = (p - c.xyz) / rr;
  float k1 = length(k);
  float k2 = length(k / rr);
  return k2 > 0.0 ? (k1 * (k1 - 1.0)) / k2 : -min(r.x, min(r.y, r.z));
}
float liverEdgeZ(float u, float marginZ) {
  if (u <= uLiverEdge.x) return marginZ - LIVER_BELOW_MARGIN;
  if (u >= uLiverEdge.z) return uLiverEdge.w;
  return uLiverEdge.y + (uLiverEdge.w - uLiverEdge.y) * (u - uLiverEdge.x) / (uLiverEdge.z - uLiverEdge.x);
}
vec2 visceralHeight(vec3 m, float u, float inside, float marginZ) {
  float X = m.x / uLiverS.x;
  float Y = m.y / uLiverS.y;
  float zi = ${VI[0]} + ${VI[1]} * X + ${VI[2]} * Y + ${VI[3]} * X * X + ${VI[4]} * X * Y + ${VI[5]} * Y * Y;
  float gi = length(vec2((${VI[1]} + 2.0 * ${VI[3]} * X + ${VI[4]} * Y) / uLiverS.x, (${VI[2]} + ${VI[4]} * X + 2.0 * ${VI[5]} * Y) / uLiverS.y));
  float t = clamp((X - ${g(TIP_SLOPE_X[0])}) / ${g(TIP_SLOPE_X[1] - TIP_SLOPE_X[0])}, 0.0, 1.0);
  float slope = ${g(TIP_SLOPE[0])} + ${g(TIP_SLOPE[1] - TIP_SLOPE[0])} * t * t * (3.0 - 2.0 * t);
  float zs = liverEdgeZ(u, marginZ) + slope * max(inside, 0.0);
  float h = max(LIVER_VIS_BLEND - abs(zi - zs), 0.0) / LIVER_VIS_BLEND;
  float wi = zi < zs ? 1.0 - 0.5 * h : 0.5 * h;
  return vec2(min(zi, zs) - h * h * LIVER_VIS_BLEND * 0.25, wi * gi + (1.0 - wi) * slope);
}
float visceralFaceDistance(vec3 m, float u, float inside, float marginZ) {
  vec2 v = visceralHeight(m, u, inside, marginZ);
  return (m.z - v.x) / sqrt(1.0 + v.y * v.y);
}
float medialCutDistance(vec3 m) {
  float x = m.x / uLiverS.x;
  float y = m.y / uLiverS.y;
  float plane = (x - ${g(MEDIAL_CUT.x0)} - ${g(MEDIAL_CUT.k)} * (y - ${g(MEDIAL_CUT.y0)})) / ${g(Math.hypot(1, MEDIAL_CUT.k))};
  return min(min(x - ${g(MEDIAL_CUT.xPost)}, plane), ${g(MEDIAL_CUT.yMax)} - y) * min(uLiverS.x, uLiverS.y);
}
float kidneyCutDistance(vec3 m) {
  float ax = abs(m.x);
  float zTop = m.x < 0.0 ? uLiverS.w - KIDNEY_RIGHT_LOWER : uLiverS.w;
  return max(max(KIDNEY_X_MED - ax, ax - KIDNEY_X_LAT), max(m.y - uLiverS.z, m.z - zTop));
}
float leftTipDistance(vec3 m) {
  float t = clamp((m.z - uLiverEdge.w) / (uLiverTip.y - uLiverEdge.w), 0.0, 1.0);
  return m.x - (uLiverTip.x + (LIVER_X_END - uLiverTip.x) * t + uLiverTip.z * sin(${g(Math.PI)} * t));
}
float liverLobesSd(vec3 m) {
  return smoothMin(liverLobeSd(m, ${lobeGlsl(RIGHT_LOBE)}), liverLobeSd(m, ${lobeGlsl(LEFT_LOBE)}), LIVER_BLEND);
}
float liverSdf(vec3 m, float u, float inside, float marginZ) {
  float d = liverLobesSd(m);
  if (d > LIVER_EARLY_OUT) return d;
  d = smoothMax(d, -visceralFaceDistance(m, u, inside, marginZ), LIVER_EDGE_ROUND);
  d = smoothMax(d, medialCutDistance(m), LIVER_MEDIAL_ROUND);
  d = smoothMax(d, -kidneyCutDistance(m), LIVER_KIDNEY_ROUND);
  return smoothMax(d, leftTipDistance(m), LIVER_TIP_ROUND);
}
`;
