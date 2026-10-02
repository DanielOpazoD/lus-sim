# Estrategia de pruebas

Qué protege cada capa de pruebas, cuándo corre y qué no cubre. Regla general: una prueba debe fallar si
el comportamiento clínico o físico se rompe; una prueba que repite una constante o un umbral ajustado a
la salida actual no protege nada.

| Capa               | Dónde                                                                                                               | Cuándo corre                                                                                      | Qué protege                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias rápidas  | `src/validation/*.test.ts` sin marcador                                                                             | `npm test`, `check`, CI                                                                           | Núcleo (reloj, azar por semilla, unidades), evidencia de los parámetros, capas, documentación (rutas y scripts citados, enlaces a los documentos de tema) y bibliografía (citas que existen, entradas localizables y sin huérfanas), procedencia del código portado.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Lentas             | primera línea `// @tier slow`                                                                                       | `npm run test:all`, `check`, CI                                                                   | Propiedades del motor con fast-check (`src/validation/properties.test.ts`) y del campo respiratorio (`src/validation/respiratoryField.test.ts`, decisión 22), y los gemelos B → C → D de los ecos de interfaz y de la pleura (`src/validation/interfaceTwin.test.ts`, `src/validation/pleuraTwin.test.ts`); más adelante, la cadena completa del alumno.                                                                                                                                                                                                                                                                                                                              |
| Cobertura          | `npm run test:coverage`                                                                                             | `check`, CI                                                                                       | Umbrales globales (≥ 90 % sentencias, ≥ 85 % ramas) que solo pueden subir; excluye lo que necesita DOM o WebGL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| e2e                | `e2e/*.spec.ts` (Playwright + SwiftShader)                                                                          | `npm run e2e`, CI (8 fragmentos)                                                                  | Arranque con imagen y sin errores, mandos, sonda y pérdida del contexto WebGL (`e2e/smoke.spec.ts`, paso B2b); desde el paso B2a (`e2e/imagen.spec.ts`), equivalencia TS ↔ GLSL en el tórax (con la parrilla costal desde la decisión 16), estadística de Rayleigh del moteado y las líneas A en la envolvente de la GPU (su separación y F-T01 frente a la línea pleural mostrada, que cumplen desde la decisión 15) y la sombra costal (F-T08, que cumple desde la decisión 20).                                                                                                                                                                                                    |
| Procedencia        | `src/validation/provenance.test.ts`                                                                                 | `npm test` (verdad solo en local)                                                                 | La tabla de `docs/PROVENANCE.md` dice la verdad frente a los repos de origen; en CI, formato y existencia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Banco de fidelidad | `src/measure/fidelity/` (métricas), `e2e/fidelidad.spec.ts` (simulador), `tools/fidelity/reference.ts` (referencia) | unitarias y propiedad en `check`; la e2e en CI; `npm run fidelity:ref` a mano donde está el banco | Las métricas de `docs/knowledge/reference-images.md` §3.2 (P1, P2, P4, A1, A2, T1, T2, S1) y las propuestas (M sin suelo y N4; N1–N3, con el suelo) sobre la imagen mostrada, con la censura de lo recortado; la invariancia afín de lo que se declara invariante (fast-check, 200 corridas, con mutaciones del código) y el barrido de ganancia del simulador; que el detector automático vea la pleura, las líneas A y las sombras del simulador; las estadísticas del banco de referencia real (fuera del repo, decisión 5) con la geometría fijada y compuertas, entre clips y entre sujetos, y el simulador frente a su p10–p90, solo informado hasta la calibración (ciclo 3b). |
| Prueba ciega       | (fase 2) mosaicos real/simulado                                                                                     | al cerrar cada fase de imagen                                                                     | Que un observador experto no distinga la imagen simulada por un rasgo concreto; se registra el rasgo que la delata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Casos clínicos     | (fase 4) cadena del alumno por caso                                                                                 | `test:all`                                                                                        | Que el puntaje y el perfil medidos sobre la señal, con técnica correcta, caigan en lo que la bibliografía espera para el caso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## La e2e en el CI

