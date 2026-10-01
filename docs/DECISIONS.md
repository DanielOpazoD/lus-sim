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
  (`src/validation/physicsInvariants.test.ts`: líneas A a múltiplos exactos de la profundidad de la pleura y
  cada vez más débiles, energía conservada en una interfaz y ninguna cara que refleje más de lo que le llega, la
  pleura de A0 donde la clasificación sale de la pared, la sonda que solo empuja, el deslizamiento con la fase
  del reloj único, misma semilla y mismo resultado) y las metas A-T1–A-T3 y A-T6–A-T11 de la base medidas
  sobre la escena heredada (`src/validation/anatomyTargets.test.ts`): las que aún no cumple exigen fallar por
  su aserción (no por un error del código de medida) y llevan el valor medido.
- **Por qué no se portan las cifras**: una cifra de VExUS mide su hígado, su cava o su riñón con sus puntos de
  partida; en el tórax no protegería nada, o protegería algo falso. Lo que protege al tórax son las leyes
  físicas, que valen en cualquier escena, y las medidas del propio tórax, que el paso C hará cumplir.

**Consecuencias.** Todavía no hay imagen (`no-image-yet`). La escena conserva las dimensiones de VExUS: la
pared del abdomen (pleura a 25–28 mm) y las costillas 5.ª–10.ª derechas, así que ocho de las nueve metas A de
la fase no se cumplen y quedan medidas; A-T6 (líneas A) sí. Los archivos idénticos se unirán sin más; los
adaptados, con la diferencia de su fila. El núcleo del paciente, la muestra fisiológica y el instante de la
escena son la propuesta de contrato común para la unión (`docs/UNIFICATION.md`). La cobertura queda en
92,8 % de sentencias, 88,5 % de ramas, 93,3 % de funciones y 94,2 % de líneas: por encima de los umbrales,
que no cambian. El origen ya avanzó después del commit fijado: sus decisiones 76 (ecos parásitos), 77
(armónica tisular: la pleura, el receptor, el haz, la composición y el perfil) y 79 (la respiración con PEEP y
la aurícula de lazo cerrado: el paciente, la respiración y el motor) tocan archivos portados; se revisará al
fijar el paso B.

**Verificación.** `src/validation/provenance.test.ts` y `npm run provenance -- --check` (la tabla dice lo que
es cada archivo); `src/validation/layers.test.ts` (las capas de VExUS, sin cambios en la matriz); las
invariantes de `src/validation/physicsInvariants.test.ts`, cada una comprobada con una mutación del código que
protege (descritas en la PR): las líneas A con el orden de la réplica y la profundidad de su perfil mutados, y
crecientes con su orden; la energía con el coeficiente de Fresnel y el lóbulo de Kirchhoff sin su
normalización, la reflectividad ×1,1 y la ida y vuelta con R_t invertido; la pleura de A0 1 mm más honda; la
sonda con la piel que tira y con un perfil que estira bajo la pared; el deslizamiento con el pulmón sin
descender y con una respiración de reloj propio; la semilla con el ritmo y el moteado de azar sin semilla.
Todas fallaron con la mutación y pasan sin ella.

## 11. Nuevo origen fijado: VExUS 8e83d9a

**Fecha.** 2026-09-26.

**Contexto.** El paso A (decisión 10) copió el motor de `vexus-sim@52354d5`, y el origen siguió avanzando: su main,
`8e83d9a`, lleva once commits más. Son las decisiones 76 (ecos parásitos del modo fundamental: lóbulos laterales y
reverberación de la pared), 77 (armónica tisular), 78 (tríadas portales del hígado, con su prueba de paridad en la
e2e), 79 (aurícula de lazo cerrado en la media, con bolo, diurético y PEEP) y 80 (cine y modo M en la GPU), más el
renombrado de los identificadores del GLSL en el build, la pestaña Docente en su propio chunk (que saca los ganchos de
prueba del total del bundle), la tabla de brechas de su revisión anatómica, la licencia MIT y la misión de VExUS. `npm run provenance` marcaba 22 archivos portados con commits nuevos en
el origen (8 idénticos y 14 adaptados), y dos ya importaban módulos que lus-sim no tenía: el perfil del transductor
(`harmonic.ts`) y el gemelo de los ecos de interfaz (`clutter.ts`). Lo que más cambió es justo lo que porta el paso B:
el renderizador (398 líneas añadidas y 74 quitadas) y las pasadas (168 y 42).

**Opciones.** (a) Portar la GPU desde `52354d5` y volver a fijar después: el renderizador y las pasadas se fusionarían
dos veces, la segunda con las adaptaciones al tórax ya hechas. (b) Seguir la cabeza del origen en cada PR: no queda un
commit fijado que revisar y la tabla de procedencia deja de decir de dónde se copió cada archivo. (c) Partir el paso B
en dos: B1, una PR propia y acotada que vuelve a fijar el origen y pone al día lo ya portado, sin GPU; B2, la GPU y la
app desde el origen nuevo.

**Decisión.** (c). En B1:

- **Idénticos que cambiaron en el origen** (8): se copian de `8e83d9a`. La respiración (la PEEP sube la pleural un 40 %
  también con respiración espontánea, como una CPAP, y la PEEP vigente es un campo del modelo que puede cambiar en
  marcha), el receptor (el uniform de la ganancia del transitorio), el haz (λ y escala de emisión), la pleura (σ
  elevacional en armónica), la composición (la armónica reinicia el anillo de miradas), el perfil del transductor
  (`bmodeBeam`) y el gemelo de los ecos de interfaz con su prueba (el núcleo lateral lleva el pedestal de lóbulos
  laterales; el umbral de M3 de la porta baja de 1,40 a 1,39 en el origen). En fundamental, el haz y la elevación son
  los de antes bit a bit.
- **Adaptados que cambiaron en el origen** (14): fusión a tres bandas con `git merge-file` (base `52354d5`, lus-sim,
  origen `8e83d9a`), conservando lo propio de lus-sim. Se trae: a la prueba del receptor, el núcleo lateral con pedestal;
  a la de la composición, el reinicio por la armónica; a la de la fisiología, la CPAP y la PEEP que cambia en marcha
  sobre el modelo respiratorio; al presupuesto del bundle, que los chunks de solo pruebas (`testHooks`) no cuenten en el
  total (aún no hay ninguno: llegan con la app); a `CONTRIBUTING.md`, una sección de misión que remite a
  `docs/MISSION.md`. No se trae: el lazo cerrado y sus intervenciones en el motor y en el paciente (`circulation.ts` del
  origen lee la red venosa y la aurícula derecha, que lus-sim no porta), lo que comprueba los programas ensamblados de
  las pasadas en las pruebas del receptor, del eco de interfaz y de la rama dirigida, la sección «Objetivo de la misión»
  de la plantilla de PR y el párrafo inicial de la guía para agentes (lus-sim ya tiene las suyas, decisión 9) y el
  comentario del minificador de GLSL en `vite.config.ts` (aún no hay shaders). Al quitar el lazo, el motor sí necesita
  una línea propia: la respiración idéntica copia la PEEP al construirse y en VExUS se la vuelve a pasar el lazo en cada
  paso (la del paciente, si no hay intervención); sin ella la PEEP quedaba fija desde la construcción aunque el paciente
  cambiara (lo halló la revisión), así que el motor de lus-sim le pasa en cada paso la del paciente. Seis adaptados
  quedan como estaban (las propiedades, la rama dirigida, el eco de interfaz, la plantilla de PR, la guía para agentes y
  la configuración de Vite): todo lo que el origen cambió en ellos cae en lo que lus-sim había quitado o ya tenía.
- **Módulos nuevos**, idénticos: `src/ultrasound/harmonic.ts` (decisión 77 del origen: haz armónico, acumulación del
  campo cercano, transitorio rechazado y ruido) y `src/ultrasound/clutter.ts` (decisión 76: pedestal de lóbulos laterales
  con su pantalla de fase antisimétrica y réplicas de reverberación de la pared). Sus pruebas se portan adaptadas
  (`src/validation/harmonic.test.ts`, `src/validation/clutter.test.ts`): el arnés en TypeScript y las cadenas GLSL de
  los módulos portados (la tabla de la pantalla de fase, el uniform del transitorio y, propia de lus-sim, la fórmula de
  la acumulación, que en VExUS solo comprueba la e2e), sin los programas ensamblados, el comando del equipo ni el
  renderizador sobre WebGL falso, que vuelven en B2. Sus cifras son del haz y del modelo, no de la escena abdominal:
  no hay nada que medir en el tórax en su lugar.
- **No se porta**: las tríadas portales de 78 (`portalTriads.ts`, textura del hígado; ningún archivo portado lo
  importa); el lazo cerrado y las intervenciones de 79; el cine y el modo M de 80 (`cine.ts`, `mmode.ts` y su
  interfaz, que son GPU y app: B2 o fase 2); el renombrado de identificadores del GLSL (`glslMangle.ts`, segunda etapa
  del minificador: entra con los shaders en B2, y el presupuesto del bundle se fija entonces con su medida); la licencia
  y la misión de VExUS (lus-sim tiene las suyas).
- **Limitaciones**: se heredan con su id `no-sidelobes` (desde 76, lóbulos laterales simplificados, sin lóbulos de
  rejilla ni en elevación) y `harmonic-simplified` (77). No entran las de 78, 79 y 80 (`portal-triads-diffuse`,
  `mean-closed-loop`, `no-autonomic-reflexes`, `m-mode-frame-rate`, `m-mode-lumen-blooming`), cuyo código no se porta,
  y no hay nada que quitar: `peep-no-hemodynamic-effect`, que el origen retira, nunca estuvo en lus-sim.

**Consecuencias.** Todas las filas de vexus-sim quedan en `8e83d9a` y `npm run provenance` dice «origen sin cambios» en
cada una. Sigue sin haber imagen. En la física en TypeScript solo cambian la PEEP con respiración espontánea (el
paciente por omisión tiene PEEP 0: ninguna cifra de lus-sim se mueve) y el gemelo de los ecos de interfaz, que ahora
lleva el pedestal: la línea pleural de A-T11, medida con él, sigue en 0,70 mm de 15 a 60 mm (el pedestal es lateral y
no ensancha el eco en profundidad), y el transitorio omitido del receptor sigue dentro de sus cotas. Para B2:

- VExUS arranca en armónica, como un preajuste abdominal moderno. El preajuste pulmonar de lus-sim debe arrancar en
  fundamental (armónicos apagados, [@volpicelli-actualizacion-2026]), y la meta F-T24 (fase 2) pide que la armónica baje
  el contraste de las líneas B, algo que el modelo de 77 no hace (`harmonic-simplified`).
- Las réplicas de reverberación de la pared toman como fuente las caras fuertes hasta 3 mm bajo la cara interna de la
  pared, que en el tórax es la pleura: sus réplicas caen a W y 2W bajo ella (W, el grosor de la pared, es casi la
  profundidad de la pleura), junto a las líneas A que la serie de reverberaciones ya forma. VExUS estima esa doble
  cuenta bajo su cortina en unos −40 dB, sin medirla; B2 la mide en el tórax, con pleura en todo el campo, empezando por
  el gemelo de la pleura con `reverbGains`.
- Los gemelos de la pleura y de la composición (idénticos) siguen con la pasada D gaussiana de ±14 líneas, sin el
  pedestal que la pasada D lleva desde la decisión 76 del origen, y la cabecera del de la pleura dice que filtra como el
  de los ecos de interfaz, que sí lo lleva. A la vez, la cabecera de este y la prueba del receptor siguen diciendo ±14,
  y su núcleo llega ahora a ±40. Con el pedestal, el gemelo de la pleura cambia poco (medido: neblina 64,67 → 64,52 de
  gris, línea A2 sobre la neblina +44,67 → +44,60 dB, deslizamiento −7,24 → −7,28 dB). Se ofrece al origen corregir esas
  cabeceras y llevar el pedestal a los gemelos.
- El modo M de la decisión 80 del origen es la base del modo M pulmonar (fase 2): en cada cuadro la GPU copia la línea
  M de la envolvente del modo B, formada en su instante con el reloj único, a una franja en anillo que no vuelve a la
  CPU. Es lo que pide la hoja de ruta (cada columna en su instante, no desde una caché por fase), con una salvedad: la
  columna sale de la envolvente compuesta, así que con la composición espacial es la media de los tres últimos
  cuadros; el preajuste pulmonar la apaga (base de conocimiento, preajuste de 2026). Su cadencia (una columna por
  cuadro de imagen, `m-mode-frame-rate` en VExUS) se medirá en la fase 2 contra la orilla de mar y el código de barras;
  hasta entonces no se porta.
- B2 parte de `8e83d9a`. Si el origen vuelve a avanzar sobre lo portado, se vuelve a fijar con este mismo procedimiento.

**Verificación.** `npm run provenance -- --check` en verde, con «origen sin cambios» en las 89 filas de vexus-sim, y
`src/validation/provenance.test.ts` (la tabla dice la verdad frente al origen). La guarda de limitaciones falló
(«LIMITATIONS.md no cita `no-sidelobes`») hasta añadir las dos heredadas a `docs/LIMITATIONS.md`. Las pruebas traídas
del origen se comprobaron con una mutación en lus-sim, y todas fallaron con ella: la respiración de `52354d5` (sin CPAP)
en la de la fisiología, el anillo que no reinicia con la armónica en la de la composición, el haz armónico sin el ÷√2
de la fuente en la de la armónica y la pantalla de fase sin antisimetría en la de los ecos parásitos (esta rompe
también el reflector continuo: 10,7 % en lugar de ≤ 0,5 %). A-T11 se midió antes y después con el gemelo: 0,70 mm a 15,
20, 30, 40 y 60 mm en los dos. Revisión adversarial de contexto limpio: halló que el motor dejaba fija la PEEP desde la
construcción (ahora la toma del paciente en cada paso; la prueba nueva, que pasa por el motor, falla sin esa línea:
−4,67 frente a −1,73 mmHg), que la prueba de la armónica había perdido la aserción del uniform del transitorio (vuelve,
con la fórmula de la acumulación: borrar el uniform o cambiar la fórmula la hacen fallar), que la doble cuenta de
−40 dB es una estimación de VExUS y no una medida, la salvedad de la composición en el modo M y las cabeceras de los
gemelos; todo está corregido o anotado arriba.

## 12. Fase 1, paso B2a: la formación de imagen en la GPU y su equivalencia con TypeScript

**Fecha.** 2026-09-26.

**Contexto.** El paso B2 (decisiones 10 y 11) trae de `vexus-sim@8e83d9a` la GPU y la app: la primera imagen. Es la
parte del origen que más depende de su escena: la clasificación GLSL recorre tubos, aurícula, vesícula, riñones, hígado,
ligamentos y gas antes de su «resto» (`anatomy.glsl.ts`, 643 líneas); el renderizador (1858) y las pasadas (1380) llevan
el color, los tubos y los calibres; el equipo arranca en un preajuste abdominal (18 cm, foco a 90 mm, persistencia 0,35,
composición y armónica encendidas) y la compensación nominal de la atenuación es la del hígado. Los ganchos de prueba
(1465 líneas) miden el hígado, el color y el PW. Con la interfaz y la raíz de composición, una sola PR pasaría de
100 archivos, y lo que hay que revisar con más cuidado —que la anatomía GLSL sea la de TypeScript y que la imagen
tenga la física que dicen las pruebas en TS— quedaría mezclado con botones.

**Opciones.** (a) Una PR con todo B2. (b) Dos PR encadenadas: B2a, la GPU con su equivalencia TS ↔ GLSL y un banco
de la e2e sin interfaz; B2b, la app, la interfaz y la imagen a la vista. (c) Reescribir el GLSL con ts2glsl: la
decisión 8 lo reserva para la física propia; lo portado conserva sus gemelos a mano. Para el equipo: (i) el preajuste
de VExUS; (ii) el pulmonar del consenso de 2026. Para la compensación nominal: (i) la del hígado de VExUS
(0,601 dB/cm/MHz); (ii) una de referencia del tórax.

**Decisión.** (b), con (ii) y (ii). En B2a (`docs/PROVENANCE.md`, sección del paso B2a):

- **GPU.** Idénticos: `gl.ts`, `gpuTimer.ts`, el cine y el modo M (`cine.ts`, `mmode.ts`, decisión 80 del origen), el
  minificador y el renombrado del GLSL en el build (`tools/build/glslMinify.ts`, `tools/build/glslMangle.ts`).
  Adaptados: el grafo de pasadas sin la de color (F); las pasadas sin el color, la textura del «resto» ni las tríadas
  portales, y lo demás idéntico (A0–A, B de las dos miradas, C, D, K, G, persistencia, presentación, cine y franja M);
  el renderizador sin color, tubos ni calibres (la textura de escena lleva solo la tabla de la compresión); la
  anatomía GLSL con la escena del paso A **en el mismo orden de clasificación que VExUS** (pared → costillas → columna
  → cortina → cúpula → «resto»), y los uniforms del tórax en el orden de su esquema.
- **App que la e2e necesita.** El equipo solo en modo B, el simulador sin el PW, el audio ni la cadencia del color,
  los puntos de partida del protocolo BLUE derecho (el superior es la pose del paso A; el inferior y el PLAPS, estimados
  con `defineParameters` y su fila en `docs/APPROXIMATIONS.md`), el barrido de equivalencia con la pleura de A0 frente
  a su gemelo (`pleuraEquivalence`, propia), el moteado sobre el músculo de la pared y un subconjunto de los ganchos
  (`window.__lusTest`). `src/main.ts` monta el simulador fuera de la vista solo con `?e2e`; la página sigue siendo la
  de la fase 0 hasta B2b (decisión 13).
- **Preajuste pulmonar** (`src/ultrasound/lungPreset.ts`), el del consenso de 2026 «si el equipo lo permite»
  [@volpicelli-actualizacion-2026]: un solo foco a la altura de la línea pleural (25 mm, derivado: la pleura del punto
  BLUE superior, que `lungPreset.test.ts` vuelve a medir), armónica y composición apagadas, profundidad 12 cm (el extremo
  alto de ≤ 10–12 cm con la convexa: caben las líneas A de orden 2 a 4) y ganancia creciente hacia el campo lejano; la
  persistencia en 0 (los filtros de promediado ocultan un deslizamiento sutil [@volpicelli-consenso-2012]
  [@lichtenstein-luci-2014]; ICLUS pide imagen sin filtros cosméticos [@soldati-covid-2020]). El rango dinámico es el
  de VExUS (70 dB): el consenso no lo fija.
- **Compensación nominal** (`TGC_REFERENCE`): 2·α·f con α = 0,5 dB/cm/MHz, la pendiente de TGC de referencia de la
  simulación validada de Ostras y cols. sobre la pared del Visible Human [@ostras-histopatologia-2023], entre la grasa
  y el músculo de la tabla de tejidos. El nivel de referencia de la presentación (`DISPLAY_REF_DB`, −33 dB) es el de
  VExUS; su tejido de referencia en el tórax es el músculo de la pared.
- **Pruebas.** Unitarias portadas con el arnés y las cifras del tórax (esquema de uniforms, límites de los
  shaders, grafo de pasadas, renderizador sobre WebGL falso con la composición, coste del cuadro, minificador y
  renombrado, equipo, registro de errores, barrido y comprobación de la equivalencia, moteado, paridad de la rama
  dirigida, cine y modo M, puntos de partida) y el preajuste (`lungPreset.test.ts`). En la e2e
  (`e2e/imagen.spec.ts`, Chromium con SwiftShader): la equivalencia TS ↔ GLSL (los tres planos de partida; 50 000
  puntos del tórax, exactos en tejido y cara lejos de las interfaces; la cáscara de las caras de la pared, las
  costillas y la pleura; la pleura de A0 línea a línea; las normales; la transmisión de la pasada A), la
  estadística de Rayleigh del moteado del músculo de la pared y las líneas A sobre la envolvente de la GPU (su
  separación y F-T01 frente a la línea pleural mostrada).

**Consecuencias.**

- La GPU forma la imagen del tórax, pero solo el banco de la e2e la ve: `no-image-yet` sigue hasta B2b. Con GPU real
  (Apple M4) y con SwiftShader, las dos anatomías coinciden en el 100 % de los 43 797 puntos interiores y de los 13 870
  junto a una cara, a 2·10⁻⁵ mm (GPU) y 0,014 mm (SwiftShader) en la distancia a la cara; la pleura de A0 cae en el
  mismo sitio en las 576 líneas de los tres puntos (SwiftShader: una decisión de la bisección en una línea la mueve su
  paso final, 0,0117 mm); la transmisión de la pasada A, a 3·10⁻⁵ dB; la distancia al borde del tejido, la que funde
  los bordes en la pasada B, a 1·10⁻⁴ mm (GPU) y 0,014 mm (SwiftShader) hasta 10 mm, lo que puede importar. Lo mismo
  en inspiración máxima (el diafragma 30 mm más abajo).
- **El foco del preajuste y el paso C.** `EQUIPMENT_LIMITS.focusMm.min` (20 mm, de VExUS) recortará el foco en la
  pleura cuando el paso C la lleve a los 12–20 mm de la base: el paso C debe bajar ese límite con su medida.
- **Líneas A: la separación sí, F-T01 todavía no.** Promediando cada grupo de 8 líneas alineadas en su pleura (la
  métrica A1 del banco de referencia), los órdenes 1–4 están en todos los grupos de los tres puntos, a −0,42…−0,25 mm
  de k·D (D, el cruce de la pleura del gemelo de A0), y la separación entre órdenes a ≤ 0,084 mm de D (igual en GPU y
  SwiftShader): cada rebote añade un viaje. Pero toda la serie, la línea pleural incluida, se dibuja 0,35 mm por encima
  de su cruce: la cara de la pleura parietal es de un lado (`IF_PLEURA_WALL`, decisión 61 del origen) y su perfil se
  desplaza 2,5σh dentro de su dueña, la pared. F-T01 se mide frente a la línea pleural **mostrada** (r_k = k·r_pl), y
  ahí el error crece con el orden, 0,35·(k − 1): el orden 2 a +0,27…+0,39 mm (cumple), el 3 a +0,56…+0,76 y el 4 a
  +0,87…+1,13 (no cumplen: la tolerancia es 0,5 mm y un píxel mide 0,257 mm). La revisión lo halló: la primera versión
  de la prueba medía frente a D, con la que el shader coloca las réplicas, y era casi circular. Queda declarado
  (`pleura-echo-offset`) y la prueba exige el fallo con su tamaño, como las metas A que aún no se cumplen: cuando se
  corrija, fallará y habrá que exigir la meta y borrar la limitación. Es una invariante del cierre de la fase 1
  (`docs/ROADMAP.md`): la fase no cierra sin esto. Opciones para una decisión propia (con su revisión, y ofrecida al
  origen): (a) dibujar la serie centrada en k·D en la rama del pulmón de la pasada B, que ya dibuja los dos lados del
  eco (el desplazamiento solo sirve cuando un lado no conoce la cara), con sus gemelos; (b) hacer de dos lados la cara
  de la pleura, que cambia también el lado de la pared; (c) desplazar las réplicas a k·(D − 0,35), que casa la imagen
  con la meta pero no con la geometría.
