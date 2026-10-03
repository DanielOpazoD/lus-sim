import { defineParameters } from '../../core/evidence';
import type { ChestHabitus } from '../../physiology/patientState';
import { DIAPHRAGM_EXCURSION } from '../../physiology/respiratory';
import { torsoDepthGradient, torsoSkinPoint, type ChestWallLookup, type Torso, type WallLayersAt } from '../primitives';
import { thoraxLinePhi } from '../thoraxLines';
import { RIBCAGE, RIB_TABLE_BASE, RIB_TABLE_TEXELS } from './ribcage';
import { cupolaMm } from './lungApex';
import { wallArc, wallPerimeter } from './wall';

/**
 * Pared torácica por región (lus-sim, paso C2, decisión 17) como módulo de órgano: el grosor de la pared bajo la sonda (el
 * «estado ecográfico» de la base, `docs/knowledge/anatomy.md` §2.2–2.6, el que miden las ecografías de voluntarios con la
 * presión estándar) y su reparto en capas, por línea del tórax y por altura, en lugar de la pared uniforme del abdomen de
 * VExUS (piel 2, grasa 14 y músculo 12 mm en todo el tronco), que queda bajo el reborde costal. La geometría de las capas y
 * de sus caras sigue siendo la de `organs/wall.ts`; este módulo da, en cada punto (u, z) de la pared, los grosores de piel,
 * grasa, músculo (con la banda intercostal y el complejo pleural) y banda intercostal. TS y GLSL con los mismos nombres; la
 * tabla va en la textura de escena tras la de la parrilla.
 *
 * Capas por estación, por la normal de la piel (la tabla las lleva a la métrica radial de la pared multiplicando por
 * |∇torsoDepth|):
 *  - delante (EIC2-LMC, 16 mm): piel 1,8, grasa 3,7, pectoral 8,0, intercostales 2,2 y el complejo pleura + fascia
 *    endotorácica, 0,3 (la «grasa preperitoneal» de `wall.ts`, entre la fascia endotorácica y la pleura parietal);
 *  - al lado, bajo (EIC5 LAA/LAM, 12,8): piel 1,8, grasa 3,2, serrato 4,5, intercostales 3,0;
 *  - al lado, alto (EIC4-LAM, la axila, 18): piel 1,8, grasa 4,0, músculo el resto, intercostales 3,7 (EIC3 lateral);
 *  - detrás (infraescapular, 16,1): piel 2,5, grasa 4, dorsal ancho 5, intercostales 4,3;
 *  - junto a la columna y en la línea media posterior, 28 (decisión 28: Folli, Okçu);
 *  - detrás, arriba (decisión 29: sobre la 4.ª costilla de la LAM), 32 de la línea media a la escapular: la espalda con la
 *    escápula y sus músculos (Wada, Okçu); en la infraescapular, 20 [SUPUESTO].
 * Entre estaciones, interpolación monótona en |u|; en altura, las de la axila alta desde la 4.ª costilla de la LAM hacia
 * arriba y las bajas desde el centro del EIC5 hacia abajo (una transición suave entre los dos: `setChestWallCage`); bajo el reborde
 * costal, en 100 mm, la pared del abdomen del hábito. La banda
 * intercostal va del plano músculo–intercostal a la fascia endotorácica (meta A-T10) y, delante, engruesa al inspirar a
 * fondo (Yoshida).
 */