- **Ocho fragmentos en paralelo, un trabajador cada uno** (`.github/workflows/ci.yml`, `playwright.config.ts`; PR #32,
  decisión 30). Las 29 pruebas se reparten por prueba y no por archivo (`fullyParallel`), **por cuenta y en orden**: Playwright
  da a cada fragmento ⌊29/8⌋ pruebas consecutivas y una más a los primeros, sin mirar cuánto duran. Al añadir o quitar una
  prueba, mirar qué fragmento recibe las ventanas del banco de fidelidad (≈ 4 min cada una en el CI): con 29 en siete, el
  segundo juntaba tres y se acercaba a los 15 min. El agregador `check`
  exige que toda la matriz apruebe, además de `verificar`; el plazo por corredor sigue en 15 minutos.
  Los cinco fragmentos del ciclo 2 crecieron a seis con B+M. Con las pruebas del navegador humano, el segundo de seis
  concentraba una calibración y todo el banco de fidelidad: en CI99 agotó 15 minutos dos veces, también al repetirlo
  solo, sin fallos de aserción. El primer intento completó sus cinco pruebas antes de ser cancelado; el segundo
  completó cuatro. Siete fragmentos separan el barrido de ganancia y PLAPS del resto del banco, sin omitir pruebas,
  cambiar semillas, relajar tolerancias ni ampliar plazos. No se añaden trabajadores concurrentes al mismo corredor.
  Históricamente, dos trabajadores compartiendo CPU con SwiftShader empeoraron la duración (13,6 min frente a 8,5 min
  sumando cada prueba aislada); se conserva un trabajador por fragmento.
- **Los plazos se miden con un trabajador.** Un plazo nuevo se justifica con lo medido en el CI, no en local. Los corredores
  no son iguales (AMD EPYC 7763, 9V45 y 9V74; Intel Xeon 8370C, 8573C y 6973P, con 4 vCPU): la misma prueba tarda hasta 2,5
  veces más en uno que en otro, y el margen se mide en el lento.
- **Se esperan hechos, no plazos** (decisiones 29 y 30). Con SwiftShader en el CI la aplicación dibuja un cuadro cada 1–20 s (B + M
  en el teléfono, el peor caso) y cada clic de Playwright espera un par de cuadros: lo que la prueba comprueba se espera
  por lo que la aplicación dice que hizo (los cuadros del renderizador nuevo en el cine, la columna M), y lo que la
  interfaz muestra en respuesta a un gesto se escribe en el acto, no en el cuadro siguiente.
- **Mirar la pantalla cuesta.** Con la imagen en vivo en el CI, una captura del lienzo tarda 26–42 s y decodificarla en la
  página otros 19–41 s; congelada, 5–11 s y 1 s. Las capturas se decodifican en Node (pngjs, que trae Playwright): 0,02 s.
- **Lo pasajero se registra, no se espera a verlo.** El aviso de la recuperación de la GPU dura 5 s y el primer cuadro del
  renderizador nuevo puede bloquear la página más que eso con SwiftShader: la prueba registra los avisos con un
  MutationObserver al aparecer (con un trabajador por fragmento, esperar a verlo falló en los dos intentos del CI).

## Principios

- **Pipeline real**: las pruebas de regresión recorren el camino que usa la app, no una copia.
- **Técnica del operador**: la sonda se coloca como lo haría un alumno correcto, sin atajos que el
  alumno no tiene.
- **Mutación**: al añadir una guarda, se comprueba que falla con el defecto que pretende atrapar (las
  reglas de `evidence.test.ts` se prueban en los dos sentidos; la de procedencia, marcando «idéntico»
  un archivo adaptado).
- **Contraejemplos**: lo que fast-check encuentra se arregla o se documenta como `it.fails` enlazado a
  una limitación de `docs/LIMITATIONS.md`.
- **Semillas fijas**: fisiología, dispersores y fast-check son deterministas (`src/core/random.ts`).
- **Primero la prueba que falla**: una decisión de imagen planificada deja antes sus pruebas con
  `it.fails` y los umbrales del plan; el PR de la decisión las pasa a `it`.
- **Datos con la forma real**: las pruebas de regresión usan escenas y casos con la forma clínica real
  (lección de otros proyectos: una prueba con datos «limpios» dejó pasar dos regresiones clínicas).

## Fase 1, paso A: el motor en TypeScript (decisión 10)

- **Arnés portado, no cifras.** Las pruebas de VExUS de los módulos portados se conservan con su intención; las
  cifras que medían su escena abdominal se sustituyen por lo medido en vistas del tórax (con el margen explicado
  en la prueba) o por leyes físicas, y lo que comprueba el shader ensamblado vuelve con la GPU en el paso B.
  `docs/PROVENANCE.md` dice qué prueba es idéntica y qué cambió en cada una adaptada.
- **Invariantes físicas** (`src/validation/physicsInvariants.test.ts`, guía §18): las líneas A a múltiplos
  exactos de la profundidad de la pleura y cada vez más débiles (cada ida y vuelta pierde energía); la reflexión
  y la transmisión en una interfaz conservan la energía y ninguna cara refleja más de lo que le llega; la pleura
  de A0 está donde la clasificación sale de la pared, con pulmón detrás justo sobre el borde; la sonda solo
  empuja; el deslizamiento se mueve con la fase respiratoria del reloj único; misma semilla, mismo resultado. Cada una se comprobó con la mutación del código que protege (descritas en la decisión 10).
