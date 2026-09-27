import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import { torsoDepth, type LungBorderLookup, type Torso } from '../primitives';
import { thoraxLinePhi } from '../thoraxLines';
import { CHEST_WALL_BASE, CHEST_WALL_COLS, CHEST_WALL_DU_MM, CHEST_WALL_TEXELS, pchip, type ChestWall } from './chestWall';
import { RIBCAGE, ribLineArc, ribTableZ, type RibCage } from './ribcage';
import { wallArc, wallPerimeter } from './wall';

/**
 * Bordes del pulmón y de la pleura frente a la parrilla (lus-sim, decisión 18, paso C3): la base da, en fin de espiración
 * (FRC), el borde inferior del pulmón en la 6.ª costilla de la LMC, la 8.ª de la LAM y la apófisis espinosa de T10 detrás, y
 * la reflexión pleural (el fondo del seno costofrénico) en el 8.º cartílago, la 10.ª costilla y T12 (Gray, «Surface Markings
 * of the Thorax» y «The Pleuræ»; `docs/knowledge/anatomy.md` §1.5). Antes el borde era el de las cúpulas de VExUS, unas dos
 * costillas más arriba (la limitación `lung-border-above-ribcage`, que esta decisión borra).
 *
 * Modelo, por columna de |u| (el arco de la piel, la columna de la pared torácica), en la cara interna de la pared:
 *  - `zL`, el borde del pulmón en FRC: la altura a la que la cúpula toca la pared. La cúpula (`primitives.diaphragmHeight`)
 *    sube de ahí hacia su vértice en una rampa de `rimBlendMm` (el ángulo costofrénico agudo): la cúpula de VExUS, lejos de
 *    la pared, y junto a ella `zL + (D − zL)·s(w)`, con w la profundidad bajo la cara interna y s(w) = 1 − (1 − w/wB)²;
 *  - `zR`, la reflexión pleural: lo más bajo a lo que llega la lámina de la cortina (el pulmón que entra en el seno al
 *    inspirar, `organs/lungCurtain.ts`), que baja desde `zL` con el diafragma;
 *  - la zona de aposición (ZOA): bajo el borde del pulmón el diafragma queda contra la pared, una lámina de `zoaFrcMm` que
 *    engruesa al inspirar (`zoaThicknessMm`), hasta `zoaBelowReflectionMm` bajo la reflexión (su inserción costal).
 *  - `Wrim`, el grosor de la pared (radial) a la altura del borde: la profundidad w de la rampa no depende de z (la cúpula
 *    sigue siendo una altura sobre el plano).
 * Los anclajes son costillas numeradas en las líneas del tórax (la parrilla del paso C1, decisión 16) y vértebras detrás;
 * entre ellos, una interpolación monótona en |u|. La misma tabla para los dos lados (la base no distingue); la ventana
 * cardiaca izquierda es del corazón (`organs/heart.ts`).
 *
 * TS y GLSL (la tabla en la textura de escena, tras la de la pared torácica) viven aquí juntos.
 */