export const CHEST_WALL = defineParameters('anatomy.chestWall', {
  skinAnteriorMm: {
    value: 1.8,
    unit: 'mm',
    range: [1.5, 2.5],
    evidence: 'derivado',
    sources: ['laurent-piel-2007'],
    note: 'Piel del tórax anterior y lateral del avatar (anatomy.md §2.3): ecografía de 20 MHz, 1,55–2,54 mm según el sitio (Laurent)',
  },
  skinPosteriorMm: {
    value: 2.5,
    unit: 'mm',
    range: [2, 3],
    evidence: 'estimado',
    sources: ['laurent-piel-2007'],
    note:
      'Piel de detrás: la supraescapular, 2,54 mm por ecografía de 20 MHz (Laurent), llevada bajo la escápula y a la columna ' +
      '[SUPUESTO de la base: la fila infraescapular del avatar]',
  },
  fatAnteriorMm: {
    value: 3.7,
    unit: 'mm',
    range: [2, 6],
    evidence: 'derivado',
    sources: ['wallbridge-paraesternal-2018', 'mclean-paredus-2011'],
    note:
      'Grasa subcutánea en EIC2-LMC del avatar: el resto de la suma de capas hasta los 16 mm, coherente con las medianas de ' +
      '3,9–4,9 mm de Wallbridge (EPOC)',
  },
  pectoralMm: {
    value: 8,
    unit: 'mm',
    range: [5, 12],
    evidence: 'estimado',
    sources: ['wallbridge-paraesternal-2018'],
    note: 'Pectoral mayor en EIC2-LMC del avatar [SUPUESTO]: sin dato en sanos; en EPOC 6,4 mm (RIC 5,7–9,6, Wallbridge)',
  },
  intercostalAnteriorMm: {
    value: 2.2,
    unit: 'mm',
    range: [1.4, 3],
    evidence: 'documentado',
    sources: ['yoshida-intercostales-2019'],
    note: 'Intercostales anteriores en reposo, EIC2 2,17 ± 0,83 mm (Yoshida, Tabla 2; EIC1–6: 1,97–2,79)',
  },
  fatLateralMm: {
    value: 3.2,
    unit: 'mm',
    range: [2, 5],
    evidence: 'estimado',
    sources: ['nelson-paredus-2022'],
    note: 'Grasa subcutánea en EIC5 LAA/LAM del avatar [SUPUESTO] (anatomy.md §2.3)',
  },
  serratusMm: {
    value: 4.5,
    unit: 'mm',
    range: [3, 7],
    evidence: 'estimado',
    sources: ['nelson-paredus-2022'],
    note: 'Serrato anterior en EIC5 LAA/LAM del avatar [SUPUESTO]; con la piel, la grasa y los intercostales suma 12,8 (16 × 0,8, Nelson)',
  },
  intercostalLateralMm: {
    value: 3,
    unit: 'mm',
    range: [2.5, 4.5],
    evidence: 'documentado',
    sources: ['yoshida-intercostales-2019'],
    note: 'Intercostales laterales en reposo, EIC6 3,03 ± 0,77 mm (Yoshida; EIC3/6/9: 3,68 / 3,03 / 3,18)',
  },
  lateralHighWallMm: {
    value: 18,
    unit: 'mm',
    range: [14, 22],
    evidence: 'derivado',
    sources: ['mclean-paredus-2011'],
    note:
      'Piel → pleura en EIC4-LAM (la axila alta) del avatar: 16 × 24/21, el cociente lateral/anterior de los hombres de McLean ' +
      '(18,3). [DISCREPANCIA] con el EIC5 lateral de Nelson, más delgado: se modelan los dos, a su altura',
  },
  fatLateralHighMm: {
    value: 4,
    unit: 'mm',
    range: [2, 6],
    evidence: 'estimado',
    sources: ['mclean-paredus-2011'],
    note: 'Grasa subcutánea en la axila alta [SUPUESTO]: la base no reparte los 18 mm; el músculo (serrato y bordes del pectoral y del dorsal) es el resto',
  },
  intercostalLateralHighMm: {
    value: 3.7,
    unit: 'mm',
    range: [2.5, 4.5],
    evidence: 'documentado',
    sources: ['yoshida-intercostales-2019'],
    note: 'Intercostales laterales altos en reposo, EIC3 3,68 mm (Yoshida)',
  },
  fatPosteriorMm: {
    value: 4,
    unit: 'mm',
    range: [2, 7],
    evidence: 'estimado',
    sources: [],
    note: 'Grasa subcutánea infraescapular del avatar [SUPUESTO] (anatomy.md §2.3)',
  },
  latissimusMm: {
    value: 5,
    unit: 'mm',
    range: [3, 8],
    evidence: 'estimado',
    sources: [],
    note: 'Dorsal ancho infraescapular del avatar [SUPUESTO]; con piel 2,5, grasa 4 e intercostales 4,3, 16 mm',
  },
  intercostalPosteriorMm: {
    value: 4.3,
    unit: 'mm',
    range: [3.5, 5.5],
    evidence: 'documentado',
    sources: ['yoshida-intercostales-2019'],
    note: 'Intercostales posteriores en reposo, EIC9 4,27 ± 1,56 mm (Yoshida; EIC3/6/9: 4,85 / 4,25 / 4,27)',
  },
  paravertebralWallMm: {
    value: 28,
    unit: 'mm',
    range: [20, 35],
    evidence: 'derivado',
    sources: ['folli-pielcostilla-2020', 'okcu-parascapular-2026', 'lichtenstein-luci-2014', 'oontan-paravertebral-2013'],
    note:
      'Piel → pleura junto a la columna (en la paravertebral, a 6 cm de la línea media, y hasta la línea media, detrás de la cual ' +
      'está la columna) (decisión 28): piel → costilla 25,4 ± 4,5 mm a 2–3 cm de la apófisis de T8 en varones de IMC 22,6 (Folli, ' +
      'ecografía en prono, el trapecio inferior) más los 5 de la cresta costal a la pleura (`anatomy.ribcage.crestToPleuraMm`, ' +
      'Lichtenstein): 30; y 26,4 ± 6,8 mm en el punto más fino por dentro de la escápula en la TAC en supino con IMC normal ' +
      '(Okçu, 296 adultos; 31,0 ± 8,3 en los varones de todo IMC; el artículo no da la distancia de ese punto a la línea media). ' +
      '28, entre las dos [elegido]. El rango, ± 1 DE: de 26,4 − 6,8 (Okçu) a 30 + 4,5 (Folli más la cresta). Hasta la decisión 27 era el de la línea media (la pared heredada de VExUS), y en la paravertebral ' +
      'quedaba 21. La apófisis transversa → pleura, 21 ± 4,2 mm a 25 mm de la línea media (Oon Tan, el resumen)',
  },
  posteriorHighWallMm: {
    value: 32,
    unit: 'mm',
    range: [28, 40],
    evidence: 'derivado',
    sources: ['wada-pared-2025', 'okcu-parascapular-2026', 'silkjaer-escapulares-2021', 'lichtenstein-luci-2014'],
    note:
      'Piel → pleura en la espalda alta, de la línea media posterior a la escapular, desde la 4.ª costilla de la LAM hacia ' +
      'arriba (las capas altas, decisión 29), con la escápula y sus músculos; en la infraescapular, `infrascapularHighWallMm`. ' +
      'Piel → costilla en BL43 (la 5.ª costilla, junto al borde medial de la escápula a la altura de T4) 27 ± 4 mm, y en BL46 (la ' +
      '8.ª, a la de T7) 20 ± 5, en 18 varones de IMC 23,3, igual en prono que sentados (Wada y cols. 2025, tabla 1), más los 5 de ' +
      'la cresta costal a la pleura (`anatomy.ribcage.crestToPleuraMm`): 32 arriba (el valor) y 25 abajo (la pared baja, 28). Piel ' +
      '→ pleura 1 cm por dentro del punto medio del borde medial, 37,8 ± 8,5 con IMC normal (Okçu y cols. 2026, tabla 2): −0,7 DE. ' +
      'Bajo la escápula: piel 2,5, grasa 4, trapecio 7, escápula 3, serrato 6,9–8,5 (Silkjær, medido en la axila) y los 5 de la ' +
      'cresta, 28–30, más el subescapular (NO ENCONTRADO). Con 35, la subida en altura (del centro del EIC5 a la 4.ª costilla de ' +
      'la LAM) inclinaba la pleura de la paravertebral (F-T08: un lado a 8,2 mm de la cresta en el EIC8). El rango, de Wada arriba ' +
      'menos 1 DE (28) a 40',
  },
  infrascapularHighWallMm: {
    value: 20,
    unit: 'mm',
    range: [16, 26],
    evidence: 'estimado',
    sources: ['wada-pared-2025', 'okcu-parascapular-2026'],
    note:
      'Piel → pleura arriba en la estación infraescapular (decisión 29), bajo la parte lateral de la escápula: NO ENCONTRADO ' +
      '(búsqueda del 03-10-2026, decisión 36: ni ecografía ni TAC de adultos en la LAP o la infraescapular) [SUPUESTO]. Entre los ' +
      '32 de la espalda alta (Wada, Okçu) y los 18 de la axila (sin este nodo, la interpolación daría ≈ 23); abajo, 16,1. Hasta ' +
      'la decisión 36 lo fijaban dos pruebas (con 24, el detector del banco perdía la pleura del PLAPS y F-T08 fallaba a 1,2π); ' +
      'con el punto BLUE inferior en el centro del EIC4 y la espalda alta de 32, 24 ya no rompe ninguna: ninguna prueba lo fija',
  },
  infrascapularPhi: {
    value: 1.2 * Math.PI,
    unit: 'rad',
    range: [1.15 * Math.PI, 1.3 * Math.PI],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Estación infraescapular, «LAP–línea escapular» en la base (la línea escapular pasa por el ángulo inferior de la ' +
      'escápula, Gray): 1,2π, entre la axilar posterior (1,125π) y la escapular (a 9 cm de la línea media, 1,31π), el tope de ' +
      'la sonda en supino (`clampPose`) [SUPUESTO: la base no la sitúa]',
  },
  intercostalInspirationMm: {
    value: 0.76,
    unit: 'mm',
    range: [0.4, 0.8],
    evidence: 'documentado',
    sources: ['yoshida-intercostales-2019'],
    note:
      'En inspiración máxima solo engrosan los intercostales anteriores: EIC4 de 2,79 a 3,55 mm (Yoshida); los laterales y ' +
      'posteriores, sin cambio. En el modelo, proporcional al descenso del diafragma sobre el de la inspiración profunda',
  },
  inspirationReferenceMm: {
    value: DIAPHRAGM_EXCURSION.params.deepMm.value,
    unit: 'mm',
    range: [31, 75],
    evidence: 'derivado',
    sources: ['santana-diafragmarevision-2020', 'yoshida-intercostales-2019'],
    note:
      'Descenso del diafragma de la inspiración profunda del modelo respiratorio (`physiology.diaphragmExcursion.deepMm`, ' +
      '5,3 cm en supino, Kantarci vía Santana; decisión 22): el engrosamiento de Yoshida (inspiración máxima) se reparte en él. ' +
      '`chestWall.test.ts` comprueba que es el del modelo',
  },
  abdomenBlendMm: {
    value: 100,
    unit: 'mm',
    range: [60, 150],
    evidence: 'estimado',
    sources: [],
    note:
      'Bajo el reborde costal la pared pasa a la del abdomen del hábito (VExUS: 28 mm) en estos mm [SUPUESTO]: al lado, de 13 a ' +
      '28 mm. Más corta, las capas se inclinan demasiado: en 20 mm la cara interna de la pared caía 37° bajo la sonda y el ' +
      'contacto no apoyaba la cara; en 60, junto al reborde oblicuo de delante y de detrás, el gradiente de sus caras pasaba ' +
      'la cota de la salida barata de la pasada B (1,5)',
  },
  thinFatMm: {
    value: 1.75,
    unit: 'mm',
    range: [1.5, 2],
    evidence: 'estimado',
    sources: ['mclean-paredus-2011'],
    note:
      'Variante delgada (IMC ≈ 18,5), EIC2-LMC 12 mm [SUPUESTO de la base, §2.4]: grasa 1,5–2 mm y pectoral 6; en las demás ' +
      'estaciones la grasa y el músculo se escalan igual (lateral: 10 mm, × 0,8 como en la base)',
  },
  thinPectoralMm: {
    value: 6,
    unit: 'mm',
    range: [4, 8],
    evidence: 'estimado',
    sources: ['mclean-paredus-2011'],
    note: 'Ídem: el pectoral de la variante delgada',
  },
  obeseAnteriorWallMm: {
    value: 23,
    unit: 'mm',
    range: [20, 30],
    evidence: 'documentado',
    sources: ['mclean-paredus-2011'],
    note: 'Variante obesa (IMC ≈ 32–35), EIC2-LMC: las mujeres de McLean (IMC 30,0), 23 mm (17–27). La diferencia con el avatar, en grasa',
  },
  obeseLateralRatio: {
    value: 1.1,
    unit: 'cociente',
    range: [1, 1.3],
    evidence: 'estimado',
    sources: ['alkan-paredobeso-2025'],
    note:
      'Variante obesa, EIC5-LAM / EIC2-LMC: ≥ 1,0 (Alkan, la dirección) y 1,1 de trabajo [SUPUESTO de la base, §2.5]; la ' +
      'diferencia con el avatar, en grasa. Detrás y junto a la columna, lo mismo que delante [SUPUESTO]',
  },
  femaleAnteriorExtraMm: {
    value: 2,
    unit: 'mm',
    range: [0, 3],
    evidence: 'estimado',
    sources: ['mclean-paredus-2011'],
    note:
      'Mujer: la mama añade en ecografía +0–3 mm en EIC2-LMC (McLean, documentado; +8 en la pared anatómica, Laan y Yamagiwa); ' +
      'se toman 2 [SUPUESTO: el punto dentro del rango], en grasa, del esternón a la axilar anterior y apagándose hasta la media ' +
      '(Gray: la mama llega a la LAM)',
  },
});

/**
 * La pared que mira el campo respiratorio (lus-sim, decisión 22; `respiratoryWallOf`). No cambia la anatomía: solo dónde
 * empieza a moverse el tejido de dentro.
 */
export const RESPIRATORY_WALL = defineParameters('anatomy.respiratoryWall', {
  slopeMax: {
    value: 0.1,
    unit: 'mm/mm',
    range: [0.05, 0.15],
    evidence: 'estimado',
    sources: [],
    note:
      'Pendiente máxima con que la pared que mira el peso respiratorio engruesa hacia abajo (el paso del tórax al abdomen bajo ' +
      'el reborde costal, alargado lo que haga falta) [SUPUESTO de diseño]. Con la rampa de 25 mm del peso, el término de la ' +
      'pared en el jacobiano queda ≤ 1,5·0,1/25·D: 0,32 con 53 mm y 0,45 con 75 (el máximo del rango de la excursión profunda), ' +
      'con cualquier grasa del abdomen. Con la pared de verdad (0,23 en el avatar, 0,27 en la delgada, más con más grasa) el ' +
      'campo se plegaba con 62–73 mm, o con 53 y 25 mm de grasa en el abdomen',
  },
});

/** Paso de la tabla en |u| (mm de piel) y columnas: de la línea media anterior a la posterior (≈ 421 mm). */
export const CHEST_WALL_DU_MM = 8;
export const CHEST_WALL_COLS = 56;
/**
 * Téxeles por columna: (W alta, W baja, z del reborde costal, peso inspiratorio), (piel, grasa, complejo, banda) altas y
 * las mismas bajas; todo en la métrica radial de la pared (mm). Y (lus-sim, cobertura torácica: la cúpula pleural,
 * `organs/lungApex.ts`) (zApex, zTop, 0, 0): desde zApex la pared engruesa hasta cerrarse sobre el vértice en zTop.
 */
export const CHEST_WALL_TEXELS_PER_COL = 4;
export const CHEST_WALL_TEXELS = CHEST_WALL_COLS * CHEST_WALL_TEXELS_PER_COL;
/** Téxel de la textura de escena donde empieza la tabla: tras la de la parrilla costal. */
export const CHEST_WALL_BASE = RIB_TABLE_BASE + RIB_TABLE_TEXELS;

/** Capas de una estación, por la normal de la piel (mm): piel, grasa, músculo sobre los intercostales, banda, complejo. */
interface StationLayers {
  skin: number;
  fat: number;
  muscle: number;
  band: number;
  complex: number;
}

/** Las estaciones de la pared (|u| en mm de piel), para las pruebas y la documentación. */
export interface ChestWallStations {
  /** El borde del cuerpo del esternón (de la línea media a él, la pared del esternón). */
  sternalEdge: number;
  parasternal: number;
  midclavicular: number;
  anteriorAxillary: number;
  midaxillary: number;
  posteriorAxillary: number;
  infrascapular: number;
  paravertebral: number;
  posteriorMidline: number;
}

/** La pared torácica de un hábito: la tabla, sus alturas y las capas del abdomen bajo el reborde. */
export interface ChestWall extends ChestWallLookup {
  /** `CHEST_WALL_TEXELS` téxeles RGBA (float32, como en la GPU). */
  table: Float32Array;
  /** Alturas (z, mm) del cambio de la pared alta a la baja: la 4.ª costilla y el centro del EIC5 de la LAM. */
  zHigh: number;
  zLow: number;
  /** Capas del abdomen (radiales): piel, grasa, músculo (con la preperitoneal), preperitoneal. */
  abdomen: [number, number, number, number];
  /**
   * La cúpula pleural más baja de la tabla (mm): por encima, la pared puede pasar de `maxTotal` (lus-sim, cobertura torácica:
   * la cúpula pleural, `setChestWallApex`); 1e4 sin cúpula.
   */
  apexMinZ: number;
  /**
   * Cota superior del grosor de la pared en todo el tronco (mm, radial): la GLSL no lee la tabla para las muestras más
   * hondas que ella más lo que miran la cortina, el «resto» y el peso respiratorio (ahí el resultado no depende del grosor).
   */
  maxTotal: number;
  stations: ChestWallStations;
  habitus: ChestHabitus;
}

/** Hábito torácico por omisión: el del avatar, varón de complexión media. */
export const DEFAULT_CHEST_HABITUS: ChestHabitus = { build: 'average', sex: 'male' };

/** Interpolante cúbico monótono (Fritsch–Carlson) por los puntos (x creciente); constante fuera. */
export function pchip(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const dl: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    dl.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = dl[0];
  m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (dl[i - 1] * dl[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]);
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const s = (x - xs[i]) / h[i];
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** smoothstep de GLSL (e0 < e1). */
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, f: number): number => a * (1 - f) + b * f;

/** |u| de la piel en el ángulo del tronco φ. */
export function skinArc(phi: number, t: Torso): number {
  return Math.abs(wallArc(torsoSkinPoint(phi, 0, t), t));
}

/** Norma del gradiente de `torsoDepth` a media pared bajo la piel de arco u (la de la normal a la radial). */
function metricAt(u: number, depth: number, t: Torso): number {
  let lo = 0;
  let hi = Math.PI;
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    if (Math.abs(wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t)) < u) lo = mid;
    else hi = mid;
  }
  const tau = 0.5 * (lo + hi);
  const sx = t.a * Math.sin(tau);
  const sy = t.b * Math.cos(tau);
  const k = 1 - depth / Math.hypot(sx, sy);
  const g = torsoDepthGradient([sx * k, sy * k, 0], t);
  return Math.hypot(g[0], g[1]);
}

