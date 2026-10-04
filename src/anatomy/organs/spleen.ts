import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import type { Torso } from '../primitives';
import { ribTableZ, type RibCage } from './ribcage';
import { smoothMax } from './liver';
import { wallArc } from './wall';

/**
 * El bazo bajo la cúpula izquierda (lus-sim, decisiones 37 y 43; VExUS no lo tiene), del tamaño y la forma de un adulto normal.
 *
 * Tamaño (decisión 43): el de la mayor cohorte de sanos, Chow y cols. (ecografía, 1230 donantes; sus tablas por talla y sexo,
 * recogidas en la revisión de Lucius y cols.), para el avatar (varón de ≈ 176 cm): 11 cm de largo, 6,5 de ancho y 4 de grueso
 * (Gray: 12 × 7 × 3–4; Lucius y cols. dan 11 × 7 × 4 cm y 160 mL como el bazo normal típico). Un bazo de más de 12–13 cm es
 * esplenomegalia: no va por omisión.
 *
 * Sitio (decisión 43): el de la TC en supino (Mirjalili y cols.; Shen y cols., texto completo): entre las costillas 10.ª y 12.ª,
 * con el eje largo a lo largo de la 11.ª, y dentro de la parrilla, como el bazo normal de Gray (su cara diafragmática, tras las
 * costillas 9.ª–11.ª; su borde posterior, en el borde inferior de la 11.ª): tan adelante como lo deja el reborde costal. Su
 * extremo anterior queda entonces por delante de la línea axilar media, dentro de la distribución de Shen y cols. (26,6 ± 23,3
 * mm). Las marcas de superficie de Gray (el eje en la 10.ª costilla, el punto más alto a 4 cm de la línea media en T9, el más bajo
 * en la axilar media en L1) quedan a ≈ 16 cm en el avatar: no caben en un bazo normal, y manda la morfometría.
 *
 * Forma (Gray, «The Spleen»): la cara diafragmática, convexa y lisa, contra el diafragma; la visceral, cóncava. Modelo: una lámina
 * de su grueso en las coordenadas de la pared (el arco `wallArc` de su columna pasado a mm a la cara interna de la pared, la altura
 * z y la profundidad bajo el diafragma), con la huella de una elipse de su largo y su ancho y los bordes redondeados: su cara
 * diafragmática es la del diafragma (convexa con la pared) y la visceral, paralela a ella, cóncava vista desde dentro. Sus polos,
 * los extremos de la elipse; el borde anterior (el de arriba, delgado) y el posterior (el de abajo, romo, a lo largo de la 11.ª
 * costilla). La parte gástrica de la cara visceral, hundida (`gastricImpression…`), con el hilio en ella; la renal, la recorta la
 * impresión del riñón izquierdo (su grasa y su sombra, `renalImpression`). La clasificación lo mira tras la cúpula, la ZOA y el
 * hígado: arriba lo tapa el pulmón del receso. La distancia de las coordenadas de la pared no es euclídea lejos de su centro.
 *
 * TS y GLSL (uniforms `uSpleen*` del esquema único) viven aquí juntos.
 */
