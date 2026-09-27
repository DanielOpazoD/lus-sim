# Estrategia de pruebas

Qué protege cada capa de pruebas, cuándo corre y qué no cubre. Regla general: una prueba debe fallar si
el comportamiento clínico o físico se rompe; una prueba que repite una constante o un umbral ajustado a
la salida actual no protege nada.

| Capa               | Dónde                                      | Cuándo corre                      | Qué protege                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias rápidas  | `src/validation/*.test.ts` sin marcador    | `npm test`, `check`, CI           | Núcleo (reloj, azar por semilla, unidades), evidencia de los parámetros, capas, documentación (rutas y scripts citados, enlaces a los documentos de tema) y bibliografía (citas que existen, entradas localizables y sin huérfanas), procedencia del código portado.                                                                                                                                                                                                                                  |
| Lentas             | primera línea `// @tier slow`              | `npm run test:all`, `check`, CI   | Propiedades del motor con fast-check (`src/validation/properties.test.ts`) y los gemelos B → C → D de los ecos de interfaz y de la pleura (`src/validation/interfaceTwin.test.ts`, `src/validation/pleuraTwin.test.ts`); más adelante, la cadena completa del alumno.                                                                                                                                                                                                                                 |
| Cobertura          | `npm run test:coverage`                    | `check`, CI                       | Umbrales globales (≥ 90 % sentencias, ≥ 85 % ramas) que solo pueden subir; excluye lo que necesita DOM o WebGL.                                                                                                                                                                                                                                                                                                                                                                                       |
| e2e                | `e2e/*.spec.ts` (Playwright + SwiftShader) | `npm run e2e`, CI                 | Arranque con imagen y sin errores, mandos, sonda y pérdida del contexto WebGL (`e2e/smoke.spec.ts`, paso B2b); desde el paso B2a (`e2e/imagen.spec.ts`), equivalencia TS ↔ GLSL en el tórax (con la parrilla costal desde la decisión 16), estadística de Rayleigh del moteado y las líneas A en la envolvente de la GPU (su separación y F-T01 frente a la línea pleural mostrada, que cumplen desde la decisión 15) y la sombra costal (F-T08, con el fallo conocido `rib-shadow-pleura-residual`). |
| Procedencia        | `src/validation/provenance.test.ts`        | `npm test` (verdad solo en local) | La tabla de `docs/PROVENANCE.md` dice la verdad frente a los repos de origen; en CI, formato y existencia.                                                                                                                                                                                                                                                                                                                                                                                            |
| Banco de fidelidad | (fase 1–2) herramienta con GPU real        | a mano en cada PR de imagen       | Estadística de la imagen frente al banco de referencia real (fuera del repo, decisión 5): brillo de la pleura, decaimiento de las líneas A, ancho y contraste de las líneas B.                                                                                                                                                                                                                                                                                                                        |
| Prueba ciega       | (fase 2) mosaicos real/simulado            | al cerrar cada fase de imagen     | Que un observador experto no distinga la imagen simulada por un rasgo concreto; se registra el rasgo que la delata.                                                                                                                                                                                                                                                                                                                                                                                   |
| Casos clínicos     | (fase 4) cadena del alumno por caso        | `test:all`                        | Que el puntaje y el perfil medidos sobre la señal, con técnica correcta, caigan en lo que la bibliografía espera para el caso.                                                                                                                                                                                                                                                                                                                                                                        |

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
- **La meta por partes.** La intensidad media de cada sombra (≥ 20 dB bajo el eco intercostal) se exige; la pleura que se
  ve dentro de la sombra solo puede ser penumbra (a > −40 dB, solo fuera de la sombra completa), y en la sombra completa
  la pleura queda ≥ 40 dB bajo el eco intercostal y la ventana ≥ 39 dB bajo la de las líneas libres. «Bajo la costilla no
  hay línea pleural ni líneas A» se juzga en la pantalla (nada sobre el negro) y aún no se cumple: la prueba exige el
  fallo con su tamaño a ±2,5 dB (`rib-shadow-pleura-residual`). La geometría (la pleura 5 ± 1 mm bajo la cresta costal)
  se mide en TypeScript con `support/chestView.ts` y es del paso C, como la línea base de las costillas y los espacios
  intercostales, en la anatomía y en la imagen (`src/validation/anatomyTargets.test.ts`).
- **Mutaciones.** Fallan: el hueso con la atenuación de IT'IS (4,74 dB/cm/MHz en lugar de 20: la pleura de la sombra
  completa sube a −15…−21 dB); sin los 6 dB de la entrada al hueso de la pasada A (la pleura, a −41 dB); el pedestal de
  lóbulos laterales de −24 a −18 dB (−43 dB); y la pleura de la rama del pulmón dibujada sin la transmisión de la costilla
  (la media de la sombra, −19 dB).

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
- **F-T08 en la GPU.** La pleura dentro de una sombra solo puede verse cerca de su borde (la penumbra de la apertura y el
  eco vecino que trae el pedestal de la pasada D, ≤ 10 líneas medidas con la pared torácica por región; 6 con la heredada);
  el núcleo de la sombra se juzga aparte y lleva el residuo declarado.

## Invariantes previstas

Las de la guía (§18) que aún no tienen módulo (líneas B, modo M, puntaje, ganancia y mapa de grises frente al
estado físico) entran como pruebas cuando llega su módulo; cada una con su mutación.