- **Metas A de la fase que aún no se cumplen** (`src/validation/anatomyTargets.test.ts`): se miden en la escena
  heredada con el procedimiento de `src/validation/support/chestView.ts` (la sonda apoyada con su contacto, en
  fin de espiración, y las costillas buscadas por su número) y llevan el valor medido en su comentario. No son
  `it.fails`, que también «pasa» si la prueba lanza por un error propio: cada una exige que su cuerpo falle por
  una aserción (`chai.AssertionError`). El paso C las pasa a `it`.
- **Cobertura medida** con el código portado (todos los niveles): 92,8 % de sentencias, 88,5 % de ramas,
  93,3 % de funciones y 94,2 % de líneas; tras el paso B1 (decisión 11), 92,9 %, 88,7 %, 93,6 % y 94,3 %. Queda sobre
  los umbrales (90/85/90/90), que no cambian.

## Fase 1, paso B2a: la imagen en la GPU (decisión 12)

- **Equivalencia TS ↔ GLSL en la e2e.** La anatomía existe dos veces: en TypeScript (pruebas, medidas) y en GLSL (la
  imagen). `e2e/imagen.spec.ts` las compara con los ganchos del banco (`/?e2e=1`): los planos de los tres puntos de
  partida, 50 000 puntos del volumen del tórax (exactos en tejido y cara a ≥ 1 mm de una interfaz), la cáscara de las
  caras de la pared, las costillas y la pleura, nubes alrededor de los extremos de las 24 costillas (`ribEnds`: tejido,
  cara y normal hasta 0,05 mm de los bordes), la pleura de A0 línea a línea (a lo sumo el paso final de su bisección),
  las normales de las caras y la transmisión de la pasada A. Los umbrales llevan en su comentario lo medido con GPU
  real y con SwiftShader.
- **La física en la imagen de la GPU, no en un gemelo.** Las líneas A se miden sobre la envolvente leída de la GPU
  (`aLines`: grupos de 8 líneas promediados, alineados en la pleura de cada una) y la estadística de Rayleigh sobre
  parches del músculo de la pared (`speckle`); ninguna de las dos lee un valor que el shader escriba para la prueba.
  Una meta se mide como la define la base: F-T01 frente a la línea pleural mostrada, no frente al cruce D con el que el
  shader coloca las réplicas (medir frente a D era casi circular; lo halló la revisión del paso B2a).
- **Metas que aún no se cumplen, también en la e2e.** Como las metas A (decisión 10), una meta F que la imagen aún no
  cumple no se relaja ni se salta: la prueba exige el fallo con su tamaño medido y falla cuando alguien lo corrige, para
  que la prueba y la limitación cambien juntas. Así pasó con F-T01 en los órdenes 3 y 4 (`pleura-echo-offset`, decisión
  12): la decisión 15 la corrigió, la prueba falló como estaba previsto y pasó a exigir la meta en los órdenes 1–4.
- **Mutaciones.** Cada guarda se comprobó rompiendo el shader o sus uniforms y viéndola fallar (decisión 12); el
  procedimiento es el de siempre: aplicar la mutación, `npx vite build`, correr la prueba y restaurar.
- **Cobertura.** Con la GPU portada: 94,6 % de sentencias, 88,6 % de ramas, 94,6 % de funciones y 95,8 % de líneas
  (el renderizador, `gl.ts`, los shaders y los ganchos de la e2e no cuentan: los ejerce la e2e). Una trampa de la
  cobertura v8: el código que una prueba evalúa en memoria con la ruta de un módulo real (`vm.runInThisContext` con
  ese `filename`) se mezcla con el módulo y le quita cobertura; se le da un nombre que no sea ruta.

## Fase 1, paso B2b: la aplicación (decisión 13)

- **Humo de la aplicación** (`e2e/smoke.spec.ts`): la imagen se mira en la pantalla (una captura del lienzo, no un búfer
  de la GPU, que puede estar bien con la pantalla negra). El arranque con la línea pleural y el aviso, los mandos del
  equipo con el HUD, congelar con el cine (el HUD dice los ajustes del cuadro que se ve, comprobado dos cuadros después
  del cambio: antes pasaba sin repintar), la sonda por arrastre y por una tarjeta, «Reiniciar paciente», el informe
  técnico y la pérdida del contexto WebGL. El registro de errores va a la consola y la prueba la vigila. Cada prueba se
  comprobó con una mutación (decisión 13).
- **La interfaz sin DOM** (`src/validation/uiInput.test.ts`): el entorno de vitest es `node`; los oyentes se registran en
  un `window` y un elemento falsos y los gestos se entregan a mano. Así se prueba qué hace cada gesto con la pose y el
  equipo; que el navegador entregue los eventos lo prueba la e2e. `src/ui/**` y la sesión no cuentan para la cobertura
  (necesitan DOM o WebGL), como en VExUS.

