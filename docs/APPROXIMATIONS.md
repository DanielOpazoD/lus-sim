# Aproximaciones y parámetros pendientes de calibración

Todo parámetro con evidencia `estimado` o `extrapolacion` (`src/core/evidence.ts`) figura aquí por su
identificador completo entre acentos graves (`conjunto.parámetro`), con el motivo y el plan para
calibrarlo; `src/validation/evidence.test.ts` lo exige. La regla de la guía (§1) es no inventar valores
clínicos: usar un valor razonable, etiquetarlo y documentar cómo corregirlo. El código portado de VExUS
conserva sus propias etiquetas en comentario y su tabla de aproximaciones en el origen.

## Anatomía

| Parámetro | Valor y rango | Por qué | Cómo calibrar |
| --------- | ------------- | ------- | ------------- |

## Sonda y exploración

| Parámetro                 | Valor y rango         | Por qué                                                                                                                                                                                                                                                                                                                                  | Cómo calibrar                                                                                                                                                                                 |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe.blueUpperPose.phi` | 0,75π rad (0,7π–0,8π) | Punto BLUE superior derecho aproximado (pose por omisión, decisión 10): la línea medioclavicular de la escena de VExUS, donde su cartílago costal pasa a hueso (45° de la línea media anterior). Ninguna fuente mapea los puntos BLUE a una línea.                                                                                       | Regla de las manos [@lichtenstein-bluepoints-2011] con la antropometría de la mano (ANSUR II, laguna de `docs/knowledge/anatomy.md` §4), sobre el tórax del paso C con sus líneas anatómicas. |
| `probe.blueUpperPose.z`   | 97 mm (77–116)        | El EIC2 de la línea medioclavicular con la ley costal de la escena (la de `sdRib`: el extremo anterior más `ribTiltMm`·(0,5 − 0,5·sen φ)), extrapolando los extremos anteriores de VExUS 20 mm por costilla hacia arriba: la 2.ª a 106,1 mm y la 3.ª a 87,0, el EIC2 a 96,6. La escena heredada no tiene costillas por encima de la 5.ª. | Con las costillas 2.ª–4.ª del paso C: el centro del EIC2 en la línea medioclavicular (meta A-T1); `src/validation/probe.test.ts` compara la pose con él.                                      |

## Física

| Parámetro | Valor y rango | Por qué | Cómo calibrar |
| --------- | ------------- | ------- | ------------- |

## Fisiopatología y clínica

| Parámetro | Valor y rango | Por qué | Cómo calibrar |
| --------- | ------------- | ------- | ------------- |