export const SPLEEN = defineParameters('anatomy.spleen', {
  lengthMm: {
    value: 110,
    unit: 'mm',
    range: [86, 134],
    evidence: 'documentado',
    sources: ['chow-bazo-2016', 'lucius-bazo-2025', 'gray-anatomia-1918'],
    note:
      'Chow y cols. (ecografía, 1230 adultos sanos; la tabla por talla y sexo, en la revisión de Lucius y cols.): el largo del varón ' +
      'de 175–179 cm, mediana 11,0 cm (percentiles 5–95: 8,6–13,4), el rango. Gray: unos 12 cm; Loftus y Metreweli y la revisión ' +
      'de Lucius ponen el límite de lo normal en 12–13 cm',
  },
  breadthMm: {
    value: 65,
    unit: 'mm',
    range: [41, 89],
    evidence: 'documentado',
    sources: ['chow-bazo-2016', 'lucius-bazo-2025', 'gray-anatomia-1918'],
    note: 'Chow y cols. (en Lucius y cols.): el ancho, 6,5 cm (percentiles 5–95: 4,1–8,9). Gray: 7 cm',
  },
  thicknessMm: {
    value: 40,
    unit: 'mm',
    range: [32, 67],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918', 'lucius-bazo-2025', 'chow-bazo-2016', 'caglar-bazo-2014'],
    note:
      'Gray: 3 o 4 cm de grueso; Lucius y cols., el bazo normal típico de 4 cm; Chow y cols. (en Lucius y cols.), la profundidad ' +
      'del hilio a la cara convexa, 4,5 cm (percentiles 5–95: 3,2–6,7, el rango); Caglar y cols. (TC, 212 adultos), 4,58 ± 0,8',
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
    value: 11,
    unit: 'costilla',
    range: [10, 11],
    evidence: 'documentado',
    sources: ['mirjalili-abdomen-2012', 'shen-superficie-2016'],
    note:
      'TC en supino, al final de una inspiración tranquila: el eje largo a lo largo de la 11.ª costilla en el 55 % (Mirjalili y cols., ' +
      '108 adultos, resumen) y el 60 % (Shen y cols., 100 adultos, texto completo; la 10.ª, en el 34 %); el bazo, entre la 10.ª y la ' +
      '12.ª en el 48 y el 47 %. Gray lo ponía en la 10.ª',
  },
  anteriorToMidaxillaryMm: {
    value: 26.6,
    unit: 'mm',
    range: [3.3, 49.9],
    evidence: 'documentado',
    sources: ['shen-superficie-2016'],
    note:
      'Shen y cols. (TC): el bazo pasaba por delante de la línea axilar media en el 85 %, 26,6 ± 23,3 mm (su línea, en el corte ' +
      'sagital, a medio camino del ángulo xifoesternal a la cara posterior de la columna); el rango, ± 1 DE. En TC al final de una ' +
      'inspiración tranquila; el modelo está en FRC. No construye el bazo: lo pone el reborde costal (`buildSpleen`) y las pruebas ' +
      'comprueban que su extremo anterior cae en el rango',
  },
  borderRoundMm: {
    value: 20,
    unit: 'mm',
    range: [10, 25],
    evidence: 'estimado',
    sources: [],
    note:
      'El redondeo de sus bordes y sus polos (el mínimo suave de la huella y la cara visceral): la mitad del grueso [SUPUESTO]; el ' +
      'perfil del borde, NO ENCONTRADO',
  },
  gastricImpressionMm: {
    value: 10,
    unit: 'mm',
    range: [5, 15],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray: la cara visceral, partida por una cresta en una parte gástrica ancha y cóncava (con el hilio) y una renal más plana. ' +
      'Lo que se hunde la gástrica, [SUPUESTO]; su medida, NO ENCONTRADA',
  },
  gastricImpressionRadiusMm: {
    value: 50,
    unit: 'mm',
    range: [40, 70],
    evidence: 'estimado',
    sources: [],
    note: 'El radio de la esfera que hunde la parte gástrica (una huella de ≈ 6 cm con 10 mm de hondo) [SUPUESTO]',
  },
});

/** El bazo de la escena (sube a la GPU en `uSpleen*`). */
export interface SpleenShape {
  /** Centro: arco de la pared (u > 0, a la izquierda) y z. */
  readonly u0: number;
  readonly z0: number;
  /** Coseno y seno del eje largo en el plano (arco en mm, z): la pendiente de la 11.ª costilla en el centro. */
  readonly cos: number;
  readonly sin: number;
  /** mm por unidad de arco en la cara interna de la pared (el centro de la lámina está en el diafragma). */
  readonly arcScale: number;
  /** Semiejes del largo y el ancho, y el grueso entero (hacia dentro). */
  readonly radii: Vec3;
  /**
   * Profundidad máxima bajo la piel (mm): la de la rampa de la cúpula junto a la pared (`rimFarMm`) más el grueso. Las
   * coordenadas de la pared siguen la dirección radial del tronco: sin esta cota, la lámina seguiría bajo la cúpula hasta
   * el centro del tronco.
   */
  readonly maxSkinDepth: number;
}

