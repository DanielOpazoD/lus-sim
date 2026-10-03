import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import { orthonormalBasis, sdEllipsoidLocal, smoothMax, smoothMin } from '../primitives';
import { spinousTipZ } from './ribcage';

export { sdEllipsoidLocal, smoothMax, smoothMin } from '../primitives';

/**
 * Riñón como módulo de órgano (decisión 46): contorno en judía con escotadura hiliar, cápsula,
 * seno, pelvis y pirámides con columnas de Bertin (decisión 43). La consulta TS y su gemelo GLSL
 * viven aquí con el mismo nombre; las tablas del shader (pirámides, pelvis, escotadura, cápsula)
 * se generan desde las constantes TS.
 *
 * lus-sim (decisión 43): portado de VExUS (c6c81ad). El riñón, la escotadura, el seno, las pirámides, la pelvis, la cápsula y
 * la grasa perirrenal son los de VExUS; su sitio sale de la base (`KIDNEY`, `buildKidneys`): el polo superior a la altura de
 * la punta de la apófisis de T11 (el borde superior de T12, Gray; el lado superior del paralelogramo de Morris), el derecho
 * 1 cm más bajo, el centro entre las verticales de Morris (2,5 y 9,5 cm de la línea media) y a la profundidad de Xue y cols.
 * bajo la piel de la espalda (`kidneyCenterY`). Los ejes, los de VExUS, son constantes; la y de los centros sale del tronco
 * (`uTorso`), sin uniforms propios.
 * Detrás, el lecho del riñón es el retroperitoneo (`organs/retroperitoneum.ts`, también de VExUS).
 */
export const KIDNEY = defineParameters('anatomy.kidney', {
  topSpinous: {
    value: 11,
    unit: 'vértebra',
    range: [11, 11],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray («Surface Markings of the Abdomen»): el lado superior del paralelogramo de Morris, a la altura de la punta de la ' +
      'apófisis de T11; «The Kidneys»: sus extremos superiores, a la altura del borde superior de T12 (la misma altura en la ' +
      'parrilla del modelo)',
  },
  rightLowerMm: {
    value: 10,
    unit: 'mm',
    range: [0, 20],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: «The right kidney usually lies about 1 cm. lower than the left»',
  },
  centerXMm: {
    value: 60,
    unit: 'mm',
    range: [50, 70],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note: 'El centro, entre las verticales del paralelogramo de Morris (Gray: 2,5 y 9,5 cm de la línea media): (25 + 95)/2',
  },
  sagittalTiltRightDeg: {
    value: 25.8,
    unit: '°',
    range: [14.7, 36.9],
    evidence: 'documentado',
    sources: ['glodny-rinon-2009', 'kinnunen-urografia-1986'],
    note:
      'Glodny y cols. (TC de 64 cortes, 1040 adultos, texto completo): el giro en el plano sagital, polo superior frente al ' +
      'inferior respecto del plano coronal, 25,8 ± 11,1° el derecho; el rango, ± 1 DE. El sentido (el polo superior detrás) no lo ' +
      'dice la tabla: es el de Kinnunen (el eje largo en supino, 16 ± 5,8°, con el polo inferior hacia delante; solo el resumen). En ' +
      'VExUS, 10°',
  },
  sagittalTiltLeftDeg: {
    value: 24.3,
    unit: '°',
    range: [13.3, 35.3],
    evidence: 'documentado',
    sources: ['glodny-rinon-2009'],
    note: 'Glodny y cols.: el izquierdo, 24,3° (la fila de la tabla trae la DE y la mediana cambiadas: 11,0 y 23,8)',
  },
  coronalTiltDeg: {
    value: 16.8,
    unit: '°',
    range: [6.8, 28.1],
    evidence: 'documentado',
    sources: ['choi-eje-renal-2010'],
    note:
      'Choi y cols. (radiografías AP de 754 casos sin arteria accesoria): el ángulo del eje polo–polo con la línea de las espinosas ' +
      'de L1 a L5, 16,8° (6,8–28,1, sin DE): el polo superior medial. En VExUS, 12,4°',
  },
  hilumRotationRightDeg: {
    value: 29.7,
    unit: '°',
    range: [11.6, 47.8],
    evidence: 'derivado',
    sources: ['glodny-rinon-2009'],
    note:
      'Glodny y cols.: la pelvis renal forma con el plano sagital medio, en el corte axial, 60,3 ± 18,1° a la derecha: el hilio mira ' +
      'adentro y 90 − 60,3 = 29,7° hacia delante; el rango, ± 1 DE. En VExUS, 14°',
  },
  hilumRotationLeftDeg: {
    value: 36.5,
    unit: '°',
    range: [14, 59],
    evidence: 'derivado',
    sources: ['glodny-rinon-2009'],
    note: 'Glodny y cols.: a la izquierda, 53,5 ± 22,5°: 90 − 53,5 = 36,5° hacia delante',
  },
  depthLeftMm: {
    value: 68.2,
    unit: 'mm',
    range: [58.7, 77.7],
    evidence: 'documentado',
    sources: ['xue-rinon-2017'],
    note:
      'Xue y cols. (angio-TC, 167 donantes adultos): la profundidad del ' +
      'riñón izquierdo, la media de las distancias de la piel de la espalda a sus caras anterior y posterior a la altura del hilio, ' +
      '6,82 ± 0,95 cm; el rango, ± 1 DE',
  },
  depthRightMm: {
    value: 70.3,
    unit: 'mm',
    range: [60.4, 80.2],
    evidence: 'documentado',
    sources: ['xue-rinon-2017'],
    note: 'Xue y cols.: el derecho, 7,03 ± 0,99 cm; el rango, ± 1 DE',
  },
});

