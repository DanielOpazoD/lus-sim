# Misión y objetivos

Este documento dice para qué existe lus-sim y cómo se decide qué hacer después. Todo PR declara qué
objetivo mueve (plantilla de PR) y cada fase de `docs/ROADMAP.md` termina con una evaluación por
objetivo. Si una tarea no mueve ninguno, no se hace.

## Misión

Enseñar a **obtener e interpretar** la ecografía pulmonar como se hace con un paciente real. lus-sim
es un simulador que corre en el navegador y en el que cada imagen sale de una cadena causal: paciente →
anatomía y fisiología → física acústica → señal → procesamiento del ecógrafo → imagen → medición →
interpretación. Así, el médico aprende, practica y se equivoca igual que frente a un paciente, y la
imagen cambia como cambiaría al mover la sonda o tocar un control.

A más largo plazo, lus-sim será la ventana pulmonar de un paciente virtual multiórgano, unido a
EchoTwin (corazón), VExUS (venas) y el simulador del ventilador R860 (`docs/UNIFICATION.md`).

## Para quién

- Médicos y estudiantes que aprenden ecografía pulmonar: urgencias, cuidados intensivos, medicina
  interna, cardiología, neumología.
- Docentes que enseñan y evalúan la técnica y la interpretación.
- Más adelante, quien integre la ecografía pulmonar con el corazón, las venas y la ventilación en un
  mismo paciente.

## Objetivos

Cada objetivo tiene un indicador que se puede medir. La meta de cada indicador es la de la versión 1.0
(fase 5); cada fase avanza hacia ella.

| Objetivo                     | Qué significa                                                                                                                            | Indicador (cómo se mide)                                                                                                                                                                                    | Meta 1.0                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **O1. Fidelidad física**     | Todo hallazgo emerge del modelo acústico: reflexión, reverberación, trampas subpleurales, atenuación, sombra, movimiento. Nada se pinta. | Metas F de `docs/KNOWLEDGE.md` implementadas como pruebas, con su mutación; invariantes de `docs/GUIDE.md` §18.                                                                                             | Todas las metas F en verde; cero artefactos pintados en la revisión de código.                              |
| **O2. Fidelidad anatómica**  | El tórax tiene las dimensiones documentadas por región, con variantes de hábito, sexo y edad, y se explora entero.                       | Metas A de la base como pruebas; parámetros declarados con `defineParameters`; cobertura de exploración, al 100 % (abajo).                                                                                  | Todas las metas A en verde.                                                                                 |
| **O3. Fidelidad ecográfica** | La imagen se parece a la real en su estadística y en cómo cambia.                                                                        | Banco de fidelidad frente al banco de referencia (decisión 5); prueba ciega con un ecografista experto que registra el rasgo que delata al simulador.                                                       | Acierto en la prueba ciega ≤ 70 % (la meta de EchoTwin); métricas del banco dentro del rango de referencia. |
| **O4. Fidelidad clínica**    | Los casos reproducen los hallazgos publicados y el puntaje sale de la señal.                                                             | Cadena del alumno por caso: con técnica correcta, grado por región exacto o a ±1 y conteo de líneas B a ±10 % (`docs/knowledge/clinical.md` §6); metas C y P de la base; revisión clínica experta en ciego. | Todos los casos de la base con su cadena en verde; revisión clínica sin errores graves.                     |
| **O5. Docencia**             | El alumno encuentra cada zona moviendo la sonda; hay modo alumno, docente y examen, y trampas que se activan a voluntad.                 | Tareas del currículo completables solo con técnica correcta; el modo examen no filtra la respuesta; evaluación con usuarios reales.                                                                         | Currículo completo; evaluación con usuarios registrada.                                                     |
| **O6. Ingeniería**           | Reproducible, probado, documentado y rápido.                                                                                             | `npm run check` y CI en verde; cobertura ≥ 90 %; decisiones, limitaciones y evidencia al día; modo B a ≥ 30 FPS en un computador moderno, interfaz a 60 FPS.                                                | Todo en verde y medido en cada versión.                                                                     |
| **O7. Unión**                | Preparado para unirse a VExUS, EchoTwin y el ventilador.                                                                                 | Tabla de procedencia honesta y deriva revisada en cada fase; contratos del paciente y del reloj definidos y probados.                                                                                       | Contrato del paciente común probado con al menos un simulador hermano.                                      |