/** Punto a la profundidad `d` (mm bajo la piel, por la dirección radial del tronco) bajo el punto de la piel del arco u y la altura z. */
export function pointAtArc(u: number, z: number, d: number, t: Torso): Vec3 {
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
 * El reborde costal izquierdo bajo el arco u (la z de su borde inferior): el de la 10.ª costilla por delante de la punta libre de la
 * 11.ª, entre las puntas de la 11.ª y la 12.ª la línea que las une (el flanco, sin costilla) y detrás, el de la 12.ª.
 */
export function costalMarginZ(cage: RibCage, u: number): number {
  const rib = (n: number) => cage.ribs.findIndex((r) => r.number === n && r.side === 1);
  const low = (k: number, at: number) => ribTableZ(cage, k, at) - cage.ribs[k].halfWidth;
  const [k10, k11, k12] = [rib(10), rib(11), rib(12)];
  const t11 = cage.ribs[k11].uEnd;
  const t12 = cage.ribs[k12].uEnd;
  if (u < t11) return low(k10, u);
  if (u >= t12) return low(k12, u);
  const a = low(k11, t11);
  return a + ((low(k12, t12) - a) * (u - t11)) / (t12 - t11);
}

/**
 * Lo que la huella del bazo (la elipse de su largo y su ancho en la pared) pasa bajo el reborde costal por delante de la punta de la
 * 12.ª costilla (mm; ≤ 0 si queda dentro de la parrilla). Detrás, su borde posterior baja hasta la 12.ª (la banda de la TC).
 */
export function spleenBelowMarginMm(s: SpleenShape, cage: RibCage): number {
  const t12 = cage.ribs[cage.ribs.findIndex((r) => r.number === 12 && r.side === 1)].uEnd;
  const [A, B] = s.radii;
  let worst = -Infinity;
  for (let i = 0; i < SPLEEN_OUTLINE_SAMPLES; i++) {
    const th = (2 * Math.PI * i) / SPLEEN_OUTLINE_SAMPLES;
    const along = A * Math.cos(th);
    const across = B * Math.sin(th);
    const u = s.u0 + (along * s.cos - across * s.sin) / s.arcScale;
    if (u >= t12) continue;
    worst = Math.max(worst, costalMarginZ(cage, u) - (s.z0 + along * s.sin + across * s.cos));
  }
  return worst;
}
const SPLEEN_OUTLINE_SAMPLES = 360;
/** La búsqueda del centro del bazo (mm de arco): desde delante de la axilar media hasta detrás de ella. */
export const SPLEEN_SEARCH_AHEAD_MM = 40;
export const SPLEEN_SEARCH_BEHIND_MM = 200;

/**
 * Construye el bazo normal (decisión 43): el eje largo con la pendiente de la 11.ª costilla izquierda en su centro y el centro en
 * ella, tan adelante como lo deja el reborde costal (`spleenBelowMarginMm` ≤ 0): el bazo normal no pasa de la parrilla (Gray; la
 * TC, entre la 10.ª y la 12.ª). `wallMm`: el grosor de la pared en el (u, z).
 */
export function buildSpleen(
  t: Torso,
  cage: RibCage,
  midaxillaryU: number,
  wallMm: (u: number, z: number) => number,
  rimFarMm: number,
): SpleenShape {
  const P = SPLEEN.params;
  const k = cage.ribs.findIndex((r) => r.number === P.axisRib.value && r.side === 1);
  const zRib = (u: number) => ribTableZ(cage, k, u);
  const A = 0.5 * P.lengthMm.value;
  const B = 0.5 * P.breadthMm.value;
  const T = P.thicknessMm.value;
  const at = (u0: number): SpleenShape => {
    const z0 = zRib(u0);
    const depth = wallMm(u0, z0);
    const pa = pointAtArc(u0 - 1, z0, depth, t);
    const pb = pointAtArc(u0 + 1, z0, depth, t);
    const arcScale = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 2;
    const dz = (zRib(u0 + 2) - zRib(u0 - 2)) / 4;
    const len = Math.hypot(arcScale, dz);
    return { u0, z0, cos: arcScale / len, sin: dz / len, arcScale, radii: [A, B, T], maxSkinDepth: rimFarMm + T };
  };
  // de delante atrás, el primer centro con la huella dentro de la parrilla (lo que pasa del reborde baja al correr el centro atrás)
  const inside = (u0: number) => spleenBelowMarginMm(at(u0), cage) <= 0;
  const start = midaxillaryU - SPLEEN_SEARCH_AHEAD_MM;
  const end = midaxillaryU + SPLEEN_SEARCH_BEHIND_MM;
  // el punto de partida tiene que pasar del reborde: si no, el bazo podría ir aún más adelante y la búsqueda no lo vería
  if (inside(start))
    throw new Error(`buildSpleen: el bazo ya cabe en la parrilla en el arco ${start.toFixed(1)}; adelanta el punto de partida`);
  let hi = start;
  while (!inside(hi)) {
    hi += 2;
    if (hi > end)
      throw new Error(`buildSpleen: ningún centro entre los arcos ${start.toFixed(1)} y ${end.toFixed(1)} deja el bazo en la parrilla`);
  }
  let lo = hi - 2;
  for (let i = 0; i < 30; i++) {
    const mid = 0.5 * (lo + hi);
    if (inside(mid)) hi = mid;
    else lo = mid;
  }
  return at(hi);
}

/** Coordenadas locales del bazo (largo, ancho, grueso; mm) en (u, z, inside) de la pared (gemelo GLSL con el mismo nombre). */
export function spleenLocal(u: number, z: number, inside: number, s: SpleenShape): Vec3 {
  const a = (u - s.u0) * s.arcScale;
  const b = z - s.z0;
  return [a * s.cos + b * s.sin, -a * s.sin + b * s.cos, inside];
}

/**
 * La parte gástrica de la cara visceral (decisión 43, marco local): el centro de la esfera que la hunde, sobre la mitad de arriba
 * (la del borde anterior) y `gastricImpressionMm` más hondo que la cara visceral menos su radio.
 */
export function gastricImpressionCenter(s: SpleenShape): Vec3 {
  const P = SPLEEN.params;
  return [0, SPLEEN_GASTRIC_ACROSS * s.radii[1], s.radii[2] + P.gastricImpressionRadiusMm.value - P.gastricImpressionMm.value];
}
/** La parte gástrica va sobre la mitad de arriba de la cara visceral, a esta fracción del semiancho [SUPUESTO]. */
export const SPLEEN_GASTRIC_ACROSS = 0.4;

/**
 * Distancia con signo al bazo, negativa dentro, sin la cúpula ni la pared (las pone la clasificación), con la impresión del riñón
 * izquierdo (`renal`, `renalImpression`: su grasa y su sombra; gemelo GLSL con el mismo nombre). `u`: el arco de la columna del
 * punto; `below`: su profundidad bajo el diafragma (la cara abdominal de la cúpula, o la de la ZOA o la pared): su cara
 * diafragmática sigue al diafragma; `skinDepth`: su profundidad bajo la piel (`maxSkinDepth`); `inside`, bajo la cara interna de
 * la pared (no pasa de `SPLEEN_MAX_INSIDE_MM`). La lámina: la huella elíptica (largo y ancho) y la cara visceral a su grueso, con
 * los bordes redondeados; la parte gástrica, hundida.
 */
export function spleenSdf(m: Vec3, u: number, below: number, skinDepth: number, inside: number, s: SpleenShape, renal: number): number {
  const P = SPLEEN.params;
  const q = spleenLocal(u, m[2], below, s);
  const [A, B, T] = s.radii;
  const kx = q[0] / A;
  const ky = q[1] / B;
  const k1 = Math.hypot(kx, ky);
  const k2 = Math.hypot(kx / A, ky / B);
  const foot = k2 > 0 ? (k1 * (k1 - 1)) / k2 : -Math.min(A, B);
  let d = smoothMax(foot, q[2] - T, P.borderRoundMm.value);
  const c = gastricImpressionCenter(s);
  const dg = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) - P.gastricImpressionRadiusMm.value;
  d = smoothMax(d, -dg, SPLEEN_GASTRIC_ROUND_MM);
  d = Math.max(d, inside - SPLEEN_MAX_INSIDE_MM);
  return Math.max(smoothMax(d, -renal, SPLEEN_KIDNEY_ROUND_MM), skinDepth - s.maxSkinDepth);
}
/** Redondeo del borde de la parte gástrica (mm) [SUPUESTO]. */
export const SPLEEN_GASTRIC_ROUND_MM = 6;