/**
 * Las capas de las estaciones (por la normal) del hábito: el avatar y sus variantes (delgada, obesa, mujer; anatomy.md
 * §2.4–2.6). Devuelve, por estación, las capas altas y bajas.
 */
function stationLayers(
  h: ChestHabitus,
  complex: number,
): {
  sternal: StationLayers;
  anterior: StationLayers;
  lateralLow: StationLayers;
  lateralHigh: StationLayers;
  posterior: StationLayers;
  paravertebral: StationLayers;
  posteriorHigh: StationLayers;
  infrascapularHigh: StationLayers;
  femaleExtra: number;
} {
  const P = CHEST_WALL.params;
  const skinA = P.skinAnteriorMm.value;
  const skinP = P.skinPosteriorMm.value;
  const anterior: StationLayers = {
    skin: skinA,
    fat: P.fatAnteriorMm.value,
    muscle: P.pectoralMm.value,
    band: P.intercostalAnteriorMm.value,
    complex,
  };
  // sobre el esternón no hay pectoral ni intercostales: piel, grasa presternal (la de delante) y el hueso, que cuelga de la
  // pleura (`organs/ribcage.ts`); su grosor ocupa el músculo y la banda de la tabla (lo clasifica la parrilla)
  const sternumMm = RIBCAGE.params.sternumThicknessMm.value;
  const sternal: StationLayers = {
    skin: skinA,
    fat: P.fatAnteriorMm.value,
    muscle: sternumMm - P.intercostalAnteriorMm.value,
    band: P.intercostalAnteriorMm.value,
    complex,
  };
  const lateralLow: StationLayers = {
    skin: skinA,
    fat: P.fatLateralMm.value,
    muscle: P.serratusMm.value,
    band: P.intercostalLateralMm.value,
    complex,
  };
  const highBand = P.intercostalLateralHighMm.value;
  const highFat = P.fatLateralHighMm.value;
  const lateralHigh: StationLayers = {
    skin: skinA,
    fat: highFat,
    muscle: P.lateralHighWallMm.value - skinA - highFat - highBand - complex,
    band: highBand,
    complex,
  };
  const posterior: StationLayers = {
    skin: skinP,
    fat: P.fatPosteriorMm.value,
    muscle: P.latissimusMm.value,
    band: P.intercostalPosteriorMm.value,
    complex,
  };
  const pvBand = P.intercostalPosteriorMm.value;
  const paravertebral: StationLayers = {
    skin: skinP,
    fat: P.fatPosteriorMm.value,
    muscle: P.paravertebralWallMm.value - skinP - P.fatPosteriorMm.value - pvBand - complex,
    band: pvBand,
    complex,
  };
  // la espalda alta (decisión 29): de la paravertebral a la infraescapular, con la escápula y sus músculos
  const posteriorHigh: StationLayers = {
    skin: skinP,
    fat: P.fatPosteriorMm.value,
    muscle: P.posteriorHighWallMm.value - skinP - P.fatPosteriorMm.value - pvBand - complex,
    band: pvBand,
    complex,
  };
  const infrascapularHigh: StationLayers = {
    ...posterior,
    muscle: P.infrascapularHighWallMm.value - skinP - P.fatPosteriorMm.value - P.intercostalPosteriorMm.value - complex,
  };
  const all = [anterior, lateralLow, lateralHigh, posterior, paravertebral, posteriorHigh, infrascapularHigh];
  if (h.build === 'thin') {
    const f = P.thinFatMm.value / P.fatAnteriorMm.value;
    const mu = P.thinPectoralMm.value / P.pectoralMm.value;
    for (const s of all) {
      s.fat *= f;
      s.muscle *= mu;
    }
    // el esternón no adelgaza
    sternal.fat *= f;
  } else if (h.build === 'obese') {
    const total = (s: StationLayers) => s.skin + s.fat + s.muscle + s.band + s.complex;
    const dAnterior = P.obeseAnteriorWallMm.value - total(anterior);
    const dLateral = P.obeseLateralRatio.value * P.obeseAnteriorWallMm.value - total(lateralLow);
    sternal.fat += dAnterior;
    anterior.fat += dAnterior;
    lateralLow.fat += dLateral;
    // la axila alta, lo mismo que delante: con el aumento del lado (EIC5-LAM, Alkan) la pared de la axila pasaba de 30 mm y
    // bajaba 7 mm hacia atrás
    lateralHigh.fat += dAnterior;
    posterior.fat += dAnterior;
    paravertebral.fat += dAnterior;
    posteriorHigh.fat += dAnterior;
    infrascapularHigh.fat += dAnterior;
  }
  return {
    sternal,
    anterior,
    lateralLow,
    lateralHigh,
    posterior,
    paravertebral,
    posteriorHigh,
    infrascapularHigh,
    femaleExtra: h.sex === 'female' ? P.femaleAnteriorExtraMm.value : 0,
  };
}