- **Moteado.** En el músculo paraesternal (una sola capa de ~7 mm; en la lateral, los planos intermusculares cada
  ~2,5 mm no dejan sitio a un parche de 16 × 8), 51 parches de cinco vistas dan SNR 1,91–2,14 por vista y 2,07 de media
  ponderada (Rayleigh: 1,91; la banda de la prueba, 1,6–2,25).
- **Grises con el preajuste** (GPU real, medianas de los píxeles de la imagen mostrada clasificados por su tejido en los
  tres puntos; la cifra depende de cuánto se aparte de las interfaces, así que se da el rango de los dos métodos que se
  probaron, todos los píxeles o solo los que están a ≥ 1 mm de un cambio de tejido): músculo de la pared 83–101, grasa
  63–74, la línea pleural saturada (255) en todas las líneas fuera de las sombras costales, la neblina entre la pleura y
  la primera línea A 27–70 según la línea, y el «resto» bajo la cúpula 0–8.
- **Doble cuenta de la reverberación de la pared** (lo que la decisión 11 dejó para aquí), medida anulando las
  ganancias de `uReverb` con la misma semilla: la réplica de la línea pleural cae a W = 28 mm bajo ella y la línea A de
  orden 2 a D = 25–29 mm. En las 440 de 576 líneas donde |W − D| ≤ 1,5 mm queda dentro de la línea A, 27–31 dB por
  debajo, y el perfil promedio cambia 0,02 dB; en las centrales del punto superior (D ≈ 25,2–26,5 mm) queda 1,5–2,8 mm
  por debajo, 44 dB bajo la línea A y 9 dB bajo la neblina media: sube 3,2 dB el fondo oscuro que sigue a la línea A.
  Se anota en `no-sidelobes`.
- La cobertura queda en 94,6 % de sentencias, 88,6 % de ramas, 94,6 % de funciones y 95,8 % de líneas. Hubo que
  arreglar una prueba portada: `glslMangle.test.ts` evalúa en memoria el fuente transformado con la ruta real como nombre
  y la cobertura v8 de vitest lo mezclaba con el módulo (steering.ts caía al 63 %); ahora lleva un nombre que no es ruta
  (mejora para el origen). El chunk principal sube a 148,5 kB y su presupuesto, a 160 kB.

**Verificación.** `npm run check` y `npm run e2e` en verde. Cada guarda de la e2e se comprobó con una mutación que la
hace fallar: la serie a k·D·1,01 y con 0,3 mm más por orden (líneas A), la serie en su cruce sin la desviación declarada
(la prueba fija la desviación), la cúpula clasificada antes que la columna en el GLSL (planos: «Vertebra→Lung ×108»),
las costillas 0,3 mm más anchas solo en la GPU (caras), la pared sin distancia al borde (`c.bd = 1000`: 9 mm de
error), la normal de las caras de la pared cambiada por la del tronco con la misma norma (p05 = 0,994), el descenso del
diafragma con el signo cambiado (en inspiración, acuerdo de tejido 0,90 y de los planos 0,70–0,77) y la envolvente
detectada en intensidad (moteado: SNR 1,13). Revisión adversarial de contexto limpio: halló que la prueba de F-T01
medía frente a D y no frente a la línea mostrada (ahora exige el fallo conocido con su tamaño), que sin
`OES_texture_float_linear` la imagen salía negra sin ningún error (ahora el renderizador lo exige y lo dice), que la
distancia al borde del tejido no se comparaba y que la equivalencia solo se probaba en reposo (ahora ambas), un uniform
muerto (`uRespVel`, fuera), una guarda de las normales demasiado floja (0,98 → 0,9999), cifras de grises no
reproducibles (ahora con su método y su rango), omisiones de procedencia y citas incompletas del punto BLUE inferior;
todo está corregido o anotado arriba.

## 13. Fase 1, paso B2b: la aplicación y una interfaz mínima del modo B

**Fecha.** 2026-09-26.

**Contexto.** El paso B2a (decisión 12) deja la imagen del tórax formada en la GPU e igual a la de TypeScript, pero solo
la ve el banco de la e2e. La interfaz de VExUS (`vexus-sim@8e83d9a`) es la de un simulador abdominal con Doppler:
casos y modo alumno ciego, modos 2D, M, color, PW y tríplex, pestañas Doppler, Medir y Docente, audio, cine, franja M,
un navegador 3D con three.js (≈ 560 kB, con las mallas del hígado, los vasos y el riñón) y un corte calculado en un
Worker. La hoja de ruta cierra la fase 1 con una imagen que un clínico reconozca (línea pleural, líneas A, sombra
costal y deslizamiento) y la sonda libre.

**Opciones.** (a) Portar la interfaz entera y esconder lo abdominal: código muerto y un navegador 3D sin mallas del
tórax. (b) Portar lo mínimo para explorar en modo B: el lienzo, la entrada de la sonda (ratón, trackpad, teclado y
táctil), los mandos del equipo, el HUD, los atajos, la pérdida del contexto WebGL, el aviso y la raíz de composición;
lo demás, cuando llegue lo que lo necesita. (c) Una interfaz nueva: pierde la unión barata (decisión 1).

**Decisión.** (b) (`docs/PROVENANCE.md`, sección del paso B2b). Idénticos: la animación hacia un punto de partida, el
presupuesto de errores del bucle, la entrada de la sonda, las fábricas de controles, los plegables, el aviso, la
pérdida de GPU y el cine al congelar (decisión 80 de VExUS: el deslizador, ← → y la rueda recorren los cuadros
guardados, y el HUD dice los ajustes del cuadro que se ve). Adaptados: la raíz de composición (`src/main.ts`), `index.html` y la hoja de estilos sin la marca ni
lo abdominal; la sesión sin casos (el paciente por omisión y «Reiniciar paciente»); el estado de la UI (la
congelación); el informe técnico exportable (`lus-diagnostico/1`); el HUD, los atajos (Espacio, [ ], − +), la
superposición (regla de profundidad, marcador y foco), la consola de una pestaña (imagen, sonda, respiración y
avanzado, con la TGC de 8 bandas) y las tarjetas de los puntos de partida BLUE. La aplicación arranca en el punto BLUE
superior con el preajuste pulmonar; con `?e2e` expone los ganchos sobre su simulador vivo, y el banco oculto del
paso B2a desaparece. Con la imagen congelada nada mueve la sonda (ni el ratón ni sus deslizadores, las tarjetas o la
animación hacia un punto de partida), y si se reinicia el paciente o se recupera la GPU la imagen congelada, que era
del simulador o del renderizador anterior, deja paso a la imagen en vivo con un aviso. Sin la pestaña Docente de
VExUS, el registro de errores va también a la consola, donde la e2e lo vigila. En un teléfono las columnas se apilan.
No se portan: los casos, el Doppler, el audio, el modo M (la franja sigue en el renderizador:
el modo M pulmonar es de la fase 2), la medición, el modo docente, el navegador 3D y el corte. Nueva
limitación `ui-minimal`; `no-image-yet` se borra en este cambio.

**Consecuencias.**

- Primera imagen a la vista (capturas con GPU real en la descripción de la PR, fuera del repo): en el punto BLUE superior,
  la pared en capas, la línea pleural a 2,5 cm y las líneas A a 5, 7,5 y 10 cm, sin costillas (`ribs-5-10-only`); en el
  BLUE inferior y el PLAPS, las corticales costales con su sombra y la línea pleural entre ellas (el signo del
  murciélago). El deslizamiento se ve en un modo M hecho con la columna central de la imagen cuadro a cuadro: bajo la
  pleura el patrón cambia con cada ciclo respiratorio y en apnea queda en líneas horizontales, como la pared.
- 60 cuadros/s con GPU real (Apple M4) a 1280 × 800. El chunk principal sube de 148,4 a 172,5 kB (la interfaz, ≈ 23 kB)
  y su presupuesto, de 160 a 180 kB; la hoja de estilos va aparte (9,4 kB).
- El alumno mueve la sonda sin ver el tórax: los puntos de partida la dejan cerca de cada ventana (guía §7) y el HUD y
  la consola dicen la pose, la profundidad y el acoplamiento; las tarjetas dicen el lugar, no el hallazgo, que sale del
  paciente (guía §5). El navegador 3D necesita las mallas del tórax (paso C o fase 3); el modo M y la medición, sus
  observables (fase 2).
- Mejoras que se ofrecen al origen: el HUD con los ajustes del cuadro mostrado, la congelación que bloquea todos los
  caminos de la sonda, la recuperación de la GPU sin los ~90 avisos de WebGL, las teclas con modificador y Espacio
  sobre un botón fuera de los atajos, y `role=alert` en el aviso.

**Verificación.** `npm run check` y `npm run e2e` en verde. El humo (`e2e/smoke.spec.ts`) mira la imagen en la pantalla
(una captura del lienzo, no un búfer de la GPU) y comprueba el arranque con la línea pleural y el aviso, los mandos por
teclado y consola con el HUD, congelar (el reloj se detiene; el cine dibuja cuadros anteriores; el HUD dice los del
cuadro que se ve, también dos cuadros después de cambiar la profundidad; cambiar el tamaño de la ventana no deja el
lienzo negro; la sonda no se mueve ni arrastrando ni con sus mandos ni con una tarjeta), la sonda por arrastre y por
una tarjeta, «Reiniciar paciente» y el informe técnico, y la pérdida del contexto WebGL con la imagen congelada; un
error del registro o un aviso de WebGL inválido en la consola la hacen fallar. Cada prueba se comprobó con una
mutación que la hace fallar: la GPU que no se reconstruye tras la pérdida, la presentación que no llega al lienzo
(máximo 183 de gris: el HUD), la presentación 57 dB más oscura, el atajo ] sin efecto, la congelación que no llega al
simulador, el cine que no dibuja, el HUD con los ajustes del equipo, la sonda sin sus dos guardas de la congelación,
las tarjetas sin bloquear, la tarjeta que no anima la sonda, un error en el bucle y la recuperación que deja la imagen
congelada. Las unitarias (`src/validation/controllers.test.ts`, `src/validation/startPointCards.test.ts`,
`src/validation/uiInput.test.ts`) prueban el HUD, el informe, las tarjetas, el estado de la UI, la animación, los
atajos (con modificadores, Espacio sobre un botón y un campo de texto) y la entrada de la sonda sin DOM (también un
arrastre empezado antes de congelar). Revisión adversarial de contexto limpio: halló que el humo miraba un búfer de la
GPU y no la pantalla, que la prueba del cine pasaba sin que el cine dibujara y la del HUD antes de que se repintara,
que con la imagen congelada los deslizadores, las tarjetas y la animación movían la sonda, que perder la GPU o
reiniciar el paciente con la imagen congelada dejaba el lienzo negro, que los errores del bucle no se veían, los
avisos de WebGL al recuperar la GPU, los atajos con modificadores, el diseño de teléfono, los rótulos que prometían
hallazgos y omisiones de procedencia; todo está corregido o anotado arriba.

## 14. Nuevo origen fijado: VExUS c6c81ad

**Fecha.** 2026-09-26.

**Contexto.** El origen avanzó de `8e83d9a` (decisión 11) a `c6c81ad` con cuatro commits: la ronda 3 de su juez ciego
(#99, solo documentos que lus-sim no porta), la tercera etapa del minificado del GLSL en el build (#100: quita los espacios
y los saltos de línea que no separan nada, con dos léxicos que deben leer igual lo pegado), su decisión 81 (el
retroperitoneo: psoas, cuadrado lumbar y grasa retroperitoneal, y la línea de Morison una sola) y su decisión 82 (casos
trampa y contexto clínico). `npm run provenance` marcaba 24 filas con commits nuevos en el origen (4 idénticas y 20
adaptadas), y dos idénticas ya pedían código que lus-sim no tenía: la pleura (`pleura.ts`) llama a `fieldForBase`, que la
decisión 81 del origen separa en las pasadas, y el minificador (`glslMinify.ts`) importa `glslCompact.ts`.

**Opciones.** (a) Quedarse en `8e83d9a` hasta el paso C: la deriva crece y la pleura, la pieza más delicada del motor, se
aleja del origen justo antes de cambiarla (decisión 15). (b) Volver a fijar con el procedimiento de la decisión 11: lo
idéntico se copia; lo adaptado se fusiona a tres bandas (base `8e83d9a`, lus-sim, origen `c6c81ad`); nada del abdomen ni
de los casos. (c) Seguir la cabeza del origen: descartado en la decisión 11.

**Decisión.** (b).

- **Idénticos que cambiaron en el origen** (4), copiados de `c6c81ad`: la tabla de tejidos (tres tejidos nuevos al final
  del enum, psoas 27, cuadrado lumbar 28 y grasa retroperitoneal 29: ningún índice se mueve, nada del tórax los clasifica
  y las tablas por tejido de la GPU pasan de 7 a 8 vec4), la pleura (la pared que copia la serie usa `fieldForBase`), `gl.ts`
  (`fragmentOutputCount` reconoce una `out` global tras `;` o `}`, porque la tercera etapa junta las líneas) y el
  minificador con su tercera etapa.
- **Nuevos**: `tools/build/glslCompact.ts`, idéntico; `src/validation/support/shaderGraph.ts`, el grafo de módulos en
  memoria que el origen saca de la prueba del renombrado, adaptado con el nombre que no es ruta de la decisión 12 (sin él
  la cobertura v8 vuelve a mezclar el fuente evaluado con el módulo real); `src/validation/glslCompact.test.ts`, adaptado
  con los umbrales del tórax (15 módulos con GLSL y 19 programas; 27 946 caracteres ahorrados frente a los > 50 000 de
  VExUS, que tiene el color y el abdomen).
- **Adaptados** (20 con cambios en el origen). Se trae: el comentario del plugin en `vite.config.ts`; el de Morison en
  `interfaces.ts` (una constante que lus-sim conserva); `TISSUE_COUNT` = 30 en `wall.test.ts`; la tercera etapa y el
  grafo compartido en `glslMangle.test.ts`; en las pasadas, `fieldFor` y `fieldForPh` sobre su base (`fieldForBase`,
  `fieldForPhBase`), una sola llamada en `sampleSide` y `sampleSidePh` y la lista del `hetGain` del origen, pero sin la
  textura del retroperitoneo (`retroTexture`): en lus-sim `fieldFor` es su base; la suma de los puntos por tejido igual a
  los interiores en `equivalenceSweep.test.ts` (lus-sim ya tenía `byTissue` en el barrido); la medida propia en el
  presupuesto del bundle, y el recuento de ranuras de la pasada B en `shaderLimits.test.ts` (85 y 87, antes 83 y 85; el
  comentario decía 84 y 86 desde que la revisión de la decisión 12 quitó `uRespVel`). Quedan como estaban los otros 13:
  todo lo que el origen cambió en ellos es el retroperitoneo (la escena, la anatomía GLSL, el registro de órganos, las
  pruebas de la anatomía, de las caras y del punto renal, la guarda de `fascicleSeptum` en un bucle) o los casos (las
  capas, la hoja de estilos, el panel, el humo). La dependencia `cases → vexus` de la decisión 82 no se trae: lus-sim no
  tiene casos; su análogo (`cases → lus`) se decidirá con ellos (fase 4).
- **Limitaciones**: ninguna nueva ni quitada. No se heredan `simplified-retroperitoneum` (81) ni las doce de los casos
  trampa (82), cuyo código no se porta.

**Consecuencias.** Las 154 filas de vexus-sim (151 y las 3 nuevas) quedan en `c6c81ad`. El chunk principal baja de 172,5
a 163,5 kB (176 622 → 167 443 B) con la tercera etapa. La imagen no cambia: la base de `fieldFor` es la función de antes,
los tejidos nuevos no los clasifica nada y la tercera etapa deja los mismos tokens en cada programa (lo exige su
prueba); las cifras de la e2e de la imagen (equivalencia, moteado, líneas A) son las de la decisión 12. Mientras se hacía
este cambio el origen volvió a avanzar: `99ed6d5` (su decisión 83, ventanas epigástrica y subcostal) toca diez filas
(la animación hacia un punto de partida, idéntica; los puntos de partida, la entrada de la sonda, las tarjetas, la hoja de
estilos, las limitaciones y las pruebas de la compresión, de los puntos de partida, de las tarjetas y el humo). Trae dos
mejoras genéricas que interesan a lus-sim (la animación por el arco corto también en basculación, inclinación y
separación; Intro en una tarjeta ya no cancela el deslizamiento): quedan para el próximo fijado, con este mismo
procedimiento.

**Verificación.** `npm run provenance -- --check` con el origen en `c6c81ad` (un clon local sin copia de trabajo con
`origin/main` en ese commit, `VEXUS_DIR`): «origen sin cambios» en las 154 filas y la tabla dice lo que es cada archivo;
contra el origen vivo, las diez de la decisión 83 marcan un commit nuevo. `npm run check` y `npm run e2e` en verde. La
prueba de la tercera etapa se comprobó en lus-sim con una mutación: con la etapa que nunca deja el espacio entre dos
trozos de código fallan 11 de sus 13 pruebas, entre ellas la de los 19 programas del tórax («mismos tokens» con los dos
léxicos).

## 15. Líneas A a múltiplos exactos de la línea pleural mostrada (F-T01)

**Fecha.** 2026-09-26.

**Contexto.** La decisión 12 midió que toda la serie de la pleura, la línea pleural incluida, se dibujaba 0,35 mm por
encima de su cruce D: la cara de la pleura parietal (`IF_PLEURA_WALL`) es de un lado (la pared es su dueña, decisión 61
de VExUS) e `interfaceProfileEcho` desplaza su perfil 2,5σh dentro de la dueña. La separación entre órdenes era exacta,
pero la meta F-T01 de la base se mide frente a la línea pleural **mostrada** (r_k = k·r_pl) y ahí el error crecía
0,35·(k − 1). Medido de nuevo antes de este cambio, con la misma herramienta (`aLines`: la envolvente de la GPU en grupos de
8 líneas alineadas en su pleura, los tres puntos de partida en apnea espiratoria, con SwiftShader y con GPU real, Apple
M4): la serie a −0,43…−0,26 mm de k·D; frente a la línea mostrada, el orden 2 a +0,26…+0,39 mm, el 3 a +0,56…+0,76 y el
4 a +0,87…+1,13 (tolerancia: 0,5 mm; un píxel, 0,268 mm). Estaba declarado (`pleura-echo-offset`) y la e2e exigía el
fallo con su tamaño; la fase 1 no cierra sin esto (`docs/ROADMAP.md`: las líneas A a múltiplos exactos de la
profundidad de la pleura).

**Opciones.** Las tres de la decisión 12. (a) Dibujar la serie centrada en k·D en la rama del pulmón de la pasada B, que
ya dibuja los dos lados del eco: el desplazamiento de una cara de un lado solo sirve a quien ve un solo lado de ella. (b)
Hacer de dos lados la cara en la tabla: daría la misma imagen (la clasificación nunca devuelve `IF_PLEURA_WALL`: solo la
lee el eco de la serie), pero cambia una fila de la tabla compartida con VExUS, cuya pared sí es la dueña de la cara, y
esconde en un dato lo que es una regla de dibujo. (c) Desplazar las réplicas a k·(D − 0,35): casa la imagen con la meta pero no con la geometría (la línea pleural
seguiría 0,35 mm por encima del cruce de la pleura y las líneas A a múltiplos de una profundidad que no es la suya).

**Decisión.** (a). `pleuraSeriesEcho(cosI, δ, k0)` en `src/ultrasound/pleura.ts`, con su gemelo GLSL en `PLEURA_GLSL`: el
eco de la cara `PleuraWall` con el desplazamiento de la cara de un lado deshecho (δ + `IFACE_SHIFT_MM` si la cara es de un
lado, leído de la tabla en TS y de su fila de `uIface` en GLSL), así que su perfil de integral unidad queda centrado en el
cruce. Las dos ramas de la pasada B (la mirada 0 y la dirigida) dibujan con él la línea pleural y sus réplicas,
`G^(k−1)·T(D)·pleuraSeriesEcho(cosI, k·D − r)`, y el gemelo de la pleura (`src/validation/support/pleuraTwin.ts`) igual.
`interfaceProfileEcho` y la tabla de caras no cambian: las demás caras de un lado, que dibuja un solo dueño, conservan
su desplazamiento. No hay números nuevos. `pleura.ts` y el gemelo pasan a «adaptado» y la mejora se ofrece al origen
(`docs/PROVENANCE.md`, «Mejoras para ofrecer al origen»): VExUS tiene el mismo desplazamiento.

**Consecuencias.**

- F-T01 se cumple en los tres puntos de partida (medido igual que arriba, SwiftShader y Apple M4, extremos de varias
  pasadas): la serie a −0,11…+0,07 mm de k·D, la separación entre órdenes a ≤ 0,08 mm de D y, frente a la línea pleural
  mostrada, los órdenes 2–4 a −0,20…+0,05 mm. La línea pleural baja 0,35 mm: ahora está en el cruce de la pleura que
  registra A0.
- También con la composición espacial (apagada en el preajuste pulmonar, pero la consola la enciende): las miradas de
  ±7° dejan la línea pleural a −0,02…+0,05 mm de D y la envolvente compuesta, a −0,07…+0,07 mm de k·D con F-T01 a
  −0,28…0,00 mm. En K el peso de las miradas dirigidas cambia en D (`curtainSteerWeight`: 1 encima, 1 − fAir debajo) y
  ese escalón cae ahora sobre el pico de la línea pleural (antes, 0,35 mm por debajo): la meta se cumple, con menos margen
  que en la mirada 0.
- Las caras de un lado que dibuja un solo dueño conservan su desplazamiento, y dos lo notan. La cortical costal
  (`RibCortex`) la dibuja el tejido blando de fuera, 0,35 mm por encima del hueso: la distancia entre la línea costal y la
  pleural en la imagen es 0,35 mm mayor que la geométrica (antes las dos se desplazaban igual y se cancelaba). La cara
  interna de la pared (`Peritoneum`, la de VExUS, que en el tórax cae sobre la pleura) sigue en D − 0,35, ahora separada
  de la línea pleural, pero a −40 dB de ella a 3,5 MHz (−33 dB a 2,5 MHz): no se ve.
- La prominencia mediana de las líneas A sobre la neblina baja 0,4–1,9 dB (sigue en 16–40 dB); la de la línea pleural
  no cambia (48–50 dB).
- La e2e de las líneas A exige la meta en los órdenes 1–4 y, además, la serie en k·D a ≤ 0,2 mm (un tercio de la FWHM
  axial del pulso, 0,61 mm, como la separación), en la mirada 0 y en la envolvente compuesta. Las dos guardas se
  complementan: un desplazamiento residual de la serie desde unos 0,13 mm hace fallar una de ellas (con 0,15 mm, la de
  k·D; con la línea pleural dibujada solo del lado del pulmón, F-T01). La invariante en TypeScript (`src/validation/physicsInvariants.test.ts`) pasa a
  exigir los picos de la serie en k·D a 0,002 mm y F-T01 en el gemelo; A-T6 se mide con el perfil que se dibuja.
