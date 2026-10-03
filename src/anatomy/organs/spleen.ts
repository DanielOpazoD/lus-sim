import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import type { Torso } from '../primitives';
import { ribTableZ, type RibCage } from './ribcage';
import { TISSUES, Tissue } from '../tissues';
import { sdRoundCone } from './kidney';
import { smoothMax, smoothMin } from './liver';
import { spinousTipZ } from './ribcage';
import { wallArc } from './wall';

/**
 * El bazo bajo la cúpula izquierda (lus-sim, decisión 37; VExUS no lo tiene). Gray lo describe así: su eje largo sigue la
 * 10.ª costilla izquierda; en vertical queda entre el borde superior de la 9.ª y el inferior de la 11.ª; su punto más bajo, en la
 * línea axilar media («Surface Markings of the Abdomen»); su cara diafragmática, convexa, está contra el diafragma, que la separa
 * de las costillas 9.ª–11.ª y del borde inferior del pulmón y la pleura; mide unos 12 cm de largo, 7 de ancho y 3–4 de grueso
 * («The Spleen»).
 *
 * Modelo: medio elipsoide en las coordenadas de la pared (el arco `wallArc` de su columna pasado a mm a la cara interna de la
 * pared, la altura z y la profundidad bajo esa cara, `inside`), centrado en la cara interna: su cara diafragmática es la de la
 * pared (la sigue, como la del órgano, convexa con ella) y la visceral, la mitad de dentro del elipsoide. El eje largo, el de la
 * 10.ª costilla en su centro, con su punto más bajo en la axilar media; el ancho, a lo largo de la pared y a través de las costillas
 * (los 7 cm caben de la 9.ª a la 11.ª); el grosor, el semieje hacia dentro, en el centro. La clasificación lo mira tras la cúpula, la ZOA y el hígado: arriba lo tapa el pulmón del receso, y por detrás lo
 * recorta la impresión del riñón izquierdo (decisión 43: la grasa perirrenal, `perirenalDistance`, como en el hígado). La distancia de las coordenadas de la
 * pared no es euclídea lejos de su centro (≤ unos %: la escala del arco se toma en él).
 *
 * TS y GLSL (uniforms `uSpleen*` del esquema único) viven aquí juntos.
 */
export const SPLEEN = defineParameters('anatomy.spleen', {
  lengthMm: {
    value: 120,
    unit: 'mm',
    range: [100, 140],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918', 'chow-bazo-2016'],
    note:
      'Gray («The Spleen»): «In the adult it is usually about 12 cm. in length, 7 cm. in breadth, and 3 or 4 cm. in thickness». ' +
      'Chow y cols. (ecografía, 1230 adultos sanos): el largo crece con la talla y es mayor en el varón; pasa de 12 cm en el 26 % ' +
      'de los varones y el 6 % de las mujeres (resumen): el rango llega a 14',
  },
  breadthMm: {
    value: 70,
    unit: 'mm',
    range: [60, 80],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: 7 cm de ancho; la banda de la 9.ª a la 11.ª costilla en la que lo pone Gray mide ≈ 7 cm en la LAP del avatar',
  },
  thicknessMm: {
    value: 35,
    unit: 'mm',
    range: [30, 40],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: 3 o 4 cm de grueso',
  },
  weightG: {
    value: 200,
    unit: 'g',
    range: [150, 250],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      "Gray («The Spleen»): en el adulto pesa unos 200 g (lus-sim, decisión 43: con la densidad de IT'IS de la tabla de tejidos, " +
      '1089 kg/m³, 184 mL: el volumen del medio elipsoide, que fija su largo a lo largo de la pared con el ancho y el grueso de ' +
      'Gray). El rango, [SUPUESTO]',
  },
  capsuleMm: {
    value: 0.8,
    unit: 'mm',
    range: [0.5, 1.5],
    evidence: 'estimado',
    sources: [],
    note:
      'La cápsula del bazo, la lámina de su cara que dibuja la pasada B: la misma que la hepática de VExUS (`LIVER_CAPSULE_MM`) ' +
      '[SUPUESTO]; su grosor en el adulto, NO ENCONTRADO',
  },
  axisRib: {
    value: 10,
    unit: 'costilla',
    range: [10, 10],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: «the tenth rib is taken as representing its long axis»',
  },
  poleMidlineMm: {
    value: 40,
    unit: 'mm',
    range: [40, 40],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray («Surface Markings of the Abdomen»): el punto más alto del bazo, a 4 cm de la línea media de la espalda a la altura de ' +
      'la punta de la apófisis espinosa de T9 (lus-sim, decisión 43: su proyección en la espalda, x = 40 mm)',
  },
  poleSpinous: {
    value: 9,
    unit: 'vértebra',
    range: [9, 9],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: el punto más alto, a la altura de la punta de la apófisis espinosa de T9',
  },
  poleRadiusMm: {
    value: 10,
    unit: 'mm',
    range: [5, 17.5],
    evidence: 'estimado',
    sources: [],
    note:
      'El radio del polo posterior (la punta del cono redondeado que lleva el bazo de su extremo en la pared al punto de Gray) ' +
      '[SUPUESTO]: el grosor del bazo junto a su polo, NO ENCONTRADO; el cono empieza con la mitad del grueso de Gray',
  },
});