## Sombra costal (F-T08)

- **En la envolvente, línea a línea, con la geometría de la pasada A.** `ribShadow` (ganchos de la e2e) clasifica cada
  línea con los datos de la propia pasada A: sus segmentos (la línea cruza hueso antes de la pleura) y las tomas de sus
  conos de apertura en la fila de la pleura (`apertureTransmission`): sombra completa si todas cruzan hueso, línea libre
  si ninguna. Clasificar con la CPU (paso de 0,05 mm) ponía en la sombra completa líneas que la pasada A ve en penumbra
  (lo halló la revisión). Mide la pleura y la línea A de orden 2 en la envolvente, su nivel en la pantalla
  (`displayLevelDb`, gemelo de la pasada de escaneo) y la intensidad media en la ventana D − 1 … 2·D + 1 mm, la misma en
  todas las líneas.
- **La meta entera (decisión 20).** La intensidad media de cada sombra (≥ 20 dB bajo el eco intercostal) se exige; la
  pleura que se ve dentro de la sombra solo puede ser la de su penumbra física (a > −40 dB, solo a menos del semiancho del
  cono de emisión en la costilla más 2,5σ del lóbulo principal de su borde, `coneHalfLines` + `mainLobeLines`); en el núcleo
  (la sombra completa más allá de esa penumbra) la pleura queda ≥ 60 dB bajo el eco intercostal y la ventana ≥ 60 dB bajo la
  de las líneas libres. «Bajo la costilla no hay línea pleural ni líneas A» se juzga en la pantalla: en el núcleo la línea
  pleural, y en toda la sombra completa la línea A de orden 2, en el gris 0 de 8 bits (`blackLevelDb`). Con el preajuste la
  línea pleural intercostal no satura (≤ 0 dB) y queda a menos de 3 dB del blanco. La geometría (la pleura 5 ± 1 mm bajo la
  cresta costal) se mide en TypeScript con `support/chestView.ts` y es del paso C, como la línea base de las costillas y los
  espacios intercostales, en la anatomía y en la imagen (`src/validation/anatomyTargets.test.ts`).
- **Gemelos y equivalencia de la sombra (decisión 20).** La transmisión con apertura de la mirada 0 (con la fase del hueso de
  cada toma) y la que dibuja la pasada B, frente a `look0ApertureTwin` sobre los segmentos de la GPU; la costilla de cada
  línea de A0 (h3) frente a `boneRunAlongLine` sobre la clasificación de la CPU; la pasada D frente a `lateralTwin` sobre el
  campo que le dio la C (`lateralParity`, con cuántas muestras cambia el pedestal en sombra) y las miradas dirigidas con la
  fase. En TypeScript, `src/validation/boneTransmission.test.ts`: la lente (sin hueso o con una placa, la media de siempre;
  con una sección redonda, el foco pierde), la cuerda exacta, la frecuencia y las caras del hueso, el pedestal en dos partes
  y que las paridades ven cada cambio (con la media de VExUS o el pedestal de siempre, no casan).
- **Mutaciones.** Fallan (decisión 20): el pedestal sin la sombra (la pleura del núcleo a −52 dB), el cono sin la fase (en la
  pantalla, gris), el hueso a 2,5 MHz y el preajuste con 0 dB (la línea pleural intercostal saturada). Antes (decisión 16):
  el hueso con la atenuación de IT'IS (4,74 dB/cm/MHz en lugar de 20), sin la pérdida de la entrada al hueso y la pleura de la
  rama del pulmón dibujada sin la transmisión de la costilla.

## Parrilla costal (paso C1, decisión 16)

- **La anatomía, medida como la ecografía.** Los anchos de los espacios y el alto de las costillas se miden bajo la sonda
  apoyada en cada línea del tórax (`support/chestView.ts`: `intercostalWidthMm`, el corte de la sonda con la línea media de
  las costillas) y en la imagen (`intercostalImageWidthMm`, el corte centrado en el espacio); los números de la base se
  calibran con la anatomía (el hueso no se deforma) y la imagen lleva el ensanchamiento de la compresión cinemática
  (`probe-compression-kinematic`), que se mide y, donde saca la imagen del rango, va con `notYetMet`.
- **Las cuentas salen de la clasificación.** `ribsAlongLine` recorre cada línea de arriba abajo con `ribScan` (la
  parrilla de la clasificación, la de la GPU) y la prueba exige, por línea, las costillas en su orden y del lado de la línea:
  ninguna falta, se funde con otra ni sobra (entre dos cruces seguidos, ≥ 1 mm sin hueso ni cartílago en la clasificación:
  que cambie el índice no basta); por hemitórax, 12 costillas y 11 espacios, y las dos parrillas simétricas. Aparte, en
  todo |u| donde están dos costillas seguidas, su espacio es ≥ 1 mm (≥ 0 junto a la punta de un cartílago del reborde).