- El orden 4 del PLAPS (16 dB de prominencia) se detecta en 5 de sus 6 grupos en unas pasadas y en 6 en otras, con GPU
  real y con SwiftShader, antes y después del cambio: la e2e pedía el 90 % redondeado hacia arriba (los 6) y ahora hacia
  abajo (5). Y en una pasada completa de la e2e con SwiftShader el detector tomó, en 1 de los 6 grupos del orden 4
  compuesto del PLAPS, otro máximo de su ventana a −1,08 mm (no se repitió en 16 pasadas): para esa línea A, la más débil
  (16–22 dB), la posición frente a k·D, la separación y F-T01 se exigen en el 90 % de los grupos; en los órdenes 1–3, en
  todos. F-T01 no se relaja: un desplazamiento uniforme de la serie mueve todos los grupos y la prueba sigue fallando
  (con el desplazamiento de un lado de vuelta, 0 de 22 grupos en k·D).
- Se borra `pleura-echo-offset`. La huella del main de la pasada B cambia (`shaderLimits.test.ts`).

**Verificación.** `npm run check` y `npm run e2e` en verde. Mutaciones: con el desplazamiento de vuelta en la GLSL de
`pleuraSeriesEcho`, la e2e falla por la serie fuera de k·D (0,37 mm frente a 0,2) y, sin esa guarda, por F-T01 («orden 3:
0,76 mm frente a 0,5 mm»); con el desplazamiento de vuelta en la de TypeScript fallan la invariante (los picos en k·D) y la
prueba del perfil centrado de `pleura.test.ts`. Revisión adversarial de contexto limpio (midió en su propio árbol, con
SwiftShader y mutaciones propias): confirmó la física (las dos ramas dibujan el eco en toda línea con cortina, con el mismo
peso a ambos lados de D) y las cifras a ≤ 0,02 mm; halló que la composición no se medía (ahora la e2e la mide), el efecto
sobre la distancia costilla–pleura de la imagen y la cara interna de la pared, la sensibilidad de las guardas, un motivo
inexacto para descartar (b), comentarios y una entrada del CHANGELOG desfasados, y la detección del orden 4 del PLAPS, que
fallaba con GPU real; todo está corregido o anotado arriba.

## 16. Paso C1: la parrilla costal del adulto promedio (12 costillas y 11 espacios intercostales por hemitórax)

**Fecha.** 2026-09-26.

**Contexto.** La escena del paso A (decisión 10) conservaba las costillas de VExUS: las 5.ª–10.ª derechas (`rightOnly`, y
un corte x > 15 mm fijo en el GLSL), de 12 mm de alto, en la elipse del tronco escalada a 0,85, con espacios de 3,2–12,1 mm
y la pleura 7,2–8,8 mm bajo la cresta costal. La línea base de PR #14 lo medía: costillas, derecho 6 e izquierdo 0;
espacios, 5 y 0; en el punto BLUE superior (EIC2) no había signo del murciélago. Daniel pidió fidelidad anatómica en la
construcción de los modelos: el tamaño y el número de los espacios intercostales de un adulto promedio
(`docs/knowledge/anatomy.md` §1.3, §2.3 y metas A-T7–A-T9 y A-T19).

**Opciones.** Para la ley de las costillas: (a) seguir con una fórmula cerrada por costilla (extremo anterior + subida
sinusoidal hacia atrás, la de VExUS): no deja fijar los anchos de los espacios por línea, que es lo que mide la base; (b)
una tabla de alturas por costilla a lo largo del tronco, construida desde lo que la base documenta por línea (extremos
posteriores en sus vértebras, anchos de los espacios en las estaciones de medida, una costilla de referencia con la
oblicuidad de Robinson) y compartida por TS y GLSL. Para su profundidad: (i) una fracción de la elipse (VExUS: más honda
al lado que delante); (ii) pegada a la cara interna de la pared, la pleura, que la parrilla forra. Para el tronco: (1)
un tronco cónico con la caja de Robinson (303 × 195 mm y 366 de alto, estrecha arriba): rehace la pared, la compresión,
el contacto y la cortina de VExUS; (2) conservar el cilindro elíptico de VExUS (320 × 210 mm de piel), como dice la hoja de
ruta, y declarar lo que no reproduce. Para calibrar el alto costal (la compresión cinemática ensancha lo que queda bajo
el centro del convexo): (α) con la imagen; (β) con la anatomía.

**Decisión.** (b), (ii), (2) y (β). Un módulo de órgano propio, `src/anatomy/organs/ribcage.ts` (TS y GLSL con los mismos
nombres), y las líneas del tórax en `src/anatomy/thoraxLines.ts`; `sdRib` de VExUS (`primitives.ts`, idéntico) queda sin
uso en el tórax.

- **Número y lado.** 24 costillas, derechas 1–12 y después izquierdas 1–12, cada una con su número y su lado (el lado es
  un dato: la tabla va por lado y el bucle del shader recorre las 12 del lado de la muestra, por el signo de u). `MAX_RIBS`
  = 24; por costilla, `uRibs` = (extremo medial, unión condrocostal, extremo posterior, semialto) en |u| (la longitud de
  arco de la piel desde la línea media anterior, la coordenada de la pared); las alturas de las líneas medias, en una
  tabla de 112 columnas de 4 mm por lado en la textura de escena, tras la de la compresión.
- **Sección.** Elipse de 14 mm de alto craneocaudal (Kim y cols., documentado; el avatar lo extiende a todas) y 4,7 mm de
  grosor, con su cara interna a 0,3 mm (el complejo pleural del avatar) de la pleura parietal por la normal: la pleura
  queda 5,0 mm bajo la cresta (Lichtenstein, consenso) en todo el tórax y con cualquier pared (la métrica radial pura
  dejaba 3,9 mm en la medioclavicular: la distancia se toma por la normal, (pared − d)/|∇torsoDepth|).
- **Trayectoria.** Extremos posteriores en la apófisis transversa de T(n), a la altura de la mitad de su cuerpo, con 28 cm
  / 12 por segmento torácico y z = 0 en la unión xifoesternal (disco T9–T10) (Gray). La 5.ª costilla de referencia: en la
  medioclavicular a la altura de la 9.ª junto a la columna (línea de Treves, en Gray), plana (lineal en la coordenada
  anteroposterior, el ángulo costal sagital de Robinson) hasta la columna, y un Hermite que sube hasta su cartílago en el
  esternón. Las demás, sumando alto y ancho de espacio: z_{n+1} = z_n − 14 − W_n(u), con los W_n interpolados (monótonos)
  entre estaciones: junto a la columna, un segmento menos el alto costal (9,3 mm); axilar posterior, EIC1–6 12 [SUPUESTO] y
  EIC7–11 16 (Kim); axilar media, EIC1–4 15 y EIC5–6 16 [SUPUESTOS], EIC7–10 17 (Kim, también en la axilar anterior);
  medioclavicular, EIC1 36 [SUPUESTO], EIC2 18, EIC3–4 14, EIC5 15 (el avatar), EIC6–7 13 y EIC8 5 [SUPUESTOS];
  paraesternal (a 1 cm del esternón, donde miden Seong y Woo), EIC2 18,1 y EIC3 12,3 (documentados), EIC4–6 9, 6 y 3
  [SUPUESTOS: los intervalos del esternón «diminish in length from above downward», Gray].
- **Cartílagos y esternón.** 1–7 al esternón (manubrio, ángulo esternal para la 2.ª, unión xifoesternal para la 7.ª), con
  la unión condrocostal bajo la línea de piel a 75 + (n − 4,5)·6 mm de la línea media (anatomía de superficie, como la
  medioclavicular: la 4.ª y la 5.ª a 7–8 cm, la base; alargan de la 1.ª a la 7.ª, Gray); 8–10 acaban en el cartílago de
  arriba (su espacio se cierra en la punta): la 8.ª unión sigue la serie (96 mm, 1 mm de piel por fuera de la
  medioclavicular, que cruza el 8.º cartílago junto a su unión, donde Gray pone la reflexión pleural) y la 9.ª y la 10.ª,
  12 mm más afuera cada una [SUPUESTO], así que las uniones van hacia fuera de la 1.ª a la 10.ª y los cartílagos acortan de
  la 7.ª (85 mm de piel) a la 10.ª (20) (Gray); 11–12 libres, con su punta de cartílago. El esternón (hueso, 12 mm de grueso) va de la
  escotadura yugular (borde inferior de T2) a la unión xifoesternal, con el ángulo en T4–T5 y el xifoides (cartílago, 30 mm)
  debajo. La calcificación del cartílago (cáscara periférica de hueso) es una opción de la escena, apagada en el avatar.
  El cartílago atenúa 2,45 dB/cm/MHz (`COSTAL_CARTILAGE`, el rango alto de la base; VExUS 0,9).
- **Tronco.** Se conserva el cilindro elíptico de VExUS: con la pared del paso C2 (13 mm al lado) la caja de la parrilla
  mide 303 mm de ancho, la de Robinson; con la pared heredada de 28 mm, 274 × 166 mm y 350 de alto (Robinson, 303 × 195 ×
  366). Lo que no reproduce (una caja que no se estrecha hacia arriba, sin clavícula) es `thorax-cylindrical-cage`.
- **Calibración del alto costal: la anatomía.** Kim y cols. miden hueso, que no se deforma bajo la sonda. En la imagen del
  convexo, la compresión cinemática hunde la cara ≈ 8,6 mm en el centro (la flecha de la cara de 60 mm de radio sobre la
  piel plana en z) y empuja la pared con las costillas por las líneas divergentes: lo rígido bajo el centro del sector se
  ensancha ×1,11–1,18 (la costilla centrada mide 16,0–16,5 mm en la imagen; con las costillas a los lados, en el corte del
  signo del murciélago, 15,1–15,6). Queda en `probe-compression-kinematic` y en una meta que aún no se cumple.
- **Puntos de partida.** El BLUE superior pasa al centro del EIC2 de la medioclavicular (95 mm de la línea media, Gray:
  φ 0,702π, z 83,7) y el BLUE inferior al del EIC4 de la axilar anterior (z 50,6); el PLAPS, a su altura.
- **Pruebas.** Las `notYetMet` de las costillas y de los espacios (PR #14), A-T7 (salvo los espacios de «Sin cumplir
  aún»), A-T8, A-T9 y la geometría de F-T08 pasan a `it`; nuevas: las cuentas (a lo largo de las líneas paraesternal, medioclavicular, axilares y paravertebral, de arriba
  abajo, las costillas en orden y del lado de la línea: 7, 9, 10, 11, 12 y 12 costillas; 12 y 11 espacios por hemitórax),
  la simetría, A-T19 (la 7.ª baja 102,9 mm y 36,2° bajo el plano transversal, Robinson 29 ± 7,7; la 9.ª junto a la columna
  y la 5.ª en la medioclavicular a 0,2 mm; la caída crece de la 1.ª a la 8.ª) y `src/validation/ribcage.test.ts` (esternón,
  cartílagos y su orden, extremos, calcificación, tabla). Una costilla que toca a la de al lado no cuenta como dos: entre dos
  cruces seguidos de una línea, ≥ 1 mm sin hueso ni cartílago en la clasificación; y en todo |u| donde están las dos, el
  espacio entre costillas seguidas es ≥ 1 mm salvo en los 10 mm junto a la punta de un cartílago del reborde (≥ 0). A-T7
  («EIC visibles de 14–20 mm») se mide en los espacios de cada línea, no solo en dos cortes. La medida
  del signo del murciélago toma los anchos a la profundidad de las crestas (a la de la pleura el convexo los abre ×(R + D)/(R +
  d)), y la de F-T08, la media de los dos lados de cada sombra (el lado de fuera de una sombra lejos del centro mira la
  pared más oblicua: ≈ 1,7 mm más). Las líneas A se miden donde hay pulmón detrás de la pleura (el borde caudal del PLAPS
  cae ahora en la banda bajo el borde del pulmón heredado).

**Consecuencias.**

- Costillas: 6 → 24 (12 por hemitórax, numeradas). Espacios: 5 → 22 (11 por hemitórax). Alto: 12 → 14 mm. Anchos en la
  anatomía: EIC2/3/4/5 de la medioclavicular 18/14/14/15 mm; paraesternales EIC2 18,1 y EIC3 12,3; laterales bajos 16,6–17 en
  la axilar anterior y 17 en la media; posteriores bajos 16 en la axilar posterior y 14,8 a 1,2π; junto a la columna 9,3.
  En la imagen (corte centrado en el espacio): EIC5 de la medioclavicular 17,1; EIC5–9 de la axilar media 18,7–19,7;
  EIC7–9 a 1,2π 17,1. Signo del murciélago: la pleura 4,4–4,5 mm bajo la línea costal; sombras de 15,1–15,6 mm; periodo
  34,2 mm (anatomía 30). Pleura bajo la cresta (F-T08, media por sombra): 5,1–5,5 mm (antes 7,2–8,8).
- **Discrepancias.** El plano de Treves cruza, según Treves, el esternón entre la 4.ª y la 5.ª; con los niveles del esternón
  de Gray (unión xifoesternal en T9–T10) lo cruza entre la 6.ª y la 7.ª: se conservan los de Gray. El EIC5 del avatar (15)
  no es «comparatively narrow» como en Gray: manda la base. La oblicuidad de las costillas 10–12 no baja tras la 9.ª (Gray): su
  caída hasta la punta sigue los espacios laterales de Kim.
- **Sin cumplir aún.** A-T1–A-T3 y A-T10 (la pared, paso C2); en la imagen con la presión estándar, la costilla centrada
  (16,0–16,5 mm frente a 13–15), los EIC7–9 de la axilar posterior (18,4 frente a 14–18) y el EIC2 del punto BLUE superior
  (20,1 frente a 14–20: sus 18 mm de anatomía ×1,12), por el ensanchamiento de la compresión; los EIC visibles altos de
  detrás (LAP EIC2–6 13,8; 1,2π EIC1–6 12,1–13,1: los 11–12 mm estimados de su anatomía) y los primeros de delante (LMC EIC1
  40,5, bajo la medioclavicular por el cilindro; LAA EIC1 25,6); la 1.ª costilla, 17,6° bajo el plano transversal frente a
  31 ± 8,2 (cae lo que la real, pero en los 150 mm de profundidad del cilindro); y A-T13: el pulmón y las cúpulas heredados
  acaban unas dos costillas por encima de lo que dice Gray (en la LAM derecha, a la altura de la 6.ª y no de la 8.ª;
  `lung-border-above-ribcage`, paso C3). En la GPU (F-T08): cada sombra queda a −34,7…−39,2 dB del eco pleural intercostal (cumple), pero en el núcleo
  de la sombra la línea pleural sigue a −40,8…−41,7 dB (en pantalla −23,4…−25,6; antes −29…−50) y la línea A de orden 2,
  tenue: con espacios más anchos, el pedestal de lóbulos laterales trae más pleura brillante (`rib-shadow-pleura-residual`).
  Con la pleura a 5 mm de la cresta, la sombra completa empieza a 4–5 líneas de su borde, donde la pleura aún recibe el eco
  vecino por la pasada D (−30…−39 dB a 4–6 líneas; el lóbulo principal de la PSF cae bajo −35 dB desde 3 líneas: es el
  pedestal): la e2e juzga la pleura dentro de la sombra desde 7 líneas, un alcance medido, no derivado.
- La equivalencia TS ↔ GLSL sigue exacta (acuerdo 1 en tejido y cara; 2·10⁻⁵ mm con GPU real, 0,014 mm con SwiftShader),
  también en nubes de 22 680 puntos alrededor de los extremos de las 24 costillas (`ribEnds`: 19 460 interiores, acuerdo 1
  hasta 0,05 mm de los bordes; normales de la cortical y del pericondrio a |n·n| ≥ 0,9999997). La cara de una costilla la
  dibuja en los dos gemelos la misma costilla, `faceRib` (la que contiene el punto o el hueso más cercano, la de la
  clasificación): la GPU ya tomaba esa para la tangente y la curvatura, y el gradiente de TS y de GLSL tomaba la más
  cercana con cartílago incluido (difería en el 0,6 % de las muestras de la pared anterior, en las uniones esternocostales).
  El coste del cuadro no cambia (2,1–2,2 ms en el M4, igual que en main): el bucle de 12 costillas solo corre en la banda de
  la parrilla (antes, 6 costillas en toda la profundidad bajo 7,75 mm). Las ranuras de uniforms de la pasada B pasan de 85
  a 105 (107 la dirigida; tope 130). El chunk principal sube de 163,5 a 186,8 kB; su presupuesto, de 180 a 195.
- El moteado de la e2e se mide en siete vistas paraesternales (el esternón ocupa ahora la línea media): 59 parches, SNR 2,13.
- Se borran `ribs-5-10-only` y `no-spleen-no-left-ribs` (el bazo, en `abdomen-generic-tissue`); nuevas
  `thorax-cylindrical-cage`, `rib-section-uniform` y `lung-border-above-ribcage`. El hemitórax izquierdo tiene costillas pero no pleura
  (`lung-curtain-right-only`, paso C3). La parrilla se ofrecerá a VExUS, que tiene las mismas costillas derechas.
- La numeración: esta es la decisión 16 porque `main` terminaba en la 15 y `docs.test.ts` exige 1..N sin huecos.

**Verificación.** `npm run check` y `npm run e2e` en verde. `src/validation/anatomyTargets.test.ts` y
`src/validation/ribcage.test.ts` (las cuentas por línea, los anchos por nivel y región en la anatomía y en la imagen, el
alto, la simetría, la oblicuidad, el esternón, los cartílagos, la calcificación); `e2e/imagen.spec.ts` (equivalencia con
las 24 costillas y el esternón y en los extremos de las costillas, moteado, líneas A y F-T08 medidos de nuevo). Revisión
adversarial de contexto limpio (27-09-2026), aplicada: las uniones condrocostales 8.ª–10.ª iban por dentro de la 7.ª y sus
cartílagos alargaban (Gray: acortan); el borde del pulmón heredado no seguía a la parrilla y el código decía lo contrario;
la cuenta por línea no veía dos costillas fundidas (el índice cambiaba sin espacio) y dos rangos admitían espacios de 0 mm;
A-T7 se había aflojado a 20,5 mm; etiquetas de evidencia (el EIC2 de la medioclavicular es derivado; la paraesternal y la
paravertebral, estimadas); la oblicuidad sin cifra frente a Robinson; la divergencia de la costilla de la cara; la
justificación del alcance de la PSF; comentarios viejos.

## 17. Paso C2: la pared torácica por región y por hábito

**Fecha.** 2026-09-27.

**Contexto.** Tras la parrilla del paso C1 (decisión 16) la pared del tórax seguía siendo la del abdomen de VExUS: piel 2,
grasa 14 y músculo 12 mm, 28 en la métrica radial en todo el tronco (`thorax-wall-abdominal-habitus`), con los tres músculos
y dos planos de la pared abdominal y sin intercostales (`wall-generic-layers`). Medido: la pleura a 25,3 mm en EIC2-LMC y a
26,8–28,0 en EIC5 LAA/LAM (cociente lateral/anterior 1,06–1,11), sin banda intercostal (0,0 / 2,5 / 2,6 mm de músculo
entre la línea costal y la pleura) y sin cambio al inspirar: A-T1–A-T3 y A-T10 sin cumplir. La base da el estado ecográfico
de la pared por región y sus variantes (`docs/knowledge/anatomy.md` §2.2–2.6 y metas A-T1–A-T5, A-T10).

**Opciones.** Para la geometría: (a) un tronco cuya piel siga la pared (un tórax no cilíndrico): rehace el contacto, la
compresión, la cortina y todas las líneas de la sonda de VExUS; (b) conservar la piel (el cilindro elíptico) y mover la
pleura y la parrilla por dentro con el grosor de cada punto. Para el grosor en el shader: (i) un uniform por estación; (ii)
una tabla por |u| en la textura de escena, como la parrilla. Para la axila (la base da 13 mm en el EIC5 lateral, Nelson, y
18 en el EIC4, McLean): (α) cada valor en su espacio (5 mm de salto en un espacio intercostal); (β) una transición entre el
centro del EIC5 y la 4.ª costilla. Para el contacto de la sonda: un grosor fijo bajo la cara o el de cada línea.

**Decisión.** (b), (ii), (β) y el grosor de cada línea. Un módulo de órgano propio, `src/anatomy/organs/chestWall.ts` (TS y
GLSL con los mismos nombres), que la pared en capas de VExUS (`organs/wall.ts`) lee por región.

- **Estaciones y capas** (por la normal de la piel; la tabla las lleva a la radial con |∇torsoDepth|): sobre el esternón
  (de la línea media a su borde) piel 1,8 y grasa presternal 3,7 sobre los 12 mm del hueso (17,8); delante (paraesternal,
  LMC) piel 1,8, grasa 3,7, pectoral 8,0, intercostales 2,2 y el complejo pleura + fascia endotorácica 0,3 = 16,0; al lado bajo (LAA, LAM) 1,8 / 3,2 / serrato 4,5 / 3,0 / 0,3 = 12,8; la axila alta (LAA, LAM y el pliegue de la LAP)
  18 con los intercostales del EIC3 lateral (3,7); infraescapular (1,2π) 2,5 / 4 / dorsal 5 / 4,3 / 0,3 = 16,1; la línea
  media posterior, la pared heredada (28). Interpolación monótona en |u| y, en altura, la pared alta desde la 4.ª costilla de
  la LAM y la baja desde el centro del EIC5; bajo el reborde costal (suavizado entre columnas), en 100 mm, la pared del
  abdomen del hábito.
- **Capas en la pared de VExUS.** El músculo va de la fascia profunda a la fascia endotorácica (la transversalis de la
  tabla, sin ondular) con el plano músculo–intercostal (el segundo plano intermuscular) a la banda intercostal sobre ella; el
  primer plano se funde con la fascia; el complejo pleural es la grasa preperitoneal; Scarpa y la fascia ondulan con la
  grasa. La banda engruesa delante al inspirar a fondo (Yoshida, +0,76 mm) con el descenso del diafragma.
- **Todo lo que usaba el grosor fijo lo toma del punto:** la clasificación (TS y GLSL), `insideWallMm`, el peso
  respiratorio, la parrilla (su pleura y su construcción), el contacto de la sonda (cada nodo con la pared donde su línea
  entra en la piel), los ecos parásitos (la pared y la grasa bajo la sonda), la textura de la pared y las medidas.
- **Lo que cuelga de la cara interna la sigue:** las cúpulas del diafragma y la huella de la cortina se escalan con la
  cara interna de la pared (en x con la de la LAM a la altura de la cúpula, en y con la de delante), para que el receso
  costofrénico lateral no desaparezca al acercarse la pleura del flanco a la piel; la pleura se ilumina con la normal de su
  cara (`wallInnerNormal`: ∇torsoDepth más las derivadas de la tabla en u y z), no con la de la piel.
- **La GLSL no lee la tabla donde no cambia nada:** más honda que la pared más gruesa del tronco (`maxTotal`, en
  `uChestWall.w`) más la lámina de la cortina o el tope del «resto», la clasificación toma la cota; el peso respiratorio,
  a 25 mm de ella.
