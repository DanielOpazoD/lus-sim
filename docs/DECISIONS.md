# Decisiones de diseño

Formato (práctica de EchoTwin y VExUS): entrada numerada, nunca renumerada; una decisión superada se
marca `[Estado: superada por N]` dentro de su propio título. Cada entrada lleva la medición o la
observación que la motivó y sigue la plantilla de `CONTRIBUTING.md`. Referencias: «guía» =
`docs/GUIDE.md`; «base» = `docs/KNOWLEDGE.md`. `docs/DECISIONS_INDEX.md` se genera con
`npm run docs:index`.

## 1. Proyecto paralelo, nacido para unirse a EchoTwin y VExUS

**Fecha.** 2026-09-26.

**Contexto.** Daniel pidió (26-09-2026) un simulador de ecografía pulmonar con los mismos principios de
alta fidelidad anatómica, ecográfica, clínica y física que EchoTwin y VExUS, desarrollado en paralelo y
teniendo presente que probablemente los tres se unirán. Los dos simuladores existentes están en
desarrollo activo en otras sesiones: vexus-sim integra trenes de PR apilados y EchoTwin trabaja en la
rama `feat/borde-pulmonar`.

**Opciones.** (a) Segunda aplicación dentro de vexus-sim: comparte el motor sin copiarlo, pero choca con
el desarrollo en curso y mezcla dos historiales de decisiones. (b) Monorepo ya (motor + VExUS + LUS):
es el estado final deseable, pero exige reestructurar VExUS mientras otra sesión lo modifica. (c)
Bifurcar vexus-sim: la historia común facilitaría la unión, pero arrastra 75 decisiones, casos y pruebas
que no son de este proyecto. (d) Repositorio nuevo que porta el motor con registro de procedencia.

**Decisión.** (d). Repositorio público `DanielOpazoD/lus-sim` (elección de Daniel: CI sin límite de
minutos, como EchoTwin), licencia MIT como EchoTwin. Cinco reglas hacen barata la unión:

1. misma pila y convenciones que VExUS (decisión 2);
2. código portado con procedencia y deriva medida (decisión 3);
3. frontera entre motor y pulmón por capas, con las mismas reglas que VExUS en las capas compartidas
   (`src/validation/layers.test.ts`);
4. paciente y reloj como contratos: el estado pulmonar se define aparte, listo para el paciente común
   (`docs/UNIFICATION.md`);
5. nada pintado y ningún número sin evidencia (decisiones 4 y 6).

**Consecuencias.** El motor queda duplicado mientras los proyectos vivan separados; la deriva se mide y
cada mejora a un archivo portado se ofrece de vuelta a su origen. La unión será un proyecto propio con
su plan (`docs/UNIFICATION.md`).

**Verificación.** `src/validation/provenance.test.ts` (la tabla de procedencia no miente) y
`src/validation/layers.test.ts` (las capas compartidas conservan las reglas de VExUS).

## 2. Pila y convenciones de VExUS

**Fecha.** 2026-09-26.

**Contexto.** La física que más necesita un simulador pulmonar ya existe en VExUS: la pleura con
reflexión de Fresnel y rugosidad, la serie de reverberaciones con las líneas A como réplicas del eco
pleural, el deslizamiento anclado al pulmón, la pared torácica en capas y la compresión bajo la sonda
(decisiones 61–63 de VExUS), escrita como gemelos TS/GLSL a mano. EchoTwin tiene el tórax completo, el
generador ts2glsl y una interfaz en React.

**Opciones.** Pila de EchoTwin (React, Zustand, ts2glsl): obligaría a reescribir la pleura y la pared de
VExUS en el subconjunto que admite ts2glsl. Pila de VExUS: la pleura y la pared se portan tal cual.

**Decisión.** TypeScript + Vite + WebGL2 sin intermediarios (three.js cuando llegue el navegador 3D), sin
framework de interfaz; Vitest + fast-check + Playwright con SwiftShader; pruebas en `src/validation/`;
documentos con los mismos nombres que VExUS; las mismas herramientas (índice de decisiones, presupuesto
de bundle, release por tag, Dependabot, hook de pre-push) y los mismos puertos desplazados en 100 (6700
desarrollo, 6709 e2e). De EchoTwin se adoptan desde el primer día la bibliografía con claves citables,
las guardas de documentación (decisión 4) y su lección de no reutilizar nunca un servidor de e2e ya
levantado; ts2glsl entra con la primera física propia (decisión 8). El resto de candidatos, con su fase,
está en `docs/PROVENANCE.md`.