/**
 * La pared torácica del tronco `t` (su hábito del abdomen, `skinMm`/`fatMm`/`muscleMm`/`preperitonealMm`, queda bajo el
 * reborde) para el hábito torácico `habitus`; `complexMm` es el complejo pleura + fascia endotorácica de la parrilla. Las
 * alturas (`zHigh`, `zLow`) y el reborde costal por columna los pone `setChestWallCage` con la parrilla: hasta entonces la
 * pared es la torácica baja en todo el tronco (la que usa la construcción de la parrilla, en z = 0).
 */
export function buildChestWall(t: Torso, habitus: ChestHabitus, complexMm: number): ChestWall {
  const P = CHEST_WALL.params;
  const L = stationLayers(habitus, complexMm);
  const st: ChestWallStations = {
    sternalEdge: skinArc(Math.PI - Math.acos(RIBCAGE.params.sternumBodyHalfWidthMm.value / t.a), t),
    parasternal: skinArc(thoraxLinePhi('parasternal', t), t),
    midclavicular: skinArc(thoraxLinePhi('midclavicular', t), t),
    anteriorAxillary: skinArc(thoraxLinePhi('anteriorAxillary', t), t),
    midaxillary: skinArc(thoraxLinePhi('midaxillary', t), t),
    posteriorAxillary: skinArc(thoraxLinePhi('posteriorAxillary', t), t),
    infrascapular: skinArc(P.infrascapularPhi.value, t),
    paravertebral: skinArc(thoraxLinePhi('paravertebral', t), t),
    posteriorMidline: 0.5 * wallPerimeter(t),
  };
  // nodos de las capas bajas y altas: el esternón (de la línea media a su borde), delante (paraesternal, LMC), al lado (LAA, LAM; la LAP solo en las
  // altas, el pliegue axilar posterior), detrás (infraescapular, paravertebral y línea media posterior; desde la decisión 28,
  // la paravertebral con su grosor, y desde la 29, las altas de detrás más gruesas: la espalda alta con la escápula)
  const low: Array<[number, StationLayers]> = [
    [0, L.sternal],
    [st.sternalEdge, L.sternal],
    [st.parasternal, L.anterior],
    [st.midclavicular, L.anterior],
    [st.anteriorAxillary, L.lateralLow],
    [st.midaxillary, L.lateralLow],
    [st.infrascapular, L.posterior],
    [st.paravertebral, L.paravertebral],
    [st.posteriorMidline, L.paravertebral],
  ];
  const high: Array<[number, StationLayers]> = [
    [0, L.sternal],
    [st.sternalEdge, L.sternal],
    [st.parasternal, L.anterior],
    [st.midclavicular, L.anterior],
    [st.anteriorAxillary, L.lateralHigh],
    [st.midaxillary, L.lateralHigh],
    [st.posteriorAxillary, L.lateralHigh],
    [st.infrascapular, L.infrascapularHigh],
    // la espalda alta (decisión 29), de la línea escapular a la media; hacia la infraescapular, a 0,28 mm por mm de piel
    [skinArc(thoraxLinePhi('scapular', t), t), L.posteriorHigh],
    [st.paravertebral, L.posteriorHigh],
    [st.posteriorMidline, L.posteriorHigh],
  ];
  const profile = (nodes: Array<[number, StationLayers]>, key: keyof StationLayers) =>
    pchip(
      nodes.map((n) => n[0]),
      nodes.map((n) => n[1][key]),
    );
  const keys: (keyof StationLayers)[] = ['skin', 'fat', 'muscle', 'band', 'complex'];
  const lowP = Object.fromEntries(keys.map((k) => [k, profile(low, k)])) as Record<keyof StationLayers, (u: number) => number>;
  const highP = Object.fromEntries(keys.map((k) => [k, profile(high, k)])) as Record<keyof StationLayers, (u: number) => number>;
  // la mama (mujer): grasa del esternón a la axilar anterior, que se apaga hasta la media
  const breast = (u: number) => L.femaleExtra * (1 - smoothstep(st.anteriorAxillary, st.midaxillary, u));
  // peso de la inspiración: delante hasta la LMC, nada desde la axilar anterior (Yoshida: solo los anteriores)
  const inspW = (u: number) => 1 - smoothstep(st.midclavicular, st.anteriorAxillary, u);
  const table = new Float32Array(CHEST_WALL_TEXELS * 4);
  for (let j = 0; j < CHEST_WALL_COLS; j++) {
    const u = j * CHEST_WALL_DU_MM;
    const texel = (p: Record<keyof StationLayers, (u: number) => number>) => {
      const fat = p.fat(u) + breast(u);
      const total = p.skin(u) + fat + p.muscle(u) + p.band(u) + p.complex(u);
      const g = metricAt(u, 0.5 * total, t);
      return { W: g * total, v: [g * p.skin(u), g * fat, g * p.complex(u), g * p.band(u)] };
    };
    const hi = texel(highP);
    const lo = texel(lowP);
    const o = j * CHEST_WALL_TEXELS_PER_COL * 4;
    // el engrosamiento inspiratorio, por la normal (Yoshida): en la radial, × |∇|
    table.set([hi.W, lo.W, -1e4, inspW(u) * metricAt(u, 0.5 * lo.W, t)], o);
    table.set(hi.v, o + 4);
    table.set(lo.v, o + 8);
    // sin cúpula hasta que la pone `setChestWallApex`
    table.set([1e4, 1e4, 0, 0], o + 12);
  }
  let maxTotal = t.skinMm + t.fatMm + t.muscleMm;
  for (let j = 0; j < CHEST_WALL_COLS; j++) {
    const o = j * CHEST_WALL_TEXELS_PER_COL * 4;
    maxTotal = Math.max(maxTotal, table[o], table[o + 1]);
  }
  const cw: ChestWall = {
    table,
    zHigh: 1e4,
    zLow: 1e4 - 1,
    abdomen: [t.skinMm, t.fatMm, t.muscleMm, t.preperitonealMm],
    apexMinZ: 1e4,
    maxTotal,
    stations: st,
    habitus,
    layers: (u, z) => wallLayersAt(cw, u, z),
    total: (u, z) => wallTotalAt(cw, u, z),
    inspiration: (u, z, caudalMm) => chestWallInspiration(cw, u, z, caudalMm),
    cupola: (u, z) => wallCupolaMm(cw, u, z),
  };
  return cw;
}