- **La construcción, contra la base.** `src/validation/ribcage.test.ts`: los niveles vertebrales del esternón y de los
  extremos posteriores, los cartílagos que llegan al esternón o al de arriba, las uniones condrocostales, las puntas libres,
  la calcificación y la tabla (simétrica, suave, sin salirse de la textura).
- **La pared torácica por región (paso C2, decisión 17).** `src/validation/chestWall.test.ts`: las capas de cada estación
  son las de la base, la tabla (la de la GPU) es simétrica y continua, las caras quedan en su orden en todo el tórax, la
  banda intercostal engruesa delante al inspirar y bajo el reborde costal vuelve la pared del abdomen de VExUS; las metas
  medidas bajo la sonda (A-T1–A-T5, A-T10 y la variante delgada) están en `anatomyTargets.test.ts`. Las pruebas de la pared
  en capas de VExUS (`wall.test.ts`) miran la pared del abdomen (z −280) o el tronco uniforme del hábito.
- **Los bordes del pulmón, la ZOA y el corazón (paso C3, decisión 18).** En `anatomyTargets.test.ts`, el pulmón que toca
  la pleura (1,5 mm por dentro, en la lámina de la cortina) a lo largo de las líneas del tórax, a los dos lados: el borde de
  Gray en FRC, la reflexión pleural (con el diafragma bajado sin límite), la excursión de la cortina, la ZOA medida por la
  normal de la piel, el EIC bajo el borde que la cortina tapa en inspiración profunda (A-T14), la ausencia de líquido (A-T12)
  y la ventana cardiaca (A-T16: miocardio bajo la pleura y sin pleura en A0; pulmón en el lado derecho y sobre el ápex).
  La e2e compara la pleura de A0 también en la ventana cardiaca y en el borde de la LAM izquierda.
- **F-T08 en la GPU.** La pleura dentro de una sombra solo puede verse cerca de su borde; desde la decisión 20, en la
  penumbra física de cada línea (el cono de la apertura y el lóbulo principal), no en el alcance medido del pedestal (≤ 10
  líneas con la pared torácica por región), y el núcleo de la sombra cumple la meta.

## Campo respiratorio (decisión 22)

- **Invertible por construcción, y comprobado.** `src/validation/respiratoryField.test.ts` exige, con fast-check (20 000
  puntos del tronco en las seis variantes del tórax con tres grasas del abdomen), el jacobiano del mapa directo (1 − D·∂w/∂z,
  afín en D: con una excursión cubre toda fase de todo patrón que no la pase) ≥ 0,5 con la excursión profunda (53 mm) y ≥ 0,35
  con el máximo de su rango (75), y en una rejilla densa que cada vertical se aplique en sí misma de forma estrictamente
  creciente. La pared que mira el campo nunca es más fina que la de verdad ni engruesa hacia abajo más que su pendiente. La
  inversa (la bisección en la vertical, TS y GLSL) vuelve al punto material a ≤ 0,05 mm y a ≤ D/2^(pasos + 1) con toda excursión.
- **Mutaciones en la suite.** Las mismas propiedades se corren sobre el campo de VExUS (dirección anterior, sin la ley de
  altura), sobre el caudal sin la ley de altura y sobre la inversa de dos pasos de punto fijo: la prueba exige que fast-check
  encuentre un contraejemplo que falle por su aserción (`expectPropertyFails`). El peso con la pared de verdad se pliega en una
  banda fina junto a la pared que el azar no encuentra: se recorre en una rejilla de 3 mm. Las metas que el campo aún no cumple
  (la cúpula izquierda baja el 35 %; la cúpula lateral con 35 mm de grasa en el abdomen, el 14 %) van con `notYetMet`.
- **Por el camino real.** La excursión de cada patrón en la cúpula junto a la axilar, A-T13 en el mundo (la cortina de la LAM) y
  la ventana cardiaca quieta en la inspiración profunda, con el motor, la consulta del mundo y la escena. En la e2e, la
  equivalencia en inspiración profunda suma al barrido los planos donde el campo cambia deprisa (la ventana cardiaca, el borde
  de la LAM izquierda y la cortina derecha), con ≥ 0,999 de acuerdo interior, y la pleura de A0 en sus cinco planos; con la GLSL
  en dos pasos de punto fijo, falla.
- **Una meta que cuelga de un supuesto lo dice la prueba.** A-T15 a TLC exige el EIC a ≥ 10 mm de la inserción de la ZOA, que
  depende de su longitud estimada (`zoaBelowReflectionMm`): con 15 mm en lugar de 20 falla por su aserción. Desde el tronco de
  226 mm (decisión 28) falla también con 20 (el EIC 9 de la LAA, a 9,8 mm: la reflexión sube más que él) y es `notYetMet`; su mitad en FRC sigue en `it`.