/** El bazo de la escena (sube a la GPU en `uSpleen*`). */
export interface SpleenShape {
  /** Centro: arco de la pared (u > 0, a la izquierda) y z. */
  readonly u0: number;
  readonly z0: number;
  /** Coseno y seno del eje largo en el plano (arco en mm, z): la pendiente de la 10.ª costilla en el centro. */
  readonly cos: number;
  readonly sin: number;
  /** mm por unidad de arco en la cara interna de la pared (el centro del medio elipsoide está en el diafragma). */
  readonly arcScale: number;
  /** Semiejes: largo, ancho y el grueso entero (hacia dentro). */
  readonly radii: Vec3;
  /**
   * Profundidad máxima bajo la piel (mm): la de la rampa de la cúpula junto a la pared (`rimFarMm`) más el grueso. Las
   * coordenadas de la pared siguen la dirección radial del tronco: sin esta cota, el medio elipsoide seguiría bajo la cúpula hasta
   * el centro del tronco.
   */
  readonly maxSkinDepth: number;
  /**
   * lus-sim (decisión 43): el polo posterior en las coordenadas locales del bazo (`spleenLocal`): el centro del redondeo del punto
   * más alto de Gray, en la cara abdominal del diafragma (que ahí se separa de la pared por el receso del pulmón). Un cono
   * redondeado (`SPLEEN_POLE`), con el eje en esa cara como el medio elipsoide, lo une a su extremo posterior: sigue la pared y el
   * diafragma, y su mitad de fuera la corta el diafragma.
   */
  readonly pole: Vec3;
}

/** Punto a la profundidad `d` (mm bajo la piel, por la dirección radial del tronco) bajo el punto de la piel del arco u y la altura z. */
function pointAtArc(u: number, z: number, d: number, t: Torso): Vec3 {
  let lo = -Math.PI;
  let hi = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < u) lo = mid;
    else hi = mid;
  }
  const tau = 0.5 * (lo + hi);
  const sx = t.a * Math.sin(tau);
  const sy = t.b * Math.cos(tau);
  const r = Math.hypot(sx, sy);
  const k = 1 - d / r;
  return [sx * k, sy * k, z];
}

/**
 * Construye el bazo con las marcas de Gray: el eje, la 10.ª costilla izquierda (su pendiente en el centro); el punto más bajo, en
 * la línea axilar media (`midaxillaryU`); el ancho y el grueso, los suyos, y el largo a lo largo de la pared, el del volumen de su
 * peso (lus-sim, decisión 43; en la decisión 37, sus 12 cm); y de su extremo posterior un cono redondeado sube al punto más alto
 * (`pole`). La cara diafragmática, en la cara interna de la pared (`wallMm`, el grosor de la pared en la columna del centro).
 */