/**
 * Riñón implícito en un marco ortonormal propio: u = eje largo (hacia el polo
 * superior), v = hacia el hilio (medial), w = anterior. Elipsoide externo,
 * seno renal (elipsoide desplazado hacia el hilio + canal del hilio), pirámides
 * medulares en cuña alrededor del seno y columnas de Bertin entre ellas.
 * Dimensiones de un adulto (B.5): 110 × 55 × 45 mm, seno ≈ 60 × 22 mm
 * [EXTRAPOLACIÓN PROPIA para la disposición de las pirámides].
 */
export interface Kidney {
  kind: 'kidney';
  center: Vec3;
  radii: Vec3;
  u: Vec3;
  v: Vec3;
  w: Vec3;
  sinusRadii: Vec3;
  /** Desplazamiento del seno hacia el hilio a lo largo de v (mm). */
  sinusOffset: number;
  hilumRadius: number;
}

export type KidneyRegion = 'cortex' | 'medulla' | 'sinus' | 'pelvis';

export interface KidneyHit {
  /** Distancia con signo al contorno externo (mm, negativa dentro). */
  dOuter: number;
  /** Distancia con signo al seno (negativa dentro del seno); +∞ fuera del riñón (`dOuter ≥ 0`), donde no se evalúa. */
  dSinus: number;
  /** Fuera del riñón, `cortex` (no se evalúa). */
  region: KidneyRegion;
  /** Distancia a la interfaz más cercana dentro del riñón (mm); fuera, −dOuter. */
  inner: number;
}

/** Radio del canal del hilio (mm, el de VExUS). */
export const HILUM_RADIUS_MM = 7;
/**
 * Ejes del riñón k (0 el derecho, 1 el izquierdo): el eje largo con el polo superior medial (`coronalTiltDeg`) y posterior
 * (`sagittalTilt…Deg`), sus ángulos proyectados en los planos coronal y sagital (Gray: el eje largo, hacia abajo y afuera); el
 * hilio, medial y girado hacia delante (`hilumRotation…Deg`). En VExUS, u = (±0,22, −0,18, 1) y el hilio (±1, 0,25, 0).
 */
export function kidneyBasis(k: number): { u: Vec3; v: Vec3; w: Vec3 } {
  const P = KIDNEY.params;
  const medial = k === 0 ? 1 : -1;
  const rad = Math.PI / 180;
  const sag = (k === 0 ? P.sagittalTiltRightDeg : P.sagittalTiltLeftDeg).value * rad;
  const hil = (k === 0 ? P.hilumRotationRightDeg : P.hilumRotationLeftDeg).value * rad;
  return orthonormalBasis([medial * Math.tan(P.coronalTiltDeg.value * rad), -Math.tan(sag), 1], [medial * Math.cos(hil), Math.sin(hil), 0]);
}
export const KIDNEY_BASES = [kidneyBasis(0), kidneyBasis(1)] as const;

/**
 * Los dos riñones (0 el derecho, 1 el izquierdo), con la y de sus centros (`kidneyCenterY`): el centro a `centerXMm` de la línea
 * media; su punto más alto, a la altura de la punta de la apófisis de T11 (el derecho, `rightLowerMm` más abajo).
 */
export function buildKidneys(centerY: readonly [number, number]): [Kidney, Kidney] {
  const out = KIDNEY_BASES.map((basis, k) => {
    const kidney: Kidney = {
      kind: 'kidney',
      center: kidneyCenter(k, centerY[k]),
      radii: KIDNEY_RADII,
      ...basis,
      sinusRadii: KIDNEY_SINUS.radii,
      sinusOffset: KIDNEY_SINUS.offsetV,
      hilumRadius: HILUM_RADIUS_MM,
    };
    return kidney;
  });
  return [out[0], out[1]];
}

/** Centro del riñón k (0 el derecho) con la y de su centro (gemelo GLSL con el mismo nombre, que la calcula con `uTorso`). */
export function kidneyCenter(k: number, y: number): Vec3 {
  return [(k === 0 ? -1 : 1) * KIDNEY.params.centerXMm.value, y, kidneyCenterZ(k)];
}

/**
 * La y del centro del riñón k en el tronco de semiejes a × b: a la profundidad de Xue (`depthRightMm`, `depthLeftMm`) bajo la
 * piel de la espalda en su vertical (x = ∓`centerXMm`).
 */
export function kidneyCenterY(k: number, a: number, b: number): number {
  const P = KIDNEY.params;
  const x = P.centerXMm.value;
  return -b * Math.sqrt(1 - (x / a) * (x / a)) + (k === 0 ? P.depthRightMm.value : P.depthLeftMm.value);
}

/** z del centro del riñón k: su punto más alto (el semieje de cada eje por su componente z) en el borde superior de Gray. */
export function kidneyCenterZ(k: number): number {
  const P = KIDNEY.params;
  const { u, v, w } = KIDNEY_BASES[k];
  const r = KIDNEY_RADII;
  const top = spinousTipZ(P.topSpinous.value) - (k === 0 ? P.rightLowerMm.value : 0);
  return top - Math.hypot(r[0] * u[2], r[1] * v[2], r[2] * w[2]);
}

/** Coordenadas locales (u, v, w) de un punto respecto al riñón. */
export function kidneyLocal(p: Vec3, k: Kidney): Vec3 {
  const d: Vec3 = [p[0] - k.center[0], p[1] - k.center[1], p[2] - k.center[2]];
  return [
    d[0] * k.u[0] + d[1] * k.u[1] + d[2] * k.u[2],
    d[0] * k.v[0] + d[1] * k.v[1] + d[2] * k.v[2],
    d[0] * k.w[0] + d[1] * k.w[1] + d[2] * k.w[2],
  ];
}

