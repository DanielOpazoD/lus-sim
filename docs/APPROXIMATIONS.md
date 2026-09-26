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

| Parámetro                          | Valor y rango            | Por qué                                                                                                                                                                                                                                                                                                                                          | Cómo calibrar                                                                                                                                                                                 |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe.blueUpperPose.phi`          | 0,75π rad (0,7π–0,8π)    | Punto BLUE superior derecho aproximado (pose por omisión, decisión 10): la línea medioclavicular de la escena de VExUS, donde su cartílago costal pasa a hueso (45° de la línea media anterior). Ninguna fuente mapea los puntos BLUE a una línea.                                                                                               | Regla de las manos [@lichtenstein-bluepoints-2011] con la antropometría de la mano (ANSUR II, laguna de `docs/knowledge/anatomy.md` §4), sobre el tórax del paso C con sus líneas anatómicas. |
| `probe.blueUpperPose.z`            | 97 mm (77–116)           | El EIC2 de la línea medioclavicular con la ley costal de la escena (la de `sdRib`: el extremo anterior más `ribTiltMm`·(0,5 − 0,5·sen φ)), extrapolando los extremos anteriores de VExUS 20 mm por costilla hacia arriba: la 2.ª a 106,1 mm y la 3.ª a 87,0, el EIC2 a 96,6. La escena heredada no tiene costillas por encima de la 5.ª.         | Con las costillas 2.ª–4.ª del paso C: el centro del EIC2 en la línea medioclavicular (meta A-T1); `src/validation/probe.test.ts` compara la pose con él.                                      |
| `app.startPointPoses.blueLowerPhi` | 0,875π rad (0,83π–0,92π) | Punto BLUE inferior derecho aproximado (decisión 12): la línea axilar anterior de los reparos simplificados de Yuriditsky y cols. [@yuriditsky-ecocardiografistas-2021], a mitad de camino entre la medioclavicular de la escena (3π/4) y la axilar media (π). Ninguna fuente mapea los puntos BLUE a una línea [@lichtenstein-bluepoints-2011]. | Regla de las manos con la antropometría de la mano y las líneas anatómicas del tórax del paso C.                                                                                              |
| `app.startPointPoses.blueLowerZ`   | 68 mm (12–86)            | El EIC4 de la axilar anterior («justo por encima del pezón») con la ley costal de la escena y la 4.ª costilla extrapolada 20 mm sobre la 5.ª, como el paso A (4.ª a 76,7 mm, 5.ª a 58,5, EIC4 a 67,6). El rango va de una mano (≈ 85 mm) bajo el punto superior, lo que da la regla de las manos, al EIC3 (85,7).                                | Con las costillas 2.ª–4.ª del paso C: el EIC4 de la axilar anterior.                                                                                                                          |
| `app.startPointPoses.plapsPhi`     | 1,15π rad (1,125π–1,2π)  | Punto PLAPS derecho aproximado (decisión 12): por detrás de la axilar posterior, «tan posterior como se pueda» en supino; la axilar posterior se toma simétrica de la anterior respecto de la media (1,125π) y el tope es el de `clampPose` (1,2π, el apoyo en la cama). Su altura es la del punto BLUE inferior («continuación horizontal»).    | Con el tórax posterior y la escápula de la fase 3 y el apoyo del paciente en la cama.                                                                                                         |

## Física

| Parámetro | Valor y rango | Por qué | Cómo calibrar |
| --------- | ------------- | ------- | ------------- |

## Fisiopatología y clínica

| Parámetro | Valor y rango | Por qué | Cómo calibrar |
| --------- | ------------- | ------- | ------------- |
