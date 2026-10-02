import { defineParameters } from '../../core/evidence';

/**
 * El vértice del pulmón y la cúpula pleural (lus-sim, cobertura torácica; `docs/MISSION.md`, requisito de cobertura). Hasta
 * aquí el pulmón del modelo subía hasta el tope del tronco (z 300) sin vértice (`lung-border-table`); la base pone el vértice
 * ≈ 2,5 cm (hasta 4–5) sobre el tercio medial de la clavícula y, por detrás, en el cuello de la 1.ª costilla (Gray).
 *
 * Modelo, por columna de |u| (las de la pared torácica), sobre la piel fija del tronco cilíndrico: el pulmón llega a la cara
 * interna de la pared hasta `zApex(u)`, el borde superior de la 1.ª costilla de la columna (más `ribMarginMm`); por encima, las
 * partes blandas del cuello y del hombro engruesan la pared y su cara interna, la pleura cervical, se curva hacia dentro hasta
 * la altura `zTop(u)`, donde el pulmón acaba (`cupolaMm`). Junto a la línea media, bajo el tercio medial de la clavícula, `zTop`
 * es el vértice de la base; hacia fuera baja hasta `lateralRiseMm` sobre la 1.ª costilla. Como la cúpula es la cara interna de
 * la pared, la pleura que dibuja la imagen (A0) es la de siempre: no hay un segundo mecanismo de la pleura.
 */