/** Punto del mundo a partir de coordenadas locales del riñón. */
export function kidneyWorld(q: Vec3, k: Kidney): Vec3 {
  return [
    k.center[0] + q[0] * k.u[0] + q[1] * k.v[0] + q[2] * k.w[0],
    k.center[1] + q[0] * k.u[1] + q[1] * k.v[1] + q[2] * k.w[1],
    k.center[2] + q[0] * k.u[2] + q[1] * k.v[2] + q[2] * k.w[2],
  ];
}

/** Semiejes del riñón adulto de referencia (mm) y del seno con su desplazamiento hacia el hilio: los dos riñones los
 * comparten, y las tablas del shader (pirámides, dedos del seno) salen de ellos. */
export const KIDNEY_RADII: Vec3 = [54, 27, 23];
export const KIDNEY_SINUS = { radii: [30, 12, 10] as Vec3, offsetV: 4 };
/**
 * Profundidad bajo la cápsula del centro de la base de cada pirámide, por su eje (mm): corteza de 7–8 mm y parénquima de
 * 15–16 (revisión 25-09). El casquete redondeado de la base, que llegaba a 3 mm de la cápsula, lo corta la unión
 * corticomedular (`MEDULLA_MIN_DEPTH_MM`).
 */
export const RENAL_CORTEX_MM = 7.5;

/** Pirámide medular (decisión 68): cono redondeado con la papila (vértice) hacia el seno y la base hacia la corteza. */
export interface RenalPyramid {
  apex: Vec3;
  base: Vec3;
  apexR: number;
  baseR: number;
}

/**
 * Pirámides medulares (decisión 68): conos redondeados que irradian del seno a la corteza, de tamaño y orientación
 * algo distintos (un riñón adulto muestra 6–8 en un corte; no son triángulos idénticos ni equidistantes). La fila
 * lateral deja libres las columnas de Bertin de las interlobares (`BERTIN_COLUMNS_U`, a intervalos desiguales). (θ, u) es la posición en la
 * superficie del seno: θ alrededor del eje largo (0 hacia el hilio, π lateral, π/2 anterior); `baseR`, el radio de
 * la base. Antes eran 16 cuñas finas que se veían como rayas oscuras verticales.
 */
const PYRAMID_SPECS: ReadonlyArray<{ theta: number; u: number; baseR: number }> = [
  { theta: Math.PI + 0.05, u: -39, baseR: 6.8 },
  { theta: Math.PI - 0.04, u: -15, baseR: 7.4 },
  { theta: Math.PI + 0.03, u: 10, baseR: 6.4 },
  { theta: Math.PI - 0.06, u: 37, baseR: 7.0 },
  { theta: Math.PI / 2 + 0.1, u: -25, baseR: 6.0 },
  { theta: Math.PI / 2 - 0.05, u: 1, baseR: 6.6 },
  { theta: Math.PI / 2 + 0.02, u: 26, baseR: 5.6 },
  { theta: (3 * Math.PI) / 2 - 0.08, u: -24, baseR: 6.2 },
  { theta: (3 * Math.PI) / 2 + 0.04, u: -1, baseR: 6.8 },
  { theta: (3 * Math.PI) / 2 - 0.02, u: 25, baseR: 5.8 },
  { theta: (3 * Math.PI) / 4, u: -2, baseR: 5.4 },
  { theta: (5 * Math.PI) / 4, u: 22, baseR: 5.2 },
];

/** La papila empieza a esta distancia de la superficie del seno (mm): el cáliz (un dedo del seno) la envuelve. */
const PAPILLA_OFFSET_MM = 3;

function buildPyramids(): RenalPyramid[] {
  const [ru, rv, rw] = KIDNEY_RADII;
  const [su, sv, sw] = KIDNEY_SINUS.radii;
  const out: RenalPyramid[] = [];
  const cone = (s: Vec3, o: Vec3, baseR: number) => {
    const d: Vec3 = [o[0] - s[0], o[1] - s[1], o[2] - s[2]];
    const l = Math.hypot(d[0], d[1], d[2]);
    const n: Vec3 = [d[0] / l, d[1] / l, d[2] / l];
    const apex: Vec3 = [s[0] + n[0] * PAPILLA_OFFSET_MM, s[1] + n[1] * PAPILLA_OFFSET_MM, s[2] + n[2] * PAPILLA_OFFSET_MM];
    const base: Vec3 = [o[0] - n[0] * RENAL_CORTEX_MM, o[1] - n[1] * RENAL_CORTEX_MM, o[2] - n[2] * RENAL_CORTEX_MM];
    out.push({ apex, base, apexR: 1.5, baseR });
  };
  for (const p of PYRAMID_SPECS) {
    const fs = Math.sqrt(Math.max(0, 1 - (p.u / su) ** 2));
    const s: Vec3 = [p.u, KIDNEY_SINUS.offsetV + sv * fs * Math.cos(p.theta), sw * fs * Math.sin(p.theta)];
    const uo = p.u * 1.25;
    const fo = Math.sqrt(Math.max(0, 1 - (uo / ru) ** 2));
    cone(s, [uo, rv * fo * Math.cos(p.theta), rw * fo * Math.sin(p.theta)], p.baseR);
  }
  // pirámides compuestas de los polos, hacia ±u
  cone([su * 0.97, KIDNEY_SINUS.offsetV, 0], [ru, -2, 0], 7.2);
  cone([-su * 0.97, KIDNEY_SINUS.offsetV, 0], [-ru, -2, 1], 6.8);
  return out;
}

export const PYRAMIDS: readonly RenalPyramid[] = buildPyramids();