## Banco de fidelidad (decisión 21)

- **Métricas puras, las mismas para el simulador y para los clips** (`src/measure/fidelity/`): sobre cuadros de gris con su
  escala, muestrean el sector (con la geometría dada: la verdadera en el simulador, la fijada en el manifiesto en los clips),
  detectan la pleura (guiada por la del cuadro medio), las sombras costales (con una sola superficie de cresta) y las líneas A
  sin verdad de terreno, y miden en múltiplos de la distancia piel–pleura (o en mm con la escala). Cada métrica que usa
  píxeles recortados sale censurada (`censored`: cota inferior, superior, sin dirección o al límite de la resolución): una
  mediana aguanta hasta la mitad recortada, una media o un momento hasta el 5 % (`CLIP_MEAN_MAX`).
  `src/validation/fidelityBench.test.ts` las prueba sobre sintéticos del patrón normal con respuesta conocida
  (`support/syntheticLus.ts`: convexa, lineal y sectorial, un abanico cortado por el cuadro, recortes, marcas fijas y
  quemadas, deslizamiento, cuadros repetidos, fascias más brillantes que la pleura, crestas de dos poblaciones);
  `src/validation/fidelityStats.test.ts`, la estadística de abajo.
- **Invariancia afín con fast-check** (`src/validation/fidelityInvariance.test.ts`, nivel lento, 200 corridas por propiedad,
  semilla fija; los casos en `support/fidelityCases.ts`): continua con a ∈ [0,05; 3] (igual a 1e-6, también la censura); en 8
  bits con dos contrastes, dentro de una tolerancia por métrica medida (`TOL_8BIT`); y la tubería del banco (el detector
  propone la geometría de un abanico cortado por el cuadro, se fija y se miden los dos contrastes con el cambio solo dentro
  del sector). Una prueba aparte deja escrito lo que no es invariante: la piel detectada en cada contraste. Que las
  propiedades muerden se comprobó con mutaciones del código aplicadas a mano (decisión 21, «Mutaciones»), no con variantes
  escritas en la prueba.
- **El simulador** (`e2e/fidelidad.spec.ts`, gancho `fidelity`): en los tres puntos de partida, en apnea espiratoria y en
  respiración tranquila, 30 cuadros de la imagen mostrada; exige que el detector encuentre la pleura del gemelo de A0 a ±1 mm
  en todas las columnas, las líneas A de orden 2 y 3 a k veces la línea pleural mostrada (F-T01) y las sombras donde las
  líneas cruzan hueso, y adjunta el informe (`fidelidad-<punto>.json`) con las métricas con la geometría verdadera y con la
  detectada, los niveles en dB (desde el gris y desde la envolvente sin recortar), la caída por orden frente a F-T02 y la
  comparación con la referencia (solo informada). El **barrido de ganancia** en BLUE superior usa desplazamientos de
  [−9, −3, 0, +3, +6, +9] dB respecto a `LUNG_PRESET.params.gainDb.value`, con la corrida central como referencia. Exige que lo
  declarado invariante no se mueva más del 5 % mientras no esté censurado, que las métricas de `MUST_COMPARE` se comparen
  sin censura a ±3 dB del preajuste y que N1–N3, con el suelo en el negro, salgan censuradas en todas las ganancias.
  `LUS_E2E_GPU=1` lo corre con la GPU real.
- **El detector de líneas A sin la tendencia** (decisión 31): un perfil que cae mucho con la profundidad, como el de LUS-35v,
  en `fidelityBench.test.ts`, y el mismo perfil sin líneas A con ruido correlado (casi ninguna «visible»); tres mutaciones del
  código (buscar en el perfil crudo; la mediana centrada sin el hueco del pico; el ruido sin su parte correlada) las hacen
  fallar.
- **El mapa de grises desde el moteado** (`src/validation/speckleMap.test.ts`, decisión 31): sobre moteado sintético de Rayleigh
  con mapas conocidos (`support/syntheticGreyMap.ts`: logarítmico puro, la curva del simulador, c negativo, recorte, grano,
  interpolación entre líneas, persistencia, ruido de recepción, una textura que lo aparta de Rayleigh), con las tolerancias
  declaradas antes de mirar los clips (c a ±15 %, el rango dinámico a ±8 % con grano ≤ 1 px); y por ubicación a través de un
  barrido de ganancia conocido. La autoprueba sobre el simulador es `e2e/mapaGrises.spec.ts`: con el barrido de ganancia
  recupera c = 3,5 ± 0,5 y 70 dB ± 5 %, y el estimador de una sola imagen no da por fiable el mapa de la región de su pared,
  que no es moteado de Rayleigh (la e2e lo mide en la envolvente, en parches de 16 × 8): lo delatan la asimetría en dB y el
  grano. Cuatro mutaciones del estimador (c sin la ordenada, la DE en lugar de los cuantiles, sin el diagnóstico de
  asimetría, sin el del grano) hacen fallar las pruebas.