**Consecuencias.** Unir lus-sim con VExUS será reconciliar archivos con la misma ruta; con EchoTwin
habrá que resolver además la diferencia de pila (`docs/UNIFICATION.md`).

**Verificación.** `docs/PROVENANCE.md` registra cada archivo de configuración y herramienta tomado de
VExUS; `src/validation/docs.test.ts` exige que los documentos solo citen archivos que existen.

## 3. Código portado con procedencia y deriva medida

**Fecha.** 2026-09-26.

**Contexto.** Dos copias del mismo motor divergen en silencio, y el costo de unirlas crece con la
divergencia.

**Decisión.** Todo archivo portado conserva la ruta que tenía en su origen y se copia del commit fijado
con `git show <commit>:<ruta>`, nunca del árbol de trabajo, que otra sesión puede estar editando. Cada
archivo tiene una fila en `docs/PROVENANCE.md` (origen `repo@commit:ruta`, estado «idéntico» o
«adaptado» y qué cambió). `tools/provenance/drift.ts` (`npm run provenance`) informa, archivo por
archivo, la diferencia local frente al commit fijado y los commits del origen posteriores a él. Una
mejora a un archivo portado se ofrece de vuelta a su origen como PR, coordinada con la sesión que lo
mantiene; una corrección del origen se trae a propósito y se vuelve a fijar la fila.

**Consecuencias.** Al unir los proyectos, la tabla dice qué reconciliar y cuánto.

**Verificación.** `src/validation/provenance.test.ts`: en la máquina donde están los repos de origen
comprueba que la tabla dice la verdad. Mutación: marcar como «idéntico» un archivo adaptado hace fallar
la prueba. En CI, sin los repos de origen, se comprueba el formato de la tabla y que los archivos
existen.

## 4. Evidencia verificable por máquina

**Fecha.** 2026-09-26.

**Contexto.** La guía de VExUS prohíbe inventar valores clínicos y pide etiquetar lo no respaldado;
VExUS lo hace con comentarios (`[ESTIMADO]`, `NEEDS_CALIBRATION`), que ninguna prueba puede comprobar.
EchoTwin cita la bibliografía con claves y verifica algunas tablas de su documentación.

**Decisión.** Todo número propio de lus-sim que entra en la anatomía, la física o la clínica se declara
con `defineParameters` (`src/core/evidence.ts`): valor, unidad, rango, tipo de evidencia (documentado,
consenso, derivado, estimado, extrapolación), fuentes y nota. Se valida al importar el módulo. Los
conjuntos se registran en `src/validation/parameterSets.ts`. Los documentos citan con `[@clave]`, y cada
entrada de `docs/REFERENCES.md` lleva DOI, PMID o URL. El código portado conserva sus etiquetas en
comentario para no divergir de su origen (decisión 3).

**Consecuencias.** «¿De dónde sale este número?» se responde leyendo el código. Lo estimado queda
listado para calibrarlo.

**Verificación.** `src/validation/evidence.test.ts` prueba cada regla en los dos sentidos, que las
fuentes existen, que lo estimado figura en `docs/APPROXIMATIONS.md` y que ningún conjunto queda sin
registrar. `src/validation/docs.test.ts` comprueba que toda cita `[@clave]` existe en la bibliografía.

## 5. Repositorio público sin datos de pacientes; banco de referencia fuera del repo

**Fecha.** 2026-09-26.

**Contexto.** El repositorio es público. La fidelidad de la imagen se medirá contra ecografías reales,
como EchoTwin lo hace con CAMUS, que guarda fuera de su repo.

**Decisión.** En el repositorio, las issues y los PR no entran imágenes, clips ni DICOM de pacientes.
El banco de referencia vive fuera del repo, en la carpeta que indique la variable `LUS_REFERENCE_DIR`
(por omisión `~/datos/lus-referencia/`). En el repo solo entran estadísticas derivadas (números) y citas.
Las imágenes de terceros entran solo con licencia compatible y atribución. Los clips clínicos propios
solo se usan anonimizados y nunca se versionan. `.gitignore` bloquea `referencia/` y `*.dcm`.

**Consecuencias.** El banco de fidelidad solo corre donde está el banco de referencia; CI comprueba la
lógica con datos sintéticos.

**Verificación.** `.gitignore`, la plantilla de PR y la de issues (aviso de repositorio público).

## 6. Cadena causal, tres estados y puntaje que emerge de la señal

**Fecha.** 2026-09-26.

**Contexto.** Principios de la guía de VExUS (§3–5, §21 y §23), que Daniel pidió conservar.