- **Variantes** (`habitus.chest`): delgada (grasa 1,75 y pectoral 6 delante; lo demás, en la misma proporción), obesa (23
  delante y 1,1 × al lado, en grasa; la axila alta, lo de delante), mujer (+2 mm de mama del esternón a la axilar anterior; espacios intercostales 1,5 mm
  más estrechos, Kim).
- **Preajuste.** El foco sigue a la pleura del punto BLUE superior: 25 → 16 mm; el mínimo del equipo, de 20 a 8.

**Consecuencias.**

- A-T1: 25,3 → 16,1 mm. A-T2: 26,8 y 28,0 → 12,8 y 12,8 (cociente 0,79–0,80). A-T3: 28,0 → 16,7 (más que A-T1). A-T10: la
  banda 0,0 / 2,5 / 2,6 → 2,0 / 3,0 / 4,0 mm, y al inspirar a fondo +0,7 delante y +0,0 al lado. A-T4 (obesa): 23,6 mm y
  cociente 1,07. A-T5 (mujer): +2,0 mm. La delgada: 12,1 y 10,0. Todas pasan a `it`.
- A-T13 (el borde del pulmón en la LAM a la altura de la 8.ª costilla) sigue sin cumplirse (la 6.ª: z 20 derecho, 4
  izquierdo; es del paso C3). Una primera versión lo «cumplía» porque la pleura del flanco, 15 mm más afuera, salía de la
  elipse de la cúpula heredada: el pulmón llegaba a la inserción del diafragma y el signo de la cortina lateral desaparecía
  (el borde quieto de 0,85π a 1,1π). Con las cúpulas y la cortina escaladas, el borde baja 18 → 2 → −12 mm de 0,85π a 1,2π
  con el diafragma a 0, 16 y 30 mm, como en C1; las pruebas de la cortina vuelven a sus puntos y cotas.
- A-T7: la pleura a 4,2 mm bajo la línea costal en EIC5-LAM (en la subida de la pared hacia la axila) y 4,7 en el punto BLUE
  superior. F-T08 en los tres puntos de partida, en seis cortes de las cuatro regiones y en las tres variantes: medias de
  5,0–5,9 mm; por lado 3,9–7,6 (la pleura se inclina ≈ 10° bajo la 5.ª costilla en la subida hacia la axila; la prueba
  admite 3,5–8 por lado y 4–6 de media). La caja de la parrilla mide 304 mm de ancho (Robinson, 303). Sobre el esternón,
  5,5 mm de piel y grasa (3,6 la delgada, 12,5 la obesa).
- En la imagen: caben 6–8 líneas A en 12 cm; la e2e exige los órdenes 1–4 (el 4.º en la mitad de los grupos: su pico sube
  de −32,2 a −28,8 dB, pero el fondo de su ventana sube de −57,7 a −41,7, porque la serie de copias de la pared delgada
  pierde 12 dB por orden en lugar de 17). F-T08 en la GPU: el eco pleural vecino llega a 10 líneas del borde de la sombra
  (antes 6: el foco sigue a la pleura, y a 1–2 mm de él el haz de la pasada D ya se abre; el gemelo `lateralKernel` da
  −37…−41 dB a 8–10 líneas); en el núcleo la línea pleural queda a −40,5…−46,7 dB, la ventana ≥ 39,8 dB más oscura que la de
  las líneas libres (antes se exigían 40) y cada sombra a −33,7…−39,1 dB del eco intercostal.
- El coste del cuadro sube de 2,0 a 2,24 ms en el M4 (+12 %, medido uno tras otro con la misma sesión; picos de 2,3 y 2,5):
  la tabla por muestra en la clasificación, la normal de la pleura y la textura. Muy lejos de O6 (≥ 30 FPS). El chunk
  principal pasa de 187,7 a 205,3 kB: su presupuesto sube a 210 y el del total de JS a 215. Ranuras de uniforms de la
  pasada B: 106 (+1, `uChestWall`).
- La equivalencia TS ↔ GLSL sigue exacta con GPU real y con SwiftShader (tejidos, caras, cáscara, extremos de las costillas,
  pleura de A0, normales y transmisión). La distancia al borde del volumen se compara donde es continua: el pulmón de la
  cortina y el del tórax detrás son el mismo tejido con distancias distintas, y un punto junto a la cara interna de la
  lámina cambiaba de rama con el redondeo; se cuentan (36–40 de ≈ 10⁴) y la e2e exige menos del 0,5 %.
- Se borra `thorax-wall-abdominal-habitus`; `wall-generic-layers` queda para los tejidos (un músculo sobre los
  intercostales, texturas de VExUS); nueva `chest-wall-regional-approx` (la piel fija, la transición de la axila, sin
  escápula ni límites de la mama, la pared paravertebral heredada, la mezcla con el abdomen, el contacto con la pared de la
  entrada de cada línea).
- Las pruebas portadas de la pared en capas de VExUS miran ahora la pared del abdomen (bajo el reborde) o el tronco uniforme
  del hábito; las de la cortina, el punto del borde escalado con la cúpula.

**Verificación.** `npm run check` y `npm run e2e` en verde; `src/validation/chestWall.test.ts` (capas por estación, tabla,
orden de las caras, inspiración, abdomen, variantes, esternón, inclinación de la pleura, cúpulas y cortina, cota
`maxTotal`, gemelo GLSL) y `anatomyTargets.test.ts` (A-T1–A-T5, A-T10, la delgada, F-T08 por región y hábito; A-T13 con
`notYetMet`); la e2e con GPU real y con SwiftShader. Revisión adversarial de contexto limpio: la cortina lateral perdida
(bloqueante), la pleura con la normal de la piel, el esternón en la piel, el signo del murciélago fuera de los cortes
medidos, la axila de la obesa, etiquetas de evidencia; todo aplicado (ver la PR).

## 18. Paso C3: pulmón y pleura en los dos hemitórax, bordes de la base, ZOA y ventana cardiaca

**Fecha.** 2026-09-27.

**Contexto.** Tras la parrilla (decisión 16) y la pared por región (decisión 17), el pulmón y las cúpulas seguían siendo
los de VExUS: en fin de espiración, 4 mm por dentro de la pleura, el borde derecho en z 43 en la LMC (la 4.ª costilla), 20
en la LAM (la 6.ª) y 45 junto a la columna; el izquierdo en 17,5, 4 y 10,5 (`lung-border-above-ribcage`). La cortina solo
bajaba en el receso lateral y posterior derecho (x ≤ −50, y ≤ 45) desde z 18, la pleura parietal solo se registraba hasta
x = 10 (decisión 71 de VExUS) y el hemitórax izquierdo mostraba costillas sin línea pleural ni líneas A
(`lung-curtain-right-only`). Todo el tórax sobre las cúpulas era pulmón: sin corazón ni ventana cardiaca
(`thorax-all-lung`). Las cúpulas tenían sus vértices en 55 y 25 mm (T8–T9). La base da el borde, la reflexión, la
excursión, la ZOA, las cúpulas y la ventana (`docs/knowledge/anatomy.md` §1.5–1.6, §2 y metas A-T12–A-T16).

**Opciones.** Para el borde: (a) mover y deformar las elipses de las cúpulas de VExUS hasta que toquen la pared donde dice
Gray (su perfil 1 − ρ⁴ tiene tangente vertical en el borde: un milímetro de error en ρ mueve el borde ≈ 7 mm); (b) una
tabla del borde por columna de |u| anclada a la parrilla, con la cúpula de VExUS lejos de la pared y una rampa que la lleva
al borde en su cara interna. Para el seno: (i) quitar el pulmón bajo el borde con una cuña; (ii) la cúpula que toca la pared
en el borde de FRC, la lámina de la cortina que baja desde él y, debajo, una lámina de diafragma contra la pared (la ZOA).
Para la ventana: (α) un elipsoide que asome por la pared (con su cara casi paralela a la pared, la ventana sale alargada de
lado a lado, 57 × 42 mm, y llega a la LMC); (β) el elipsoide del corazón con el ápex de Gray, por dentro de la pleura, y un
tapón de miocardio que lo une a la pared en el disco de Latham.

**Decisión.** (b), (ii) y (β), en dos módulos de órgano propios con sus gemelos GLSL.

- **Bordes** (`src/anatomy/organs/lungBorder.ts`): por columna de |u| (las de la pared torácica), el borde del pulmón en
  FRC (la 6.ª costilla en la línea paraesternal y en la LMC, la 8.ª en la LAM, T11 —la punta de la apófisis de T10— junto a la columna), la reflexión pleural (el 7.º cartílago en la paraesternal, el 8.º en la LMC, la 10.ª costilla en la LAM, T12 —la punta de su apófisis, por la regla de los tres— detrás), el grosor de la pared a la altura del borde y la inserción de la ZOA (20 mm bajo la
  reflexión), interpolados en |u| (Fritsch–Carlson) entre los anclajes. En la textura de escena, tras la tabla de la pared.
- **Cúpula**: la de VExUS, con sus vértices de la base en FRC (la derecha en el centro del 5.º EIC de la línea paraesternal, 13,7 mm; la izquierda 15 mm más baja [SUPUESTO]); junto a la pared, `zL + (D − zL)·s(w)` con s(w) = 1 − (1 − w/40)² (w, la
  profundidad bajo la cara interna a la altura del borde): toca la pared en el borde y sube de ella con el ángulo
  costofrénico agudo.
- **Cortina**: la lámina de 3 mm en los dos hemitórax y alrededor de todo el tronco, desde el borde de su columna menos el
  descenso del diafragma (`curtainDescentRatio`, 1) sin pasar de la reflexión. La pleura parietal se registra en toda la
  pared salvo en la ventana cardiaca (`lungCurtainEdgeMm` da −1e3 donde el corazón toca la pleura). `uCurtain` pasa a ser
  (descenso, espesor, cota de la rampa, 0).
- **ZOA**: bajo el borde en FRC y sobre la inserción, una lámina de diafragma contra la pared de 1,9 mm en FRC que engruesa
  hasta 5 mm a TLC (Carrillo-Esper vía Santana; Ueki, Cardenas), con su cara abdominal (la geometría de cara `zoa`, paralela
  a la pared); la cortina la tapa donde el pulmón ha bajado.