export function buildSpleen(
  t: Torso,
  cage: RibCage,
  midaxillaryU: number,
  wallMm: (u: number, z: number) => number,
  rimFarMm: number,
  belowDiaphragm: (m: Vec3) => number,
): SpleenShape {
  const P = SPLEEN.params;
  const k = cage.ribs.findIndex((r) => r.number === P.axisRib.value && r.side === 1);
  const zRib = (u: number) => ribTableZ(cage, k, u);
  const T = P.thicknessMm.value;
  const B = 0.5 * P.breadthMm.value;
  const { rb } = SPLEEN_POLE;
  // el semieje largo: el volumen del peso de Gray, (2/3)·π·A·B·T (medio elipsoide)
  const A = (3 * SPLEEN_VOLUME_ML * 1000) / (2 * Math.PI * B * T);
  let u0 = midaxillaryU + A;
  let shape: SpleenShape | null = null;
  // el centro se busca a lo largo de la costilla: el punto más bajo (Gray) cae en la LAM
  for (let it = 0; it < 8; it++) {
    const z0 = zRib(u0);
    const depth = wallMm(u0, z0);
    const pa = pointAtArc(u0 - 1, z0, depth, t);
    const pb = pointAtArc(u0 + 1, z0, depth, t);
    const arcScale = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 2;
    const dz = (zRib(u0 + 2) - zRib(u0 - 2)) / 4;
    const len = Math.hypot(arcScale, dz);
    const cos = arcScale / len;
    const sin = dz / len;
    shape = { u0, z0, cos, sin, arcScale, radii: [A, B, T], maxSkinDepth: rimFarMm + T, pole: [0, 0, 0] };
    // el punto más bajo de la elipse de la pared (semiejes A a lo largo del eje y B de ancho, inclinada con la costilla) está a
    // s = −sen·cos·(A² − B²)/√(A²·sen² + B²·cos²) mm de arco del centro; en unidades de arco, ÷ arcScale
    const sLow = (-sin * cos * (A * A - B * B)) / Math.sqrt(A * A * sin * sin + B * B * cos * cos);
    u0 = midaxillaryU - sLow / arcScale;
  }
  const s = shape!;
  // el polo: a la altura de la punta de la espinosa de T9 con el centro de su redondeo `rb` más abajo y `rb` por fuera de la
  // vertical de Gray (x = poleMidlineMm: su borde medial, a 4 cm de la línea media); de la espalda hacia delante, en la cara
  // abdominal del diafragma (que ahí se separa de la pared por el receso del pulmón)
  const xb = P.poleMidlineMm.value + rb;
  const zb = spinousTipZ(P.poleSpinous.value) - rb;
  let yb = -t.b * Math.sqrt(1 - (xb / t.a) ** 2);
  while (belowDiaphragm([xb, yb, zb]) < 0 && yb < t.b) yb += 0.25;
  const b: Vec3 = [xb, yb, zb];
  return { ...s, pole: spleenLocal(wallArc(b, t), zb, 0, s) };
}

/** El volumen del bazo (mL): el peso de Gray con la densidad de la tabla de tejidos (IT'IS). */
export const SPLEEN_VOLUME_ML = SPLEEN.params.weightG.value / (TISSUES[Tissue.Spleen].rho / 1000);

/**
 * El cono del polo posterior (lus-sim, decisión 43): radio `ra` en su arranque (la mitad del grueso de Gray) y `rb` en el polo
 * (`poleRadiusMm`); se une al medio elipsoide con un mínimo suave de `blendMm` [SUPUESTO].
 */
export const SPLEEN_POLE = {
  ra: 0.5 * SPLEEN.params.thicknessMm.value,
  rb: SPLEEN.params.poleRadiusMm.value,
  blendMm: 10,
} as const;

/**
 * El arranque del cono del polo (marco local): a lo largo del eje, a `ra` de la punta posterior, en la cara del diafragma (como el
 * centro del medio elipsoide: la mitad de fuera la corta el diafragma).
 */
export function poleStart(s: SpleenShape): Vec3 {
  return [s.radii[0] - SPLEEN_POLE.ra, 0, 0];
}

/** Coordenadas locales del bazo (largo, ancho, grueso; mm) en (u, z, inside) de la pared (gemelo GLSL con el mismo nombre). */
export function spleenLocal(u: number, z: number, inside: number, s: SpleenShape): Vec3 {
  const a = (u - s.u0) * s.arcScale;
  const b = z - s.z0;
  return [a * s.cos + b * s.sin, -a * s.sin + b * s.cos, inside];
}

/**
 * Distancia con signo al bazo, negativa dentro, sin la cúpula ni la pared (las pone la clasificación) y con la impresión del
 * riñón izquierdo (`renal`, `renalImpression`: su grasa y su sombra; gemelo GLSL con el mismo nombre). `u`: el arco de la
 * columna del punto; `below`: su profundidad bajo el diafragma (la cara abdominal de la cúpula, o la de la ZOA o la pared), así la
 * cara diafragmática del bazo sigue al diafragma; `skinDepth`: su profundidad bajo la piel (`maxSkinDepth`); `inside`, bajo la cara
 * interna de la pared (lus-sim, decisión 43: el medio elipsoide no pasa de `SPLEEN_MAX_INSIDE_MM`).
 */