- **La referencia** (`src/validation/fidelityReference.test.ts`): el manifiesto (licencias abiertas, `in_repo: false`,
  sujeto, geometría fijada y revisada, control de calidad) y el archivo de estadísticas (solo números derivados, sin rutas ni
  listas de píxeles, cada clip entero) tienen su forma; las compuertas automáticas atrapan lo que dicen, y un clip apto que
  dispare una que su control de calidad no admite hace fallar la prueba; los estratos llevan la distribución entre clips y
  entre sujetos, con exactamente los clips que ven cada métrica, no la tienen censurada y la miden en al menos la mitad de sus
  cuadros, y la comparación nunca marca ↓ o ↑ con un valor censurado o con menos de 3 clips o 2 sujetos.
  `src/validation/fidelityReferenceBank.test.ts` (nivel lento, prueba dorada) vuelve a medir el banco real y exige las
  estadísticas del repositorio número a número; se salta sin la carpeta o sin ffmpeg.

### Calibración fija del contraste normal (decisión 24)

`e2e/calibracion.spec.ts` alcanza t = 60 s en apnea espiratoria con el reloj fisiológico existente y lo pausa para adquirir
tres réplicas por rango dinámico (50, 60, 70 y 80 dB) en BLUE superior, BLUE inferior y PLAPS. Con `frameIntervalS = 0` y
`settleS = 0`, la anatomía permanece en el mismo instante, pero el ruido del receptor sigue dependiendo del cuadro. No son
envolventes idénticas ni una serie temporal: el informe devuelve `stack: null`; T2/S1 se evalúan por separado en las series
respiratorias de `e2e/fidelidad.spec.ts`.

Cada réplica atraviesa el renderizador y `readDisplay`, sin remapear gris ya recortado. `calibracion-<punto>.json` registra
semilla, tiempos, K, R_t, equipo, GPU, niveles, métricas y censura. La prueba exige las cuatro configuraciones, tres tiempos
iguales a 60 s, medidas finitas, restitución del equipo y ausencia de errores. Exige más de 50 columnas de soporte pleural
en DR70, el preajuste primario; registra la coherencia completa y ese mismo criterio en todos los rangos. Una alternativa
diagnóstica sin soporte no es una adquisición aceptada; el soporte no se confunde con la censura de métricas. Verifica el protocolo,
sin afirmar concordancia con el banco ni sustituir las pruebas de sombras, líneas A, adquisición y saturación.

La comparación integrada usa el grupo de exploración de `docs/reference-bank/calibration-split.json`, con cada sujeto
ponderado una vez. `calibrationReference` reagrega sus clips con las mismas compuertas y censura. La comprobación posterior
usa sujetos separados; ajustar parámetros a partir de ella se declara como nueva exploración. Los agregados ya eran
conocidos: no constituye validación clínica independiente ni ciega.

### Opciones de comparación

`npm run fidelity:compare -- [opciones] informe.json ...` admite informes con una lista `reports`:

| Opción          | Valores                            | Por omisión                                | Efecto                                                                                         |
| --------------- | ---------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `--basis`       | `clips`, `subjects`                | `clips`                                    | Elige el p10–p90 entre clips o sujetos. C3b-A usa `subjects`.                                  |
| `--reference`   | Ruta a estadísticas con `strata`   | `docs/reference-bank/reference-stats.json` | Permite usar un grupo reagregado; el manifiesto de partición no es un archivo de estadísticas. |
| `--respiration` | `quiet`, `apnea-expiratory`, `all` | `quiet`                                    | Selecciona los informes; el protocolo fijo requiere `apnea-expiratory`.                        |

Para comparar una adquisición fija contra estadísticas derivadas de un grupo, con las variables apuntando a esos archivos:

```sh
npm run fidelity:compare -- --basis subjects --reference "$LUS_REFERENCE_STATS" --respiration apnea-expiratory "$LUS_CALIBRATION_REPORT"
```

La CLI conserva la censura y los mínimos del banco descritos arriba. Opciones inválidas, valores ausentes o ningún informe
con la respiración elegida producen un error explícito.

### Alcance del banco abdominal heredado

`src/validation/interfaceTwin.test.ts` conserva K = 55 dB solamente en `runCase`, que reproduce las bandas históricas M1–M8
y sus regresiones. M9 y las llamadas directas a `simulate` usan el valor vigente de producción (K = 54 dB en el ajuste preliminar
C3b-A). Las bandas no se amplían; reproducir el banco histórico no verifica el contraste pulmonar nuevo.