/**
 * Grasa perirrenal (decisión 68): grosor variable, fina (≈ 1 mm) en la cara anterolateral que apoya en el hígado
 * (Morison) y gruesa detrás, hacia el hilio y en los polos (hasta 9 mm). Antes era una capa de 4 mm constante cuyas
 * dos caras dibujaban una doble línea concéntrica perfecta alrededor del riñón. Donde es fina (≤ `faceMaxMm`) toda ella
 * dibuja la cara de la cápsula renal: sus dos caras, a 1–2,5 mm, se ven como una sola línea (decisión 81; antes su mitad
 * externa dibujaba la suya y salían dos líneas paralelas). Donde es gruesa, su cara externa solo se dibuja donde apoya
 * el hígado (Morison, a ≤ `MORISON_CONTACT_MM`: la cápsula hepática le cede la cara); si no (detrás, hacia el hilio, en
 * los polos) se confunde con la grasa retroperitoneal sin línea, como en un equipo.
 */
export const PERIRENAL = { minMm: 1, maxMm: 9, faceMaxMm: 2.5 } as const;

/**
 * Rampa suave (C2): 0 por debajo de −w, x por encima de w y entre ambos 2w·(t³ − t⁴/2) con t = (x + w)/2w, que empalma
 * valor, pendiente y curvatura en los dos extremos (sin aristas en la superficie ni saltos de curvatura que las
 * diferencias centrales de las normales convertirían en error).
 */
export function softRamp(x: number, w: number): number {
  if (x <= -w) return 0;
  if (x >= w) return x;
  const t = (x + w) / (2 * w);
  return 2 * w * t * t * t * (1 - 0.5 * t);
}

/** Ancho de las rampas suaves del grosor perirrenal (en unidades de la dirección normalizada). */
const PERIRENAL_SOFT = 0.15;

/**
 * Grosor de la grasa perirrenal (mm) en la dirección del punto local q del riñón k: suave (C1) en la dirección, para que
 * la impresión renal del hígado, que la sigue, no tenga aristas. Fina delante: en el riñón derecho +w es anterior, y el
 * izquierdo es especular (su w apunta hacia atrás, `k.w·ŷ < 0`), así que allí la anterior es −w (antes se leía +w en
 * los dos y el izquierdo tenía la grasa gruesa delante, 8,2 mm, y fina detrás, 1,2).
 */
export function perirenalThicknessMm(q: Vec3, k: Kidney): number {
  const r = k.radii;
  const nu = q[0] / r[0];
  const nv = q[1] / r[1];
  const nw = (k.w[1] < 0 ? -q[2] : q[2]) / r[2];
  const l = Math.sqrt(nu * nu + nv * nv + nw * nw);
  const s = l > 0 ? 1 / l : 0;
  const w = PERIRENAL_SOFT;
  const a = 0.8 * softRamp(-nw * s, w) + 0.5 * softRamp(nv * s, w) + 2 * softRamp(Math.sqrt(nu * nu * s * s + w * w * 0.01) - 0.6, w * 0.5);
  const kc = 1 - softRamp(1 - softRamp(a, w), w);
  return PERIRENAL.minMm + (PERIRENAL.maxMm - PERIRENAL.minMm) * kc;
}

/** Distancia con signo a la cara externa de la grasa perirrenal (marco local): el contorno menos el grosor local. */
export function perirenalOuterSdf(q: Vec3, k: Kidney): number {
  return kidneyOuterSdf(q, k) - perirenalThicknessMm(q, k);
}

/**
 * Solape de la impresión renal del hígado sobre la grasa perirrenal (mm): el redondeo de la impresión apartaba la
 * cápsula hepática hasta ~0,3 mm de una grasa fina y quedaba un hueco de «intestino»; la grasa, que se clasifica
 * antes, gana en el solape.
 */
export const RENAL_IMPRESSION_OVERLAP_MM = 1;

/**
 * Radio (mm) de la esfera que contiene un riñón con su grasa (su semieje largo y la grasa más gruesa), y el margen más allá del
 * cual ni se clasifica ni se evalúa su forma (el de `classifyKidneys` de VExUS).
 */
export const KIDNEY_REACH_MM = KIDNEY_RADII[0] + PERIRENAL.maxMm;
export const KIDNEY_NEAR_MARGIN_MM = 2;

/**
 * Distancia con signo a la cara externa de la grasa perirrenal más cercana de los dos riñones (lus-sim, decisión 43; gemelo GLSL
 * con el mismo nombre): `perirenalOuterSdf` cerca de cada riñón y, más allá de su esfera y del margen, la distancia a la esfera
 * (una cota inferior), sin evaluar su forma. El hígado y el bazo la usan para su impresión renal (como `liverBaseSdf` de VExUS,
 * con `RENAL_IMPRESSION_OVERLAP_MM`), y el «resto», para su distancia a la frontera.
 */
export function perirenalDistance(m: Vec3, kidneys: readonly Kidney[]): number {
  let d = 1e3;
  for (const k of kidneys) {
    const dc = Math.hypot(m[0] - k.center[0], m[1] - k.center[1], m[2] - k.center[2]);
    d = Math.min(d, dc > KIDNEY_REACH_MM + KIDNEY_NEAR_MARGIN_MM ? dc - KIDNEY_REACH_MM : perirenalOuterSdf(kidneyLocal(m, k), k));
  }
  return d;
}

/**
 * La silueta del riñón con su grasa más gruesa vista de detrás (lus-sim, decisión 43): la forma cuadrática 2 × 2 en (x, z) de la
 * proyección por y del elipsoide de semiejes `radii + PERIRENAL.maxMm` en sus ejes (el complemento de Schur de su forma 3 × 3):
 * [m_xx, m_xz, m_zz]. Gemelo GLSL con el mismo nombre.
 */
export function kidneySilhouette(k: Kidney): [number, number, number] {
  const r = [k.radii[0] + PERIRENAL.maxMm, k.radii[1] + PERIRENAL.maxMm, k.radii[2] + PERIRENAL.maxMm];
  const Q = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  [k.u, k.v, k.w].forEach((a, i) => {
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) Q[p * 3 + q] += (a[p] * a[q]) / (r[i] * r[i]);
  });
  const qy = [Q[3], Q[5]];
  return [Q[0] - (qy[0] * qy[0]) / Q[4], Q[2] - (qy[0] * qy[1]) / Q[4], Q[8] - (qy[1] * qy[1]) / Q[4]];
}