**Decisión.** El estado del paciente (verdad latente, incluido el estado regional del pulmón y del
espacio pleural) produce un estado físico (geometría, aireación y movimiento en el instante del reloj
único), del que la adquisición (sonda, equipo y operador) forma la imagen. El puntaje LUS y el perfil de
cada zona los calcula un clasificador puro (capa `lus`) sobre observables medidos en la señal adquirida
(capa `measure`: líneas B, confluencia, consolidación, deslizamiento en modo M), nunca el caso. Deben
poder existir pacientes discordantes. El modo docente muestra la verdad y lo medido lado a lado, sin
mezclarlos.

**Consecuencias.** Un puntaje equivocado por mala técnica es posible y deseable.

**Verificación.** `src/validation/layers.test.ts`: `lus` no puede importar la imagen y `measure` es la
única capa del motor que junta imagen y reglas. Las invariantes de la guía (§18) entran como pruebas a
medida que llegan sus módulos.

## 7. Marco anatómico y unidades de VExUS

**Fecha.** 2026-09-26.

**Contexto.** Los dos simuladores de origen usan marcos incompatibles. VExUS trabaja en mm con +x a la
izquierda del paciente, +y anterior y +z craneal, origen en el centro del tronco a la altura del
xifoides: un marco levógiro que su navegador 3D espeja con escala x = −1 (su decisión 22). EchoTwin
trabaja en cm con x izquierda, y superior y z anterior (dextrógiro), origen en la piel sobre el
esternón.

**Opciones.** (a) Marco propio dextrógiro en mm, con conversiones probadas hacia ambos orígenes: limpio,
pero obliga a adaptar cada archivo portado de VExUS (anatomía, GLSL, pruebas) y rompe su identidad con
el origen (decisión 3). (b) Heredar el marco y las unidades de VExUS y dejar la conversión a EchoTwin
para la unión.

**Decisión.** (b). mm, s y dB como unidades del motor; marco de VExUS con su origen. Al portar la
anatomía se hereda también su limitación `left-handed-anatomy-frame` con el mismo identificador.

**Consecuencias.** lus-sim y VExUS comparten marco y la unión entre ellos no convierte nada; la
conversión a EchoTwin (cm, dextrógiro, otro origen) es deuda declarada de la unión
(`docs/UNIFICATION.md`), que necesitará una función de conversión con su prueba.

**Verificación.** Las pruebas de anatomía que lleguen en la fase 1 fijan puntos con el marco de VExUS
(x positiva = izquierda del paciente).

## 8. GLSL: gemelos a mano para lo portado; ts2glsl para la física propia

**Fecha.** 2026-09-26.

**Contexto.** VExUS escribe a mano cada función GLSL junto a su gemela TypeScript y lo protege con una
prueba de gemelas por nombre y una e2e de equivalencia. EchoTwin genera sus funciones escalares desde
TypeScript con ts2glsl (344 líneas sobre la API del compilador, sin dependencias nuevas). Según su
auditoría de ingeniería, antes de ts2glsl había unos 200 literales duplicados entre CPU y GPU, dos
discrepancias reales de fórmula y tres reparaciones del espejo GLSL en seis días. El generador detecta en
Node, en segundos, trampas que antes solo veía la e2e: `pow` con base negativa, `min` con tres
argumentos.

**Opciones.** (a) Solo gemelos a mano, como VExUS. (b) ts2glsl para todo: imposible, porque el
clasificador de escena y las pasadas usan vectores, estructuras y texturas, fuera de su subconjunto. (c)
Mixto.

**Decisión.** (c). Los archivos portados de VExUS conservan sus gemelos a mano, idénticos al origen
(decisión 3). La física escalar propia de lus-sim (líneas B, aireación subpleural, deslizamiento por
región) se escribe una vez en TypeScript y se genera con ts2glsl, portado de EchoTwin con procedencia y
con tres ampliaciones pequeñas: prototipos al principio del bloque, `**` con exponente entero y
constantes de `Math`. La e2e de equivalencia sigue siendo el juez numérico.

**Consecuencias.** Conviven dos mecanismos, cada uno con su guarda. Al unir, lo generado se alinea con
EchoTwin y lo portado con VExUS.

**Verificación.** Se implementa con la primera física escalar propia (fase 2): prueba de que el archivo
generado está al día y de que cada identificador libre está declarado, y e2e de equivalencia.

## 9. Misión y objetivos medibles como criterio de prioridad

**Fecha.** 2026-09-26.