export const LUNG_APEX = defineParameters('anatomy.lungApex', {
  apexAboveClavicleMm: {
    value: 25,
    unit: 'mm',
    range: [25, 50],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'El vértice del pulmón sube ≈ 2,5 cm sobre el tercio medial de la clavícula, a veces 4–5 cm («Surface Markings of the ' +
      'Thorax»; anatomy.md §1.5): el valor central; el borde superior de la clavícula, el de `anatomy.clavicle`',
  },
  cupolaCurveMm: {
    value: 30,
    unit: 'mm',
    range: [20, 45],
    evidence: 'estimado',
    sources: [],
    note:
      'Profundidad bajo la cara interna de la pared en la que la pleura cervical pasa de la vertical (la pared) a la ' +
      'horizontal (el techo de la cúpula) [SUPUESTO]: e = Rc·(1 − √(1 − h)), con h la fracción de la altura entre zApex y zTop',
  },
  lateralRiseMm: {
    value: 5,
    unit: 'mm',
    range: [0, 15],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Fuera del tercio medial de la clavícula el pulmón no pasa de la 1.ª costilla (Gray: la cúpula está dentro del anillo de la ' +
      '1.ª costilla); su techo, este tanto por encima del borde de la costilla, lejos de la pared [SUPUESTO]',
  },
  ribMarginMm: {
    value: 2,
    unit: 'mm',
    range: [0, 5],
    evidence: 'estimado',
    sources: [],
    note:
      'La cúpula empieza este tanto sobre el borde superior de la 1.ª costilla: la tabla de la pared tiene columnas de 8 mm y ' +
      'la de las costillas de 4; sin margen, la cúpula tocaría la cara superior de la costilla y la desplazaría [SUPUESTO]',
  },
});

/** Ancho (mm de piel) del paso del cuello a la cúpula junto a la línea media (`lungApexColumns`). */
export const NECK_BLEND_MM = 24;

/** Grosor que la cúpula alcanza en su techo (mm): por encima de `zTop` la columna es pared hasta el centro del tronco. */
export const CUPOLA_CAP_MM = 200;

/**
 * Grosor extra de la pared (mm, radial) a la altura z en una columna con la cúpula (zApex, zTop): 0 hasta zApex; la curva
 * Rc·(1 − √(1 − h)) hasta zTop (la pleura cervical: vertical en la pared, horizontal a Rc mm por dentro); `CUPOLA_CAP_MM` más
 * arriba (gemelo GLSL `cupolaMm`).
 */
export function cupolaMm(zApex: number, zTop: number, z: number): number {
  if (z <= zApex) return 0;
  const h = (z - zApex) / Math.max(zTop - zApex, 1e-3);
  if (h >= 1) return CUPOLA_CAP_MM;
  return LUNG_APEX.params.cupolaCurveMm.value * (1 - Math.sqrt(1 - h));
}

export const LUNG_APEX_GLSL = /* glsl */ `
#define CUPOLA_RC ${LUNG_APEX.params.cupolaCurveMm.value.toFixed(4)}
#define CUPOLA_CAP ${CUPOLA_CAP_MM.toFixed(4)}
float cupolaMm(vec2 a, float z) {
  if (z <= a.x) return 0.0;
  float h = (z - a.x) / max(a.y - a.x, 1e-3);
  if (h >= 1.0) return CUPOLA_CAP;
  return CUPOLA_RC * (1.0 - sqrt(1.0 - h));
}
`;

/** La parrilla que necesita la cúpula: la altura de la línea media de la 1.ª costilla derecha en |u| y su semialto. */
export interface ApexCage {
  firstRibZ: (au: number) => number;
  firstRibHalfWidth: number;
}

/**
 * Las columnas de la cúpula (`setChestWallApex`): `zApex(u)`, el borde superior de la 1.ª costilla más `ribMarginMm`, y
 * `zTop(u)`, el vértice de la base (`apexTopZ`, sobre el tercio medial de la clavícula) junto a la línea media hasta `uMedial`
 * y, desde `uOuter` hacia fuera y hacia atrás, `lateralRiseMm` sobre `zApex`; entre los dos, un paso suave. Nunca por debajo de
 * `zApex` más `lateralRiseMm`. Junto a la línea media (por delante, |u| < `uMidline`, la de la articulación esternoclavicular:
 * la tráquea; por detrás, |u| > `uBackMidline`, delante de la columna: el esófago) no hay pulmón por encima de la escotadura
 * yugular `notchZ`: zApex en ella más `ribMarginMm` (sin cúpula sobre el manubrio, que acaba en la escotadura). El tronco no
 * tiene mediastino (`heart-simplified`): esto solo quita el pulmón del cuello.
 */
export function lungApexColumns(
  cage: ApexCage,
  apexTopZ: number,
  uMedial: number,
  uOuter: number,
  notchZ: number,
  uMidline: number,
  uBackMidline: number,
): { zApex: (u: number) => number; zTop: (u: number) => number } {
  const P = LUNG_APEX.params;
  const step = (e0: number, e1: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  };
  // peso del cuello (1 junto a la línea media), con un paso suave de `NECK_BLEND_MM` hacia fuera: un salto entre dos columnas
  // de la tabla (8 mm) inclinaba las caras de la pared más de lo que miden sus gemelos a la precisión de float32
  const neck = (u: number) => {
    const au = Math.abs(u);
    return Math.max(1 - step(uMidline, uMidline + NECK_BLEND_MM, au), step(uBackMidline - NECK_BLEND_MM, uBackMidline, au));
  };
  const ribTop = (u: number) => cage.firstRibZ(Math.abs(u)) + cage.firstRibHalfWidth + P.ribMarginMm.value;
  const neckTop = notchZ + P.ribMarginMm.value;
  const zApex = (u: number) => {
    const w = neck(u);
    return neckTop * w + ribTop(u) * (1 - w);
  };
  const zTop = (u: number) => {
    const a = zApex(u);
    const low = a + P.lateralRiseMm.value;
    const x = Math.min(1, Math.max(0, (Math.abs(u) - uMedial) / (uOuter - uMedial)));
    const w = x * x * (3 - 2 * x);
    const dome = Math.max(ribTop(u) + P.lateralRiseMm.value, apexTopZ * (1 - w) + (ribTop(u) + P.lateralRiseMm.value) * w);
    const n = neck(u);
    return Math.max(low, dome * (1 - n) + low * n);
  };
  return { zApex, zTop };
}