/**
 * Las alturas de la pared con la parrilla construida: `zHigh`, la 4.ª costilla, y `zLow`, el centro del EIC5, en la axilar
 * media (de la costilla derecha: las dos parrillas son simétricas); y por columna la z del reborde costal (el borde inferior
 * de la costilla más baja que llega a ese |u|; junto a la línea media, la punta del xifoides; detrás de la columna, el de la
 * última columna con costillas), suavizada. La pared baja del EIC5 (Nelson, 13 mm) y la alta de la axila (McLean, 18 en el
 * EIC4) no caben en un solo espacio intercostal: 5 mm de salto entre los centros de dos espacios vecinos inclinarían la
 * pleura bajo la costilla de en medio y romperían el signo del murciélago (la pleura a 3,7 mm bajo la línea costal en el
 * EIC5 de la LAM). La transición va del centro del EIC5 a la 4.ª costilla: el EIC4 queda a 16,6 mm, tan cerca de los 18
 * de la base como deja el signo del murciélago de los dos espacios ([DISCREPANCIA] de la base, decisión 17).
 */
export function setChestWallCage(
  cw: ChestWall,
  lamZ: (n: number) => number,
  lowestRibBottomZ: (au: number) => number | null,
  xiphoidTipZ: number,
): void {
  cw.zHigh = lamZ(4);
  cw.zLow = 0.5 * (lamZ(5) + lamZ(6));
  // por delante de las costillas (el esternón), la punta del xifoides; por detrás de sus extremos posteriores (la columna),
  // el de la última columna con costillas
  const raw: number[] = [];
  let last: number | null = null;
  for (let j = 0; j < CHEST_WALL_COLS; j++) {
    const z = lowestRibBottomZ(j * CHEST_WALL_DU_MM);
    if (z !== null) last = z;
    raw.push(z ?? last ?? xiphoidTipZ);
  }
  // el reborde salta en las puntas libres (la 11.ª y la 12.ª): una media móvil de ±`MARGIN_SMOOTH_COLS` columnas (±24 mm)
  // lo convierte en rampa, para que el paso al abdomen no incline las capas en |u| más que en z (el gradiente de sus caras,
  // que la salida barata de la pasada B acota, `IFACE_GRADIENT_MAX`)
  for (let j = 0; j < CHEST_WALL_COLS; j++) {
    let sum = 0;
    let n = 0;
    for (let k = j - MARGIN_SMOOTH_COLS; k <= j + MARGIN_SMOOTH_COLS; k++) {
      // la tabla es simétrica en u: por delante de la línea media, las columnas del otro lado; por detrás, las mismas
      const kk = Math.min(CHEST_WALL_COLS - 1, Math.abs(k));
      sum += raw[kk];
      n++;
    }
    cw.table[j * CHEST_WALL_TEXELS_PER_COL * 4 + 2] = sum / n;
  }
}

