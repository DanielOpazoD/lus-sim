import { defineParameters } from '../core/evidence';

/**
 * Parámetros estimados del contraste del pulmón normal (decisión 24). Son los valores y dominios de
 * calibración heredados de VExUS, con un ajuste acotado del normal convexo. Las fuentes respaldan el
 * mecanismo o el criterio de calidad; no documentan estos valores ni sus intervalos numéricos.
 * El eco de interfaz y la serie pleural consumen este mismo registro, incluidos sus gemelos TS/GLSL.
 */
export const NORMAL_CALIBRATION = defineParameters('ultrasound.normalCalibration', {
  interfaceKDb: {
    value: 54,
    unit: 'dB',
    range: [53, 57],
    evidence: 'estimado',
    sources: ['soldati-trampas-2020', 'demi-guias-2023'],
    note:
      'K normaliza el pico de una cara plana de reflexión unitaria e incidencia normal frente a la envolvente RMS ' +
      'del hígado. Base 55 dB y dominio [53, 57] heredados de VExUS; se ensaya 54 dB junto a ganancia −20 dB ' +
      '(decisión 24) para elevar el disperso sin subir nominalmente la pleura. No son mediciones clínicas ni un intervalo ' +
      'publicado. Soldati 2020, §1, respalda el carácter especular del reflector; Demi 2023, enunciados 8 y 15, ' +
      'la interpretación de la línea pleural y el criterio de evitar su saturación, no el valor de K. Véase ' +
      'docs/knowledge/physics.md §2.2. Calibrar con el contraste pleura/pared del banco normal, leyendo también ' +
      'niveles de pared y neblina, prominencia de las líneas A y recorte; la ganancia no sustituye esa comparación',
  },
  pleuraRt: {
    value: 0.3,
    unit: 'fracción',
    range: [0.2, 0.5],
    evidence: 'estimado',
    sources: ['demi-guias-2023', 'soldati-trampas-2020', 'francisco-lineas-2016'],
    note:
      'R_t es el coeficiente efectivo de reflexión de amplitud de la cara sonda/piel en cada ida y vuelta de la ' +
      'reverberación. Base 0,3 y dominio [0,2, 0,5] heredados de VExUS; C3b-A conserva el valor 0,3 (decisión 24), ' +
      'sin añadir pérdida por este factor ni cambiar sus retardos. No se encontró una medición numérica de ' +
      'R_t (docs/knowledge/physics.md §2.3). Demi 2023, enunciado 8, respalda la periodicidad de las líneas A; ' +
      'Soldati 2020, §2 y figura 1, las copias de la pared; Francisco 2016, sección A lines, su pérdida cualitativa ' +
      'de ecogenicidad con la profundidad. Ninguna de esas fuentes fija R_t ni su rango. Calibrar contra la caída ' +
      'de las líneas A y la neblina con atenuación, TGC y geometría controladas, sin ampliar el dominio para ' +
      'alcanzar el banco de referencia',
  },
});
