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
      'del hígado. Base 55 dB y dominio [53, 57] heredados de VExUS; el ajuste preliminar C3b-A usa 54 dB junto a ' +
      'ganancia −20 dB (decisión 24); el ajuste de la pleura (decisión 35) los conserva: K 53 con ganancia −19 o −18 y K 54 ' +
      'con −19 rompen una guarda de la e2e (el detector del sector en el BLUE inferior o la línea pleural sin recorte). ' +
      'Con C3b-A, medido en CI con rango dinámico 70 dB y apnea a t = 60 s: suben modestamente ' +
      'el gris de pared y neblina, con recorte pleural mediano 0 y las pruebas de sombras y líneas A conservadas. ' +
      'Es calibración del simulador; K y su dominio no son mediciones clínicas ni un intervalo ' +
      'publicado. Soldati 2020, §1, respalda el carácter especular del reflector; Demi 2023, enunciados 8 y 15, ' +
      'la interpretación de la línea pleural y el criterio de evitar su saturación, no el valor de K. Véase ' +
      'docs/knowledge/physics.md §2.2. Calibrar con el contraste pleura/pared del banco normal, leyendo también ' +
      'niveles de pared y neblina, prominencia de las líneas A y recorte; la ganancia no sustituye esa comparación',
  },
  pleuraRt: {
    value: 0.1,
    unit: 'fracción',
    range: [0.1, 0.5],
    evidence: 'estimado',
    sources: [
      'fujitsu-reflexion-1985',
      'onda-cauchos',
      'itis-base-2024',
      'demi-guias-2023',
      'soldati-trampas-2020',
      'francisco-lineas-2016',
    ],
    note:
      'R_t es el coeficiente efectivo de reflexión de amplitud de la cara sonda/piel en cada ida y vuelta de la ' +
      'reverberación. Base 0,3 y dominio [0,2, 0,5] heredados de VExUS; el ajuste preliminar C3b-A conservó el valor 0,3 (decisión 24). ' +
      'Decisión 35: el dominio pasa a [0,1, 0,5] por sus fuentes, declarado antes del barrido: arriba, la reflexión de los ' +
      'transductores convencionales, −6 a −10 dB (0,50–0,32; patente de Fujitsu de 1985); abajo, la de una lente de silicona ' +
      "(0,99–1,46 MRayl, tabla de Onda) frente a la piel (1,80 MRayl, IT'IS), 0,10–0,29 (cálculo propio). El ajuste de la " +
      'pleura con la exploración (decisión 35: σz, R_t y K a la vez, con la línea pleural sin perder brillo frente a la ' +
      'costilla, y con las guardas de la e2e) elige 0,1, el borde de abajo, con σz 0,05 mm, K 54 dB y ganancia −20 dB. ' +
      'Sin añadir pérdida por este factor ni cambiar sus retardos. No se encontró una medición de ' +
      'R_t en una sonda clínica actual (docs/knowledge/physics.md §2.3). Demi 2023, enunciado 8, respalda la periodicidad de las líneas A; ' +
      'Soldati 2020, §2 y figura 1, las copias de la pared; Francisco 2016, sección A lines, su pérdida cualitativa ' +
      'de ecogenicidad con la profundidad; esas tres no fijan R_t ni su rango (lo acotan las de arriba). Calibrar contra la caída ' +
      'de las líneas A y la neblina con atenuación, TGC y geometría controladas, sin ampliar el dominio para ' +
      'alcanzar el banco de referencia',
  },
});
