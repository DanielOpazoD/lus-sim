# Estrategia de pruebas

Qué protege cada capa de pruebas, cuándo corre y qué no cubre. Regla general: una prueba debe fallar si
el comportamiento clínico o físico se rompe; una prueba que repite una constante o un umbral ajustado a
la salida actual no protege nada.

| Capa               | Dónde                                      | Cuándo corre                      | Qué protege                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unitarias rápidas  | `src/validation/*.test.ts` sin marcador    | `npm test`, `check`, CI           | Núcleo (reloj, azar por semilla, unidades), evidencia de los parámetros, capas, documentación (rutas y scripts citados, enlaces a los documentos de tema) y bibliografía (citas que existen, entradas localizables y sin huérfanas), procedencia del código portado.                                                                                                     |
| Lentas             | primera línea `// @tier slow`              | `npm run test:all`, `check`, CI   | Propiedades del motor con fast-check (`src/validation/properties.test.ts`) y los gemelos B → C → D de los ecos de interfaz y de la pleura (`src/validation/interfaceTwin.test.ts`, `src/validation/pleuraTwin.test.ts`); más adelante, la cadena completa del alumno.                                                                                                    |
| Cobertura          | `npm run test:coverage`                    | `check`, CI                       | Umbrales globales (≥ 90 % sentencias, ≥ 85 % ramas) que solo pueden subir; excluye lo que necesita DOM o WebGL.                                                                                                                                                                                                                                                          |
| e2e                | `e2e/*.spec.ts` (Playwright + SwiftShader) | `npm run e2e`, CI                 | Arranque con imagen y sin errores, mandos, sonda y pérdida del contexto WebGL (`e2e/smoke.spec.ts`, paso B2b); desde el paso B2a (`e2e/imagen.spec.ts`), equivalencia TS ↔ GLSL en el tórax, estadística de Rayleigh del moteado y las líneas A en la envolvente de la GPU (su separación y F-T01 frente a la línea pleural mostrada, que cumplen desde la decisión 15). |
| Procedencia        | `src/validation/provenance.test.ts`        | `npm test` (verdad solo en local) | La tabla de `docs/PROVENANCE.md` dice la verdad frente a los repos de origen; en CI, formato y existencia.                                                                                                                                                                                                                                                               |
| Banco de fidelidad | (fase 1–2) herramienta con GPU real        | a mano en cada PR de imagen       | Estadística de la imagen frente al banco de referencia real (fuera del repo, decisión 5): brillo de la pleura, decaimiento de las líneas A, ancho y contraste de las líneas B.                                                                                                                                                                                           |
| Prueba ciega       | (fase 2) mosaicos real/simulado            | al cerrar cada fase de imagen     | Que un observador experto no distinga la imagen simulada por un rasgo concreto; se registra el rasgo que la delata.                                                                                                                                                                                                                                                      |
| Casos clínicos     | (fase 4) cadena del alumno por caso        | `test:all`                        | Que el puntaje y el perfil medidos sobre la señal, con técnica correcta, caigan en lo que la bibliografía espera para el caso.                                                                                                                                                                                                                                           |

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
  caras de la pared, las costillas y la pleura, la pleura de A0 línea a línea (a lo sumo el paso final de su bisección),
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

## Invariantes previstas

Las de la guía (§18) que aún no tienen módulo (líneas B, modo M, puntaje, ganancia y mapa de grises frente al
estado físico) entran como pruebas cuando llega su módulo; cada una con su mutación.