## Cobertura de exploración (decisión 26)

`src/validation/coverage.test.ts` recorre con `explorationCoverage` (`src/app/coverage.ts`) las celdas del requisito de cobertura
de `docs/MISSION.md`: por hemitórax, cada EIC de las líneas paraesternal, medioclavicular, axilares, escapular y paravertebral,
el vértice (en una rejilla de todo el corte) y la fosa supraclavicular. En cada una, la sonda apoyada con su contacto en una posición del
paciente admitida, la línea central y lo que la base pone ahí (los anclajes de Gray, no la tabla del modelo). Una prueba por
celda: las que se cumplen protegen lo logrado y las pendientes van con `notYetMet` y su motivo, así que un cambio que arregla
una celda la tiene que pasar a `it`. El total (meta v0.2.0: 100 %) también. Una mutación de la posición (la sonda en cualquier
sitio) comprueba que el medidor ve el pulmón de la espalda: lo que falla detrás es el alcance, no la medida. Desde la
decisión 27, el vértice (A-T23: el pulmón más alto en una rejilla de todo el corte; junto a la pared, la 1.ª costilla de cada
línea) y la clavícula con la fosa supraclavicular (A-T24) están en `anatomyTargets.test.ts`, y la e2e compara la anatomía de
la GPU también en la fosa, sobre la clavícula y en la axila alta, con un volumen aparte del vértice (z 150–230). Desde la
decisión 29 las posiciones admitidas son el supino y el paciente sentado (la espalda): cada celda dice la primera que la alcanza
y una prueba comprueba que solo en supino la espalda vuelve a quedar fuera. La escápula (A-T18) se mide en la clasificación, en
una rejilla de la piel de la espalda (el hueso de la lámina, no el de una costilla, a la mitad de su grosor por la normal), y la
e2e compara la anatomía de la GPU en cuatro planos de la espalda (la escápula, la paravertebral, junto a las transversas y la
línea media con las espinosas); el volumen del tórax ya muestrea la espalda. La compresión de la sonda (s ≤ 0, ∂s/∂ρ ≥ 0) se
comprueba en toda la vuelta. `evidenceNotes.test.ts` comprueba que el build vacía las notas de evidencia de todos los módulos
sin cambiar su número de líneas y que la aplicación no lee `.note` fuera de `core/evidence.ts`.

## Invariantes previstas

Las de la guía (§18) que aún no tienen módulo (líneas B, modo M, puntaje, ganancia y mapa de grises frente al
estado físico) entran como pruebas cuando llega su módulo; cada una con su mutación.

## Adquisición con navegación 3D (decisión 23)

`src/validation/acquisitionHistory.test.ts` recorre el renderizador con WebGL registrador para comprobar
que cada cuadro conserva pose, contacto efectivo, muestra y maniobra respiratoria. Incluye el frame visible que todavía no
había vencido para el cine, copia independiente de vectores/respiración, vuelta del anillo y sustitución de
escena/GPU. El gesto sin paso fisiológico debe actualizar el plano sin adelantar el reloj.

Las pruebas puras del navegador comprueban el adaptador de coordenadas, la continuidad al cruzar π,
el rechazo de regiones no explorables y la huella/sector sobre el mismo marco de la adquisición.
`src/validation/uiInput.test.ts` instala juntos los oyentes reales de la sonda y de los atajos: la
activación nativa de Espacio no debe cancelarse al enfocar un botón. `e2e/adquisicion.spec.ts` verifica
los mandos contextuales, congelado/cine y distribución móvil sobre el build de producción. El recorrido
histórico cambia ganancia, ubicación y maniobra; cambiar profundidad inicia un anillo nuevo por la regla
de persistencia entre escalas polares, y se comprueba como una operación distinta.
`e2e/navegacion3d.spec.ts` recorre los gestos y botones del navegador, la independencia de la cámara,
el bloqueo de la sonda en cine y la pérdida/restauración del contexto 3D sin reiniciar el ecógrafo.
La inyección de pérdida/restauración y las capturas se realizan con la adquisición pausada, como en
el humo del ecógrafo. Entre ambas operaciones se reanuda con el 3D todavía perdido y se exige que
ese mismo renderizador ecográfico adquiera cuadros nuevos; después de restaurar se comprueba otro
avance. Esta prueba no demuestra la inyección de pérdida bajo carga simultánea de ambos contextos: en
SwiftShader, la evaluación posterior a una captura en vivo agotó el plazo y no se pudo atribuir el
bloqueo a la llamada nativa o al transporte de la evaluación. Se conservan los plazos y umbrales.

El build controla entrada inicial y módulo 3D diferido por separado y también la suma. Estas pruebas
no establecen rendimiento en GPU física ni certifican fidelidad anatómica o visual del modelo.