/**
 * La sombra del riñón (lus-sim, decisión 43): lo que queda detrás de él, de la y de su centro a `KIDNEY_SHADOW_BACK_MM` hacia
 * atrás, dentro de su silueta con la grasa más gruesa vista de detrás (`kidneySilhouette`). Gray: la cara posterior apoya en el
 * diafragma, los arcos lumbocostales, el psoas y el cuadrado lumbar; ahí no va ningún órgano de la cavidad. El hígado y el bazo la
 * restan con la impresión renal (`renalImpression`); la llena el retroperitoneo. Distancia con signo (la cota de la elipse 2D,
 * como `sdEllipsoidLocal`), negativa dentro; gemelo GLSL con el mismo nombre. Lejos (fuera de la esfera que la contiene), la
 * distancia a esa esfera.
 */
export function kidneyShadow(m: Vec3, kidneys: readonly Kidney[]): number {
  let d = 1e3;
  for (const k of kidneys) {
    const dc = Math.hypot(m[0] - k.center[0], m[1] - k.center[1], m[2] - k.center[2]);
    if (dc > KIDNEY_SHADOW_REACH_MM + KIDNEY_NEAR_MARGIN_MM) {
      d = Math.min(d, dc - KIDNEY_SHADOW_REACH_MM);
      continue;
    }
    const [mxx, mxz, mzz] = kidneySilhouette(k);
    const x = m[0] - k.center[0];
    const z = m[2] - k.center[2];
    const k1 = Math.sqrt(mxx * x * x + 2 * mxz * x * z + mzz * z * z);
    const k2 = Math.hypot(mxx * x + mxz * z, mxz * x + mzz * z);
    const foot = k2 > 0 ? (k1 * (k1 - 1)) / k2 : -1;
    const back = k.center[1] - m[1];
    d = Math.min(d, Math.max(foot, -back, back - KIDNEY_SHADOW_BACK_MM));
  }
  return d;
}
/** Hasta dónde llega la sombra del riñón detrás de su plano medio (mm): pasa de la pared posterior [SUPUESTO]. */
export const KIDNEY_SHADOW_BACK_MM = 60;
/** Radio de la esfera que contiene la sombra (su semieje largo con la grasa y lo que llega detrás). */
export const KIDNEY_SHADOW_REACH_MM = Math.hypot(KIDNEY_RADII[0] + PERIRENAL.maxMm, KIDNEY_SHADOW_BACK_MM);

/**
 * La impresión renal del hígado y del bazo (lus-sim, decisión 43; gemelo GLSL con el mismo nombre): la cara externa de la grasa
 * perirrenal (`perirenal`, `perirenalDistance`) más `RENAL_IMPRESSION_OVERLAP_MM` (la de VExUS), y la sombra del riñón
 * (`kidneyShadow`): el órgano no pasa por detrás de él.
 */
export function renalImpression(m: Vec3, kidneys: readonly Kidney[], perirenal: number): number {
  return Math.min(perirenal + RENAL_IMPRESSION_OVERLAP_MM, kidneyShadow(m, kidneys));
}

/** Distancia con signo a un cono redondeado (radio interpolado a lo largo del eje), marco local. */
export function sdRoundCone(q: Vec3, a: Vec3, b: Vec3, ra: number, rb: number): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const apx = q[0] - a[0];
  const apy = q[1] - a[1];
  const apz = q[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  let s = (apx * abx + apy * aby + apz * abz) / len2;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const dx = apx - abx * s;
  const dy = apy - aby * s;
  const dz = apz - abz * s;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * s);
}

/** Dedos del seno hacia cada papila (cálices envueltos en grasa): borde digitado, no un óvalo liso. */
export const SINUS_FINGER = { backMm: 2, reachMm: 3.5, radiusMm: 3.5, blendMm: 3 } as const;

/** Columnas de Bertin del plano coronal lateral (entre las pirámides laterales, a intervalos desiguales): posiciones u. */
export const BERTIN_COLUMNS_U = [-27, -2.5, 23.5] as const;
/**
 * Pelvis renal colapsada (decisión 68): en el riñón normal el sistema colector no se ve o apenas es una hendidura; una
 * lámina de orina de 2,4 mm entre las caras anterior y posterior del seno, hacia el hilio (antes 18 × 7 × 5 mm, una
 * barra negra recortada). Marco local del seno, mm.
 */
export const RENAL_PELVIS = { offsetV: 3, radii: [7, 3, 1.2] as Vec3 };
/** Cápsula renal fibrosa (mm), línea ecogénica en la superficie. */
export const RENAL_CAPSULE_MM = 0.6;
/** Escotadura hiliar: elipsoide restado en la cara medial (marco local, mm). */
export const HILUM_NOTCH = { offsetV: 6, radii: [24, 16, 13] as Vec3, roundMm: 6 };

/** Contorno externo del riñón: elipsoide con escotadura hiliar (forma de judía). */
export function kidneyOuterSdf(q: Vec3, k: Kidney): number {
  const ell = sdEllipsoidLocal(q, k.radii);
  const notch = sdEllipsoidLocal([q[0], q[1] - (k.radii[1] + HILUM_NOTCH.offsetV), q[2]], HILUM_NOTCH.radii);
  return smoothMax(ell, -notch, HILUM_NOTCH.roundMm);
}

/**
 * ¿Pesa la escotadura hiliar en `kidneyOuterSdf` en q (marco local)? Fuera del redondeo de `smoothMax`
 * (el elipsoide supera a la escotadura en `roundMm` o más) el contorno es el elipsoide exacto y su
 * gradiente es la normal del elipsoide que usa la GPU; dentro, no. Solo pruebas (e2e de normales).
 */