export function spleenSdf(m: Vec3, u: number, below: number, skinDepth: number, inside: number, s: SpleenShape, renal: number): number {
  const q = spleenLocal(u, m[2], below, s);
  const r = s.radii;
  const kx = q[0] / r[0];
  const ky = q[1] / r[1];
  const kz = q[2] / r[2];
  const k1 = Math.hypot(kx, ky, kz);
  const k2 = Math.hypot(kx / r[0], ky / r[1], kz / r[2]);
  const d0 = k2 > 0 ? (k1 * (k1 - 1)) / k2 : -Math.min(r[0], r[1], r[2]);
  const cone = sdRoundCone(q, poleStart(s), s.pole, SPLEEN_POLE.ra, SPLEEN_POLE.rb);
  const d = Math.max(smoothMin(d0, cone, SPLEEN_POLE.blendMm), inside - SPLEEN_MAX_INSIDE_MM);
  return Math.max(smoothMax(d, -renal, SPLEEN_KIDNEY_ROUND_MM), skinDepth - s.maxSkinDepth);
}

/**
 * El bazo solo se evalúa cerca de donde puede estar (gemelo GLSL con el mismo nombre): a la izquierda de x `SPLEEN_X_MIN_MM`
 * (el modelo lo pone a ≥ 30 mm de la línea media: el polo posterior, decisión 43) y a menos de `maxSkinDepth` más `SPLEEN_NEAR_MARGIN_MM` bajo la piel. Fuera,
 * su distancia pasa de 2 × el tope del «resto» (5 mm por `ORGAN_SDF_LIPSCHITZ`) y la clasificación la toma por lejana (1e3).
 */
export function spleenCandidate(m: Vec3, skinDepth: number, s: SpleenShape): boolean {
  return m[0] > SPLEEN_X_MIN_MM && skinDepth < s.maxSkinDepth + SPLEEN_NEAR_MARGIN_MM;
}
export const SPLEEN_X_MIN_MM = 15;
export const SPLEEN_NEAR_MARGIN_MM = 25;

/**
 * lus-sim (decisión 43): el medio elipsoide no pasa de esto (mm) bajo la cara interna de la pared, su grueso de Gray más 5. Su
 * profundidad bajo el diafragma (`below`) es la altura bajo la cúpula: donde el arco de la pared llega a la espalda, bajo la cúpula
 * el medio elipsoide seguía hacia dentro hasta la columna (a 86 mm de la pared con el polo posterior; en la decisión 37, en la
 * mujer obesa, 83). La parte posterior honda es la del cono del polo.
 */
export const SPLEEN_MAX_INSIDE_MM = SPLEEN.params.thicknessMm.value + 5;

/** Redondeo de la impresión renal en el bazo (mm, el del hígado). */
export const SPLEEN_KIDNEY_ROUND_MM = 8;

/**
 * Gemelo GLSL. Uniforms: `uSpleen` (u0, z0, cos, sen), `uSpleenR` (semiejes, escala del arco) y `uSpleenPole.xyz` (el polo en el
 * marco local, `pole`); `maxSkinDepth` es `uCurtain.z` (la cota de la
 * rampa de la cúpula, `rimFarMm`) más el grueso. `sdRoundCone` y `smoothMin`, las del módulo del riñón.
 */
const g = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export const SPLEEN_GLSL = /* glsl */ `
bool spleenCandidate(vec3 m, float skinDepth) {
  return m.x > ${SPLEEN_X_MIN_MM.toFixed(1)} && skinDepth < uCurtain.z + uSpleenR.z + ${SPLEEN_NEAR_MARGIN_MM.toFixed(1)};
}
vec3 poleStart() {
  return vec3(uSpleenR.x - ${g(SPLEEN_POLE.ra)}, 0.0, 0.0);
}
vec3 spleenLocal(float u, float z, float inside) {
  float a = (u - uSpleen.x) * uSpleenR.w;
  float b = z - uSpleen.y;
  return vec3(a * uSpleen.z + b * uSpleen.w, -a * uSpleen.w + b * uSpleen.z, inside);
}
float spleenSdf(vec3 m, float u, float below, float skinDepth, float inside, float renal) {
  vec3 q = spleenLocal(u, m.z, below);
  vec3 r = uSpleenR.xyz;
  vec3 k = q / r;
  float k1 = length(k);
  float k2 = length(k / r);
  float d0 = k2 > 0.0 ? k1 * (k1 - 1.0) / k2 : -min(r.x, min(r.y, r.z));
  float cone = sdRoundCone(q, poleStart(), uSpleenPole.xyz, ${g(SPLEEN_POLE.ra)}, ${g(SPLEEN_POLE.rb)});
  float d = max(smoothMin(d0, cone, ${g(SPLEEN_POLE.blendMm)}), inside - ${g(SPLEEN_MAX_INSIDE_MM)});
  return max(smoothMax(d, -renal, ${SPLEEN_KIDNEY_ROUND_MM.toFixed(1)}), skinDepth - (uCurtain.z + uSpleenR.z));
}
`;