/**
 * La cúpula pleural por columna (lus-sim, cobertura torácica; `organs/lungApex.ts`): `zApex(u)`, la altura desde la que la
 * pared engruesa (la pleura deja la cara interna de la pared), y `zTop(u)`, la del techo de la cúpula. Se pone con la parrilla
 * y el borde del pulmón construidos (los da `lungApexColumns`).
 */
export function setChestWallApex(cw: ChestWall, zApex: (u: number) => number, zTop: (u: number) => number): void {
  let lo = 1e4;
  for (let j = 0; j < CHEST_WALL_COLS; j++) {
    const u = j * CHEST_WALL_DU_MM;
    const a = zApex(u);
    cw.table.set([a, Math.max(zTop(u), a), 0, 0], (j * CHEST_WALL_TEXELS_PER_COL + 3) * 4);
    lo = Math.min(lo, a);
  }
  cw.apexMinZ = Math.fround(lo);
}

/** Semiancho (columnas) de la media móvil del reborde costal. */
const MARGIN_SMOOTH_COLS = 3;

/** Columna y fracción de la tabla para |u| (la interpolación lineal de la GPU). */
function column(u: number): [number, number] {
  const tc = Math.min(Math.abs(u) / CHEST_WALL_DU_MM, CHEST_WALL_COLS - 1 - 1e-4);
  const j = Math.floor(tc);
  return [j, tc - j];
}