## Requisito de cobertura: el pulmón se explora entero

Pedido explícito de Daniel (01-10-2026): **el pulmón debe poder examinarse por completo, por la cara anterior, la lateral y
la posterior, en toda la caja torácica**. Es parte de O2 y de O5 (el alumno encuentra cada zona moviendo la sonda), y de la
regla «que no mienta»: un tórax donde parte del pulmón no se puede tocar, o donde el pulmón no tiene vértice, enseña mal.

Se mide como **cobertura de exploración** y su meta, en la versión 0.2.0, es del 100 %:

- Cada espacio intercostal (1.º a 11.º) de cada hemitórax se puede apoyar con la sonda en cada línea de referencia (paraesternal,
  medioclavicular, axilar anterior, media y posterior, escapular y paravertebral) y devuelve la imagen que le corresponde:
  pulmón con su pleura, ventana cardiaca, o diafragma y órgano subdiafragmático bajo el borde pulmonar.
- El pulmón tiene vértice (cúpula pleural sobre la clavícula) y la fosa supraclavicular se alcanza; sus bases llegan hasta el
  seno costodiafragmático posterior.
- La cara posterior (escápula, paravertebral, columna) se explora con el paciente sentado, y el decúbito lateral, cuando entre,
  expone el lado de abajo; en supino se llega hasta la línea axilar posterior (PLAPS), como en la clínica.
- Lo que no se puede tocar es solo lo que tampoco se toca en la clínica (por ejemplo, el hueso de la escápula o el esternón).

## Lo que no es

- No es un dispositivo médico ni una ayuda diagnóstica.
- No es una biblioteca de vídeos ni un atlas de imágenes.
- No usa ni guarda datos de pacientes (decisión 5).
- No imita la marca de ningún ecógrafo comercial.
- No sacrifica la causalidad por un efecto bonito (`docs/GUIDE.md` §20).

## Cómo se prioriza

1. **Que no mienta.** Lo que contradice la física, la anatomía o la clínica documentadas se corrige
   antes de añadir nada nuevo.
2. **Lo que un clínico notaría primero.** En la imagen, el rasgo que delata al simulador en la prueba
   ciega; en la clínica, el hallazgo que un experto señalaría como falso.
3. **Lo que desbloquea más objetivos a la vez.** Por ejemplo, el motor de imagen portado de VExUS abre
   O1, O2 y O3.
4. **Lo que abarata la unión**, siempre que no frene lo anterior.

Cada fase termina con una evaluación adversarial de contexto limpio que pone nota sobre 7 a cada
objetivo. La hoja de ruta se ajusta con esas notas y los ajustes quedan en `docs/DECISIONS.md`.

## Estado

Se actualiza al cerrar cada fase.

| Objetivo | Fase 0 (26-09-2026)                                                                                |
| -------- | -------------------------------------------------------------------------------------------------- |
| O1       | Metas F definidas en la base (T01–T39); ninguna implementada: no hay imagen.                       |
| O2       | Metas A y avatar de referencia definidos; ninguna implementada.                                    |
| O3       | Banco de referencia identificado (34 ítems con licencia abierta); banco de fidelidad pendiente.    |
| O4       | Definiciones de consenso 2026 y 23 casos docentes descritos por zona; cadena del alumno pendiente. |
| O5       | Pendiente (fases 3 y 4).                                                                           |
| O6       | Check y CI en verde; cobertura ≈ 99 %; guardas de capas, documentación, evidencia y procedencia.   |
| O7       | Procedencia y deriva medidas; marco de VExUS heredado; contrato del paciente propuesto en la base. |
