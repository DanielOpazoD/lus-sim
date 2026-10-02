import type { Beat } from './rhythm';

/**
 * Lo que el corazón ha vaciado en el instante t (lus-sim, decisión 32): la fracción del volumen latido expulsada, 0 en la
 * telediástole (la R) y 1 en la telesístole. La mueve el pulso pulmonar (`anatomy/organs/lungPulse.ts`): el pulmón junto al
 * corazón ocupa el sitio que el corazón deja al vaciarse (White 2014: el máximo del desplazamiento cardiaco del pulmón, en
 * la telesístole). Sale de los eventos mecánicos de cada latido del reloj único (`rhythm.ts`, los de VExUS) y no añade
 * ningún número propio:
 *  - sube en la eyección, de la R al centro de la onda v (`tV`, la telesístole), con un coseno alzado cuyo punto medio cae
 *    junto al descenso x (`tX`, la sístole, cuando el anillo baja más deprisa);
 *  - baja en el llenado rápido con el mismo coseno, con el punto medio en el descenso y (`tY`, la apertura de la válvula),
 *    hasta 2·tY − tV; y si el latido es tan corto que no llega, en lo que quede hasta la R siguiente.
 * [SUPUESTO] La diástasis y la contracción auricular no cambian el volumen en el modelo (el corazón queda lleno al acabar el
 * llenado rápido): la forma no es la curva de volumen de Wiggers, solo su sístole y su llenado rápido
 * (`docs/APPROXIMATIONS.md`).
 */
export function ventricularEjection(beat: Beat, t: number): number {
  const tau = t - beat.tR;
  const ES = beat.tV - beat.tR;
  if (!(tau >= 0) || !(ES > 0)) return 0;
  if (tau <= ES) return 0.5 - 0.5 * Math.cos((Math.PI * tau) / ES);
  const fill = Math.min(2 * (beat.tY - beat.tR) - ES, beat.rr) - ES;
  if (!(fill > 0) || tau >= ES + fill) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * (tau - ES)) / fill);
}