/** Téxel k de la columna j interpolado con el de la siguiente. */
function texelAt(cw: ChestWall, j: number, f: number, k: number): [number, number, number, number] {
  const a = (j * CHEST_WALL_TEXELS_PER_COL + k) * 4;
  const b = a + CHEST_WALL_TEXELS_PER_COL * 4;
  const T = cw.table;
  return [mix(T[a], T[b], f), mix(T[a + 1], T[b + 1], f), mix(T[a + 2], T[b + 2], f), mix(T[a + 3], T[b + 3], f)];
}

/** Peso de la pared alta (1 sobre la 4.ª costilla de la LAM, 0 bajo el centro del EIC5) y del abdomen (1 a `abdomenBlendMm` bajo el reborde). */
function weights(cw: ChestWall, z: number, margin: number): [number, number] {
  return [smoothstep(cw.zLow, cw.zHigh, z), 1 - smoothstep(margin - CHEST_WALL.params.abdomenBlendMm.value, margin, z)];
}

/** Grosor total de la pared (mm, métrica radial) en (u, z), con la cúpula pleural (gemelo GLSL con el mismo nombre). */
export function wallTotalAt(cw: ChestWall, u: number, z: number): number {
  return wallTotalOf(cw, wallColumnTexel(cw, u), z) + wallCupolaMm(cw, u, z);
}

/**
 * Cota de la distancia a la frontera de una muestra de la pared sobre la cúpula pleural (lus-sim, cobertura torácica; gemelo
 * GLSL con el mismo nombre): bajando en vertical hasta `zApex` la pared vuelve a su grosor y lo más hondo que ella es pulmón,
 * así que la frontera está a lo sumo a z − zApex (las capas solo miden en la radial, y el techo de la cúpula es horizontal);
 * 1e3 sin cúpula.
 */
export function wallCupolaBd(cw: ChestWall, u: number, z: number): number {
  if (z <= cw.apexMinZ) return 1e3;
  const [j, f] = column(u);
  const a = texelAt(cw, j, f, 3);
  return z > a[0] ? z - a[0] : 1e3;
}

/**
 * Lo que la cúpula pleural engruesa la pared (mm, radial) en (u, z) (lus-sim, cobertura torácica; gemelo GLSL con el mismo
 * nombre): las partes blandas del cuello y del hombro entre la piel y la pleura cervical.
 */
export function wallCupolaMm(cw: ChestWall, u: number, z: number): number {
  if (z <= cw.apexMinZ) return 0;
  const [j, f] = column(u);
  const a = texelAt(cw, j, f, 3);
  return cupolaMm(a[0], a[1], z);
}

/**
 * El primer téxel de la columna de |u| interpolado (grosores alto y bajo, reborde costal, peso inspiratorio; gemelo GLSL con el
 * mismo nombre): lo que el grosor total no cambia con z (decisión 22, la inversa del campo respiratorio).
 */
export function wallColumnTexel(cw: ChestWall, u: number): [number, number, number, number] {
  const [j, f] = column(u);
  return texelAt(cw, j, f, 0);
}

/** Grosor total de la pared (mm) a la altura z con el téxel de su columna (`wallColumnTexel`; gemelo GLSL con el mismo nombre). */
export function wallTotalOf(cw: ChestWall, a: readonly [number, number, number, number], z: number): number {
  const [hi, abd] = weights(cw, z, a[2]);
  const A = cw.abdomen;
  return mix(mix(a[1], a[0], hi), A[0] + A[1] + A[2], abd);
}

/**
 * La pared como la ve el campo respiratorio (lus-sim, decisión 22): el tejido que baja junto a una pared que engruesa hacia
 * abajo se comprime, y bajo el reborde costal la pared del tórax pasa a la del abdomen (de 13 a 28 mm en 100 mm: 0,23 mm por
 * mm; más con más grasa en el abdomen). El peso del campo la mira con ese paso alargado hasta que su pendiente no pase de
 * `anatomy.respiratoryWall.slopeMax`: su largo, en la columna del téxel `a` (gemelo GLSL con el mismo nombre). La cota del
 * jacobiano sale así de la construcción, con cualquier hábito del abdomen.
 */
export function respiratoryWallBlendMm(cw: ChestWall, a: readonly [number, number, number, number]): number {
  const A = cw.abdomen;
  const excess = Math.max(A[0] + A[1] + A[2] - Math.min(a[0], a[1]), 0);
  return Math.max(CHEST_WALL.params.abdomenBlendMm.value, (1.5 * excess) / RESPIRATORY_WALL.params.slopeMax.value);
}

/**
 * El grosor de la pared (mm) que mira el campo respiratorio a la altura z (gemelo GLSL con el mismo nombre): donde el abdomen es
 * más grueso que el tórax, el del tórax más lo que le falta para el del abdomen por el paso alargado (`respiratoryWallBlendMm`,
 * `blend`), que pesa al menos lo que el de verdad; donde es más fino, la pared de verdad (`wallTotalOf`: una pared que adelgaza
 * hacia abajo solo estira el tejido que baja junto a ella, no lo pliega). Nunca menor que la de verdad.
 */
export function respiratoryWallOf(cw: ChestWall, a: readonly [number, number, number, number], blend: number, z: number): number {
  const A = cw.abdomen;
  const chest = mix(a[1], a[0], smoothstep(cw.zLow, cw.zHigh, z));
  const margin0 = a[2] - CHEST_WALL.params.abdomenBlendMm.value;
  const d = A[0] + A[1] + A[2] - chest;
  return chest + d * (1 - smoothstep(margin0, margin0 + (d > 0 ? blend : CHEST_WALL.params.abdomenBlendMm.value), z));
}