**Contexto.** Daniel dio libertad para modificar el proyecto y abrir e integrar PR «siguiendo la misión y
objetivos del simulador», y pidió que esa misión y esos objetivos quedaran definidos en la documentación
para guiarse por ellos. La guía (`docs/GUIDE.md` §0) tenía una misión, pero no objetivos con indicadores
ni una regla para decidir qué hacer primero.

**Opciones.** (a) Dejar la misión en la guía y priorizar caso a caso. (b) Un documento propio con
objetivos medibles y una regla de prioridad, al que remitan la guía, la hoja de ruta, la plantilla de PR
y la guía para agentes.

**Decisión.** (b): `docs/MISSION.md` con la misión, siete objetivos (fidelidad física, anatómica,
ecográfica y clínica, docencia, ingeniería y unión), su indicador y su meta para la versión 1.0, lo que
el simulador no es y el orden de prioridad (que no mienta; lo que un clínico notaría primero; lo que
desbloquea más objetivos; lo que abarata la unión). Cada PR declara qué objetivo mueve y cada fase
termina con una evaluación adversarial por objetivo, con nota sobre 7.

**Consecuencias.** La hoja de ruta indica qué objetivos mueve cada fase; el estado por objetivo se
actualiza al cerrar cada fase.

**Verificación.** `src/validation/docs.test.ts` exige que el README enlace `docs/MISSION.md` (la
prueba falló antes de añadir el enlace) y que los documentos solo citen archivos que existen; la
plantilla de PR pide el objetivo.

## 10. Fase 1, paso A: motor de VExUS portado con cortes quirúrgicos

**Fecha.** 2026-09-26.

**Contexto.** La fase 1 porta de VExUS el motor que forma la imagen (decisiones 2 y 3). Un análisis previo
del commit fijado (`vexus-sim@52354d5`) midió unas 17 000 líneas de motor, ~13 000 tras quitar lo abdominal,
con el renderizador y los shaders como la parte más cambiante del origen y la que más depende de su escena
(vasos, hígado, color). Encontró además que casi todas las pruebas de VExUS dependen de su escena abdominal,
de sus casos (`src/cases`) y de sus puntos de partida (`app/startPoints`): sus cifras miden el hígado, la cava
y el riñón. Portar todo de una vez daría una PR imposible de revisar y pruebas que no dicen nada del tórax.

**Opciones.** (a) Portar el motor entero, abdomen incluido, y recortar después: código muerto, pruebas
abdominales y un origen del que no se sabría qué sirve. (b) Portar en pasos, empezando por la física en
TypeScript que forma la imagen del tórax, con la misma ruta, los mismos nombres y las mismas firmas que en
VExUS y cortes quirúrgicos donde el tórax no necesita algo. (c) Reescribir un motor del tórax: pierde la
física de VExUS (pleura, pared, compresión) y la unión barata. Para las pruebas: (i) portarlas con sus cifras,
lo que exige la escena abdominal; (ii) portar el arnés y sustituir las cifras de la escena por medidas del
tórax o por invariantes físicas.

**Decisión.** (b) con (ii), en tres pasos: A (esta decisión) la física en TypeScript y sus pruebas; B la GPU
(renderizador, pasadas, shaders, esquema de uniforms, app y banco de fidelidad), que dará la primera imagen;
C la anatomía del tórax con las dimensiones de la base (metas A). En el paso A:

- **Idénticos** (32 archivos byte a byte: 22 de código y 10 de prueba y de apoyo): respiración y ritmo;
  tejidos, primitivas, compresión, deformación, pared y cortina pulmonar; contacto de la sonda; y en
  `src/ultrasound/` el receptor, el mapa de grises, el moteado anclado, el haz, el eco de interfaz, la textura
  de la pared, la pleura con su serie de reverberaciones y el deslizamiento, las miradas dirigidas, la
  transmisión, la apertura, la composición, la geometría del sector y el perfil del transductor. El enum de
  tejidos no cambia (solo se añade al final).
