import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import { torsoDepth, torsoDepthGradient, torsoNormal, torsoSkinPoint, type Spine, type Torso } from '../primitives';
import { thoraxLinePhi } from '../thoraxLines';
import { WALL, wallArc, wallPerimeter, wallTotalMm } from './wall';

/**
 * Parrilla costal del adulto promedio (lus-sim, decisión 16) como módulo de órgano (decisión 46 de VExUS): las 12
 * costillas de cada hemitórax con sus cartílagos, el esternón (manubrio, cuerpo y xifoides) y los 11 espacios
 * intercostales de cada lado, con sus anchos por nivel y región (`docs/knowledge/anatomy.md` §1.3 y §2.3). TS y GLSL
 * viven aquí juntos y con los mismos nombres; sustituye a las costillas 5.ª–10.ª derechas de VExUS (`sdRib` de
 * `primitives.ts`, que queda sin uso en el tórax).
 *
 * Geometría. Cada costilla es un tubo de sección elíptica (alto craneocaudal `2·halfWidth`, grosor radial `2·halfThickness`)
 * cuya línea media corre, en la métrica radial de la pared (`torsoDepth`), a una profundidad fija bajo la piel: su cara
 * interna queda a `pleuraComplexMm` de la cara interna de la pared, la pleura parietal (la parrilla forra la cavidad
 * pleural), así que la pleura está `crestToPleuraMm` bajo la cresta costal en todo el tórax (meta A-T7) aunque la pared
 * cambie de grosor. A lo largo de la costilla la coordenada es u, la longitud de arco de la piel desde la línea media
 * anterior (`wallArc`, la de la pared: + a la izquierda); la altura de su línea media, z(u), viaja en una tabla (una
 * columna cada `RIB_TABLE_DU_MM` de |u|, en la textura de escena desde `RIB_TABLE_BASE`) que TS y GLSL interpolan igual.
 *
 * Construcción (`buildRibCage`). La tabla sale de lo que la base documenta, en este orden:
 *  1. los extremos posteriores: la costilla n articula con la apófisis transversa de T(n) (Gray, «The Ribs»), a la altura
 *     de la mitad de su cuerpo; los segmentos torácicos miden 28 cm / 12 (Gray, «The Vertebral Column as a Whole»), con
 *     z = 0 en la unión xifoesternal, al nivel del disco T9–T10 (Gray, «Surface Markings of the Thorax»);
 *  2. la 5.ª costilla como referencia: en la línea medioclavicular a la altura de la 9.ª junto a la columna (la línea de
 *     Treves que cita Gray) y, entre ahí y la columna, en un plano inclinado (su altura lineal en la coordenada
 *     anteroposterior: el ángulo costal sagital de Robinson y cols.);
 *  3. los anchos de los 11 espacios intercostales como perfiles a lo largo de u, dados en estaciones: junto a la columna
 *     (un segmento vertebral menos el alto costal), en la axilar posterior y en la media (Kim y cols.), en la
 *     medioclavicular (el avatar de la base) y en la paraesternal (Seong y Woo); las costillas 8.ª–10.ª acaban en el
 *     cartílago de la de arriba (su espacio se cierra en la punta) y las 11.ª–12.ª, libres;
 *  4. cada costilla sale de la 5.ª sumando alto y espacio: z_{n+1}(u) = z_n(u) − 2·halfWidth − W_n(u).
 * Las cifras llevan su evidencia en `RIBCAGE` y, lo estimado, su fila en `docs/APPROXIMATIONS.md`.
 */