/** Capas de la pared (mm, métrica radial) en (u, z) (gemelo GLSL con el mismo nombre). */
export function wallLayersAt(cw: ChestWall, u: number, z: number): WallLayersAt {
  const [j, f] = column(u);
  const a = texelAt(cw, j, f, 0);
  const H = texelAt(cw, j, f, 1);
  const Lo = texelAt(cw, j, f, 2);
  const [hi, abd] = weights(cw, z, a[2]);
  // la cúpula pleural (lus-sim, cobertura torácica): su grosor es músculo (las partes blandas del cuello)
  const W = mix(a[1], a[0], hi) + wallCupolaMm(cw, u, z);
  const skin = mix(Lo[0], H[0], hi);
  const fat = mix(Lo[1], H[1], hi);
  const pre = mix(Lo[2], H[2], hi);
  const band = mix(Lo[3], H[3], hi);
  const A = cw.abdomen;
  return {
    skin: mix(skin, A[0], abd),
    fat: mix(fat, A[1], abd),
    muscle: mix(W - skin - fat, A[2], abd),
    pre: mix(pre, A[3], abd),
    band,
    abdomen: abd,
  };
}

/**
 * Lo que engruesa la banda intercostal (mm, radial) al inspirar: delante, proporcional al descenso del diafragma (el peso de
 * la tabla lleva la métrica: por la normal, `intercostalInspirationMm`).
 */
export function chestWallInspiration(cw: ChestWall, u: number, _z: number, caudalMm: number): number {
  const [j, f] = column(u);
  const P = CHEST_WALL.params;
  const insp = P.intercostalInspirationMm.value;
  return texelAt(cw, j, f, 0)[3] * Math.min((insp / P.inspirationReferenceMm.value) * Math.max(caudalMm, 0), insp);
}

const f4 = (x: number): string => x.toFixed(4);

/**
 * Gemelo GLSL. Usa la tabla en la textura de escena (`sceneTexel`, desde `CW_BASE`), uWall (la pared del abdomen del
 * hábito), uChestWall = (zHigh, zLow, engrosamiento inspiratorio por mm de descenso, grosor máximo de la pared) y uResp.x (el
 * descenso del diafragma).
 */
const PW = CHEST_WALL.params;
export const CHEST_WALL_GLSL = /* glsl */ `
#define CW_BASE ${CHEST_WALL_BASE}
#define CW_COLS ${CHEST_WALL_COLS}
#define CW_DU ${f4(CHEST_WALL_DU_MM)}
#define CW_ABD_BLEND ${f4(PW.abdomenBlendMm.value)}
#define CW_INSP_MM ${f4(PW.intercostalInspirationMm.value)}
#define CW_RESP_SLOPE ${f4(RESPIRATORY_WALL.params.slopeMax.value)}
vec4 cwTexel(int j, float f, int k) {
  int a = CW_BASE + j * ${CHEST_WALL_TEXELS_PER_COL} + k;
  return mix(sceneTexel(a), sceneTexel(a + ${CHEST_WALL_TEXELS_PER_COL}), f);
}
float cwColumn(float u, out int j) {
  float tc = min(abs(u) / CW_DU, float(CW_COLS - 1) - 1e-4);
  j = int(floor(tc));
  return tc - float(j);
}
// el primer téxel de la columna de |u| (grosores alto y bajo, reborde costal, peso inspiratorio) y el grosor total a la altura
// z con él (decisión 22: la inversa del campo respiratorio lee la columna una vez y recorre z)
vec4 wallColumnTexel(float u) {
  int j;
  float f = cwColumn(u, j);
  return cwTexel(j, f, 0);
}
float wallTotalOf(vec4 a, float z) {
  float hi = smoothstep(uChestWall.y, uChestWall.x, z);
  float abd = 1.0 - smoothstep(a.z - CW_ABD_BLEND, a.z, z);
  return mix(mix(a.y, a.x, hi), uWall.x + uWall.y + uWall.z, abd);
}
// la cúpula pleural (lus-sim, cobertura torácica; organs/lungApex.ts): desde uCupola.x, la menor zApex de la tabla
float wallCupolaMm(float u, float z) {
  if (z <= uCupola.x) return 0.0;
  int j;
  float f = cwColumn(u, j);
  return cupolaMm(cwTexel(j, f, 3).xy, z);
}
float wallTotalAt(float u, float z) { return wallTotalOf(wallColumnTexel(u), z) + wallCupolaMm(u, z); }
float wallCupolaBd(float u, float z) {
  if (z <= uCupola.x) return 1e3;
  int j;
  float f = cwColumn(u, j);
  float za = cwTexel(j, f, 3).x;
  return z > za ? z - za : 1e3;
}
// la pared que mira el campo respiratorio (decisión 22): el paso al abdomen alargado hasta la pendiente CW_RESP_SLOPE
float respiratoryWallBlendMm(vec4 a) {
  return max(CW_ABD_BLEND, 1.5 * max(uWall.x + uWall.y + uWall.z - min(a.x, a.y), 0.0) / CW_RESP_SLOPE);
}
float respiratoryWallOf(vec4 a, float blend, float z) {
  float chest = mix(a.y, a.x, smoothstep(uChestWall.y, uChestWall.x, z));
  float m0 = a.z - CW_ABD_BLEND;
  float d = uWall.x + uWall.y + uWall.z - chest;
  return chest + d * (1.0 - smoothstep(m0, m0 + (d > 0.0 ? blend : CW_ABD_BLEND), z));
}
// capas (piel, grasa, músculo con la banda y el complejo, complejo) y extra = (banda, engrosamiento inspiratorio, peso del
// abdomen, 0)
vec4 wallLayersAt(float u, float z, out vec4 extra) {
  int j;
  float f = cwColumn(u, j);
  vec4 a = cwTexel(j, f, 0);
  vec4 H = cwTexel(j, f, 1);
  vec4 L = cwTexel(j, f, 2);
  float hi = smoothstep(uChestWall.y, uChestWall.x, z);
  float abd = 1.0 - smoothstep(a.z - CW_ABD_BLEND, a.z, z);
  float W = mix(a.y, a.x, hi) + wallCupolaMm(u, z);
  vec4 s = mix(L, H, hi);
  extra = vec4(s.w, a.w * min(uChestWall.z * max(uResp.x, 0.0), CW_INSP_MM), abd, 0.0);
  return mix(vec4(s.x, s.y, W - s.x - s.y, s.z), uWall, abd);
}
`;