/**
 * El bazo solo se evalúa cerca de donde puede estar (gemelo GLSL con el mismo nombre): a la izquierda de x `SPLEEN_X_MIN_MM`
 * (el modelo lo pone lejos de la línea media) y a menos de `maxSkinDepth` más `SPLEEN_NEAR_MARGIN_MM` bajo la piel. Fuera,
 * su distancia pasa de 2 × el tope del «resto» (5 mm por `ORGAN_SDF_LIPSCHITZ`) y la clasificación la toma por lejana (1e3).
 */
export function spleenCandidate(m: Vec3, skinDepth: number, s: SpleenShape): boolean {
  return m[0] > SPLEEN_X_MIN_MM && skinDepth < s.maxSkinDepth + SPLEEN_NEAR_MARGIN_MM;
}
export const SPLEEN_X_MIN_MM = 15;
export const SPLEEN_NEAR_MARGIN_MM = 25;

/**
 * lus-sim (decisión 43): el bazo no pasa de esto (mm) bajo la cara interna de la pared, su grueso más 5. Su profundidad bajo el
 * diafragma (`below`) es la altura bajo la cúpula: donde el arco de la pared llega a la espalda, bajo la cúpula seguía hacia
 * dentro hasta la columna (en la decisión 37, en la mujer obesa, a 83 mm de la pared).
 */
