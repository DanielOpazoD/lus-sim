import { defineParameters } from '../core/evidence';

/**
 * Preajuste pulmonar del equipo (lus-sim, decisión 12): el que sugiere la actualización de 2026 del consenso
 * internacional «si el equipo lo permite» (D1_1.2, comentario 2, pp. 10–11; `docs/knowledge/clinical.md` §3.7 y
 * `docs/knowledge/physics.md` §3.2): un solo foco, a la altura de la línea pleural; armónicos apagados; composición
 * espacial apagada; profundidad ≤ 10–12 cm con la sonda curvilínea en un adulto de complexión media; ganancia
 * creciente hacia el campo lejano. La persistencia se apaga porque los filtros de promediado ocultan un
 * deslizamiento sutil (consenso de 2012 y Lichtenstein 2014) y el protocolo ICLUS pide imagen sin filtros
 * cosméticos (Soldati 2020). Lo booleano (armónica y composición apagadas) no es un número: lo fija
 * `DEFAULT_BMODE` (`renderer.ts`) con esta cita.
 *
 * Apagar o cambiar el preajuste tiene consecuencias visibles (guía §13): la armónica cambia el haz, el ruido y el
 * campo cercano (decisión 77 de VExUS), la composición promedia tres miradas (y bajo la pleura se anula,
 * decisión 61 de VExUS), la persistencia mezcla cuadros y el foco cambia la PSF lateral de la pleura.
 */
export const LUNG_PRESET = defineParameters('ultrasound.lungPreset', {
  depthMm: {
    value: 120,
    unit: 'mm',
    range: [100, 120],
    evidence: 'consenso',
    sources: ['volpicelli-actualizacion-2026'],
    note:
      'Profundidad ≤ 10–12 cm con sonda curvilínea en un adulto de complexión media (D1_1.2, comentario 2). Se toma el ' +
      'extremo alto: es la profundidad con que una línea B de edema debe llegar al borde inferior (meta F-T18); con la ' +
      'pleura a 16 mm (la pared torácica por región, decisión 17) caben seis réplicas (líneas A de orden 2 a 7)',
  },
  focusMm: {
    value: 16,
    unit: 'mm',
    evidence: 'derivado',
    sources: ['volpicelli-actualizacion-2026'],
    note:
      'Un solo foco a la altura de la línea pleural (D1_1.2): la profundidad de la pleura parietal en el centro del sector ' +
      'con la sonda apoyada en el punto BLUE superior de la escena (`defaultPose`), en fin de espiración, medida con la ' +
      'marcha de A0 (`pleuraCrossingLine`): 16,0 mm con la pared torácica por región (decisión 17; 25 con la heredada). ' +
      '`lungPreset.test.ts` la vuelve a medir: si la anatomía cambia, la prueba falla y el foco se recalcula',
  },
  gainDb: {
    value: -21,
    unit: 'dB',
    evidence: 'derivado',
    sources: ['demi-guias-2023', 'volpicelli-actualizacion-2026'],
    note:
      'Sin saturar la línea pleural (Demi 2023, enunciado 15; `docs/knowledge/physics.md` §2.2): la ganancia que deja el ' +
      'eco pleural intercostal más brillante de los tres puntos de partida BLUE bajo el blanco. Medido en la envolvente de ' +
      'la GPU con 0 dB (ciclo 2, decisión 20: `ribShadow`, líneas libres en apnea espiratoria), la línea pleural llega a ' +
      '+19,4, +20,1 y +19,5 dB sobre el blanco en el punto BLUE superior, el inferior y el PLAPS; con −21 dB queda a ' +
      '−0,9…−1,6 dB. La e2e de la sombra costal lo vuelve a medir. El resto de la imagen baja lo mismo: la ganancia no ' +
      'cambia la ecogenicidad (guía §13), y la pared queda gris oscura bajo una línea pleural que aún es lo más brillante',
  },
  persistence: {
    value: 0,
    unit: 'fracción',
    evidence: 'consenso',
    sources: ['volpicelli-consenso-2012', 'lichtenstein-luci-2014', 'soldati-covid-2020'],
    note:
      'Sin promediado temporal: los filtros de promediado y de ruido dinámico pueden ocultar un deslizamiento sutil ' +
      '(`docs/knowledge/clinical.md` §1.1) y el protocolo ICLUS pide imagen sin filtros cosméticos',
  },
});

/**
 * Tejido de referencia de la compensación nominal de la atenuación (lus-sim, decisión 12): el blando de la pared
 * torácica con la pendiente de TGC de referencia de la base (`docs/knowledge/physics.md` §3.2), 0,5 dB/cm/MHz, la de
 * la simulación de Ostras y cols. (2023) sobre la pared del Visible Human. VExUS compensaba la del hígado (0,601).
 * Con ella la ganancia crece con la profundidad (la «ganancia creciente hacia el campo lejano» del preajuste de 2026)
 * y la caída mostrada entre líneas A sigue la meta F-T02: −20·log10|R_pl·R_tr| + 2·z·(α − α_TGC).
 */
export const TGC_REFERENCE = defineParameters('ultrasound.tgcReference', {
  alphaDbPerCmMHz: {
    value: 0.5,
    unit: 'dB/cm/MHz',
    evidence: 'documentado',
    sources: ['ostras-histopatologia-2023', 'volpicelli-actualizacion-2026'],
    note: 'TGC de referencia de la simulación validada de Ostras 2023 (Métodos); ganancia creciente hacia el campo lejano (D1_1.2)',
  },
});