export function hilumNotchActive(q: Vec3, k: Kidney): boolean {
  const ell = sdEllipsoidLocal(q, k.radii);
  const notch = sdEllipsoidLocal([q[0], q[1] - (k.radii[1] + HILUM_NOTCH.offsetV), q[2]], HILUM_NOTCH.radii);
  return ell + notch < HILUM_NOTCH.roundMm;
}

/** Extremos de los dedos del seno (cálices) hacia cada papila: del seno hacia fuera por el eje de la pirámide. */
export const SINUS_FINGERS: ReadonlyArray<{ a: Vec3; b: Vec3 }> = PYRAMIDS.map((p) => {
  const d: Vec3 = [p.base[0] - p.apex[0], p.base[1] - p.apex[1], p.base[2] - p.apex[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  const n: Vec3 = [d[0] / l, d[1] / l, d[2] / l];
  // superficie del seno: la papila empieza PAPILLA_OFFSET_MM fuera de ella
  const s0 = -PAPILLA_OFFSET_MM - SINUS_FINGER.backMm;
  const s1 = -PAPILLA_OFFSET_MM + SINUS_FINGER.reachMm;
  return {
    a: [p.apex[0] + n[0] * s0, p.apex[1] + n[1] * s0, p.apex[2] + n[2] * s0],
    b: [p.apex[0] + n[0] * s1, p.apex[1] + n[1] * s1, p.apex[2] + n[2] * s1],
  };
});

/** Distancia con signo al seno (elipsoide + canal del hilio + dedos hacia las papilas), marco local. */
export function kidneySinusSdf(q: Vec3, k: Kidney): number {
  const qs: Vec3 = [q[0], q[1] - k.sinusOffset, q[2]];
  let d = sdEllipsoidLocal(qs, k.sinusRadii);
  // Canal del hilio: cápsula desde el centro del seno hacia la cara medial (+v)
  const t = Math.min(Math.max(q[1] - k.sinusOffset, 0), k.radii[1]);
  d = Math.min(d, Math.hypot(q[0], q[1] - k.sinusOffset - t, q[2]) - k.hilumRadius);
  for (const f of SINUS_FINGERS)
    d = smoothMin(d, sdRoundCone(q, f.a, f.b, SINUS_FINGER.radiusMm, SINUS_FINGER.radiusMm), SINUS_FINGER.blendMm);
  return d;
}

/**
 * Unión corticomedular (mm bajo la cápsula): la médula empieza a esta profundidad. Corta el casquete de la base de cada
 * pirámide (su centro está a `RENAL_CORTEX_MM`) en una base ancha que sigue al contorno, como la línea arcuata: la
 * corteza mide ≥ 7 mm sobre toda pirámide. Con 3 mm, el casquete (de radio `baseR`, 5,2–7,4 mm) llegaba a 3 mm de la
 * cápsula: 3,9 mm de corteza en la mediana (revisión adversarial de la decisión 68).
 */
export const MEDULLA_MIN_DEPTH_MM = 7;

/** Regiones del riñón en p. Fuera de él (`dOuter ≥ 0`) no se evalúan el seno ni las pirámides: `dSinus` = +∞. */
export function kidneyQuery(p: Vec3, k: Kidney): KidneyHit {
  const q = kidneyLocal(p, k);
  const dOuter = kidneyOuterSdf(q, k);
  // fuera no hay regiones: la grasa perirrenal y su entorno (a < 65 mm del centro) no pagan los 14 dedos del seno
  if (dOuter >= 0) return { dOuter, dSinus: Infinity, region: 'cortex', inner: -dOuter };
  const dSinus = kidneySinusSdf(q, k);
  if (dSinus < 0) {
    // Pelvis: hendidura de orina colapsada en el seno, hacia el hilio
    const qs: Vec3 = [q[0], q[1] - k.sinusOffset, q[2]];
    const dPelvis = sdEllipsoidLocal([qs[0], qs[1] - RENAL_PELVIS.offsetV, qs[2]], RENAL_PELVIS.radii);
    if (dPelvis < 0) return { dOuter, dSinus, region: 'pelvis', inner: Math.min(-dPelvis, -dOuter) };
    return { dOuter, dSinus, region: 'sinus', inner: Math.min(-dSinus, -dOuter, dPelvis) };
  }
  // Pirámides: conos redondeados de la papila a la base, por debajo de la corteza
  const depth = -dOuter - MEDULLA_MIN_DEPTH_MM;
  if (depth > 0) {
    let dMed = 1e3;
    for (const pyr of PYRAMIDS) dMed = Math.min(dMed, sdRoundCone(q, pyr.apex, pyr.base, pyr.apexR, pyr.baseR));
    if (dMed < 0) return { dOuter, dSinus, region: 'medulla', inner: Math.min(-dMed, dSinus, depth) };
    return { dOuter, dSinus, region: 'cortex', inner: Math.min(-dOuter, dSinus, dMed) };
  }
  return { dOuter, dSinus, region: 'cortex', inner: Math.min(-dOuter, dSinus, -depth) };
}

const f4 = (v: number) => v.toFixed(4);
/** Literal GLSL exacto (el mismo número que la TS). */
const g = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const vec3s = (v: Vec3) => `vec3(${f4(v[0])}, ${f4(v[1])}, ${f4(v[2])})`;
const PYRAMID_TABLE = `#define N_PYR ${PYRAMIDS.length}
const vec4 PYRA[N_PYR] = vec4[N_PYR](${PYRAMIDS.map((p) => `vec4(${vec3s(p.apex)}, ${f4(p.apexR)})`).join(', ')});
const vec4 PYRB[N_PYR] = vec4[N_PYR](${PYRAMIDS.map((p) => `vec4(${vec3s(p.base)}, ${f4(p.baseR)})`).join(', ')});
const vec3 FINGA[N_PYR] = vec3[N_PYR](${SINUS_FINGERS.map((f) => vec3s(f.a)).join(', ')});
const vec3 FINGB[N_PYR] = vec3[N_PYR](${SINUS_FINGERS.map((f) => vec3s(f.b)).join(', ')});
const vec4 FINGER = vec4(${f4(SINUS_FINGER.radiusMm)}, ${f4(SINUS_FINGER.blendMm)}, ${f4(MEDULLA_MIN_DEPTH_MM)}, 0.0);
const vec3 PERI = vec3(${f4(PERIRENAL.minMm)}, ${f4(PERIRENAL.maxMm)}, ${f4(PERIRENAL.faceMaxMm)});
const float PERI_SOFT = ${f4(PERIRENAL_SOFT)};`;
const KIDNEY_AXES_GLSL = `const vec3 KID_U[2] = vec3[2](${KIDNEY_BASES.map((b) => `vec3(${b.u.map(g).join(', ')})`).join(', ')});
const vec3 KID_V[2] = vec3[2](${KIDNEY_BASES.map((b) => `vec3(${b.v.map(g).join(', ')})`).join(', ')});
const vec3 KID_W[2] = vec3[2](${KIDNEY_BASES.map((b) => `vec3(${b.w.map(g).join(', ')})`).join(', ')});
const vec2 KID_Z = vec2(${g(kidneyCenterZ(0))}, ${g(kidneyCenterZ(1))});
const vec3 KID_R = vec3(${KIDNEY_RADII.map(g).join(', ')});
const vec4 KID_SINUS = vec4(${KIDNEY_SINUS.radii.map(g).join(', ')}, ${g(KIDNEY_SINUS.offsetV)});
const float KID_HILUM_R = ${g(HILUM_RADIUS_MM)};
#define KIDNEY_REACH ${g(KIDNEY_REACH_MM)}
#define KIDNEY_NEAR_MARGIN ${g(KIDNEY_NEAR_MARGIN_MM)}
#define RENAL_IMPRESSION_OVERLAP ${g(RENAL_IMPRESSION_OVERLAP_MM)}
#define KIDNEY_SHADOW_BACK ${g(KIDNEY_SHADOW_BACK_MM)}
#define KIDNEY_SHADOW_REACH ${g(KIDNEY_SHADOW_REACH_MM)}`;
const PELVIS = `const vec4 PELVIS = vec4(${RENAL_PELVIS.radii[0].toFixed(1)}, ${RENAL_PELVIS.radii[1].toFixed(1)}, ${RENAL_PELVIS.radii[2].toFixed(1)}, ${RENAL_PELVIS.offsetV.toFixed(1)}); const float RENAL_CAPSULE_MM = ${RENAL_CAPSULE_MM.toFixed(2)};`;
const NOTCH = `const vec4 NOTCH = vec4(${HILUM_NOTCH.radii[0].toFixed(1)}, ${HILUM_NOTCH.radii[1].toFixed(1)}, ${HILUM_NOTCH.radii[2].toFixed(1)}, ${HILUM_NOTCH.offsetV.toFixed(1)}); const float NOTCH_ROUND = ${HILUM_NOTCH.roundMm.toFixed(1)};`;

/**
 * Gemelo GLSL: `kidneyQuery` devuelve la región (0 corteza, 1 médula, 2 seno, 3 pelvis). lus-sim (decisión 43): los ejes, los
 * semiejes, el seno y la z de los centros son constantes; la y de los centros, la de `kidneyCenterY` con el tronco (`uTorso`).
 */
export const KIDNEY_GLSL = /* glsl */ `
float smoothMin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smoothMax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}
float sdEllipsoidLocal(vec3 q, vec3 r) {
  vec3 k = q / r;
  float k1 = length(k);
  float k2 = length(k / r);
  return k2 > 0.0 ? (k1 * (k1 - 1.0)) / k2 : -min(r.x, min(r.y, r.z));
}
${KIDNEY_AXES_GLSL}
vec3 kidneyCenter(int k) {
  float x = ${g(KIDNEY.params.centerXMm.value)};
  float back = -uTorso.y * sqrt(1.0 - (x / uTorso.x) * (x / uTorso.x));
  return k == 0
    ? vec3(-x, back + ${g(KIDNEY.params.depthRightMm.value)}, KID_Z.x)
    : vec3(x, back + ${g(KIDNEY.params.depthLeftMm.value)}, KID_Z.y);
}
vec3 kidneyLocal(vec3 p, int k) {
  vec3 d = p - kidneyCenter(k);
  return vec3(dot(d, KID_U[k]), dot(d, KID_V[k]), dot(d, KID_W[k]));
}

${PYRAMID_TABLE}
${PELVIS}
${NOTCH}

// Contorno externo: elipsoide con escotadura hiliar (forma de judía)
float kidneyOuterSdf(vec3 q, vec3 r) {
  float ell = sdEllipsoidLocal(q, r);
  float notch = sdEllipsoidLocal(vec3(q.x, q.y - (r.y + NOTCH.w), q.z), NOTCH.xyz);
  return smoothMax(ell, -notch, NOTCH_ROUND);
}

float sdRoundCone(vec3 q, vec3 a, vec3 b, float ra, float rb) {
  vec3 ab = b - a;
  vec3 ap = q - a;
  float s = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  return length(ap - ab * s) - (ra + (rb - ra) * s);
}

float softRamp(float x, float w) {
  if (x <= -w) return 0.0;
  if (x >= w) return x;
  float t = (x + w) / (2.0 * w);
  return 2.0 * w * t * t * t * (1.0 - 0.5 * t);
}

// Grosor de la grasa perirrenal del riñón k (decisión 68): fina anterolateral (Morison), gruesa detrás, al hilio y en los
// polos; suave (C1) para que la impresión renal del hígado no tenga aristas. El riñón izquierdo es especular: su anterior es −w
float perirenalThicknessMm(vec3 q, int k) {
  vec3 n = vec3(q.x, q.y, KID_W[k].y < 0.0 ? -q.z : q.z) / KID_R;
  float l = length(n);
  float s = l > 0.0 ? 1.0 / l : 0.0;
  float w = PERI_SOFT;
  float a = 0.8 * softRamp(-n.z * s, w) + 0.5 * softRamp(n.y * s, w) + 2.0 * softRamp(sqrt(n.x * n.x * s * s + w * w * 0.01) - 0.6, w * 0.5);
  float kc = 1.0 - softRamp(1.0 - softRamp(a, w), w);
  return PERI.x + (PERI.y - PERI.x) * kc;
}

// Cara externa de la grasa perirrenal del riñón k (marco local)
float perirenalOuterSdf(vec3 q, int k) {
  return kidneyOuterSdf(q, KID_R) - perirenalThicknessMm(q, k);
}

// Seno: elipsoide + canal del hilio + dedos hacia las papilas (cálices)
float kidneySinusSdf(vec3 q, int k) {
  vec4 sn = KID_SINUS;
  float d = sdEllipsoidLocal(vec3(q.x, q.y - sn.w, q.z), sn.xyz);
  float t = clamp(q.y - sn.w, 0.0, KID_R.y);
  d = min(d, length(vec3(q.x, q.y - sn.w - t, q.z)) - KID_HILUM_R);
  for (int i = 0; i < N_PYR; i++) d = smoothMin(d, sdRoundCone(q, FINGA[i], FINGB[i], FINGER.x, FINGER.x), FINGER.y);
  return d;
}

// La distancia a la cara externa de la grasa perirrenal más cercana; lejos de un riñón, la de su esfera (gemelo: perirenalDistance)
float perirenalDistance(vec3 m) {
  float d = 1e3;
  for (int k = 0; k < 2; k++) {
    float dc = distance(m, kidneyCenter(k));
    d = min(d, dc > KIDNEY_REACH + KIDNEY_NEAR_MARGIN ? dc - KIDNEY_REACH : perirenalOuterSdf(kidneyLocal(m, k), k));
  }
  return d;
}

// La silueta del riñón k con su grasa vista de detrás: la forma 2 × 2 en (x, z) (gemelo: kidneySilhouette)
vec3 kidneySilhouette(int k) {
  vec3 r = KID_R + PERI.y;
  vec3 a = KID_U[k] / r.x;
  vec3 b = KID_V[k] / r.y;
  vec3 c = KID_W[k] / r.z;
  mat3 Q = outerProduct(a, a) + outerProduct(b, b) + outerProduct(c, c);
  return vec3(Q[0][0] - Q[0][1] * Q[0][1] / Q[1][1], Q[0][2] - Q[0][1] * Q[1][2] / Q[1][1], Q[2][2] - Q[1][2] * Q[1][2] / Q[1][1]);
}
// La sombra del riñón: detrás de la y de su centro, hasta KIDNEY_SHADOW_BACK, en su silueta con la grasa (gemelo: kidneyShadow)
float kidneyShadow(vec3 m) {
  float d = 1e3;
  for (int k = 0; k < 2; k++) {
    vec3 c = kidneyCenter(k);
    float dc = distance(m, c);
    if (dc > KIDNEY_SHADOW_REACH + KIDNEY_NEAR_MARGIN) { d = min(d, dc - KIDNEY_SHADOW_REACH); continue; }
    vec3 S = kidneySilhouette(k);
    vec2 p = m.xz - c.xz;
    vec2 g = vec2(S.x * p.x + S.y * p.y, S.y * p.x + S.z * p.y);
    float k1 = sqrt(dot(p, g));
    float k2 = length(g);
    float foot = k2 > 0.0 ? k1 * (k1 - 1.0) / k2 : -1.0;
    float back = c.y - m.y;
    d = min(d, max(max(foot, -back), back - KIDNEY_SHADOW_BACK));
  }
  return d;
}
// La impresión renal del hígado y del bazo: la grasa perirrenal más el solape, y la sombra (gemelo: renalImpression)
float renalImpression(vec3 m, float perirenal) {
  return min(perirenal + RENAL_IMPRESSION_OVERLAP, kidneyShadow(m));
}

// Región interna: 0 corteza, 1 médula, 2 seno, 3 pelvis; devuelve la distancia interna mínima
int kidneyQuery(vec3 p, int k, out float inner, out float dOuter) {
  vec3 q = kidneyLocal(p, k);
  dOuter = kidneyOuterSdf(q, KID_R);
  if (dOuter >= 0.0) { inner = -dOuter; return 0; }
  float dSinus = kidneySinusSdf(q, k);
  if (dSinus < 0.0) {
    vec4 sn = KID_SINUS;
    float dPelvis = sdEllipsoidLocal(vec3(q.x, q.y - sn.w - PELVIS.w, q.z), PELVIS.xyz);
    if (dPelvis < 0.0) { inner = min(-dPelvis, -dOuter); return 3; }
    inner = min(min(-dSinus, -dOuter), dPelvis); return 2;
  }
  float depth = -dOuter - FINGER.z;
  if (depth > 0.0) {
    float dMed = 1e3;
    for (int i = 0; i < N_PYR; i++) dMed = min(dMed, sdRoundCone(q, PYRA[i].xyz, PYRB[i].xyz, PYRA[i].w, PYRB[i].w));
    if (dMed < 0.0) { inner = min(min(-dMed, dSinus), depth); return 1; }
    inner = min(min(-dOuter, dSinus), dMed); return 0;
  }
  inner = min(min(-dOuter, dSinus), -depth);
  return 0;
}
`;