- **Adaptados**, con su fila en `docs/PROVENANCE.md`: el paciente (`src/physiology/patientState.ts`) es el
  núcleo que leen el ritmo, la respiración y la escena, con `defaultPatient()` (el núcleo del adulto sano de
  VExUS: 5 mmHg intraabdominales); el motor (`src/physiology/engine.ts`) es reloj → respiración → muestra →
  guarda NaN → historial, y su `PhysiologySample` es el núcleo (t, ECG, latido, respiración); la escena
  (`src/anatomy/scene.ts`) conserva `AnatomyScene` y sus firmas con el tronco, la pared en capas, las
  costillas derechas, el diafragma en dos cúpulas, la columna, la cortina y el pulmón, y quita el hígado, la
  vesícula, los riñones, los ligamentos, la aurícula, el árbol vascular y el gas intestinal; bajo el diafragma
  queda el tejido por defecto de la clasificación de VExUS, su «resto» (`abdomen-generic-tissue`). El
  `VesselCaliber` pasa a `SceneInstant` (el descenso del diafragma) y `caliberFor` a `instantFor`
  (`src/anatomy/query.ts`); `Classification.vessel`, `vesselHit` y `flowFactor` y `WorldQuery.bloodVelocity`
  y `flowBasis` se conservan con valor nulo para no romper la forma que leen los módulos de VExUS.
  `src/anatomy/interfaces.ts` pierde solo `interfaceOfVessel`; el registro de órganos, todo menos la pared y
  la cortina. La sonda (`src/probe/probe.ts`) pone la pose por omisión en el punto BLUE superior derecho
  aproximado (`BLUE_UPPER_POSE`, con su evidencia en `docs/APPROXIMATIONS.md`: ninguna fuente mapea los
  puntos BLUE a un espacio intercostal) y `clampPose` recorre los dos hemitórax.
- **Fuera** del paso A: la red venosa, la aurícula derecha y los vasos, el Doppler y el color, y todo lo que
  vive en la GPU o la app (se porta en el paso B, adaptado a la ausencia de vasos).
- **Pruebas**: se porta el arnés de VExUS de estos módulos (22 archivos de prueba y 5 de apoyo); las cifras de
  la escena abdominal se sustituyen por lo medido en vistas del tórax, con el margen explicado en cada prueba,
  y se quita lo que comprueba el shader ensamblado (vuelve en el paso B). Se añaden invariantes físicas propias
  (`src/validation/physicsInvariants.test.ts`: líneas A a múltiplos exactos de la profundidad de la pleura,
  energía conservada en una interfaz, la sonda que solo empuja, el deslizamiento con la fase del reloj único,
  misma semilla y mismo resultado) y las metas A-T1–A-T3 y A-T6–A-T11 de la base medidas sobre la escena
  heredada (`src/validation/anatomyTargets.test.ts`): las que aún no cumple son `it.fails` con el valor medido.
- **Por qué no se portan las cifras**: una cifra de VExUS mide su hígado, su cava o su riñón con sus puntos de
  partida; en el tórax no protegería nada, o protegería algo falso. Lo que protege al tórax son las leyes
  físicas, que valen en cualquier escena, y las medidas del propio tórax, que el paso C hará cumplir.

**Consecuencias.** Todavía no hay imagen (`no-image-yet`). La escena conserva las dimensiones de VExUS: la
pared del abdomen (pleura a 25–28 mm) y las costillas 5.ª–10.ª derechas, así que ocho de las nueve metas A de
la fase no se cumplen y quedan medidas; A-T6 (líneas A) sí. Los archivos idénticos se unirán sin más; los
adaptados, con la diferencia de su fila. El núcleo del paciente, la muestra fisiológica y el instante de la
escena son la propuesta de contrato común para la unión (`docs/UNIFICATION.md`). La cobertura queda en
92,8 % de sentencias, 88,4 % de ramas, 93,3 % de funciones y 94,2 % de líneas: por encima de los umbrales,
que no cambian. El origen ya avanzó después del commit fijado: sus decisiones 76 (ecos parásitos), 77
(armónica tisular: la pleura, el receptor, el haz, la composición y el perfil) y 79 (la respiración con PEEP y
la aurícula de lazo cerrado: el paciente, la respiración y el motor) tocan archivos portados; se revisará al
fijar el paso B.

**Verificación.** `src/validation/provenance.test.ts` y `npm run provenance -- --check` (la tabla dice lo que
es cada archivo); `src/validation/layers.test.ts` (las capas de VExUS, sin cambios en la matriz); las
invariantes de `src/validation/physicsInvariants.test.ts`, cada una comprobada con una mutación del código que
protege (descritas en la PR): las líneas A con el orden de la réplica y la profundidad de su perfil mutados;
la energía con el coeficiente de Fresnel y el lóbulo de Kirchhoff sin su normalización; la sonda con la piel
que tira y con un perfil que estira bajo la pared; el deslizamiento con el pulmón sin descender y con una
respiración de reloj propio; la semilla con el ritmo y el moteado de azar sin semilla. Todas fallaron con la
mutación y pasan sin ella.