export const LUNG_BORDER = defineParameters('anatomy.lungBorder', {
  borderParasternalRib: {
    value: 6,
    unit: 'costilla',
    range: [5, 6],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'El borde anterior del pulmón derecho baja tras el esternón hasta la 6.ª articulación condroesternal («Surface ' +
      'Markings of the Thorax»): en la paraesternal, el centro del 6.º cartílago. El izquierdo se aparta en la incisura ' +
      'cardiaca desde el 4.º (el corazón, `organs/heart.ts`)',
  },
  borderMidclavicularRib: {
    value: 6,
    unit: 'costilla',
    range: [6, 6],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Borde inferior del pulmón en espiración: la 6.ª costilla en la LMC (Gray; anatomy.md §1.5)',
  },
  borderMidaxillaryRib: {
    value: 8,
    unit: 'costilla',
    range: [8, 8],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Borde inferior del pulmón en espiración: la 8.ª costilla en la LAM (Gray; meta A-T13)',
  },
  borderPosteriorVertebra: {
    value: 11,
    unit: 'vértebra',
    range: [11, 12.5],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918', 'mirjalili-superficie-2012'],
    note:
      'Detrás, la apófisis espinosa de T10 (Gray, espiración), cuya punta queda a la altura del cuerpo de T11: z = (9,5 − 11)' +
      '·segmento torácico en la paravertebral. [DISCREPANCIA]: la TAC en supino y fin de inspiración corriente lo pone junto a ' +
      'T12 (Mirjalili): el rango llega a T12–L1',
  },
  reflectionParasternalRib: {
    value: 7,
    unit: 'costilla',
    range: [6, 7],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'La reflexión pleural anterior pasa tras el 7.º cartílago, junto a la unión xifoesternal («The Pleuræ»)',
  },
  reflectionMidclavicularRib: {
    value: 8,
    unit: 'costilla',
    range: [8, 8],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Reflexión pleural inferior: la 8.ª unión condrocostal en la línea mamaria; en la LMC, el 8.º cartílago',
  },
  reflectionMidaxillaryRib: {
    value: 10,
    unit: 'costilla',
    range: [10, 10],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Reflexión pleural inferior: la 10.ª costilla en la LAM (Gray; meta A-T13)',
  },
  reflectionPosteriorVertebra: {
    value: 13,
    unit: 'vértebra',
    range: [12, 13.5],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Detrás, la apófisis espinosa de T12 («a veces hasta L1»), cuya punta queda a la altura del cuerpo de L1 (la 13.ª ' +
      'vértebra desde T1): z = (9,5 − 13)·segmento torácico',
  },
  zoaBelowReflectionMm: {
    value: 20,
    unit: 'mm',
    range: [10, 40],
    evidence: 'estimado',
    sources: [],
    note:
      'Bajo la reflexión el diafragma sigue contra la pared hasta su inserción costal [SUPUESTO: un espacio intercostal]; la ' +
      'longitud de la ZOA es NO ENCONTRADO en la base (anatomy.md §1.5)',
  },
  rimBlendMm: {
    value: 40,
    unit: 'mm',
    range: [25, 60],
    evidence: 'estimado',
    sources: [],
    note:
      'Rampa de la cúpula junto a la pared [SUPUESTO]: s(w) = 1 − (1 − w/40)² lleva la altura de la cúpula de VExUS al borde ' +
      'del pulmón en la cara interna; la pendiente en el borde, 2·(D − zL)/40, da el ángulo costofrénico agudo (≈ 35° con la ' +
      'pared al lado, donde la cúpula queda ≈ 30 mm sobre el borde)',
  },
  curtainDescentRatio: {
    value: 1,
    unit: '1',
    range: [0.5, 1],
    evidence: 'estimado',
    sources: [],
    note: 'El borde del pulmón baja lo que el diafragma [SUPUESTO de la base: «el borde lateral del pulmón se desplaza como el domo», A-T13]',
  },
  rightDomeIcs: {
    value: 5,
    unit: 'EIC',
    range: [4, 6],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note:
      'Cúpula derecha en FRC: el 5.º EIC anterior (anatomy.md §2: Gray la pone en el 4.º cartílago tras la espiración ' +
      'forzada; en FRC queda algo más baja), el centro del EIC5 en la paraesternal',
  },
  leftDomeDropMm: {
    value: 15,
    unit: 'mm',
    range: [10, 20],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'La cúpula izquierda, más baja que la derecha [SUPUESTO de la base: 1–2 cm; Gray solo dice «algo más baja»]',
  },
  zoaFrcMm: {
    value: 1.9,
    unit: 'mm',
    range: [1.5, 2.7],
    evidence: 'documentado',
    sources: ['santana-diafragmarevision-2020'],
    note: 'Grosor del diafragma en la ZOA en FRC, supino: varones 1,9 ± 0,4 mm (Carrillo-Esper, vía Santana, tabla 2)',
  },
  zoaTlcMm: {
    value: 5,
    unit: 'mm',
    range: [4, 6],
    evidence: 'derivado',
    sources: ['ueki-espesordiafragma-1995', 'santana-diafragmarevision-2020'],
    note: 'Grosor en la ZOA a TLC: 4,5 ± 0,9 (Ueki) y varones 5,6 ± 0,9 (Cardenas, vía Santana): 5,0, cociente 2,6 sobre FRC',
  },
  zoaTlcCaudalMm: {
    value: 30,
    unit: 'mm',
    range: [30, 53],
    evidence: 'estimado',
    sources: [],
    note:
      'El descenso del diafragma que se toma por TLC: la inspiración profunda del modelo (`RespiratoryModel`, 30 mm); la base ' +
      'da 5,3 cm en supino (Kantarci), así que el engrosamiento llega a TLC antes',
  },
});

/**
 * Tope de la distancia a la frontera del pulmón del tórax (mm): más arriba que la cúpula más alta (`LungBorder.domeTopZ`)
 * más este tope, la clasificación no evalúa la cúpula (su distancia pasaría del tope). La pasada B solo mira si la distancia
 * pasa de la media anchura en elevación (≤ 3 mm).
 */
export const LUNG_BD_CAP_MM = 10;

/** Tabla por columna de |u| (la de la pared torácica: mismas columnas y paso): (zL, zR, Wrim, zAtt), un téxel. */
export const LUNG_BORDER_TEXELS_PER_COL = 1;
export const LUNG_BORDER_TEXELS = CHEST_WALL_COLS * LUNG_BORDER_TEXELS_PER_COL;
/** Téxel de la textura de escena donde empieza la tabla: tras la de la pared torácica. */
export const LUNG_BORDER_BASE = CHEST_WALL_BASE + CHEST_WALL_TEXELS;

/** Los anclajes de la tabla (|u| de la línea media de las costillas bajo cada línea), para las pruebas. */
export interface LungBorderStations {
  parasternal: number;
  midclavicular: number;
  midaxillary: number;
  paravertebral: number;
  posteriorMidline: number;
}

export interface LungBorder extends LungBorderLookup {
  /** `LUNG_BORDER_TEXELS` téxeles RGBA (float32, como en la GPU): (zL, zR, Wrim, zAtt). */
  table: Float32Array;
  /** Cota de la profundidad bajo la piel desde la que la cúpula no mira la tabla: el mayor Wrim más la rampa. */
  rimFarMm: number;
  /** El borde más alto de la tabla (la cúpula no pasa de él ni de sus vértices: la rampa va del borde a la de VExUS). */
  zLMax: number;
  stations: LungBorderStations;
}

/** Altura (z) del centro de la costilla n (1–12) en |u| (de la tabla de la parrilla, la del lado derecho: son simétricas). */
function ribZ(cage: RibCage, n: number, au: number): number {
  return ribTableZ(cage, n - 1, au);
}

/**
 * La tabla con la parrilla y la pared construidas: los anclajes en la paraesternal, la LMC, la LAM, la paravertebral y la
 * línea media posterior (la de la paravertebral), interpolados en |u| (Fritsch–Carlson); delante de la paraesternal, la de
 * ella (el esternón).
 */
export function buildLungBorder(t: Torso, cage: RibCage, cw: ChestWall): LungBorder {
  const P = LUNG_BORDER.params;
  const seg = RIBCAGE.params.thoracicSegmentMm.value;
  const vertebraZ = (n: number) => (9.5 - n) * seg;
  const st: LungBorderStations = {
    parasternal: cage.stations.parasternal,
    midclavicular: cage.stations.midclavicular,
    midaxillary: cage.stations.midaxillary,
    paravertebral: ribLineArc(thoraxLinePhi('paravertebral', t), t, cage),
    posteriorMidline: 0.5 * wallPerimeter(t),
  };
  const us = [st.parasternal, st.midclavicular, st.midaxillary, st.paravertebral, st.posteriorMidline];
  const zL = pchip(us, [
    ribZ(cage, P.borderParasternalRib.value, st.parasternal),
    ribZ(cage, P.borderMidclavicularRib.value, st.midclavicular),
    ribZ(cage, P.borderMidaxillaryRib.value, st.midaxillary),
    vertebraZ(P.borderPosteriorVertebra.value),
    vertebraZ(P.borderPosteriorVertebra.value),
  ]);
  const zR = pchip(us, [
    ribZ(cage, P.reflectionParasternalRib.value, st.parasternal),
    ribZ(cage, P.reflectionMidclavicularRib.value, st.midclavicular),
    ribZ(cage, P.reflectionMidaxillaryRib.value, st.midaxillary),
    vertebraZ(P.reflectionPosteriorVertebra.value),
    vertebraZ(P.reflectionPosteriorVertebra.value),
  ]);
  const table = new Float32Array(LUNG_BORDER_TEXELS * 4);
  let rimMax = 0;
  let zLMax = -Infinity;
  for (let j = 0; j < CHEST_WALL_COLS; j++) {
    const u = j * CHEST_WALL_DU_MM;
    const l = zL(u);
    const r = zR(u);
    const W = cw.total(u, l);
    rimMax = Math.max(rimMax, W);
    zLMax = Math.max(zLMax, Math.fround(l));
    table.set([l, r, W, r - P.zoaBelowReflectionMm.value], j * LUNG_BORDER_TEXELS_PER_COL * 4);
  }
  const lb: LungBorder = {
    table,
    rimFarMm: rimMax + P.rimBlendMm.value,
    zLMax,
    stations: st,
    at: (u) => lungBorderAt(lb, u),
    rim: (x, y, D) => diaphragmRim(lb, x, y, D, t),
  };
  return lb;
}

const mix = (a: number, b: number, f: number): number => a * (1 - f) + b * f;

/** (zL, zR, Wrim, zAtt) en |u|, interpolados entre columnas como en la GPU (gemelo GLSL con el mismo nombre). */
export function lungBorderAt(lb: Pick<LungBorder, 'table'>, u: number): [number, number, number, number] {
  const tc = Math.min(Math.abs(u) / CHEST_WALL_DU_MM, CHEST_WALL_COLS - 1 - 1e-4);
  const j = Math.floor(tc);
  const f = tc - j;
  const a = j * LUNG_BORDER_TEXELS_PER_COL * 4;
  const b = a + LUNG_BORDER_TEXELS_PER_COL * 4;
  const T = lb.table;
  return [mix(T[a], T[b], f), mix(T[a + 1], T[b + 1], f), mix(T[a + 2], T[b + 2], f), mix(T[a + 3], T[b + 3], f)];
}

/** Peso de la cúpula de VExUS a la profundidad w bajo la cara interna de la pared: 0 en ella, 1 desde `rimBlendMm`. */
export function rimWeight(w: number): number {
  const wB = LUNG_BORDER.params.rimBlendMm.value;
  if (w <= 0) return 0;
  if (w >= wB) return 1;
  const q = 1 - w / wB;
  return 1 - q * q;
}

/**
 * Altura del diafragma en (x, y) con el borde del pulmón (gemelo GLSL `domeRim`): la de la cúpula de VExUS, D, lejos de
 * la pared; junto a ella, la rampa que baja a `zL` en su cara interna. Más hondo que `rimFarMm` bajo la piel (la rampa ya
 * vale 1 en toda columna) no lee la tabla.
 */
export function diaphragmRim(lb: Pick<LungBorder, 'table' | 'rimFarMm'>, x: number, y: number, D: number, t: Torso): number {
  const p: Vec3 = [x, y, 0];
  const d = -torsoDepth(p, t);
  if (d >= lb.rimFarMm) return D;
  const b = lungBorderAt(lb, wallArc(p, t));
  const w = d - b[2];
  if (w >= LUNG_BORDER.params.rimBlendMm.value) return D;
  return b[0] + (D - b[0]) * rimWeight(w);
}

/**
 * Borde caudal del pulmón que toca la pared en |u| con el diafragma bajado `caudalMm`: el de FRC menos el descenso, sin
 * pasar de la reflexión pleural (gemelo GLSL con el mismo nombre, con el descenso ya multiplicado en `uCurtain.x`).
 */
export function lungEdgeZ(lb: Pick<LungBorder, 'table'>, u: number, caudalMm: number): number {
  const b = lungBorderAt(lb, u);
  return Math.max(b[1], b[0] - LUNG_BORDER.params.curtainDescentRatio.value * Math.max(caudalMm, 0));
}

/** Grosor del diafragma en la ZOA (mm) con el descenso `caudalMm`: de FRC a TLC, lineal (gemelo GLSL). */
export function zoaThicknessMm(caudalMm: number): number {
  const P = LUNG_BORDER.params;
  const f = Math.min(Math.max(caudalMm, 0) / P.zoaTlcCaudalMm.value, 1);
  return P.zoaFrcMm.value + (P.zoaTlcMm.value - P.zoaFrcMm.value) * f;
}

/**
 * Distancia a la frontera (≥ 0) si el punto está en la lámina del diafragma de la ZOA, `null` si no: a menos del grosor de
 * la ZOA bajo la cara interna de la pared (`insideWallMm`), entre su inserción (`zAtt`) y el borde del pulmón en FRC (gemelo
 * GLSL con el mismo nombre). La lámina de la cortina, que se mira antes, la tapa donde el pulmón ha bajado.
 */
export function zoaDistance(lb: Pick<LungBorder, 'table'>, m: Vec3, insideWallMm: number, u: number, caudalMm: number): number | null {
  const t = zoaThicknessMm(caudalMm);
  if (insideWallMm < 0 || insideWallMm >= t) return null;
  const b = lungBorderAt(lb, u);
  if (m[2] >= b[0] || m[2] < b[3]) return null;
  return Math.min(insideWallMm, t - insideWallMm, b[0] - m[2], m[2] - b[3]);
}

/**
 * Cota de la distancia a la cara abdominal de la lámina de la ZOA para lo que queda debajo (el «resto»): |w − grosor|
 * entre la inserción y el borde del pulmón en FRC, 1e3 fuera (gemelo GLSL).
 */
export function zoaGap(lb: Pick<LungBorder, 'table'>, m: Vec3, insideWallMm: number, u: number, caudalMm: number): number {
  const b = lungBorderAt(lb, u);
  if (m[2] >= b[0] || m[2] < b[3]) return 1e3;
  return Math.abs(insideWallMm - zoaThicknessMm(caudalMm));
}

const f4 = (x: number): string => x.toFixed(4);
const PL = LUNG_BORDER.params;

/**
 * Gemelo GLSL. La tabla en la textura de escena (`sceneTexel`, desde `LB_BASE`), con las columnas de la pared torácica
 * (`cwColumn`); `uCurtain.x`, el descenso del borde (el del diafragma por `curtainDescentRatio`); `uCurtain.z`, la cota
 * `rimFarMm`; `uResp.x`, el descenso del diafragma. `domeRim` la usa `domeHeight` (declarada antes de los módulos).
 */
export const LUNG_BORDER_GLSL = /* glsl */ `
#define LB_BASE ${LUNG_BORDER_BASE}
#define LB_LUNG_CAP ${f4(LUNG_BD_CAP_MM)}
#define LB_RIM_MM ${f4(PL.rimBlendMm.value)}
#define LB_ZOA_FRC ${f4(PL.zoaFrcMm.value)}
#define LB_ZOA_TLC ${f4(PL.zoaTlcMm.value)}
#define LB_ZOA_TLC_CAUDAL ${f4(PL.zoaTlcCaudalMm.value)}
vec4 lungBorderAt(float u) {
  int j;
  float f = cwColumn(u, j);
  return mix(sceneTexel(LB_BASE + j * ${LUNG_BORDER_TEXELS_PER_COL}), sceneTexel(LB_BASE + (j + 1) * ${LUNG_BORDER_TEXELS_PER_COL}), f);
}
float rimWeight(float w) {
  if (w <= 0.0) return 0.0;
  if (w >= LB_RIM_MM) return 1.0;
  float q = 1.0 - w / LB_RIM_MM;
  return 1.0 - q * q;
}
float domeRim(float x, float y, float D) {
  vec3 p = vec3(x, y, 0.0);
  float d = -torsoDepth(p);
  if (d >= uCurtain.z) return D;
  vec4 b = lungBorderAt(wallArc(p));
  float w = d - b.z;
  if (w >= LB_RIM_MM) return D;
  return b.x + (D - b.x) * rimWeight(w);
}
float lungEdgeZ(float u) { vec4 b = lungBorderAt(u); return max(b.y, b.x - uCurtain.x); }
float zoaThicknessMm(float caudal) {
  return LB_ZOA_FRC + (LB_ZOA_TLC - LB_ZOA_FRC) * min(max(caudal, 0.0) / LB_ZOA_TLC_CAUDAL, 1.0);
}
float zoaGap(vec3 m, float insideWall, float u) {
  vec4 b = lungBorderAt(u);
  if (m.z >= b.x || m.z < b.w) return 1e3;
  return abs(insideWall - zoaThicknessMm(uResp.x));
}
float zoaDistance(vec3 m, float insideWall, float u) {
  float t = zoaThicknessMm(uResp.x);
  if (insideWall < 0.0 || insideWall >= t) return -1.0;
  vec4 b = lungBorderAt(u);
  if (m.z >= b.x || m.z < b.w) return -1.0;
  return min(min(insideWall, t - insideWall), min(b.x - m.z, m.z - b.w));
}
`;