- **Corazón** (`src/anatomy/organs/heart.ts`): un elipsoide de miocardio (120 × 90 × 65 mm, eje largo 60° a la izquierda y
  30° hacia abajo [SUPUESTO]) con el ápex en el 5.º EIC a 9 cm, 10 mm por dentro de la pleura (la língula), una cavidad de
  sangre y el tapón en el disco de Latham (5 cm sobre la piel, centrado a 47,5 mm en el 5.º EIC) hasta la cara del
  elipsoide (25 mm, medidos por el rayo radial de cada columna, en la métrica de la clasificación); alrededor, una franja de
  25 mm [SUPUESTO] donde el corazón llega hasta la lámina de la cortina (el borde fino del pulmón sobre el corazón: sin ella,
  las líneas oblicuas salían del tapón a una bolsa de pulmón y dibujaban una línea vertical brillante), con la lámina que se afila hacia el borde del disco; sobre la cúpula, con su cara inferior de pared (la sangre no toca el diafragma). El corazón, con el tapón y la franja, no se mueve con la respiración (se apoya en el centro tendinoso): el campo respiratorio vuelve a su valor a 50 mm de su elipsoide [SUPUESTO]; bajando con las vísceras, la cizalla con el tapón pegado a la pared abría bolsas de pulmón en la ventana en cada respiración.
  Tejido nuevo: el miocardio (las propiedades del músculo de IT'IS, sin la textura de la pared).
- **Clasificación**: pared → costillas → columna → corazón → cortina → ZOA → cúpula → «resto», igual en TS y en GLSL; la
  distancia a la frontera cuenta la cara del corazón y la de la ZOA. Por encima de la cúpula más alta más 10 mm el pulmón
  no la evalúa (su distancia a la frontera tiene ese tope); la normal del espejo del pulmón (decisión 57) sale de la cúpula
  en la última muestra de pulmón, como en el gemelo. `classifyWall` devuelve el arco de la muestra, y su salida barata cubre
  el tapón y la ZOA.

**Consecuencias.**

- El pulmón que toca la pleura (1,5 mm por dentro), en fin de espiración, a los dos lados: z −17,5 en la LMC (la 6.ª
  costilla; antes 41,5 a la derecha —la 4.ª— y 16,5 a la izquierda), −35 en la LAM (la 8.ª; antes 14 y −0,5) y −35 junto a
  la columna (T10; antes 18 y 9). La reflexión: −72 en la LMC (el 8.º cartílago), −97 en la LAM (la 10.ª) y −58 detrás (T12). Tras el esternón el borde sigue el de la línea paraesternal (1,5 mm; junto al borde del esternón Gray lo pone en la 6.ª articulación condroesternal, ≈ 15 mm más arriba), sin cubeta de pulmón bajo él. La cortina baja 10 mm en la respiración tranquila (A-T13: 0,9–2,8 cm) y 30 en la profunda (A-T13: 3,1–7,5 cm; no
  se cumple: es el diafragma del modelo) en todo el tronco. En la mujer, el borde de la LAM en −31 (sus espacios, 1,5 mm
  más estrechos); en la delgada y la obesa, como en el avatar. Pasan a `it` el borde de A-T13 y el de Gray, la reflexión, la
  excursión tranquila, A-T12, A-T14, A-T15 y la ventana de A-T16; con `notYetMet`, la excursión profunda y el pulso pulmonar.
- La ZOA: 1,9 mm en FRC y 5,0 a TLC (×2,6; A-T15 pide 1,1–2,7 y ≥ +20 %). Las cúpulas, 13,7 y −1,3 mm (antes 55 y 25).
- La ventana: miocardio bajo la pleura en el 5.º EIC a 30, 45 y 60 mm y en el 4.º a 50 mm de la línea media izquierda
  (pulmón en el espejo derecho), 268 de 285 puntos del disco (el resto, en su borde caudal, bajo el borde del pulmón: la ZOA); igual en espiración, en la respiración tranquila y en la profunda; el ápex del elipsoide en (79,5, 63, −2,8), bajo la língula (pulmón a 1,5 mm en el 5.º EIC a 9 cm). En la ventana, el miocardio mide 12–35 mm antes de la cavidad (el tapón; `heart-simplified`).
- En la imagen (capturas con GPU real, C2 → C3): el hemitórax izquierdo tiene línea pleural y líneas A (el signo del
  murciélago en la LMC izquierda, donde antes se veía el abdomen bajo la cúpula heredada); el signo de la cortina a los dos
  lados (el EIC8 de la LAM, abdomen en espiración y pulmón en inspiración profunda); en la ventana cardiaca, el corazón (el
  miocardio, su cavidad anecoica y su pared de detrás) sin pleura ni líneas A, con el pulmón que empieza en su borde.
- El coste del cuadro sube ≈ 0,2 ms en el M4 (2,24–2,58 → 2,47–2,77, medido uno tras otro con C2, con la máquina cargada; C1, 2,0): muy lejos de O6 (≥ 30 FPS). El chunk principal pasa de 205,3 a 222,2 kB (≈ 13 kB son las notas de evidencia de los dos conjuntos): su
  presupuesto sube a 230 y el total de JS a 235. Ranuras de uniforms de la pasada B: 112 (+6, los del corazón); 31 tejidos
  (el miocardio cabe en los 8 vec4 de las tablas por tejido).
- Pruebas movidas con el borde: la línea que roza el borde de la cortina (su vista 53 mm más abajo), las vistas de la
  pleura de A0 (sobre el borde nuevo), la normal de la cúpula (a 10⁻⁴ rad: la rampa se interpola por columnas de 8 mm) y lo
  que hay detrás de la lámina (ya no hay instante sin cortina con que compararlo: se juzga por la cúpula).
- Se borran `thorax-all-lung`, `lung-curtain-right-only` y `lung-border-above-ribcage`; nuevas `heart-simplified` (el
  corazón estático: sin pulso pulmonar, A-T16 en su segunda parte) y `lung-border-table` (la tabla igual a los dos lados,
  sin receso costomediastínico, la rampa, la ZOA de grosor uniforme, la excursión profunda del modelo de 30 mm).
- La equivalencia TS ↔ GLSL mira también la pleura en la ventana cardiaca (sin pleura en su centro) y en el borde de la LAM
  izquierda.

**Verificación.** `npm run check` y `npm run e2e` en verde; `anatomyTargets.test.ts` (A-T12–A-T16 y el borde de Gray, con
`notYetMet` en la excursión profunda y el pulso pulmonar), `anatomy.test.ts`, `pleura.test.ts`, `organs.test.ts`,
`faceGradient.test.ts` y `physicsInvariants.test.ts` al día; la e2e con GPU real y con SwiftShader. Revisión adversarial
de contexto limpio (con scripts y la GPU): la ventana cardiaca se rompía al respirar (bloqueante: la cizalla entre el tapón y el corazón); la cubeta de pulmón junto a la línea media, el vértice de la cúpula en la paraesternal de la mamaria interna, la reflexión posterior un nivel baja, la sangre sobre el diafragma y un tapón grueso; una cota de distancia que saltaba en los extremos de la ZOA; pruebas que no medían (el pulso pulmonar, una aserción que no podía fallar); cifras viejas en las notas. Aplicado, salvo el grosor del tapón (declarado).

## 19. Paso C4: el deslizamiento por región

**Fecha.** 2026-09-27.

**Contexto.** Tras el paso C3 (decisión 18) el pulmón bajo la pleura bajaba con la inspiración lo mismo en todo el tórax: el
descenso del diafragma (`sliding-uniform-caudal`). La base da un deslizamiento mayor en la base que en el vértice: 8,6 ± 4,3
mm en la LAM un espacio sobre el diafragma frente a 3,6 ± 2,0 en el EIC2 de la LMC, en ventilación mecánica (Briganti; meta
F-T12: cociente 0,42 ± 0,1, que crece con el volumen corriente); 5,4 ± 2,5 mm de media en sanos respirando tranquilos (D5);
≈ 15 ± 5 en el punto BLUE inferior y «habitualmente nulo» en el vértice (Lichtenstein, opinión de experto); y una
deformación menor delante que detrás (D8). El plan del paso C4 incluía además los puntos BLUE por la regla de las manos.

**Opciones.** Para la forma: (a) una recta con la altura, de la base al vértice (la expansión del pulmón es proporcional a
la distancia a su vértice), con la base en z fija o en cada columna sobre su borde; (b) una curva con rodilla que diera
también los 15 mm del punto BLUE inferior. Para la amplitud: el descenso del borde del pulmón (que se detiene en la
reflexión) o un parámetro propio. Para la excursión: la de VExUS (10 y 30 mm) o la de la base en supino (16 y 53).

**Decisión.** (a) con la base en cada columna, la amplitud del borde (con su tope en la reflexión) y la excursión de VExUS.

- **Deslizamiento por región** (`anatomy.lungSliding`, `lungSlideMm` en TS y GLSL, `organs/lungBorder.ts`): el pulmón bajo
  la pleura baja lo que el borde de su columna (el descenso del diafragma, sin pasar de la reflexión) hasta 15,5 mm sobre el
  borde (la base de Briganti: el EIC7 de la LAM sobre la 8.ª costilla) y en recta hasta 0 a 147 mm por encima (138 en la mujer, de parrilla más baja), calibrada
  con el cociente de Briganti en el centro del EIC2 de la LMC. La tabla de los bordes lleva en su cuarto componente la altura
  a la que se apaga (la inserción de la ZOA se calcula de la reflexión). La retícula del deslizamiento de la pasada B y sus
  gemelos se anclan con ello.
- **La excursión sigue siendo la de VExUS.** Se probó la de la base (16 y 53 mm): A-T13 en la inspiración profunda se
  cumplía, pero con 53 mm el campo respiratorio heredado (su rampa de 25 mm bajo la pared, la del corazón y la inversión de
  dos pasos de punto fijo) se plegaba (≈ 300–350 cm³ con el jacobiano negativo, sobre el corazón y bajo el reborde anterior) y la inversión erraba > 1 mm en el 18–21 % de las muestras a menos de 8 cm de la piel (hasta 26 mm; con los 30 mm de VExUS ya en el 9,6 %, hasta 15 mm: `respiratory-inverse-fixed-point`); la revisión adversarial midió
  en las vistas tejidos desplazados hasta 27 mm. Rehacer el campo respiratorio es otro paso.
- **Los puntos BLUE por la regla de las manos quedan pendientes**: la base no tiene la antropometría de la mano (ANSUR II,
  NO ENCONTRADO; `docs/knowledge/anatomy.md` §4) ni la altura de la clavícula del avatar; siguen los reparos de Yuriditsky
  sobre la parrilla (decisión 16).

**Consecuencias.**

- F-T12 pasa a `it`: cociente 0,416 en las dos vistas de Briganti (0,419 en las estaciones de la parrilla con que se calibra) (por construcción: la recta se calibra con él) en la
  respiración tranquila y en la profunda; la amplitud crece con la excursión. En la respiración tranquila (10 mm): 10 mm en
  la base, 5,4 en el punto BLUE inferior, 5,2 en el PLAPS y 4,2 en el superior (D5, 5,4 ± 2,5 de media; D4, ≈ 15 en el
  inferior, no); en la profunda, junto a la columna, 23,4 (el borde se detiene en la reflexión de T12).
- `sliding-linear-height` sustituye a `sliding-uniform-caudal` (sin modo ventilatorio, ventilación regional ni la
  deformación menor delante, D8). A-T13 en la inspiración profunda sigue con `notYetMet` y el motivo en `lung-border-table`.

**Verificación.** `npm run check` y `npm run e2e` en verde; `anatomyTargets.test.ts` (F-T12; el deslizamiento decrece con la
altura en cada línea, no pasa del descenso del borde y se apaga arriba), `organs.test.ts` (la función GLSL letra a letra con
sus constantes) y `pleura.test.ts`. Revisión adversarial de contexto limpio (de la primera versión, con la excursión de la
base): ver la PR.

## 20. La costilla apaga la pleura: lente de fase, lóbulos laterales por su apertura y el preajuste sin saturar (F-T08)

**Fecha.** 2026-09-27.

**Contexto.** Con la parrilla del paso C (decisiones 16–17), en los puntos BLUE y PLAPS la línea pleural seguía viéndose
continua por debajo de las sombras costales (`rib-shadow-pleura-residual`): en una imagen real se interrumpe en cada sombra
(el signo del murciélago) y la meta F-T08 pide que bajo la costilla no haya línea pleural ni líneas A. La PR #14 había medido
tres causas: la transmisión de la pasada A promediaba amplitudes sin la fase del hueso, el pedestal de lóbulos laterales de la
pasada D subía la pleura en la sombra y el preajuste dejaba la línea pleural 15–18 dB sobre el blanco. Medido de nuevo con la
anatomía nueva (GPU real, Apple M4, y SwiftShader, en apnea espiratoria, en las líneas a más de 10 del borde de la sombra
completa): la línea pleural a −40,6…−62,7 dB del eco intercostal y en la pantalla a −21,9…−43,4 dB (gris 57–137 sobre la
sombra negra); la línea A de orden 2 visible en 86 de 125 líneas de la sombra completa; la línea pleural intercostal a
+12,4…+20,1 dB sobre el blanco. Lo que dejaba la pleura en el núcleo no era sobre todo el pedestal (≤ +8,6 dB) ni la media
del cono (−2,6…+8 dB sobre un rayo), sino la transmisión de la propia costilla: un rayo por su centro perdía 53,5–63 dB de ida
y vuelta; con la línea pleural cerca del blanco, eso sigue siendo gris. El pedestal sí traía la línea A (sin él, ≤ −77,5 dB en
la pantalla).

**Opciones.** (a) Retocar la imagen bajo las costillas o subir la atenuación del hueso hasta que no se vea: sin física detrás.
(b) Separar la física legítima de la que no lo es y corregir la segunda. Legítima: la penumbra de la apertura (los rayos del
cono que pasan junto a la costilla o por su borde redondo, que es fino) y el lóbulo principal del haz. No legítima: (1) sumar
las tomas del cono en fase, como si la costilla fuera tejido blando; (2) que los lóbulos laterales de una línea bajo la
costilla vean la pleura vecina con la transmisión de la vecina, que no tiene la costilla delante; (3) atenuar la costilla a la
frecuencia B efectiva del campo profundo (2,5 MHz), cuando el pulso le llega a 1 cm de la piel casi sin desplazar; (4) cobrar
sus caras como un solo cruce de 6 dB; (5) un preajuste que satura la línea pleural. Para el preajuste: bajar la ganancia (lo
que hace el ecografista) o cambiar el rango dinámico (sin fuente).

**Decisión.** (b), con la ganancia.

- **La costilla es una lente** (`src/ultrasound/aperture.ts`, `APERTURE_GLSL` y `STEERED_APERTURE_GLSL`). Un rayo que cruza L mm
  de hueso adelanta su fase k·L, k = 2π·f·(1/c_músculo − 1/c_hueso) (7,5 rad/mm a 3,5 MHz, IT'IS). Una placa solo retrasa el
  frente; una sección redonda es más gruesa en el centro, así que las tomas del cono se suman con fases distintas. La media de
  cada cono (`coherentConeMean`) es la raíz de la potencia de la suma coherente promediada en la banda gaussiana del pulso de
  la pasada C (σ_E = 0,33 MHz): Σ_j Σ_m a_j·a_m·cos(k·ΔL)·e^(−(σ·ΔL)²/2); sin hueso, la media de siempre. La fase de emisión y la
  de recepción son las del haz del modo B (`boneCoherence`); en armónica la emisión va a la mitad y la fuente del armónico es
  ∝ p₁², así que el cono de emisión pierde la coherencia de p₁ al cuadrado (`coneMeanOf`). El hueso de cada toma es la
  cuerda exacta de su costilla: A0 guarda la entrada y la salida del primer tramo de hueso de cada línea antes del espejo (h3)
  con la bisección del espejo, en las vueltas que siguen a la muestra del borde (sin otra copia de la clasificación; con la
  cuenta de segmentos de 0,75 mm la fase era de escalera y no deformaba el frente). En las miradas dirigidas, la cuerda de la
  línea que el camino cruza en su primer hueso (el prefijo dirigido de A2 la publica en o3.z).
- **Los lóbulos laterales ven por su apertura** (`src/ultrasound/clutter.ts`, `FRAG_LATERAL`). Cada vecina entra en el pedestal
  de la pasada D con la menor de las dos transmisiones, min(1, T_destino/T_vecina) (`pedestalShadowFactor`): los caminos de la
  apertura de una línea bajo la costilla hasta una muestra vecina cruzan su costilla. T es la transmisión con que la pasada B
  dibujó cada muestra (A o2.z: bajo la pleura registrada, la de su fila tope), la de la mirada 0 también en las dirigidas. El
  lóbulo principal no cambia.
- **El hueso en la transmisión** (`src/ultrasound/boneTransmission.ts`, `BONE_TRANSMISSION`). Atenúa a la frecuencia del pulso que
  le llega con el desplazamiento que él mismo produce en un pulso gaussiano, f₀ − α′ℓσ_E² = 3,26 MHz con la costilla del avatar
  (estimado, rango 2,5–3,5; `docs/APPROXIMATIONS.md`), y sus caras cuestan cuatro cruces músculo ↔ cortical con las impedancias
  de la tabla, 7,42 dB (derivado; physics.md §2.10: «≈ −7,4 dB»; VExUS cobraba 6 dB). El cartílago sigue a la frecuencia B.
- **El preajuste no satura la línea pleural** (`LUNG_PRESET.gainDb`): −21 dB, la ganancia que deja bajo el blanco el eco pleural
  intercostal más brillante de los tres puntos de partida (medido: +19,4, +20,1 y +19,5 dB con 0 dB), por el enunciado 15 del
  consenso de Demi 2023; estimado (el nivel de la línea pleural sale del eco de interfaz, sin calibrar). El equipo baja ahora
  hasta −40 dB.
- **Pruebas.** La e2e de F-T08 exige la meta: la línea pleural intercostal sin saturar (≤ 0 dB en la pantalla y a menos de 3 dB
  del blanco); cada sombra ≥ 20 dB bajo el eco intercostal; la pleura a más de −40 dB solo dentro de la penumbra física de cada
  línea (el semiancho del cono de emisión en la costilla más 2,5σ del lóbulo principal, `mainLobeLines`); en el núcleo (la
  sombra completa más allá de esa penumbra), la pleura a ≤ −60 dB del eco intercostal y en el negro de la pantalla (el gris de
  8 bits en 0, `blackLevelDb`, −69,7 dB con 70 de rango), y la línea A de orden 2 en el negro en toda la sombra completa. Gemelos
  y equivalencia: la transmisión con apertura de la mirada 0 y la dibujada frente a `look0ApertureTwin` sobre los segmentos de
  la GPU, la cuerda de A0 frente a `boneRunAlongLine` sobre la clasificación de la CPU, la pasada D frente a `lateralTwin` sobre
  el campo que le dio la C y las miradas dirigidas con la fase (`transmissionParity`, `lateralParity`);
  `src/validation/boneTransmission.test.ts` en TypeScript.

**Consecuencias.**

- F-T08 se cumple entera con el preajuste en los tres puntos de partida (GPU real y SwiftShader, las mismas cifras a 0,3 dB),
  que es lo que exige la e2e: en el núcleo de la sombra (25, 25 y 36 líneas)
  la línea pleural queda a −68,7…−86,1 dB del eco intercostal y a −71,1…−88,5 dB en la pantalla (negro); la línea A de orden 2, a
  −100,4…−114,9 dB en toda la sombra completa (antes visible en 86 de 125 líneas); cada sombra, a −38,0…−42,9 dB (−27,0 la
  parcial del borde del sector del BLUE inferior; antes −33,7…−39,3). En las líneas a más de 10 del borde (la medida de antes),
  la pleura en la pantalla pasa de −21,9…−43,4 dB (gris 57–137) a −65,7…−88,5 (gris 0–9: los 0–9 son de líneas del BLUE inferior
  que aún están en su penumbra, a 11–12 líneas del borde con un cono de 10,5).
- Por causa, en el núcleo: la fase quita 2–20 dB a la transmisión con apertura (antes la media del cono sumaba hasta 8 sobre un
  rayo); el hueso a su frecuencia y sus caras, ≈ 16 dB por el centro de la costilla (un rayo pasa de −53,5…−63 a −68,6…−80,4 dB de
  ida y vuelta); el pedestal por la apertura de la línea deja de traer la línea A y hasta 8,6 dB de pleura cerca del borde; el
  preajuste baja todo 21 dB en la pantalla (con él solo, la línea A ya queda en el negro, pero la pleura del núcleo no). Ninguna
  basta sola: cada mutación que quita una hace fallar la e2e.
- Fuera de los tres puntos (medido por la revisión y de nuevo con la armónica corregida, GPU real): en los cortes
  longitudinales de la LAM de los dos lados, del lado izquierdo y de 1,2π el núcleo queda en el negro salvo la LAM a z 20 (gris
  2, 0,6 dB sobre el negro); en un corte oblicuo de 60° la costilla es más ancha y su cuerda más plana (menos lente) y el núcleo
  llega a gris 6 (10 en armónica); en armónica, en el negro en los demás. Con más ganancia la pleura del núcleo reaparece (0 dB:
  gris 25–40). Queda declarado en `rib-acoustics-simplified`.
- La línea pleural intercostal queda a −0,9…−8,6 dB del blanco (gris 243–249 la más brillante); el resto de la imagen baja lo
  mismo: la pared es gris oscura (mediana 29–38) y, sin tocar la TGC, las líneas A se ven hasta ≈ 5 cm y el campo lejano es
  negro. El humo de la aplicación lo juzga así.
- Grosor de la línea pleural (meta F-T05 en la envolvente, A-T11 en la pantalla): la anchura a media altura de la envolvente, que
  no depende de la ganancia, es 0,68–0,85 mm en las líneas intercostales (mediana 0,69–0,73) frente a los 0,61 mm de la PSF axial:
  la mediana cumple ±20 %, no todas las líneas (hasta +39 %, por la incidencia y la PSF lateral). La saturación no era la causa
  de F-T05, pero sí engrosaba la línea en la pantalla: su grosor (gris ≥ la mitad del máximo) pasa de 1,71–2,00 mm a 1,29–1,46 mm.
  En el gemelo B → C → D, a incidencia normal, 0,70 mm a 20 y a 60 mm (+14 %): F-T05 pasa a `it` en
  `anatomyTargets.test.ts`. A-T11 (el grosor crece 0,67 mm/cm con la profundidad en una sonda de sector) sigue sin cumplirse:
  el pulso axial del modelo no depende de la profundidad (`notYetMet`).
- Coste del cuadro en el M4: de 2,5 a 3,1 ms (A +0,17 ms, A0 +0,12, D +0,23), muy lejos de O6. Ranuras de A: los mismos uniforms
  más `uBoneCoh`; A lee además h2 y h3 y D, la transmisión dibujada (el grafo de pasadas lo declara). El chunk principal pasa de
  226,6 a 235,7 kB: su presupuesto sube a 240 y el total de JS a 245.
- Se borra `rib-shadow-pleura-residual`; nueva `rib-acoustics-simplified` (lente de fase fina de hueso homogéneo, sin refracción,
  onda transversal ni desplazamiento por velocidad; la frecuencia del hueso con la costilla de referencia; el pedestal con la
  mirada 0). `no-sidelobes` dice ahora que el pedestal entra por la apertura de la línea.
- Mejoras para ofrecer al origen (VExUS tiene las mismas costillas sobre el hígado y el mismo pedestal): la lente de fase, la
  cuerda exacta en A0, el pedestal por la apertura de la línea, las caras del hueso y su frecuencia.

**Verificación.** `npm run check` y `npm run e2e` en verde; la e2e con GPU real y con SwiftShader. Mutaciones de la e2e de F-T08
(cada una falla, con GPU real, en el BLUE superior): el pedestal sin la sombra (la pleura del núcleo sube a −52 dB del eco
intercostal), el cono sin la fase (en la pantalla, −65…−73 dB: gris), el hueso a 2,5 MHz (−66…−73) y el preajuste con 0 dB (la
línea pleural intercostal saturada). Las paridades nuevas casan a ≤ 10⁻⁴ dB (A de la mirada 0, la dibujada, D y las miradas dirigidas) y la
cuerda de A0 a 0 mm; `boneTransmission.test.ts` comprueba que sin la fase, con el pedestal de siempre o con la media de VExUS
las paridades fallan. Revisión adversarial de contexto limpio (midió con GPU real y SwiftShader en 17 poses, con composición y
armónica; paridades en cinco poses más a ≤ 5·10⁻⁵ dB): sin bloqueantes. Halló que en armónica el cono de emisión no elevaba al
cuadrado la coherencia de p₁ (quedaba 5–20 dB más brillante; corregido: `coneMeanOf`), que F-T08 en el negro depende del
preajuste y del corte (declarado arriba y en `rib-acoustics-simplified`), que min(T_l/T_k) es la cota más favorable del
pedestal (declarada), que la ganancia es una medida del simulador (ahora `estimado`, con su fila en `docs/APPROXIMATIONS.md`),
que las líneas A se ven hasta ≈ 5 cm y no 7, que ninguna unitaria protegía el intervalo de la bisección de A0 (ahora sí) y que
la penumbra depende de la apertura de emisión heredada sin calibrar (declarado). Comprobó que las 9 tomas no oscurecen de forma
artificial (frente a una apertura continua se apartan −2,5…+15 dB, casi siempre hacia más brillante; con 17 tomas el núcleo se
mueve ≤ 1,5 dB), las caras del hueso, su frecuencia, que la composición no cambia el núcleo y que no se pinta nada.

## 21. El banco de fidelidad: las mismas métricas para la pantalla del simulador y para los clips reales

**Fecha.** 2026-09-27.

**Contexto.** Con la línea pleural sin saturar (decisión 20, Demi 2023, enunciado 15) la imagen por omisión se ve oscura: la
pared gris muy oscuro y, bajo la pleura y en el campo profundo, casi negro. El eco pleural está K = 55 dB sobre el moteado del
hígado (`src/ultrasound/interfaceEcho.ts`), así que puede ser física correcta con una presentación (70 dB de rango, la curva
de grises de EchoTwin con c = 3,5) que no es la de un ecógrafo pulmonar, o puede faltar algo (la neblina subpleural, un
suelo de ruido). Mirarlo no lo decide: hacen falta las métricas de la base (`docs/knowledge/reference-images.md` §3) en la
imagen del simulador y en clips reales, invariantes a lo que en los clips web se desconoce (la ganancia y el rango dinámico,
§3.1, principio 5). Objetivos O3 (fidelidad ecográfica: «métricas del banco dentro del rango de referencia») y O6.

**Opciones.** (a) Medir la envolvente de la GPU, como las e2e de F-T01 y F-T08: exacta, pero no comparable con un vídeo. (b)
Medir la imagen mostrada (el gris de 8 bits del lienzo) con funciones puras que no saben de dónde viene el cuadro, las mismas
para el simulador y para los clips, y, solo en el simulador, los mismos niveles leídos en su envolvente sin recortar. (c) Un
clasificador aprendido (FID/KID, G1): pocos clips y no dice qué corregir. Para los niveles que la base no mide (la pared, la
neblina, el campo profundo): en dB (no invariante); sobre la brecha suelo–pleura, (g_x − g_suelo)/(g_pl − g_suelo) (la
primera versión, N1–N3: invariante solo si el suelo se mide, y en el simulador está en el negro); o sin suelo, en «caídas de
línea A» desde la pleura. Para la geometría de cada clip: detectarla en cada medición, o fijarla en el manifiesto.

**Decisión.** (b), con niveles sin suelo, la censura de todo lo recortado y la geometría de los clips fijada.

- **Métricas** (`src/measure/fidelity/`, capa `measure`, sin DOM ni WebGL). El cuadro se muestrea «en el espacio del haz» (una
  fila por px a lo largo del haz desde la piel) con la geometría del sector: la verdadera en el simulador, la del manifiesto en
  los clips. La pleura es la cresta de cada columna, en un clip guiada por la del cuadro medio (±30 %: una fascia o un eco
  hondo pueden ser, en un cuadro suelto, más brillantes); las sombras costales, los tramos con poca energía bajo su cresta
  (umbral de Otsu exacto) cuya cresta —la costilla— está por encima de la pleura y forma una sola superficie (IQR/mediana
  ≤ 0,2; los demás se cuentan como descartados); el perfil axial, la media de las columnas intercostales alineadas en su
  pleura (u = r/d_pl), con los fondos de las líneas A en la mediana. Del §3.2, P1, P2, P4, A1, A2, T1, T2 y S1 (el modo M
  reconstruido con columnas de la pila). Y las propuestas: **M** sin suelo,
  M_x = (g_pl − g_x)/(g_pl − g_A1) —la familia M_x = (g_pl − g_x)/(g_A_k − g_A_(k+1)) con k = 0, la pleura como A_0—, para la
  pared (0,2–0,85 d_pl), la neblina subpleural (1,25–1,75 d_pl) y el campo profundo (3,25–3,75 d_pl, entre las líneas A de
  orden 3 y 4); **N4** = (g_pl − g_pared)/(g_A1 − g_A2), el mismo con k = 1; y **N1–N3**, sobre el suelo de la sombra costal,
  que se siguen midiendo pero no se comparan. Las definiciones son `FIDELITY_BENCH` (`defineParameters`, estimadas, con su
  fila en `docs/APPROXIMATIONS.md`).
- **Censura.** Cada nivel lleva su fracción recortada en el negro del clip (la moda fuera del sector: LUS-01 recorta en 3,
  no en 0) y en el blanco. Una mediana (los niveles de las bandas, los fondos de las líneas A) es una cota con la mitad o más
  recortada; una media o un momento (los picos del perfil, la σ y la autocorrelación del moteado de T1, las correlaciones y σ
  temporales de T2 y S1) con un 5 % (`CLIP_MEAN_MAX`); una anchura por debajo de 5 px (P2) o 3 px (T1 axial) está al límite
  del muestreo (`resolution`); σ_t se mide con suelo en el ruido de cuantización (escalón/√12). Cada métrica que usa un dato
  censurado sale censurada (cota inferior, superior o sin dirección), por cuadro y por clip (la mitad o más de sus cuadros), y
  **la censura llega a la comparación**: un valor censurado es una cota (≥, ≤, «cens.», «resolución»), nunca ↓ ni ↑.
- **Simulador** (`src/app/fidelityBench.ts`, gancho `fidelity`; `e2e/fidelidad.spec.ts`): 30 cuadros de la imagen mostrada a
  30 cps en cada punto de partida, en apnea espiratoria y en respiración tranquila, medidos con la geometría verdadera (la línea
  base) y, simétricamente, con la detectada desde la imagen (en el informe); la coherencia con lo que el simulador sabe (la
  pleura del gemelo de A0, k·D, las líneas que cruzan hueso); los niveles en dB desde el gris (invirtiendo `greyMap.ts`) y
  desde la envolvente en las mismas muestras; la caída por orden de las líneas A frente a F-T02; y un **barrido de ganancia**
  (−30…−12 dB) que prueba que lo que se declara invariante lo es en el simulador y que N1–N3 salen censuradas.
  `LUS_E2E_GPU=1` la corre con la GPU real (Metal).
- **Referencia** (`tools/fidelity/reference.ts`, `npm run fidelity:ref`): el manifiesto (`docs/reference-bank/MANIFEST.json`,
  34 archivos: LUS-01–LUS-04 y los 24 convexos «regular según el dataset» de los sujetos pat1–4 de Born, LUS-35a–x, fuente 14
  de su CSV), con su licencia, su clave de `docs/REFERENCES.md`, su SHA-256, su **sujeto** (anonimizado: los clips de un sujeto
  no son independientes), su **geometría fijada** (tipo, ápice, bordes, arcos, fila de la piel en el borde o no, zonas
  quemadas) y su control de calidad (apto; pleura, líneas A, sombra costal y tiempo fiables). La geometría la propone el
  detector sobre el clip entero (su media y su σ temporal: `npm run fidelity:geometry`, que deja hojas de contacto fuera del
  repositorio, con todo lo que está fuera del sector en negro) y la fija una persona: medir con la detectada cambiaba con la
  ganancia en un abanico cortado por el marco. Cada clip se mide entero; **compuertas automáticas** (`dpl_spread`,
  `few_intercostal`, `floor_above_deep`, `bimodal_crests`, `repeated_frames`) y un clip apto que dispare una que su control de
  calidad no admite hace fallar la prueba. `docs/reference-bank/reference-stats.json` lleva solo números derivados: por clip,
  cuantiles sobre sus cuadros; por estrato de sonda, la distribución de la mediana de cada clip apto **entre clips y entre
  sujetos**, con cuántos hay de cada uno. Con menos de 3 clips o 2 sujetos el estrato se informa sin situar al simulador.
  `npm run fidelity:compare` da la tabla.

**Consecuencias.**

- **Línea base del simulador** (main 9f9fd9f con #22; GPU real, Apple M4, `LUS_E2E_GPU=1`), apnea espiratoria, 30 cuadros;
  gris y dB sobre el blanco de la pantalla (desde el gris / desde la envolvente sin recortar); el negro de 8 bits está en
  −69,7 dB. SwiftShader da lo mismo a ≤ 0,2 grises y ≤ 0,15 dB en el BLUE superior y el PLAPS; en el BLUE inferior la
  envolvente es la misma (≤ 0,06 dB) pero la imagen mostrada no: con SwiftShader la pleura sale 0,4 mm más somera y 5 grises
  más brillante, y M 0,08–0,11 más alto (sin explicar todavía):

  | Punto de partida | d_pl    | Pleura               | Pared              | Neblina subpleural | Línea A 2 / 3            | Campo profundo | Suelo (sombra) |
  | ---------------- | ------- | -------------------- | ------------------ | ------------------ | ------------------------ | -------------- | -------------- |
  | BLUE superior    | 17,4 mm | 211 (−6,6 / −6,8 dB) | 29 (−54,4 / −54,4) | 14 (−61,9 / −61,9) | 114 / 44 (−26,1 / −47,9) | 0 (— / −76,8)  | 0 (— / −111,7) |
  | BLUE inferior    | 13,6 mm | 193 (−9,8 / −2,9)    | 38 (−50,5 / −52,2) | 18 (−59,9 / −61,9) | 95 / 39 (−31,1 / −50,2)  | 0 (— / −76,4)  | 0 (— / −108,7) |
  | PLAPS            | 15,0 mm | 225 (−4,5 / −3,3)    | 29 (−54,6 / −54,6) | 14 (−61,6 / −61,3) | 119 / 50 (−24,9 / −45,8) | 0 (— / −75,4)  | 0 (— / −111,1) |

  M de la pared, la neblina y el campo profundo: 1,88 / 2,03 / ≥ 2,18 (BLUE superior), 1,59 / 1,79 / ≥ 1,97 (inferior), 1,86 /
  1,99 / ≥ 2,13 (PLAPS): **el campo profundo y el suelo quedan bajo el negro** (6–7 y 39–42 dB por debajo), así que M del campo profundo es
  una cota inferior y N1–N3 (0,127–0,196, 0,064–0,092, 0) no son medidas: su suelo es el recorte. N4 2,61–2,82 (censurado en
  el BLUE inferior: la línea A de orden 3 está en el negro en el 14–16 % de sus columnas); P1 1,10–1,20; P2 1,23–1,32 mm (0,076–0,091 d_pl) está al límite del muestreo
  (4,6–4,9 px; `resolution`), y T1 axial también en el BLUE inferior y el PLAPS; P4 0,31–0,37 d_pl.

- **Líneas A.** La caída por orden es 17,7–22,7 dB en la pantalla y 17,9–22,5 dB en la envolvente (órdenes 1→2, 2→3 y 3→4),
  frente a 20,2–20,4 dB de la fórmula de F-T02 con los números del simulador: −20·log₁₀(R_p·χ·R_t) = 19,3 dB (χ = 0,36 por la
  rugosidad de la pleura, −8,9 dB; R_t = 0,3, −10,5 dB), más la pared hasta la pleura (4,6–5,6 dB) menos la compensación
  nominal (3,6–4,4 dB). Del orden 1 al 2 cae 0,5–4,5 dB menos que después (la línea pleural es el eco de la cara con su lóbulo,
  en el foco). Con 70 dB de rango solo caben dos: r₂ 0,48–0,56; r₃ 0,23–0,24 es una cota (su fondo, en el negro); A1 ≤ 0,013
  d_pl.
- **Coherencia (lo que exige la e2e):** la pleura detectada a −0,11…−0,17 mm del cruce del gemelo de A0 (la peor, 0,24 mm) en
  las 63–174 columnas intercostales; las líneas A de orden 2 y 3 a +0,11…+0,34 mm de k veces la línea pleural mostrada y a
  −0,17…−0,32 mm de k·D; los núcleos de las sombras detectadas sobre líneas que cruzan hueso (94,2–100 %) y todas las sombras
  completas con núcleo cubiertas (la parcial del borde del BLUE inferior, 3 líneas, no). La geometría detectada desde la
  imagen: ápice a 0,4–1,0 px, bordes a ≤ 0,25°, piel a ≤ 0,5 px, salvo en el BLUE inferior, de bordes oscuros (ápice a 8,1–13,7
  px, borde derecho a 1,7–2,9°, piel a 4,8–7,7 px); **el fondo, a 32,6–41,7 mm de los 120**: lo negro no se ve. Con ella, d_pl
  sale 0,1–0,6 mm más larga (la piel detectada, más honda).
- **Pila.** La pared no cambia entre cuadros ni respirando: σ temporal 0,004–0,16 grises, T2 1,000, y los 29 pares de cada pila
  tienen menos de ½ gris de cambio medio (en un clip real, la compuerta `repeated_frames`). Bajo la pleura, σ_t 0,010–0,026
  grises en apnea y 3,3–4,6 respirando: S1 es una cota inferior (≥ 11,3–16,0: la σ de encima está bajo el escalón/√12) y en
  apnea no es una medida; la decorrelación bajo la pleura, 0,15–0,20 s.
- **Barrido de ganancia** (BLUE superior, apnea, 3 cuadros; −21 dB es el preajuste): d_pl, M de la pared y de la neblina, N4, P1,
  P4 y T1 se mueven ≤ 5 % mientras no están censurados (M de la pared 1,88–1,92 entre −30 y −15 dB), y se comparan de verdad a
  −24 y −18 dB. Lo que se recorta sale censurado: la neblina en el negro a −30 dB, la pared (12 %) para T1 a −30 dB, la
  pleura en el blanco desde −15 dB (5 % de sus columnas; 44 % a −12 dB) y con ella M, N4, P1 y A2; el campo profundo, siempre
  (M del campo profundo es una cota inferior en todo el barrido). N1–N3 dependen de la ganancia (N1 0,068–0,201 entre −30 y
  −12 dB) y salen censuradas en todas.
- **Referencia** (`npm run fidelity:ref`, los 34 clips enteros, 8 277 cuadros, en 3–4 min): aptos 18 —16 convexos de 6 sujetos
  (LUS-01, LUS-04b, 04f, 04g y 12 de LUS-35), LUS-02 sectorial y LUS-03 lineal—; no aptos 16: los cuatro recortes LUS-04a y
  LUS-04c–e, sin pleura identificable; LUS-35a y 35b (pat1) no son pulmón limpio; 35h, 35j (pat2) y 35v (pat4) traen el
  diafragma y el hígado; y 35c–e, 35l, 35m, 35p y 35t, con la pleura que salta entre cuadros o sin forma de pulmón (control de
  calidad del manifiesto: la pleura revisada a ojo por el agente en las hojas de contacto, lo demás por el detector y las
  compuertas; pendiente de revisión humana). Con líneas A, 10 convexos de 5 sujetos; con una sombra costal limpia, 2 (35i y
  35k, del mismo sujeto). El detector se aparta de la geometría fijada ≤ 4,3 px y ≤ 0,9° en los aptos salvo LUS-01 (el abanico sale del
  cuadro: lo propone lineal) y LUS-35r (borde derecho oscuro), y en 35e, 35h, 35j, 35l, 35p y 35v toma un borde oscuro (hasta
  38°): por eso se fija.
- **El simulador frente a la referencia** (respiración tranquila, geometría verdadera; ↓ bajo el p10 y ↑ sobre el p90 del
  estrato convexo; entre paréntesis, clips/sujetos; una cota no se marca, ni un estrato de menos de 3 clips o 2 sujetos):

  | Métrica                  | Convexa p10–p90 [mediana] (clips/sujetos) | Lineal (LUS-03) | Sectorial (LUS-02) | Simulador: BLUE sup. / BLUE inf. / PLAPS            |
  | ------------------------ | ----------------------------------------- | --------------- | ------------------ | --------------------------------------------------- |
  | M pared                  | 0,75–1,53 [1,11] (9/4)                    | —               | 1,55               | 1,89 ↑ / 1,59 ↑ / 1,85 ↑                            |
  | M neblina subpleural     | 0,92–1,36 [1,04] (9/4)                    | —               | 1,10               | 2,04 ↑ / 1,79 ↑ / 1,99 ↑                            |
  | M campo profundo         | 1,49–2,75 [2,01] (9/4)                    | —               | 2,04               | ≥ 2,19 / ≥ 1,97 / ≥ 2,12                            |
  | N4 cociente de brechas   | 1,75–6,75 [3,06] (9/4)                    | —               | 3,66               | 2,58 · / 2,76 (cens.) / 2,82 ·                      |
  | P1 brillo de la pleura   | 2,99–5,05 [4,02] (2/1)                    | 1,36            | —                  | 1,10 / 1,20 / 1,20                                  |
  | P2 grosor pleural (d_pl) | — (todos al límite del muestreo)          | 0,046           | —                  | 0,076 / 0,091 / 0,085 (resolución)                  |
  | P4 (d_pl)                | 0,35–0,38 [0,36] (2/1)                    | 0,36            | —                  | 0,37 / 0,34 / 0,31                                  |
  | A1 (desfase)             | 0,10–0,23 [0,19] (9/4)                    | —               | 0,11               | 0,007 ↓ / 0,013 ↓ / 0,011 ↓                         |
  | A2 r₂                    | 0,11–0,30 [0,22] (9/4)                    | —               | 0,51               | 0,56 ↑ / 0,49 ↑ / 0,53 ↑                            |
  | A2 r₃                    | 0,01–0,12 [0,07] (10/5)                   | —               | 0,52               | 0,23 / 0,23 / 0,24 (cens.)                          |
  | A2 líneas A visibles     | 0,9–1 [1] (10/5)                          | —               | 3                  | 2 ↑ / 2 ↑ / 2 ↑                                     |
  | T1 grano axial (d_pl)    | — (todos al límite del muestreo)          | 0,017           | —                  | 0,050 / 0,056 / 0,053 (las dos últimas, resolución) |
  | T1 grano lateral (d_pl)  | 0,070–0,18 [0,096] (16/6)                 | 0,035           | —                  | 0,063 ↓ / 0,079 · / 0,079 ·                         |
  | T1 σ/prominencia pleural | 0,11–0,31 [0,19] (16/6)                   | 0,092           | 0,066              | 0,039 ↓ / 0,042 ↓ / 0,035 ↓                         |
  | T2 pared                 | 0,971–0,993 [0,984] (15/6)                | —               | 0,995              | 1,000 ↑ / 1,000 ↑ / 1,000 ↑                         |
  | T2 bajo la pleura        | 0,959–0,994 [0,984] (15/6)                | —               | 0,930              | 0,998 (cens.) / 0,997 (cens.) / 0,990 ·             |
  | S1                       | 0,76–1,68 [1,18] (15/6)                   | —               | 2,14               | ≥ 12,3 / ≥ 11,3 / ≥ 16,0                            |
  | S1 decorrelación (s)     | 0,41–1,01 [0,58] (15/6)                   | —               | 0,047              | 0,20 ↓ / 0,19 ↓ / 0,15 ↓                            |

  Lo que dice, sin afirmarlo (es la entrada del ciclo 3b): en la presentación, la pared y la neblina del simulador quedan más
  lejos de la pleura, en caídas de línea A, que en los clips convexos (M 1,6–2,0 frente a 1,0–1,1), y el campo profundo, en el
  negro; las líneas A decaen más despacio en gris (r₂ 0,5 frente a 0,22) y se ven dos (en los clips, una); el moteado de la
  pared es más tenue frente a la pleura (T1) y la pared, quieta (T2, S1). **M mezcla el nivel con la reverberación**: su
  unidad, la caída pleura → línea A, es física (R_p·χ·R_t·T(D), decisión 20) y en el simulador no es la de los clips (r₂), así
  que una M más alta puede ser una pared más oscura o una línea A más brillante; se lee con A2 al lado. Y es invariante a lo
  afín en el gris, que en el simulador es la ganancia pero no el rango dinámico (la curva de grises es exponencial en el
  nivel: cambiar el rango cambia el exponente). P1 y P4 solo tienen 2 clips de un sujeto con sombra costal limpia: no se
  sitúan. P2 y T1 axial están al límite del muestreo en los clips de 370 px (FWHM 2,2–4,1 px) y en el simulador.

- **Mutaciones.** Del código, aplicadas a mano con 200 corridas y sin encoger el contraejemplo; cada una la atrapa su propiedad
  en 1–2 corridas: un umbral absoluto en la visibilidad de las líneas A (`&& pk.prominence >= 0.01`, a = 0,11), M sin la línea
  A ((g_pl − g_x)/g_pl), N1 sin restar el suelo (g_x/g_pl), la media altura de P2 sobre cero y no sobre el fondo local, T1
  σ/g_pl sin restar la pared (la continua), y los extremos de fila en el borde del cuadro dentro de la recta del borde (la
  tubería: el ápice a 191 px). Sin censurar la pleura recortada, el barrido de ganancia falla a −12 dB (M de la pared +8,6 %);
  sin el suelo de σ_t, S1 en apnea es el cociente de dos ceros (la prueba de la pila).
- **Lo que no es invariante y queda dicho:** la geometría detectada. El soporte temporal compara σ_t con el brillo sobre el
  fondo, así que con el sector desplazado hacia el blanco una pared quieta deja de «variar» y la piel detectada se hunde
  (`fidelityInvariance.test.ts` lo deja escrito); un extremo de fila a menos de 3 px del marco no es el borde del abanico.
  Por eso se fija. Los clips también enseñaron que la piel puede no estar en el borde superior de un recorte (LUS-01: la línea
  A de orden 2 en u ≈ 2,2; sin A1), que los `.ogv` de Commons traen texto, escalas y un ECG quemados (LUS-03, con el número de
  registro, la institución y la fecha: se excluyen y hay que recortarlos antes de cualquier mosaico), que el suelo de la sombra
  no está en el negro (≈ 6 grises) y que LUS-03 repite cuadros (Theora a 30 cps de un original más lento; fuera T2 y S1).
- La e2e añade 4 pruebas (≈ 4–9 s cada una con GPU real). Limitación `display-uncalibrated`.

**Verificación.** `npm run check` en verde; la e2e de fidelidad con GPU real y con SwiftShader. Las métricas, sobre sintéticos con
respuesta conocida (`src/validation/fidelityBench.test.ts`: la geometría, también de un abanico cortado por el cuadro; el
negro del clip; las zonas excluidas; la pleura guiada frente a una fascia más brillante; las crestas de dos poblaciones; P4,
las líneas A a k·d_pl con r_k = decay^(k−1), los niveles, M, N1–N4, P1, P2 = 2,355σ con su límite de resolución, el grano de
T1; la censura de las medianas, de los momentos y de la pila; T2 y S1 con y sin deslizamiento; los cuadros repetidos). La
invariancia afín con fast-check (`src/validation/fidelityInvariance.test.ts`, 200 corridas por propiedad, semilla fija, nivel
lento, ≈ 2 min): continua con a ∈ [0,05; 3] (1e-6, también la censura), en 8 bits con dos contrastes (`TOL_8BIT`, el peor de
200 corridas con 2–3× de margen) y la tubería del banco (el detector propone la geometría de un abanico cortado por el
cuadro, se fija y se miden los dos contrastes con el cambio solo dentro del sector). El manifiesto y las estadísticas
(`src/validation/fidelityReference.test.ts`: licencias abiertas, `in_repo` false, sujetos, geometría fijada, control de
calidad, compuertas, estratos entre clips y sujetos, la comparación con cotas y estratos pequeños; cada regla con su defecto);
`src/validation/fidelityReferenceBank.test.ts` (dorada) vuelve a medir el banco real y exige las estadísticas del repositorio
(se salta sin la carpeta o sin ffmpeg). Pendiente: la revisión humana de las hojas de contacto y del control de calidad, y la
revisión adversarial de contexto limpio.

## 22. El campo respiratorio invertible por construcción y la excursión de la base (A-T13)

**Fecha.** 2026-09-27.

**Contexto.** El paso C4 (decisión 19) probó la excursión de la base en supino (16 mm en respiración tranquila, 53 en la
profunda; A-T13) y la retiró: el botón «Profunda» bajaba la cortina 30 mm, los de VExUS (A-T13 en `notYetMet`), y el
simulador mentía (`docs/MISSION.md`, prioridad 1). El campo respiratorio de VExUS es p = m + D·w(m)·dir, con dir = (0, 0,15,
−1) normalizada y w el producto de las rampas de la pared (25 mm), de la columna (30) y, desde la decisión 18, del corazón (50);
su jacobiano es 1 + D·∂w/∂dir. Medido con 53 mm en una rejilla de 4 mm de todo el tronco: negativo en ≈ 348 cm³ (mínimo
−0,53), el 89 % sobre el corazón (el pulmón que baja entero encima de un corazón que no respira: D·1,5/50 = 1,6) y el 11 %
bajo el reborde costal anterior (la componente anterior lleva las vísceras contra la pared, que engruesa hacia el abdomen:
1,17). Su inversa, dos pasos de punto fijo, m = q − d(m), no converge donde el peso cambia deprisa: con 30 mm erraba > 1 mm
en el 9,6 % de las muestras a menos de 8 cm de la piel (hasta 15 mm; `respiratory-inverse-fixed-point`), con 53 en el
18–21 % (hasta 26).

**Opciones.** Para el campo: (a) ensanchar las rampas hasta que D·|∂w| < 1 (la del corazón, ≥ 80 mm en todas las
direcciones: el pulmón y las cúpulas quietos a 13 cm del corazón); (b) el flujo del campo de velocidades w·dir, un
difeomorfismo con cualquier D, pero cuya inversa es una integración sin una cota de error barata en la GPU; (c) un campo
caudal con la ley de altura del pulmón: la cúpula y lo que hay debajo bajan D, y el pulmón por encima, cada vez menos, hasta 0
en su vértice. Para la inversa: Newton con salvaguarda (necesita derivadas de un peso que es C¹ a trozos, y la salvaguarda es
una bisección), regula falsi o ITP (la misma cota en el peor caso, más código) o una bisección.

**Decisión.** (c), con una bisección.

- **Dirección caudal** (`src/anatomy/deformation.ts`): dir = (0, 0, −1). La base mide la excursión y el borde del pulmón en
  la craneocaudal, y la cortina (`lungEdgeZ`) y el deslizamiento (`lungSlideMm`) ya bajan en z; la componente anterior de
  VExUS era la del hígado bajo la pared del abdomen. Sin ella, el término de la pared baja de 1,17 a 0,72 con 53 mm.
- **Ley de altura** (`AnatomyScene.respiratoryHeight` y `respiratoryWeightAt`; GLSL `respWeightAt` con `uResp.yz`): el peso
  se multiplica por 1 hasta la cota de la cúpula (`domeTopZ`, 13,7 mm en el avatar: la cúpula y todo lo que hay debajo bajan
  D) y por una recta hasta 0 a `slideSpanMm` (147 mm) más arriba, en z 161, sobre la 1.ª costilla de la LMC (z 150) [SUPUESTO:
  el tramo del deslizamiento de la decisión 19, llevado de la base de cada columna a la cota de la cúpula; el deslizamiento se
  apaga a 128–145 mm]. No es una ley medida sino una construcción: entre la cúpula y z 161 el pulmón del campo se estira
  (jacobiano ≥ 1) y baja cada vez menos; por encima no baja ni se estira, aunque el pulmón del modelo llega al tope del tronco
  (z 300, sin vértice: `lung-border-table`). Da lo que pide la clínica (el pulmón alto casi no se mueve; Lichtenstein: el
  deslizamiento es mínimo en el ápex) y un campo que el corazón quieto no pliega: el pulmón de encima de él ya casi no baja, sin
  tocar la rampa del corazón.
- **La pared que mira el campo** (`respiratoryWallOf` y `respiratoryWallBlendMm` en `src/anatomy/organs/chestWall.ts`, TS y
  GLSL; `anatomy.respiratoryWall.slopeMax`, 0,1 mm/mm, estimado). Lo que baja junto a una pared que engruesa hacia abajo se
  comprime, y bajo el reborde costal la pared del tórax pasa a la del abdomen (en el avatar, de 13 a 28 mm en 100 mm, 0,23
  mm/mm; 0,27 en la delgada; más con más grasa en el abdomen): con ella el campo se plegaba con 62 mm en la delgada, 73 en el
  avatar o 53 con 25 mm de grasa en el abdomen (lo halló la revisión). Donde el abdomen es más grueso que el tórax, el peso
  mira la pared con ese paso alargado hasta que no engruese más deprisa que 0,1 mm/mm; donde es más fino, la pared de verdad
  (adelgazar hacia abajo solo estira). Nunca más fina que la de verdad: la anatomía no cambia, solo dónde empieza a bajar el
  tejido de dentro. El término de la pared en el jacobiano queda así ≤ 1,5·0,1/25·D por construcción, con cualquier hábito.
  El precio crece con la grasa del abdomen (la LAM derecha y la cúpula en (x, 0) con 53 mm, medidos en el mundo):

  | Grasa del abdomen (pared del abdomen)  | Paso (avatar / delgada / obesa) | Pared extra en el reborde (avatar / delgada / obesa) | Cúpula en x −130 / −120 / +130 |
  | -------------------------------------- | ------------------------------- | ---------------------------------------------------- | ------------------------------ |
  | 5 mm (19 mm)                           | 100 / 135 / 100 mm              | 0 / 1,5 / 0 mm                                       | 40,6 / 53 / 34,6 mm            |
  | 14 mm (28 mm; el paciente por omisión) | 228 / 270 / 100 mm              | 9,0 / 12,4 / 0 mm                                    | 40,6 / 53 / 33,4 mm            |
  | 25 mm (39 mm)                          | 393 / 435 / 225 mm              | 22,0 / 25,1 / 8,7 mm                                 | 10,2 / 43,4 / 6,8 mm           |
  | 35 mm (49 mm)                          | 543 / 585 / 375 mm              | 33,0 / 36,0 / 20,6 mm                                | 0 / 7,6 / 0 mm                 |

  En el avatar por omisión la pared extra es de 9,0 mm en el reborde costal de la LAM, 5,5 a la altura de la reflexión y menos
  de 1 mm desde z −39 (12,4, 9,2 y desde z 1 en la delgada), y no cambia la cúpula junto a la axilar (−120: 53 mm). Con 25–35 mm
  de grasa el paso llega a todo el tórax y la cúpula lateral se queda quieta mientras la cortina baja 53 mm sobre ella (meta
  pendiente, `notYetMet`); la grasa del abdomen no se cambia desde la interfaz (las variantes del tórax no la tocan), y la base
  dice lo contrario: la excursión crece con el IMC (Boussuges). En la obesa con 5–14 mm de grasa, la cúpula en x −130 baja 5 mm
  por la rampa de su pared de verdad (24 mm).

- **Invertible por construcción.** A lo largo de cada vertical el mapa es z ↦ z − D·w(x, y, z), y su jacobiano, 1 − D·∂w/∂z,
  es afín en D: positivo con una excursión lo es en toda fase de todo patrón que no la pase. Sus dos términos: la pared, ≤
  0,006·D por construcción, y el corazón, que la ley de altura hace pequeño (el pulmón de encima baja poco). Medido (rejilla de
  4 mm y paso de 0,25 mm en z, las seis variantes del tórax con 5, 14 y 35 mm de grasa en el abdomen): mínimo 0,574–0,631 con
  53 mm y 0,397–0,478 con 75, siempre sobre el corazón; el campo se plegaría con más de 124 mm. Máximo 2,51, bajo el corazón.
  El campo no conserva el volumen: con 53 mm, el pulmón sobre el corazón se comprime al inspirar (a 0,57 de su alto en la
  vertical) y las vísceras bajo él se estiran (a 2,51).
- **Inversa exacta** (`respiratoryInverse`; GLSL `toMaterial`): la raíz de z − D·w(z) = q_z está en [q_z, q_z + D] (0 ≤ w ≤ 1);
  una bisección de `RESPIRATORY_INVERSE.steps` = 10 pasos deja el punto material a ≤ D/2¹¹, 0,026 mm con 53 (la tolerancia
  declarada, 0,05 mm, la comprueba el módulo con la mayor excursión del rango de la base, 75 mm); en el mundo el residuo es ese
  error por la jacobiana, ≤ 0,068 mm. Sin peso en q (la pared, la columna, el corazón, el pulmón alto) devuelve q; con el peso
  entero en q + D (las vísceras), q + D. Una bisección y no Newton: la cota sale con un número fijo de pasos y sin derivadas; y
  con el campo vertical, lo que el peso no cambia con z se lee una vez por muestra (`respiratoryColumn`, GLSL `RespCol`: la
  profundidad, el téxel de la columna de la pared, `wallColumnTexel`, el largo de su paso al abdomen y la columna vertebral), así
  que cada paso solo mezcla dos alturas de la pared, el corazón y la recta.
- **La excursión de la base** (`physiology.diaphragmExcursion`, `src/physiology/respiratory.ts`): 16 mm (derivado:
  Gerscovich y Cardenas vía Santana, Boussuges) y 53 (Kantarci vía Santana), en lugar de 10 y 30; en la mujer (`habitus.chest`),
  47 en la profunda (Kantarci), y la tranquila, la misma (la base no la separa en supino). El descenso que se toma por TLC
  (`anatomy.lungBorder.zoaTlcCaudalMm`, el engrosamiento de la ZOA) y el de la inspiración máxima de Yoshida
  (`anatomy.chestWall.inspirationReferenceMm`) pasan a ser la excursión profunda del hombre (derivados; salen de
  `docs/APPROXIMATIONS.md`).

**Consecuencias.**

- A-T13 se cumple: la cortina de la LAM baja 16 mm en la respiración tranquila y 53 en la profunda, a los dos lados (medido en
  el mundo por el camino del motor: la lámina queda dentro de la pared que mira el campo); junto a la columna se detiene en la
  reflexión (23 mm). La cúpula derecha junto a la axilar, con el peso entero, baja la excursión de cada patrón (0, 16, 53 y 53
  mm; 47 en la mujer). La ZOA en la respiración tranquila, 2,84 mm (antes 2,93).
- **A-T15 a TLC depende de un supuesto.** Con 53 mm la cortina tapa a TLC el EIC 9 de la LAM, donde se medía. La prueba mide
  ahora a TLC en el primer EIC 8–10 (la meta: EIC 8–10 entre la LAA y la LAM) cuyo centro queda a ≥ 5 mm bajo la cortina y a ≥
  10 mm sobre la inserción de la ZOA (la reflexión menos `anatomy.lungBorder.zoaBelowReflectionMm`, 20 mm [SUPUESTO]; la longitud
  de la ZOA es NO ENCONTRADO en la base). En el avatar: el EIC 9 de la LAA (10,3 mm sobre la inserción; Boon y el consenso miden
  en el 8.º–9.º por delante de la LAA) y, en la LAM, ninguno (el centro del EIC 10 queda a 4,4 mm de la inserción): la LAM se
  mide en FRC (EIC 9). En el rango del supuesto (10–40 mm): con menos de 19,7 mm la LAA tampoco tiene EIC y la prueba falla (con
  15, comprobado: falla por su aserción); con ≥ 25,6 la LAM mide en el EIC 10. En main, con 30 mm, el EIC 9 de la LAM no
  dependía del supuesto.
- La inversa yerra ≤ 0,026 mm en el punto material en todo el tronco (antes, 26 mm con 53); los dos pasos de punto fijo sobre el
  campo nuevo yerran hasta 28 mm (> 1 mm en el 8,2 % de las muestras a menos de 8 cm de la piel).
- **La cúpula junto al corazón baja menos que la excursión** (la rampa del corazón quieto, decisión 18, alcanza la cúpula de
  debajo; medido con 53 mm en el suelo del pulmón en el mundo): la derecha, el 100 % junto a la axilar y el 52 % en su vértice;
  la izquierda, el 35 % junto a la axilar (110, 0) y el 4 % en su vértice. La base da la misma excursión a los dos lados
  (Boussuges): queda como meta pendiente (`notYetMet` en `respiratoryField.test.ts`) y en `respiratory-field-vertical`. Hoy no
  se ve (el abdomen es negro y la cortina tapa la cúpula, A-T14), pero una excursión asimétrica es el signo de una parálisis
  hemidiafragmática: se verá con el hígado y el bazo. Junto a la pared del flanco la cúpula también baja menos (la rampa de
  la pared: el 66 % en (±110, −40)).
- **El deslizamiento** (decisión 19) sigue al borde, que ahora baja la excursión de la base: en la respiración tranquila, 16 mm
  en la base, 8,7 en el punto BLUE inferior, 8,4 en el PLAPS y 6,7 en el superior (antes 10, 5,4, 5,2 y 4,2); el cociente de
  F-T12 no cambia (0,416). Frente a la base (`docs/knowledge/physics.md` §3.2):
  - D1 (Briganti, UCI en ventilación mecánica con 6–8 mL/kg, base un EIC sobre el diafragma): 8,6 ± 4,3 mm. El modelo da 16 en
    la base, +1,7 DE (antes 10, +0,3), porque `RespiratoryModel.excursionMm()` no mira `ventilation`: en ventilación mecánica
    usa la excursión de la respiración espontánea. No es la misma condición.
  - D4 (Lichtenstein, opinión de experto, respiración tranquila, punto BLUE inferior): ≈ 15 ± 5 mm. El modelo da 8,7, −1,3 DE
    (antes 5,4, −1,9): se acerca.
  - D5 (Costamagna, 7 sanos en respiración tranquila, sonda lineal, 143 clips en 12 campos): 5,4 ± 2,5 mm. Es la única cifra
    documentada en la misma condición, pero la base no la da por sitio: la media del modelo en 12 campos (LMC EIC2 y EIC4, LAM EIC3
    y EIC6, LAP EIC4 y EIC8) pasa de 5,8 a 9,3 mm, de +0,2 a +1,5 DE. Se aleja, sin salirse de 2 DE, y ningún sitio del modelo
    contradice una cifra documentada del mismo sitio y la misma condición (el BLUE superior, 6,7, no tiene cifra; D4, en el
    inferior, es opinión). Cómo resolverlo sin forzarlo: el borde del pulmón baja la excursión (A-T13, `curtainDescentRatio` = 1),
    pero el deslizamiento de la pleura visceral en la base podría ser una fracción de ella (≈ 0,6 lleva la media de los 12
    campos a los 5,4 de D5 y el BLUE inferior a ≈ 5, −2 DE frente a D4); separar las dos amplitudes es otro paso, con la
    evidencia de D5 por región si se encuentra.
  - La inspiración profunda (53 en la base, 28,8 en el BLUE inferior, 27,5 en el PLAPS y 22,0 en el superior) es una
    extrapolación: los rangos de la base (physics.md §3.2) son de la respiración tranquila.
  - Latente: la ventilación mecánica no se alcanza desde la interfaz, y `excursionMm()` debería depender de ella (con D1).
- Lo que se mueve distinto: el pulmón sobre la cúpula baja menos (a media altura de la ley, la mitad) y nada baja ya hacia
  delante (con 53 mm la componente anterior habría sido 8 mm). La ventana cardiaca no se achica al inspirar (el pulmón no se
  interpone: el corazón y la lámina junto a la ventana no se mueven), y la e2e lo exige; en el paciente real el pulmón la tapa
  en parte (`heart-simplified`).
- Coste en el M4 (intercalado con main, en la inspiración profunda): la pasada A0, 0,45 → 0,55 ms en el BLUE superior y 0,53 →
  0,53 en el PLAPS; la B, 1,36 → 1,39 y 1,23 → 1,29; el cuadro, 3,2–3,3 ms antes y después (en espiración, algo menos: sin
  descenso la inversa no evalúa el peso). Muy lejos de O6 (≥ 30 FPS). El chunk principal pasa de 235,7 a 240,4 kB (la GLSL y
  las notas de evidencia de los parámetros nuevos): su presupuesto sube a 245 y el total de JS a 250.
- Limitaciones: se borra `respiratory-inverse-fixed-point`; `lung-border-table` ya no habla de la excursión; nueva
  `respiratory-field-vertical` (una traslación caudal con pesos, sin movimiento anterior ni cizalla en la pleura).
- Mejora para ofrecer a VExUS: su inversa es la misma de dos pasos de punto fijo; la bisección sirve a lo largo de su
  dirección. Queda por decidir para la unión la excursión compartida: 16/53 mm aquí, 10/30 en VExUS (`docs/UNIFICATION.md`).

**Verificación.** `npm run check` y `npm run e2e` en verde. `src/validation/respiratoryField.test.ts` (fast-check, 20 000
puntos en las seis variantes del tórax con tres grasas del abdomen): el jacobiano ≥ 0,5 con 53 mm y ≥ 0,35 con 75; cada vertical
estrictamente creciente con 75 mm en una rejilla de 6–8 mm con paso de 0,5; la pared que mira el campo, nunca más fina que la de
verdad ni más gruesa que la cota de la GLSL, y sin engrosar hacia abajo más deprisa que su pendiente; material → mundo → material
≤ 0,05 mm y ≤ D/2¹¹ con toda excursión hasta 75 mm; el residuo en el mundo; y, por el camino del motor, la excursión por patrón en
la cúpula (también en la mujer), A-T13 en el mundo, la ventana cardiaca quieta en la inspiración profunda y, pendientes
(`notYetMet`), la cúpula izquierda y la cúpula lateral con 35 mm de grasa en el abdomen. Con sus mutaciones: el campo de VExUS y el caudal sin la ley de altura se pliegan con 53 mm
(fast-check los encuentra), el peso con la pared de verdad se pliega bajo el reborde (la delgada con 75 mm, el avatar con 53 y 35
mm de grasa: la banda es fina y se recorre en una rejilla de 3 mm) y los dos pasos de punto fijo yerran más que la tolerancia.
`anatomyTargets.test.ts` (A-T13 en la inspiración profunda pasa a `it`; A-T15 con el EIC a ≥ 10 mm de la inserción de la ZOA,
que con `zoaBelowReflectionMm` = 15 falla), `anatomy.test.ts` (el peso contra la cuenta con la pared de la clasificación), `physiologyUnits.test.ts`, `properties.test.ts`, `chestWall.test.ts` y `equivalenceSweep.test.ts`
(una «GPU» con la inversa de VExUS la ven el barrido y el volumen). En la e2e, la equivalencia en la inspiración profunda (53 mm)
suma la ventana cardiaca, el borde de la LAM izquierda y la cortina derecha al barrido de planos, con ≥ 0,999 de acuerdo interior
(medido: 1 en los seis, con GPU real y con SwiftShader), y la pleura de A0 en sus cinco planos; con la GLSL en dos pasos de punto
fijo falla (la cáscara de las caras, 0,998, ya en la respiración tranquila; con 53 mm, cuatro planos bajan a 0,992–0,9989 con la
GPU real). Revisión
adversarial de contexto limpio (midió con scripts, la GPU real y SwiftShader, y corrió mutaciones de la TS y de la GLSL): sin
bloqueantes; halló que la invertibilidad dependía de la excursión (62 mm en la delgada) y de la grasa del abdomen (lo resuelve la
pared que mira el campo), la cúpula izquierda casi quieta sin declarar, un signo en la mejora para VExUS, la tolerancia que es la
del punto material, una prueba tautológica del peso, la excursión de la mujer y la ley de altura que no es la del deslizamiento;
aplicado. Sus cifras: la inversa, 0,0258 mm en 1,2 M muestras (también con la compresión y en float32 emulado); las mutaciones
de la GLSL sin la ley de altura o con 5 pasos fallan en la e2e. Segunda ronda (integrar con arreglos, sin bloqueantes; confirmó
la invertibilidad en 91 escenas, la inversa, los gemelos, que las mutaciones muerden y las cifras de Santana, Kantarci, Gerscovich
y Boussuges contra el texto completo): la pared que mira el campo frenaba la cúpula lateral con más grasa en el abdomen sin
declararlo (declarado arriba, con su meta pendiente) y conservaba el grosor del tórax donde el abdomen es más fino (hasta 8,8 mm
en el avatar con 5 mm de grasa y 15,8 en la obesa: corregido, ahí mira la pared de verdad); A-T15 colgaba de la longitud
estimada de la ZOA sin decirlo; el deslizamiento sin evaluar frente a D1, D4 y D5; la justificación de la ley de altura; cifras
que no cuadraban entre los documentos; el umbral de los planos nuevos de la e2e, que no veía la mutación; aplicado.

## 23. Adquisición normal con navegación torácica 3D y cine espacialmente coherente

**Fecha.** 2026-09-28.

**Contexto.** La interfaz mostraba siete deslizadores básicos y tres columnas mientras el alumno movía
la sonda sobre la imagen sin una referencia espacial. La profundidad de 65 mm se redondeaba a 7 cm, el
foco ofrecía valores por encima de la profundidad y el oyente de la sonda cancelaba Espacio incluso en
botones. El cine conservaba imagen y ajustes, pero no la pose ni la respiración que produjeron cada cuadro.
Objetivos: O5 (obtener la ventana moviendo la sonda) y O6 (interacción, reproducibilidad y rendimiento),
conservando la cadena causal de O1–O3.

**Opciones.** Se consideró añadir un atlas GLB externo. Sin registro anatómico, su piel y sus costillas
podrían no coincidir con lo que encuentra el haz. Se eligió representar primero la anatomía compartida;
la mejora del contorno torácico debe aplicarse después al motor y a su representación de forma conjunta.
Una reescritura de la aplicación o del renderizador ecográfico no es necesaria para esta entrega.

**Decisión.**

- `src/ui/thorax/` monta un navegador Three.js con piel paramétrica y referencias costales derivadas de
  la escena. La huella, el marcador y el sector opcional utilizan el marco efectivo del contacto. Los
  puntos que quedan fuera de la cobertura real se rechazan; desenvolver el ángulo antes de limitarlo
  evita saltar de lado al pasar por π. La cámara no cambia la postura del paciente.
- Los gestos del navegador llaman al mismo `setPoseManual` que la imagen y los mandos: cancelan la
  animación hacia una referencia y se bloquean en congelado. Hay botones de desplazamiento y giro para
  realizar las acciones sin arrastrar; los ángulos finos y el contacto siguen en ajustes.
- `AcquisitionState` en `src/ultrasound/cine.ts` guarda pose, marco efectivo, muestra fisiológica y maniobra respiratoria. El
  renderizador conserva el último estado mostrado y lo copia profundamente al guardar cada cuadro del
  anillo. `Simulator.displayedAcquisition` selecciona el mismo cuadro que la imagen y los ajustes.
  Se conserva la regla del renderizador: cambiar profundidad inicia un cine nuevo para no mezclar
  persistencia entre escalas polares distintas; se explica en el control contextual de profundidad.
- `advance(0)` actualiza el contacto al cambiar la pose aunque no venza un paso fisiológico: el reloj no
  avanza y ya no se entrega una pose nueva con un plano previo. Congelar mantiene su retorno inicial.
- La interfaz tiene dos superficies, una barra básica de profundidad/ganancia/foco y un diálogo para
  orientación, contacto, respiración y procesamiento. El navegador se pliega en móvil. Los controles
  leen los valores históricos y se bloquean durante cine; las referencias BLUE declaran lado y aproximación.
- El HUD conserva sus nodos y su profundidad tiene un decimal; no muestra volumen respiratorio normalizado.
  El tamaño del sector sigue ResizeObserver y los FPS usan tiempo de pared, separado del dt limitado del motor.
- El navegador se importa después de la primera imagen y redibuja al cambiar pose, cámara, tamaño o sus
  opciones. DPR limitado a 1,5; no hay reloj fisiológico adicional ni lecturas de GPU para navegar. Los
  presupuestos distinguen entrada inicial, módulo 3D y total de JavaScript, incluyendo el coste del módulo diferido.
  Los scripts build/check invocan el mismo comprobador mediante `node --import tsx`, evitando el socket IPC
  del lanzador CLI en entornos restringidos, sin omitir ninguna comprobación.

**Consecuencias.** La navegación aporta contexto a la adquisición normal sin introducir un segundo
modelo clínico. La piel conserva el cilindro elíptico del motor y las costillas opcionales se rotulan
como guía en reposo; las terminaciones esquemáticas fuera del dominio explorable no se usan para
adquirir. El contacto sigue siendo cinemático. Estas limitaciones figuran en `docs/LIMITATIONS.md`.
Three.js 0.186.1 es la única dependencia nueva de producción; sus tipos 0.186.0 son de desarrollo.
El primer build del bloque midió 245,3 KiB de entrada y 529,6 KiB de navegador (133,5 KiB gzip), frente a
240,7 KiB de entrada antes del bloque. Los presupuestos pasan a 260 KiB iniciales, 560 KiB de navegador
y 820 KiB totales. La medición en GPU de usuario y la revisión visual humana siguen siendo necesarias.

**Verificación.**

- `src/validation/acquisitionHistory.test.ts`: pose/marco/respiración viajan juntos al seleccionar cine,
  maniobra tranquila → profunda → revisión histórica, sellado del último cuadro, copia independiente,
  vuelta del anillo, reset y GPU; un gesto sin paso de
  reloj actualiza el contacto. Quitar la copia o usar el estado vivo rompe la independencia histórica.
- `src/validation/uiInput.test.ts`: ambos manejadores instalados como en la aplicación; Espacio sobre
  un botón no se cancela ni mueve la sonda. Reintroducir su cancelación rompe esta regresión.
- `src/validation/controllers.test.ts`: 65 mm aparece como 6,5 cm.
- Pruebas de geometría y entrada del navegador en `src/validation/`; los puntos proceden de la escena,
  no de coordenadas elegidas para parecer un tórax. La revisión independiente contrasta también la malla
  costal con la distancia implícita del modelo.
- La CI mantiene todas las pruebas, los umbrales de cobertura y sus cinco fragmentos E2E. La interfaz
  tiene pruebas de adquisición y navegación. La primera ejecución detectó una expectativa incorrecta de
  conservar cuadros a través de un cambio de profundidad; el recorrido comprueba equipo histórico con
  ganancia y verifica por separado el reinicio al cambiar profundidad. La inspección visual manual no se declara realizada cuando
  el navegador de la sesión está bloqueado. No se modifican shaders ni parámetros clínicos.

## 24. Calibración acotada del contraste del pulmón normal convexo (C3b-A)

**Fecha.** 2026-09-28.

**Contexto.** Tras la navegación y el cine de la decisión 23, la discrepancia de mayor valor pendiente
es la imagen normal: pared y neblina tenues frente a la pleura y reverberaciones demasiado prominentes
en gris (decisión 21). Objetivos O3 y O6, conservando O1. Los cocientes M comparten denominador con la
primera línea A: reducir M por sí solo no demuestra que se haya aclarado la pared.

**Opciones.** Subir solo la ganancia no corrige las relaciones invariantes a una transformación afín
del gris. Se compara primero el rango dinámico existente (50, 60, 70 y 80 dB) y después un candidato
acústico dentro de los intervalos heredados. No se amplían los rangos para alcanzar los percentiles
del banco. La sonda lineal se reserva para un bloque de geometría, contacto y adquisición completo.

**Decisión.** El protocolo de `e2e/calibracion.spec.ts` fija la anatomía a un instante de apnea y mide
tres réplicas por rango dinámico en BLUE superior, BLUE inferior y PLAPS. Cada réplica atraviesa el
renderizador y la conversión de barrido reales; no se remapea un gris ya recortado. El ruido del receptor
sigue dependiendo del cuadro, de modo que son réplicas de una anatomía fija, no una envolvente idéntica.
Se registran semilla, tiempos, K, R_t, ajustes, GPU, métricas, censura y niveles de pared, neblina,
pleura y reverberaciones. Las series de respiración tranquila y apnea de la decisión 21 siguen midiendo
la dinámica de forma separada.

`tools/fidelity/compare.ts` admite distribución entre sujetos, banco alternativo y selección de
respiración. La comparación histórica entre clips sigue disponible. La partición versionada en
`docs/reference-bank/calibration-split.json` mantiene todas las ventanas de cada sujeto juntas:
exploración y comprobación nunca comparten un sujeto. Los agregados del banco ya eran conocidos;
esta comprobación no es ciega ni constituye validación clínica independiente. Los clips originales
permanecen fuera del repositorio; solo se versionan identificadores y estadísticas derivadas.

**Consecuencias.** La aceptación exige leer conjuntamente M, prominencia de A2, textura mural, niveles
y recorte. La geometría k·D, la pleura anatómica, las sombras costales y la adquisición histórica
conservan sus pruebas. Espesor pleural limitado por resolución, desfase A1 con referencias recortadas,
sombras procedentes de un único sujeto y cocientes temporales censurados no son objetivos de ajuste.
No se añaden mandos al usuario ni se declara cerrada la fidelidad del normal.

El ajuste preliminar seleccionado conserva rango dinámico 70 dB, curva 3,5 y R_t = 0,3. Reduce K de 55 a 54 dB y
compensa nominalmente la interfaz con ganancia −20 dB en lugar de −21. Los valores siguen siendo
estimados dentro de los dominios heredados: K [53, 57] y R_t [0,2, 0,5]. `normalCalibration.ts`
registra valores, fuentes del mecanismo y límites; TS y GLSL consumen la misma configuración. Las
fuentes no se presentan como mediciones de estos valores concretos. La suma coherente obliga a
comprobar en imagen la compensación nominal de 1 dB.

Se descartan dos ensayos previos con K = 53 dB y ganancia −19 dB. Con R_t = 0,2 (CI 79), el cuarto
orden se detectó solo en 1–2 de 12 grupos del BLUE superior; con R_t = 0,27 (CI 80), en 4 de 12 en
ambos intentos, con un máximo desplazado 1,37 mm. Ambos incumplen los 6 grupos exigidos pese a aclarar
pared y neblina. Se conservan el detector de 6 dB, los recuentos y todas las tolerancias geométricas.
`ALINES_JSON` registra detectabilidad y geometría también cuando la prueba pasa. El ensayo seleccionado
restituye R_t = 0,3 y limita la redistribución a 1 dB; cumple las guardas sin continuar acercándose al umbral. El grupo de comprobación no interviene en estas revisiones.

El barrido exploratorio también mostró 40–41 columnas útiles de coherencia en una presentación de
PLAPS. Ese recuento corresponde al detector del primer cuadro, no a líneas GPU independientes ni a la
precisión de la pleura. Se registra la coherencia completa y el criterio >50 en todos los rangos; se
exige en DR70, el preajuste primario fijado antes del barrido. Las alternativas 50/60/80 se conservan
como diagnóstico y una alternativa sin soporte no se presenta como adquisición aceptada. La falta
de soporte no se confunde con la censura por recorte. Las e2e de fidelidad vigentes no se relajan.

Durante la verificación, la prueba anatómica `maxTotal` agotó 180 s (212,5 s medidos). Ejecutaba millones
de matchers sobre una rejilla finita. Se mantienen las 18 escenas, todos los puntos, desigualdades y
tolerancias, pero se acumula el peor exceso de cada desigualdad y su ubicación antes de afirmarlo.
Los no finitos se registran y hacen fallar la prueba. El caso aislado con cobertura pasó en 11,1 s;
esa ejecución aislada no alcanza por sí sola la cobertura global y no sustituye `check` completo.

**Resultados del ajuste.** `docs/reference-bank/normal-calibration-c3b-a.json` conserva la línea base,
los dos rechazos y el ajuste seleccionado, con sus commits, ejecuciones, parámetros, métricas, censura
y soporte del detector. A t = 60 s y DR70: M y A2 son medianas de tres réplicas; los niveles de gris
de 8 bits corresponden al primer cuadro:

| Ventana       | Pared base → ajuste | Neblina base → ajuste | M pared base → ajuste | M neblina base → ajuste | A2.r2 base → ajuste |
| ------------- | ------------------- | --------------------- | --------------------- | ----------------------- | ------------------- |
| BLUE superior | 28,993 → 31,015     | 13,862 → 15,573       | 1,8822 → 1,8587       | 2,0376 → 2,0169         | 0,5647 → 0,5613     |
| BLUE inferior | 39,191 → 40,831     | 16,973 → 18,609       | 1,6565 → 1,6387       | 1,8864 → 1,8695         | 0,5083 → 0,5014     |
| PLAPS         | 28,540 → 30,544     | 14,962 → 16,487       | 1,8585 → 1,8374       | 1,9862 → 1,9697         | 0,5407 → 0,5370     |

La mejora es pequeña: las cuatro métricas primarias (M pared, M neblina, A2.r2 y T1 σ/prominencia)
se acercan a la descripción exploratoria en las tres ventanas, a DR70 y DR80, pero siguen fuera de
sus p10–p90. A DR70 esas métricas no están censuradas; los niveles de pared y neblina suben y su recorte
negro baja. El recorte blanco mediano del pico pleural sigue en 0. El campo profundo permanece
censurado a DR70. La longitud lateral de textura T1 se aleja algo de la referencia en BLUE superior
(y en dos ventanas a DR80): no se declara calibrada la célula de moteado.

El cuarto orden se detecta en 10/12, 8/12 y 7/10 grupos de BLUE superior, inferior y PLAPS, tanto con
composición como sin ella, frente a mínimos de 6, 6 y 5. Los órdenes 1–3 se detectan en todos los grupos.
F-T01 frente a la pleura mostrada cumple en todos los picos del cuarto orden (peor error 0,407 mm frente
a ±0,5 mm); la separación cumple ±0,2 mm. Respecto a k·D, un pico del BLUE inferior compuesto queda
−0,2028 mm: 7/8 cumplen ±0,2 mm, cumpliendo el criterio histórico `floor(0,9 · n) = 7` sin modificarlo.

**Comprobación por sujetos reservados.** Con K54/R_t0,3/ganancia −20 fijados y la CI 81 terminada,
se abrió el grupo de comprobación sin reajustar parámetros. Las cuatro métricas primarias también se
acercan en las tres ventanas a DR70, sin censura, pero permanecen alejadas del banco. M pared, M neblina
y A2.r2 cuentan con 6 clips de 2 sujetos (dos clips excluidos por QA); T1 σ/prominencia, con 8 clips de
2 sujetos. En exploración, los respectivos tamaños efectivos son 3 clips/2 sujetos y 8 clips/4 sujetos.
La longitud lateral T1 empeora algo frente a comprobación en BLUE superior y PLAPS. Se acepta una mejora
preliminar y modesta del contraste; no se da por calibrada la textura ni por validado clínicamente el normal.

**Referencia y reproducibilidad.** Se verificaron los SHA256 de los 34 clips del manifiesto fuera del
repositorio. La regeneración con FFmpeg 6.1.1 procesó los 8277 cuadros, sin omisiones, truncado ni fallos
de compuertas, pero no reprodujo exactamente los números del archivo canónico: 1446 diferencias escalares,
un máximo de 1,986 grises en niveles y cambios pequeños en los cuantiles de las métricas primarias.
La versión del decodificador original no estaba registrada y no se atribuye la causa sin prueba. Se
conservó `reference-stats.json` congelado por SHA para todos los ensayos, sin sustituirlo por la regeneración.
La prueba dorada del banco no se presenta como aprobada; el detalle agregado consta en la evidencia.

**Verificación.** CI 81 (`5d1b4cd`, ejecución `36480592122`) completa en verde: 705 pruebas aprobadas,
un fallo esperado de regresión y dos omisiones condicionales (banco clínico externo y comparación con el
repositorio de origen); cobertura 95,33 % de sentencias y 89,91 % de ramas. Las 21 e2e de Chromium con
SwiftShader pasan, incluidas sombras, geometría, fidelidad, ganancia, adquisición, cine, navegación 3D
y recuperación de contexto. El presupuesto de tamaño pasa y la auditoría de producción informa cero
vulnerabilidades. La revisión adversarial independiente comprueba protocolo, física, conservación de
guardas y evidencia. La ejecución gráfica se verifica en CI; no se presenta como inspección visual humana
ni medición de rendimiento en GPU de usuario. La integración exige también CI verde sobre el árbol final.

## 25. Maniquí humano procedural y sonda convexa registrada

**Fecha.** 2026-09-28.
**Contexto.** El navegador de la decisión 23 parecía un depósito: sección cilíndrica, tapa hemisférica y
cuello tubular. El usuario aprobó la opción A: geometría procedural sin activos externos. Objetivos O5/O6.
**Opciones.** Un GLTF importado o una piel esculpida sobre un cilindro de contacto oculto desalinearían el
navegador de la adquisición. Cambiar la superficie acústica exige un bloque distinto con paridad TS/GLSL.
**Decisión.** `humanTorso.ts` conserva la piel funcional del motor y agrega cabeza, transición cervical,
hombros bilaterales, brazos despejados y continuidad abdominal como contexto no explorable. `loftMesh`
genera anillos indexados sin duplicar la costura angular. La compresión visible se deriva de
`probeContact` y `RespiratoryDeformation`, por pose histórica, en una instancia privada de solo lectura.
Solo los vértices con desplazamiento no nulo recorren la inversa iterativa; se restaura el vecindario anterior.
`convexProbe.ts` construye lente, reborde, carcasa superelíptica, mango oval, muesca y cable. El arco activo
sale de R y alpha: cuerda 67,10 mm frente al campo nominal footprintMm=62 mm; no se cambia física para ocultar
la discrepancia. La carcasa no sustituye la huella. El cable es encaminamiento determinista, no gravedad.
La primera intersección visible bloquea selección a través de cabeza y brazos. Agarrar la sonda no cambia
su pose hasta encontrar piel válida. Escape y congelación cancelan el gesto. Centrar modelo cambia solo cámara.
**Consecuencias.** No cambian shaders, anatomía acústica, calibración B/M ni límites. Los detalles corporales
son estimaciones visuales, no un atlas validado. Las costillas siguen en reposo y se construyen al solicitarlas.
Cámara y estados inmóviles no regeneran cuerpo/cable; buffers y recursos tienen propietario explícito.
Se conservan presupuestos 260/560/820 KiB, DPR 1,5 y renderizado por cambios. La teselación aproxima la
superficie entre vértices; no se atribuye exactitud clínica a esa representación.
**Verificación.** `thoraxAppearance.test.ts`, `thoraxGeometry.test.ts` y `thoraxInput.test.ts` protegen
geometría, correspondencia de lente, contacto histórico, descarte de marcos incoherentes, normales,
oclusores, control de gestos y liberación de veinte reconstrucciones. `e2e/humanNavigator.spec.ts`
recorre vistas y revisión histórica, mide complejidad real y comprueba que la cámara no modifica B.
La revisión visual y la CI final se registran en el PR con su SHA. Una captura o SwiftShader no validan
fluidez en hardware físico ni reconocimiento humano mediante participantes externos.

## 26. La cobertura de exploración: una prueba por celda del tórax

**Fecha.** 2026-10-01.

**Contexto.** Daniel pidió (01-10-2026) que el pulmón se pueda explorar entero, por delante, al lado y detrás, con vértice y
bases (`docs/MISSION.md`, requisito de cobertura, meta del 100 % en la versión 0.2.0). Nada lo medía. Su medición de partida,
una rejilla de φ cada 10° y z cada 20 mm mirando el tejido 3 mm bajo la pared, daba 282 de 543 celdas con pulmón alcanzables
(52 %): sin el arco posterior (≈ 216°–324°: la sonda en supino no pasa de 1,2π ni de −0,2π, `clampPose`), sin nada por
encima de z 200 y con el pulmón subiendo hasta el tope del tronco (z 300) sin vértice. La rejilla no distingue lo que la base
pone en cada sitio (pulmón, corazón, escápula o lo de debajo del borde) ni sigue los espacios intercostales.

**Opciones.** (a) Conservar la rejilla regular y exigir pulmón en cada celda: confunde la ventana cardiaca, la escápula y el
seno costodiafragmático con huecos, y premia el pulmón sobre el vértice. (b) Celdas anatómicas: los EIC 1.º–11.º de cada línea
de referencia de la exploración, por hemitórax, con lo que la base pone en cada una. Para lo esperado: (i) la tabla del borde
que construye el modelo, que es circular; (ii) los anclajes de Gray de la base. Para medir: el tejido en un punto, o la línea
central de la sonda apoyada con su contacto, como ve el alumno.

**Decisión.** (b), (ii) y la línea central de la sonda. `src/app/coverage.ts` (`explorationCoverage`), en fin de espiración:

- **Celdas** (138). Por hemitórax, cada EIC que existe en las líneas paraesternal, medioclavicular, axilares anterior, media
  y posterior, escapular y paravertebral (los dos extremos de sus costillas cruzan la línea: 6, 8, 9, 10, 11, 11 y 11 espacios,
  los de la parrilla del adulto promedio de la decisión 16), con la sonda en el centro del espacio y marcador craneal; el
  vértice en dos zonas del corte; y la fosa supraclavicular.
- **(i) Alcance.** La pose tiene que caber en una posición del paciente admitida (`PositionReach`; hoy solo el supino de
  `clampPose`).
- **(ii) Contenido.** Lo primero que no es pared blanda ni cartílago sin calcificar (deja pasar el haz, A-T17) bajo la línea
  central: pulmón con la pleura de A0 registrada (`pleuraCrossingLine`, la de la imagen), corazón, hueso, o el diafragma y el
  órgano que le sigue. Lo esperado sale de los anclajes de la base (`anatomy.lungBorder`: 6.ª costilla en la paraesternal y la
  LMC, 8.ª en la LAM, T11 detrás), cada uno a su altura en su línea; las líneas sin anclaje propio (LAA, LAP, escapular) toman
  el intervalo entre las alturas de sus vecinas (detrás las costillas suben hacia la columna: el mismo número de costilla no
  sirve). Un espacio cuyo centro queda a menos de 8 mm (la mitad de un espacio) del borde admite pulmón o lo de debajo (la
  cortina); en las líneas con anclaje propio no hay ninguno. Bajo el borde se exige el órgano: el hígado a la derecha y, a la
  izquierda, su lóbulo o el bazo (el requisito dice «diafragma y órgano subdiafragmático»). La paraesternal izquierda en los EIC
  4.º–5.º es la ventana cardiaca (A-T16) y el 6.º, su borde caudal (corazón o lo de debajo). La línea escapular con los brazos a
  los lados sube por el borde medial de la escápula: de la 2.ª costilla (Gray) al ángulo inferior (la apófisis de T8,
  Cooperstein 2015, al nivel del cuerpo de T9), la escápula o el pulmón junto a ella (lo que no se toca en la clínica).
- **(iii) Sobre el vértice**, en una rejilla de todo el corte del hemitórax (cada 5° y cada 3 mm): bajo el tercio medial de la
  clavícula (por delante, hasta 20 + 156/3 mm de la línea media), ningún pulmón a más de 4–5 cm sobre ella (Gray; su borde
  superior, 10 mm sobre la escotadura yugular: el eje a esa altura y el tercio medial de ≈ 2 cm de diámetro, Yang); en el resto,
  ninguno a más de 8 mm sobre la 1.ª costilla. La fosa supraclavicular: la sonda a 7 cm de la línea media y 12,5 mm sobre la
  clavícula, de plano o inclinada hacia los pies, ve pulmón con pleura, y solo cuenta si el vértice existe.
- **La línea escapular** entra en `anatomy/thoraxLines.ts` (`anatomy.scapularLine`, 85 mm de la línea media: el ángulo inferior
  de la escápula a 88,5 ± 6,1 y 82,5 ± 5,0 mm de T7 en la prueba de deslizamiento lateral con los brazos a los lados, Moon y Kim;
  coherente con el ángulo superior a 9,1 ± 1,1 cm, Pontin). La paravertebral (60 mm) queda por dentro del borde medial.
- **La prueba** (`src/validation/coverage.test.ts`): una por celda (`it` las que se cumplen, `notYetMet` con su motivo las que
  no), el total con `notYetMet`, que las celdas son las de la anatomía, los bordes de Gray en sus espacios, el intervalo entre
  anclajes, la escápula, y que el medidor mira lo que hay (el cartílago deja pasar el haz; con la sonda en cualquier sitio, la
  espalda muestra pulmón y bajo el borde lo de debajo: lo que falla detrás es el alcance).
- **El indicador** viaja en el informe técnico (`lus-diagnostico/1`, campo `coverage`: N/M en total y por región, del paciente
  del simulador); el módulo se carga al pedir el informe.

**Consecuencias.**

- **Medido en main: 62 de 138 celdas** (anterior 20/28, lateral 42/60, posterior 0/44, vértice 0/6). Faltan las 44 celdas de
  la escapular y la paravertebral (la sonda no llega), el vértice (el pulmón llega a z 299) y la fosa supraclavicular (ve
  pulmón, pero sin vértice), y las 26 bajo el borde (el diafragma está, pero debajo el abdomen genérico,
  `abdomen-generic-tissue`: sin hígado ni bazo, que la hoja de ruta adelanta a la fase 1 por este requisito). Las demás
  celdas anteriores y laterales se cumplen, con el borde de Gray y la ventana cardiaca.
- **Las bases** (la hipótesis de que las posteriores quedan altas): en FRC el modelo no tiene pulmón bajo z ≈ −35 en ninguna
  línea porque así lo dice Gray en espiración (el borde en la apófisis espinosa de T10, al nivel del cuerpo de T11; la 8.ª
  costilla en la LAM, z −35; la 6.ª en la LMC, z −17,5). La TAC en supino y fin de inspiración corriente lo baja a T12 (z −58,
  Mirjalili), 7 mm bajo lo que baja la cortina en la respiración tranquila (16 mm, hasta z −51). No es un error del modelo; el
  seno posterior, hasta la reflexión en T12 (z −58), es lo de debajo del borde.
- La cobertura cuesta 0,3–1,5 s en la CPU (la rejilla del vértice es lo más caro): el informe técnico la calcula al pedirlo.

**Verificación.** `npm run check`. La prueba falla en main por su aserción (el total y las 76 celdas pendientes, `notYetMet`).
Revisión adversarial de contexto limpio (ejecutando): la escapular esperaba pulmón bajo la escápula (un modelo correcto nunca
llegaría al 100 %); el borde de la LAP y la escapular tomaba la 8.ª costilla en su línea (un intervalo de 62 mm que dejaba pasar
un borde dos costillas alto); la fosa supraclavicular pasaba sin vértice; el órgano bajo el diafragma no se miraba; el vértice
solo se buscaba 3 mm bajo la pared y con la cúpula también en la LMC; aserciones que no veían mover el borde; el cartílago como
hueso. Todo aplicado; las cifras recalculadas coinciden.

## 27. El vértice: la cúpula pleural sobre la 1.ª costilla y la clavícula

**Fecha.** 2026-10-01.

**Contexto.** La cobertura de exploración (decisión 26) medía el pulmón subiendo hasta el tope del tronco (z 299) en todas las
líneas: sin vértice, sin clavícula y con la fosa supraclavicular viendo pulmón solo porque no había techo
(`lung-border-table`: «hacia arriba no hay vértice»). La base pone el vértice ≈ 2,5 cm (hasta 4–5, a veces apenas) sobre el
tercio medial de la clavícula y la pleura cervical 2,5–5 cm sobre la 1.ª costilla, con la cúpula dentro del anillo de la 1.ª
costilla y, detrás, en el cuello de la 1.ª costilla (Gray); la clavícula del varón mide 15,6 ± 0,9 cm y 1,4 ± 0,1 de diámetro en
su tercio medio, la de la mujer 14,3 ± 1,3 (Yang); por la fosa supraclavicular la pleura sobre la 1.ª costilla está a 1,7 ± 0,8
cm de la piel (Yadav). La caja es el cilindro elíptico de VExUS, que no se estrecha hacia la abertura superior
(`thorax-cylindrical-cage`), y no tiene mediastino (`heart-simplified`).

**Opciones.** Para el techo: (a) un borde superior por columna como el inferior (una cortina hacia arriba): la pleura del techo
no sería la cara interna de la pared y A0 no la registraría (en la pasada A, el pulmón que no toca la pared es un espejo, el de
la cúpula del diafragma); (b) la pared que engruesa por encima de la 1.ª costilla hasta cerrarse sobre el vértice: su cara
interna es la pleura cervical y la registra la A0 de siempre, sin un segundo mecanismo de la pleura; (c) estrechar el tronco
hacia la abertura superior: rehace la piel, el contacto y la parrilla. Para la clavícula: (i) una sección por extremo (25 y 26
mm) o (ii) la del tercio medio en toda ella.

**Decisión.** (b) y (ii).

- **La cúpula** (`src/anatomy/organs/lungApex.ts`, `anatomy.lungApex`, con su gemelo GLSL): por columna de |u|, un cuarto téxel en
  la tabla de la pared torácica con `zApex`, el borde superior de la 1.ª costilla más 2 mm, y `zTop`, el techo. Sobre `zApex` la
  pared engruesa Rc·(1 − √(1 − h)), con h la fracción de la altura hasta `zTop` y Rc 30 mm [SUPUESTO]: la pleura cervical sale
  vertical de la pared y llega horizontal a Rc mm por dentro; sobre `zTop`, la columna es pared hasta el centro. `zTop` es el
  vértice de la base bajo el tercio medial de la clavícula (25 mm sobre su borde superior, que está 10 mm sobre la escotadura:
  z 198) y baja bajo el tercio medio hasta 5 mm sobre la 1.ª costilla, la de las demás columnas [SUPUESTO: la base no da la forma
  de la ladera]. Detrás, la 1.ª costilla está en T1 y el pulmón llega a su cuello. Junto a la línea media del cuello (delante de
  las articulaciones esternoclaviculares, la tráquea; detrás, delante de la columna) la cúpula empieza en la escotadura yugular:
  sin pulmón sobre ella ni pared engrosada sobre el manubrio. El grosor extra es músculo (las partes blandas del cuello y del
  hombro, genéricas). `wallTotalAt` y `wallLayersAt` lo suman (TS y GLSL); la GLSL lee siempre la tabla por encima de la menor
  `zApex` (`uCupola.x`), donde la pared puede pasar de su grosor máximo, y la distancia a la frontera de sus capas tiene la cota
  vertical hasta `zApex` (`wallCupolaBd`: las capas solo miden en la radial y el techo es horizontal). Sobre el techo, más hondo
  que la pared del tórax, músculo sin caras (las de la pared quedarían más allá del centro del tronco).
- **La clavícula** (`anatomy.clavicle`, en `organs/ribcage.ts`, con su gemelo GLSL): un hueso subcutáneo de 14 mm de diámetro
  (Yang) a 3 mm de la piel, a lo largo de la piel del tronco desde 20 mm de la línea media (la escotadura clavicular del
  manubrio) en 156 mm (143 en la mujer; Yang), con el borde superior 10 mm sobre la escotadura y subiendo 15 mm hasta el
  extremo acromial [SUPUESTO: NO ENCONTRADO]. Entra en la clasificación de la parrilla (`ribScan`, índice `CLAVICLE_INDEX`): su
  cortical la dibuja el tejido blando de fuera y hace sombra como una costilla. No cuenta como costilla en las cuentas por línea.
- **El contacto de la sonda** (`probe/contact.ts`) busca como pared rígida la del tórax, sin lo que la cúpula le suma (las partes
  blandas del cuello se aplastan bajo la cara): con la cúpula de hasta 200 mm de grosor, la sonda en la fosa no encontraba la
  pared paralela y la mitad del sector no acoplaba.
- **La pose** sigue hasta z 200: alcanza la fosa supraclavicular (z ≈ 186, sobre la clavícula) y el vértice.
- **La cobertura** (decisión 26) juzga en la línea media del cuello (la columna de la articulación esternoclavicular) nada sobre
  la escotadura y bajo el tercio medio de la clavícula la ladera de la cúpula, de 5 cm sobre ella a la 1.ª costilla, en recta
  [SUPUESTO; Yadav ve la pleura sobre la 1.ª costilla por la fosa, bajo el tercio medio]; antes la regla saltaba de golpe al final
  del tercio medial. Usa el largo de la clavícula de cada sexo.
- **Las metas** A-T23 (vértice) y A-T24 (clavícula y fosa supraclavicular) entran en la base (§3) y en `anatomyTargets.test.ts`.

**Consecuencias.**

- **Cobertura: 62 → 68 de 138** (vértice 0/6 → 6/6): las cuatro celdas del vértice y las dos de la fosa supraclavicular. Lo
  pendiente: la cara posterior (44) y el órgano bajo el diafragma (26).
- El pulmón más alto bajo el tercio medial de la clavícula, a 24,7 mm de su borde (A-T23: ≈ 2,5 cm, ≤ 5), y el más alto de todo
  el tronco, detrás (el cuello de la 1.ª costilla), a 39 mm; en la axila y detrás, el pulmón junto a la pared llega a la 1.ª
  costilla y no la pasa; en la línea media del cuello la sonda no ve pulmón. Sobre la clavícula, su sombra (14–16 mm de hueso por
  la normal, desde 3 mm bajo la piel; en la LMC, su eje 25 mm sobre el de la 1.ª costilla).
- Por la fosa, con el haz 20° hacia los pies, la pleura de la cúpula a 25,7 mm en el avatar (Yadav, 16,4 ± 8 con su IMC: +1,1 DE;
  la pared de la columna es la de delante, con el pectoral), 21,8 en la delgada, 31,1 en la mujer y 32,7 en el obeso, dentro de
  ± 2 DE de Yadav con el IMC de cada hábito; en la mujer obesa, 40,4 frente a ≤ 39,6 (A-T24 pendiente, `notYetMet`). Ahí el
  deslizamiento es nulo (la recta de la decisión 19 se apaga a ≈ z 160): Lichtenstein lo da mínimo en el vértice, no ausente
  (`sliding-linear-height`).
- **Las bases** se verificaron con la decisión 26: el borde de Gray en FRC (z −17,5 en la LMC y −35 en la LAM y detrás) y la
  reflexión (T12, z −58) ya estaban; no cambian.
- `lung-border-table` ya no dice «hacia arriba no hay vértice»; nuevas `apex-cupola-wall` y `clavicle-section-uniform`.
- Las pruebas que buscaban el borde inferior del pulmón desde z 250 lo buscan desde z 140 (por encima, la cúpula). Tres uniforms
  nuevos (`uCupola`, `uClavicle`, `uClavicleR`): la pasada B declara 115 ranuras (117 la dirigida; tope 130). La entrada del
  bundle pasa de 258,9 a 266,2 kB (la evidencia de los parámetros nuevos y los gemelos GLSL): su presupuesto sube a 270 y el
  total a 830.
- **Costo por cuadro** (`frameCostMs`, GPU real M4, intercalado con main): en el punto BLUE superior, main 3,0–3,1 ms y esta
  decisión 2,8–3,0; en la fosa supraclavicular, 3,3–3,4. O6 (≥ 30 FPS) holgado.

**Verificación.** `npm run check`; `coverage.test.ts` (las 6 celdas del vértice pasan a `it`), `anatomyTargets.test.ts` (A-T23 y
A-T24, con la clavícula medida en la clasificación y la fosa por hábito frente a la recta de Yadav con su IMC),
`chestWall.test.ts` (la cota `maxTotal` por debajo de la cúpula), `shaderLimits.test.ts`, `organs.test.ts`. En la e2e, la
equivalencia TS ↔ GLSL suma la fosa supraclavicular, la clavícula y la axila alta al barrido de planos (acuerdo 1) y la fosa a la
pleura de A0 (dos pasos finales de la bisección en la cúpula oblicua, uno en los demás planos); un volumen aparte del vértice (z
150–230, 10 000 puntos) con las exigencias del del tórax, salvo la distancia a la cara sobre la cúpula, que se mide aparte (en la
ladera la pared cambia deprisa con el arco u y el error de float32 de `wallArc` pesa más: GPU real 2·10⁻⁴ mm, SwiftShader 0,032; se
exige < 0,05, y < 0,02 en el resto). Mutación: la GLSL sin la cúpula en `wallTotalAt` deja el plano de la
fosa en 0,71 de acuerdo (falla). Revisión adversarial de contexto limpio (ejecutando): sin bloqueantes; la distancia a la frontera
del músculo sobre la cúpula hasta 90 mm (la cota vertical), el deslizamiento nulo en la fosa sin declarar, pulmón en la línea
media del cuello (la sonda lo veía sobre la escotadura), A-T24 solo en el avatar, la ladera de la cobertura sin etiqueta de
supuesto, una cifra sin fuente, el manubrio empujado 2 mm por la cúpula, dos definiciones del borde de la clavícula, pruebas
que repetían parámetros; aplicado (ver la PR).