export const SPLEEN_MAX_INSIDE_MM = SPLEEN.params.thicknessMm.value + 5;

/** Redondeo de la impresión renal en el bazo (mm, el del hígado). */
export const SPLEEN_KIDNEY_ROUND_MM = 8;

/**
 * Gemelo GLSL. Uniforms: `uSpleen` (u0, z0, cos, sen) y `uSpleenR` (semiejes del largo y el ancho, el grueso, la escala del arco);
 * `maxSkinDepth` es `uCurtain.z` (la cota de la rampa de la cúpula, `rimFarMm`) más el grueso. `smoothMax`, la del módulo del
 * riñón.
 */
const g = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const SP = SPLEEN.params;

export const SPLEEN_GLSL = /* glsl */ `
bool spleenCandidate(vec3 m, float skinDepth) {
  return m.x > ${SPLEEN_X_MIN_MM.toFixed(1)} && skinDepth < uCurtain.z + uSpleenR.z + ${SPLEEN_NEAR_MARGIN_MM.toFixed(1)};
}
vec3 spleenLocal(float u, float z, float inside) {
  float a = (u - uSpleen.x) * uSpleenR.w;
  float b = z - uSpleen.y;
  return vec3(a * uSpleen.z + b * uSpleen.w, -a * uSpleen.w + b * uSpleen.z, inside);
}
vec3 gastricImpressionCenter() {
  return vec3(0.0, ${g(SPLEEN_GASTRIC_ACROSS)} * uSpleenR.y, uSpleenR.z + ${g(SP.gastricImpressionRadiusMm.value - SP.gastricImpressionMm.value)});
}
float spleenSdf(vec3 m, float u, float below, float skinDepth, float inside, float renal) {
  vec3 q = spleenLocal(u, m.z, below);
  vec2 r = uSpleenR.xy;
  vec2 k = q.xy / r;
  float k1 = length(k);
  float k2 = length(k / r);
  float foot = k2 > 0.0 ? k1 * (k1 - 1.0) / k2 : -min(r.x, r.y);
  float d = smoothMax(foot, q.z - uSpleenR.z, ${g(SP.borderRoundMm.value)});
  float dg = distance(q, gastricImpressionCenter()) - ${g(SP.gastricImpressionRadiusMm.value)};
  d = smoothMax(d, -dg, ${g(SPLEEN_GASTRIC_ROUND_MM)});
  d = max(d, inside - ${g(SPLEEN_MAX_INSIDE_MM)});
  return max(smoothMax(d, -renal, ${SPLEEN_KIDNEY_ROUND_MM.toFixed(1)}), skinDepth - (uCurtain.z + uSpleenR.z));
}
`;