/** Costillas por hemitórax. */
export const RIBS_PER_SIDE = 12;
/** Costillas de la escena (las dos parrillas); el índice `MAX_RIBS` en `ribSd` es el esternón. */
export const MAX_RIBS = 2 * RIBS_PER_SIDE;
/** Paso de la tabla de alturas en |u| (mm): la interpolación lineal se aparta ≤ 0,05 mm de la curva construida. */
export const RIB_TABLE_DU_MM = 4;
/** Columnas de la tabla: de la línea media anterior (|u| = 0) a la posterior (|u| ≈ 421 mm en el tronco de referencia). */
export const RIB_TABLE_COLS = 112;
/** Téxel de la textura de escena donde empieza la tabla (tras la de la compresión de la sonda, 64 nodos). */
export const RIB_TABLE_BASE = 64;
/** Téxeles de la tabla: por lado y columna, tres (las alturas de las costillas 1–4, 5–8 y 9–12). */
export const RIB_TABLE_TEXELS = 2 * RIB_TABLE_COLS * 3;
export const RIBCAGE = defineParameters('anatomy.ribcage', {
  ribHeightMm: {
    value: 14,
    unit: 'mm',
    range: [13, 15],
    evidence: 'documentado',
    sources: ['kimys-espaciosic-2014'],
    note:
      'Alto craneocaudal de la costilla en ecografía, 13,2–15,2 ± 2 mm en las costillas inferiores laterales derechas (LAA, LAM, ' +
      'LAP; 466 pacientes); el avatar de la base (anatomy.md §2.3) lo extiende a todas. El cartílago lleva el mismo [SUPUESTO: ' +
      'Gray dice que se afina hacia el esternón, sin cifras]. Se calibra con la anatomía, no con la imagen (decisión 16)',
  },
  crestToPleuraMm: {
    value: 5,
    unit: 'mm',
    range: [4, 6],
    evidence: 'consenso',
    sources: ['lichtenstein-luci-2014'],
    note: 'La línea pleural «medio centímetro» bajo la línea costal en el adulto (Fig. 2): de la cresta de la costilla a la pleura parietal',
  },
  pleuraComplexMm: {
    value: 0.3,
    unit: 'mm',
    range: [0.1, 0.5],
    evidence: 'derivado',
    sources: ['im-pleuratc-1989', 'albertine-pleuravisceral-1982', 'albertine-pleuraparietal-1984'],
    note:
      'Complejo pleura + fascia endotorácica del avatar (anatomy.md §2.3): pleura de oveja 83 + 23 µm dentro de la banda de TAC ' +
      'de 1–2 mm. Separa la cara interna de la costilla de la pleura parietal; el grosor radial de la costilla es el resto, ' +
      '5 − 0,3 = 4,7 mm (el grosor pleura–piel de la costilla está NO ENCONTRADO en la base)',
  },
  thoracicSegmentMm: {
    value: 280 / 12,
    unit: 'mm',
    range: [21, 26],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note: 'La columna torácica mide «about 28 cm» en el varón («The Vertebral Column as a Whole»): 280/12 = 23,3 mm por vértebra con su disco',
  },
  jugularNotchZMm: {
    value: (7 * 280) / 12,
    unit: 'mm',
    range: [140, 190],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note:
      'La escotadura yugular «in the same horizontal plane as the lower border of the body of the second thoracic vertebra» y la ' +
      'unión xifoesternal en el disco T9–T10, z = 0 («Surface Markings of the Thorax»): siete segmentos, 7·23,3 = 163,3',
  },
  sternalAngleZMm: {
    value: (5 * 280) / 12,
    unit: 'mm',
    range: [105, 128],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note:
      'El ángulo esternal «at the level of the fifth thoracic vertebra» (Gray), tomado en su borde superior, el disco T4–T5: ' +
      'cinco segmentos, 116,7 (su centro daría 105). Ahí llega el 2.º cartílago («The Sternum»)',
  },
  xiphoidLengthMm: {
    value: 30,
    unit: 'mm',
    range: [15, 50],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Gray describe el xifoides como la pieza más pequeña del esternón, muy variable, sin cifra; la base no lo mide',
  },
  sternumThicknessMm: {
    value: 12,
    unit: 'mm',
    range: [8, 16],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Grosor anteroposterior del esternón: Gray lo da más grueso en el manubrio que en el cuerpo, sin cifras; la base no lo mide',
  },
  manubriumHalfWidthMm: {
    value: 27,
    unit: 'mm',
    range: [22, 32],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Semiancho del manubrio en la escotadura yugular, «broad and thick above» (Gray), que se estrecha hasta el ángulo esternal',
  },
  sternumBodyHalfWidthMm: {
    value: 14,
    unit: 'mm',
    range: [11, 17],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Semiancho del cuerpo del esternón («longer, narrower, and thinner than the manubrium», Gray), constante [SUPUESTO]',
  },
  xiphoidHalfWidthMm: {
    value: 8,
    unit: 'mm',
    range: [5, 11],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Semiancho del xifoides en su base; se afina hasta un tercio en la punta. Cartílago en la parrilla del avatar [SUPUESTO: Gray lo da osificado en parte en el adulto]',
  },
  firstCartilageBelowNotchMm: {
    value: 15,
    unit: 'mm',
    range: [8, 25],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'El 1.er cartílago llega al manubrio justo bajo la carilla de la clavícula (Gray, «The Sternum»); su centro, 15 mm bajo la escotadura',
  },
  internalMammaryOffsetMm: {
    value: 10,
    unit: 'mm',
    range: [8, 12],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'La arteria mamaria interna baja tras los seis primeros cartílagos «about 1 cm from the lateral sternal line» («Surface ' +
      'Markings of the Thorax»): la estación paraesternal, donde Seong y Woo midieron los espacios 2.º y 3.º',
  },
  parasternalIcs2Mm: {
    value: 18.1,
    unit: 'mm',
    range: [14.4, 21.8],
    evidence: 'documentado',
    sources: ['seong-espaciosic-2020'],
    note: '2.º espacio intercostal paraesternal en angio-TAC, a la altura de los vasos mamarios internos, 18,1 ± 3,7 mm (36 mujeres; Tabla 2)',
  },
  parasternalIcs3Mm: {
    value: 12.3,
    unit: 'mm',
    range: [9.3, 15.3],
    evidence: 'documentado',
    sources: ['seong-espaciosic-2020'],
    note: '3.er espacio intercostal paraesternal, 12,3 ± 3,0 mm (ídem)',
  },
  parasternalIcs4Mm: {
    value: 9,
    unit: 'mm',
    range: [6, 12],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Los intervalos entre las carillas costales del esternón «diminish in length from above downward» (Gray, «The Sternum»): ' +
      'de 12,3 (3.º) a 3 (6.º) en pasos de ≈ 3 mm. Con los anchos 2.º–6.º, la 2.ª costilla llega al esternón a 1,7 mm del ángulo esternal',
  },
  parasternalIcs5Mm: {
    value: 6,
    unit: 'mm',
    range: [3, 9],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Ídem (Gray: los intervalos disminuyen hacia abajo)',
  },
  parasternalIcs6Mm: {
    value: 3,
    unit: 'mm',
    range: [1, 6],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Ídem; los cartílagos 6.º y 7.º casi se tocan junto al esternón («enlarged where their margins are in contact», «The ' +
      'Costal Cartilages»). El rango no baja de 1 mm: en la paraesternal son dos cartílagos con su espacio (la cuenta por línea)',
  },
  midclavicularIcs1Mm: {
    value: 36,
    unit: 'mm',
    range: [25, 45],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      '1.er espacio en la medioclavicular: el que deja la 1.ª costilla subiendo un poco hacia fuera desde el manubrio («the ' +
      'first descends a little», su cartílago hacia el esternón, Gray). En el tronco cilíndrico la 1.ª costilla corre bajo la ' +
      'medioclavicular; en el tórax real está tras la clavícula (limitación `thorax-cylindrical-cage`)',
  },
  midclavicularIcs2Mm: {
    value: 18,
    unit: 'mm',
    range: [14, 22],
    evidence: 'derivado',
    sources: ['seong-espaciosic-2020', 'gray-anatomia-1918'],
    note:
      'EIC2 del avatar en la medioclavicular (anatomy.md §2.3, derivado): el 2.º paraesternal de Seong y Woo, 18,1, llevado a la ' +
      'medioclavicular; el más ancho de los anteriores (Gray)',
  },
  midclavicularIcs3to4Mm: {
    value: 14,
    unit: 'mm',
    range: [10, 17],
    evidence: 'derivado',
    sources: ['seong-espaciosic-2020', 'kimys-espaciosic-2014'],
    note: 'EIC3–4 del avatar en la medioclavicular (anatomy.md §2.3): entre el 3.º paraesternal de Seong y los laterales de Kim',
  },
  midclavicularIcs5Mm: {
    value: 15,
    unit: 'mm',
    range: [12, 18],
    evidence: 'derivado',
    sources: ['seong-espaciosic-2020', 'kimys-espaciosic-2014'],
    note:
      'EIC5 del avatar en la medioclavicular (anatomy.md §2.3). [DISCREPANCIA] con Gray, que da los anteriores del 5.º al 9.º ' +
      '«comparatively narrow»: manda la base',
  },
  midclavicularIcs6to7Mm: {
    value: 13,
    unit: 'mm',
    range: [10, 16],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'EIC6–7 en la medioclavicular, «comparatively narrow» (Gray): algo menos que el EIC5 de la base. Son los espacios del seno ' +
      'costofrénico de Gray en esa línea, del borde del pulmón en espiración (la 6.ª costilla) a la reflexión pleural (el 8.º ' +
      'cartílago); la escena los pone ahí desde la decisión 18 (`organs/lungBorder.ts`)',
  },
  midclavicularIcs8Mm: {
    value: 5,
    unit: 'mm',
    range: [1, 10],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'EIC8 en la medioclavicular: el cartílago de la 9.ª se une al de la 8.ª junto a ella (el reborde costal; «The Costal ' +
      'Cartilages»). El rango no baja de 1 mm: la punta del 9.º queda por dentro de la línea, que cruza los dos cartílagos',
  },
  midaxillaryIcs1to4Mm: {
    value: 15,
    unit: 'mm',
    range: [12, 18],
    evidence: 'estimado',
    sources: ['kimys-espaciosic-2014', 'gray-anatomia-1918'],
    note: 'Espacios altos en la axilar media: la base no los mide; algo menos que los bajos de Kim (Gray: más anchos delante que detrás)',
  },
  midaxillaryIcs5to6Mm: {
    value: 16,
    unit: 'mm',
    range: [14, 18],
    evidence: 'estimado',
    sources: ['kimys-espaciosic-2014'],
    note: 'EIC5–6 en la axilar media, entre los altos y los bajos de Kim',
  },
  lateralLowIcsMm: {
    value: 17,
    unit: 'mm',
    range: [14, 20],
    evidence: 'documentado',
    sources: ['kimys-espaciosic-2014'],
    note:
      'EIC lateral bajo del avatar (anatomy.md §2.3), en las axilares anterior y media (EIC7–9; el 10.º, igual): los dos más ' +
      'bajos en ecografía, LAA 19,7 y 18,3, LAM 17,4 y 15,4 mm',
  },
  posteriorAxillaryIcs1to6Mm: {
    value: 12,
    unit: 'mm',
    range: [10, 15],
    evidence: 'estimado',
    sources: ['kimys-espaciosic-2014', 'gray-anatomia-1918'],
    note:
      'Espacios altos en la axilar posterior: sin medida; más estrechos que delante (Gray) y que los bajos de Kim. En la imagen, ' +
      '13,8 mm: bajo los 14–20 de A-T7',
  },
  posteriorAxillaryIcs7to11Mm: {
    value: 16,
    unit: 'mm',
    range: [14, 18],
    evidence: 'documentado',
    sources: ['kimys-espaciosic-2014'],
    note: 'EIC posterior bajo del avatar (anatomy.md §2.3): los dos más bajos en la LAP, 17,2 y 14,5 mm',
  },
  costochondral4to5XMm: {
    value: 75,
    unit: 'mm',
    range: [70, 80],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note:
      'Unión condrocostal de las costillas 4.ª–5.ª a 7–8 cm de la línea media (anatomy.md §2.3): el pezón a 9–10 cm y a 2 cm de ' +
      'ella (Gray). Es anatomía de superficie: la x de la línea de piel bajo la que la sonda (por la normal) corta la unión, como ' +
      'la medioclavicular; la de la 4.ª y la 5.ª, 75 ∓ el paso',
  },
  costochondralStepMm: {
    value: 6,
    unit: 'mm',
    range: [3, 9],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Los cartílagos «increase in length from the first to the seventh» (Gray): la unión condrocostal de la n-ésima (1–8) bajo ' +
      'la línea de piel a 75 + (n − 4,5)·6 mm de la línea media (la 1.ª a 54, con un cartílago de ≈ 3 cm; la 7.ª a 90, por ' +
      'dentro de la medioclavicular; la 8.ª a 96, 1 mm de piel por fuera de ella: la reflexión pleural cruza el 8.º cartílago ' +
      'junto a su unión en la línea mamaria, Gray)',
  },
  costochondralLowStepMm: {
    value: 12,
    unit: 'mm',
    range: [6, 16],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Paso (x de la línea de piel) de la 8.ª unión condrocostal a la 9.ª y de esta a la 10.ª: las uniones siguen hacia fuera y ' +
      'los cartílagos «then gradually decrease to the last» (Gray, «The Costal Cartilages»), lo que pide un paso menor que el de ' +
      'las puntas del reborde (≈ 17 mm de piel); la 10.ª queda a 12 cm, entre la medioclavicular y la axilar anterior [SUPUESTO]',
  },
  marginTip8XMm: {
    value: 60,
    unit: 'mm',
    range: [45, 75],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Punta del 8.º cartílago, donde se une al 7.º (reborde costal; Gray, «The Costal Cartilages»): x del hueso. La del 9.º ' +
      'y la del 10.º, cada una un paso más afuera',
  },
  marginTipStepMm: {
    value: 16,
    unit: 'mm',
    range: [8, 24],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Paso entre las puntas de los cartílagos 8.º, 9.º y 10.º a lo largo del reborde costal',
  },
  tip11BeforeMidaxillaryMm: {
    value: 20,
    unit: 'mm',
    range: [0, 40],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'La punta libre de la 11.ª, 20 mm de piel por delante de la axilar media: con la 12.ª forma el costado de la abertura inferior (Gray, «The Thorax»)',
  },
  tip12BeforePosteriorAxillaryMm: {
    value: 10,
    unit: 'mm',
    range: [-20, 30],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'La punta libre de la 12.ª, junto a la axilar posterior: es mucho más corta que la 11.ª (Gray, «The Ribs»)',
  },
  floatingCapMm: {
    value: 12,
    unit: 'mm',
    range: [5, 25],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Cartílago de las puntas de la 11.ª y la 12.ª («pointed extremities», «The Costal Cartilages»), en arco de piel',
  },
  femaleIcsNarrowingMm: {
    value: 1.5,
    unit: 'mm',
    range: [1, 2],
    evidence: 'documentado',
    sources: ['kimys-espaciosic-2014'],
    note:
      'Mujer: espacios intercostales 1–2 mm más estrechos (Kim y cols., anatomy.md §2.6); se restan en las estaciones de medida ' +
      '(la variante de la decisión 17). La sección costal 20–35 % menor y la caja más pequeña no se modelan',
  },
  cartilageCalcifiedFraction: {
    value: 0,
    unit: 'fracción del volumen',
    range: [0, 0.25],
    evidence: 'estimado',
    sources: ['vandam-cartilago-2026'],
    note:
      'Fracción calcificada del cartílago, en patrón periférico (una cáscara de hueso). El avatar la deja en 0: el cartílago ' +
      'que transmite el haz (meta A-T17); a los 35 años el 79 % tiene calcificación de 0–25 % del volumen (van Dam, Tabla 1). ' +
      'Se activa con la opción de la escena',
  },
});

/**
 * La clavícula (lus-sim, cobertura torácica: el vértice está tras su tercio medial y la fosa supraclavicular, sobre ella): un hueso
 * subcutáneo bajo la piel de delante, de la escotadura clavicular del manubrio hacia fuera a lo largo de la piel del tronco, con
 * su sombra acústica. Va en la clasificación de la parrilla (`ribScan`) con el índice `CLAVICLE_INDEX`.
 */
export const CLAVICLE = defineParameters('anatomy.clavicle', {
  medialEndXMm: {
    value: 20,
    unit: 'mm',
    range: [15, 27],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Distancia a la línea media del extremo esternal, en la escotadura clavicular del manubrio, a los lados de la yugular (Gray, ' +
      'sin cifra) [SUPUESTO: dentro del semiancho del manubrio de la parrilla, 27 mm]',
  },
  lengthMm: {
    value: 156,
    unit: 'mm',
    range: [147, 165],
    evidence: 'documentado',
    sources: ['yang-clavicula-2017'],
    note: 'Largo del varón, 15,6 ± 0,9 cm (Yang, TAC de 50 varones de 34,8 años, tabla 2); en el modelo, a lo largo de la piel',
  },
  lengthFemaleMm: {
    value: 143,
    unit: 'mm',
    range: [130, 156],
    evidence: 'documentado',
    sources: ['yang-clavicula-2017'],
    note: 'Largo de la mujer, 14,3 ± 1,3 cm (Yang, TAC de 50 mujeres, tabla 2)',
  },
  radiusMm: {
    value: 7,
    unit: 'mm',
    range: [6.5, 7.5],
    evidence: 'documentado',
    sources: ['yang-clavicula-2017'],
    note:
      'Semidiámetro del tercio medio, 1,4 ± 0,1 cm en varones (Yang, tabla 2); el modelo lleva la misma sección en toda la clavícula ' +
      '(los extremos miden 2,5 y 2,6 cm: `clavicle-section-uniform`)',
  },
  medialTopAboveNotchMm: {
    value: 10,
    unit: 'mm',
    range: [5, 15],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918', 'yang-clavicula-2017'],
    note:
      'Borde superior del tercio medial sobre la escotadura yugular: se articula a sus lados (Gray), con el extremo esternal de 2,5 ' +
      '± 0,3 cm y el tercio medio de 1,4 (Yang): el tercio medial mide ≈ 2 cm, y su borde queda ≈ 10 mm sobre la escotadura. Con la ' +
      'sección uniforme, el eje va 3 mm sobre la escotadura',
  },
  lateralRiseMm: {
    value: 15,
    unit: 'mm',
    range: [0, 30],
    evidence: 'estimado',
    sources: [],
    note: 'Lo que sube el extremo acromial sobre el esternal [SUPUESTO: NO ENCONTRADO en la base ni en la búsqueda del 01-10-2026]',
  },
  coverMm: {
    value: 3,
    unit: 'mm',
    range: [2, 6],
    evidence: 'estimado',
    sources: ['laurent-piel-2007'],
    note: 'Piel y tejido subcutáneo sobre la clavícula (subcutánea, Gray): piel ≈ 1,8–2 mm (Laurent) y ≈ 1 de tejido [SUPUESTO]',
  },
});

/** Índice de la clavícula en la clasificación de la parrilla (`ribScan`, `ribSd`, `faceRib`): tras el esternón (`MAX_RIBS`). */
export const CLAVICLE_INDEX = MAX_RIBS + 1;

/**
 * La escápula (lus-sim, decisión 29: la cara posterior se explora con el paciente sentado y los brazos a los lados): una lámina
 * de hueso bajo la piel de la espalda, entre el trapecio y la parrilla, con su sombra acústica. Su contorno es el triángulo del
 * ángulo superior, el inferior y la glena, en la distancia a la línea media posterior a lo largo de la piel (s) y la altura (z);
 * su cara posterior, a la profundidad de la piel, la grasa y el trapecio medio de la espalda, por la normal. Va en la
 * clasificación de la parrilla (`ribScan`) con el índice `SCAPULA_INDEX`. La misma en supino (la sonda no llega).
 */
export const SCAPULA = defineParameters('anatomy.scapula', {
  inferiorAngleSpinous: {
    value: 8,
    unit: 'apófisis espinosa',
    range: [7, 9],
    evidence: 'documentado',
    sources: ['cooperstein-escapula-2015', 'gray-anatomia-1918'],
    note:
      'El ángulo inferior, de pie y con los brazos a los lados, a la altura de la apófisis espinosa de T8 (nivel medio 8,01 en el ' +
      'metaanálisis de 5 estudios, 343 personas; el 85,4 % a un nivel o menos de T8; Cooperstein y cols. 2015, texto completo). ' +
      'Gray (1918) dice T7 [DISCREPANCIA]. Sentado, NO ENCONTRADO como comparación directa: se toma el mismo (meta A-T18). La ' +
      'punta de la apófisis de T8 está a la altura del cuerpo de T9 (la regla de los tres, como el borde posterior del pulmón en ' +
      '`anatomy.lungBorder`)',
  },
  spineRootSpinous: {
    value: 3,
    unit: 'apófisis espinosa',
    range: [2, 4],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'La raíz de la espina de la escápula, a la altura de la punta de la apófisis de T3 (Gray 1918, «Surface Markings of the ' +
      'Back»); en T1–T3 la punta queda a la altura de su cuerpo (la regla de los tres)',
  },
  lengthMm: {
    value: 153,
    unit: 'mm',
    range: [136, 170],
    evidence: 'documentado',
    sources: ['garzon-escapula-2024', 'vonschroeder-escapula-2001'],
    note:
      'Del ángulo superior al inferior en el varón: 152,85 ± 16,77 mm en 72 escápulas secas (Garzón-Alfaro y cols. 2024, tabla 3); ' +
      '155 ± 16 en 15 pares de cadáver (von Schroeder y cols. 2001, resumen). El rango, ± 1 DE',
  },
  lengthFemaleMm: {
    value: 137,
    unit: 'mm',
    range: [127, 146],
    evidence: 'documentado',
    sources: ['garzon-escapula-2024'],
    note: 'Del ángulo superior al inferior en la mujer: 136,72 ± 9,64 mm (Garzón-Alfaro y cols. 2024, tabla 3)',
  },
  widthMm: {
    value: 103.5,
    unit: 'mm',
    range: [99, 108],
    evidence: 'documentado',
    sources: ['garzon-escapula-2024'],
    note:
      'Del borde vertebral, en la espina, a la glena en el varón: 103,53 ± 4,57 mm (Garzón-Alfaro y cols. 2024, tabla 3). En el ' +
      'modelo, a lo largo de la piel y con la glena a la altura de la raíz de la espina [SUPUESTO: NO ENCONTRADO]; el tronco no ' +
      'tiene hombro, así que la lámina se recorta por fuera hasta caber sobre las costillas (`fitScapula`, `scapula-plate`)',
  },
  widthFemaleMm: {
    value: 92,
    unit: 'mm',
    range: [86, 98],
    evidence: 'documentado',
    sources: ['garzon-escapula-2024'],
    note: 'Del borde vertebral, en la espina, a la glena en la mujer: 92,03 ± 6,16 mm (Garzón-Alfaro y cols. 2024, tabla 3)',
  },
  superiorAngleMedialMm: {
    value: 90,
    unit: 'mm',
    range: [79, 101],
    evidence: 'documentado',
    sources: ['pontin-escapula-2013', 'sobush-escapula-1996', 'moghadam-escapula-2012'],
    note:
      'Del ángulo superior a la línea de las apófisis espinosas, de pie con los brazos a los lados: 9,1 ± 1,1 cm a la derecha y 8,5 ' +
      '± 1,2 a la izquierda (examinador 1; 9,2–9,3 y 8,9–9,0 en las otras dos tandas) en 30 sanos (Pontin y cols. 2013, tabla 5); ' +
      'el borde medial, a 3,5–4,8° de la vertical; las raíces de las espinas, a 17,19 ± 1,85 cm entre sí (8,6 de la línea media, ' +
      'Sobush y cols. 1996, 15 mujeres, resumen). El rango, ± 1 DE. [DISCREPANCIA]: de la raíz de la espina a la apófisis de ' +
      'T3–T4, 6,64 ± 1,08 cm (derecha) y 6,38 ± 1,10 (izquierda) en 30 mujeres (Moghadam y Salimee 2012, tabla 3, con una cuerda ' +
      'sobre la piel): se siguen Pontin y Sobush, que coinciden. El ángulo inferior va en la línea escapular ' +
      '(`anatomy.scapularLine`, que pasa por él)',
  },
  bodyThicknessMm: {
    value: 3,
    unit: 'mm',
    range: [2, 5],
    evidence: 'documentado',
    sources: ['burke-escapula-2006', 'vonschroeder-escapula-2001'],
    note:
      'Grosor de la lámina: 3,0 mm en la parte central del cuerpo (Burke y cols. 2006, 18 escápulas de cadáver, resumen); el borde ' +
      'medial, 4 ± 1 mm a 1 cm de él (von Schroeder y cols. 2001, resumen). El modelo la lleva uniforme (`scapula-plate`): sin la ' +
      'espina (7–18 mm), el borde lateral (9,7) ni la glena',
  },
  trapeziusMm: {
    value: 7,
    unit: 'mm',
    range: [5, 9],
    evidence: 'documentado',
    sources: ['silkjaer-escapulares-2021'],
    note:
      'Lo que cubre la escápula bajo la piel y la grasa de la espalda: el trapecio medio, 7,1 ± 2,2 mm (lado dominante) y 6,9 ± 2,4 ' +
      '(no dominante) en 41 adultos sanos, junto al borde medial bajo la espina (Silkjær Bak y cols. 2021, tabla 2, ecografía; los ' +
      'dos sexos juntos). El infraespinoso, que engruesa hacia el centro de la fosa, no se lleva: la lámina va a la misma ' +
      'profundidad en toda ella (`scapula-plate`)',
  },
});

/** Índice de la escápula en la clasificación de la parrilla (lus-sim, decisión 29): tras la clavícula. */
export const SCAPULA_INDEX = MAX_RIBS + 2;

/**
 * Lo que la cara posterior de la escápula queda, como poco, por encima de la cresta de las costillas (mm, por la normal). El
 * tronco no tiene hombro y hacia fuera la pared adelgaza (16 mm en la infraescapular, 18 en la axila): la lámina se recorta por
 * fuera hasta que ninguna costilla asoma sobre ella (`fitScapula`). Bajo su cara posterior puede cortar las costillas (no se ve:
 * es su sombra); el subescapular y el serrato entre las dos no están (`scapula-plate`).
 */
export const SCAPULA_RIB_CLEAR_MM = 0.5;

/**
 * La escápula construida (las dos, simétricas): su contorno en (s, z), con s la distancia a la línea media posterior a lo largo de
 * la piel; la cara posterior a `depth` bajo la piel por la normal y el grosor `thickness`.
 */
export interface ScapulaSpec {
  /** El ángulo superior, el inferior y la glena: (s, z) en mm. */
  superior: [number, number];
  inferior: [number, number];
  glenoid: [number, number];
  depth: number;
  thickness: number;
}

/** La clavícula construida (las dos, simétricas): en |u| de la piel, con el eje a `cover + radius` bajo ella por la normal. */
export interface ClavicleSpec {
  /** |u| del extremo esternal y del acromial (mm de piel). */
  u0: number;
  u1: number;
  /** z del eje en el extremo esternal y lo que sube hasta el acromial (mm). */
  z0: number;
  rise: number;
  radius: number;
  /** Profundidad del eje bajo la piel, por la normal (mm). */
  depth: number;
}

/** Una costilla de la parrilla: su número, su lado y dónde empieza y acaba a lo largo de |u|. */
export interface RibSpec {
  /** Número anatómico, 1–12. */
  number: number;
  /** −1 derecha (x < 0), +1 izquierda. */
  side: -1 | 1;
  /** |u| (mm de piel) del extremo medial: el borde del esternón, la unión con el cartílago de arriba o la punta libre. */
  uEnd: number;
  /** |u| de la unión condrocostal: más medial, cartílago. */
  uCc: number;
  /** |u| del extremo posterior, la apófisis transversa. */
  uPost: number;
  /** Semialto craneocaudal (mm). */
  halfWidth: number;
}

/** El esternón: manubrio y cuerpo (hueso) y xifoides (cartílago), en la línea media anterior. */
export interface SternumSpec {
  /** z de la escotadura yugular, del ángulo esternal y de la punta del xifoides (mm; z = 0 en la unión xifoesternal). */
  zTop: number;
  zAngle: number;
  zTip: number;
  /** Semianchos (mm): del manubrio en la escotadura, del cuerpo y del xifoides en su base. */
  halfWidthTop: number;
  halfWidthBody: number;
  halfWidthXiphoid: number;
  /** Grosor anteroposterior (mm); su cara posterior está a `pleuraComplex` de la cara interna de la pared. */
  thickness: number;
}

/** Estaciones de la construcción (|u| en mm de piel), para las pruebas y la documentación. */
export interface RibCageStations {
  sternal: number;
  parasternal: number;
  midclavicular: number;
  anteriorAxillary: number;
  midaxillary: number;
  posteriorAxillary: number;
  posterior: number;
  /** Altura de la línea de Treves: la 9.ª costilla junto a la columna y la 5.ª en la medioclavicular. */
  trevesZ: number;
}

export interface RibCage {
  /** Las 24 costillas: derechas 1–12 y después izquierdas 1–12 (el orden de `uRibs` y de la tabla). */
  ribs: RibSpec[];
  sternum: SternumSpec;
  /** Semigrosor radial de la costilla y del cartílago (mm). */
  halfThickness: number;
  /** Complejo pleura + fascia entre la cara interna de la costilla y la de la pared (mm). */
  pleuraComplex: number;
  /** Fracción del semieje de la sección calcificada en la periferia del cartílago (0: sin calcificación). */
  calcifiedRim: number;
  /** Alturas de las líneas medias: `RIB_TABLE_TEXELS` téxeles RGBA (float32, como en la GPU). */
  table: Float32Array;
  /** La clavícula (lus-sim, cobertura torácica). */
  clavicle: ClavicleSpec;
  /** La escápula (lus-sim, decisión 29). */
  scapula: ScapulaSpec;
  stations: RibCageStations;
}

export interface RibCageOptions {
  /** Fracción calcificada del volumen del cartílago (`RIBCAGE.cartilageCalcifiedFraction`). */
  cartilageCalcifiedFraction?: number;
  /**
   * Cambio (mm) de los anchos de los espacios intercostales en las estaciones de medida (lus-sim, decisión 17): la mujer,
   * −`femaleIcsNarrowingMm`.
   */
  icsDeltaMm?: number;
  /** La clavícula de la mujer (lus-sim, cobertura torácica: `anatomy.clavicle.lengthFemaleMm`) y su escápula (decisión 29). */
  female?: boolean;
  /**
   * Piel y grasa de la espalda sobre la escápula (mm, por la normal; lus-sim, decisión 29): las del hábito, que da la pared
   * torácica. Sin ellas, las del avatar (`anatomy.chestWall`: 2,5 y 4).
   */
  scapulaCoverMm?: number;
}

// --- Geometría de la cáscara costal (TS; solo construcción y pruebas) ---------------------------------------------

/**
 * Grosor total de la pared (mm, métrica radial) bajo la piel del ángulo elíptico τ, a la altura z = 0 de la construcción
 * (lus-sim, decisión 17: la pared torácica por región; en z = 0 es la torácica baja en todo el tronco).
 */
function wallAtTau(tau: number, t: Torso): number {
  return wallTotalMm(radialPoint(tau, 0, t), t);
}

/** Punto a la profundidad radial `depth` bajo la piel en el ángulo elíptico τ (0 delante, + hacia +x). */
function radialPoint(tau: number, depth: number, t: Torso): Vec3 {
  const sx = t.a * Math.sin(tau);
  const sy = t.b * Math.cos(tau);
  const k = 1 - depth / Math.hypot(sx, sy);
  return [sx * k, sy * k, 0];
}

/**
 * τ ∈ [lo, hi] donde la cáscara a la profundidad `depth(τ)` tiene |x| = x (bisección; |x| es monótona en cada cuadrante
 * mientras la pared cambia despacio con τ).
 */
function tauOfX(x: number, depth: (tau: number) => number, t: Torso, posterior: boolean): number {
  let lo = posterior ? Math.PI / 2 : 0;
  let hi = posterior ? Math.PI : Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const grows = Math.abs(radialPoint(mid, depth(mid), t)[0]) < x;
    if (grows === !posterior) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** |u| de un ángulo elíptico τ ≥ 0 (la serie de `wallArc`). */
function arcOfTau(tau: number, t: Torso): number {
  return Math.abs(wallArc(radialPoint(tau, 0, t), t));
}

/** τ ≥ 0 de un |u| (bisección de `arcOfTau`, monótona). */
function tauOfArc(u: number, t: Torso): number {
  let lo = 0;
  let hi = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (arcOfTau(mid, t) < u) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Punto de la cáscara a `depth` bajo la línea de piel φ, a lo largo de la normal de la piel (lo que corta la sonda
 * apoyada en esa línea, marcador craneal): las medidas ecográficas de la base son las de una sonda en la línea.
 */
export function probeHitPoint(phi: number, depth: number, t: Torso, z = 0): Vec3 {
  const s = torsoSkinPoint(phi, z, t);
  const n = torsoNormal(s, t);
  let lo = 0;
  let hi = 4 * depth + 20;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const p: Vec3 = [s[0] - n[0] * mid, s[1] - n[1] * mid, z];
    if (-torsoDepth(p, t) < depth) lo = mid;
    else hi = mid;
  }
  const r = 0.5 * (lo + hi);
  return [s[0] - n[0] * r, s[1] - n[1] * r, z];
}

/**
 * Punto de la línea media de las costillas bajo la línea de piel φ, por la normal de la piel: a `offset` mm de la pleura por
 * la normal (la métrica de la parrilla, `ribCenterDepth`), en dos pasadas (la norma del gradiente cambia poco en 1 mm).
 */
function ribLineHit(phi: number, t: Torso, offset: number, z = 0): Vec3 {
  let hit = probeHitPoint(phi, wallTotalMm(torsoSkinPoint(phi, z, t), t) - offset, t, z);
  for (let i = 0; i < 3; i++) hit = probeHitPoint(phi, wallTotalMm(hit, t) - ribMetric(hit, t) * offset, t, z);
  return hit;
}

/**
 * |u| (mm de piel) donde la sonda apoyada en la línea φ, marcador craneal, corta la línea media de las costillas a la
 * altura z (lus-sim, decisión 17: la pared cambia con la altura, y con ella la profundidad de la parrilla).
 */
export function ribLineArc(phi: number, t: Torso, cage: RibCage, z = 0): number {
  return Math.abs(wallArc(ribLineHit(phi, t, cage.pleuraComplex + cage.halfThickness, z), t));
}

/** Punto de esa línea media bajo la línea φ, a la altura z. */
export function ribLinePoint(phi: number, t: Torso, cage: RibCage, z = 0): Vec3 {
  return ribLineHit(phi, t, cage.pleuraComplex + cage.halfThickness, z);
}

/** Interpolante cúbico monótono (Fritsch–Carlson) por los puntos (x creciente); constante fuera. */
function pchip(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  if (n === 1) return () => ys[0];
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

/** Semiancho del esternón (mm) a la altura z: manubrio que se estrecha, cuerpo constante, xifoides que se afina. */
export function sternumHalfWidth(z: number, cage: RibCage): number {
  const s = cage.sternum;
  if (z >= s.zAngle) return s.halfWidthBody + ((s.halfWidthTop - s.halfWidthBody) * (z - s.zAngle)) / (s.zTop - s.zAngle);
  if (z >= 0) return s.halfWidthBody;
  return s.halfWidthXiphoid * (1 - (2 / 3) * Math.min(1, z / s.zTip));
}

/** La clavícula del tronco `t`, con el eje a la altura que da su borde superior medial sobre la escotadura `notchZ`. */
function buildClavicle(t: Torso, notchZ: number, female: boolean): ClavicleSpec {
  const C = CLAVICLE.params;
  const u0 = Math.abs(wallArc(torsoSkinPoint(Math.acos(C.medialEndXMm.value / t.a), 0, t), t));
  const r = C.radiusMm.value;
  return {
    u0,
    u1: u0 + (female ? C.lengthFemaleMm.value : C.lengthMm.value),
    z0: notchZ + C.medialTopAboveNotchMm.value - r,
    rise: C.lateralRiseMm.value,
    radius: r,
    depth: C.coverMm.value + r,
  };
}

/** z (mm) del cuerpo de la vértebra torácica n (z = 0 en el disco T9–T10, `anatomy.ribcage.thoracicSegmentMm`). */
export function vertebraZ(n: number): number {
  return (9.5 - n) * RIBCAGE.params.thoracicSegmentMm.value;
}

/**
 * z (mm) de la punta de la apófisis espinosa de la vértebra torácica n, por la regla de los tres: en T1–T3 a la altura de su
 * cuerpo, en T4–T6 medio nivel más abajo, en T7–T10 uno (la del cuerpo de debajo), T11 medio y T12 el suyo.
 */
export function spinousTipZ(n: number): number {
  const drop = n <= 3 ? 0 : n <= 6 ? 0.5 : n <= 10 ? 1 : n === 11 ? 0.5 : 0;
  return vertebraZ(n + drop);
}

/**
 * La escápula (decisión 29): el ángulo inferior en la línea escapular a la altura de la apófisis de T8; el superior, a su largo
 * de él, a la distancia de Pontin de la línea media por la piel (el borde medial, casi vertical); la glena a su ancho del borde
 * medial en la raíz de la espina y a su altura, o a `maxGlenoidS` de la línea media por la piel si es menos (`fitScapula`); la
 * cara posterior bajo la piel y la grasa (`cover`) y el trapecio medio. Las distancias de la base se miden sobre la piel, encima del hueso (por su normal); el
 * modelo sitúa la lámina con el arco de la pared (`wallArc`, la dirección radial de la elipse), que detrás se abre hacia fuera
 * con la profundidad: cada vértice va al arco del punto de la mitad de la lámina bajo su piel, por la normal.
 */
export function buildScapula(t: Torso, female: boolean, cover: number, maxGlenoidS = Infinity): ScapulaSpec {
  const S = SCAPULA.params;
  const length = female ? S.lengthFemaleMm.value : S.lengthMm.value;
  const width = female ? S.widthFemaleMm.value : S.widthMm.value;
  const half = 0.5 * wallPerimeter(t);
  const sOf = (phi: number) => half - Math.abs(wallArc(torsoSkinPoint(phi, 0, t), t));
  const zInf = spinousTipZ(S.inferiorAngleSpinous.value);
  const inferior: [number, number] = [sOf(thoraxLinePhi('scapular', t)), zInf];
  const sSup = S.superiorAngleMedialMm.value;
  const superior: [number, number] = [sSup, zInf + Math.sqrt(length * length - (sSup - inferior[0]) ** 2)];
  const zRoot = spinousTipZ(S.spineRootSpinous.value);
  const sRoot = inferior[0] + ((superior[0] - inferior[0]) * (zRoot - zInf)) / (superior[1] - zInf);
  const glenoid: [number, number] = [Math.min(sRoot + width, maxGlenoidS), zRoot];
  const depth = cover + S.trapeziusMm.value;
  const thickness = S.bodyThicknessMm.value;
  // la piel a la distancia s de la línea media posterior (la derecha: de 1,5π hacia π)
  const skinAt = (sk: number): Vec3 => {
    let lo = 1.5 * Math.PI;
    let hi = Math.PI;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (half - Math.abs(wallArc(torsoSkinPoint(mid, 0, t), t)) < sk) lo = mid;
      else hi = mid;
    }
    return torsoSkinPoint(0.5 * (lo + hi), 0, t);
  };
  const atDepth = (v: [number, number]): [number, number] => {
    const p = skinAt(v[0]);
    const n = torsoNormal(p, t);
    const nd = depth + 0.5 * thickness;
    return [half - Math.abs(wallArc([p[0] - n[0] * nd, p[1] - n[1] * nd, 0], t)), v[1]];
  };
  return { superior: atDepth(superior), inferior: atDepth(inferior), glenoid: atDepth(glenoid), depth, thickness };
}

/**
 * La escápula sobre la pared construida (lus-sim, decisión 29): la glena se acerca al borde medial (bisección en su distancia a la
 * línea media por la piel: nueve pasos, ≈ 0,7 mm) hasta que en toda la lámina su cara posterior queda `SCAPULA_RIB_CLEAR_MM` por encima de la
 * cresta de las costillas (la pared menos `crestToPleuraMm`), en una rejilla de ≈ 2 mm de piel por 4 de altura. La lámina sigue
 * siendo el triángulo de los dos ángulos y la glena.
 */
export function fitScapula(cage: RibCage, t: Torso, female: boolean, cover: number): void {
  const crest = RIBCAGE.params.crestToPleuraMm.value;
  const half = 0.5 * wallPerimeter(t);
  const fits = (spec: ScapulaSpec): boolean => {
    const probe = { scapula: spec };
    const zTop = Math.max(spec.superior[1], spec.glenoid[1]);
    for (let phi = Math.PI * 1.5; phi > Math.PI; phi -= 0.009) {
      if (half - Math.abs(wallArc(torsoSkinPoint(phi, 0, t), t)) > spec.glenoid[0] + 10) break;
      for (let z = spec.inferior[1]; z <= zTop; z += 4) {
        const p = torsoSkinPoint(phi, z, t);
        const n = torsoNormal(p, t);
        const nd = spec.depth + 0.5 * spec.thickness;
        if (scapulaSd([p[0] - n[0] * nd, p[1] - n[1] * nd, z], t, probe) >= 0) continue;
        const top: Vec3 = [p[0] - n[0] * spec.depth, p[1] - n[1] * spec.depth, z];
        const g = ribMetric(top, t);
        if (wallTotalMm(top, t) - g * crest + torsoDepth(top, t) < g * SCAPULA_RIB_CLEAR_MM) return false;
      }
    }
    return true;
  };
  const full = buildScapula(t, female, cover);
  if (fits(full)) {
    cage.scapula = full;
    return;
  }
  // la glena en la piel: entre el borde medial en la raíz de la espina (la lámina, una línea) y su sitio
  const S = SCAPULA.params;
  const sRoot = scapulaRootSkinS(t, female);
  let lo = sRoot + 1;
  let hi = sRoot + (female ? S.widthFemaleMm.value : S.widthMm.value);
  for (let i = 0; i < 9; i++) {
    const mid = 0.5 * (lo + hi);
    if (fits(buildScapula(t, female, cover, mid))) lo = mid;
    else hi = mid;
  }
  const fitted = buildScapula(t, female, cover, lo);
  if (!fits(fitted)) throw new Error(`fitScapula: ni con la glena a ${lo.toFixed(1)} mm de la línea media cabe la escápula`);
  cage.scapula = fitted;
}

/** La distancia por la piel a la línea media posterior del borde medial de la escápula en la raíz de la espina (decisión 29). */
function scapulaRootSkinS(t: Torso, female: boolean): number {
  const S = SCAPULA.params;
  const length = female ? S.lengthFemaleMm.value : S.lengthMm.value;
  const half = 0.5 * wallPerimeter(t);
  const sInf = half - Math.abs(wallArc(torsoSkinPoint(thoraxLinePhi('scapular', t), 0, t), t));
  const zInf = spinousTipZ(S.inferiorAngleSpinous.value);
  const sSup = S.superiorAngleMedialMm.value;
  const zSup = zInf + Math.sqrt(length * length - (sSup - sInf) ** 2);
  return sInf + ((sSup - sInf) * (spinousTipZ(S.spineRootSpinous.value) - zInf)) / (zSup - zInf);
}

/** Distancia con signo (negativa dentro) de p al triángulo a, b, c (gemelo GLSL con el mismo nombre). */
export function sdTriangle2(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  const e0 = [b[0] - a[0], b[1] - a[1]];
  const e1 = [c[0] - b[0], c[1] - b[1]];
  const e2 = [a[0] - c[0], a[1] - c[1]];
  const v0 = [p[0] - a[0], p[1] - a[1]];
  const v1 = [p[0] - b[0], p[1] - b[1]];
  const v2 = [p[0] - c[0], p[1] - c[1]];
  const cl = (x: number) => Math.min(1, Math.max(0, x));
  const h0 = cl((v0[0] * e0[0] + v0[1] * e0[1]) / (e0[0] * e0[0] + e0[1] * e0[1]));
  const h1 = cl((v1[0] * e1[0] + v1[1] * e1[1]) / (e1[0] * e1[0] + e1[1] * e1[1]));
  const h2 = cl((v2[0] * e2[0] + v2[1] * e2[1]) / (e2[0] * e2[0] + e2[1] * e2[1]));
  const q0 = [v0[0] - e0[0] * h0, v0[1] - e0[1] * h0];
  const q1 = [v1[0] - e1[0] * h1, v1[1] - e1[1] * h1];
  const q2 = [v2[0] - e2[0] * h2, v2[1] - e2[1] * h2];
  const sg = Math.sign(e0[0] * e2[1] - e0[1] * e2[0]);
  const dd = Math.min(q0[0] * q0[0] + q0[1] * q0[1], q1[0] * q1[0] + q1[1] * q1[1], q2[0] * q2[0] + q2[1] * q2[1]);
  const ss = Math.min(sg * (v0[0] * e0[1] - v0[1] * e0[0]), sg * (v1[0] * e1[1] - v1[1] * e1[0]), sg * (v2[0] * e2[1] - v2[1] * e2[0]));
  return -Math.sqrt(dd) * Math.sign(ss);
}

/** Margen (mm) fuera del contorno de la escápula en el que se mide su distancia; más lejos, 1e3. */
export const SCAPULA_SEARCH_MM = 10;

/**
 * Distancia (mm; la de la clasificación: por la normal de la piel y, en el contorno, a lo largo de la piel a la profundidad de la
 * mitad de la lámina) de un punto a la escápula de su lado; 1e3 a más de `SCAPULA_SEARCH_MM` de su contorno o de su grosor. A
 * menos de 10 mm, como mucho 1,04 veces la distancia euclídea (medido frente a un muestreo denso de la lámina). Gemelo GLSL con
 * el mismo nombre.
 */
export function scapulaSd(m: Vec3, t: Torso, cage: Pick<RibCage, 'scapula'>): number {
  const c = cage.scapula;
  const M = SCAPULA_SEARCH_MM;
  if (m[1] >= 0 || m[2] < c.inferior[1] - M || m[2] > Math.max(c.superior[1], c.glenoid[1]) + M) return 1e3;
  const nd = -torsoDepth(m, t) / ribMetric(m, t);
  const mid = c.depth + 0.5 * c.thickness;
  const dn = Math.abs(nd - mid) - 0.5 * c.thickness;
  if (dn > M) return 1e3;
  // el contorno se mide a la profundidad de la mitad de la lámina (la de sus vértices, `buildScapula`): el punto se lleva allí
  // por la normal (detrás, el arco de la pared se abre con la profundidad) y a lo largo de la piel la distancia se acorta con
  // ella (1 − nd/R, con R el radio de la elipse)
  const nrm = torsoNormal(m, t);
  const q: Vec3 = [m[0] + nrm[0] * (nd - mid), m[1] + nrm[1] * (nd - mid), m[2]];
  const s = 0.5 * wallPerimeter(t) - Math.abs(wallArc(q, t));
  if (s < Math.min(c.superior[0], c.inferior[0]) - M || s > c.glenoid[0] + M) return 1e3;
  const tau = Math.atan2(q[0] / t.a, q[1] / t.b);
  const speed = Math.hypot(t.a * Math.cos(tau), t.b * Math.sin(tau));
  const k = Math.max(0.5, 1 - (mid * t.a * t.b) / (speed * speed * speed));
  const dl = k * sdTriangle2([s, m[2]], c.superior, c.inferior, c.glenoid);
  return Math.hypot(Math.max(dl, 0), Math.max(dn, 0)) + Math.min(Math.max(dl, dn), 0);
}

/** z del borde superior de la clavícula sobre su tercio medial (el que mira el vértice, Gray). */
export function clavicleMedialTopZ(cage: Pick<RibCage, 'clavicle'>): number {
  const c = cage.clavicle;
  return c.z0 + c.radius;
}

/**
 * Distancia (mm; la de la clasificación: por la normal de la piel, en z y a lo largo de la piel) de un punto a la clavícula de
 * su lado; 1e3 lejos de ella. Gemelo GLSL con el mismo nombre.
 */
export function clavicleSd(m: Vec3, t: Torso, cage: Pick<RibCage, 'clavicle'>): number {
  const c = cage.clavicle;
  if (m[1] <= 0 || m[2] < c.z0 - c.radius - 4 || m[2] > c.z0 + c.rise + c.radius + 4) return 1e3;
  const au = Math.abs(wallArc(m, t));
  if (au > c.u1 + c.radius + 4) return 1e3;
  const s = Math.min(1, Math.max(0, (au - c.u0) / (c.u1 - c.u0)));
  const nd = -torsoDepth(m, t) / ribMetric(m, t);
  const du = au < c.u0 ? c.u0 - au : au > c.u1 ? au - c.u1 : 0;
  return Math.hypot(nd - c.depth, m[2] - (c.z0 + c.rise * s), du) - c.radius;
}

/**
 * Construye la parrilla del tronco `t` (el hábito fija la cara interna de la pared, que la parrilla forra) con la
 * columna `spine` (los extremos posteriores, en sus apófisis transversas).
 */
export function buildRibCage(t: Torso, spine: Spine, opts: RibCageOptions = {}): RibCage {
  const P = RIBCAGE.params;
  const hw = 0.5 * P.ribHeightMm.value;
  const ht = 0.5 * (P.crestToPleuraMm.value - P.pleuraComplexMm.value);
  const cd = (tau: number) => wallAtTau(tau, t) - P.pleuraComplexMm.value - ht;
  const seg = P.thoracicSegmentMm.value;
  const rib = 2 * hw;

  // estaciones (|u| de la cáscara costal); las de las líneas, por la normal de la piel, donde la sonda corta la línea media
  // de las costillas (la misma cuenta que `ribLineArc`, antes de tener la parrilla)
  const lineU = (phi: number) => Math.abs(wallArc(ribLineHit(phi, t, P.pleuraComplexMm.value + ht), t));
  const xU = (x: number, posterior = false) => arcOfTau(tauOfX(x, cd, t, posterior), t);
  const lineY = (u: number) => {
    const tau = tauOfArc(u, t);
    return radialPoint(tau, cd(tau), t)[1];
  };
  // |u| bajo la línea de piel a x mm de la línea media (anatomía de superficie, como la medioclavicular)
  const skinU = (x: number) => lineU(Math.PI - Math.acos(x / t.a));
  // x de la línea de piel de la unión condrocostal n-ésima (1–8)
  const ccX = (n: number) => P.costochondral4to5XMm.value + (n - 4.5) * P.costochondralStepMm.value;
  const bodyHw = P.sternumBodyHalfWidthMm.value;
  const st: RibCageStations = {
    sternal: xU(bodyHw),
    parasternal: xU(bodyHw + P.internalMammaryOffsetMm.value),
    midclavicular: lineU(thoraxLinePhi('midclavicular', t)),
    anteriorAxillary: lineU(thoraxLinePhi('anteriorAxillary', t)),
    midaxillary: lineU(thoraxLinePhi('midaxillary', t)),
    posteriorAxillary: lineU(thoraxLinePhi('posteriorAxillary', t)),
    posterior: xU(spine.archHalfWidth + 6, true),
    trevesZ: 0.5 * seg,
  };
  if (st.posterior > (RIB_TABLE_COLS - 2) * RIB_TABLE_DU_MM)
    throw new Error(`parrilla: |u| posterior ${st.posterior.toFixed(1)} fuera de la tabla`);

  // extremos posteriores: la costilla n en la mitad del cuerpo de T(n); z = 0 en el disco T9–T10
  const zPost = (n: number) => (9.5 - n) * seg;

  // perfiles de los anchos de los espacios intercostales W_k(|u|), k = 1..11 (entre la costilla k y la k + 1)
  const tip = (n: number) => xU(P.marginTip8XMm.value + (n - 8) * P.marginTipStepMm.value);
  // lus-sim (decisión 17): la variante de mujer estrecha los espacios de las estaciones (no los de junto a la columna, que
  // da la vértebra, ni las puntas del reborde, que se cierran)
  const dI = opts.icsDeltaMm ?? 0;
  const psW = [
    0,
    0,
    P.parasternalIcs2Mm.value + dI,
    P.parasternalIcs3Mm.value + dI,
    P.parasternalIcs4Mm.value + dI,
    P.parasternalIcs5Mm.value + dI,
    P.parasternalIcs6Mm.value + dI,
  ];
  const mclW = (k: number) =>
    dI +
    (k === 1
      ? P.midclavicularIcs1Mm.value
      : k === 2
        ? P.midclavicularIcs2Mm.value
        : k <= 4
          ? P.midclavicularIcs3to4Mm.value
          : k === 5
            ? P.midclavicularIcs5Mm.value
            : k <= 7
              ? P.midclavicularIcs6to7Mm.value
              : P.midclavicularIcs8Mm.value);
  const lamW = (k: number) =>
    dI + (k <= 4 ? P.midaxillaryIcs1to4Mm.value : k <= 6 ? P.midaxillaryIcs5to6Mm.value : P.lateralLowIcsMm.value);
  const lapW = (k: number) => dI + (k <= 6 ? P.posteriorAxillaryIcs1to6Mm.value : P.posteriorAxillaryIcs7to11Mm.value);
  const postW = seg - rib;
  // la 5.ª costilla en la paraesternal: la 7.ª en la unión xifoesternal (z = 0) más dos costillas y los espacios 5.º y 6.º
  const z5ps = 2 * rib + psW[5] + psW[6];
  // el 1.er espacio paraesternal: del 1.er cartílago (bajo la escotadura) a la 2.ª costilla
  const z2ps = z5ps + 3 * rib + psW[2] + psW[3] + psW[4];
  psW[1] = P.jugularNotchZMm.value - P.firstCartilageBelowNotchMm.value - z2ps - rib;
  const W: ((u: number) => number)[] = [];
  for (let k = 1; k <= 11; k++) {
    const pts: Array<[number, number]> = [];
    if (k <= 6) pts.push([st.parasternal, psW[k]]);
    if (k === 7 || k === 8) pts.push([tip(k + 1), 0]);
    if (k <= 8) pts.push([st.midclavicular, mclW(k)]);
    if (k === 9) pts.push([tip(10), 0]);
    if (k >= 7 && k <= 9) pts.push([st.anteriorAxillary, P.lateralLowIcsMm.value + dI]);
    if (k <= 10) pts.push([st.midaxillary, lamW(k)]);
    pts.push([st.posteriorAxillary, lapW(k)], [st.posterior, postW]);
    pts.sort((a, b) => a[0] - b[0]);
    W.push(
      pchip(
        pts.map((p) => p[0]),
        pts.map((p) => p[1]),
      ),
    );
  }

  // la 5.ª costilla: plana (lineal en y) de la columna a la medioclavicular; hacia el esternón, un Hermite que sube a su
  // altura paraesternal (el cartílago asciende al esternón) con la pendiente del plano en la medioclavicular
  const yP = lineY(st.posterior);
  const yM = lineY(st.midclavicular);
  const z5P = zPost(5);
  const planar = (u: number) => z5P + ((st.trevesZ - z5P) * (yP - lineY(u))) / (yP - yM);
  const slopeM = (planar(st.midclavicular + 0.5) - planar(st.midclavicular - 0.5)) / 1;
  const z5 = (u: number): number => {
    if (u >= st.midclavicular) return planar(u);
    if (u <= st.parasternal) return z5ps;
    const L = st.midclavicular - st.parasternal;
    const s = (u - st.parasternal) / L;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * z5ps + (-2 * s3 + 3 * s2) * st.trevesZ + (s3 - s2) * L * slopeM;
  };
  const zRib = (n: number, u: number): number => {
    let z = z5(u);
    if (n < 5) for (let k = n; k <= 4; k++) z += rib + W[k - 1](u);
    else for (let k = 5; k < n; k++) z -= rib + W[k - 1](u);
    return z;
  };

  // extremos y uniones condrocostales
  const sternum: SternumSpec = {
    zTop: P.jugularNotchZMm.value,
    zAngle: P.sternalAngleZMm.value,
    zTip: -P.xiphoidLengthMm.value,
    halfWidthTop: P.manubriumHalfWidthMm.value,
    halfWidthBody: bodyHw,
    halfWidthXiphoid: P.xiphoidHalfWidthMm.value,
    thickness: P.sternumThicknessMm.value,
  };
  const calcified = opts.cartilageCalcifiedFraction ?? P.cartilageCalcifiedFraction.value;
  const cage: RibCage = {
    ribs: [],
    sternum,
    halfThickness: ht,
    pleuraComplex: P.pleuraComplexMm.value,
    // la cáscara de un volumen fraccional V de la elipse: 1 − √(1 − V) de su semieje
    calcifiedRim: 1 - Math.sqrt(1 - calcified),
    table: new Float32Array(RIB_TABLE_TEXELS * 4),
    stations: st,
    clavicle: buildClavicle(t, P.jugularNotchZMm.value, opts.female ?? false),
    scapula: buildScapula(t, opts.female ?? false, opts.scapulaCoverMm ?? 6.5),
  };
  const specs: Omit<RibSpec, 'side'>[] = [];
  for (let n = 1; n <= RIBS_PER_SIDE; n++) {
    let uEnd: number;
    let uCc: number;
    if (n <= 7) {
      uEnd = xU(sternumHalfWidth(zRib(n, st.sternal), cage));
      uCc = skinU(ccX(n));
    } else if (n <= 10) {
      uEnd = tip(n);
      uCc = skinU(ccX(8) + (n - 8) * P.costochondralLowStepMm.value);
    } else {
      uEnd = n === 11 ? st.midaxillary - P.tip11BeforeMidaxillaryMm.value : st.posteriorAxillary - P.tip12BeforePosteriorAxillaryMm.value;
      uCc = uEnd + P.floatingCapMm.value;
    }
    specs.push({ number: n, uEnd, uCc, uPost: st.posterior, halfWidth: hw });
  }
  for (const side of [-1, 1] as const) for (const s of specs) cage.ribs.push({ ...s, side });

  // la tabla: por lado y columna, las alturas de las 12 costillas. La columna que cae justo fuera de su extensión lleva la
  // extrapolación lineal desde el extremo (así la interpolación da la altura construida en el extremo mismo: la punta de
  // un cartílago del reborde toca el de arriba); las demás de fuera, la del extremo
  for (let s = 0; s < 2; s++)
    for (let j = 0; j < RIB_TABLE_COLS; j++) {
      const u = j * RIB_TABLE_DU_MM;
      specs.forEach((r, i) => {
        let zu: number;
        if (u >= r.uEnd && u <= r.uPost) zu = zRib(r.number, u);
        else if (u < r.uEnd && u + RIB_TABLE_DU_MM > r.uEnd) {
          const e = zRib(r.number, r.uEnd);
          const n = zRib(r.number, u + RIB_TABLE_DU_MM);
          zu = e - ((n - e) * (r.uEnd - u)) / (u + RIB_TABLE_DU_MM - r.uEnd);
        } else if (u > r.uPost && u - RIB_TABLE_DU_MM < r.uPost) {
          const e = zRib(r.number, r.uPost);
          const p = zRib(r.number, u - RIB_TABLE_DU_MM);
          zu = e + ((e - p) * (u - r.uPost)) / (r.uPost - u + RIB_TABLE_DU_MM);
        } else zu = zRib(r.number, Math.min(r.uPost, Math.max(r.uEnd, u)));
        cage.table[s * RIB_TABLE_COLS * 12 + j * 12 + i] = zu;
      });
    }
  return cage;
}

/**
 * Los extremos posteriores de las costillas sobre la pared construida (lus-sim, decisión 29): la parrilla se construye con la
 * pared baja en todo el tronco (las alturas de la pared salen de ella, `setChestWallCage`), y donde la pared alta de la espalda
 * es más gruesa la costilla queda más honda y su extremo, más cerca de la línea media. Con la pared ya construida, cada extremo
 * vuelve a quedar a `x` mm de la línea media (la punta de la transversa más el margen) a la altura de la costilla.
 */
export function setRibPosteriorEnds(cage: RibCage, t: Torso, x: number): void {
  cage.ribs.forEach((r, k) => {
    const z = ribTableZ(cage, k, r.uPost);
    const depth = (tau: number) => {
      const p = radialPoint(tau, 0, t);
      const q: Vec3 = [p[0], p[1], z];
      return wallTotalMm(q, t) - ribMetric(q, t) * (cage.pleuraComplex + cage.halfThickness);
    };
    r.uPost = arcOfTau(tauOfX(x, depth, t, true), t);
  });
}

// --- Gemelos TS de la GLSL ------------------------------------------------------------------------------------------

/**
 * Norma del gradiente de la profundidad radial (`torsoDepth`, la métrica de la pared): ≥ 1 salvo en los polos de la elipse.
 * La distancia por la normal a la cara interna de la pared es (pared − d)/|∇|, así que la parrilla, medida en ella, queda
 * a `crestToPleuraMm` de la pleura por la normal de la piel en todo el tronco (con la métrica radial pura, en la
 * medioclavicular la sonda medía 3,9 mm).
 */
export function ribMetric(m: Vec3, t: Torso): number {
  const g = torsoDepthGradient(m, t);
  return Math.hypot(g[0], g[1]);
}

/**
 * Distancia por la normal (mm) de la muestra a la profundidad radial d a la cara interna de la pared (la pleura parietal);
 * `wall`, el grosor de la pared en la muestra (`wallTotalMm`; lus-sim, decisión 17: por región).
 */
export function pleuraNormalDepth(m: Vec3, d: number, t: Torso, wall = wallTotalMm(m, t)): number {
  return (wall - d) / ribMetric(m, t);
}

/** Profundidad radial (mm bajo la piel) de la línea media de las costillas en el punto: su cara interna, a `pleuraComplex` de la pleura. */
export function ribCenterDepth(m: Vec3, t: Torso, cage: RibCage): number {
  return wallTotalMm(m, t) - ribMetric(m, t) * (cage.pleuraComplex + cage.halfThickness);
}

/** mix de GLSL: a·(1 − f) + b·f. */
const mix = (a: number, b: number, f: number) => a * (1 - f) + b * f;

/** Alturas (mm) de las líneas medias del grupo g (costillas 4g + 1 … 4g + 4) del lado s (0 derecha, 1 izquierda) en |u|. */
export function ribZGroup(cage: RibCage, s: number, g: number, au: number): [number, number, number, number] {
  const tcol = Math.min(au / RIB_TABLE_DU_MM, RIB_TABLE_COLS - 1 - 1e-4);
  const k = Math.floor(tcol);
  const f = tcol - k;
  const a = ((s * RIB_TABLE_COLS + k) * 3 + g) * 4;
  const b = a + 12;
  const T = cage.table;
  return [mix(T[a], T[b], f), mix(T[a + 1], T[b + 1], f), mix(T[a + 2], T[b + 2], f), mix(T[a + 3], T[b + 3], f)];
}

/** Altura (mm) de la línea media de la costilla k en |u| = au, de la tabla (la de `ribZGroup`). */
export function ribTableZ(cage: RibCage, k: number, au: number): number {
  const s = Math.floor(k / RIBS_PER_SIDE);
  const j = k - s * RIBS_PER_SIDE;
  return ribZGroup(cage, s, Math.floor(j / 4), au)[j % 4];
}

/**
 * Distancia (mm, no euclídea: la de la sección elíptica, por la normal y en z) de una muestra a `nP` mm de la pleura (por la
 * normal), con |u| = au y altura z, a la costilla `rib` cuya línea media está a la altura zc en ese |u|; 1e3 fuera de su
 * extensión. `cartilage`: la muestra está en el tramo del cartílago.
 */
export function ribSdAt(nP: number, au: number, z: number, zc: number, rib: RibSpec, cage: RibCage): { d: number; cartilage: boolean } {
  const cartilage = au < rib.uCc;
  if (au < rib.uEnd || au > rib.uPost) return { d: 1e3, cartilage };
  const dz = z - zc;
  const ht = cage.halfThickness;
  const qx = Math.abs(nP - cage.pleuraComplex - ht) / ht;
  const qz = Math.abs(dz) / rib.halfWidth;
  return { d: (Math.sqrt(qx * qx + qz * qz) - 1) * Math.min(ht, rib.halfWidth), cartilage };
}

/** Distancia (mm, de caja) al esternón de una muestra a `nP` mm de la pleura; `cartilage` en el xifoides. 1e3 por detrás. */
export function sternumSd(m: Vec3, nP: number, cage: RibCage): { d: number; cartilage: boolean } {
  const s = cage.sternum;
  const cartilage = m[2] < 0;
  if (m[1] <= 0) return { d: 1e3, cartilage };
  const lat = Math.abs(m[0]) - sternumHalfWidth(m[2], cage);
  const rad = Math.abs(nP - cage.pleuraComplex - 0.5 * s.thickness) - 0.5 * s.thickness;
  const ver = Math.max(s.zTip - m[2], m[2] - s.zTop);
  const out = Math.hypot(Math.max(lat, 0), Math.max(rad, 0), Math.max(ver, 0));
  return { d: out + Math.min(Math.max(lat, rad, ver), 0), cartilage };
}

export interface RibScan {
  /** Costilla (0–23) o esternón (`MAX_RIBS`) que contiene la muestra; −1 ninguno. */
  inside: number;
  /** Distancia dentro (negativa) si `inside` ≥ 0. */
  inD: number;
  /** Lo que contiene la muestra es cartílago (sin calcificar). */
  cartilage: boolean;
  /** Distancia al hueso más cercano (costilla ósea o esternón; 1e3 si no hay) y su índice. */
  ribD: number;
  ribI: number;
  /** Distancia a lo más cercano, hueso o cartílago. */
  ribAny: number;
}

/**
 * La parrilla en la clasificación: dentro de la pared (d < grosor de la pared) y a menos de su grosor más el margen de la
 * pared (`WALL.ribSearchMarginMm`) de la pleura, el esternón y las costillas del lado de la muestra (u, su arco con signo),
 * en orden. Gemelo de `ribScan` en GLSL.
 */
export function ribScan(m: Vec3, d: number, u: number, t: Torso, cage: RibCage, wall = wallTotalMm(m, t)): RibScan {
  const out: RibScan = { inside: -1, inD: 1e3, cartilage: false, ribD: 1e3, ribI: 0, ribAny: 1e3 };
  if (d >= wall) return out;
  // la clavícula (lus-sim, cobertura torácica): subcutánea, delante y arriba
  const cd = clavicleSd(m, t, cage);
  if (cd < 0) return { ...out, inside: CLAVICLE_INDEX, inD: cd };
  if (cd < 1e3) {
    out.ribAny = cd;
    out.ribD = cd;
    out.ribI = CLAVICLE_INDEX;
  }
  // la escápula (lus-sim, decisión 29): entre el trapecio y la parrilla, detrás
  const sc = scapulaSd(m, t, cage);
  if (sc < 0) return { ...out, inside: SCAPULA_INDEX, inD: sc };
  if (sc < out.ribD) {
    out.ribAny = Math.min(out.ribAny, sc);
    out.ribD = sc;
    out.ribI = SCAPULA_INDEX;
  }
  const nP = pleuraNormalDepth(m, d, t, wall);
  if (nP < cage.pleuraComplex + cage.sternum.thickness + WALL.ribSearchMarginMm) {
    const sd = sternumSd(m, nP, cage);
    if (sd.d < 0) return { ...out, inside: MAX_RIBS, inD: sd.d, cartilage: sd.cartilage };
    out.ribAny = Math.min(out.ribAny, sd.d);
    if (!sd.cartilage && sd.d < out.ribD) {
      out.ribD = sd.d;
      out.ribI = MAX_RIBS;
    }
  }
  if (nP >= cage.pleuraComplex + 2 * cage.halfThickness + WALL.ribSearchMarginMm) return out;
  const au = Math.abs(u);
  const s = u < 0 ? 0 : 1;
  const zc = [...ribZGroup(cage, s, 0, au), ...ribZGroup(cage, s, 1, au), ...ribZGroup(cage, s, 2, au)];
  for (let j = 0; j < RIBS_PER_SIDE; j++) {
    const i = s * RIBS_PER_SIDE + j;
    const rib = cage.ribs[i];
    const r = ribSdAt(nP, au, m[2], zc[j], rib, cage);
    if (r.d < 0) {
      const rim = r.d > -cage.calcifiedRim * Math.min(cage.halfThickness, rib.halfWidth);
      return { ...out, inside: i, inD: r.d, cartilage: r.cartilage && !rim };
    }
    out.ribAny = Math.min(out.ribAny, r.d);
    if ((!r.cartilage || cage.calcifiedRim > 0) && r.d < out.ribD) {
      out.ribD = r.d;
      out.ribI = i;
    }
  }
  return out;
}

/** Distancia (la de la clasificación) a la costilla k, o al esternón con k = `MAX_RIBS`. */
export function ribSd(m: Vec3, k: number, t: Torso, cage: RibCage): number {
  if (k === CLAVICLE_INDEX) return clavicleSd(m, t, cage);
  if (k === SCAPULA_INDEX) return scapulaSd(m, t, cage);
  const nP = pleuraNormalDepth(m, -torsoDepth(m, t), t);
  if (k === MAX_RIBS) return sternumSd(m, nP, cage).d;
  const u = wallArc(m, t);
  const s = Math.floor(k / RIBS_PER_SIDE);
  if ((u < 0 ? 0 : 1) !== s) return 1e3;
  const au = Math.abs(u);
  return ribSdAt(nP, au, m[2], ribTableZ(cage, k, au), cage.ribs[k], cage).d;
}

/**
 * La costilla (o el esternón, `MAX_RIBS`) cuya cara dibuja el punto: la que lo contiene (el pericondrio de su cartílago) o,
 * en el tejido blando, el hueso más cercano (la cortical que le da `ribScan`, `ribI`). La misma que elige la clasificación
 * de la GPU para la tangente y la curvatura de la cara, y `faceGradient` (TS y GLSL) para su gradiente.
 */
export function faceRib(m: Vec3, t: Torso, cage: RibCage): number {
  const scan = ribScan(m, -torsoDepth(m, t), wallArc(m, t), t, cage);
  return scan.inside >= 0 ? scan.inside : scan.ribI;
}

/**
 * Eje de la costilla k en el punto (la tangente de su línea media, la que usa la coherencia de curvatura de su cara): la
 * derivada respecto del ángulo elíptico de la cáscara y de la altura de la tabla (su pendiente en 1 mm de |u|). El
 * esternón, vertical.
 */
export function ribTangent(p: Vec3, k: number, t: Torso, cage: RibCage): Vec3 {
  if (k === MAX_RIBS || k === SCAPULA_INDEX) return [0, 0, 1];
  if (k === CLAVICLE_INDEX) return clavicleTangent(p, t, cage);
  const tau = Math.atan2(p[0] / t.a, p[1] / t.b);
  const sx = t.a * Math.sin(tau);
  const sy = t.b * Math.cos(tau);
  const sc = 1 - ribCenterDepth(p, t, cage) / Math.hypot(sx, sy);
  const speed = Math.hypot(t.a * Math.cos(tau), t.b * Math.sin(tau));
  const u = wallArc(p, t);
  const au = Math.abs(u);
  const dz = ribTableZ(cage, k, au + 1) - ribTableZ(cage, k, au);
  const v: Vec3 = [sc * t.a * Math.cos(tau), -sc * t.b * Math.sin(tau), Math.sign(u) * dz * speed];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Eje de la clavícula en el punto: a lo largo de la piel (la tangente de la elipse) y subiendo `rise` en su largo. */
export function clavicleTangent(p: Vec3, t: Torso, cage: Pick<RibCage, 'clavicle'>): Vec3 {
  const c = cage.clavicle;
  const tau = Math.atan2(p[0] / t.a, p[1] / t.b);
  const speed = Math.hypot(t.a * Math.cos(tau), t.b * Math.sin(tau));
  const dz = c.rise / (c.u1 - c.u0);
  const v: Vec3 = [t.a * Math.cos(tau), -t.b * Math.sin(tau), Math.sign(p[0]) * dz * speed];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Curvatura (1/mm) de la sección elíptica de la costilla k (semiejes por la normal y craneocaudal) en el punto del contorno
 * en la dirección del punto: a·b/(a²sin²t + b²cos²t)^{3/2}. El esternón, plano (0).
 */
export function ribCurvature(p: Vec3, k: number, t: Torso, cage: RibCage): number {
  if (k === MAX_RIBS || k === SCAPULA_INDEX) return 0;
  if (k === CLAVICLE_INDEX) return 1 / cage.clavicle.radius;
  const a = cage.halfThickness;
  const b = cage.ribs[k].halfWidth;
  const nP = pleuraNormalDepth(p, -torsoDepth(p, t), t);
  const qx = Math.abs(nP - cage.pleuraComplex - a) / a;
  const qz = Math.abs(p[2] - ribTableZ(cage, k, Math.abs(wallArc(p, t)))) / b;
  const l = Math.hypot(qx, qz);
  const c = l > 0 ? qx / l : 1;
  const sn = l > 0 ? qz / l : 0;
  return (a * b) / Math.pow(a * a * sn * sn + b * b * c * c, 1.5);
}

/**
 * Gemelo GLSL. Usa uWall, uRibs[MAX_RIBS] = (uEnd, uCc, uPost, halfWidth), uRibParams = (halfThickness, complejo pleural,
 * cáscara calcificada, 0), uSternum = (zTop, zAngle, zTip, grosor), uSternumW = (semiancho del manubrio, del cuerpo, del
 * xifoides, 0), la tabla en la textura de escena (`sceneTexel`), `torsoDepth` y `wallArc`.
 */
export const RIBCAGE_GLSL = /* glsl */ `
#define RIBS_PER_SIDE ${RIBS_PER_SIDE}
#define RIB_COLS ${RIB_TABLE_COLS}
#define RIB_DU ${RIB_TABLE_DU_MM.toFixed(4)}
#define RIB_BASE ${RIB_TABLE_BASE}
#define RIB_SEARCH_MARGIN_MM ${WALL.ribSearchMarginMm.toFixed(4)}
float ribMetric(vec3 m) {
  float r = length(m.xy);
  if (r < 1e-6) return 1.0;
  float rho = length(m.xy / uTorso.xy);
  return length(m.xy / r * (1.0 - 1.0 / rho) + r / (rho * rho * rho) * m.xy / (uTorso.xy * uTorso.xy));
}
float pleuraNormalDepth(vec3 m, float d, float wall) { return (wall - d) / ribMetric(m); }
// la clavícula (lus-sim, cobertura torácica): uClavicle = (u0, u1, z0, subida), uClavicleR = (radio, profundidad del eje, 0, 0)
#define CLAVICLE_INDEX ${CLAVICLE_INDEX}
float clavicleSd(vec3 m) {
  if (m.y <= 0.0 || m.z < uClavicle.z - uClavicleR.x - 4.0 || m.z > uClavicle.z + uClavicle.w + uClavicleR.x + 4.0) return 1e3;
  float au = abs(wallArc(m));
  if (au > uClavicle.y + uClavicleR.x + 4.0) return 1e3;
  float s = clamp((au - uClavicle.x) / (uClavicle.y - uClavicle.x), 0.0, 1.0);
  float nd = -torsoDepth(m) / ribMetric(m);
  float du = au < uClavicle.x ? uClavicle.x - au : (au > uClavicle.y ? au - uClavicle.y : 0.0);
  return length(vec3(nd - uClavicleR.y, m.z - (uClavicle.z + uClavicle.w * s), du)) - uClavicleR.x;
}
// la escápula (lus-sim, decisión 29): uScapula = (s y z del ángulo superior, del inferior), uScapulaB = (s y z de la glena,
// profundidad de la cara posterior, grosor)
#define SCAPULA_INDEX ${SCAPULA_INDEX}
#define SCAPULA_SEARCH_MM ${SCAPULA_SEARCH_MM.toFixed(4)}
float sdTriangle2(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a; vec2 e1 = c - b; vec2 e2 = a - c;
  vec2 v0 = p - a; vec2 v1 = p - b; vec2 v2 = p - c;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float sg = sign(e0.x * e2.y - e0.y * e2.x);
  float dd = min(min(dot(q0, q0), dot(q1, q1)), dot(q2, q2));
  float ss = min(min(sg * (v0.x * e0.y - v0.y * e0.x), sg * (v1.x * e1.y - v1.y * e1.x)), sg * (v2.x * e2.y - v2.y * e2.x));
  return -sqrt(dd) * sign(ss);
}
float scapulaSd(vec3 m) {
  if (m.y >= 0.0 || m.z < uScapula.w - SCAPULA_SEARCH_MM || m.z > max(uScapula.y, uScapulaB.y) + SCAPULA_SEARCH_MM) return 1e3;
  float nd = -torsoDepth(m) / ribMetric(m);
  float mid = uScapulaB.z + 0.5 * uScapulaB.w;
  float dn = abs(nd - mid) - 0.5 * uScapulaB.w;
  if (dn > SCAPULA_SEARCH_MM) return 1e3;
  vec3 nrm = torsoNormal(m);
  vec3 q = vec3(m.xy + nrm.xy * (nd - mid), m.z);
  float s = 0.5 * wallPerimeter() - abs(wallArc(q));
  if (s < min(uScapula.x, uScapula.z) - SCAPULA_SEARCH_MM || s > uScapulaB.x + SCAPULA_SEARCH_MM) return 1e3;
  float tau = atan(q.x / uTorso.x, q.y / uTorso.y);
  float speed = length(vec2(uTorso.x * cos(tau), uTorso.y * sin(tau)));
  float k = max(0.5, 1.0 - mid * uTorso.x * uTorso.y / (speed * speed * speed));
  float dl = k * sdTriangle2(vec2(s, m.z), uScapula.xy, uScapula.zw, uScapulaB.xy);
  return length(vec2(max(dl, 0.0), max(dn, 0.0))) + min(max(dl, dn), 0.0);
}
vec3 clavicleTangent(vec3 p) {
  float tau = atan(p.x / uTorso.x, p.y / uTorso.y);
  float speed = length(vec2(uTorso.x * cos(tau), uTorso.y * sin(tau)));
  float dz = uClavicle.w / (uClavicle.y - uClavicle.x);
  return normalize(vec3(uTorso.x * cos(tau), -uTorso.y * sin(tau), sign(p.x) * dz * speed));
}
float ribCenterDepth(vec3 m) { return wallTotalMm(m) - ribMetric(m) * (uRibParams.y + uRibParams.x); }
vec4 ribZGroup(int s, int g, float au) {
  float tc = min(au / RIB_DU, float(RIB_COLS - 1) - 1e-4);
  int k = int(tc);
  float f = tc - float(k);
  int a = RIB_BASE + (s * RIB_COLS + k) * 3 + g;
  return mix(sceneTexel(a), sceneTexel(a + 3), f);
}
float ribTableZ(int k, float au) {
  int s = k / RIBS_PER_SIDE;
  int j = k - s * RIBS_PER_SIDE;
  vec4 v = ribZGroup(s, j / 4, au);
  int r = j - 4 * (j / 4);
  return r == 0 ? v.x : (r == 1 ? v.y : (r == 2 ? v.z : v.w));
}
float ribSdAt(float nP, float au, float z, float zc, vec4 rib, out bool cartilage) {
  cartilage = au < rib.y;
  if (au < rib.x || au > rib.z) return 1e3;
  float dz = z - zc;
  float ht = uRibParams.x;
  float qx = abs(nP - uRibParams.y - ht) / ht;
  float qz = abs(dz) / rib.w;
  return (sqrt(qx * qx + qz * qz) - 1.0) * min(ht, rib.w);
}
float sternumHalfWidth(float z) {
  if (z >= uSternum.y) return uSternumW.y + (uSternumW.x - uSternumW.y) * (z - uSternum.y) / (uSternum.x - uSternum.y);
  if (z >= 0.0) return uSternumW.y;
  return uSternumW.z * (1.0 - (2.0 / 3.0) * min(1.0, z / uSternum.z));
}
float sternumSd(vec3 m, float nP, out bool cartilage) {
  cartilage = m.z < 0.0;
  if (m.y <= 0.0) return 1e3;
  float lat = abs(m.x) - sternumHalfWidth(m.z);
  float rad = abs(nP - uRibParams.y - 0.5 * uSternum.w) - 0.5 * uSternum.w;
  float ver = max(uSternum.z - m.z, m.z - uSternum.x);
  vec3 q = vec3(lat, rad, ver);
  return length(max(q, 0.0)) + min(max(lat, max(rad, ver)), 0.0);
}
// la parrilla en classifyWall: devuelve la costilla (0–23) o el esternón (MAX_RIBS) que contiene la muestra, o −1; la
// distancia dentro, si es cartílago, y el hueso más cercano (ribD, ribI) y lo más cercano (ribAny). Gemelo: ribScan
int ribScan(vec3 m, float d, float u, float wall, out float inD, out bool cartilage, out float ribD, out int ribI, out float ribAny) {
  inD = 1e3; cartilage = false; ribD = 1e3; ribI = 0; ribAny = 1e3;
  if (d >= wall) return -1;
  float cd = clavicleSd(m);
  if (cd < 0.0) { inD = cd; return CLAVICLE_INDEX; }
  if (cd < 1e3) { ribAny = cd; ribD = cd; ribI = CLAVICLE_INDEX; }
  float sc = scapulaSd(m);
  if (sc < 0.0) { inD = sc; return SCAPULA_INDEX; }
  if (sc < ribD) { ribAny = min(ribAny, sc); ribD = sc; ribI = SCAPULA_INDEX; }
  float nP = pleuraNormalDepth(m, d, wall);
  if (nP < uRibParams.y + uSternum.w + RIB_SEARCH_MARGIN_MM) {
    bool xc;
    float sd = sternumSd(m, nP, xc);
    if (sd < 0.0) { inD = sd; cartilage = xc; return MAX_RIBS; }
    ribAny = min(ribAny, sd);
    if (!xc && sd < ribD) { ribD = sd; ribI = MAX_RIBS; }
  }
  if (nP >= uRibParams.y + 2.0 * uRibParams.x + RIB_SEARCH_MARGIN_MM) return -1;
  float au = abs(u);
  int s = u < 0.0 ? 0 : 1;
  float zc[RIBS_PER_SIDE];
  for (int g = 0; g < 3; g++) {
    vec4 v = ribZGroup(s, g, au);
    zc[4 * g] = v.x; zc[4 * g + 1] = v.y; zc[4 * g + 2] = v.z; zc[4 * g + 3] = v.w;
  }
  for (int j = 0; j < RIBS_PER_SIDE; j++) {
    int i = s * RIBS_PER_SIDE + j;
    vec4 rib = uRibs[i];
    bool c;
    float rd = ribSdAt(nP, au, m.z, zc[j], rib, c);
    if (rd < 0.0) {
      bool rim = rd > -uRibParams.z * min(uRibParams.x, rib.w);
      inD = rd; cartilage = c && !rim;
      return i;
    }
    ribAny = min(ribAny, rd);
    if ((!c || uRibParams.z > 0.0) && rd < ribD) { ribD = rd; ribI = i; }
  }
  return -1;
}
float ribSd(vec3 m, int k) {
  if (k == CLAVICLE_INDEX) return clavicleSd(m);
  if (k == SCAPULA_INDEX) return scapulaSd(m);
  float nP = pleuraNormalDepth(m, -torsoDepth(m), wallTotalMm(m));
  bool c;
  if (k == MAX_RIBS) return sternumSd(m, nP, c);
  float u = wallArc(m);
  int s = k / RIBS_PER_SIDE;
  if ((u < 0.0 ? 0 : 1) != s) return 1e3;
  float au = abs(u);
  return ribSdAt(nP, au, m.z, ribTableZ(k, au), uRibs[k], c);
}
int faceRib(vec3 m) {
  float inD; bool cart; float ribD; int ribI; float ribAny;
  float u = wallArc(m);
  int ri = ribScan(m, -torsoDepth(m), u, wallTotalAt(u, m.z), inD, cart, ribD, ribI, ribAny);
  return ri >= 0 ? ri : ribI;
}
vec3 ribTangent(vec3 p, int k) {
  if (k == MAX_RIBS || k == SCAPULA_INDEX) return vec3(0.0, 0.0, 1.0);
  if (k == CLAVICLE_INDEX) return clavicleTangent(p);
  float tau = atan(p.x / uTorso.x, p.y / uTorso.y);
  float sx = uTorso.x * sin(tau);
  float sy = uTorso.y * cos(tau);
  float sc = 1.0 - ribCenterDepth(p) / length(vec2(sx, sy));
  float speed = length(vec2(uTorso.x * cos(tau), uTorso.y * sin(tau)));
  float u = wallArc(p);
  float au = abs(u);
  float dz = ribTableZ(k, au + 1.0) - ribTableZ(k, au);
  return normalize(vec3(sc * uTorso.x * cos(tau), -sc * uTorso.y * sin(tau), sign(u) * dz * speed));
}
float ribCurvature(vec3 p, int k) {
  if (k == MAX_RIBS || k == SCAPULA_INDEX) return 0.0;
  if (k == CLAVICLE_INDEX) return 1.0 / uClavicleR.x;
  float a = uRibParams.x;
  float b = uRibs[k].w;
  float nP = pleuraNormalDepth(p, -torsoDepth(p), wallTotalMm(p));
  float qx = abs(nP - uRibParams.y - a) / a;
  float qz = abs(p.z - ribTableZ(k, abs(wallArc(p)))) / b;
  float l = length(vec2(qx, qz));
  float c = l > 0.0 ? qx / l : 1.0;
  float sn = l > 0.0 ? qz / l : 0.0;
  return a * b / pow(a * a * sn * sn + b * b * c * c, 1.5);
}
`;
