import { defineParameters } from '../../core/evidence';

/**
 * Definiciones del banco de fidelidad (decisión 21): dónde se mide cada nivel y qué cuenta como línea A o sombra. Son
 * elecciones de medición, no números del paciente, pero cambian lo que el banco dice, así que llevan su evidencia y su
 * rango (`docs/APPROXIMATIONS.md`, «Medición»): se calibran con los clips reales del banco de referencia (ciclo 3b).
 *
 * Las profundidades van en múltiplos de la distancia piel–pleura d_pl medida en cada columna (u = r/d_pl, la unidad
 * interna de `docs/knowledge/reference-images.md` §3.1, que además es el espaciado esperado de las líneas A), salvo el
 * campo profundo y la búsqueda de la pleura, que van en fracción de la profundidad del sector.
 */
export const FIDELITY_BENCH = defineParameters('measure.fidelityBench', {
  pleuraSearchFrom: {
    value: 0.05,
    unit: 'fracción de la profundidad',
    range: [0.03, 0.1],
    evidence: 'estimado',
    sources: ['carrer-pleura-2020'],
    note:
      'Comienzo de la búsqueda de la línea pleural (la cresta más brillante de cada columna): salta la piel y el campo ' +
      'cercano. En el adulto la pleura queda a ≥ 1 cm (≥ 8 % de 12 cm)',
  },
  pleuraSearchTo: {
    value: 0.7,
    unit: 'fracción de la profundidad',
    range: [0.5, 0.8],
    evidence: 'estimado',
    sources: ['carrer-pleura-2020'],
    note:
      'Fin de la búsqueda de la línea pleural. Con 0,6 la pleura de LUS-03 (lineal, pared gruesa: 56 % de la profundidad) ' +
      'quedaba pegada al límite',
  },
  wallFrom: {
    value: 0.2,
    unit: 'd_pl',
    range: [0.1, 0.3],
    evidence: 'estimado',
    sources: [],
    note: 'Banda de la pared (nivel N1 y moteado T1): desde el 20 % de d_pl, sin la piel ni el transitorio de la cara',
  },
  wallTo: {
    value: 0.85,
    unit: 'd_pl',
    range: [0.75, 0.9],
    evidence: 'estimado',
    sources: [],
    note: 'Fin de la banda de la pared: antes del flanco de subida del eco pleural (su FWHM es ≈ 0,1·d_pl)',
  },
  hazeFrom: {
    value: 1.25,
    unit: 'd_pl',
    range: [1.15, 1.35],
    evidence: 'estimado',
    sources: ['soldati-trampas-2020'],
    note: 'Neblina subpleural (N2): entre la línea pleural (u = 1) y la primera línea A (u = 2), sin ±0,25 de cada una',
  },
  hazeTo: {
    value: 1.75,
    unit: 'd_pl',
    range: [1.65, 1.85],
    evidence: 'estimado',
    sources: ['soldati-trampas-2020'],
    note: 'Fin de la banda de la neblina subpleural',
  },
  deepFrom: {
    value: 3.25,
    unit: 'd_pl',
    range: [3, 4.5],
    evidence: 'estimado',
    sources: [],
    note:
      'Campo profundo (N3, M del campo profundo): la banda entre las líneas A de orden 3 y 4 en las columnas intercostales, en ' +
      'múltiplos de d_pl y no en fracción de la profundidad, que no es la misma magnitud a 12 cm que a 21 cm. Es lo más hondo ' +
      'que alcanzan todos los clips del banco (LUS-01 llega a 4,2 d_pl)',
  },
  deepTo: {
    value: 3.75,
    unit: 'd_pl',
    range: [3.5, 5],
    evidence: 'estimado',
    sources: [],
    note: 'Fin de la banda del campo profundo',
  },
  floorFrom: {
    value: 1.25,
    unit: 'd_pl',
    range: [1.1, 1.5],
    evidence: 'estimado',
    sources: ['lichtenstein-luci-2014'],
    note:
      'Suelo (g_suelo): el núcleo de la sombra costal a la altura de la neblina y de la primera línea A (u 1,25–2,75), ' +
      'donde bajo la costilla no hay eco (signo del murciélago)',
  },
  floorTo: {
    value: 2.75,
    unit: 'd_pl',
    range: [2.25, 3.25],
    evidence: 'estimado',
    sources: ['lichtenstein-luci-2014'],
    note: 'Fin de la banda del suelo en el núcleo de la sombra costal',
  },
  aLineWindow: {
    value: 0.3,
    unit: 'd_pl',
    range: [0.15, 0.35],
    evidence: 'estimado',
    sources: ['demi-guias-2023'],
    note:
      'Semiventana de búsqueda del pico de orden k alrededor de u = k. F-T01 pide ±0,5 mm (≈ 0,03·d_pl) en el simulador, ' +
      'pero en un clip la piel puede no estar en el borde superior (recorte, campo cercano oculto): con un desfase c la línea A ' +
      'de orden 2 cae en u = 2 + c/d_pl (LUS-01: 2,19). Por debajo de 0,5 no toca el orden vecino',
  },
  aLineBackground: {
    value: 0.5,
    unit: 'd_pl',
    range: [0.3, 0.5],
    evidence: 'estimado',
    sources: [],
    note:
      'Semiventana de la tendencia de profundidad del perfil y del fondo local de cada orden: la media de las medianas de cada ' +
      'lado, entre ±`aLineGap` y ±0,5 d_pl (la neblina entre órdenes; decisión 31)',
  },
  aLineGap: {
    value: 0.15,
    unit: 'd_pl',
    range: [0.1, 0.2],
    evidence: 'estimado',
    sources: [],
    note:
      'Hueco central que la tendencia de profundidad deja fuera a cada lado del punto: el propio pico (su FWHM, P2, es ' +
      '0,07–0,09 d_pl en el simulador y 0,05–0,13 en los clips aptos). Una mediana centrada sobre una tendencia inclinada sube con el pico y ' +
      'resta parte de su prominencia (decisión 31)',
  },
  aLineMinRatio: {
    value: 0.05,
    unit: 'fracción',
    range: [0.02, 0.1],
    evidence: 'estimado',
    sources: [],
    note:
      'Una línea A es visible si su prominencia sobre el fondo local es ≥ 5 % de la de la línea pleural (r_k de A2; ≈ 10 ' +
      'grises con la pleura a 200) y ≥ 3 veces el ruido del perfil. Con el 2 % contaba en el simulador una línea A de ' +
      'orden 4 a gris 2–6, casi toda en el negro',
  },
  penumbraFraction: {
    value: 0.04,
    unit: 'fracción del ancho',
    range: [0.02, 0.06],
    evidence: 'estimado',
    sources: [],
    note:
      'Margen a cada lado de una sombra costal que no cuenta ni como sombra ni como espacio intercostal: la penumbra, ' +
      '6–8 líneas de 192 (3–4 % del ancho) en el simulador (decisión 20)',
  },
  minShadowFraction: {
    value: 0.02,
    unit: 'fracción del ancho',
    range: [0.01, 0.05],
    evidence: 'estimado',
    sources: [],
    note: 'Ancho mínimo de una sombra costal (una costilla de 1 cm a 2 cm de la sonda ocupa ≥ 5 % de un sector de 68°)',
  },
  ribCrestMaxSpread: {
    value: 0.2,
    unit: 'fracción',
    range: [0.1, 0.3],
    evidence: 'estimado',
    sources: ['lichtenstein-luci-2014'],
    note:
      'Una sombra costal se acepta si las crestas de su núcleo forman una sola superficie: IQR/mediana ≤ 0,2. En LUS-01 las ' +
      'crestas de un tramo oscuro caían en tres poblaciones (filas 15–25, 45–60 y 90–95) y su mediana daba P4 y P1',
  },
  subPleuraTo: {
    value: 1.6,
    unit: 'd_pl',
    range: [1.4, 2],
    evidence: 'estimado',
    sources: ['duclos-speckle-2019'],
    note: 'Fin de la banda bajo la pleura (u 1,1–1,6) de la coherencia temporal T2; S1 usa u 1,1–2',
  },
});

/** Valores del banco (atajo). */
export const FB = Object.fromEntries(Object.entries(FIDELITY_BENCH.params).map(([k, p]) => [k, p.value])) as Record<
  keyof typeof FIDELITY_BENCH.params,
  number
>;
