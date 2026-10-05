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
congelada. Las unitarias (`src/validation/controllers.test.ts`, `startPointCards.test.ts` (quitado en la decisión 47),
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
  quemadas) y su control de calidad (apto y pleura, a ojo; líneas A, sombra costal y tiempo, las que el banco mide: la mediana
  de los cuadros y las compuertas). La geometría la propone el detector sobre el clip entero (su media y su σ temporal:
  `npm run fidelity:geometry`, que deja hojas de contacto fuera del repositorio, con todo lo que está fuera del sector en
  negro) y la fija una persona: medir con la detectada cambiaba con la ganancia en un abanico cortado por el marco. Cada clip se mide entero; **compuertas automáticas** (`dpl_spread`,
  `few_intercostal`, `floor_above_deep`, `bimodal_crests`, `repeated_frames`) y un clip apto que dispare una que su control de
  calidad no admite hace fallar la prueba. `docs/reference-bank/reference-stats.json` lleva solo números derivados: por clip,
  cuantiles sobre sus cuadros; por estrato de sonda, la distribución de la mediana de cada clip apto **entre clips y entre
  sujetos**, con cuántos hay de cada uno. Un clip entra en una métrica si la mide en al menos la mitad de sus cuadros (la
  mediana de los pocos cuadros en que asoma una línea A de orden 3 no es el valor del clip). Con menos de 3 clips o 2
  sujetos el estrato se informa sin situar al simulador.
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
- **Referencia** (`npm run fidelity:ref`, los 34 clips enteros, 8 277 cuadros, en 3–4 min): aptos 19 —17 convexos de 6 sujetos
  (LUS-01, LUS-04b, 04f, 04g y 13 de LUS-35), LUS-02 sectorial y LUS-03 lineal—; no aptos 15: los cuatro recortes LUS-04a y
  LUS-04c–e, sin pleura identificable; LUS-35a y 35b (pat1) no son pulmón limpio; 35t (pat4) trae el diafragma o el hígado y
  su pleura salta entre cuadros; 35h y 35j (pat2), una línea oblicua brillante honda (compatible con el diafragma, sin
  confirmar el órgano) y la compuerta `dpl_spread` (dispersión de d_pl 0,43 y 0,25), que por sí sola los deja fuera; y 35c–e,
  35l, 35m y 35p, con la pleura que salta entre cuadros o sin forma de pulmón. La geometría y el control de calidad los revisó
  el agente coordinador en las hojas de contacto el 27-09-2026 (falta la revisión de un ecografista); corrigió 35v, que es
  pulmón normal limpio y no trae diafragma: es apto (ninguna compuerta salta). Con líneas A que el banco mide, 9 convexos de
  5 sujetos (35i sale: con los fondos en la mediana, su línea A de orden 2 se ve en 17 de 59 cuadros); con una sombra costal
  limpia, 2 (35i y 35k, del mismo sujeto). El detector se aparta de la geometría fijada ≤ 4,3 px y ≤ 0,9° en los aptos salvo
  LUS-01 (el abanico sale del cuadro: lo propone lineal), LUS-35r y LUS-35v (16,6° y 14,8° en el borde derecho: la sombra de
  una costilla junto al borde parece el borde del abanico), y en 35e, 35h, 35j, 35l y 35p toma un borde oscuro (hasta 38°):
  por eso se fija.
- **Lo que el detector de líneas A no ve (LUS-35v).** El coordinador lo señala como probablemente el mejor clip de líneas A del
  banco, y el perfil por filas del cuadro medio le da la razón: máximos en 39, 77, 117, 153 y 188 px, k veces la pleura desde
  la cara. Pero el detector encuentra la línea A de orden 2 en 5 de sus 54 cuadros analizados: el perfil cae de 146 a 51
  grises entre la pleura y 5 d_pl, y el máximo de cada ventana queda en su borde (`found` falso). Así que en el manifiesto
  `a_lines` queda en false (no hay qué medir) y su sombra costal también (la hay, en el borde derecho, pero su cresta cae en
  el inicio de la búsqueda, la fila 18: P1 y P4 medirían el borde de la ventana); entra con la pleura, T1, T2 y S1. Buscar
  los picos sobre el perfil sin su tendencia es una corrección del detector que cambia todos los clips y el simulador: queda
  para una decisión aparte.
- **La partición de C3b-A (decisión 24).** Fijaba los SHA-256 del manifiesto y de las estadísticas: esta corrección los cambia
  y lo registra en `docs/reference-bank/calibration-split.json` (`revisions`, con los anteriores). LUS-35v entra en comprobación
  con los demás clips de born-pat4; la partición por sujetos no cambia. En exploración, M, A1 y T1 quedan iguales; A2 r₂ pasa
  de 3 clips y 2 sujetos a 2 y 2 (p10–p90 entre sujetos 0,119–0,160 → 0,129–0,248) y A2 visibles de 4 y 3 (0,6–1) a 3 y 3
  (1–1): los dos perdían el valor de LUS-35i, medido en 17 de 59 cuadros. Los ajustes de C3b-A se eligieron con la versión
  anterior.
- **El simulador frente a la referencia** (respiración tranquila, geometría verdadera, GPU real; ↓ bajo el p10 y ↑ sobre el
  p90 del estrato convexo entre clips; entre paréntesis, clips/sujetos; una cota no se marca, ni un estrato de menos de 3 clips
  o 2 sujetos). El simulador, medido el 02-10-2026 sobre main 0fab474: el preajuste de la decisión 24 (K = 54 dB, R_t = 0,3,
  ganancia −20 dB, 70 dB de rango) y el tronco de la decisión 28 (antes, sobre 9f9fd9f, las mismas marcas salvo T1 lateral
  del PLAPS, ahora ↓, y T2 bajo la pleura del BLUE superior, ahora ↑):

  | Métrica                  | Convexa p10–p90 [mediana] (clips/sujetos)                     | Lineal (LUS-03) | Sectorial (LUS-02) | Simulador: BLUE sup. / BLUE inf. / PLAPS        |
  | ------------------------ | ------------------------------------------------------------- | --------------- | ------------------ | ----------------------------------------------- |
  | M pared                  | 0,75–1,57 [1,02] (8/4)                                        | —               | 1,55               | 1,91 ↑ / 1,57 ↑ / 1,81 ↑                        |
  | M neblina subpleural     | 0,91–1,42 [1,09] (8/4)                                        | —               | 1,10               | 2,07 ↑ / 1,80 ↑ / 1,98 ↑                        |
  | M campo profundo         | 1,48–2,94 [1,87] (8/4)                                        | —               | 2,04               | ≥ 2,22 / ≥ 1,99 / ≥ 2,14                        |
  | N4 cociente de brechas   | — (ningún clip ve la A de orden 3 en la mitad de sus cuadros) | —               | 3,66               | 2,59 / 2,65 (cens.) / 2,64                      |
  | P1 brillo de la pleura   | 2,99–5,05 [4,02] (2/1)                                        | 1,36            | —                  | 1,12 / 1,20 / 1,18                              |
  | P2 grosor pleural (d_pl) | — (todos al límite del muestreo)                              | 0,046           | —                  | 0,074 / 0,091 (resolución) / 0,074 (resolución) |
  | P4 (d_pl)                | 0,35–0,38 [0,36] (2/1)                                        | 0,36            | —                  | 0,37 / 0,34 / 0,36                              |
  | A1 (desfase)             | 0,10–0,21 [0,18] (8/4)                                        | —               | 0,11               | 0,007 ↓ / 0,013 ↓ / 0,010 ↓                     |
  | A2 r₂                    | 0,14–0,32 [0,23] (8/4)                                        | —               | 0,51               | 0,56 ↑ / 0,50 ↑ / 0,54 ↑                        |
  | A2 r₃                    | — (como N4)                                                   | —               | 0,52               | 0,25 / 0,22 / 0,24 (cens.)                      |
  | A2 líneas A visibles     | 1–1 [1] (9/5)                                                 | —               | 3                  | 2 ↑ / 2 ↑ / 2 ↑                                 |
  | T1 grano axial (d_pl)    | — (todos al límite del muestreo)                              | 0,017           | —                  | 0,043 / 0,054 (resolución) / 0,050              |
  | T1 grano lateral (d_pl)  | 0,070–0,17 [0,092] (17/6)                                     | 0,035           | —                  | 0,063 ↓ / 0,078 · / 0,062 ↓                     |
  | T1 σ/prominencia pleural | 0,11–0,31 [0,19] (17/6)                                       | 0,092           | 0,066              | 0,036 ↓ / 0,042 ↓ / 0,036 ↓                     |
  | T2 pared                 | 0,972–0,994 [0,984] (16/6)                                    | —               | 0,995              | 1,000 ↑ / 1,000 ↑ / 1,000 ↑                     |
  | T2 bajo la pleura        | 0,960–0,993 [0,985] (16/6)                                    | —               | 0,930              | 0,997 ↑ / 0,994 (cens.) / 0,987 ·               |
  | S1                       | 0,76–1,68 [1,08] (16/6)                                       | —               | 2,14               | ≥ 12,8 / ≥ 13,9 / ≥ 15,9                        |
  | S1 decorrelación (s)     | 0,42–1,08 [0,58] (16/6)                                       | —               | 0,047              | 0,21 ↓ / 0,17 ↓ / 0,17 ↓                        |

  Lo que dice, sin afirmarlo (es la entrada del ciclo 3b): en la presentación, la pared y la neblina del simulador quedan más
  lejos de la pleura, en caídas de línea A, que en los clips convexos (M 1,6–2,1 frente a medianas de 1,0–1,1), y el campo
  profundo, en el negro; las líneas A decaen más despacio en gris (r₂ 0,5 frente a 0,23) y se ven dos (en los clips, una; y
  ninguno ve la de orden 3 en la mitad de sus cuadros: N4 y r₃ no tienen distribución); el moteado de la
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
(se salta sin la carpeta o sin ffmpeg). Las hojas de contacto y el control de calidad los revisó el agente coordinador el
27-09-2026; falta la revisión de un ecografista y la segunda revisión adversarial de contexto limpio.

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

**Nota (decisión 33, 2026-10-02).** La inversa pasa de 10 a 12 pasos (`RESPIRATORY_INVERSE.steps`; en la GLSL, el mismo
número). La CPU y la GPU pueden tomar distinta la última decisión de la bisección por el redondeo de float32 y separarse un
intervalo final, D/2^pasos: con 10 y 53 mm, 0,052 mm en el punto material. En el plano basal de la espalda (decisión 33), en la
inspiración profunda, la cara del diafragma del receso posterior (|∂d/∂z| 0,45 en el punto material) se movía 0,023 mm en la
cáscara de la e2e, cuya cota es 0,02: medido con SwiftShader, un intervalo final exacto (al mover el punto material 0,0518 mm,
la distancia cambia 0,0231 en la CPU). Con 12, ≤ 0,013 mm con 53 y ≤ 0,018 con los 75 del rango, bajo esa cota para cualquier
cara (|∇d| ≤ 1); el punto material queda a ≤ 0,0065 mm de la raíz (antes 0,026) y el residuo en el mundo a ≤ 0,017. El costo
por cuadro no cambia de forma medible (GPU real M4, intercalado: medianas de 5,6–6,8 ms con 10 y 5,8–6,7 con 12). La cota de la
e2e no se toca.

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

**Nota (decisión 28, 2026-10-02).** Con el tronco de 226 mm de la decisión 28 el ajuste no cambia, pero sus medidas sí, con la
misma semilla y el mismo protocolo: pared 30,20 / 41,76 / 35,00, neblina 14,09 / 19,76 / 17,50, M pared 1,911 / 1,539 / 1,807,
M neblina 2,076 / 1,758 / 1,973 y A2.r2 0,5669 / 0,4987 / 0,5307 en el BLUE superior, el inferior y el PLAPS (la comparación con
main en tres semillas, en la decisión 28).

**Nota (decisión 29, 2026-10-02).** Con la espalda de la decisión 29 (las costillas hasta la transversa de 29,3 mm y la espalda
alta) el ajuste tampoco cambia; las medidas, con la misma semilla: pared 30,20 / 41,77 / 33,93, neblina 14,09 / 19,62 / 17,35, M
pared 1,911 / 1,535 / 1,818, M neblina 2,076 / 1,756 / 1,976 y A2.r2 0,5670 / 0,4984 / 0,5298 (el PLAPS, un gris de pared menos:
dentro de la dispersión de las semillas de la decisión 28).

**Nota (decisión 36, 2026-10-03).** Con el punto BLUE inferior (y el PLAPS) de vuelta en el centro del EIC4, 49,5 mm en lugar de
51,3, el ajuste no cambia; las medidas, con la misma semilla y la GPU real (M4), antes → después: BLUE inferior, pared 41,67 →
41,08, neblina 19,58 → 19,24, M pared 1,536 → 1,567, M neblina 1,754 → 1,780 y A2.r2 0,4962 → 0,5035; PLAPS, 33,72 → 33,55,
17,22 → 16,83, 1,819 → 1,833, 1,977 → 1,992 y 0,5376 → 0,5357. El BLUE superior, igual. Dentro de la dispersión entre semillas
de la decisión 28.

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
  (`sliding-linear-height`). **Corrección (2026-10-02):** al revés. Lichtenstein 2017, leído en el texto completo, lo da
  «discreto» y «mínimo» en el punto BLUE superior y «usually absent» / «usually null» en el ápex, con la sonda en el ápex
  derecho (`physics.md` D5a): el deslizamiento nulo del vértice es el de la fuente, y el modelo no cambia.
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

## 28. El tronco con la profundidad del tórax: la pared posterior de sus fuentes junto a la caja de Robinson

**Fecha.** 2026-10-02.

**Contexto.** La cara posterior (44 celdas de la cobertura, decisión 26) necesita la pared de la espalda, la escápula y la
columna con sus números. El tronco es el cilindro elíptico de VExUS, 320 × 210 mm de piel (un adulto de IMC 25 en el abdomen),
con la columna en coordenadas absolutas. Con 210 mm no cabían a la vez la caja de Robinson y la pared posterior de las fuentes:
la caja, por la pared por región de la decisión 17, medía 303 × 182 mm (Robinson, varones: profundidad 195,3 ± 17,5; −0,76 DE),
y la pared junto a la columna quedaba en 20,8 mm de la piel a la pleura en la paravertebral, la interpolación de la heredada
(28 mm en la línea media) hacia la infraescapular. Engrosar la pared sin ahondar el tronco achicaba aún más la caja.

**Fuentes verificadas en el texto completo.**

- **La profundidad del tórax:** ANSUR II (Gordon y cols. 2014, medida 25, del punto más anterior del tórax a la espalda, de pie,
  en el máximo de la respiración tranquila): varones 253,8 ± 26,2 mm (n 4082, IMC 27,7). En los datos públicos de la misma
  encuesta, los varones de IMC 18,5–25 (n 1061, IMC medio 22,9, el del avatar): 225,8 ± 15,8 [DERIVADO: lo calculé de la
  tabla pública]. ANSUR 1988 da lo mismo en ese subgrupo (228,4 ± 15,1). La anchura del tórax de ANSUR 1988 (al nivel del pezón,
  sin comprimir): 321,5 ± 25,5 mm; con IMC 18,5–25, 304,6 ± 17,0: los 320 de VExUS quedan +0,9 DE y no se tocan.
- **La pared posterior:** Folli y cols. 2020 (ecografía en prono, 26 sanos de IMC 21,9, Tabla 1): piel → costilla en el trapecio
  inferior, 2–3 cm lateral a la apófisis de T8, 25,4 ± 4,5 mm en los varones; en el romboides, 17,2 ± 2,7. Okçu y cols. 2026
  (TAC en supino, 1015 adultos, Tabla 2): piel → pleura en el punto más fino por dentro de la escápula, 31,0 ± 8,3 mm en los
  varones y 26,4 ± 6,8 con IMC normal (los dos sexos, n 296).
- **Pusch y cols. 2000** (piel → pleura paravertebral 24–52 mm, la cifra que se buscaba): solo el resumen, sin las cifras en el
  texto accesible. **NO VERIFICADO**: no entra en `REFERENCES.md` ni en las fuentes de ningún parámetro. Lo sustituyen Folli y
  Okçu.
- La pared infraescapular y la de la LAP por la normal en adultos sanos siguen **NO ENCONTRADO** (`docs/knowledge/anatomy.md`
  §1.1).

**Opciones.** (a) Dejar 320 × 210 y engrosar la pared de la espalda: la caja baja de 182 mm. (b) Ahondar el tronco a la
profundidad del tórax de la base y poner la pared posterior de sus fuentes. (c) Una sección que cambie con la altura (el tórax
no es el abdomen): rehace la piel, el contacto, la parrilla y las tablas por columna; se deja para la unión con VExUS.

**Decisión.** (b), la elegida al revisar el plan («opción B»).

- **El tronco** (`anatomy.torso`, `src/anatomy/scene.ts`, en `parameterSets.ts`): semiancho 160 mm (rango 144–161, [ESTIMADO],
  ANSUR 1988) y semiprofundidad **113 mm** (105–121, ± 1 DE, [DERIVADO], ANSUR II): 320 × 226 mm de piel.
- **La columna** va con la piel de la espalda: el cuerpo a 59 mm de ella y el arco de 27 a 47 mm, lo que tenía en VExUS con b =
  105 (en −46 y de −78 a −58). Su cara posterior sigue a 42 mm de la piel.
- **La pared junto a la columna** (`anatomy.chestWall.paravertebralWallMm`): **28 mm** por la normal (20–35: ± 1 DE de las dos
  fuentes; [DERIVADO], con el valor elegido entre ellas), entre Folli (25,4 + los 5 de la cresta costal a la pleura,
  `anatomy.ribcage.crestToPleuraMm` = 30) y Okçu (26,4 con IMC normal; el artículo no da la distancia de su punto a la línea
  media). Antes era el número de la línea media y la
  paravertebral quedaba en la interpolación (≈ 21); ahora la paravertebral es un nodo de las estaciones de la pared (a 6 cm de
  la línea media) con ese grosor, el mismo hasta la línea media. Un solo músculo (sin trapecio, romboides ni erectores por
  separado: `chest-wall-regional-approx`).
- **El punto BLUE inferior** (`app.startPointPoses.blueLowerZ`, también la altura del PLAPS) pasa de **50,6 a 51,3** mm: con el
  tronco más hondo la parrilla sube 0,73 mm en la axilar anterior y el punto sube con ella, **conservando su sitio respecto de
  las costillas en main**, que no era el centro del EIC4: `intercostalZ` da en main la 4.ª costilla a 63,5 mm y la 5.ª a 34,6
  (centro 49,1; la nota decía 65,0 y 36,1, cifras que el código ya no medía), y con el tronco nuevo 64,2 y 35,4 (centro 49,8).
  El punto queda 1,5 mm por encima del centro, como en main. **No es el criterio de la nota** (el centro): se eligió porque en el
  centro el banco de fidelidad falla (abajo). La nota y el rango (20,5–78,6: los centros del EIC5 y del EIC3) dicen las cifras
  medidas. Si se prefiere el centro exacto, hace falta antes un detector que no dependa del borde a oscuras: queda como
  pregunta abierta en la PR.
- **VExUS** conserva 320 × 210: `docs/UNIFICATION.md` («El tronco») y `docs/PROVENANCE.md` (fila de `scene.ts` y la mejora para
  ofrecer al origen: la profundidad como parámetro con evidencia y la columna atada a la piel).

**Consecuencias: antes → después** (main `0986f8a` frente a esta decisión, medidas con el mismo código).

| Medida                                                                           | Antes                             | Después                     | Fuente / meta                            | Por qué cambia                                                |
| -------------------------------------------------------------------------------- | --------------------------------- | --------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| Caja (bbox de la parrilla)                                                       | 303 × 182 mm                      | 303 × 189                   | Robinson 195,3 ± 17,5: −0,76 → −0,36 DE  | el tronco más hondo                                           |
| Piel → pleura, paravertebral                                                     | 20,8 mm                           | 27,6                        | Folli + costilla 30; Okçu 26,4 ± 6,8     | la pared de sus fuentes                                       |
| Piel → pleura, escapular                                                         | 18                                | 23                          | Okçu (por dentro de la escápula)         | interpolación hacia la paravertebral                          |
| Piel → pleura, LAP (EIC 3 / 5 / 7)                                               | 17,9 / 16,2 / 14,4                | 17,9 / 16,4 / 14,5          | —                                        | la pared lateral no cambia                                    |
| A-T1 (EIC2 LMC), A-T2 (EIC5 LAA/LAM), A-T3 (EIC4 LAM)                            | 16,1; 12,8/12,8; 16,7 mm          | igual                       | dentro de sus bandas                     | la pared anterior no cambia                                   |
| A-T13, borde inferior en FRC (LAM / PV)                                          | −35 / −35                         | −33,5 / −34,5               | Gray, banda sin cambiar                  | la parrilla, algo más arriba                                  |
| A-T19, inclinación de la 7.ª costilla                                            | 33,5°                             | 32,2                        | Robinson 29 ± 7,7                        | la misma caída en más profundidad                             |
| A-T19, la 1.ª (`notYetMet`)                                                      | 16,0°                             | 15,2                        | Robinson 31 ± 8,2                        | ídem (sigue pendiente)                                        |
| A-T15 a TLC (ZOA a ≥ 10 mm de su inserción)                                      | EIC 9 de la LAA a 10,3 mm: cumple | a 9,8: ninguno; `notYetMet` | Boon, supuesto `zoaBelowReflectionMm` 20 | en la LAA la reflexión sube 1,2 mm y el EIC 9, 0,8            |
| A-T15 en FRC (1,1–2,7 mm)                                                        | cumple                            | cumple (prueba aparte)      | Boon                                     | —                                                             |
| A-T24, fosa supraclavicular, mujer obesa (`notYetMet`)                           | 40,4 mm                           | 37,7: cumple (`it`)         | Yadav ± 2 DE (≤ 39,6)                    | la clavícula y la cúpula siguen la piel; no se buscó          |
| A-T24, los otros cuatro hábitos                                                  | 25,7; 31,1; 21,8; 32,7            | 25,6; 30,1; 21,9; 32,4      | Yadav ± 2 DE                             | ídem                                                          |
| Anchos de EIC: LAP 8.º, PV 8.º, LMC 2.º                                          | 16,0; 10,0; 18,0                  | 16,0; 9,9; 18,0             | —                                        | —                                                             |
| Banco de fidelidad, BLUE inferior: error del ápice detectado (apnea / tranquila) | 8,9 / 14,4 px                     | 2,2 / 2,0                   | < 25 px (sin cambiar)                    | el punto de partida (abajo)                                   |
| Cobertura                                                                        | 68/138                            | 68/138                      | —                                        | la cara posterior llega con la pose de espalda (siguiente PR) |

- **El banco de fidelidad en el BLUE inferior es sensible a la altura del punto.** El detector del sector (decisión 21) no ve el
  borde derecho cuando la sombra de una costilla lo cubre (la nota de la e2e: «cuyos bordes están a oscuras»). Con el tronco
  nuevo, el error del ápice detectado (SwiftShader, apnea) es de 38,4 px con el punto en 50,6 mm, 2,2 px (y el borde derecho a
  0,5°) en 51,3 y 50 px en 49,8, el centro del EIC4 (1,5 mm por debajo de 51,3); en main, en 50,6, 8,9 px. La tolerancia (25 px)
  no se ensancha; el punto conserva su sitio respecto de la parrilla de main. La fragilidad del detector a ± 1 mm es un hallazgo
  del banco, no de la anatomía: queda para el ciclo 3b.
- **El PLAPS** (φ 1,15π) usa la misma altura. Bajo él la 6.ª costilla sube 2,7 mm (54,6 → 57,3) y el punto 0,7: el centro de la
  sonda queda a 1 mm del borde inferior de esa costilla (antes, a 3). Probablemente por eso su pared sale más clara (abajo).
- **La calibración del contraste (decisión 24)**: a DR70 y t = 60 s, el ajuste (K 54 dB, R_t 0,3,
  ganancia −20) no se toca y se vuelve a medir. Para separar lo que cambia por la anatomía de lo que cambia por la realización del
  moteado (un campo de dispersores anclado en las coordenadas materiales: con la piel 8 mm más adelante, la pared cae sobre otra
  realización), main se midió con tres semillas (20260921, la del protocolo, 22 y 23). Main (las tres semillas) → esta decisión
  (semilla del protocolo), grises de 8 bits del primer cuadro y medianas de tres réplicas:

  | Ventana       | Pared                       | Neblina                     | M pared                     | M neblina                   | A2.r2                         |
  | ------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ----------------------------- |
  | BLUE superior | 31,07 (29,38–31,07) → 30,20 | 15,59 (13,36–15,59) → 14,09 | 1,858 (1,858–1,880) → 1,911 | 2,017 (2,017–2,039) → 2,076 | 0,5615 (0,554–0,567) → 0,5669 |
  | BLUE inferior | 40,97 (37,99–40,97) → 41,76 | 18,48 (17,85–18,55) → 19,76 | 1,637 (1,628–1,679) → 1,539 | 1,870 (1,846–1,885) → 1,758 | 0,5018 (0,502–0,508) → 0,4987 |
  | PLAPS         | 30,54 (29,84–31,26) → 35,00 | 16,48 (15,94–16,48) → 17,50 | 1,837 (1,823–1,837) → 1,807 | 1,970 (1,954–1,970) → 1,973 | 0,5369 (0,510–0,537) → 0,5307 |

  Main con la semilla del protocolo reproduce la tabla de la decisión 24 (31,07 frente a 31,015 en el BLUE superior; el PLAPS,
  idéntico; el BLUE inferior, 40,97 frente a 40,83). En el BLUE inferior y el PLAPS la pared y la neblina salen más claras y M
  baja (hacia el banco); en el BLUE superior, pared y neblina quedan dentro de la dispersión de las semillas, pero M sube 0,03–0,04
  por encima de ella (se aleja del banco algo menos de lo que la decisión 24 lo acercó). Las cuatro métricas primarias siguen
  fuera de sus p10–p90 en las tres ventanas, como en la decisión 24. La decisión 24 lleva una nota con estas medidas.

- **La GPU** no cambia de código (el tronco y la columna son uniforms que ya existían); las equivalencias TS ↔ GLSL de la e2e
  pasan con el tronco nuevo. **Costo por cuadro** (`frameCostMs`, 60 cuadros, GPU real M4,
  intercalado con main): main 3,1–3,8 ms y esta decisión 3,6–3,8 en los tres puntos de partida. O6 (≥ 30 FPS) holgado.
- Tres pruebas unitarias dependían del tronco de 210 mm: `anatomy.test.ts` toma sus puntos de referencia (la piel, la grasa y la
  columna) respecto de la piel; `pleura.test.ts` mueve la vista oblicua rasante de la cortina de z −50 a −55 (en −50 solo 3 líneas
  rozaban el borde, frente a ≥ 20 exigidas; no porque algo baje, la 8.ª costilla de la LAM y el borde suben 1,5 mm, sino porque el
  flanco cambia de curvatura, b²/a de 68,9 a 79,8 mm; en −55, 56 y 46; la aserción no cambia); `faceGradient.test.ts` pide la
  coincidencia de pendientes en todo el estencil de la distancia de la cúpula (el punto y ± 0,52 mm, el soporte de
  `sdDiaphragm` más el paso del gradiente) y no solo en el punto: excluye el 10 % de los puntos (4679 → 4191; en main, 4352 →
  3903). Con solo el punto, uno a 0,6 mm de un pliegue de columna de la tabla daba 1,5·10⁻⁴ rad; el umbral (10⁻⁴) no cambia y el
  peor ángulo queda en 5,4·10⁻⁶.
- **Efectos pequeños**, sin meta que los mida: la sonda se hunde 0,2–0,4 mm más en los tres puntos de partida (10,88 → 11,29;
  11,83 → 12,03; 11,54 → 11,81 mm); el músculo bajo ellos, 0,2–0,3 mm menos en la métrica radial; el corazón, construido sobre la
  pared, se adelanta 6,9 mm con ella; el semieje vertical de las cúpulas del diafragma baja 1,1 mm; en el maniquí de la interfaz
  (`humanTorso.ts`) el cuello pasa de b·0,73 = 82,5 mm a 46 en 22 mm (antes, de 76,7).
- `thorax-cylindrical-cage` y `chest-wall-regional-approx` dicen los números nuevos.

**Verificación.** `npm run check` (la cobertura de exploración, `anatomyTargets.test.ts` con A-T15 partida en FRC (`it`) y TLC
(`notYetMet`) y A-T24 de la mujer obesa en `it`, `startPoints.test.ts`, `anatomy.test.ts`, `pleura.test.ts`,
`faceGradient.test.ts`, `parameterSets` con `anatomy.torso`). Las 28 e2e con SwiftShader pasan, incluidas las equivalencias TS ↔
GLSL, el banco de fidelidad (en el BLUE inferior con el punto nuevo; con el viejo fallaba por el ápice, 38,4 px) y la
calibración (el criterio de > 50 columnas a DR70 se cumple en las tres ventanas: 193, 186 y 80); la de la pantalla de 320 px
agotó una vez el arranque con la máquina cargada y pasó al repetirla. Revisión adversarial de contexto limpio (ejecutando los scripts de medida en main y en la rama): un bloqueante, el
punto BLUE inferior presentado como el centro del EIC4 cuando el código da el centro en 49,8 (la nota de main ya estaba desfasada
1,5 mm) y en el centro el banco falla: se reescribió la justificación (el punto conserva su sitio respecto de la parrilla de main;
no es el centro) y se deja la pregunta abierta. Importantes: la causa del cambio de la vista rasante en `pleura.test.ts` era
falsa (se corrigió); el filtro de `faceGradient.test.ts` excluía puntos sin decirlo (se declara el n); el cambio bajo el PLAPS no
estaba declarado (se declara). Menores: la fila de la LAP, el rango de `semiWidthMm` y el de la pared paravertebral sin
derivación, la fuente de los 5 mm de la cresta, el DOI de Okçu, dos puntos absolutos que quedaban en `anatomy.test.ts`,
comentarios desfasados (`wallArc`, la cara posterior de la columna a 42 mm, el título de A-T7 alto), el umbral de A-T15 (20,3, no 21) y efectos pequeños sin declarar: todo aplicado. Comprobado correcto por el revisor: las cifras de ANSUR recalculadas de los
CSV públicos, las de Folli y Okçu frente a sus tablas, todas las consecuencias de la tabla, A-T15 y A-T24, la ausencia de
literales del tronco viejo en TS y GLSL, la nota de la decisión 24 y el índice.

**Nota (decisión 36, 2026-10-03).** El detector del sector de la decisión 36 (bordes simétricos sin soporte por fuera y el ápice
desde el arco de la piel) acierta en el centro del EIC4 (0,72 px con la GPU real, donde el de la decisión 21 daba 8,3–36,8): el
punto vuelve al centro, 49,5 mm, que es su criterio, y la pregunta abierta de esta decisión se cierra.

## 29. La espalda: el paciente sentado, la escápula y la columna

**Fecha.** 2026-10-02.

**Contexto.** Con el tronco de la decisión 28, la cara posterior seguía fuera de la cobertura (0 de 44 celdas): en decúbito
supino la sonda no pasa de 1,2π, la escápula no existía (la expectativa de la línea escapular aceptaba el pulmón «junto a ella»)
y la columna era el cilindro y la caja del arco de VExUS (las transversas hasta 40 mm de la línea media [SUPUESTO]). La misión
(requisito de cobertura) pide la espalda con el paciente sentado, como en la clínica, y la escápula solo donde tampoco se toca
en la clínica. Objetivo O2 (fidelidad anatómica, cobertura) y O5 (el alumno encuentra cada zona).

**Fuentes verificadas** (texto completo salvo donde se dice «resumen»; búsqueda del 02-10-2026):

- **Escápula.** El ángulo inferior a la altura de la apófisis de T8 (Cooperstein, metaanálisis: nivel medio 8,01; Gray 1918,
  T7 [DISCREPANCIA]); la raíz de la espina, a la de T3 (Gray 1918). El ángulo superior a 9,1 ± 1,1 cm de la línea de las
  apófisis (derecha; 8,5 ± 1,2 la izquierda; Pontin, 30 sanos, tabla 5), con el borde medial a 3,5–4,8° de la vertical; las
  raíces de las espinas a 17,19 ± 1,85 cm entre sí (Sobush, 15 mujeres, resumen). [DISCREPANCIA]: de la raíz a T3–T4, 6,4–6,6
  cm (Moghadam, 30 mujeres): se siguen Pontin y Sobush, que coinciden. El ángulo inferior, en la línea escapular de la decisión
  26 (Moon: 85 mm), que pasa por él. Largo (ángulo superior → inferior) 152,85 ± 16,77 mm y ancho 103,53 ± 4,57 en varones
  (Garzón-Alfaro, 72 escápulas secas, tabla 3; 155 ± 16 en von Schroeder, resumen); grosor de la parte central del cuerpo 3,0
  mm (Burke, resumen). Trapecio medio 7,1 ± 2,2 mm (Silkjær Bak, 41 sanos, ecografía). La frase «cubre de la 2.ª a la 7.ª
  costilla» no está en Gray 1918 (es de ediciones posteriores): se quita de la expectativa de la cobertura.
- **Columna.** La distancia entre las puntas de las transversas en T8, 58,65 ± 5,05 mm (Li, TAC 3D de 20 sanos; el hueco entre
  dos, 14,2); de la piel a la punta de la espinosa, 8–15 mm en T5–T8 (Grünwald, TAC de mayores con escoliosis: débil).
- **Espalda alta.** Piel → costilla junto al borde medial de la escápula, 27 ± 4 mm en la 5.ª costilla (BL43, a la altura de T4)
  y 20 ± 5 en la 8.ª (BL46, T7), igual en prono que sentados (Wada, 18 varones de IMC 23,3, tabla 1); piel → pleura 1 cm por
  dentro del punto medio del borde medial, 37,8 ± 8,5 con IMC normal (Okçu).
- **Postura.** Sentado, la capacidad residual funcional sube 806 ± 293 mL (Lumb y Nunn, resumen) y el volumen pulmonar
  espiratorio un 9,5 % en la TAC (Yamada); el diafragma queda más craneal en supino (Traser, RM de 3 cantantes). Cuánto baja
  el borde posterior del pulmón sentado: NO ENCONTRADO.
- NO ENCONTRADO: las distancias de la escápula a la línea media en varones sanos (acceso abierto), el subescapular entre la
  escápula y la parrilla, la profundidad de la piel a la escápula, la sección de la apófisis espinosa, la piel → transversa y
  el ancho de los espacios intercostales junto a la columna.

**Opciones.** Para la escápula: (a) una lámina a profundidad fija bajo la piel, en la clasificación de la parrilla (como la
clavícula); (b) una lámina con su espina, su borde lateral grueso y la glena, sobre una pared que la contenga entera; (c) nada
y una expectativa que acepte el pulmón (lo de antes). Para la pared bajo la escápula: (i) la de su línea (16–28 mm: la lámina
corta las costillas en la mitad lateral); (ii) la espalda alta más gruesa con las capas altas de la pared, del centro del EIC5
a la 4.ª costilla de la LAM (la transición de la axila, decisión 17); (iii) un engrosamiento con la forma de la escápula, como la
cúpula pleural (decisión 27), que el campo respiratorio tendría que ver (su cota del jacobiano admite 0,1 mm/mm hacia abajo:
el borde superior de la escápula, 13 mm en 30, no cabe). Para la posición: (α) cambiar la anatomía con la postura; (β) solo el
alcance de la sonda.

**Decisión.** (a), (ii) y (β).

- **La posición del paciente** (`PatientState.position`: supino, por omisión, o sentado; `clampPose(pose, position)` con la misma
  unión en la capa de la sonda): sentado, φ se envuelve en [−π/2, 3π/2) y la sonda da la vuelta al tronco; el simulador acota con
  ella. La cobertura admite las dos posiciones (`SUPINE_REACH`, `SITTING_REACH`; cada celda dice la primera que la alcanza). La
  anatomía es la misma (`patient-position-anatomy`). La interfaz para sentar al paciente y explorar la espalda en el navegador
  3D es la PR siguiente.
- **La escápula** (`anatomy.scapula`, en `organs/ribcage.ts`; índice `SCAPULA_INDEX` en `ribScan`, con su gemelo GLSL y
  `uScapula`, `uScapulaB`): un triángulo en (s, z) —s, la distancia a la línea media posterior por la piel— del ángulo inferior
  (en la línea escapular, a la altura de la apófisis de T8), el superior (a 9 cm de la línea media por la piel y a 153 mm del
  inferior) y la glena (a su ancho del borde medial, a la altura de la raíz de la espina [SUPUESTO]); una lámina de 3 mm con la
  cara posterior bajo la piel y la grasa del hábito y el trapecio medio (13,9 mm por la normal). Los vértices, medidos en la piel,
  van al arco de la mitad de la lámina por la normal, y la distancia de un punto se mide llevándolo allí (detrás, la dirección
  radial de la elipse se abre con la profundidad: sin eso, el borde medial quedaba 4–6 mm por dentro y la distancia pasaba 1,18
  veces la de verdad). Hueso con su sombra; su cara posterior, la cortical que dibuja el tejido de fuera. Sobre la pared
  construida, la glena se acerca al borde medial (bisección) hasta que ninguna costilla asoma sobre su cara posterior
  (`fitScapula`; si ni así cabe, la construcción falla): 54 mm de ancho en la raíz de la espina, no 103,5; bajo su cara posterior
  la lámina corta la parte alta de las costillas en su extremo de fuera (hasta 2 mm; no se ve: es su sombra) (`scapula-plate`).
- **La espalda alta** (`anatomy.chestWall.posteriorHighWallMm`, 32 mm, de la línea media a la escapular; 20 en la
  infraescapular, `infrascapularHighWallMm` [SUPUESTO]), en las capas altas de la pared. 32: Wada en BL43 (27) más los 5 de la
  cresta costal a la pleura (Okçu, 37,8 ± 8,5: −0,7 DE). Los dos valores los acota, además, la transición en altura de las
  capas altas (del centro del EIC5 a la 4.ª costilla de la LAM, la de la axila, que detrás no tiene fuente): con 35, la pleura de
  la paravertebral se inclinaba bajo la 7.ª y la 8.ª costilla (F-T08: un lado a 8,2 mm de la cresta, la media a 6,3); con 24 en
  la infraescapular, la del PLAPS (el detector del banco de fidelidad ya no la seguía: 61 % de las columnas a ±1 mm del gemelo)
  y la de 1,2π bajo la 6.ª costilla (F-T08, 7,3 mm); con 29, además, la salida barata de la pasada B (|∇| de la cara 1,77
  frente a 1,5). F-T08 mira desde ahora la paravertebral (EIC5, 7 y 8).
- **La columna** (`anatomy.spine`, módulo `organs/spine.ts`): las transversas hasta 29,3 mm de la línea media (Li; en VExUS, 40)
  y las costillas acabando 6 mm por fuera, también donde la pared alta es más gruesa (`setRibPosteriorEnds`: la parrilla se
  construye con la pared baja); las apófisis espinosas de T1–T12, barras de 6 mm [SUPUESTO] de la cara posterior del arco a su
  punta, a 11 mm de la piel en el avatar (Grünwald; con la piel y la grasa del hábito), bajando de la altura de su cuerpo a la
  de su punta por la regla de los tres (`spinousTipZ`). La columna se clasifica también dentro de la pared (las espinosas y la
  cara posterior del arco, a 27 mm, que la pared de 32 mm cubría: sin eso, a 25 mm de la línea media la vértebra empezaba a
  36,5 mm y las espinosas quedaban sueltas del arco). El arco sigue siendo continuo, sin transversas por nivel
  (`spine-arch-slab`).
- **La cobertura**: la línea escapular espera la escápula (o el pulmón junto a ella) del ángulo inferior a la altura del superior
  (antes, hasta la 2.ª costilla, atribuido a Gray).
- **La meta A-T18** (la escápula sentado) entra en `anatomyTargets.test.ts`, medida en la clasificación; su segunda parte (con los
  brazos cruzados queda libre el EIC 6.º–7.º junto al borde medial) queda `notYetMet`.

**Consecuencias: antes → después** (main `0fab474` frente a esta decisión, con el mismo código de medida).

| Medida                                                           | Antes                                   | Después                                         | Fuente / meta                            | Por qué cambia                                                                       |
| ---------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Cobertura                                                        | 68/138 (posterior 0/44)                 | **106/138** (posterior 38/44)                   | —                                        | sentado se alcanza la espalda                                                        |
| Lo pendiente de la cobertura                                     | 70 celdas                               | 32, todas bajo el diafragma                     | —                                        | sin hígado ni bazo (la PR del abdomen)                                               |
| A-T18: el ángulo inferior                                        | —                                       | z 14 (la punta de T8 a 11,7; T7–T9, 35 a −11,7) | Cooperstein                              | nuevo                                                                                |
| A-T18: el ángulo superior, por la piel                           | —                                       | 92 mm de la línea media                         | Pontin 91 ± 2 DE                         | nuevo                                                                                |
| A-T18: alto de la lámina                                         | —                                       | 150 mm                                          | Garzón-Alfaro 152,85 ± 2 DE              | nuevo                                                                                |
| A-T18 con los brazos cruzados                                    | —                                       | `notYetMet`                                     | Gray                                     | sin la posición de los brazos                                                        |
| Caja (bbox)                                                      | 303 × 189 mm                            | 303 × 192                                       | Robinson 195,3 ± 17,5 (−0,36 → −0,19 DE) | las costillas hasta la transversa de 29,3 mm                                         |
| A-T19, 7.ª costilla                                              | 32,2°                                   | 31,8                                            | Robinson 29 ± 7,7                        | ídem                                                                                 |
| A-T19, 1.ª (`notYetMet`)                                         | 15,2°                                   | 15,0                                            | Robinson 31 ± 8,2                        | ídem                                                                                 |
| A-T13, borde en la LAM                                           | −33,5                                   | −34                                             | Gray                                     | ídem                                                                                 |
| Piel → pleura paravertebral, EIC3 / EIC5 / EIC7                  | 27,6 / 27,6 / 27,6                      | 32,1 / 32,1 / 27,6                              | Wada 32 arriba, 25 abajo; Okçu 37,8      | la espalda alta                                                                      |
| Piel → pleura escapular, EIC3 / EIC5 / EIC7                      | 23,1 / 23,1 / 23,2                      | 30,3 / 30,3 / 23,2                              | ídem                                     | ídem                                                                                 |
| Ancho del EIC8 paravertebral                                     | 9,9                                     | 10,6                                            | —                                        | los extremos de las costillas                                                        |
| El EIC10 paravertebral en la cobertura                           | pulmón                                  | borde (cumple)                                  | Gray, T11                                | su centro, 4,3 mm más abajo (a 4,2 del borde)                                        |
| F-T08                                                            | EIC2 a 1,2π                             | EIC2 de la LAP; EIC5, 7 y 8 de la PV            | 4–6 mm (sin cambiar)                     | a 1,2π, arriba, la escápula; la espalda alta                                         |
| Punto BLUE inferior                                              | centro del EIC4 a 49,8 (1,5 por debajo) | a 49,5 (1,8 por debajo)                         | decisión 28                              | los extremos de las costillas                                                        |
| Hundimiento de la sonda (BLUE superior / inferior / PLAPS)       | 11,29 / 12,03 / 11,81                   | 11,29 / 12,04 / 11,93                           | —                                        | —                                                                                    |
| Hundimiento en la espalda, sentado (escápula / PV / línea media) | —                                       | 12,6 / 13,6 / 14,9                              | —                                        | la compresión cinemática empuja pared y hueso juntos (`probe-compression-kinematic`) |

- **La calibración del contraste (decisión 24)**, con la misma semilla y el mismo protocolo (DR70, t = 60 s): el BLUE superior
  igual (pared 30,20, M pared 1,911); el inferior casi (41,76 → 41,77, M pared 1,539 → 1,535); el PLAPS, pared 35,00 → 33,93,
  neblina 17,50 → 17,35, M pared 1,807 → 1,818 y M neblina 1,973 → 1,976: los extremos de las costillas y la pared de 1,2π lo
  mueven del orden de la dispersión de las semillas (1,4 grises en el PLAPS, decisión 28). La decisión 24 lleva una nota.
- **El banco de fidelidad**: el error del ápice detectado en el BLUE inferior, 1,7 / 1,5 px (antes 2,2 / 2,0); en el PLAPS, 0,26 /
  0,28, con la pleura del detector a ±1 mm del gemelo en todas sus columnas (74 y 76). Con 24 mm en la infraescapular alta esa
  coherencia caía al 61 %: por eso 20 (medido con la espalda alta de 35 mm; con la de 32, el banco pasa en la e2e final).
- **La GPU**: la escápula y las espinosas en la clasificación (dos uniforms nuevos: la pasada B declara 117 ranuras, 119 la
  dirigida; tope 130). **Costo por cuadro** (`frameCostMs`, 60 cuadros,
  GPU real M4, intercalado con main): en los tres puntos de partida, main 3,4–3,7 ms y esta decisión 3,7–3,8; en la espalda
  (sentado), 3,3 sobre la escápula, 3,9 en la paravertebral y 3,6 en la línea media. O6 (≥ 30 FPS) holgado. La escena se
  construye en 85 ms (main, 70, intercalados; con la primera versión del ajuste de la escápula, 336: ahora es una bisección).
- En la imagen (GPU real): sobre la escápula, la piel, la grasa y el trapecio y la línea brillante del hueso con su sombra;
  en la paravertebral, la pared gruesa de la espalda con el signo del murciélago; en la línea media, las espinosas en sombra, sin
  cortical propia (`spine-arch-slab`).
- **El presupuesto del bundle**: con esta decisión la entrada (con el chunk compartido del contacto) llegaba a 284,1 kB (270 de
  presupuesto) y el total a 835,8 (830). Las notas de evidencia de los parámetros (≈ 36 kB del bundle, texto que la aplicación no lee:
  ni el informe técnico ni la interfaz las muestran) salen del build (`tools/build/evidenceNotes.ts`: el valor de cada `note` de
  un `defineParameters` pasa a `'·'`, con las mismas líneas; la validación de `core/evidence.ts` sigue cumpliéndose al cargar):
  la entrada queda en 249,0 kB y el total en 800,4, sin subir los presupuestos. En desarrollo y en las pruebas, las notas
  enteras.
- La carga de los ganchos de prueba de la e2e (`app/devtools.ts`) informa si falla (antes era silenciosa).
- `thorax-cylindrical-cage` y `chest-wall-regional-approx` dicen los números nuevos; nuevas `scapula-plate`, `spine-arch-slab` y
  `patient-position-anatomy`.

**Verificación.** `npm run check` (935 pruebas, un fallo esperado y una omitida; la entrada en 249,0 kB y el total en 800,4,
dentro del presupuesto). Las unitarias: la cobertura (106/138, cada celda de detrás alcanzada sentado y ninguna en supino),
A-T18 (en la clasificación: el ángulo inferior en z 14, el superior a 92 mm por la piel, 150 mm de alto, el plano de Treves por
la 9.ª costilla junto a la columna, y la sonda sobre la lámina en los EIC 3–6; los brazos cruzados, `notYetMet`), F-T08 con la
paravertebral, `clampPose` sentado, la compresión de la sonda en toda la vuelta, las apófisis espinosas y la transversa en la
clasificación, el plugin de las notas (`evidenceNotes.test.ts`). La e2e con SwiftShader: las 28 pasan; la equivalencia TS ↔ GLSL
con los planos de la espalda (la escápula, la paravertebral, junto a las transversas y la línea media), el volumen del tórax (que
muestrea la espalda), el banco de fidelidad (el PLAPS y el BLUE inferior) y la calibración. En la última pasada completa, con la
máquina cargada (carga media 10–12), una prueba agotó el arranque y pasó sola al repetirla (ver abajo). Revisión adversarial de
contexto limpio, ejecutando: sin bloqueantes. Importantes, aplicados: la distancia a la escápula pasaba hasta 1,18 veces la de verdad (ahora el punto se
lleva a la mitad de la lámina: ≤ 1,04 a menos de 10 mm, y 1e3 más lejos de su grosor); la pared de la espalda alta cubría el
arco y soltaba las espinosas (la columna se clasifica también dentro de la pared); F-T08 no miraba la paravertebral, donde con
35 mm fallaba (32 y tres cortes nuevos); las espinosas no seguían al hábito; los 20 mm de la infraescapular, sin decir en las
aproximaciones que los fijan las pruebas. Menores, aplicados: notas desfasadas, el ángulo superior situado en x (ahora por la
piel), la lámina que corta las costillas 2 mm (no 0,7), `fitScapula` sin aviso si no cabe, la glena de la mujer sobre el ángulo
superior, el gemelo GLSL de la piel, las cifras de Garzón-Alfaro, del serrato y de los kB, el hundimiento en la espalda sin
declarar. La interfaz sin la posición del paciente (`ui/thorax/geometry.ts`) queda para la PR siguiente.

**Las e2e que agotan el arranque.** En tres pasadas locales completas fallaron por tiempo, una cada vez y distinta, pruebas que
pasan solas (la pantalla de 320 px, el navegador 3D, la revisión y el modo M tras perder la GPU), todas en el mismo paso: con el
primer cuadro ya dibujado (el «fps» del estado), `window.__lusTest` no aparece en 60 s. En la traza del navegador 3D, el chunk de
los ganchos se descargó en 9 ms un segundo después de abrir la página, pero la primera evaluación de la prueba
(`typeof window.__lusTest`) no volvió en los 60 s: el hilo principal de la página estaba ocupado, no faltaban los ganchos. La causa
más probable es la compilación síncrona de programas en SwiftShader tras el primer cuadro (las pasadas que se compilan al usarse
y el navegador 3D), que con la máquina cargada pasa del minuto; esta decisión agranda el GLSL de la anatomía (la escápula y las
espinosas). Queda por medir el tiempo de compilación por programa (o compilar en paralelo con `KHR_parallel_shader_compile`) antes
de tocar los plazos. La carga de los ganchos informa ahora si falla (`app/devtools.ts`). En el CI falló `mmode.spec.ts:90` (M móvil; también en main
`0fab474` y en la #36): en su traza, el clic en «Colocar línea» tardó 9,8 s en despacharse (el hilo principal, ocupado: un
cuadro de SwiftShader en la pantalla móvil con el modo M) y el texto del estado, que solo se escribía al dibujar el cuadro
siguiente, no cambió en los 15 s de la prueba. El estado del modo M se escribe ahora en el acto al colocar o cancelar la línea
(`ui/mMode.ts`, `syncStatus`): el texto ya no depende de cuántos cuadros por segundo dibuje la máquina.

**Nota (decisión 33, 2026-10-02): por qué F-T08 falla con 35 mm en la paravertebral.** Es el modelo, no la anatomía. 35 mm
(Wada, 27 de piel a costilla en la 5.ª, más el complejo pleural de Okçu) está dentro de lo medido; lo que no cabe es la forma en
que el modelo pasa de la espalda alta a la baja. Esa transición es la de la axila (decisión 17), del centro del EIC5 a la 4.ª
costilla de la LAM: z 41,8 a 85,8 en el avatar, 44 mm con un `smoothstep` (la pendiente máxima, 1,5 veces la media), a la misma
altura en toda la vuelta. Con 35 frente a los 28 de abajo, la pared crece 7 mm en esos 44: 0,16 mm por mm de media y 0,24 en el
centro (z 63,8, en la paravertebral junto al EIC6, sobre la 7.ª costilla). A los dos lados de la 7.ª y la 8.ª costilla, la pleura
queda a alturas distintas (un lado a 3,8 mm de la cresta, el otro a 8,2; la meta, 4–6). Con 32, 4 mm: 0,09 y 0,14, y F-T08
cumple. En Wada la pared baja 7 mm de la 5.ª a la 8.ª costilla, unos 70 mm de altura en la paravertebral (≈ 0,1 mm por mm): con
esa transición, 35 cumpliría. Queda como limitación (`chest-wall-height-transition`), con la espalda alta en 32; una
transición propia de la espalda, que baje con la parrilla, la quitaría.

## 30. La e2e espera hechos y no plazos: la pérdida del contexto WebGL, el modo M en el teléfono y ocho fragmentos

**Fecha.** 2026-10-02.

**Contexto.** Dos pruebas fallaban en el CI y pasaban al repetirlas. Del 29-09 al 02-10 (siete corridas con sus reintentos y
relanzamientos), `smoke.spec.ts` «sobrevive a la pérdida del contexto WebGL» falló en 5 de 13 ejecuciones y `mmode.spec.ts`
«M móvil» en 7 de 13; en la corrida de la PR #38 sobre el código de main, las dos fallaron en el intento y en el reintento;
repetidas sin reintentos en cuatro corredores (dos veces cada una), 2 de 8 y 3 de 8. Las trazas de Playwright y una medición
en los mismos corredores del CI (un script y un flujo temporales de la PR #38, en su historia y fuera de main: la compilación de main y la de 2d9cfcb
alternadas en el mismo corredor, 12 medidas en 3 corredores) separan cuatro causas:

1. **Un cuadro sobre un contexto ya perdido.** `loseContext()` pierde el contexto en el acto, pero `webglcontextlost` llega
   en una tarea posterior: un cuadro entre los dos registraba «[bucle] FBO incompleto: 0x8cdd» y la prueba, que exige que
   el registro diga solo la pérdida, fallaba (3 de los 5 fallos históricos y 1 de los 2 sin reintentos). Es un fallo de la
   aplicación: una pérdida real del controlador llega igual.
2. **Mirar costaba más que la espera.** Tras restaurar, el renderizador nuevo se arma en 13–22 ms y dibuja su primer cuadro a
   los 3,4–6,7 s; la imagen está a la vista enseguida (en el screencast de la corrida fallida, a los 16 s). Pero con la imagen
   en vivo una captura del lienzo tarda 26–42 s (54 s en las trazas fallidas, esperando que el elemento quede «estable»
   entre cuadros) y decodificarla en la página, con una imagen y un lienzo 2D que la GPU de SwiftShader ocupada tiene que
   devolver, otros 19–41 s. La espera de 90 s se agotaba sin terminar una sola muestra.
3. **El aviso del modo M esperaba al cuadro siguiente.** En el teléfono, con B + M, un cuadro tarda de 3 a 20 s en el CI.
   `#mmode-status` solo se escribía en `draw()`, y la espera de 15 s del aviso «Toca el sector…» se agotaba (5 de los 7
   fallos; lo arregla la decisión 29, PR #39, con la misma medida). La prueba entera, además, pasaba en 2,7–4,0 min con un plazo de 4 (los otros 2).
4. **El reparto.** El fragmento 7/7 no juntaba las lentas (4,2–9,5 min); los más largos son el 2/7 y el 3/7 (10–11,9 min, las
   ventanas del banco de fidelidad). Playwright reparte por cuenta y en orden, sin mirar duraciones.

Los programas GLSL nuevos (vértice, clavícula, tronco: 2d9cfcb frente a main) alargan el primer cuadro tras restaurar de
3,95 a 4,73 s de media y el arranque de 10,7 a 11,6 s (6 pares en el mismo corredor), sin cambiar el tiempo por cuadro
(1,16 frente a 1,11 s): medible pero no la causa. Los corredores no son iguales (AMD EPYC 7763, 9V45, 9V74; Intel Xeon
8370C, 8573C, 6973P): la misma prueba tarda hasta 2,5 veces más en unos que en otros.

**Opciones.** (a) Subir los plazos (90 → 180 s, 240 → 360 s): esconde las causas y alarga cada fallo real; descartada.
(b) Más reintentos: ya hay uno y los dos intentos fallaban juntos; descartada. (c) Congelar antes de mirar: la captura
congelada tarda 5–11 s (0,5–0,9 s recortada de la página), pero la prueba dice que la imagen vuelve en vivo; descartada. (d) Esperar hechos de la aplicación,
decodificar en Node, arreglar la carrera y el aviso en la aplicación, y partir la prueba larga: elegida.

**Decisión.**

- `bindGpuLifecycle` (`src/ui/controllers/gpuLifecycle.ts`, portado de VExUS, ahora «adaptado»): `lost` pregunta también a
  `gl.isContextLost()`. Mejora para ofrecer de vuelta a VExUS.
- `MModeView` (`src/ui/mMode.ts`): la decisión 29 (PR #39, en paralelo con esta) ya escribe el aviso en el acto al colocar o
  cancelar la línea (`syncStatus`), con la misma causa medida aquí; esta añade la llamada en `clear()`, para que mover la
  línea o empezar otra franja tampoco espere al cuadro siguiente (lo halló la revisión adversarial). Congelar aún espera al
  cuadro siguiente, que con la imagen congelada es barato.
- `e2e/smoke.spec.ts`: `screen()` decodifica la captura en Node (pngjs de Playwright, como `navegacion3d.spec.ts`), 0,02 s.
  La prueba de la pérdida espera dos cuadros del renderizador nuevo en su cine (`cineCount ≥ 2` de un renderizador distinto
  del perdido, 60 s) y luego la línea pleural en la pantalla, con los mismos 90 s: en las 12 medidas la primera captura tras
  restaurar ya la tenía (gris 234–243), con 26–45 s por captura (54 s la más lenta de las trazas fallidas): basta la primera.
- `e2e/mmode.spec.ts`: «M móvil» se parte en dos (selección, teclado, equipo y respiración; mandos de 320 a 720 px, congelar y
  apagar M), con un ayudante `onPhone` que arranca el teléfono y comprueba el registro de errores. Ninguna comprobación se
  quita ni se relaja.
- `.github/workflows/ci.yml`: ocho fragmentos. Con 29 pruebas en siete, el segundo habría juntado tres ventanas del banco
  (≈ 13 min); con ocho, el reparto de las demás queda como estaba (el 2.º, 11,9 min en el corredor lento).

**Consecuencias.** El alumno ve el aviso del modo M al empezar otra franja aunque su GPU sea lenta, y una pérdida del
contexto ya no deja un error espurio en el informe técnico. La e2e corre en ocho corredores (uno más) y cada «M móvil»
tarda 1,1–2,8 min en el CI. Pendiente: el reparto por cuenta es frágil (cada prueba nueva lo desplaza; lo dice
`docs/TESTING.md`; Playwright 1.63 lee pesos por fragmento de `PWTEST_SHARD_WEIGHTS`, una variable interna sin documentar que
no se usa por eso), y el 2.º fragmento sigue a ~12 min de 15 en el corredor lento.

**El arranque bloqueado (la hipótesis de la decisión 29), medido.** En local, con una traza de Chrome del arranque y todas las
llamadas de WebGL2 cronometradas: la primera evaluación de la prueba (`typeof window.__lusTest`) tardó 147–149 s, y en ese
tiempo las llamadas de WebGL de la aplicación solo bloquearon 5 s (un `checkFramebufferStatus` que espera a la GPU; enlazar los
17 programas, 0,1 s) y el hilo principal no ejecutó JavaScript. Lo que lo ocupa es una tarea de Chromium (el cierre de un
widget, `RasterImplementation::Finish`) que espera a que el proceso de la GPU vacíe su cola, y el proceso de la GPU estaba en
un único vaciado de WebGL de 148 s: SwiftShader ejecutando los primeros cuadros, donde compila cada canalización en su primer
dibujo. No es la compilación del navegador (que `KHR_parallel_shader_compile` ya reparte; `linkAll` vuelve en 13–22 ms en el
CI), así que esperar `COMPLETION_STATUS_KHR` con un estado de «compilando» no lo acortaría: el coste está en el primer dibujo de
cada programa. En el CI, con un trabajador, ese primer cuadro llega a los 9–14 s del arranque (12 medidas), lejos de los 60 s de
la espera a los ganchos; en local con la máquina cargada pasa del minuto. No se toca ningún plazo del arranque.

**Verificación.** Con el código de main y sin reintentos, en el CI: 2 de 8 y 3 de 8 fallos; con este cambio, 0 de 8 (la
pérdida) y 0 de 16 (las dos «M móvil»), y el CI completo de la PR en verde al primer intento. En local con un trabajador,
0 de 6 antes y 0 de 9 después (la máquina no reproduce el CI); con cuatro trabajadores a la vez, 2 de 4 antes (la pérdida,
plazo de 240 s agotado) y 1 de 6 después (el arranque: ver «El arranque bloqueado»). La carrera no tiene una prueba propia (no se puede forzar un cuadro
entre la pérdida y su evento): la cubre la exigencia del registro de errores, que no trajo «FBO incompleto» en ninguna de las
14 ejecuciones de la prueba con el cambio (9 en el CI: 8 repetidas y la del CI completo; 5 en local: 3 con un trabajador y 2 con cuatro).

## 31. La medida en dB: el detector de líneas A sin la tendencia y el mapa de grises desde el moteado

**Fecha.** 2026-10-02.

**Contexto.** Ciclo 3b-1, la medida (sin tocar la física ni el preajuste). Dos huecos del banco de fidelidad (decisión 21).
Uno: el detector de líneas A busca cada orden como el máximo del perfil axial dentro de su ventana; si el perfil cae mucho con
la profundidad, ese máximo cae en el borde de la ventana y la línea A no se encuentra aunque se vea (se propuso para LUS-35v,
el clip que el coordinador señaló como el de líneas A más marcadas). Dos: el banco compara en gris, y la física (ciclo 3b-2: la
reverberación con su parte difusa, el ruido de recepción) se discute en dB: hace falta el mapa de grises de cada clip, que en
los clips web es desconocido (§3.1, principio 5). El principio: en el moteado plenamente desarrollado la amplitud es de
Rayleigh y la DE de su logaritmo es fija, 5,57 dB, sea cual sea el nivel, así que la dispersión del gris en regiones homogéneas
a distintos niveles da la pendiente local del mapa (`docs/knowledge/physics.md` §2.12). Objetivos O3 y O6.

**Opciones.** Para la tendencia: (a) una mediana móvil centrada; (b) la media de las medianas de cada lado sin el pico; (c)
alinear el perfil con una pleura suavizada. Para el mapa: (a) la DE del gris contra su media (el planteamiento directo); (b)
cuantiles (mediana y p90) con el modelo exacto de la familia de mapas; (c) la de Prager y cols., I = exp(g/D) con D ajustado
para que parches de moteado tengan sus estadísticos ([@prager-moteado-2001]), que solo cubre el mapa logarítmico puro.

**Decisión.**

- **Detector de líneas A** (`structures.ts`, `aLinePeaks`): cada orden se busca como el máximo del perfil MENOS su tendencia
  de profundidad, y la tendencia en cada u es la media de las medianas de cada lado entre ±0,15 y ±0,5 d_pl (b): una mediana
  centrada (a) sube con el propio pico sobre una tendencia inclinada y le quita un tercio de su prominencia (la prueba lo
  mide: 5 de 8 grises). La tendencia del perfil de medias da el gris del pico (fina: la del perfil de medianas va a saltos de
  un gris en 8 bits, y el cociente de brechas N4 se movía un 9 % entre dos contrastes); la del perfil de medianas, el fondo
  de la prominencia (aguanta el recorte). Un orden se encuentra si su máximo es interior a la ventana y sobresale de la
  tendencia. Sobre el perfil sin tendencia casi cualquier ventana tiene un máximo interior, así que (tras la revisión
  adversarial) el ruido del umbral de visibilidad (3σ) es el mayor entre el de la segunda diferencia (el blanco) y la DE
  robusta de la mitad de abajo del perfil sin tendencia desde 1,25 d_pl (el correlado, que la segunda diferencia casi no
  ve), y r_k se guarda solo de los órdenes visibles. El ruido así estimado sale 1,15–1,25 veces el verdadero (la tendencia
  de medianas suma su propia varianza): el umbral efectivo es de 3,4–3,7σ, y una línea A de orden 2 real a 4σ se ve el
  57–84 % de las veces (5–8 puntos menos que con el detector de main y ruido blanco; segunda revisión). Parámetro nuevo `measure.fidelityBench.aLineGap` (0,15 d_pl,
  estimado). (c) se probó y no ayudó: se descartó.
- **El mapa de grises desde el moteado** (`speckleMap.ts`) (b). Con g/G = ((1 + c)^y − 1)/c, y = 1 + dB/RD, el gris de un
  moteado de amplitud A cumple exactamente g + G/c ∝ A^q, así que g₉₀ − g₅₀ es una recta de g₅₀ cuya pendiente y ordenada dan
  c (sin suponer la forma del moteado; negativo si el mapa aplasta los grises bajos) y, si el moteado es de Rayleigh
  (p90 − p50 = 5,21 dB), el rango dinámico. Teselas sin estructura, sin la mediana cerca del negro, sin el p90 en el blanco
  y con p90 − p50 de al menos 6 cuantos (con menos, la cuantización la domina); ajuste robusto por franjas de gris; dos
  diagnósticos: la asimetría por cuantiles en dB (1,57 en el moteado de Rayleigh) y el grano (el desfase al que la
  autocorrelación del gris cae a 0,5), que debe caber 12 veces en la tesela. Cuantiles y no la DE (a): el negro recorta la
  cola baja del logaritmo del moteado (sus nulos) y la DE de las teselas oscuras salía sesgada. **Tolerancias declaradas el
  02-10-2026, antes de mirar los clips**: en sintéticos de Rayleigh (teselas de 16 px, grano ≤ 1 px), c a ±15 % y el rango
  dinámico a ±8 %; en el simulador, con un barrido de ganancia conocido y ubicación por ubicación, c = 3,5 ± 0,5 y RD =
  70 dB ± 5 %; y el mapa de un clip solo se da si hay ≥ 200 teselas en ≥ 4 franjas que cubren ≥ 40 grises, c es estable
  (p10–p90 ≤ máx(1, c/2)) y la asimetría cae en 1,35–1,80. **Después de mirar los clips, solo más estrictas** (la revisión
  adversarial mostró casos plausibles que pasaban por fiables y estaban mal): la banda de asimetría, 1,48–1,68 (Rayleigh
  sintético da 1,56–1,59); el grano, ≥ 12 granos por tesela; la dispersión mínima por tesela. Cada clip lleva su mapa en
  `reference-stats.json`: `grey_map` con teselas del tamaño que pide su grano (de 16 a 64 px) en todo el sector, y
  `grey_map_wall` con las de 16 px de la pared (0,2–0,85 de la pleura; las grandes no caben en ella). `npm run fidelity:db`
  da la tabla en dB.

**Consecuencias.**

- **Líneas A en el banco** (los 34 clips, regenerados). LUS-35f (exploración de C3b-A) pasa a ver su línea A de orden 2 en
  la mediana de sus cuadros: `a_lines` true. LUS-35g no: también sin la tendencia la ve en 16 de 55 cuadros. **LUS-35v sigue
  sin líneas A medibles**: la de orden 2 se ve en 14 de 54 cuadros (sobre el perfil crudo se encontraba en 5). Lo que se ve
  en él son estrías horizontales con un periodo de 11 filas del espacio del haz (autocorrelación 0,69 a 11 filas y 0,50 a 23,
  entre las filas 55 y 140), con la pleura a 39–41 filas: no son k veces la pleura, sino algo compatible con una
  reverberación entre dos capas separadas 11 filas (no se comprobó cuáles). LUS-35i, 16 de 59. El estrato convexo, entre
  clips (antes → ahora): M de la pared 0,749–1,57 (8 clips/4 sujetos) → 0,753–1,54 [1,00] (10/6), M de la neblina
  0,910–1,42 → 0,845–1,32 (10/6), A1 0,102–0,214 (8/4) → 0,092–0,192 (9/5), A2 r₂ 0,140–0,318 [0,229] (8/4) →
  0,158–0,301 [0,185] (9/5); A2 r₃ sigue sin distribución (ningún clip ve el orden 3 en la mitad de sus cuadros). r_k de
  los visibles es una distribución truncada: las medianas por clip se mueven (LUS-01 0,239 → 0,379 con 32 de 60 cuadros;
  LUS-35f 0,376 → 0,262).
- **El falso positivo que encontró la revisión.** Sin líneas A, con un perfil que cae como el de LUS-35v y ruido gaussiano
  suavizado (σ de 0,05 d_pl) de DE 4 grises, el umbral con solo la segunda diferencia daba una línea A «visible» en 195 de
  400 perfiles; con el ruido correlado, en 5. Y r_k de los órdenes no visibles (la prominencia de un máximo de ruido) metía
  valores negativos en el estrato: el p10 de r₃ negativo de la primera versión era eso.
- **La invariancia afín sigue**: la continua, exacta (1e-6); en 8 bits y en la tubería del banco, dentro de las tolerancias de
  #23 salvo la pendiente de ln r_k, que se ensanchó de 0,1 a 0,2 después de ver el resultado (peor caso 0,095 en 200
  corridas; cambia cuando un orden débil cruza el umbral de visibilidad; A1, por lo mismo, 0,017 con la geometría del
  detector, dentro de su 0,03). La propiedad compara r_k de cada orden encontrado, visible o no: que un orden en el umbral
  se vea o no ya lo cuenta A2 visibles.
- **El mapa de grises en sintéticos** (Rayleigh, mapa conocido, tres semillas): c de −2 % a +9 % (c 3,5), ±5 % (c 1 y 8),
  −0,57 a −0,59 (c −0,6) y −0,01 a 0,04 (logarítmico); RD con un sesgo sistemático de +2 % (grano 0,6 px) a +4–5,5 % (grano
  1 px): pocas muestras independientes por tesela, ~3 puntos de margen frente a ±8 %. El grano sube RD (+8 % con 12 granos
  por tesela, +12 % con 9,5, +25 % con 7: de ahí los 12 granos); la persistencia de dos cuadros, +35 % (asimetría 1,36); la
  interpolación entre líneas, +21–28 % (asimetría 1,43–1,45): los tres los rechaza ahora el diagnóstico, que antes dejaba
  pasar la persistencia y la interpolación. El ruido de recepción sumado al eco antes de la detección no lo sesga (la suma es
  de Rayleigh: con −45 dB, c 3,39 y RD +2 %). Lo que aún pasa por fiable y está mal (segunda revisión): una persistencia
  ligera (pesos 0,8/0,2, ≈ 1,5 cuadros efectivos: asimetría 1,50, RD +22–24 %; el rechazo empieza en 0,7/0,3) y un mapa
  fuera de la familia (una sigmoide da c −0,75 y RD 48 frente a 70; una gamma 0,5, RD 82), aunque dentro de los grises
  medidos las diferencias en dB aciertan a ±7 %; por eso `dbBetween` da NaN fuera de esos grises. El mapa exige c estable,
  no RD: RD sigue siendo una cota superior si el moteado puede estar suavizado.
- **Autoprueba en el simulador** (`e2e/mapaGrises.spec.ts`): por ubicación a través del barrido de ganancia, c = 3,44–3,55
  y RD = 69,9–70,1 dB (BLUE superior y PLAPS, GPU real y SwiftShader, corridas del 02-10-2026 sobre main a04ba7c): el mapa se lee de la imagen
  mostrada. Con una sola imagen no: **la región de la pared del simulador no es moteado de Rayleigh**. En su envolvente, en
  parches de 16 muestras × 8 líneas entre 0,2 y 0,85 de la pleura, p90 − p50 = 8,0–9,2 dB en el BLUE superior y el PLAPS
  (Rayleigh: 5,21, menos en parches finitos con grano) y la asimetría 0,94–0,96 y 1,28–1,30 frente a 1,57; en el BLUE
  inferior, con la pared de la espalda de main (decisión 29), 6,3 dB y 1,48, cerca de Rayleigh. La región mezcla la grasa
  con sus grumos, las caras, los planos intermusculares y las estrías. El músculo sin estructura
  (`speckleMask`) casi no tiene parches en estas vistas (3 y 0) y no se mide aquí: su moteado lo vigila `imagen.spec.ts` en la
  zona paraesternal (SNR de Rayleigh). El estimador de una imagen da c 4,2–4,4 y RD 44–51 dB, y no los da por fiables: la
  asimetría en dB (1,09–1,12) y el grano lateral de la imagen mostrada, 2,9–3,0 × 1,4 px, grueso para teselas de
  16 px. (La primera versión decía que el moteado de la pared no era de Rayleigh con ventanas de 16 muestras en una línea, sin
  máscara: la revisión mostró que eso mezclaba estructura con moteado.)
- **Los clips: ninguno permite estimar su mapa con fiabilidad.** En los 19 aptos, el grano con teselas de 16 px es de
  2,1–4,8 px en x y 1,1–1,5 en y (el de la imagen del simulador, 3,0 × 1,4): pide teselas de 32–64 px, de las que quedan
  2–204 por clip, y sobre ellas el grano medido crece (2,3–9,9 px en x): hay correlación más allá del moteado (suavizado,
  recompresión, estructura). La asimetría en dB, donde se mide (9 clips), 0,65–1,15; en los otros 10 la dispersión no es
  una recta del gris de un mapa de la familia. Solo en la pared, con teselas de 16 px: 0,55–1,18 (9 clips), ninguno cerca
  de 1,57; el más cercano, LUS-02 (1,18 en 55 teselas). La primera versión daba c 14–141 y RD 93–190 dB con teselas de
  16 px en todo el sector: la revisión mostró que eran sobre todo teselas del campo profundo, oscuro, con la dispersión
  dominada por la cuantización (LUS-02: 4023 de 4643 teselas a más de 3 d_pl, en grises 5–17). Con la dispersión mínima de
  6 cuantos y la tesela del grano, `grey_map` de todo el sector aún tiene mucho campo profundo en algunos clips (LUS-02, 60
  de 105 teselas a más de 3 d_pl; LUS-35s, 132 de 143): de ahí `grey_map_wall`. Cuando la autocorrelación no cae antes de
  media tesela, el grano es una cota (≥). Es lo que anticipan Kaplan y
  Ma (los histogramas reales se apartan por la compresión no ideal, el ruido y el suavizado; [@kaplan-lograyleigh-1994]) y
  Smith y Raza (con la compresión desconocida hacen falta cientos de ventanas; [@smith-compresion-2026]), con vídeos
  recomprimidos (MPEG-2, h264, Theora). **Las brechas en dB de los clips no se dan.**
- **La tabla en dB del simulador** (envolvente sin recortar, esta rama sobre main a04ba7c, GPU real, respiración tranquila;
  entrada del ciclo 3b-2): pleura − pared 48,0–48,9 dB, pleura − neblina 56,3–58,3, pleura − campo profundo 70,6–73,1; la
  caída por orden de las líneas A, 18,3–21,5 dB del orden 1 al 2 y 20,6–21,6 del 2 al 3, frente a 20,2–20,3 de F-T02
  (−20·log₁₀(R_p·χ·R_t) − 20·log₁₀T(D) − la compensación nominal); la región de la pared, DE 5,6–7,7 dB (Rayleigh: 5,57).
  Con SwiftShader, dentro de 0,9 dB.
- **La partición de C3b-A (decisión 24)** cambia sus SHA-256, con su entrada en `revisions`. En exploración, M de la pared
  entre sujetos pasa de 1,19–1,43 (2 clips, 2 sujetos) a 0,851–1,40 (4/4), M de la neblina de 0,955–1,03 a 0,870–1,00, A1
  de 0,113–0,197 (2/2) a 0,059–0,185 (3/3) y A2 r₂ de 0,129–0,248 (2/2) a 0,168–0,246 (3/3); en comprobación, M de la pared
  0,880–0,917 → 0,896–0,911, A1 0,165–0,203 → 0,145–0,152 y A2 r₂ 0,222–0,235 → 0,176–0,222. Los ajustes de C3b-A se
  eligieron con la versión anterior.
- Limitación `speckle-statistics-uncalibrated` ampliada: la región de la pared del simulador no es de Rayleigh y el mapa
  de los clips no se puede estimar.

**Verificación.** `npm run check` en verde. Las pruebas del detector (un perfil que cae mucho con la profundidad, como el de
LUS-35v: la búsqueda en el perfil crudo cae en el borde; el mismo perfil sin líneas A y con ruido correlado: casi ninguna
visible) y del estimador (`src/validation/speckleMap.test.ts`: sintéticos de Rayleigh con mapas conocidos, c negativo, el
logarítmico puro, recorte, grano, interpolación, persistencia, ruido de recepción, una textura que lo aparta de Rayleigh; el
barrido de ganancia por ubicación); la invariancia afín con fast-check, 200 corridas por propiedad; la tabla en dB y el mapa
de cada clip en `fidelityReference.test.ts`; la autoprueba en el simulador (`e2e/mapaGrises.spec.ts`, GPU real y
SwiftShader) y las e2e de fidelidad y de C3b-A. **Mutaciones del código**, cada una atrapada: buscar los picos en el perfil
crudo y la tendencia con la mediana centrada (la prueba del perfil que cae), el ruido sin la parte correlada (la del ruido
correlado), el umbral absoluto en la visibilidad y M sin la línea A (la invariancia continua), c sin la ordenada, la DE de
Rayleigh en lugar de la distancia entre cuantiles, el estimador sin el diagnóstico de asimetría y sin el del grano (las
pruebas del mapa). Revisión adversarial de contexto limpio antes de abrir la PR, ejecutando: halló el falso positivo de las
líneas A, el c negativo leído como logarítmico, la pared del simulador medida sin máscara, la banda de asimetría demasiado
ancha y los números de los clips dominados por el campo profundo; todo corregido aquí. Una segunda revisión, sobre las
correcciones, confirmó B1 (sin líneas A, de 3–79 % de perfiles con una «visible» a 0–3 %), el c negativo, que los parches
16 × 8 de Rayleigh dan 4,2–5,1 dB y asimetría 1,56–1,66 (la región de la pared del BLUE superior y del PLAPS, 8,0–9,2 y 0,94–1,30, no lo es) y que
`reference-stats.json` se reproduce exacto; y halló lo que queda dicho arriba (umbral efectivo, persistencia ligera, mapas
fuera de la familia, campo profundo, grano truncado). Su resumen, en la PR.

## 32. El pulso pulmonar: el pulmón junto al corazón se desliza con el latido (A-T16)

**Fecha.** 2026-10-02.

**Contexto.** La meta A-T16 pedía, en apnea, el pulso pulmonar junto a la ventana cardiaca (`notYetMet`: «hoy nada se mueve
con el latido», `heart-simplified`). Es un signo clínico (en ese punto descarta el neumotórax; Lichtenstein 2003, D11) y la base
de la sinusoide del derrame. La base decía NO ENCONTRADO para su amplitud (`docs/knowledge/physics.md` D12). Una búsqueda nueva
(PubMed, Europe PMC con texto completo; las cadenas en el Anexo A de `physics.md`), con cada cifra leída en el texto completo
(los artículos, fuera del repo):

- **Ecografía: solo cotas.** Ninguna amplitud del pulso pulmonar aislada del ruido. En apnea espiratoria, el movimiento
  lateral máximo de la línea pleural en el plano de la imagen es de 1,2 ± 0,6 mm (Costamagna 2026, 7 varones sanos, 12
  campos, sin filtrar el latido; los autores lo atribuyen en parte al pulso), y de pico a valle 0,78–4,32 mm por zona, la
  izquierda mayor (Fung 2025, un voluntario: lateral superior 4,32 frente a 0,78; anterior inferior 3,83 frente a 2,67).
- **El pulmón junto al corazón, sí** (D12a–D12b). El borde mediastino–pulmón barre, entre las fases del 10 al 90 % del RR y
  perpendicular a la pared del corazón, 6,98 ± 1,99 mm (parte alta) y 7,76 ± 3,26 (baja) junto a la pared libre del
  ventrículo izquierdo y 2,70 ± 1,00 junto al derecho (Hsu 2017, TAC coronaria, 38 adultos, Tabla 2). Por RM con sincronía ECG
  en apnea (White 2014, 10 sanos): máximo 17,6 mm en el pulmón junto al borde corazón–pulmón; el 84,5 % del tejido imagenado
  se mueve menos de 1 mm y lo que pasa de 1 mm está «casi exclusivamente» junto al corazón, con una caída rápida fuera de esa
  zona (sin la curva de distancia); el máximo, en la telesístole.
- **Tumores** (D12c). Media 1,0 mm (0,2–2,6), mayor en el pulmón izquierdo (1,20 ± 0,68 frente a 0,65 ± 0,45), sin relación
  con la distancia al corazón (Chen 2014, fluoroscopia, 23 pacientes); 1–4 mm, mayor en la lateral, cerca del corazón
  (Seppenwoolde 2002, solo el resumen).

**Opciones.** (a) Meter el latido en el campo respiratorio de la decisión 22: ese campo es 0 en la pared y sube en 25 mm (el
pulmón bajo la pleura no lo usa: lo mueve el deslizamiento de la decisión 19, que ancla la arena del pulmón), es vertical y su
inversa es una bisección en la vertical; un latido que se vea en la pleura necesitaría un campo distinto de 0 justo bajo ella,
oblicuo, que la bisección no invierte. (b) Un campo del pulmón propio, como el deslizamiento: lo que se mueve en la imagen es la
arena bajo la pleura, anclada al pulmón. (c) Pintar una oscilación en el modo M: prohibido (guía §5). Elegida (b), con las
mismas garantías que la decisión 22 (invertible por construcción, inversa de error acotado y propiedades fast-check).

**Decisión.**

- **El latido del reloj único** (`src/physiology/ventricle.ts`, `PhysiologySample.cardiacEjection`): la fracción del volumen
  latido expulsada, 0 en la R y 1 en la telesístole (donde White mide el máximo), con dos cosenos alzados atados a los eventos
  mecánicos del latido de VExUS (sube hasta la onda v con su punto medio junto al descenso x; baja en el llenado rápido con el
  punto medio en el descenso y). Sin números propios; la diástasis y la contracción auricular no cambian el volumen [SUPUESTO].
- **El campo** (`src/anatomy/organs/lungPulse.ts`, TS y GLSL en el registro de órganos tras el corazón):
  u = −A·e(t)·g(d)·n̂c. El pulmón sigue a la cara del corazón, que en la sístole se retira por su normal n̂c (la del elipsoide
  en el punto: la dirección en que Hsu mide el borde). A es la del ventrículo izquierdo (`leftVentricleMm`, 7,37 mm: la media
  de las dos zonas de Hsu; derivado, rango 4,99–11,02, la media ± una DE) en las caras de los lados y de detrás, y la del
  derecho (`rightVentricleMm`, 2,70 mm, documentado, ± una DE) en la anterior, la de la ventana, mezcladas con la componente
  anterior de n̂c [SUPUESTO: la mezcla]. g = 1 − smoothstep(0, `reachMm`, d), con d la distancia a la cara del elipsoide y
  `reachMm` 40 mm (estimado, 25–60: los 7,4 mm bajan a 1 mm a ≈ 30 mm, la «caída rápida» de White). De él solo se desliza la
  parte tangente a la pared, v = (I − n̂n̂ᵀ)u: sin derrame, la pleura visceral no se separa de la parietal y lo normal lo
  absorbe el aire del pulmón. Por eso donde la cara del corazón es paralela a la pared (la ventana, el ápex de frente) se
  desliza poco, y en el borde del corazón, donde su cara está oblicua, más. Lo que el borde se desliza a lo largo de la cara del
  corazón (no medido) no entra.
- **Invertible por construcción.** v es contractivo: |∇v| ≤ `LUNG_PULSE_INVERSE.lipschitz` = 0,8 con las mayores amplitudes
  del rango (11,02 y 3,70 mm), comprobado con fast-check en las seis variantes del tórax en el pulmón de la banda subpleural
  (0–10 mm bajo la pleura; la GLSL lo evalúa solo en la pleura de cada línea) al alcance del corazón (medido con la norma de
  Frobenius en una rejilla: 0,75, en el pulmón pegado a la cara del corazón; el término del decaimiento solo, 11·1,5/40 =
  0,41). Por eso x ↦ x + v(x) es un difeomorfismo (det ≥ (1 − L)³ > 0) y la inversa por punto fijo, x ← p − v(x), converge:
  25 pasos dejan el error ≤ 11,02·0,8²⁵ = 0,042 mm, bajo la tolerancia de 0,05 mm (el módulo lo comprueba al cargarse, como la
  bisección). Dos pasos (la inversa de VExUS) no llegan: la mutación falla.
- **Lo que se ve** (`slidingField` en `src/ultrasound/pleura.ts`): la arena del deslizamiento se ancla al punto del pulmón antes
  del latido, `lungPulseInverse(toMaterial(pD))`, como ya se anclaba al pulmón antes de la inspiración (el pulmón que está en
  pD estaba en x, y antes, el descenso más arriba). Nada se pinta: el modo M registra la línea de la envolvente mostrada, y la
  arena bajo la pleura cambia con el pulmón. `uLungPulse` = e(t), un escalar por cuadro; fuera del alcance del corazón la GLSL
  no entra en el bucle. La gemela TS de `slidingField` recibe `pD` ya invertido.
- **Medida** (`src/measure/lungPulse.ts`): F-T11, la menor correlación entre columnas del modo M de la banda 1–6 mm bajo la
  pleura separadas ≤ 2 s; S3, el pico del espectro de esa banda. S3 pide el pico del desplazamiento pleural: se mide sobre el
  gris de la banda (lo que el desplazamiento hace en la señal), no sobre un desplazamiento seguido. Ganchos de la e2e
  `lungPulse` (el modo M de la línea central a intervalos fijos del reloj) y `lungPulseEquivalence` (la GLSL frente a TS:
  `queryPoints` escribe el pulso en un cuarto adjunto).

**Consecuencias.**

- **Amplitud por distancia** (el deslizamiento en la telesístole, 1,5 mm bajo la pleura): 5 mm por fuera del borde craneal de
  la ventana (d 18 mm, la cara anterior), 0,88 mm; a 10, 20 y 30 mm, 0,79, 0,52 y 0,22; sobre el ápex (5.º EIC, LMC; d 5–6
  mm), 1,2–2,0 (2,57 bajo la línea central de la sonda); en el borde izquierdo del corazón (11 cm de la línea media, d 15–17),
  3,2–3,5; a 13 cm (d 31–35), 0,3–0,8; a 15 cm (d > 50), 0; en los tres puntos de partida (hemitórax derecho, d 80–122), 0
  exacto. Frente a las cotas ecográficas en apnea: por encima de Costamagna (1,2 ± 0,6 mm en el plano, en 12 campos que no
  son el borde del corazón) junto al borde, y dentro de Fung (un sujeto, de pico a valle, a la izquierda). No se ajustó a
  ninguna de las dos, y lo que se compara no es lo mismo: aquí es la magnitud 3D del deslizamiento, allí su componente en el
  plano de un corte.
- **A-T16 se cumple** (`anatomyTargets.test.ts`): en apnea, el pulmón 5 mm por fuera de la ventana se desliza 0,88 mm hacia el
  corazón una vez por latido y vuelve a 0 en la telediástole. En la imagen (`e2e/pulso.spec.ts`, modo M sobre el ápex en
  apnea): el pico de la banda a la FC (1,17 Hz; 762 veces la mediana con 120 columnas en GPU real, 19–33 con las 30 de la e2e) y
  correlación en 2 s de 0,70: no es una estratósfera. Respirando, el deslizamiento manda (correlación 0,36 y el pico a 0,67 Hz;
  medido una vez, sin prueba).
- **F-T11 sigue**: con deslizamiento 0 y pulso 0 (el punto BLUE superior en apnea), correlación 0,9999 (GPU real) y 1
  (SwiftShader). La base combina los dos: la estratósfera exige los dos en 0; junto al corazón, en apnea, ya no se cumple, como
  en el paciente (Lichtenstein: pulso en apnea en 15/15 sanos).
- **El gemelo**: 1405 puntos del pulmón junto al corazón, deslizamiento de hasta 5,3 mm, diferencia GLSL − TS ≤ 1,3·10⁻⁵ mm
  (GPU real).
- **Costo por cuadro**, sobre el ápex en la telesístole (el bucle entero), la pasada B aislada (`frameCostMs` con la pasada
  repetida cuatro veces, mediana de 5, alternando main 6d8476d y la rama): con la GPU de este Mac (Metal), 1,92–2,14 ms en main y
  1,90–1,97 en la rama, sin diferencia medible; con SwiftShader, 211–214 ms frente a 218–229 (+4–18 ms, ≈ +5 %, con la máquina
  compartida). Lejos del corazón la GLSL sale en la primera distancia al elipsoide.
- **La e2e suma dos pruebas** (el gemelo con F-T11, y S3 sobre el ápex): la primera versión, una sola con 73 columnas, pasó de los
  240 s en el CI de #42 (4,1 min, y su reintento agotó los 15 min del fragmento); partida en dos y con 30 + 12 columnas, cada una
  registra lo que tarda cada paso (`PULSO …` en el registro). En el CI de #42: 13–15 s el arranque, 17 s el gemelo y
  2,4–2,5 s por columna del modo M, cerca del corazón y lejos (30 s las 12 del punto BLUE, 71 s las 30 del ápex: el latido no
  encarece el cuadro de forma visible); cada prueba, 1,4–1,5 min de sus 4. Con 32 pruebas en ocho fragmentos, cuatro por fragmento: las
  ventanas del banco de fidelidad no se juntan más que antes.
- **Pendiente**: el corazón sigue sin moverse en la ventana (`heart-simplified`), y tampoco siguen al pulso el borde del pulmón
  ni el de la ventana (la arena junto a la ventana se desliza hacia ella, su borde no); la sinusoide del derrame usará la parte
  normal del campo cuando haya líquido; la amplitud ecográfica, la curva de distancia y el deslizamiento del borde a lo largo
  del corazón siguen sin medirse (`reachMm`, estimado).

**Verificación.** `lungPulse.test.ts` (contractivo con las mayores amplitudes, det ≥ (1 − L)³ y vuelta a ≤ 0,05 mm con toda
fracción expulsada; la mutación de dos pasos falla; tangente a la pared; hacia el corazón (contra la normal de su cara: un error
de signo falla); decae y es 0 desde su alcance; más en el borde del corazón que en el ápex y la ventana; la fracción expulsada),
`anatomyTargets.test.ts` (A-T16, ahora `it`, con la dirección), `lungPulseMeasure.test.ts` (S3 y F-T11 sobre franjas sintéticas;
las guardas de texto de la GLSL) y `e2e/pulso.spec.ts`. La mutación de la e2e: sin `lungPulseInverse` en `slidingField` el pico
de la banda sobre el ápex se fue a 3 Hz y la correlación subió a 0,9999: la prueba falló en la aserción del pico. La revisión
adversarial de contexto limpio halló la dirección (radial en el primer borrador; Hsu mide por la normal del corazón), la
amplitud del ventrículo izquierdo aplicada a la cara anterior, el umbral del determinante, el dominio de la cota de Lipschitz,
la falta de una prueba del signo y cifras de las fuentes mal resumidas: todo aplicado.

## 33. La espalda en el navegador: sentar al paciente y los puntos de partida paravertebrales

**Fecha.** 2026-10-02.

**Contexto.** Con la decisión 29 el motor ya acotaba la sonda con la posición del paciente (sentado, toda la vuelta), pero la
interfaz no tenía cómo sentarlo y el navegador 3D seguía acotando como en supino (`surfacePose` y `nudgePose` con el arco de
`SCAN_LIMITS`): las 38 celdas de la espalda que la cobertura alcanza sentado no las alcanzaba el alumno. Tampoco había puntos de
partida detrás, y la clavícula (decisión 27) y la escápula (decisión 29) no se dibujaban. Objetivo O5 (el alumno encuentra cada
zona) con lo que ya da O2.

**Fuentes.** Las áreas paravertebrales del esquema de 14 de Soldati y cols. (paciente sentado si se puede; basal «por encima del
signo de la cortina», media en el ángulo inferior de la escápula y superior en su espina; barrido intercostal de 10 s;
`docs/knowledge/clinical.md` §3.5). Las alturas, de la decisión 29 (Gray: la raíz de la espina a la altura de la apófisis de
T3 y el borde posterior del pulmón en T10; Cooperstein: el ángulo inferior en T8) y la paravertebral a 60 mm de la línea media
(decisión 26). No hay número nuevo de anatomía.

**Opciones.** Para la posición en la interfaz: (a) un control en los ajustes y tarjetas que sientan al paciente; (b) sentarlo
solo al ir a la espalda (al arrastrar más allá de 1,2π); (c) un modo «espalda» aparte. Para los puntos: (i) las tres áreas
paravertebrales derechas de Soldati, en el centro del EIC que cae a su altura; (ii) los puntos de los protocolos de
cardiología (posterior basal); (iii) ninguno. Para dibujar la clavícula y la escápula: con las costillas, en la guía ósea, o
aparte.

**Decisión.** (a), (i) y con las costillas.

- **La posición** se elige en Ajustes → Paciente (Supino/Sentado, `AcquireActions.setPosition`); la raíz
  (`setPatientPosition`, en `main.ts`) cambia `PatientState.position` y vuelve a acotar la pose: al tumbar al paciente con la sonda
  en la espalda, queda en el borde de la cama (1,2π o −0,2π). Las tarjetas de la espalda sientan al paciente antes de animar la
  sonda hasta su punto; «Reiniciar paciente» conserva la posición, como conserva la sonda. (b) cambiaría el estado del paciente
  con un gesto que no lo dice; (c), una interfaz más.
- **El navegador 3D** acota con la posición (`scanArc`: en supino, de −0,2π a 1,2π; sentado, de −π/2 a 3π/2, con la línea media
  posterior como corte): el arrastre (`surfacePose`) y los botones finos (`nudgePose`) recorren la espalda y la cruzan. En supino,
  un punto de la espalda deja la sonda donde estaba y el pie dice cómo llegar («sienta al paciente»); la región del pie dice
  «posterior» por detrás de la axilar posterior sentado, y la posición. `wrapPhi` devuelve φ sin tocarlo dentro de la vuelta (el
  módulo movía un ulp en cada cuadro).
- **Los puntos de partida de la espalda** (`app.posteriorStartPoses`; `StartPoint.position: 'sitting'`): las tres áreas
  paravertebrales derechas de Soldati en la paravertebral derecha (φ = π + acos(60/160), 1,3776π), con el marcador craneal como
  los demás: la superior en el centro del EIC3 (138,5 mm; la raíz de la espina, a la altura de T3, cae sobre la 3.ª costilla), la
  media en el del EIC8 (18,4; el ángulo inferior, a la de T8, cae sobre el borde superior de la 9.ª costilla; el EIC8, el más próximo) y la basal en el del EIC10 (−30,8; el borde posterior
  del pulmón en espiración, T10, a −35, cae por debajo). [DISCREPANCIA]: Soldati barre en intercostal; la tarjeta empieza en
  longitudinal, como los puntos BLUE (el signo del murciélago), y el alumno gira. La izquierda no tiene tarjetas (los puntos de
  partida son del hemitórax derecho, decisión 12): se llega arrastrando.
- **La posición en el cine**: cada cuadro guarda la posición del paciente con que se adquirió (`AcquisitionState.position`, como
  la maniobra); con la imagen congelada, el pie del navegador y el control de Ajustes muestran la del cuadro elegido. Los ganchos
  de la e2e que van a un punto de partida (`goTo`) ponen la posición del punto (sentado en la espalda, supino en los demás), para
  que un gancho no herede la del anterior.
- **La inversa del campo respiratorio, con 12 pasos** (nota de la decisión 22): con los planos de la espalda, la equivalencia de
  la cáscara en la inspiración profunda vio en el basal la cara del diafragma 0,023 mm fuera de la cota (0,02): una última
  decisión de la bisección distinta entre la CPU y la GPU. Con 12 pasos, ese salto queda bajo la cota para cualquier cara; la
  cota no cambia. La cota de error que queda: el punto material a ≤ D/2¹³ de la raíz (0,0065 mm con los 53 de la base, 0,0092
  con los 75 de su rango; antes, D/2¹¹, 0,026), el residuo en el mundo a ≤ 2,6·D/2¹³ (0,017 con 53), y entre la CPU y la GPU, a
  lo sumo un intervalo final, D/2¹² (0,013 y 0,018 mm), bajo los 0,02 de la cáscara.
- **La clavícula y la escápula** se dibujan con las costillas (el botón «Costillas»), de otro tono (la escápula, al estar en la
  espalda curva, se ve casi de canto y del color de las costillas no se distinguía): la clavícula, un tubo de su radio a lo largo
  de su eje (`clavicleMesh`); la escápula, la mitad de su lámina en una rejilla del triángulo (`scapulaMesh`). Los dos, a la
  profundidad de la clasificación por la métrica de la parrilla, como las costillas.

**Consecuencias: antes → después** (main `a04ba7c` frente a esta decisión).

| Medida                                                        | Antes                    | Después                                                                                       | Por qué cambia                       |
| ------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| Cobertura                                                     | 106/138                  | 106/138                                                                                       | la anatomía no cambia                |
| Celdas de la espalda que el alumno alcanza en la interfaz     | 0 de 38                  | 38 de 38 (sentado)                                                                            | el navegador acota con la posición   |
| Puntos de partida                                             | 3 (BLUE derecho y PLAPS) | 6 (y las tres paravertebrales derechas)                                                       | nuevos                               |
| Piel → pleura, línea central (superior / media / basal)       | —                        | 32,1 / 27,6 / 27,6 mm (en el sector: 32,1–34,7 / 27,6–33,7 / 27,6–29,8; con la sonda hundida) | la pared de la espalda (decisión 29) |
| Líneas con pleura en el basal                                 | —                        | 147 de 192 (las 45 caudales, bajo el borde del pulmón)                                        | la cortina                           |
| Planos de la equivalencia TS ↔ GLSL (barrido / pleura de A0)  | 10 / 6                   | 13 / 9                                                                                        | los tres puntos de la espalda        |
| Inversa del campo respiratorio: pasos / error material con 53 | 10 / ≤ 0,026 mm          | 12 / ≤ 0,0065 mm                                                                              | la cáscara en el plano basal         |

- **Costo por cuadro** (`frameCostMs`, 60 cuadros, GPU real M4 con la ventana de 1440 × 900, tres pasadas intercaladas): los
  puntos BLUE y el PLAPS, 4,9–6,1 ms; los de la espalda, 5,5–6,8 (el basal, el más caro: 6,6–6,8). El GLSL solo cambia en los
  pasos de la inversa, sin costo medible (arriba). O6 (≥ 30 FPS) holgado según esta medida, pero la medida misma es dudosa: en
  la GPU real cada medida deja un aviso de WebGL (`readPixels` RGBA/UNSIGNED_BYTE sobre el framebuffer que esté ligado en
  `finishForTiming`, que puede ser uno de coma flotante), así que la espera de la GPU podría no estar ocurriendo y los
  milisegundos salir bajos. Viene de main; queda como limitación (`frame-cost-timing-sync`) para una PR aparte.
- `patient-position-anatomy` y `navigator-parametric` dicen lo que hace la interfaz; nueva `chest-wall-height-transition` (la nota
  de la decisión 29).

**El CI en nueve fragmentos.** Con la prueba nueva de la espalda la e2e pasa de 32 a 33 pruebas, y Playwright reparte por
cuenta y en orden: con ocho, el 1.º recibe cinco y todo se corre una, y el 2.º juntó la calibración del PLAPS y las tres
ventanas del banco de fidelidad (1,4 + 4,8 + 4,6 min y la cuarta en marcha): el CI de la PR lo canceló a los 15 min, sin
ningún fallo de aserción (las tres pruebas que terminó pasaron, con las duraciones de main: 4,7 y 4,5 min las ventanas). Como
en las decisiones anteriores (de cinco a ocho), un fragmento más y no un plazo mayor: con nueve, el 2.º (la calibración del
BLUE inferior y del PLAPS y dos ventanas) y el 3.º (la ventana del PLAPS, el barrido de ganancia y el navegador humano) son
los mismos que en main con 32 en ocho (12,3 y 12,5 min en su CI); comprobado con `CI=1 npx playwright test --list --shard`.

**Pendientes.** Las tarjetas son del hemitórax derecho (decisión 12): la espalda izquierda se alcanza arrastrando, sin tarjetas
(`normal-acquisition-only`). El maniquí del navegador no cambia de postura al sentar al paciente: sigue erguido con los brazos a
los lados, la postura de la escápula del modelo, sin cruzar los brazos para abrir la espalda (`patient-position-anatomy`). La
animación hacia una tarjeta recorre φ en línea recta: sentado, de la espalda izquierda a la derecha pasa por delante del tórax y
no por la línea media posterior (`patient-position-anatomy`). La anatomía no cambia con la postura (la misma limitación).

**Verificación.** Las unitarias: los puntos de la espalda (en la paravertebral, en el centro de su EIC a menos de 0,1 mm y su
rango entre los centros de sus costillas; sentados, y en supino `clampPose` los deja en 1,2π; la pleura bajo la pared posterior;
el signo del murciélago en el superior y el medio; la cortina del basal en el borde caudal), el arrastre y los botones sentado
(cruzan la línea media; en supino, no), las mallas de la clavícula y la escápula frente a la clasificación, la equivalencia de la
pleura con una «GPU» falsa que acota como el simulador (sin sentar al paciente, la sonda se quedaba en 1,2π y la prueba lo ve). En el
navegador real (Chromium con la GPU del M4, la aplicación servida por Vite): en supino, un clic en la espalda deja la sonda y el pie
lo explica; Ajustes → Paciente → Sentado; un arrastre a z ≈ 50 mm pasa de −0,30π por la línea media (−0,4994π → 1,4536π) a
1,30π (a 1,36π con el 15 % del ancho del lienzo, el arrastre de la e2e); las tres tarjetas llevan la sonda a 1,3776π y a su altura en 1,3–1,5 s y quedan como ventana actual; con «Costillas», las
clavículas y las escápulas; al volver a supino, la sonda queda en 1,2π. La e2e del navegador 3D hace el mismo recorrido, y
además: el pie y la ayuda cambian al sentar al paciente sin mover la sonda, el arrastre cruza la línea media (el signo de cos φ
cambia) y «Restablecer paciente» conserva la posición y la sonda. `acquisitionHistory.test.ts`: el cuadro del cine guarda la
posición (sentado en la espalda, aunque luego se tumbe). La equivalencia de la pleura restaura la posición y la pose si la lectura
falla en la espalda. Revisión adversarial de contexto limpio, ejecutando: sin bloqueantes. Importantes, aplicados: el pie y la
ayuda no cambiaban al sentar al paciente (la posición no estaba en el estado que redibuja el pie, y el aviso de supino seguía); la
e2e no exigía cruzar la línea media; «Restablecer paciente» con la posición sin prueba; la restauración de la posición en la
equivalencia, sin prueba que la viera. Menores, aplicados: el rango del área superior (126,6–150,3, no 126,3–150,6) y la
precisión de su prueba; el ángulo inferior cae sobre el borde superior de la 9.ª costilla (el EIC8 es el más próximo); los
ganchos que dejaban al paciente sentado; el cine sin la posición; cifras de la tabla y del arrastre; «la parte de abajo de la
imagen» (es el lado caudal del sector); filas de `docs/PROVENANCE.md`. La e2e completa con SwiftShader encontró además la cáscara
del diafragma en el plano basal (arriba). `npm run check`: 942 pruebas, un fallo esperado y una omitida; la entrada en 250,6 kB y
el total en 803,8 (sobre `a04ba7c`). La e2e completa con SwiftShader (29 pruebas, 5 trabajadores): 28 pasan; `mmode.spec.ts:167` (el modo M tras
perder la GPU) agotó su espera (4 cuadros de los 6 en 60 s tras restaurar el contexto) y pasa sola (1,6 min). No es de los
pasos de la inversa: con SwiftShader, un cuadro cuesta lo mismo con 10 que con 12 (0,49–0,65 s frente a 0,50–0,53 en el punto
BLUE superior y el basal, un navegador por medida, alternando); es la carga de las e2e en paralelo (medido
sobre `a04ba7c`, antes de la decisión 30, que cambia esa prueba). Sobre `6d8476d` (con la decisión 30), `npm run check` igual
(el total en 803,9) y la e2e completa (30 pruebas, 3 trabajadores): 29 pasan; el banco de fidelidad en el BLUE inferior agotó el
arranque (`window.__lusTest` no apareció en 120 s, con otra suite de pruebas en la máquina) y pasa solo (1,1 min). Una primera
pasada con 5 trabajadores falló casi entera por tiempo: la pasada anterior, cortada, había dejado procesos de Playwright con
SwiftShader huérfanos (carga media 30); se terminaron y no cuenta. Sobre `85211e4` (con la decisión 31), `npm run check`: 966
pruebas, un fallo esperado y una omitida, con los mismos kB; la e2e completa no se pudo medir en local: con la máquina a carga media 120 (otras sesiones y suites), 15 pasaron y 12
agotaron sus plazos antes de pararla; la referencia es la del CI de la PR.

**Nota (decisión 40, 2026-10-03).** `frame-cost-timing-sync` se cerró. La lectura inválida no espera a la GPU, pero en
`frameCostMs` solo lo era la del principio (el cuadro de calentamiento va al cine); la del final era válida, así que los costos
de arriba no salían bajos (si acaso algo altos). Ahora las dos leen la pantalla.

## 34. La parte difusa de la pleura rugosa en la reverberación [Estado: rechazada]

**Fecha.** 2026-10-02.

**Contexto.** Ciclo 3b-2, mecanismo 1. En la serie de reverberaciones bajo la pleura cada reflexión en la pleura conserva
solo su parte coherente, R_p·χ con χ = exp(−2(k0·σz·cosθ)²) (Ament; σz 0,05 mm: χ² ≈ 0,13 a 3,5 MHz), y descarta
(1 − χ²) de la energía. Con R_p ≈ 1 en el aire esa energía no se pierde (F-T07 en su espíritu). La hipótesis: la parte
difusa, la que la superficie rugosa dispersa en un lóbulo y vuelve en parte a la apertura, falta en la neblina
subpleural, y por eso el simulador la tiene oscura frente al banco (M de la neblina 1,75–2,08 frente a 0,87–1,00 entre
sujetos de la exploración, decisión 24). Objetivo O3.

**Opciones.** (a) Modelarla con Kirchhoff: la potencia difusa R²(1 − χ²), el lóbulo de la serie de Beckmann para una
correlación gaussiana de longitud l, y la fracción que vuelve a la línea por el ensanchamiento del haz difuso; (b) no
modelarla.

**Decisión.** Se probó (a) y se rechaza: no acerca las métricas al banco.

- **Lo que se probó** (rama de registro `feat/reverberacion-difusa`, dd3acff, sin integrar): `pleuraDiffuse.ts`, gemelo
  TS y GLSL en las dos ramas de la pasada B. La potencia difusa de cada reflexión es R²(1 − χ²); su lóbulo, por eje y en
  seno, θ_d = √(2g/(1 − e^{−g}))/(k0·l) con g = −ln χ² (la varianza media de la serie de Beckmann; tiende a 2·s_f en
  óptica geométrica); el haz difuso que sube h mm sobre la pleura se ensancha a σ² + (θ_d·h)² por eje, y frente a la ida
  y la vuelta coherentes una pierna difusa vale a1 = √2σ/√(2σ² + w²) por eje y las dos a2 = σ/√(σ² + w²). Sin
  ensanchar, coherente + difusa = 1. Alimenta las copias espejo y directa de la pared con un moteado independiente
  (incoherente); las líneas A siguen coherentes (F-T01, F-T02 sin cambio).
- **Lo que dio** (calibración de la decisión 24, GPU real, rango dinámico 70 dB, mediana de tres réplicas, los tres
  puntos de partida):

  | Métrica         | Exploración | Comprobación | main      | l = 0,2 mm (escala alveolar) | Cota: toda la energía difusa vuelve |
  | --------------- | ----------- | ------------ | --------- | ---------------------------- | ----------------------------------- |
  | M de la neblina | 0,870–1,00  | 0,964–1,20   | 1,75–2,08 | 1,74–2,06                    | 1,67–1,95                           |
  | M de la pared   | 0,851–1,40  | 0,896–0,911  | 1,54–1,91 | 1,54–1,91                    | 1,59–1,92                           |
  | A2 r₂           | 0,168–0,246 | 0,176–0,222  | 0,50–0,57 | 0,50–0,57                    | 0,50–0,56                           |

  La cota (l = 5 mm: θ_d → 0, toda la energía difusa vuelve a la línea; no es física) cierra un 12 % de la distancia de la
  neblina y empeora un poco la pared.

- **Por qué no alcanza.** (1) El difuso que vuelve es fuerte justo bajo la pleura (+7 a +15 dB en 1–5 mm) y se diluye
  hondo: en la banda de la neblina (1,25–1,75 d_pl, 5–15 mm bajo la pleura) suma +2 a +5 dB a la copia espejo, y allí
  domina la copia directa coherente (~+4 dB sobre la espejo); al banco le faltan 15–20 dB. (2) Con l a la escala de los
  alvéolos subpleurales (0,13–0,28 mm, L14), kl ≈ 1,4–2,9, bajo el umbral de validez de Kirchhoff kl > 6 de Thorsos
  ([@thorsos-kirchhoff-1988]): buena parte del difuso de Kirchhoff sería evanescente y volvería aún menos. (3) Las
  fuentes atribuyen la textura bajo la pleura al espejo y la réplica especulares de la pared, no a un difuso de la
  superficie: Soldati 2020, §1–3 y fig. 1 ([@soldati-trampas-2020]); en la simulación de onda completa con histología
  porcina de Ostras 2023, la superficie histológica y el reflector plano dan niveles medios comparables bajo la pleura
  (fig. 3E; [@ostras-histopatologia-2023]).

**Consecuencias.** La serie sigue solo coherente. El parche queda en la rama `feat/reverberacion-difusa` (dd3acff) por si
otra hipótesis lo necesita; pasa `npm run check` con las pruebas que fijan el GLSL actualizadas. Lo que falta en la
neblina hay que buscarlo en otro mecanismo (decisión 35).

**Verificación.** La tabla de arriba: `e2e/calibracion.spec.ts` con la GPU real en main (85211e4) y en la rama, con l =
0,2 mm y con l = 5 mm. La revisión bibliográfica (Thorsos, Soldati, Ostras, Beckmann por Nayar 1989 y Olson 2021) se
leyó en texto completo salvo Thorsos (resumen).

## 35. La reflexión de la cara de la sonda, R_t = 0,1: el ajuste conjunto de la pleura con la partición de la decisión 24

**Fecha.** 2026-10-02.

**Contexto.** Ciclo 3b-2. El mecanismo difuso de la pleura no acercó la neblina al banco (decisión 34). Queda el ajuste de
los mandos de la serie bajo la pleura dentro de rangos con fuente: σz de la pleura (la coherencia χ de cada reflexión,
que pagan las líneas A y, dos veces, las copias de la pared), R_t (la cara de la sonda y la piel en cada ida y vuelta), K
(el nivel de las caras) y la ganancia del preajuste. Las tres métricas relativas del banco que no dependen del mapa de
grises (decisión 31): M de la pared, M de la neblina y A2 r₂, con la metodología de la decisión 24: se ajusta solo con la
exploración y se comprueba con la comprobación, sin ampliar un rango para alcanzar el banco. No reescribe la decisión 24:
la amplía, y revisa uno de sus motivos (abajo). Objetivo O3.

**Opciones.** (a) Mover σz (pleura más lisa o más rugosa); (b) mover R_t; (c) K y la ganancia del preajuste; (d) no
tocar nada.

**Rangos, declarados antes del barrido** (02-10-2026; el archivo de trabajo es anterior a los barridos, salvo una prueba
de humo con σz 0,05 y 0,02 y R_t 0,3):

- σz: 0,010–0,067 mm. Ninguna fuente mide la rugosidad de la superficie aire–pleura visceral (la de Kim 2011, ~10 µm, es
  la parietal de rata, que no es la cara que refleja). Arriba, la rugosidad de los semicírculos de aire de 200–600 µm de
  diámetro del modelo de Mento 2023 (σ = 0,223·radio si son contiguos: cálculo propio sobre la geometría de su fantoma;
  [@mento-rugosidad-2023], solo resumen y el del congreso). Abajo, la cota que daría la simulación con histología porcina
  de Ostras 2023 (la línea pleural sobre la histología no difiere de la del reflector plano, §III.A, fig. 2C;
  [@ostras-histopatologia-2023]): con Ament, σ ≲ 9–23 µm. Es una cota superior, no inferior, y el valor vigente (0,05) la
  incumple; pero Ament no vale a esa escala (kl ≈ 3, decisión 34), así que se toma como el borde de abajo del intervalo
  plausible y no como una restricción.
- R_t: 0,10–0,50. Arriba, la reflexión de los transductores convencionales, −6 a −10 dB (0,50–0,32;
  [@fujitsu-reflexion-1985]). Abajo, una lente de silicona (0,99–1,46 MRayl, [@onda-cauchos]) frente a la piel (1,80
  MRayl, [@itis-base-2024]): 0,10–0,29 (cálculo propio de una sola interfaz; con gel entre medio, o con las capas de
  adaptación detrás de la lente, puede ser menor: la misma patente da ≤ −15 dB, ≤ 0,18, para sus diseños adaptados). El
  dominio heredado era [0,2; 0,5] sin fuente; `docs/knowledge/physics.md` ya listaba 0,1–0,5 como escenarios. Se dice
  también: por los ensayos de la decisión 24 (CI 79) ya se sabía que bajar R_t aclaraba la pared y la neblina, y la
  búsqueda de su fuente se hizo sabiéndolo; el borde de abajo lo fija el cálculo con la fuente, no el banco.
- K: 53–57 dB y ganancia −24 a −18 dB, los registrados (decisión 24).

**El barrido** (`e2e/barridoPleura.spec.ts`, `LUS_BARRIDO=1`: el protocolo de C3b-A, apnea espiratoria a t = 60 s, tres
réplicas, rango dinámico 70 dB, GPU real; `calibrationOverride` cambia K, σz y R_t sin recompilar). 7 σz × 7 R_t × 5 K con
ganancia −20; luego la ganancia en su dominio para σz 0,05 (R_t 0,1 y 0,15) y para σz 0,06–0,067. Es determinista: el
mismo candidato da las mismas métricas en dos barridos. La superficie de error (K 54, ganancia −20): la distancia
normalizada de las tres métricas a la banda p10–p90 entre sujetos de la exploración, sumada (mediana de los tres puntos),
y P1 (la línea pleural frente a la costilla); × si la línea pleural se recorta en el blanco (> 5 % de sus columnas
intercostales, Demi 2023, enunciado 15):

| σz (mm) \ R_t | 0,1         | 0,15        | 0,2         | 0,25        | 0,3         | 0,4         | 0,5         |
| ------------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| 0,01          | × (3,58)    | × (4,70)    | × (5,82)    | × (7,01)    | × (8,58)    | × (12,03)   | × (17,31)   |
| 0,02          | × (3,06)    | × (4,03)    | × (4,98)    | × (5,81)    | × (6,81)    | × (9,01)    | × (11,78)   |
| 0,03          | × (2,37)    | × (3,15)    | × (3,85)    | × (4,49)    | × (5,09)    | × (6,42)    | × (7,73)    |
| 0,04          | × (1,69)    | × (2,33)    | × (2,86)    | × (3,35)    | × (3,78)    | 4,61 / 1,28 | 5,43 / 1,28 |
| 0,05          | 1,11 / 1,20 | 1,63 / 1,20 | 2,08 / 1,20 | 2,48 / 1,19 | 2,82 / 1,19 | 3,46 / 1,19 | 4,05 / 1,19 |
| 0,06          | 0,55 / 1,05 | 0,94 / 1,05 | 1,24 / 1,05 | 1,54 / 1,05 | 1,83 / 1,05 | 2,33 / 1,05 | 2,75 / 1,05 |
| 0,067         | 0,26 / 0,95 | 0,47 / 0,95 | 0,75 / 0,95 | 0,97 / 0,95 | 1,17 / 0,94 | 1,55 / 0,94 | 1,91 / 0,94 |

- Una pleura más lisa (σz ≤ 0,04) aleja las tres métricas y recorta la línea pleural en el BLUE inferior (2,6–9,3 % de sus
  columnas con K 54; no con K 53): las líneas A pierden menos por orden (χ también va en G, F-T02) y M, que se mide en
  caídas de línea A, sube.
- Una más rugosa (σz 0,06–0,067) las acerca, pero oscurece la línea pleural frente a la costilla: P1 baja de 1,19 a 0,95
  (la pleura queda más oscura que la cara de la costilla; el banco da P1 2,99–5,05, un sujeto). Acerca M a costa de la
  pleura, no por la neblina ni la pared. Con σz 0,067, R_t 0,1, K 53 y ganancia −18 (todo en el borde de sus rangos) M de
  la pared y r₂ entran en la exploración, con P1 0,89–0,95.
- R_t baja la ganancia de cada vuelta y no toca la línea pleural: acerca las tres métricas en toda la columna, de forma
  monótona. Por eso el elegido queda en el suelo de su rango: el resultado lo fija la fuente del suelo.

**Decisión.** (b): R_t = 0,1, con σz 0,05 mm, K 54 dB y ganancia −20 dB sin cambio. La regla declarada antes del
barrido era la menor distancia a la exploración sin recortar la línea pleural (empate: el más cercano al preajuste). Con
ella sola ganaba la esquina σz 0,067, R_t 0,1, K 56 (distancia 0,23), que oscurece la línea pleural (P1 0,95, y sin P1 en
el BLUE superior) y censura la línea A del BLUE inferior con la ganancia del preajuste. Al ver el barrido de la
exploración, y antes de mirar la comprobación del candidato final, se añadieron tres guardas que la decisión 24 y la
revisión de este ciclo ya pedían vigilar: sin censura nueva en las tres métricas, sin perder ninguna métrica medible en el
preajuste (salvo las del orden 3, que el banco tampoco ve: A2 r₃, N4) y sin bajar P1 (la línea pleural frente a la
costilla). Se dice así porque las guardas cambian el resultado. Con ellas, por orden: σz 0,05 y R_t 0,1 con K 53 y
ganancia −19 (distancia 1,060), K 53 y −18 (1,062), K 54 y −19 (1,096) y K 54 y −20 (1,105). Los tres primeros no pasan
una guarda requerida de la e2e (decisión 24: «preservar las guardas»): con K 53 y −19, en el BLUE inferior el sector
detectado da d_pl 2,7 mm más larga que la verdadera (la prueba admite 2; los bordes de ese punto están a oscuras, decisión
28); con K 53 y −18 y con K 54 y −19, la línea pleural intercostal se recorta (+0,1 dB sobre el blanco: F-T08, Demi 15).
Queda K 54 y −20: solo cambia R_t. Salvedad del protocolo: la comprobación de la esquina (σz 0,067, R_t 0,1, K 53,
ganancia −14) se miró antes de añadir las guardas; ninguna guarda usa la comprobación. R_t queda en el borde de abajo de su
rango: el óptimo puede estar fuera de lo que las fuentes acotan, y no se fuerza.

**Revisa un motivo de la decisión 24.** Ella descartó K 53, ganancia −19 con R_t 0,2 y 0,27 porque el orden 4 de las
líneas A se veía en menos de 6 de 12 grupos del BLUE superior (la prueba de F-T01 lo exigía con el preajuste). Esa guarda
pedía al simulador más líneas A de las que ven los clips del banco (A2 visibles 1 en las dos particiones). F-T01 es la
geometría de la serie y no depende de R_t: ahora los órdenes 1–4 se miden con R_t en el borde de arriba de su rango (0,5,
`calibrationOverride`, en `e2e/imagen.spec.ts` y `e2e/fidelidad.spec.ts`) y el orden 2 con el preajuste; las tolerancias
geométricas y los recuentos no cambian.

**Consecuencias.**

Calibración de la decisión 24 (GPU real, rango dinámico 70 dB, apnea espiratoria a t = 60 s, mediana de tres réplicas;
antes = main, después = R_t 0,1; p10–p90 entre sujetos; ≥ cota inferior, ? censura desconocida):

| Métrica                | Exploración p10–p90 (clips/sujetos) | Comprobación p10–p90 | BLUE superior    | BLUE inferior   | PLAPS           |
| ---------------------- | ----------------------------------- | -------------------- | ---------------- | --------------- | --------------- |
| M de la pared          | 0,851–1,40 (4/4)                    | 0,896–0,911 (6/2)    | 1,91 → 1,40      | 1,54 → 1,20     | 1,82 → 1,36     |
| M de la neblina        | 0,870–1,00 (4/4)                    | 0,964–1,20 (6/2)     | 2,08 → 1,54      | 1,75 → 1,41     | 1,98 → 1,50     |
| M del campo profundo   | 1,76–2,27 (4/4)                     | 1,59–2,20 (6/2)      | 2,22≥ → 1,63≥    | 1,95≥ → 1,52≥   | 2,14≥ → 1,61≥   |
| A2 r₂                  | 0,168–0,246 (3/3)                   | 0,176–0,222 (6/2)    | 0,573 → 0,395    | 0,496 → 0,351   | 0,538 → 0,364   |
| A2 pendiente de ln r_k | -1,65–-1,06 (4/4)                   | -1,36–-1,34 (6/2)    | -0,712? → -0,928 | -0,762? → -1,05 | -0,727? → -1,01 |
| A2 visibles            | 1,00–1,00 (4/4)                     | 1,00–1,00 (6/2)      | 2,00 → 1,00      | 2,00 → 1,00     | 2,00 → 1,00     |
| T1 σ/prominencia       | 0,118–0,179 (8/4)                   | 0,288–0,296 (9/2)    | 0,0360 → 0,0357  | 0,0424 → 0,0424 | 0,0354 → 0,0354 |
| P1                     | 4,02–4,02 (2/1)                     | —                    | 1,12 → 1,12      | 1,19 → 1,20     | 1,20 → 1,20     |

- La comprobación (la del candidato final, después de elegirlo y sin reajustar; sus agregados ya estaban publicados desde
  la decisión 31): las tres métricas se acercan también a su banda (M de la pared 0,896–0,911, de la neblina 0,964–1,20, r₂
  0,176–0,222) y quedan fuera. M del campo profundo pasa de ≥ 1,95–2,22 a ≥ 1,52–1,63: el campo profundo está
  en el negro y no es una medida; la banda del banco no lo contradice.
- La caída por orden de las líneas A pasa de ≈ 20 a ≈ 30 dB: −20·log|R_p·χ·R_t| pasa de 19,3 a 28,9 dB, y con la
  transmisión de la pared y la compensación nominal (F-T02), de 20,2–20,4 a 29,7–29,9 dB; en la envolvente, 27,6–33,2. Con el
  preajuste se ve una línea A, como en los clips, y la pendiente de ln r_k se mide sin censura.
- F-T01 se sigue cumpliendo (arriba). F-T02 es la fórmula de G, que no cambia; con el preajuste solo queda medible la
  caída del orden 1 al 2. F-T05 (anchura de la línea pleural), la línea pleural sin recorte (Demi 15) y P1 no cambian. F-T06
  se lee con el Fresnel de la pleura (0,9995) y no cambia. En el barrido de ganancia de la e2e, N4 (necesita el orden 3)
  deja de exigirse y entran A2 r₂ y la pendiente de ln r_k, que ahora se miden sin censura.
- **Lo que no cierra:** M de la neblina queda 1,41–1,54 frente a 0,87–1,00. Sin recorte de la línea pleural, en toda la
  superficie la neblina va de 0,05 a 0,28 caídas por debajo de la pared (M de la neblina > M de la pared); en el banco la
  neblina cae dentro de la banda de la pared (exploración: neblina 0,87–1,00, pared 0,85–1,40). Ningún σz, R_t ni K lo
  cambia, porque los tres escalan a la vez la pared copiada y la línea A. Falta otro mecanismo; el candidato, la
  reverberación en la propia pared (la textura de Soldati 2020, §2).
- C3b-A (decisión 24) queda como registro de su ajuste (`normal-calibration-c3b-a.json`); este es otro.
- El informe del banco de fidelidad lee la calibración con que dibujó la pasada B (`renderer.calibration`: la del
  registro, o la del barrido) para `acquisition` y la predicción de F-T02.

**Verificación.** `npm run check` en verde; e2e con la GPU real y SwiftShader (fidelidad, calibración, imagen, mapa de
grises); el barrido y su superficie, en la PR. Revisión adversarial de contexto limpio antes de abrir la PR (resumen en la
PR).

**Nota (decisión 36, 2026-10-03).** Con el punto BLUE inferior (y el PLAPS) de vuelta en el centro del EIC4, 49,5 mm en lugar de
51,3, este ajuste no cambia; sus medidas, con la misma semilla y la GPU real (M4) sobre la rama de la #46 (`8cf5331`), antes →
después: BLUE inferior, pared 41,67 → 40,93, neblina 14,35 → 13,38, M pared 1,199 → 1,219, M neblina 1,409 → 1,426 y A2.r2
0,3506 → 0,3515; PLAPS, 33,89 → 33,66, 14,23 → 13,47, 1,364 → 1,371, 1,504 → 1,515 y 0,3641 → 0,3684. El BLUE superior, igual.
Las columnas de coherencia a DR70, 163 y 78 (> 50). El candidato K 53 y ganancia −19, descartado aquí por la guarda de d_pl
del BLUE inferior, la pasa con el punto en 49,5 y el detector de la decisión 36 (allí, el porqué).

## 36. El detector del sector que no confunde una sombra costal con el borde, y el punto BLUE inferior en el centro del EIC4

**Fecha.** 2026-10-03.

**Contexto.** Dos números de la anatomía los fijaba un detector y no su fuente (la misión: «que no mienta»). El punto BLUE
inferior (`app.startPointPoses.blueLowerZ`, también la altura del PLAPS) estaba en 51,3 mm, 1,8 mm sobre el centro del EIC4 de
la axilar anterior (49,46 con el tronco de la decisión 28 y la espalda de la 29), porque en el centro el detector del sector de
la decisión 21 se equivocaba: la sombra de una costilla tapa el borde derecho del abanico, bajo ella todo es negro y el RANSAC
por lado, que gana con más filas, tomaba la recta de la sombra (también radial, también por el ápice) por el borde. Con los
cuadros del simulador en el centro (GPU real, M4): el ápice a 8,3 px en apnea y a 36,8 respirando, el borde derecho a 1,7° y
7,4°; con SwiftShader, 50 px (decisión 28); la e2e exige < 25 px. En los clips del banco, el mismo error: LUS-35r y LUS-35v (el
borde derecho a 16,6° y 14,8°), LUS-35e (24,8°) y LUS-35p (8,1°), y en 35h, 35j y 35l un borde oscuro tomado por el del abanico
(27,5–37,6°). Y la pared infraescapular alta (`anatomy.chestWall.infrascapularHighWallMm`, 20 mm) no tenía fuente: la fijaban
el banco (con 24, el detector de estructuras perdía la pleura del PLAPS, 61 % de sus columnas) y F-T08. Objetivos O2 (las
dimensiones de sus fuentes) y O3 (el banco mide igual el simulador y los clips).

**Opciones.** Para el detector: (a) aflojar la guarda de 25 px de la e2e (no: esconde el error); (b) mover el punto hasta donde
el detector acierte (lo de la decisión 28; no: la anatomía no se mueve para acomodar un detector); (c) un detector que use lo
que la sombra no cumple: el borde del abanico es una recta de apoyo del soporte (nada encendido por fuera; la sombra tiene por
fuera la pared y la cresta ósea, en el campo cercano), los dos bordes son simétricos respecto de un eje vertical (los 34 clips
con su geometría fijada, dentro de 0,6°, y el simulador) y en una convexa la piel es un arco alrededor del ápice; (d) la
varianza temporal o lo encendido en toda la pila (no ayuda en el simulador: la pared está quieta y la sombra no se mueve con la
respiración lo bastante para destapar el borde). Para la pared: una fuente verificada (ecografía o TAC) o, sin ella, decir que
no la hay.

**Decisión.** (c) y el punto en el centro; la pared, sin cambiar de valor (no hay fuente).

- **Los bordes** (`fanEdges`, `src/measure/fidelity/sector.ts`): RANSAC determinista conjunto. Cada par de extremos de fila de
  un lado da una recta, que se descarta si deja más de `EDGE_OUTSIDE_ROWS` (2) extremos de su lado a más de `EDGE_OUTSIDE_PX`
  (3 px) por fuera; el otro lado lleva la pendiente opuesta y solo busca su ordenada de apoyo (`supportingOffset`: la que deja
  a lo sumo 2 extremos por fuera y, entre esas, la de más filas a ≤ 1,5 px). Gana el par con más filas en los dos lados y se
  refina por mínimos cuadrados con la pendiente común. Dos extremos y no una fracción: con un 3 % de 170 filas pasaba la recta
  de una sombra cuando el campo cercano era corto. Si ningún par cumple (no ocurre en los clips ni en el simulador), cada borde
  se ajusta solo, como antes; un lado que toca el marco en todas las filas sigue siendo el marco.
- **El ápice desde el arco de la piel** (`skinArcCenterY`): lo primero encendido de cada columna, entre el 6 % y el 94 % del
  ángulo, se ajusta a un círculo con el centro en la x del ápice de los bordes (mínimos cuadrados algebraicos: la primera vez,
  con la mitad de los puntos más cercana al círculo del ápice de los bordes; después, con los de ≤ 2 px). Se usa si el arco
  está entero (por debajo del borde del cuadro, ≥ 80 % de los ángulos cubiertos, la mitad de sus puntos ajustados, residuo
  mediano ≤ 1 px) y si su error típico es menor que el de la altura que dan los bordes (`edgeApexSigma`: |y₀ − ȳ|·σ_b/|b|). En
  el BLUE inferior los bordes se ven en ≈ 50 filas y dan σ 1,4 px (su error real, 9 px: 1° en los bordes), y el arco, 0,45. Un
  arco corto y llano frente a bordes largos (el sintético de 300 px de la invariancia afín, 10 px de flecha) pierde: σ 4–5
  frente a 0,2–0,3 (sin esa comparación, la tubería de la invariancia falló: el ápice a 21,6 px). Con el ápice del arco, los
  bordes pasan por él con la pendiente común de sus filas. En los clips de Born la piel es el borde del recorte: no se usa.
- `detectSectorFromStats`: lo mismo que `detectSector` desde la media y la σ temporal ya calculadas.
- **El punto BLUE inferior** vuelve a **49,5 mm**, el centro del EIC4 de la axilar anterior en la parrilla (49,46), y con él el
  PLAPS. La guarda de 25 px de la e2e no cambia.
- **La pared infraescapular alta**: búsqueda del 03-10-2026 (PubMed, Europe PMC a texto completo y web: «posterior axillary
  line», «chest wall thickness» por TAC para toracocentesis o descompresión con aguja, bloqueos del serrato y del erector,
  ecografía pulmonar posterior): **NO ENCONTRADO** en adultos, ni por ecografía ni por TAC, en la LAP o la infraescapular. Lo
  único que nombra la LAP (Jin y cols. 2014, TAC de 6 pacientes con derrame en supino, 16 ± 3 mm sin decir el espacio ni la
  capa) es solo el resumen: NO VERIFICADO, no entra. Con el detector y el punto nuevos, 24 mm ya no rompen nada (la pleura del
  PLAPS a ±1 mm del gemelo en el 100 % de sus 83–86 columnas con la GPU real; F-T08 en verde con 23 y con 24), así que ninguna
  prueba fija el valor: queda en 20 [SUPUESTO], y lo dicen su nota, `docs/APPROXIMATIONS.md` y `chest-wall-height-transition`.
  Sin ese nodo, la interpolación entre la axila (18, McLean) y la espalda alta (32, Wada y Okçu) daría ≈ 23 en 1,2π: no se
  elige sin fuente (pregunta abierta en la PR).

**Consecuencias.**

- **El simulador** (los 30 cuadros de la e2e de fidelidad, GPU real M4, con R_t 0,3 como en main antes de la #46; antes →
  después; el ápice y el peor borde):

  | Punto                    | Apnea                        | Respiración tranquila      |
  | ------------------------ | ---------------------------- | -------------------------- |
  | BLUE superior            | 2,6 px, 0,55° → 0,66, 0,004° | 2,4, 0,55° → 0,67, 0,003°  |
  | BLUE inferior en 51,3 mm | 1,7, 0,42° → 0,6, 0,00°      | 2,3, 0,53° → 0,6, 0,00°    |
  | BLUE inferior en 49,5 mm | 8,3, 1,69° → 0,72, 0,004°    | 36,8, 7,37° → 0,72, 0,004° |
  | PLAPS en 49,5 mm         | 0,3, 0,11° → 0,60, 0,003°    | 0,6, 0,06° → 0,59, 0,003°  |

  Con R_t 0,1 (main desde la #46), sobre esta rama: BLUE superior 1,15 / 1,03 px y 0,15°, BLUE inferior 0,65 px y 0,003°,
  PLAPS 0,73 px y 0,09° (en el BLUE superior y el PLAPS manda la intersección de los bordes, de menor error típico que el
  arco). La piel detectada, a −0,8–0,5 px; la pleura del detector de estructuras, a ±1 mm del gemelo en todas sus columnas
  (163–193 en el BLUE inferior, 75–88 en el PLAPS). d_pl con la geometría detectada, 0,2–0,3 mm más larga en los puntos BLUE;
  en el PLAPS, con R_t 0,1, 1,4 mm más corta en apnea: no es el sector (a 0,7 px) sino d_pl, la mediana de una pleura inclinada
  cuyas columnas caen en dos grupos (15,0 y 16,5 mm con la geometría verdadera, que respirando alterna entre los dos), y la
  guarda (2 mm) no cambia. Con SwiftShader lo mide el CI.

- **Los clips** (la geometría fijada del manifiesto como referencia; antes → después, el ápice y el peor borde). Esa geometría
  la propuso el detector de la decisión 21 y la fijó una persona (decisión 21), con los ángulos redondeados a 0,01 rad: donde
  el detector viejo acertaba, «antes → después» mide acuerdo con él, no precisión. Aptos: LUS-35r 86,9 px y 16,6° → 5,0 y
  0,23°; LUS-35v 6,1 y 14,8° → 9,6 y 0,28° (el borde, 50 veces mejor; el ápice, 8 px más abajo en el eje: su borde derecho no
  se ve en ninguna fila, solo 5 extremos caen en él, y su ordenada sale de los de la sombra; `sector-detector-symmetric`);
  LUS-01, que se proponía lineal, convexa a 3,8 px y 0,77°; los demás aptos convexos y LUS-02, ≤ 3,9 px y ≤ 0,68° (antes ≤ 4,3
  y ≤ 0,9), con dos que se apartan algo más que antes por la simetría que se impone: LUS-04f 0,3 px y 0,27° → 1,9 y 0,68°, y
  LUS-04a 0,1 y 0,22° → 0,8 y 0,37°. No aptos con un borde oscuro: LUS-35e 202 → 4,0 px, 35h 170 → 4,1, 35j 241 → 0,6, 35l 160
  → 3,7, 35p 38 → 2,6, con los bordes a ≤ 0,6°; LUS-04e (lineal en el manifiesto) se proponía convexa y ahora lineal. El banco
  regenerado (`npm run fidelity:ref`, los 34 clips, 8 277 cuadros, con carga media ≈ 80): `reference-stats.json` cambia solo
  en `detector` y en la fecha; las métricas se miden con la geometría fijada y no cambian. La partición de C3b-A anota la
  revisión (`calibration-split.json`).
- **Lo que no arregla** (`sector-detector-symmetric`, revisión adversarial): un abanico asimétrico (girado 1° alrededor del
  ápice: el ápice a 13,5 px y un borde a 1,95°, donde el detector viejo acertaba), un borde que no se ve en ninguna fila (el
  ápice baja por el eje) y los dos bordes tapados desde 4 mm de la piel (el arco da el ápice, pero los bordes quedan a 7–9°;
  el viejo, a 12,6°). Ningún clip del banco ni ningún punto del simulador cae en el primer caso.
- **La calibración del contraste**, con la misma semilla y el mismo protocolo (DR70, t = 60 s, GPU real): la de la decisión 24
  (R_t 0,3, medida sobre main `4edaf7d`) y la de la decisión 35 (R_t 0,1, el preajuste de main desde la #46, medida sobre su
  rama `8cf5331`), con el punto en 51,3 y en 49,5 (notas en las decisiones 24 y 35). El BLUE superior no cambia. Pared y
  neblina (gris de 8 bits del primer cuadro), M de la pared y de la neblina y A2.r2 (medianas de tres réplicas):

| Ajuste y punto     | 51,3 mm                                | 49,5 mm                                |
| ------------------ | -------------------------------------- | -------------------------------------- |
| R_t 0,3, BLUE inf. | 41,67 / 19,58 / 1,536 / 1,754 / 0,4962 | 41,08 / 19,24 / 1,567 / 1,780 / 0,5035 |
| R_t 0,3, PLAPS     | 33,72 / 17,22 / 1,819 / 1,977 / 0,5376 | 33,55 / 16,83 / 1,833 / 1,992 / 0,5357 |
| R_t 0,1, BLUE inf. | 41,67 / 14,35 / 1,199 / 1,409 / 0,3506 | 40,93 / 13,38 / 1,219 / 1,426 / 0,3515 |
| R_t 0,1, PLAPS     | 33,89 / 14,23 / 1,364 / 1,504 / 0,3641 | 33,66 / 13,47 / 1,371 / 1,515 / 0,3684 |

Todo se mueve dentro de la dispersión entre semillas de la decisión 28 (M de la pared del BLUE inferior, 1,628–1,679 en tres
semillas de main): M sube 0,01–0,03 (se aleja algo del banco) y A2.r2 no cambia. Las columnas de coherencia a DR70, > 50 en
las tres ventanas (172 y 86 con R_t 0,3; 163 y 78 con R_t 0,1).

- **La guarda de d_pl del BLUE inferior, inestable en main** (aviso del 03-10-2026; la guarda no se afloja). Reproducida en
  main `83b7544`: con la GPU real fallan 3 de 12 corridas (`--repeat-each=6`, dos tandas) y con SwiftShader 2 de 4, con la
  d_pl de la geometría detectada 4,8–5,0 mm más larga que la verdadera (la guarda admite 2). **No es una estructura falsa ni,
  en el fondo, el sector**: en la
  vista del BLUE inferior la pleura del espacio intercostal del lado izquierdo de la imagen está a 17,5–19,6 mm y la de los otros
  dos a 12,8–14,2 (el gemelo de A0, línea a línea: la pared sube hacia la axila). El detector de estructuras busca la pleura de
  cada cuadro a ±30 % de la d_pl del cuadro medio (`detectStructures` con `prior`), una sola profundidad: con una previa de 14,0
  el límite cae en 18,2 mm, en medio de ese espacio, y cuántas de sus columnas entran —y con ellas la mediana, d_pl— depende de
  décimas (la previa sale 14,0 o 16,0; los cuadros, 14,1, 16,0 o 18,2 mm). Lo que la mueve es cualquier cambio pequeño: la
  geometría detectada (el detector viejo, a 3–9 px), el ruido del receptor de cada cuadro, el fondo detectado (que acorta las
  filas). Con el detector nuevo, en 51,3 mm, las mismas pilas siguen saltando (d_pl de 16,04 en 4 de 6, 2,6 mm sobre la
  verdadera): el sector a 0,6 px no lo arregla. En 49,5 mm, con el detector nuevo y sobre `83b7544`: 30 de 30 corridas del
  BLUE inferior en verde, 20 con la GPU real y 10 con SwiftShader, todas a 0,25–0,29 mm (la previa, 14,2: el límite, en 18,45, deja dentro 8
  columnas del espacio hondo y fuera las demás, siempre las mismas). Es estable en estas corridas, pero el mecanismo sigue
  ahí: una previa por columna (la pleura del cuadro medio en cada columna) lo quitaría y cambia las estadísticas de casi todos
  los clips del banco, así que queda para una decisión aparte (pregunta abierta en la PR). El PLAPS tiene el mismo mecanismo
  en menor grado: 1,37 mm constante en apnea y 0,17–1,37 respirando (8 corridas con la GPU real y 4 con SwiftShader, todas
  < 2).
- **El candidato que la decisión 35 descartó** (σz 0,05, R_t 0,1, K 53 y ganancia −19, el mejor de su exploración) cayó por esta
  misma guarda: «en el BLUE inferior el sector detectado da d_pl 2,7 mm más larga». Con el punto en 49,5 y el detector nuevo,
  ese candidato la pasa (0,28 mm en apnea, 0,22 respirando; una corrida con la GPU real, en los tres puntos). No se reabre aquí
  la decisión 35: queda como pregunta abierta.
- **Metas A.** Ninguna se mueve: el punto vuelve a su criterio (el centro del EIC4) y F-T08 sigue en verde en los tres puntos de
  partida y en los cortes de la meta. La cobertura no depende de los puntos de partida.

**Verificación.** Las unitarias del detector (`fidelityBench.test.ts`): una sombra costal en el borde derecho de un sintético
(con el detector de la decisión 21, el borde a −14,1°: 0,246 rad frente a < 0,005), los bordes con una sombra simétrica a cada
lado con más filas que el borde (sin la restricción de apoyo gana la sombra) y con dos motas por fuera, y el arco de la piel con
los dos bordes tapados desde 8 mm (sin el arco, el ápice a 7 px y los bordes a 1,6°) o cortado por el borde del cuadro (null).
**Mutaciones**, cada una atrapada: el detector de la decisión 21 (dos pruebas), sin la restricción de apoyo (dos), sin el arco
(una). `startPoints.test.ts`: el punto en el centro del EIC4 a < 0,1 mm y su rango entre los centros del EIC5 y del EIC3. La
invariancia afín con fast-check (200 corridas por propiedad), la e2e de fidelidad y de calibración con la GPU real. `npm run check` y el CI de la PR (la e2e con
SwiftShader: con la máquina a carga media 50–150, en local solo se corrió con la GPU real).

## 37. El hígado y el bazo bajo las cúpulas: las bases de la cobertura, el signo de la cortina y el espejo (F-T34)

**Fecha.** 2026-10-03.

**Contexto.** La cobertura de exploración (decisión 26) estaba en 106 de 138 celdas: las 32 que faltaban eran todas las de
debajo del borde del pulmón, donde la base pone «el diafragma y el órgano subdiafragmático» y el modelo tenía el diafragma y,
debajo, el «resto» genérico de VExUS (`abdomen-generic-tissue`), sin hígado ni bazo. El requisito de cobertura de
`docs/MISSION.md` (meta del 100 % en la v0.2.0) y O2 (fidelidad anatómica, cobertura); con el órgano, el signo de la cortina
(A-T13) tiene lo que tapa y el espejo del diafragma (F-T34, O1) tiene qué reflejar. VExUS tiene el hígado (su módulo de
órgano) y no el bazo.

**Fuentes verificadas** (texto completo salvo donde se dice «resumen»; búsqueda del 03-10-2026):

- **Gray 1918, «Surface Markings of the Abdomen».** Hígado: el límite superior del lóbulo derecho, en la línea media a la altura
  de la unión xifoesternal, sube hasta el 5.º cartílago en la línea mamilar y baja a la 7.ª costilla al lado; el del lóbulo
  izquierdo sigue hacia abajo y a la izquierda hasta el 6.º cartílago, a 5 cm de la línea media. El inferior, 1 cm bajo el margen
  inferior del tórax a la derecha hasta el 9.º cartílago, de ahí en oblicuo hasta el 8.º cartílago izquierdo, cruzando la línea
  media justo sobre el plano transpilórico, y con una leve convexidad a la izquierda hasta el final del superior. La marca de
  Birmingham que recoge el mismo texto (1,25 cm bajo el pezón derecho, 1,25 cm bajo la punta de la 10.ª costilla, 2,5 cm bajo el
  pezón izquierdo) lleva el lóbulo izquierdo a la LMC. Bazo: su eje largo es la 10.ª costilla; en vertical, del borde superior de
  la 9.ª al inferior de la 11.ª; su punto más alto a 4 cm de la línea media de la espalda a la altura de la punta de la apófisis de
  T9, el más bajo en la axilar media a la altura de la apófisis espinosa de L1. Estómago: el espacio de Traube (entre el borde
  inferior del pulmón izquierdo, el borde anterior del bazo, el reborde costal y el borde inferior del lóbulo izquierdo del hígado)
  está sobre el estómago. Riñones: el paralelogramo de Morris, de 2,5 a 9,5 cm de la línea media desde la punta de la apófisis de
  T11; el derecho, 1 cm más bajo.
- **Gray 1918, «The Liver».** Ocupa casi todo el hipocondrio derecho y la mayor parte del epigastrio, y no pocas veces llega en el
  hipocondrio izquierdo hasta la línea mamilar. En el varón pesa 1,4–1,6 kg (densidad 1,05: 1,33–1,52 L); su mayor medida
  transversal, 20–22,5 cm; en vertical, junto a su cara derecha, 15–17,5 cm; de delante atrás, 10–12,5 cm a la altura del extremo
  superior del riñón derecho y ≈ 7,5 frente a la columna.
- **Gray 1918, «The Spleen».** Unos 12 cm de largo, 7 de ancho y 3–4 de grueso; ≈ 200 g; su cara diafragmática, convexa, contra el
  diafragma, que la separa de las costillas 9.ª–11.ª izquierdas y del borde inferior del pulmón y la pleura.
- **Kratzer y cols. 2003** (ecografía, 2080 sujetos; resumen): el hígado en la LMC mide 14,0 ± 1,7 cm; en el varón, 14,5 ± 1,6.
- **Vauthey y cols. 2002** (TAC, 292 adultos occidentales; resumen): volumen total = 191,8 + 18,51 × peso (kg), o −794,41 +
  1267,28 × superficie corporal (m²): para el avatar (≈ 176 cm y 71 kg), 1,50–1,56 L.
- **Chow y cols. 2016** (ecografía, 1230 adultos sanos; resumen): el largo del bazo crece con la talla y es mayor en el varón;
  pasa de 12 cm en el 26 % de los varones y el 6 % de las mujeres.
- **IT'IS** (la hoja de la base, fila «Spleen»): ρ 1089 kg/m³, c 1567,6 m/s, α0 4,3726 Np/m/MHz con b 1,3832.
- NO ENCONTRADO: la retrodispersión del bazo (su BSC) y una fuente primaria humana accesible de su ecogenicidad frente al hígado;
  el grosor de la cápsula esplénica; cuánto es la «leve convexidad» del lóbulo izquierdo; la profundidad del riñón en el tronco.

**Opciones.** Para el hígado: (a) portar el de VExUS tal cual (sus faldas están ajustadas a sus costillas 5.ª–10.ª derechas y a
su cúpula 41 mm más alta: el borde lateral quedaba en z −112 y el posterolateral en −97, sobre la LAP EIC11 de la base); (b) la
envolvente de VExUS escalada a la cavidad, como las cúpulas (decisión 17), con el borde inferior de Gray por columna de la pared;
(c) un hígado propio desde cero. Para el bazo: (i) un elipsoide en el espacio (con su cara recta, solo toca la pared en su
centro y deja una lámina de «resto» entre la pared y él); (ii) un elipsoide en las coordenadas de la pared, con el centro a medio
grosor; (iii) medio elipsoide en las coordenadas de la pared con su cara diafragmática en el diafragma (la cúpula o la ZOA). Para
lo que la base pone y el modelo no tiene (el estómago, el riñón): estirar el hígado y el bazo hasta esas celdas, o dejarlas
pendientes con su motivo.

**Decisión.** (b), (iii) y dejar pendiente lo que no es hígado ni bazo.

- **El hígado** (`src/anatomy/organs/liver.ts`, portado de VExUS, `anatomy.liver`): los dos lóbulos de VExUS (el izquierdo más
  ancho, para llegar a la pared bajo el 6.º cartílago a 5 cm), la cuádrica de su cara visceral interior y su recorte posteromedial,
  escalados con la cavidad (sx 1,115, sy 1,12). El borde inferior contra la pared, por columna (`liverEdgeZ`): el reborde costal
  de la tabla de la pared torácica menos 1 cm a la derecha del 9.º cartílago (Gray) y, de él al 8.º izquierdo, la recta de Gray
  (cruza la línea media en z −62, 16 mm sobre las puntas de los 9.º cartílagos); desde el borde, la cara visceral sube hacia dentro
  con la cotangente de VExUS (0,75 a la derecha, 1,6 en el lóbulo izquierdo). El límite lateral izquierdo, en proyección frontal
  (`leftTipDistance`): del 8.º cartílago (x 68) al 6.º a 5 cm, con la convexidad de 8 mm [SUPUESTO]. El lóbulo izquierdo es el de
  las marcas de superficie de Gray (5 cm); el mismo texto dice que no pocas veces llega a la línea mamilar (el rango de
  `leftEndXMm`, 50–95): el modelo toma el extremo medial, no toda la variación. El riñón de Morris, que lus-sim no tiene, recorta el
  hígado y el bazo (`kidneyCutDistance`: por detrás de la cara anterior del cuerpo vertebral [SUPUESTO]). La cápsula, como en VExUS:
  la lámina de 0,8 mm junto al borde, con su cara salvo donde la manda el diafragma.
- **El bazo** (`src/anatomy/organs/spleen.ts`, propio, `anatomy.spleen`): medio elipsoide de Gray (semiejes de 60 y 35 mm a lo largo
  de la pared y 35 hacia dentro) en las coordenadas de la pared (su arco, z y la profundidad bajo el diafragma, la cúpula o la ZOA),
  con el eje largo en la pendiente de la 10.ª costilla izquierda en su centro y el punto más bajo de su elipse en la axilar media;
  una cota de profundidad bajo la piel (la rampa de la cúpula más su grosor) lo deja junto a la pared. Tejido nuevo
  (`Tissue.Spleen`, 32 tejidos: llenan exactamente los 8 vec4 de las tablas por tejido; uno más sumaría una ranura por tabla) con
  las propiedades de IT'IS y la retrodispersión del hígado [ESTIMADO], homogéneo; su cápsula, una cara (`Interface.SpleenCapsule`)
  sin tejido aparte.
- **Clasificación** (TS `classifyOrgans`, GLSL `classifyOrgans` en `anatomy.glsl.ts`): tras la cúpula, el hígado, el bazo y el
  «resto», cuya distancia a la frontera cuenta la de los dos. En la GPU, más hondo que la cota de la pared (`classifyWall` deja el
  arco en 0), el arco y la profundidad bajo la pared se calculan: el borde depende de ellos. Las caras `liverSurface` y
  `spleenSurface` dan la normal de las cápsulas (`organSurfaceSd` en la GLSL). Lejos de los lóbulos, `liverSdf` devuelve la distancia
  a ellos (su cota; basta para el «resto», cuyo tope es 5 mm).
- **La distancia a la frontera** (la que funde los bordes en la pasada B y la que usa la equivalencia para dar un punto por
  interior) cuenta la columna y toma la de los órganos y la de la cúpula por `ORGAN_SDF_LIPSCHITZ` = 0,5: sus mínimos y máximos
  suaves, las coordenadas de la pared y la cúpula junto a su rampa la hacían pasarse de la real (medido con un rastreo de 200
  direcciones: hasta 5,0 mm junto a la columna, 3,3 junto al diafragma y 3,0 junto al «resto»; con el factor y la columna, ≤ 0,24 en
  el hígado y el bazo y 0,06 en la cápsula). La cara de la cápsula usa la distancia sin el factor.
- **Uniforms**: la escala de la cavidad y el espacio del riñón en `uLiverS`, el borde en `uLiverEdge`, el límite izquierdo en
  `uLiverTip`; los lóbulos, las |x| del riñón y `leftEndXMm`, constantes en la GLSL; el bazo en `uSpleen` y `uSpleenR` (su cota de
  profundidad sale de `uCurtain.z`). Con la cápsula del bazo en `uIface`, +6 ranuras: 125 en la pasada B y 127 en su programa
  dirigido, bajo el techo de 130 que deja sitio a la THI.
- **La cobertura** (`src/app/coverage.ts`): el bazo cuenta a la izquierda; donde hay «resto», el motivo dice lo que pone la base
  (el estómago, el riñón o el polo posterior del bazo, `baseOrganBelow`).
- **F-T34** (`src/app/mirrorBench.ts`, gancho `mirror`, e2e): el espejo se mide en el nivel mostrado (la envolvente con la TGC
  nominal y la ganancia del preajuste), en 20 mm de tejido real antes del espejo y 20 de virtual detrás, en las líneas que lo
  tienen; la columna, en el nivel mostrado donde la línea, recta tras el espejo, la encontraría.

**Consecuencias: antes → después** (main `83b7544` frente a esta decisión).

| Medida                                                   | Antes                              | Después                                                             | Fuente o meta                                 |
| -------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Cobertura (anterior / lateral / posterior / vértice)     | 106/138 (20/28, 42/60, 38/44, 6/6) | **127/138** (25/28, 56/60, 40/44, 6/6)                              | requisito de cobertura, 100 % en la v0.2.0    |
| Celdas bajo el borde                                     | 0 de 32                            | 21 de 32 (16 con hígado, 5 con bazo)                                |                                               |
| Hígado: ancho transverso                                 | —                                  | 21,3 cm                                                             | Gray: 20–22,5                                 |
| Hígado: alto en el plano de la LMC (95 mm)               | —                                  | 12,9 cm                                                             | Kratzer: 14,5 ± 1,6 (−1,0 DE)                 |
| Hígado: alto junto a su cara derecha (máximo)            | —                                  | 13,4 cm (a 120 mm de la línea media)                                | Gray: 15–17,5 (`notYetMet`)                   |
| Hígado: de delante atrás                                 | —                                  | 13,3–17,0 cm                                                        | Gray: 10–12,5 [el tronco de 226 mm]           |
| Hígado: volumen                                          | —                                  | 1,76 L                                                              | Gray 1,33–1,52; Vauthey ≈ 1,5 (`notYetMet`)   |
| Bazo: largo × ancho × grueso (ejes principales)          | —                                  | 11,6 × 6,9 × 3,6 cm                                                 | Gray: 12 × 7 × 3–4; Chow                      |
| Bazo: volumen                                            | —                                  | 134 mL (≈ 146 g a la densidad de IT'IS)                             | Gray ≈ 200 g, ≈ 184 mL (`notYetMet`)          |
| Bazo: punto más bajo / más alto                          | —                                  | axilar media, z −122 / a 11 cm de la línea media, z −28             | Gray: axilar media a la altura de L1 / a 4 cm |
| F-T34: el virtual, en el nivel mostrado (cuatro vistas)  | sin órgano que reflejar            | −69,0 / −76,1 / −70,7 / −76,0 dB, presente (≥ −82; sin espejo, −88) | presente                                      |
| F-T34: real − virtual, en el nivel mostrado              | —                                  | 2,0 / 2,0 / 1,7 dB (la cuarta, con la columna: 9,6)                 | ≥ 3 dB (`test.fail`)                          |
| F-T34: la columna (45 líneas que la encontrarían rectas) | —                                  | −72,9 dB, bajo el tejido real (−66,4): no se ve                     | invisible                                     |
| Ranuras de uniforms de la pasada B (y su dirigido)       | 119 (121)                          | 125 (127)                                                           | ≤ 130 (la THI)                                |
| Chunk principal / total de JS                            | 254,7 / 808,0 kB                   | 269,0 / 822,8 kB (presupuestos: 280 / 840)                          |                                               |

- **Lo que queda pendiente en la cobertura (11 celdas), con su motivo, sin estirar ningún órgano**: el estómago del espacio de
  Traube (la LMC izquierda en los EIC 6–8, la LAA en los 7–9 y el EIC8 de la LAM, sobre el bazo), el riñón de Morris (la escapular
  en el EIC11 de los dos lados y la paravertebral izquierda en el 11) y el polo posterior del bazo (la escapular izquierda en el
  EIC10, donde la base pone el bazo: el medio elipsoide rígido del modelo, de 12 cm a lo largo de la 10.ª costilla y con su punto más
  bajo en la axilar media, acaba a 11 cm de la línea media; es un límite de la forma del modelo, no de la fuente). Con el lóbulo
  izquierdo de Gray en la línea mamilar (el otro extremo de su rango) la LMC izquierda podría tener hígado; el modelo no lo toma.
  Lo que sigue: el estómago (con su gas, que bajo la cúpula izquierda puede parecer pulmón), el riñón y un bazo que se curve con la
  costilla.
- **El polo inferior del bazo** [DISCREPANCIA]: Gray lo pone en la axilar media a la altura de la apófisis espinosa de L1; el modelo
  no tiene vértebras lumbares, y con el segmento torácico de la parrilla (23,3 mm) L1 cae en z ≈ −82, unos 4 cm sobre el punto más
  bajo del modelo (−122). Anclarlo ahí dejaría el bazo, en la axilar media, por encima de la 10.ª costilla (z −96 en esa línea), su
  eje según el mismo texto: las dos marcas de Gray no caben juntas en esta parrilla. Se sigue el eje (la 10.ª costilla y la banda de
  la 9.ª a la 11.ª).
- **El signo de la cortina** con el órgano debajo: en la LAM derecha (EIC9) se ve el hígado en espiración y el pulmón en la
  inspiración profunda; en la LAP izquierda (EIC10), el bazo y el pulmón.
- **F-T34**, con el pulmón aireado: el virtual presente y la columna invisible se cumplen, y emergen del camino reflejado (la
  mutación de la GLSL «sin espejo, el rayo sigue recto» deja detrás del espejo solo el ruido, −88 a −89,5 dB, y la prueba lo ve).
  La tercera parte no: en el nivel mostrado el virtual queda 1,7–2,0 dB por debajo del real en las tres vistas de la base, no ≥ 3.
  Medido sobre la envolvente sin compensar daba 9–10 dB, pero eso es la atenuación de 30 mm más de camino que la TGC del equipo
  compensa (la primera versión de esta decisión lo daba por cumplido: lo halló la revisión). La pérdida propia del espejo en el
  modelo es 0,5 dB (pasada A) más las caras del diafragma; cuánto pierde de verdad el virtual no está en la base (la fuente primaria
  del espejo sigue NO ENCONTRADA, `docs/knowledge/clinical.md` §5.6). Queda con `test.fail`; la otra mitad de F-T34 (derrame o
  consolidación: sin espejo y con la columna visible) espera al derrame. Con el preajuste pulmonar el hígado a 7–11 cm queda cerca
  del negro (−67 a −76 dB de los −70 del rango dinámico).
- **El campo respiratorio** no cambia (los órganos se clasifican en el marco material): su invertibilidad y su inversa se
  comprueban ahora también donde están el hígado y el bazo. Junto a la pared bajan menos que la cúpula (el peso es 0 en ella).
- **Costo por cuadro** (`frameCostMs`, 60 cuadros, GPU real M4, 1440 × 900, main / esta decisión / main intercalados):
  punto BLUE inferior 3,8–5,3 / 5,4–5,9 / 4,6–5,4 ms; PLAPS 3,7–5,0 / 5,4–6,1 / 5,0–5,3; la base derecha (LAM EIC9, haz craneal) 6,1–6,9 / 7,2–7,8 / 6,1–6,3; la base izquierda (LAP EIC10) 5,8–7,4 / 7,3–8,5 / 6,0–8,6 (carga media 3–15; antes de las correcciones de la revisión, con carga 86–97, la base costaba ≈ +1,3 ms). Medianas: +0,5 ms en los puntos de partida y +0,8–1,0 en las bases. Bajo el diafragma cada muestra evalúa el hígado y el bazo. O6 (≥ 30 FPS) holgado, con la reserva de
  `frame-cost-timing-sync`.
- **Con SwiftShader (el CI)**, alternando main y la rama con el prefiltro de abajo (03-10-2026, carga 5–16): el costo por cuadro
  sube un 12–20 % en el BLUE inferior y el PLAPS (de 700–880 a 760–1300 ms; el hígado ocupa ≈ 17 % de las muestras de esas vistas,
  donde antes estaba el «resto»), y las ventanas del banco de fidelidad, el BLUE inferior de 2,4 / 2,7 min a 3,3 / 2,8 y el PLAPS de
  2,5 / 2,8 a 4,0 / 2,9 (×1,04–1,6). En el CI agotaban su plazo de 7 min (4,0–6,3 en main): sube a 10 min, bajo los 15 del trabajo.
- **El prefiltro de los órganos** (`liverLobesSd`, `spleenCandidate`): lejos de los lóbulos del hígado (su distancia pasa de
  `LIVER_EARLY_OUT_MM`) y fuera de donde puede estar el bazo (a la derecha de x 40 o a más de su cota de profundidad más 25 mm),
  la clasificación no evalúa la columna de la pared ni el bazo. No cambia ningún tejido ni ninguna cara
  (`organPrefilter.test.ts`, en el tronco de las seis variantes del tórax, frente a la cuenta completa, y la e2e de equivalencia);
  la distancia a la frontera del «resto» solo sube a su tope donde la cota de profundidad del bazo la acortaba sin que hubiera bazo
  cerca (en el centro del tronco, 4,45 en lugar de 5 mm). En las vistas del banco ahorra poco: el costo está en el propio hígado.
- Limitaciones: `abdomen-generic-tissue` dice lo que queda (el estómago, el riñón, la vesícula, el colon, los vasos); nueva
  `liver-spleen-simplified`.

**Verificación.** `npm run check`; `src/validation/liverSpleen.test.ts` (el borde de Gray en la LMC, la LAA, la LAM y la LAP a ≤ 5 mm
a 3 mm bajo la pared; la línea media sobre el plano transpilórico; el lóbulo izquierdo de las marcas de Gray; el ancho de Gray y el
alto de Kratzer a ± 2 DE; el riñón fuera; el bazo con su largo, su punto más bajo en la axilar media, la banda de la 9.ª a la 11.ª en
la LAP y nada por delante de la LAA; el signo de la cortina en las dos bases; con `notYetMet`, el alto junto a la cara derecha y los
volúmenes del hígado y del bazo), `coverage.test.ts` (127/138, cada celda, el bazo solo a la izquierda y el motivo de cada
pendiente), `respiratoryField.test.ts` (fast-check en el hígado y el bazo de las 18 escenas: jacobiano, ida y vuelta y la mutación de
los dos pasos de punto fijo), `mirrorBench.test.ts` (la medida en el nivel mostrado: una TGC que compensa la atenuación borra el
contraste; la mutación sin espejo), `anatomy.test.ts`, `organs.test.ts` (los gemelos), `shaderLimits.test.ts`. En la e2e: la
equivalencia TS ↔ GLSL con los planos nuevos de las bases (`rightBase`, `leftBase`), el hígado y el bazo en el volumen (que baja a
z −150) y las cápsulas en las bases (cara, distancia y normal, `capsules`); F-T34 en cuatro vistas. La mutación de la GLSL sin espejo
se corrió aparte, en una copia del árbol, con GPU real. Revisión adversarial de contexto limpio (ejecutando): dos bloqueantes, el recuento de ranuras de uniforms tras el rebase (129/131, sobre el techo de 130 de la THI; ahora 125/127) y F-T34
medido sobre la envolvente sin la TGC (medía la atenuación del camino de más: ≈ 9 dB; en el nivel mostrado, 1,7–2,0: queda pendiente,
con la mutación sin espejo y la columna medidas); importantes: el alto del hígado junto a su cara derecha y los volúmenes del hígado
y del bazo frente a Gray (ahora `notYetMet` con su cifra), el polo inferior del bazo frente a L1 (documentado), el polo posterior
atribuido a Gray cuando es la forma del modelo y el motivo falso de la celda escapular izquierda (corregidos), el lóbulo izquierdo
tomado como la anatomía cuando es el extremo medial de Gray, la distancia a la frontera optimista junto al hígado (5,0 mm contra la
columna; ahora ≤ 0,6) y las cápsulas sin gemelo verificado (ahora en la e2e, con el volumen hasta z −150); menores: un título
equivocado, una mutación de la cobertura que no mordía, una propiedad tautológica (quitada) y los 32 tejidos que llenan las tablas.
Aplicado. Además, un escalón de 9 mm del borde del hígado en la punta del 9.º cartílago (el reborde de la costilla frente al de la
tabla), corregido. Medido con GPU real tras las correcciones: las cápsulas, 1226 puntos (840 del hígado, 386 del bazo), acuerdo 1,
error de la distancia 9·10⁻⁵ mm y coseno mínimo de la normal 0,999995; el volumen, 42 226 puntos interiores (4248 de hígado y 284 de
bazo) con acuerdo 1; los planos de las bases, acuerdo 1.

## 38. Lo que falta de la reverberación de la pared no cierra la neblina; el espejo la cerraría con una pleura lisa, pero choca con la caída de las líneas A [Estado: rechazada]

**Fecha.** 2026-10-03.

**Contexto.** Ciclo 3b-3, mecanismo 1 (objetivos O3 y O1). Con R_t 0,1 (decisión 35), la pared y las líneas A quedan cerca
del banco. La neblina no: M de la neblina vale 1,41–1,54, frente a 0,87–1,00 en la exploración. Además queda 0,05–0,28
caídas de línea A por debajo de la pared, y ningún σz, R_t ni K lo cambia. La revisión de la decisión 35 propuso como
candidato la reverberación dentro de la propia pared. Soldati 2020, §2–3 y fig. 1 ([@soldati-trampas-2020], leído en texto
completo), describe lo que se suma bajo la pleura sana:

- «la réplica» de la pared de arriba: la reverberación de los planos miofasciales y de la pleura con la sonda;
- «el espejo» de la pared de abajo.

Su expresión depende del grosor de la pared. La hipótesis: al simulador le falta algo de esa reverberación, y por eso su
neblina queda oscura.

**Opciones.**

- (a) Medir primero qué hay hoy en la neblina, y modelar lo que falte de la reverberación de la pared: entre sus caras, entre
  la pared y la pleura, y entre la pared y la cara de la sonda.
- (b) Subir el campo del deslizamiento, que es lo que llena la neblina (abajo).
- (c) No tocar nada.

**Decisión.** Se midió (a). Se rechaza que lo que falta de la reverberación de la pared cierre la neblina. Se descarta (b),
porque no tiene fuente. El espejo de la pared, que ya está dibujado, la cerraría con una pleura lisa, pero entonces fallan la
línea pleural y las líneas A: es el dilema que queda para la próxima hipótesis.

- **Qué hay hoy bajo la pleura.** La descomposición se hizo con la GPU real (Apple M4) sobre main 83b7544, con el protocolo
  de la decisión 24: apnea espiratoria a t = 60 s, tres réplicas y rango dinámico 70 dB. La herramienta nueva es
  `e2e/descomposicionNeblina.spec.ts`, con `LUS_DESCOMPOSICION=1`. Usa `calibrationOverride({ seriesParts })` y el uniform
  `uSeriesParts` para pesar cuatro partes: la copia espejo, la directa, el deslizamiento y la línea pleural con sus réplicas.

  Las bandas son las del banco, pero situadas con la geometría verdadera (`truthLevelsDb`), no con la detectada. La detección
  cambia con lo que se dibuja: sin el deslizamiento, el BLUE inferior detectaba 278–296 columnas intercostales en lugar de
  142, y así las medianas no eran sobre las mismas muestras. Se miden en las líneas intercostales libres con la pleura del
  gemelo de A0:
  - la pared, u 0,2–0,85;
  - la neblina, u 1,25–1,75.

  Niveles de la envolvente en la pantalla (dB), mediana de la banda:

  | Punto         | Pared | Neblina | Solo deslizamiento | Espejo + directa | Solo espejo | Solo directa | El resto (línea pleural, pasada C, ruido) |
  | ------------- | ----- | ------- | ------------------ | ---------------- | ----------- | ------------ | ----------------------------------------- |
  | BLUE superior | −54,0 | −62,6   | −63,4              | −71,5            | −74,4       | −79,4        | −107,2                                    |
  | BLUE inferior | −48,8 | −61,4   | −63,4              | −67,6            | −70,9       | −75,6        | −100,0                                    |
  | PLAPS         | −51,8 | −62,1   | −63,6              | −69,4            | −72,6       | −77,9        | −105,5                                    |
  - **La neblina es el campo del deslizamiento.** Queda a 0,8–2,0 dB del total, con `SLIDING_DB` −8 dB, el borde de arriba de
    su rango estimado.
  - **Las dos copias de Soldati suman a la neblina 0,8–2,0 dB.** El espejo queda 20–22 dB bajo la pared y la réplica, 25–27
    dB. Juntas, 17–19 dB bajo la pared.
  - **La neblina queda 8,6–12,6 dB bajo la pared en la envolvente.** En M, 0,14–0,21 caídas de línea A, con 28–31 dB por
    caída. Las dos cifras miden lo mismo con dos escalas. M va en gris, y la curva de grises (exponencial en el nivel) comprime
    las diferencias en el gris bajo, donde está la neblina (el 4–8 % de sus píxeles está en el negro). La meta es M; en la
    envolvente, a la neblina le faltan 9–13 dB para la mediana de la pared.
  - **El resto queda 51–54 dB bajo la pared.** Es, sobre todo, la réplica de VExUS en la pasada C (`CLUTTER.reverbFirstDb`
    −50 dB). Esa réplica sí está dibujada. Su ganancia es fija y no sigue a R_t: es una incoherencia menor del modelo, porque
    con R_t 0,1 la cota física de abajo da −30 dB y no −50.
  - **El gemelo de CPU confirma la descomposición.** `support/pleuraTwin.ts`, ahora con `mirror` y `forward` por separado, y
    la prueba nueva de `pleuraTwin.test.ts`, sobre una pared plana de 28 mm, dan:
    - la neblina, a 0,3 dB del deslizamiento;
    - el espejo, 19 dB bajo la pared;
    - la réplica, 24 dB bajo la pared.
  - **Lo que domina, con R_t 0,3 y con R_t 0,1.** La decisión 34 halló que, con R_t 0,3, la copia directa dominaba la
    espejo en esta banda por unos 4 dB. Con R_t 0,1 se invierte: la directa pierde 9,5 dB.

- **Por qué quedan tan abajo en el modelo.** Cada rebote en la pleura conserva solo su parte coherente, R_p·χ, con χ = 0,36
  (σz 0,05 mm a 3,5 MHz; decisiones 34 y 35).
  - La copia espejo paga χ² = 0,13: −17,7 dB.
  - La réplica paga χ·R_t por los dos caminos del mismo retardo: 2·0,36·0,1 = 0,072, −23 dB.
  - Lo que el espejo pierde de más (3–4 dB) es la atenuación real del camino de vuelta frente a la compensación nominal.

  Es una explicación del modelo, no una prueba de que la pleura real sea así. La propia fuente juega en contra de σz 0,05:
  la fig. 1 de Soldati, a 9 MHz y con sonda lineal, muestra el espejo y las réplicas de la línea pleural. Con Ament y σz 0,05
  mm, a 9 MHz χ = exp(−2(k0·σz)²) ≈ 0,001: −58 dB por rebote, y no se vería ni el espejo ni ninguna línea A.

- **Lo que falta de la reverberación de la pared, acotado en energía frente a la pared.** Todo camino que el modelo no dibuja
  lleva, además, una reflexión en una cara de la pared. Las caras de la tabla, para la pared lateral (piel–grasa, Scarpa,
  fascia profunda, los dos planos intermusculares, transversalis y peritoneo), suman ΣR² ≈ 0,094. Son tres familias:
  1. **Cada cara con la cara de la sonda.** Copia la pared que tiene debajo con R_cara·R_t. Sumadas sin coherencia, su
     energía frente a la de la pared es ΣR²·R_t²: −16 dB con R_t en el tope de su rango (0,5) y −30 dB con 0,1. Es la que la
     pasada C dibuja a −50 dB fijos.
  2. **Dos caras entre sí:** ≤ (ΣR²)²/2, −24 dB.
  3. **Una cara con la pleura a la ida y a la vuelta.** Es el espejo de la cara, que ya está dibujado (con
     `WALL_COPY_FACE_GAIN`). Sus órdenes altos pagan R_cara²·χ² más: < −40 dB.

  Sumada a la neblina, que ya está a 9–13 dB de la pared, la peor de las tres (−16 dB) la sube a lo sumo 1,0–1,4 dB. Hacen
  falta 9–13.

- **Subir el deslizamiento (opción b).** Unos 10 dB más de `SLIDING_DB` cerrarían la neblina sin tocar las líneas A. Pero su
  rango (−12 a −8 dB) no tiene fuente: es una estimación heredada de VExUS. La decisión 24 no amplía un rango para alcanzar el
  banco. Y el banco no dice que la neblina real sea deslizamiento: dice que está al nivel de la pared.

- **El dilema: con una pleura lisa el espejo calza.** Con la pleura de la cota de Ostras 2023
  ([@ostras-histopatologia-2023]; σz ≲ 9–23 µm, decisión 35), el espejo queda a 3,5–7,4 dB de la pared, como muestra el
  banco: la neblina dentro de la banda de la pared. Pero no es compatible con el resto del preajuste. La misma descomposición,
  repetida con σz del rango de la decisión 35 (`LUS_DESCOMPOSICION_SIGMAZ`), K 54 dB, ganancia −20 dB y R_t 0,1, da (BLUE
  superior / BLUE inferior / PLAPS):

  | σz (mm) | Neblina − pared (dB) | Espejo − pared (dB)   | Caída de la pleura a la línea A de orden 2 (dB) | Columnas con la línea pleural recortada (%) |
  | ------- | -------------------- | --------------------- | ----------------------------------------------- | ------------------------------------------- |
  | 0,01    | −1,9 / −3,8 / −2,2   | −3,5 / −5,3 / −4,0    | 19,8 / 22,2 / 20,5                              | 54 / 76 / 53                                |
  | 0,02    | −3,4 / −5,4 / −3,8   | −5,6 / −7,4 / −6,1    | 20,9 / 23,2 / 21,6                              | 34 / 68 / 28                                |
  | 0,03    | −5,3 / −7,8 / −6,0   | −9,1 / −10,9 / −9,6   | 22,7 / 25,0 / 23,3                              | 14 / 52 / 4                                 |
  | 0,04    | −7,2 / −10,4 / −8,3  | −14,1 / −15,8 / −14,5 | 25,3 / 27,4 / 25,7                              | 0 / 8 / 0                                   |
  | 0,05    | −8,6 / −12,6 / −10,4 | −20,4 / −22,1 / −20,8 | 28,5 / 30,4 / 28,8                              | 0 / 0 / 0                                   |
  | 0,06    | −9,2 / −14,1 / −11,3 | −28,1 / −29,8 / −28,4 | 32,4 / 34,1 / 32,8                              | 0 / 0 / 0                                   |

  La misma χ que deja pasar el espejo deja pasar la línea pleural y cada ida y vuelta de las líneas A. Con σz 0,01–0,02:
  - el espejo calza;
  - la línea pleural se recorta en el 28–76 % de sus columnas (Demi 2023, enunciado 15);
  - las líneas A caen solo unos 20–23 dB por orden;
  - M y r₂ se alejan del banco (la superficie de la decisión 35).

  Hace falta una pérdida que paguen las líneas A y no el espejo. Con los r₂ del banco (0,17–0,25, frente a 0,35–0,40), esa
  pérdida debe dar al menos 30 dB por orden con la pleura lisa. R_t ya está en el borde de abajo de su rango con fuente.

- **El lóbulo de la pleura en cada ida y vuelta: probado y aplazado.** La cara de la sonda es lisa y su normal es la línea.
  Por eso cada ida y vuelta pleura–cara solo vuelve por la línea con el lóbulo de Kirchhoff de la pleura, Λ(θ)/Λ(0), el mismo
  que ya paga la línea pleural (decisión 57 de VExUS). Hoy la réplica k lo paga una vez, no k veces, y la meta F-T04 no se
  cumple. Se probó en la rama `feat/lobulo-pleura` (1f49b3d: TS y GLSL, F-T04 como prueba con su mutación). Lo que dio:
  - **No sirve para el dilema.** En los puntos de partida del simulador la pleura queda casi normal a cada línea bajo la sonda
    comprimida: cos θ mediano 0,9997 / 0,9974–0,9984 / 0,9978, es decir, −0,05 / −0,3 a −0,45 / −0,4 dB por ida y vuelta.
    En el banco de fidelidad M cambia ≤ 0,02. Lejos de los ≥ 10 dB por orden que pide el dilema.
  - **Rompe una guarda de la decisión 35.** En el BLUE inferior, las líneas A de las columnas oblicuas caen al negro en
    ≥ 5 % de las columnas, y M de la pared, M de la neblina y r₂ salen censuradas. Es una consecuencia física del lóbulo, o
    una señal de que la pendiente de la pleura (s = 0,15) o la guarda no son las adecuadas: hay que decidirlo antes de
    reabrirlo.
  - **El detector no es la causa.** El detector del sector, que en el BLUE inferior da d_pl 5,5 mm larga, falla igual sin el
    lóbulo: 2 de 4 corridas con `--repeat-each=4` en esta rama, cuya imagen es la de main 83b7544. Era la inestabilidad del detector que corrigió la decisión 36.
  - **Su modelo no es el de la fuente.** `physics.md` §2.3 describe una desviación que se acumula, 2kθ en el orden k. La rama
    paga un Λ(θ) constante en cada orden, y multiplica la χ coherente por un lóbulo de facetas incoherente. Hay que
    reconciliarlo antes de reabrirlo.

**Consecuencias.** No cambia la física de la imagen. Los pesos `uSeriesParts` valen 1 salvo en la medida, el factor 1,0 es
exacto en la GPU y M coincide con main a ±0,001, el ruido del receptor entre corridas. Quedan:

- la herramienta de la descomposición, que no es una prueba: `e2e/descomposicionNeblina.spec.ts` y `uSeriesParts`. Cuesta
  una ranura de uniform más en B (120 y 122 de ≤ 130 en el programa dirigido) y cuatro productos por muestra. El coste del
  cuadro no cambia: 5,82 ms frente a 5,89 en main y B 2,73 frente a 2,74 ms, medianas de 9 medidas de 60 cuadros con
  `frameCostMs`;
- en el informe del banco de fidelidad, las bandas con la geometría verdadera (`truthLevelsDb`) y la incidencia de la línea
  en la pleura (`aLineDrop.ft02.cosI`);
- el gemelo de la pleura con el espejo y la réplica por separado, con su prueba.

La neblina del simulador es el campo del deslizamiento: un componente incoherente con su nivel estimado (`SLIDING_DB`, en el
tope de su rango). La limitación lo dice. La próxima hipótesis tiene que explicar a la vez dos cosas: una neblina al nivel de
la pared (un espejo casi sin pérdida) y líneas A que caen ≥ 30 dB por orden.

**Verificación.**

- Las dos tablas: `e2e/descomposicionNeblina.spec.ts` con la GPU real (`LUS_E2E_GPU=1`), sin y con
  `LUS_DESCOMPOSICION_SIGMAZ=0.01,0.02,0.03,0.04,0.05,0.06`.
- El gemelo: «descomposición de la neblina» en `pleuraTwin.test.ts` (nivel lento).
- La cota: la tabla de caras de `anatomy/interfaces.ts`.
- La imagen sin cambios: la calibración de C3b-A en main y en la rama, a ±0,001 en M y r₂.
- El coste: `frameCostMs` en los tres puntos.
- El lóbulo: la calibración y `e2e/fidelidad.spec.ts` con la GPU real en la rama `feat/lobulo-pleura` y en main (con
  repeticiones en el BLUE inferior).
- Soldati 2020 se leyó en texto completo (§1–3 y fig. 1).
- Sin revisión adversarial de contexto limpio: el agente que la llevaba se detuvo por el límite de uso; la revisó el
  coordinador (04-10-2026).

## 39. La pared viva: la mano del ecografista mueve la sonda sobre la pared que respira, y la pila se mide como los clips

**Fecha.** 2026-10-03.

**Contexto.** Ciclo 3b-3, mecanismo 2 (objetivos O3 y O1). En el banco de fidelidad la pared del simulador estaba quieta:

- T2 de la pared, la correlación de un cuadro con el siguiente, valía 1,000; en la exploración del banco vale 0,982–0,993.
- La σ temporal de la pared era 0,01–0,5 grises, frente a 5,8–11,8 en los clips. Por eso el cociente S1 (bajo la pleura
  sobre la pared) daba 9,7–17,9, frente a 1,04–1,61.

En el simulador, la pared no se mueve respecto de la sonda: el campo respiratorio la deja quieta (peso 0, decisión 22) y la
sonda queda fija en la sala. Además, con la pila de 1 s de la e2e, la arena (bajo la pleura) se decorrelaba en 0,15–0,19 s,
frente a 0,46–0,72 s en el banco.

**Opciones.**

- El ruido electrónico de cada cuadro. Ya está: `uNoise`, con el contador de cuadros, a −72 dB del hígado. Con la relación
  señal/ruido de la pared no cambia T2.
- El movimiento de la pared con la respiración y con el latido transmitido.
- El temblor de la mano.
- Para la arena: el grano o la amplitud del deslizamiento.

**Decisión.**

- **Primero, la medida: la pila se mide como los clips.** El banco calcula T2 y S1 sobre el clip entero: 7–17 s, a
  18–37 cuadros por segundo. La decorrelación de S1 depende de esa duración, porque la media se resta dentro de la ventana
  y el retardo llega hasta su mitad. `e2e/fidelidad.spec.ts` toma 1 s (30 cuadros a 30 cps), así que sus medidas no se
  comparan con las del banco.

  La herramienta nueva es `e2e/pilaClips.spec.ts` (`LUS_PILA=1`). Respira tranquilo durante la mediana de la duración de los
  clips de la exploración, a su mediana de cuadros por segundo: 8,3 s a 25 cps, 208 cuadros. Con la imagen de main, la arena
  pasa de 0,15–0,19 s a 0,30–0,40 s. Parte de la diferencia con el banco era de método. El arreglo está en la medida, no en la
  física.

- **La pared que respira bajo la sonda** (`probe/operator.ts`, estado del operador).
  - **El movimiento de la pared.** No hay una medida de la pared bajo una sonda. Se toma el volumen mamario en respiración
    libre: AP 1,29 ± 0,59 mm, craneocaudal 1,00 ± 0,51 y mediolateral 0,94 ± 0,52 ([@jo-movimiento-2026]: TC 4D, 100
    pacientes, el centro del volumen entre las 10 fases). Es una extrapolación: otra estructura (la mama), en mujeres
    operadas, y se usa en todos los puntos, también el PLAPS y los paravertebrales con el paciente sentado.
  - **Cómo se aplica.**
    - AP, por la normal de la piel.
    - SI, hacia craneal.
    - ML, en el plano de la piel, hacia fuera y proporcional a la distancia a la línea media: 0 en el esternón y en la
      columna, sin saltos.
    - Escala con la fracción de la excursión tranquila del diafragma en el instante: el mismo reloj.
    - Con la inspiración profunda (53 frente a 16 mm de diafragma) da ≈ 3,3 veces más, lo que mide la TC de la pared
      anterior en inspiración profunda frente a espiración sostenidas: AP 4,2–5,4 mm y SI 2,5–2,6
      ([@lowanichkiattikul-pared-2016]).
  - **Lo que sigue la mano.** La mano que sostiene la sonda sigue una fracción de ese movimiento, `chestFollow`: 1, la sonda
    pegada a la pared; 0, la mano quieta en la sala. Ninguna fuente mide esa fracción, así que su rango son los dos extremos
    físicos.
  - **Una traslación rígida.** Se mueven la sonda y su compresión juntas (`translateContact`), sin recalcular el contacto
    (decisión 63). No comprime: con `chestFollow` 0,75 el componente AP acerca la pared entera 0,32 mm en la respiración
    tranquila y 1,07 mm en la profunda, y la cara «muestrea» esos milímetros bajo la piel (`operator-hand-rigid`).
  - **Lo que se guarda.** La adquisición guarda la traslación (`operatorMm`). El navegador 3D dibuja la sonda de la pose, sin
    ella, y así un paciente quieto con la sonda quieta no se redibuja (`humanNavigator.spec.ts` lo comprueba en vivo).
- **El temblor de la mano.** El pico de resonancia del temblor postural está en 7–11 Hz, ≈ 8 Hz de media
  ([@lakie-temblor-2012]); con la carga de una sonda baja algo. La amplitud: 16, 2 y 24 µm rms por eje (30 µm el vector) en
  la punta de un instrumento sostenido en el aire ([@singh-temblor-2002], cirugía de retina). Con la sonda apoyada en el
  paciente es menor, así que 24 µm es el tope del rango. Se calcula como seis senos por eje, con frecuencias en 7–11 Hz y
  fases de la semilla del operador, evaluados en el tiempo del reloj: el mismo instante y la misma semilla dan la misma
  sonda (`operator.test.ts`, también en el simulador).
- **El latido transmitido a la pared: no se modela.** La sismocardiografía mide la vibración de la pared en aceleración, y no
  se encontró su desplazamiento bajo la sonda en los puntos de partida.
- **El ajuste, con la exploración** (decisión 24): la pila con el protocolo de los clips, en los tres puntos de partida.
  - **El barrido:** `chestFollow` 0–1 en pasos de 0,25, y luego de 0,05 entre 0,6 y 0,9, por temblor 0–0,024 mm en pasos de
    0,006.
  - **La regla, declarada antes del barrido:** la menor suma de distancias normalizadas a la banda p10–p90 entre sujetos de
    la exploración, en T2 de la pared, S1 y su decorrelación (mediana de los tres puntos). T2 bajo la pleura queda fuera:
    sale censurada en todos los candidatos, también sin la mano, porque el 5–8 % de su banda está en el negro.
  - **Lo que dio el barrido:** ganaba el temblor en el tope (0,024, con `chestFollow` 0,65). Los dos mandos se compensan.
  - **La guarda, añadida al ver el barrido y antes de mirar la comprobación:** F-T11, la estratósfera lejos del corazón en
    apnea, debe dar ≥ 0,95 en 2 s en las ocho realizaciones de la semilla. El temblor la erosiona:

    | Temblor (mm rms por eje)    | 0,006 | 0,009 | 0,012 | 0,018 | 0,024 |
    | --------------------------- | ----- | ----- | ----- | ----- | ----- |
    | F-T11, mínima de 8 semillas | 0,985 | 0,975 | 0,975 | 0,946 | 0,920 |
    | F-T11, mediana              | 0,987 | 0,984 | 0,981 | 0,970 | 0,952 |

    Con la guarda, el temblor queda en 0,012 y gana `chestFollow` 0,75. Se dice así porque la guarda cambia el resultado.
    El valor de `chestFollow` lo fija, de hecho, esa guarda.

**Consecuencias.** Pila con el protocolo de los clips (GPU real, Apple M4; antes = main, sin la mano; p10–p90 entre sujetos;
≥ cota inferior):

| Métrica                     | Exploración | Comprobación | BLUE superior | BLUE inferior  | PLAPS         |
| --------------------------- | ----------- | ------------ | ------------- | -------------- | ------------- |
| T2 de la pared              | 0,982–0,993 | 0,984–0,985  | 1,000 → 0,998 | 1,000 → 0,999  | 1,000 → 0,998 |
| S1 (bajo / sobre la pleura) | 1,04–1,61   | 0,911–0,973  | 9,46 → 0,965  | ≥ 18,6 → 1,34  | ≥ 19,7 → 1,70 |
| S1, decorrelación (s)       | 0,460–0,721 | 0,569–0,706  | 0,401 → 0,433 | 0,331? → 0,349 | 0,299 → 0,311 |

(? : censurada.) La comprobación se miró después de elegir, sin reajustar.

- **S1 se acerca al banco en los tres puntos, de 9–20 a 0,97–1,70.** Entra en la banda de la exploración en el BLUE inferior; el BLUE superior queda por debajo (dentro de la comprobación) y el PLAPS, un poco por encima. La pared ya no está quieta: su σ temporal es la del moteado que se mueve.
- **T2 de la pared baja muy poco** (0,998) y queda sobre el banco. El temblor que la bajaría rompe F-T11. Lo que falta no
  tiene todavía un mecanismo con fuente: podría ser la recompresión del vídeo de los clips o el ruido del equipo.
- **La arena sigue rápida.** No es la amplitud del deslizamiento: en la respiración tranquila es de 4,2 mm en el BLUE
  superior, 5,4 en el inferior y 5,2 en el PLAPS (decisión 19), y calza con D5 (Costamagna 2026, 5,4 ± 2,5 mm). El otro
  mando es el grano del deslizamiento (`SLIDING_LAT_MM` 3 mm, `SLIDING_AX_MM` 0,5 mm), una estimación sin fuente que no se
  toca. Es candidato del ciclo 3b-4, junto con el nivel del deslizamiento (decisión 38).
- **Las métricas de un cuadro no cambian.** En la calibración C3b-A (apnea, a t = 60 s), M de la pared, M de la neblina y r₂
  cambian ≤ 0,002: en la apnea espiratoria solo queda el temblor. En la apnea inspiratoria la sonda queda, además, corrida
  fija ≈ 1,5 mm (1,07 mm hacia dentro en AP): la excursión profunda escala en lineal el movimiento de la pared.
- **La guarda del modo M de `e2e/fidelidad.spec.ts` se mide con la mano apagada** (`operator.enabled`). Con la mano, la apnea
  tiembla y la mano mueve también la pared: el cociente de σ bajo la pleura, respirando frente a la apnea, dependía de la
  realización (3,6–10,7). Sin la mano, la guarda conserva sus 10 veces y su mutación (sin el deslizamiento falla). La
  detección y F-T01 se siguen comprobando con la mano.
- **La coherencia del sector detectado se mide con la mano apagada** (hasta la decisión 45, que lo resuelve y la devuelve a la mano encendida). En el PLAPS respirando, con la mano, la guarda d_pl de
  `e2e/fidelidad.spec.ts` (detectada frente a la verdadera, < 2 mm) falló 2 de 4 veces con SwiftShader (2,80 y 2,97 mm; con
  main, 3 de 3 bien). En el fallo el borde de la piel detectado queda 4,8 px más hondo: la máscara temporal del detector se
  corre con la piel que se mueve. Esa guarda es de coherencia del detector, no del banco: el banco mide el simulador con la
  geometría verdadera (decisión 21), así que ninguna métrica que se compara con los clips pasa por ella. Las guardas del
  sector (ápice, bordes, piel y d_pl) usan las dos pilas sin la mano que ya toma la guarda del modo M. Lo que se compara con
  el banco se sigue midiendo con la mano encendida, como los clips: la pila de `e2e/pilaClips.spec.ts`, la calibración de
  `e2e/calibracion.spec.ts` y el informe adjunto de `e2e/fidelidad.spec.ts`. El defecto queda como limitación
  (`sector-detector-moving-skin`) y como prueba «aún no se cumple»: con la mano en el PLAPS respirando, seis pilas a lo largo
  del ciclo desde t = 60 s, el borde de la piel detectado no debería moverse más de 0,5 px (sin la mano, ≤ 0,2 px en 16 fases;
  con ella, hasta 1,2–1,6 px, con la GPU real y con SwiftShader). Fallará cuando el detector lo resuelva.
- **Nota posterior (03-10-2026): la paridad de la transmisión con apertura se mide en potencia, en la escala de los términos
  del cono.**
  Desde esta decisión, `e2e/imagen.spec.ts` fallaba a ratos en la transmisión con apertura de la mirada 0 frente a su gemelo
  (`apertureMaxDiffDb` 0,011–0,027 dB con un límite de 0,01). No es la pose: el gemelo lee los segmentos, los impactos y el
  prefijo que la GPU escribió en el mismo cuadro. Con SwiftShader, en 24 instantes del reloj en el BLUE inferior (una línea de
  cada 8), la diferencia se reparte así según la cancelación coherente del cono (dB entre la media incoherente y la coherente
  con la fase del hueso):

  | Cancelación | Muestras con la mano | Máx. con la mano (dB) | Máx. sin la mano (dB) |
  | ----------- | -------------------- | --------------------- | --------------------- |
  | < 1 dB      | 13 159               | 0,0007                | 0,0004                |
  | 1–3 dB      | 643                  | 0,0008                | 0,0006                |
  | 3–6 dB      | 390                  | 0,0008                | 0,0008                |
  | 6–10 dB     | 455                  | 0,0013                | 0,0014                |
  | 10–20 dB    | 506                  | 0,0135                | 0,0071                |
  | > 20 dB     | 62                   | 0,028                 | 0,0054                |

  Sin la mano la geometría es la misma en los 24 instantes (0,0071 dB); con ella, en tres barridos de 24 instantes, 18–20
  pasan de 0,01 (máximo 0,030). La diferencia cruda crece como (T_incoherente/T)²: un error en los términos de la suma de
  fasores es un error absoluto en la potencia, del tamaño de los términos. Emular float32 en el gemelo (k y σ, las cuerdas, el
  argumento k·ΔL y toda la aritmética del cono) no la cambia (0,0297 frente a 0,0297): es atribuible a las trascendentes de la
  GPU. La paridad se mide ahora en potencia frente a la incoherente al cuadrado, 10·log10(1 + |T_TS² − T_GPU²|/T_inc²)
  (`apertureParity.ts`), que sin cancelación es la diferencia cruda en dB y con ella no crece: con la mano, ≤ 0,0006 dB en los
  24 instantes (sin la mano, 0,0004). El umbral baja de 0,01 a 0,005 dB, ≈ 8 veces el máximo medido. Se midió también la
  alternativa en amplitud, 20·log10(1 + |ΔT|/T_inc): ≤ 0,0016 dB, pero solo frena el crecimiento a T_inc/T y su margen se
  acabaría hacia los 44 dB de cancelación (hoy, como mucho, 28 dB). La cruda, la cancelación máxima y la fracción de muestras
  con cancelación > 20 dB (0,16–0,63 % con la mano) van en el informe.

  Lo que se pierde: ante errores paramétricos pequeños la prueba es menos sensible que con la cruda (que de todos modos ya no
  servía). Con SwiftShader y la mano, k × 1,001 en la GLSL da 0,042 dB crudo y 0,0078 en potencia (pasa el umbral 1,6 veces,
  frente a 4 veces la cruda con 0,01); k × 1,003, 0,136 y 0,024. En la rejilla sintética de `boneTransmission.test.ts`
  (fundamental y armónica), σ × 1,01 da 0,005–0,007 en potencia frente a 0,03–0,15 crudo: en el umbral. Se pierden unas 3
  veces de sensibilidad ante errores de ≈ 0,1 % en k y 3–10 ante ≈ 1 % en σ. Los errores de verdad siguen cayendo (mutaciones de la
  GLSL con la mano, en potencia): la fase de una sola toma, cos(k·(L_j + L_m)), 3,0 dB; k × 1,1, 0,67 dB; la cuerda de la costilla una fila más honda, 2,9 dB; el signo de la decoherencia de la banda, e^(+(σ·ΔL)²/2), 20 dB (dos instantes cada una). Invertir el signo de la fase entera, cos(−k·ΔL), no es una mutación: el coseno es
  par y la suma por pares no cambia.

- **El coste del cuadro en la GPU no cambia:** 4,47 ms con la mano y 4,51 sin ella, en la misma sesión (medianas de 9 medidas de 60 cuadros con `frameCostMs`, alternando). La mano es CPU, no recalcula el contacto y no hace redibujar el
  navegador.
- **El gancho `operator`** cambia el estado de la mano (semilla, si está activa, lo que sigue y el temblor) sin recompilar.

**Verificación.**

- `src/validation/operator.test.ts`: el temblor con su rms y su banda; la misma sonda con el mismo instante y la misma
  semilla, también en el simulador (la traslación, recalculada a mano desde la muestra del reloj y el contacto de la pose);
  la pared con sus tres amplitudes, lineal en la fracción y sin saltos en la línea media ni en la axilar media; la mano
  apagada.
- `acquisitionHistory.test.ts`: la adquisición guarda la traslación.
- `e2e/humanNavigator.spec.ts`: sin redibujos en vivo con la sonda quieta.
- El barrido y la tabla: `e2e/pilaClips.spec.ts` con la GPU real (`LUS_PILA_FOLLOW`, `LUS_PILA_TREMOR`).
- F-T11 en ocho semillas.
- La e2e entera con la GPU real.
- Sin revisión adversarial de contexto limpio: el agente que la llevaba se detuvo por el límite de uso; la revisó el
  coordinador (04-10-2026).

## 40. El costo por cuadro sincronizado con una lectura válida, y los FPS reales del modo B en el informe técnico

**Fecha.** 2026-10-03.

**Contexto.** La meta de O6 (modo B a ≥ 30 FPS en un computador moderno) se sostiene con `frameCostMs` (ganchos de la e2e): el
tiempo de pared de n cuadros entre dos `finishForTiming`, que leía un píxel RGBA/UNSIGNED_BYTE del framebuffer que estuviera
ligado. La decisión 33 vio un aviso de WebGL por medida en la GPU real y dejó la duda de si la lectura esperaba a la GPU
(`frame-cost-timing-sync`). El informe técnico solo traía las vueltas del bucle en el último cuarto de segundo (`fps`), que
siguen con la imagen congelada.

**Lo que pasaba** (Chrome con Metal, Apple M4; `e2e` temporales fuera del repositorio). Tras guardar un cuadro en el cine
(`cineStore`, a ≤ `CINE_RATE_HZ`) queda ligado para lectura el FBO de la envolvente (R32F), donde RGBA/UNSIGNED_BYTE es inválido
(«Invalid format and type combination»). **Una lectura inválida no espera**: tras encolar 30 cuadros (0,09–0,15 ms cada uno), la
lectura inválida vuelve a los 0,46–0,51 ms por cuadro y la válida que la sigue, a los 5,0–6,4; con la GPU cargada (el campo
crudo nueve veces por cuadro), 0,69–0,94 frente a 24,3–33,0. En `frameCostMs` la lectura inválida era la **del principio**:
`goTo` avanza el reloj, el cuadro de calentamiento va al cine y deja ligada la envolvente; los n cuadros medidos tienen el mismo
instante, no van al cine y la presentación deja ligada la pantalla, así que la lectura **del final** era válida (la revisión lo
comprobó con el WebGL falso: [inválida, válida] en las 9 medidas con `startPoint`). Por eso la medida de main no salía baja
sino, si acaso, alta: el trabajo del calentamiento, sin esperar, se colaba en el intervalo (con la GPU cargada, +0,6–2,0 ms por
cuadro, +5–7 %). **Los costos de las decisiones anteriores valen** (la 33: 4,9–6,8 ms). Pero el resultado dependía de que
ningún cuadro medido fuera al cine: si uno lo hacía, la lectura del final era inválida y la medida salía ≈ 10 veces baja.

**Medida independiente** (ventana de 1440 × 900, lienzo de 1006 × 717; las seis vistas, tres pasadas intercaladas de 60
cuadros), ms por cuadro:

| Vista                  | Gancho de main | Lectura válida de la pantalla | Cada cuadro esperado | Solo encolar | TIME_ELAPSED |
| ---------------------- | -------------- | ----------------------------- | -------------------- | ------------ | ------------ |
| BLUE superior          | 5,44–5,51      | 5,44–5,48                     | 6,50–6,59            | 0,11–0,20    | 13,9–15,0    |
| BLUE inferior          | 5,45–5,50      | 5,47–5,59                     | 6,60–6,70            | 0,10–0,11    | 13,8–15,4    |
| PLAPS                  | 5,50–5,62      | 5,50–5,61                     | 6,68–6,75            | 0,10–0,13    | 13,9–14,7    |
| Paravertebral superior | 5,36–5,93      | 5,31–5,92                     | 6,40–7,03            | 0,10–0,11    | 13,6–15,8    |
| Paravertebral media    | 6,04–6,29      | 6,05–6,22                     | 7,11–7,36            | 0,10–0,13    | 15,8–16,7    |
| Paravertebral basal    | 6,65–6,83      | 6,59–6,76                     | 7,68–7,85            | 0,10–0,12    | 17,1–18,5    |

**El temporizador de la GPU no sirve de referencia aquí**: TIME_ELAPSED alrededor de los mismos 60 cuadros da 2,5–2,8 veces el
tiempo de pared, más que dibujar y esperar cada cuadro: imposible para un temporizador correcto. La media por pasada del
renderizador (`gpuMs` del informe técnico) sale 6,7–59 ms. Queda como limitación (`gpu-timer-unverified`).

**Opciones.** (a) Leer un píxel de la pantalla, que escribe la última pasada (la presentación) y depende de todas las anteriores;
(b) `gl.finish()` (en WebGL no garantiza la espera); (c) una valla (`fenceSync`), que WebGL no deja esperar dentro de una tarea
(su estado solo cambia al volver al bucle de eventos); (d) la consulta TIME_ELAPSED, descartada por lo de arriba.

**Decisión.** (a).

- `finishForTiming` (`src/ultrasound/renderer.ts`) liga para lectura la pantalla, lee 1 × 1 RGBA/UNSIGNED_BYTE, vuelve a ligar
  lo que había y **lanza** si WebGL informa un error (una medida sin sincronizar no se devuelve en silencio; con el contexto
  perdido, `CONTEXT_LOST_WEBGL`). Se llama en la misma tarea que el último `render` (`frameCostMs` y la e2e lo hacen). La copia al
  cine va después de la presentación y no está en esa dependencia, pero en `frameCostMs` los cuadros medidos no van al cine (el
  mismo instante): el costo medido es el de las pasadas del cuadro, sin la copia al cine (≤ `CINE_RATE_HZ`) ni la captura del
  modo M del bucle real.
- **Los FPS reales del modo B** (`src/app/frameRate.ts`, `BmodeFrameRate`; campo `bmodeFps` del informe técnico): los cuadros que
  se dibujan de verdad (tras `render`, en vivo y con la GPU) en los últimos 10 s, con la mediana y el p95 del intervalo entre
  cuadros (los tirones que la media esconde); congelar, perder la GPU u ocultar la pestaña vacían la ventana. `fps` sigue siendo
  lo de la barra de estado.

**Consecuencias.**

- **Después** (el gancho con la lectura válida, mismas condiciones, ms por cuadro): BLUE superior 5,33–5,65, BLUE inferior
  5,23–5,43, PLAPS 5,38–5,46, paravertebral superior 5,23–5,79, media 5,92–6,12, basal 6,53–6,87; ningún aviso de WebGL y
  `getError` limpio en las 36 medidas. Con la GPU cargada, el gancho y la lectura válida a mano difieren 0,1–0,6 ms por cuadro
  (antes 0,6–2,0; no se midió de dónde sale lo que queda).
- **O6, medido en el navegador** (GPU real, 1440 × 900): el bucle va a **60 FPS en las seis vistas**, con la mediana y el p95 del
  intervalo en 16,7 ms (el refresco de la pantalla); el informe técnico da `bmodeFps` 59,8 con 599 cuadros en 10 s. El cuadro
  cuesta 5,2–6,9 ms: margen de 2,4–3,2 veces para 60 FPS y de 4,8–6,4 para la meta de 30.
- VExUS tiene la misma lectura: queda en «Mejoras para ofrecer al origen» (`docs/PROVENANCE.md`).
- `frame-cost-timing-sync` se cierra; nueva `gpu-timer-unverified`.
- La pregunta abierta de la decisión 36 sobre d_pl (la mediana de una pleura a dos profundidades) es el issue #53; no se toca
  aquí.

**Verificación.** `frameCost.test.ts` sobre el renderizador real con el WebGL falso, que ahora rechaza las lecturas como WebGL 2
(RGBA/UNSIGNED_BYTE solo de la pantalla o de un adjunto RGBA8; RGBA/FLOAT solo de uno de coma flotante): tras un cuadro que va
al cine la lectura ligada es la envolvente (R32F), `finishForTiming` lee la pantalla y la deja como estaba; una lectura RGBA/FLOAT
del renderizador no deja error; con un error pendiente, lanza. `frameRate.test.ts` (60 FPS, los tirones en el p95 con más y con
menos del 5 %, la ventana y su vaciado). La e2e `e2e/costo.spec.ts`: dibujar cuadros pesados y esperar con `finishForTiming`
cuesta más de 3 veces lo que encolarlos y más de 1 ms por cuadro, el gancho sigue a la carga de la GPU y ninguna medida deja error
ni aviso de WebGL (dos cuadros con el campo crudo dos veces más; GPU real: encolar 0,40 ms por cuadro, esperar 10,0; SwiftShader: 0,30 y 1 847). `smoke.spec.ts`: con la imagen en vivo, el informe técnico trae
`bmodeFps`. **Mutaciones**, cada una atrapada: la lectura de antes (las dos unitarias; en la e2e, `getError` 0x502), sin restaurar
la lectura ligada (una unitaria), sin lanzar (una unitaria) y `finishForTiming` vacía (la e2e: esperar = encolar, 0,35 ms). La
revisión adversarial de contexto limpio halló, entre otras cosas, que la primera versión de esta decisión afirmaba que la lectura
inválida esperaba a la GPU; la medida de arriba (la lectura inválida al cerrar) lo desmiente y el razonamiento se rehízo.

## 41. La neblina es el espejo de la pared: con una pleura lisa calzan su relación con la pared y la arena, pero las líneas A caen poco [Estado: rechazada]

**Fecha.** 2026-10-03.

**Contexto.** Ciclo 3b-4 (objetivos O3 y O1). La decisión 38 midió que la neblina del simulador es el campo del deslizamiento
(`SLIDING_DB`, estimado y en el tope de su rango), 9–13 dB bajo la pared. El espejo de la pared queda 20–27 dB por debajo,
porque cada rebote en la pleura conserva solo su parte coherente (χ). Con la pared viva (decisión 39), la arena del simulador
se decorrela en 0,31–0,43 s, frente a 0,46–0,72 s en la exploración. Lo que dicen las fuentes:

- **Lo que hay bajo la pleura.** En la simulación de onda completa con histología porcina, la amplitud de la onda que
  penetra cae 67,9 dB en el primer milímetro bajo la pleura ([@ostras-histopatologia-2023]: hidrófonos virtuales, no la
  imagen). De ahí se infiere que el parénquima no da nada visible. Lo que se ve entre las líneas A son réplicas y el espejo de
  las estructuras de la pared ([@demi-verticales-2022]; [@soldati-trampas-2020]).
- **La pérdida del espejo.** Con el tejido a 1,5 MRayl y el pulmón inflado a 0,1–0,2 MRayl (`docs/knowledge/physics.md`), dos
  reflexiones especulares pierden 2,3–4,7 dB. Con 0,4 MRayl, 9,5 dB; el rango ex vivo de pulmones pequeños llega a 0,7 MRayl,
  17,6 dB ([@oelze-impedancia-2008]). Es cálculo propio, solo de la parte especular.
- **La arena.** El campo de dispersores que se traslada a v pierde la correlación como g1(τ) = exp(−(vτ)²/4σ²), con σ la
  anchura de la PSF ([@tang-decorrelacion-2020], ec. 6). La arena del banco se mide en grises, en intensidad: |g1|² cae a
  1/e en τ = √2·σ/v.

La hipótesis: la neblina de los clips es el espejo de la pared, casi sin pérdida. Por eso queda al nivel de la pared y se
decorrela despacio: se mueve con la pared, no con el deslizamiento.

**Opciones.**

- (a) Una pleura más lisa (σz con la cota de Ostras, decisión 35), con la ganancia que no recorta la línea pleural (Demi 2023,
  enunciado 15).
- (b) Lo mismo en armónica tisular.
- (c) Subir el grano del deslizamiento (`SLIDING_LAT_MM`) para frenar la arena.
- (d) Subir `SLIDING_DB` hasta la pared.
- (e) K 53 / ganancia −19, el candidato que la decisión 35 descartó por la guarda del detector del sector (ya arreglada en la
  decisión 36).
- (f) La reverberación entre dos espejos curvos: la cara convexa de la sonda y la pleura, con otra curvatura, no forman un
  resonador que se reproduzca a sí mismo, y en cada ida y vuelta se pierde lo que sale del modo. La serie de hoy se calcula en
  la misma línea (`pleura-series-same-line`) y no lo ve.

**Decisión.** Se midieron (a)–(c) y (e) con la GPU real (Apple M4), sobre main 92aeade y la pared viva (#55), y se estimó (f).
Ninguna combinación con fuente cierra el banco: se rechazan como calibración y quedan registradas con su superficie. Lo
medido es compatible con la hipótesis del espejo en la relación entre la neblina y la pared y en la arena. Falla en la caída
de las líneas A, y con ella en el nivel de la neblina medido en caídas de línea A (M).

- **(e) K 53 / ganancia −19.** No cambia nada: frente a K 54 / −20, M de la pared, M de la neblina y r₂ cambian ≤ 0,015 en los
  tres puntos (la ganancia es afín) y ninguna guarda se pierde. No hay motivo para moverlo.
- **(c) El grano.** La arena escala casi en lineal con el grano: 0,23–0,32 s con 1,5 mm, 0,31–0,43 con 3 y 0,39–0,51 con 6. En el
  simulador la arena la fija el grano del deslizamiento, no la PSF: el grano de 3 mm es más grueso que la PSF lateral de dos
  vías (1,40–1,43 mm de FWHM a 20–45 mm, σ 0,6 mm). Con la PSF sola, τ = √2·σ/v da 0,22 s con la velocidad de pico de una
  senoide de 5,4 mm por ciclo a 14 rpm (≈ 3,9 mm/s; D5, medido con sonda lineal) y 0,34 s con la media (≈ 2,5 mm/s). Es más
  rápida que el banco, no más lenta: subir el grano no tiene fuente, y lo que frena la arena en los clips tiene que ser otra
  cosa (abajo: el espejo).
- **(d) `SLIDING_DB`.** No hay fuente para subirlo. La decisión 24 no amplía un rango para alcanzar el banco, y las fuentes
  dicen que bajo la pleura no hay parénquima visible.
- **(a) La pleura lisa.** `e2e/pleuraLisa.spec.ts` (`LUS_LISA=1`), con R_t 0,1 y K 54. En cada σz se toma la ganancia más alta que
  no recorta la línea pleural en ningún cuadro y deja M y r₂ sin censura. Esas ganancias, −24 a −26 dB, salen del dominio del
  preajuste (−24 a −18). Se dice así: el preajuste habría que volver a derivarlo. En el BLUE inferior, con σz ≤ 0,03, M y r₂
  salen censurados en todas las ganancias de −20 a −34 dB (la línea pleural recorta arriba o la línea A cae al negro abajo):
  queda fuera de la tabla. La arena se mide con la pila de los clips y la misma ganancia.

  BLUE superior / PLAPS:

  | σz (mm) | Ganancia (dB) | M pared     | M neblina   | r₂          | P1          | Neblina − pared (dB) | Caída pl→A2 (dB) | Arena (s)   |
  | ------- | ------------- | ----------- | ----------- | ----------- | ----------- | -------------------- | ---------------- | ----------- |
  | 0,005   | −26 / −26     | 2,02 / 1,95 | 2,06 / 1,97 | 0,55 / 0,53 | 1,46 / 1,58 | −1,8 / −2,0          | 19,2 / 20,6      | 0,59 / 0,43 |
  | 0,01    | −26 / −26     | 1,99 / 1,92 | 2,04 / 1,96 | 0,54 / 0,53 | 1,45 / 1,57 | −2,3 / −2,5          | 19,5 / 20,9      | 0,61 / 0,44 |
  | 0,02    | −24 / −24     | 1,90 / 1,84 | 1,97 / 1,90 | 0,53 / 0,51 | 1,41 / 1,51 | −3,7 / −4,1          | 20,6 / 21,9      | 0,56 / 0,40 |
  | 0,03    | −24 / −24     | 1,75 / 1,70 | 1,84 / 1,80 | 0,50 / 0,48 | 1,34 / 1,45 | −5,8 / −6,1          | 22,4 / 23,5      | 0,50 / 0,36 |
  | 0,05    | −20 / −20     | 1,40 / 1,37 | 1,54 / 1,52 | 0,39 / 0,37 | 1,12 / 1,20 | −9,0 / −10,1         | 28,1 / 29,1      | 0,40 / 0,29 |
  | Banco   |               | 0,85–1,40   | 0,87–1,00   | 0,17–0,25   | 4,0         | (dentro de la pared) |                  | 0,46–0,72   |

  Con σz ≤ 0,01:
  - **La neblina sigue a la pared.** Queda a 2–2,5 dB de ella, y en M, a 0,02–0,05. En el banco, la neblina cae dentro de la
    banda de la pared.
  - **La arena se frena.** 0,59–0,61 s en el BLUE superior, dentro del banco; 0,43–0,44 s en el PLAPS, en su borde inferior.
    No es por la ganancia: con σz 0,05 y la misma ganancia de −26 dB (el control, `LUS_LISA_PILA_GAIN`) la arena da 0,44 y 0,32
    s, solo +0,03–0,04 s sobre −20 dB.
  - **P1 sube** de 1,12–1,20 a 1,45–1,58, todavía lejos del 4,0 del banco (un sujeto).
  - **Las líneas A caen solo 19–21 dB por orden** (R_t 0,1 y χ ≈ 1), y M y r₂ se alejan del banco. M de la neblina dobla el del
    banco: la pleura queda a unas dos caídas de línea A de la pared.
  - Con σz 0,02, dentro todavía de la cota de Ostras (9–23 µm), la neblina ya queda a 3,7–4,1 dB de la pared.

- **Diagnóstico, no calibración: R_t bajo su suelo.** Con σz 0,01 y R_t 0,05 / 0,03 / 0,02 (el suelo con fuente es 0,1), en el
  BLUE superior y el PLAPS:
  - caída: 25,6–26,9 / 30,1–31,4 / 33,6–34,9 dB;
  - M de la pared: 1,59–1,63 / 1,43–1,46 / 1,33–1,36;
  - M de la neblina: 1,62–1,67 / 1,46–1,50 / 1,36–1,39;
  - r₂: 0,42–0,44 / 0,35–0,37 / 0,30–0,31.

  Ni con R_t 0,02 llegan M de la neblina ni r₂. Hace falta una pérdida de ≥ 15 dB por orden que paguen las líneas A y no el
  espejo, y aun así la pleura queda más brillante frente a la pared que en el banco.

- **(b) La armónica.** En el simulador no cambia nada. Con σz 0,005, 0,01 y 0,05, M, r₂ y P1 quedan a ≤ 0,02 de la fundamental y
  la caída, a ≤ 2 dB. El modelo de la decisión 77 de VExUS (`harmonic-simplified`) solo oscurece los primeros 4 mm y baja los
  ecos parásitos de la pasada C; la serie de la pleura no distingue el armónico.

  Físicamente no se estima aquí. El armónico se genera donde el fundamental es fuerte. La pleura refleja casi todo, así que
  la línea A sigue generándolo en la vuelta de la primera ida y vuelta; con el R negativo del pulmón (impedancia menor que la
  del tejido), lo generado tras la reflexión puede restar de lo que ya llevaba. El balance depende del signo y de la magnitud
  de R_p y de R_t a f y a 2f, y sin medirlos no hay número.

  Tampoco se sabe con qué modo se adquirieron los clips:
  - el dataset de Born (fuente 14, 24 de los 26 clips) no declara el equipo ni la armónica;
  - Vieira 2020 (LUS-01) recomienda desactivar la armónica tisular y el «Multi Beam» para la ecografía pulmonar
    ([@vieira-dialisis-2020]).

- **(f) Dos espejos curvos: tampoco alcanza.** No se encontró una fuente que mida la caída de las líneas A según la curvatura
  de la sonda (ni lineal frente a convexa). Estimación propia con haces gaussianos (óptica ABCD, paraxial, un plano cada vez;
  script en la PR, sin código en el repo).
  - **El cálculo.** La línea A de orden k (k idas y vueltas a la pleura, con la cara de la sonda entre ellas) se compara con un
    solo reflector de la misma curvatura a k·D. Los modos de emisión y de recepción son los mismos: el foco, la apertura y la
    difracción de cualquier eco a esa profundidad se cancelan y queda lo que pierde la cavidad. Sin R_t ni R_p, con D 16–25
    mm, a 3,5 y 2,5 MHz.
  - **Lateral.** La cara convexa de la C35 tiene R 60 mm; subapertura de 26 mm, foco de emisión del preajuste a 16 mm
    (F# 0,6, en el borde de lo paraxial) y recepción dinámica con F# 2,5. El orden 2 pierde 2,8–3,2 dB con la pleura
    concéntrica (la que deja la compresión del simulador, cos θ ≈ 1); 0,3–0,5 dB con la pleura plana; y gana 0,3–2,3 dB con la
    convexa de R 150. El orden 3 pierde 4,0–4,6, −2,2 a +0,7 y 3,0–7,6 dB.
  - **Elevación.** Huella de 13 mm, lente con foco a 80 mm. Depende de qué superficie refleja la sonda, que R_t no dice:
    - cara plana: 0 a +1 dB;
    - pila de detrás de la lente, que pasa dos veces por ella (f +40 mm): −0,8 a −1,7 dB;
    - superficie convexa de la lente (R ≈ 28 mm para un foco de 80 mm con silicona, f −14 mm): −0,0 a −1,5 dB con la pleura
      plana y −4,9 a −5,4 con la convexa en el orden 2, y −7,7 a −13,5 dB en el orden 3.
  - **En suma.** El orden 2 va de +3 dB (ganancia) a −8,6 dB. En el caso del simulador (concéntrica en lateral, plana en
    elevación), −3 a −5 dB. No llega a los ≥ 15 dB en el orden 2, aunque en el 3 se acerque. No se modela.

**Consecuencias.** No cambia la física ni el preajuste. Quedan:

- la herramienta `e2e/pleuraLisa.spec.ts`, que no es una prueba;
- lo medido sobre la hipótesis del espejo: la neblina sigue a la pared y la arena se frena con una pleura lisa. La
  parametrización de la neblina como un campo propio contra el hígado (`SLIDING_DB`) es la candidata a desaparecer cuando se
  resuelva la caída de las líneas A;
- lo que tiene que explicar la próxima hipótesis: con una pleura lisa, una pérdida de ≥ 15 dB por orden que paguen las líneas
  A y no el espejo.

Las tres cosas que la decidirían:

- qué superficie de la sonda da R_t, y su signo y magnitud a f y a 2f;
- la curvatura de la pleura bajo la sonda apretada;
- el modo de adquisición de los clips.

Mecanismos por medir cuando se sepan: la armónica a lo largo de la serie, la desviación del frente en cada ida y vuelta (la
rama `feat/lobulo-pleura`, ≤ 0,5 dB en los puntos de partida) y el desenfoque entre los dos espejos curvos.

**Verificación.**

- Las tablas: `e2e/pleuraLisa.spec.ts` con la GPU real (`LUS_LISA_SIGMAZ`, `LUS_LISA_RT`, `LUS_LISA_HARMONIC`,
  `LUS_LISA_PILA_GAIN`); `e2e/barridoPleura.spec.ts` para K y la ganancia; el grano, reconstruyendo con `SLIDING_LAT_MM` 1,5, 3 y
  6 y la pila de `e2e/pilaClips.spec.ts`. La PSF, con `lateralFwhmMm` y el foco del preajuste.
- Las fuentes: Ostras 2023 (en PMC), Demi, Buda y Soldati 2022, Tang 2020 y Vieira 2020 se leyeron en texto completo; Oelze
  2008, con su ficha de las referencias.
- Revisión adversarial de contexto limpio (resumen en la PR).

## 42. Los puntos BLUE con la regla de las manos, en los dos hemitórax, y las vistas de medida separadas de los puntos clínicos

**Fecha.** 2026-10-03.

**Contexto.** Los puntos de partida se ponían en espacios intercostales y líneas supuestas: el superior en el EIC2 de la
medioclavicular (decisión 10), el inferior en el centro del EIC4 de la axilar anterior (los reparos de Yuriditsky y cols., decisión 36) y el PLAPS a su altura; solo del hemitórax derecho, sin el punto frénico. La clínica los enseña con la regla de las manos de
Lichtenstein, y el alumno tiene que encontrarlos en los dos lados. Objetivos O5 (docencia) y O2 (la posición sale de la anatomía
del avatar con fuente).

**Fuentes** (búsqueda del 03-10-2026; texto completo salvo donde se dice):

- **La regla** [@lichtenstein-bluepoints-2011] (TC), [@lichtenstein-luci-2014] (TC), [@lichtenstein-libro-2016] (una
  reproducción del capítulo, sin cotejar con Springer), [@lichtenstein-breathe-2017] (TC): dos manos del tamaño de las del
  paciente, sin los pulgares, la de arriba con el meñique en el borde inferior de la clavícula, a lo largo de su eje (2016: «la mano
  queda oblicua»), y las puntas de los dedos en la línea media; la de abajo, justo debajo. BLUE superior: la inserción palmar de
  los dedos medio y anular (2011, 2016; «el centro de la mano» en 2014 y 2017, ≈ 1–1,5 cm de diferencia). BLUE inferior: el centro
  de la palma de la mano de abajo, cerca del pezón en el adulto (2016). Línea frénica: el borde inferior de la mano de abajo,
  «el fin del pulmón»; las dos manos juntas, desde la clavícula oblicua, la dejan horizontal (2011). Punto frénico: su cruce con la
  axilar media (2011, 2016). PLAPS: la horizontal del BLUE inferior, tan posterior como se pueda por detrás de la axilar posterior.
- **La mano del avatar**: el dedo medio, 83,8 ± 5,4 mm, y la palma, 110,5 ± 6,0, en 1003 varones [@greiner-mano-1991]; el ancho
  sin el pulgar, 86,3 ± 4,1 mm en los varones de ANSUR II con IMC 18,5–25 (n 1061, IMC 22,9) [@gordon-ansur-2014] [DERIVADO: de
  los datos públicos, `tools/anatomy/ansurSubgroup.ts`, que también rehace la profundidad del tórax de la decisión 28].
- **Dónde caen**: NO ENCONTRADO (ningún estudio mide en qué espacio intercostal caen los puntos BLUE); las fuentes secundarias, sin
  medida, se contradicen (el superior en el 2.º–3.er EIC de la medioclavicular; el inferior en el 4.º o el 5.º).
- **Una limitación de la regla** [@ding-frenico-2015] (solo el resumen): en 61 pacientes, el punto frénico de las manos difirió del
  localizado por ecografía (el protocolo M-BLUE) en el 47,5 % de los casos, y el de la ecografía concordó mejor con la TC: la línea
  frénica no siempre marca el fin del pulmón. Por eso vale la tarjeta del frénico en un simulador: el alumno ve dónde está el
  borde del pulmón bajo la línea, en lugar de suponerlo.

**Opciones.** Para los puntos: (a) seguir con los espacios supuestos; (b) la regla de las manos sobre el avatar; (c) los reparos
simplificados (Yuriditsky). Para el banco y las metas físicas, que medían en esos mismos puntos: (i) moverlos con los puntos
clínicos y recalibrar; (ii) separarlos en vistas de medida fijas, las de antes. Con (i), en el BLUE inferior nuevo F-T08 en la
pantalla falla (0,34 dB entonces; 1,0 hoy, abajo) y el mapa de grises del PLAPS nuevo se queda con 9 parches de pared de los 10 que pide.

**Decisión.** (b) y (ii), la elegida por el coordinador.

- **La regla** (`app/blueHands.ts`, `blueHandPoints`): la mano de arriba con su borde de arriba en la recta del borde inferior de
  la clavícula (que sube 15 mm en sus 156, `anatomy.clavicle`), alargada hasta la línea media; la de abajo, horizontal y en contacto
  con la de arriba en las puntas de los dedos [SUPUESTO: dónde se tocan]; las manos son rectángulos [SUPUESTO] y lo que se mide a lo
  largo de ellas, arco de la piel desde la línea media. Las manos, `anatomy.hands`.
- **Los puntos clínicos** (`START_POINTS`, `app.startPointPoses`): BLUE superior φ 0,6706π, z 122,3 mm; BLUE inferior φ 0,7955π,
  z 28,0; frénico en la axilar media, z −15,2; PLAPS 1,15π a la altura del inferior. Y sus simétricos izquierdos (φ → π − φ),
  también de los tres paravertebrales (decisión 33). Las tarjetas, agrupadas por hemitórax. Los rangos, con las manos a ± 1 DE en
  todas sus combinaciones: las esquinas se combinan como si el largo y el ancho fueran independientes, y no lo son (r = 0,58 entre
  el ancho y el largo de la mano en el subgrupo de ANSUR II), así que son más anchos que los de manos reales a ± 1 DE.
- **Las vistas de medida** (`app/measurementViews.ts`, `MEASUREMENT_VIEWS`, `app.measurementViews`): las poses de antes de la regla
  (el BLUE superior en el EIC2 de la medioclavicular, el inferior en el centro del EIC4 de la axilar anterior, el PLAPS a su
  altura), donde miden el banco de fidelidad, la calibración del contraste, F-T01, F-T08, el mapa de grises, el pulso pulmonar y
  las paridades de la GPU (`goToView` en los ganchos). Se conservan porque sobre ellas están medidas las decisiones 21, 24, 35 y 36.
- **La pose inicial** (`probe.blueUpperPose`, `defaultPose`): la app arranca sobre la tarjeta del BLUE superior derecho; la pose
  sale de la regla de las manos y la tarjeta la lee de ahí (una sola fuente). Lo que medía en la pose de antes pasa a la vista de
  medida del BLUE superior (`app.measurementViews.blueUpperPhi/Z`, el centro del EIC2 de la medioclavicular, decisión 16), no al
  punto clínico: A-T1–A-T3 y las comparaciones con la pared anterior, el foco del preajuste (decisión 12), la medioclavicular de
  los invariantes físicos y las vistas superiores de la compresión (decisión 63; en el BLUE superior clínico, junto a la cúpula,
  la cara interna de la pared varía 3,05 mm bajo la cara, sobre los 3 que pide esa prueba). El foco del preajuste (16 mm) se
  midió en la vista de medida (la pleura a 16,05 mm); en el BLUE superior clínico, donde arranca la app, la pleura está a 16,02:
  el mismo foco sirve. La prueba del costo por cuadro (`costo.spec.ts`) mide todo en la vista de medida (`goToMeasurementView`).
- **El borde de la sombra costal en el borde del sector** (`shadowEdgeLines`, `ribShadowStats`): el núcleo de una sombra son las
  líneas con hueso más lejos del borde de la sombra que su cono de apertura y su lóbulo. Una sombra que toca el borde del sector
  necesita saber si la costilla sigue más allá; antes se suponía que sí. Ahora no se supone nada: unas líneas virtuales más allá de
  cada borde (tantas como el cono más ancho y el lóbulo más el margen) se clasifican con la escena de la CPU, con el criterio de la
  pasada A (hueso en una fila por encima de la de la pleura), y el gancho devuelve cuáles cruzan hueso (`beyond`) y cuánto coincide
  esa clasificación con la de la pasada A dentro del sector (`cpuBoneAgreement`). Una primera versión de esta PR suponía lo contrario (fuera, sin
  hueso), lo que arreglaba una línea por 0,2 dB; el revisor lo marcó y se cambió por la medida. Medido (03-10-2026, apnea
  espiratoria, GPU real y SwiftShader, mismas cifras): la clasificación de la CPU coincide con la de la pasada A en 99,0–100 % de
  las líneas del sector (la e2e exige ≥ 98 %), y en las 41–42 líneas de cada borde en 97,6–100 % (una línea a lo sumo; en el BLUE inferior clínico, 100 %; la e2e exige ≥ 95 %); en el BLUE inferior clínico la costilla de la izquierda sigue tres líneas fuera del
  sector, así que la línea del borde no es núcleo (con la suposición de antes lo era y salía 8,1 dB sobre el negro). Unitarias con
  las dos mutaciones (suponer hueso fuera, suponer que no) atrapadas (`shadowEdge.test.ts`).

**Consecuencias.**

- **Dónde caen en la parrilla del modelo** (las pruebas lo fijan, con los bordes de las costillas, de 14 mm de alto): el superior a
  82 mm de la línea media, en el **EIC1** (la 1.ª costilla a 147,8 mm y la 2.ª a 99,3 en esa vertical; el punto, 23 mm sobre la
  2.ª), [DISCREPANCIA] con las fuentes secundarias (2.º–3.er EIC). La causa: en el modelo la 2.ª costilla baja 19 mm desde junto al
  esternón hasta la medioclavicular (118,5 mm a 30 mm de la línea media, 110,6 en la paraesternal, 99,7 en la medioclavicular),
  mientras el borde de la clavícula sube y la mano sigue su recta. Esa caída no tiene fuente propia: sale de anclar la 5.ª
  costilla de la medioclavicular en la línea de Treves (Gray) y apilar hacia arriba los espacios de esa línea (EIC4 y 3 de 14 mm,
  EIC2 de 18; el EIC1 de 36, un supuesto), mientras la paraesternal sube con su Hermite al esternón y anchos de espacio en parte
  supuestos (decisión 16). **Tarea pendiente**: buscar una fuente del recorrido de la 2.ª costilla de la paraesternal a la
  medioclavicular (o del ancho del EIC1 en la medioclavicular) y, si la hay, recalibrar la parrilla; no se toca aquí.
- El **inferior** queda **sobre el borde craneal de la 5.ª costilla**, no en el EIC4: la línea media de la costilla a 22,8 mm y su
  borde de arriba a 29,8, el punto en 28,0 (con +1 DE de mano, bajo la línea media). La regla lo pone ahí y ahí se queda; la sonda
  convexa abarca dos espacios, así que bajo ella quedan la costilla y los espacios de cada lado, y la tarjeta sirve igual (la
  prueba del signo del murciélago lo comprueba). La línea frénica, en el EIC7 de la axilar media, 19 mm sobre el borde del pulmón
  en espiración.
- **Bajo la sonda** (unitarias, en los dos lados): la pleura bajo todas las líneas apoyadas y el signo del murciélago en los BLUE,
  el PLAPS y los paravertebrales; en el frénico, el pulmón en el lado craneal y su borde, sobre el diafragma, en el caudal; el pulso
  pulmonar solo en el BLUE inferior izquierdo (junto al corazón: lo que la regla dice que hay que esquivar). F-T08 (geometría) en
  todos los puntos y en las vistas de medida. La equivalencia TS ↔ GLSL de la pleura en la e2e, en los 14 puntos clínicos y los
  tres planos de siempre.
- **Pendiente físico: F-T08 en el BLUE inferior clínico** (`rib-core-leak-center`). Allí, en el núcleo
  de la sombra central, la línea pleural sale en la pantalla hasta 1,03 dB sobre el negro de 8 bits con la GPU real y 1,01 con
  SwiftShader (la línea 84; seis líneas sobre 0,3 dB): un gris de 0–1, no el negro que pide F-T08. Antes del rebase sobre main
  `4f2473e` la medida daba 0,34 dB (la línea 78). En las vistas de medida se cumple (la peor, 0,8 dB bajo el negro). Lo vigila una
  e2e que exige que la meta aún falle en el núcleo de la sombra central; cuando se cumpla, falla y la pose pasa a la prueba de
  F-T08.
- **El banco y la calibración**: miden en las vistas de medida, las mismas poses de las decisiones 21–36, pero el cambio del borde
  de la sombra también vale ahí. Medido: con las líneas virtuales, el núcleo de F-T08 en las tres vistas es el
  mismo que con la suposición de antes (27, 23 y 37 líneas en el BLUE superior, el inferior y el PLAPS, GPU real y SwiftShader);
  con la primera versión (sin hueso fuera) el BLUE inferior bajaba a 22 (el revisor contó 33 → 32 en el BLUE superior y 38 → 36
  en el inferior con otro recuento; con la medida, ninguna vista cambia). El registro del ajuste C3b-A (`normal-calibration-c3b-a.json`, decisión 24)
  guarda los `coreLines` de su corrida y no se reescribe: es el registro de esa decisión.
- **La pared sobre la cúpula** (`wall-cupola-transition`): con el BLUE superior nuevo el borde craneal del sector llega a z ≈ 177,
  donde la construcción de la decisión 27 rellena la pared hasta el medio del tronco y, junto al techo de la cúpula, la pared
  engruesa ≈ 16 mm por mm en z (≈ 14 a lo largo de la piel; hasta ≈ 100 en la inspiración profunda). No es anatomía y el alumno
  lo ve en la imagen. **Tarea pendiente de anatomía** (hoja de ruta, fase 3): la transición de la pared sobre la 1.ª costilla y la
  fosa supraclavicular. No se arregla aquí.
- **La equivalencia TS ↔ GLSL de la distancia de las caras** (`shellDistanceTolerance`, `shellGradNorm`): ahí SwiftShader se
  aparta de la CPU |∇d|·δx (Δd hasta 0,025 mm en espiración y 0,11 en la inspiración profunda; la GPU real, ≤ 0,0067), con
  δx = 0,00101 y 0,00114 mm medidos (el mayor |Δd|/|∇d| de los puntos fuera de la tolerancia fija). La tolerancia pasa a
  max(0,02 mm, δx·|∇d|) con δx = 0,0015 mm: la fija manda hasta |∇d| ≈ 13, así que fuera de la cúpula la prueba es tan exigente
  como antes. |∇d| sale de la CPU por diferencias de un solo lado (la menor de las dos en cada eje): una diferencia central que
  cruzara un salto de la pared daría un gradiente enorme y dejaría pasar cualquier error (la primera versión dejaba pasar 0,11
  mm con |∇d| ≈ 10⁴). Pruebas con campos sintéticos de oráculo analítico: una cara lineal d = 30·z da |∇d| = 30, y con él pasa
  un error de 0,9·δx·30 y no uno de 1,1·δx·30 (los dos por encima de la tolerancia fija); junto a un salto de la cara, |∇d| ≈ 1
  y 0,05 mm no pasan; si la cara cambia a los dos lados, la fija. Atrapan cuatro mutaciones: sin el escalado, el lado más
  empinado (o la diferencia central), sin la raíz y 0,02·|∇d|. Una cota unitaria tiene δx entre lo medido y 0,002 mm. En la
  cáscara real, 0,05 mm en una cara plana siguen fallando (más del doble de la tolerancia). Antes de medirlo se descartó el redondeo de la curva de la cúpula (1 − h sin restar: nada
  cambia) y las texturas de 16 bits (la escena es de 32 y se lee con `texelFetch`).
- La cobertura no cambia (no depende de los puntos de partida).

**Verificación.** `startPoints.test.ts`: los catorce puntos, su simetría (los cuatro de la regla), la reconstrucción de la regla
con las manos a ± 1 DE, dónde caen con los bordes de las costillas, la regla contra la clavícula de la escena (`clavicleSd`, sin la
fórmula de `blueHands.ts`), la pose por omisión igual a la tarjeta, la pleura, el murciélago y el frénico en los dos lados.
`shadowEdge.test.ts` con dos mutaciones; `equivalenceSweep.test.ts` con la de la tolerancia; `frameCost.test.ts` en la vista de
medida; `probe.test.ts`, `anatomyTargets.test.ts`, `lungPreset.test.ts`, `compression.test.ts` y `physicsInvariants.test.ts`
en la vista de medida. `tools/anatomy/ansurSubgroup.ts` rehace las cifras de ANSUR II. Medidas de la e2e con la GPU real y con
SwiftShader (el borde de la sombra, F-T08 en el BLUE inferior clínico, la cáscara). `npm run check`, la e2e con SwiftShader y el
CI de la PR. Revisión adversarial de contexto limpio (I1–I4 y M1–M5, resueltos; resumen en la PR).

## 43. El estómago, los riñones y el bazo normal: las bases de la cobertura, y el costo de las caras de los órganos

**Fecha.** 2026-10-03.

**Contexto.** Tras la decisión 37 la cobertura de exploración estaba en 127 de 138 celdas. Las 11 que faltaban eran todas bajo el
borde del pulmón, donde la base pone un órgano que el modelo no tenía: el estómago del espacio de Traube (la LMC izquierda en los EIC
6–8, la LAA en los 7–9 y el EIC8 de la LAM), el riñón de Morris (la escapular en el EIC11 de los dos lados y la paravertebral izquierda
en el 11) y el polo posterior del bazo (la escapular izquierda en el EIC10). Es el requisito de cobertura de `docs/MISSION.md` (100 %
en la v0.2.0) y O2 (fidelidad anatómica). Además, con la decisión 37 el arranque con SwiftShader (el CI) y el costo de su cuadro
subieron un 30–45 % incluso en vistas sin órganos: había que atacarlo antes de sumar órganos (O6). Tras la primera versión, Daniel
pidió el bazo de tamaño y forma normales (aquella estiraba el medio elipsoide de Gray a 15,7 cm por su eje y le sumaba un cono hasta
T9: una esplenomegalia), en el sitio de la TC cuando las marcas de superficie de Gray chocan con él, aunque la cobertura pierda la
celda del polo, y el riñón también normal, con fuente.

**Fuentes verificadas** (texto completo salvo donde se dice «resumen»; búsqueda del 03-10-2026):

- **Gray 1918, «Surface Markings of the Abdomen»** [@gray-anatomia-1918]. Estómago (moderadamente lleno, en supino): en la línea
  lateral izquierda el fondo llega al 5.º espacio intercostal o al 6.º cartílago; el cardias, frente al 7.º cartílago izquierdo a
  2,5 cm del esternón (T10); el píloro, en el plano transpilórico 1 cm a la derecha (L1); la parte en contacto con la pared, un
  triángulo de vértice en el extremo del 8.º cartílago izquierdo y base del 10.º izquierdo al 9.º derecho; el espacio de Traube,
  entre el borde inferior del pulmón izquierdo, el borde anterior del bazo, el reborde costal y el lóbulo izquierdo del hígado.
  Riñones: el paralelogramo de Morris (de 2,5 a 9,5 cm de la línea media, desde la punta de la espinosa de T11); el derecho, 1 cm
  más bajo. Bazo: el punto más alto a 4 cm de la línea media de la espalda a la altura de la punta de la espinosa de T9.
- **Gray 1918, «The Kidneys»**: sus extremos superiores, al borde superior de T12; 11,25 cm de largo, 5–7,5 de ancho y algo más de
  2,5 de grueso; el eje largo hacia abajo y afuera; la cara posterior, envuelta en tejido graso, apoya en el diafragma, los arcos
  lumbocostales, el psoas y el cuadrado lumbar, el derecho sobre la 12.ª costilla y el izquierdo sobre la 11.ª y la 12.ª.
  **«The Spleen»**: unos 200 g, 12 × 7 × 3–4 cm; su cara diafragmática, convexa y lisa, contra el diafragma, que la separa de las
  costillas 9.ª–11.ª y del borde inferior del pulmón y la pleura; la visceral, partida por una cresta en una parte gástrica ancha y
  cóncava, con el hilio, y una renal más estrecha y plana; el borde posterior, en el borde inferior de la 11.ª costilla.
- **Chow y cols. 2016** [@chow-bazo-2016] (ecografía, 1230 adultos sanos; sus tablas por talla y sexo, recogidas en la revisión de
  **Lucius y cols. 2025** [@lucius-bazo-2025]): para el varón de 175–179 cm, el largo 11,0 cm (percentiles 5–95: 8,6–13,4), el
  ancho 6,5 (4,1–8,9) y la profundidad del hilio a la cara convexa 4,5 (3,2–6,7); el volumen del bazo normal, 86–318 mL. Lucius y
  cols.: el bazo normal típico, 11 × 7 × 4 cm y 160 mL; más de 12–13 cm, esplenomegalia. **Caglar y cols. 2014**
  [@caglar-bazo-2014] (TC, 212 adultos): el grueso, 4,58 ± 0,8 cm.
- **Mirjalili y cols. 2012** [@mirjalili-abdomen-2012] (resumen; TC en supino de 108 adultos al final de una inspiración
  tranquila) y **Shen y cols. 2016** [@shen-superficie-2016] (texto completo; TC de 100 adultos): el bazo, entre la 10.ª y la 12.ª
  costilla en el 48 y el 47 % (Shen: entre la 9.ª y la 12.ª en el 24 %, entre la 9.ª y la 11.ª en el 17 %), con el eje largo a lo
  largo de la 11.ª en el 55 y el 60 % (la 10.ª, en el 34 %); Shen: por delante de la línea axilar media en el 85 %, 26,6 ± 23,3 mm.
- **Riñón normal**: **Bhardwaj y cols. 2024** [@bhardwaj-rinon-2024] (ecografía; 600 voluntarios, 511 sanos analizados): el grueso, 4,26 ± 0,61 cm el
  derecho y 4,28 ± 0,57 el izquierdo; **Kang y cols. 2007** [@kang-rinon-2007] (resumen; 125 riñones de donante): el ancho, 6,25 ±
  0,67 cm, y el grueso, 4,73 ± 0,65; **Alyami y cols. 2024** [@alyami-rinon-2024] (ecografía, 95 adultos): el grueso, 4,10 cm.
- **Fidler y cols. 2009** [@fidler-estomago-2009] (RM en supino, 20 voluntarios en ayunas): el volumen gástrico en ayunas, 167 ± 10
  mL (media ± EEM), de los que la pared ocupa 118 ± 5; el aire, 21 ± 3 y 25 ± 5 mL.
- **Henry y cols. 2007** [@henry-estomago-2007] (TC de 33 adultos): el volumen gástrico, 143 ± 97 cm³ con IMC normal (el proximal,
  78 ± 54); la pared, 3,61 ± 0,51 mm.
- **Xue y cols. 2017** [@xue-rinon-2017] (angio-TC, 167 donantes): la profundidad renal, la media de las distancias de la piel de la
  espalda a las caras anterior y posterior a la altura del hilio, 6,82 ± 0,95 cm la izquierda y 7,03 ± 0,99 la derecha.
- **Glodny y cols. 2009** [@glodny-rinon-2009] (TC de 64 cortes, 1040 adultos): el largo, 108,5 ± 12,2 mm el derecho y 111,3 ± 12,6
  el izquierdo; el giro sagital (polo superior frente al inferior respecto del plano coronal), 25,8 ± 11,1° y 24,3°; la pelvis renal
  frente al plano sagital medio, 60,3 ± 18,1° y 53,5 ± 22,5°. **Kinnunen 1986** [@kinnunen-urografia-1986] (resumen): en supino el
  eje largo forma 16 ± 5,8° con la mesa, con el polo inferior delante (el sentido del giro). **Choi y cols. 2010**
  [@choi-eje-renal-2010] (radiografías AP, 754): el eje polo–polo, 16,8° (6,8–28,1) con la línea de las espinosas lumbares.
- **Sommer y Taylor 1980** [@sommer-sombra-1980] y **Rubin y cols. 1991** [@rubin-sombra-1991] (resúmenes): el gas da una sombra
  «sucia», con reverberaciones, frente a la limpia del cálculo; cuánto, depende de la superficie.
- NO ENCONTRADO: el tamaño de la burbuja del fondo y las medidas del fondo en ayunas; el grosor de la grasa pararrenal posterior junto
  al polo superior del riñón; lo que se hunde la parte gástrica del bazo y el perfil de sus bordes.

**Opciones.** Costo: (a) dejarlo; (b) quitar las caras de las cápsulas; (c) compilar la distancia de cada cara una sola vez. Riñón:
(i) portar el de VExUS con su sitio de VExUS; (ii) portarlo con el sitio de la base. Detrás del riñón: (α) pegarlo al diafragma
(contra Xue: 61 mm en vez de 68–70, porque la pared posterior del modelo no tiene el cuadrado lumbar ni el erector grueso); (β)
portar también el retroperitoneo de VExUS (psoas, cuadrado lumbar y grasa), su lecho. Estómago: un medio elipsoide como el bazo,
con o sin gas. Bazo (tras el pedido de Daniel): (A) seguir las marcas de Gray (el polo posterior en T9 a 4 cm de la línea media y
el punto más bajo en la axilar media en L1, que en el avatar distan ≈ 16 cm: un bazo grande); (B) el tamaño normal de Chow con el
sitio de la TC, y dejar pendientes las celdas que no alcance.

**Decisión.** (c), (ii) con (β), el estómago con su gas y el bazo (B).

- **El costo** (`faceGradient` en `anatomy.glsl.ts`): las seis diferencias centrales de cada cara se evalúan en un bucle sobre
  `faceSdAt(sel, …)`, así que cada distancia (la cúpula, la ZOA, `organSurfaceSd`, la capa de la pared, la costilla y ahora el
  contorno del riñón) se compila una vez y no seis; SwiftShader lo inlinea todo y el tamaño del código era la causa. Las caras de
  las cápsulas se quedan.
- **Los riñones** (`organs/kidney.ts`, portado de VExUS c6c81ad): su forma (contorno en judía, seno, pirámides, pelvis, cápsula y
  grasa perirrenal) con el sitio de la base (`anatomy.kidney`): el punto más alto en la punta de la espinosa de T11, el derecho 1 cm
  más bajo, el centro a 6 cm de la línea media (entre las verticales de Morris) y a la profundidad de Xue bajo la piel de la espalda;
  los ejes, de Glodny (el giro sagital y el del hilio) y Choi (el coronal). Se clasifican antes que el hígado: su grasa marca la
  impresión renal del hígado y del bazo (la de VExUS, `perirenalDistance` con 1 mm de solape), que sustituye el recorte de Morris de
  la decisión 37, y detrás de ellos no va ningún órgano de la cavidad (`kidneyShadow`, Gray: su cara posterior apoya en el
  diafragma y los músculos): lo que, llevado hacia delante hasta el plano de su borde (el diametral del elipsoide de su grasa
  conjugado de y, `kidneyShadowPlane`), cae en su grasa real; al lado de su borde lateral el bazo y el hígado sí pueden ir (Gray:
  el borde posterior del bazo, entre el diafragma y el riñón izquierdo); sin la sombra, el lóbulo derecho de VExUS quedaba
  detrás del riñón derecho (13 mL, lo halló la revisión). La cápsula dibuja su cara (`Interface.RenalCapsule`) por los dos lados; la mitad externa de la grasa gruesa se funde
  sin la cara de Morison de VExUS (la dibuja la cápsula del hígado o del bazo).
- **El retroperitoneo** (`organs/retroperitoneum.ts`, portado de VExUS): el psoas, el cuadrado lumbar y la grasa detrás del
  peritoneo parietal posterior, en el «resto»; su marco, anclado a lus-sim (la unión T12–L1, el paso lumbar de VExUS, las y desde
  la espalda y el borde anterior a la distancia de VExUS de los centros de los riñones); por encima de los riñones su grasa queda en
  la gotera paravertebral (`RETRO_TOP` [ESTIMADO]: en VExUS no tenía tope; aquí llegaba al diafragma alrededor del bazo). En el
  EIC11, entre el diafragma y la grasa del riñón queda la grasa pararrenal posterior: 11 mm en la escapular izquierda, 15 en la
  derecha y 3 en la paravertebral (su grosor, NO ENCONTRADO).
- **El estómago** (`organs/stomach.ts`, propio): medio elipsoide en las coordenadas de la pared, como el bazo, con el contorno de
  Traube (del extremo del 8.º cartílago al centro del bazo, y del 5.º espacio en la LMC al reborde costal en su centro) y el grueso que
  da el volumen de Fidler (15,4 mm en el paciente por omisión; 14,9–18,9 en los seis hábitos). Su pared, de 3,61 mm (Henry), con el tejido del «resto» (no hay tejido libre: los 32 llenan las
  tablas); su luz, líquido, con el gas de Fidler (23 mL) arriba, sobre un nivel horizontal de supino (`gasY`). La firma del gas no se
  pinta: la pasada A encuentra el primer gas de cada línea y la B forma detrás las reverberaciones y la cola sucia del gas que no es
  pulmón (la física de VExUS, decisión 20).
- **El bazo normal** (`organs/spleen.ts`, `anatomy.spleen`). Tamaño, el de Chow y cols. para el varón de 175–179 cm: 11 × 6,5 ×
  4 cm (el grueso, el de Gray y Lucius y cols.). Forma (Gray): una lámina de su grueso en las coordenadas de la pared, con la
  huella de una elipse de su largo y su ancho y los bordes redondeados (`borderRoundMm`, 20 mm [SUPUESTO]); su cara diafragmática
  es la del diafragma, convexa y lisa; la visceral, paralela a ella y cóncava vista desde dentro, con la parte gástrica (la mitad
  de arriba, la del borde anterior) hundida 10 mm por una esfera de 50 mm (`gastricImpression…` [SUPUESTO]; el hilio va en ella) y
  la renal recortada por la grasa y la sombra del riñón izquierdo (`renalImpression`); sus polos, los extremos de la elipse. Sitio,
  el de la TC: el eje largo con la pendiente de la 11.ª costilla en su centro, el centro en ella, y tan adelante como lo deja el
  reborde costal (`buildSpleen`, `spleenBelowMarginMm`: el borde inferior de la 10.ª por delante de la punta libre de la 11.ª, la
  línea entre las puntas de la 11.ª y la 12.ª y luego la 12.ª), porque el bazo normal queda dentro de la parrilla (Gray: tras las
  costillas 9.ª–11.ª, con su borde posterior en la 11.ª). El primer intento ponía su extremo anterior en los 26,6 mm de Shen por
  delante de la LAM: con la punta libre de la 11.ª a 20 mm por delante de la LAM en el avatar, 41 mL pasaban hasta 46 mm bajo el
  reborde (un bazo que se palpa). Con el reborde, su extremo anterior queda 12–17 mm por delante de la línea axilar media de Shen
  en los seis hábitos (11,9–16,6; los obesos, 15,6 y 16,6) (su definición, a medio camino del ángulo xifoesternal a la cara posterior de la columna, cae en el avatar
  a ≈ 1 mm de la línea de la piel), dentro de ± 1 DE de Shen, y su borde posterior llega a la 12.ª, la banda más frecuente de la TC. No pasa de 45 mm bajo
  la pared (`SPLEEN_MAX_INSIDE_MM`, el grueso más 5): su profundidad bajo el diafragma es la altura bajo la cúpula, que lejos de la
  pared crece sin el grueso del órgano.
- **Las marcas de Gray que el bazo normal no cumple** [DISCREPANCIA]: manda la morfometría normal con el sitio de la TC. El punto
  más alto a 4 cm de la línea media de la espalda en T9 (z −11,7) queda a 10 cm de la línea media y en z −54,5 (su punto más
  medial, a 8 cm; `notYetMet`); el
  más bajo en la axilar media a la altura de L1 (z ≈ −76 en el avatar, sobre la 10.ª costilla) queda en la 11.ª–12.ª (z −140); el
  eje, que Gray pone en la 10.ª costilla, va en la 11.ª (la TC, en la mayoría). Entre las dos primeras marcas hay ≈ 16 cm en el
  avatar: no caben en un bazo de 11 cm.
- **El bazo sin grietas** (segunda revisión): la impresión renal partía el bazo en 15 de sus 177 columnas radiales en el paciente
  por omisión (8,5 %; rendijas del «resto» de 0,25–1,25 mm y, en el obeso, grasa retroperitoneal de 4–8 mm entre dos tramos), y
  lo mismo al hígado (9 columnas en el paciente por omisión con la rejilla de la prueba). Dos causas: lejos del riñón, la distancia a su grasa era la de su esfera (la de VExUS), que salta
  (de 29 a 3 mm junto al bazo); y la sombra lo cortaba con el plano coronal de su centro, limitada por la silueta del elipsoide de
  la grasa más gruesa, que pasa de la grasa real del borde lateral. Ahora la distancia lejana sale del elipsoide de la grasa (`perirenalFar`) y la
  de su forma se funde con ella en el margen de 2 mm de la esfera (`perirenalBlend`, continua), la sombra es la de arriba (la grasa real delante) y la grasa y la
  sombra se unen con un mínimo suave de 4 mm (`RENAL_UNION_ROUND_MM` [SUPUESTO]: con `min`, que no es monótona junto a la pared
  lateral de la sombra, quedaban islas de < 2 mm en el borde con la grasa; en un barrido de 13 direcciones en el paciente por
  omisión, de 11 a 0 en el bazo y de 107 a 18 en el hígado): ninguna
  columna partida en los seis hábitos (`liverSpleen.test.ts`, cada 0,25 mm, que falla con el código anterior), y en el hígado
  ninguna grieta donde actúa la impresión (quedan, y no lo son, la grasa del polo superior, la vértebra y el recorte posteromedial
  de VExUS, lejos del riñón). En la escapular derecha en el EIC11 la cobertura ve ahora el lóbulo derecho, que rodea por fuera el
  polo superior del riñón (antes la sombra ancha lo quitaba y veía el riñón): sigue cumplida.
- **La cara diafragmática sin diafragma** [DISCREPANCIA]: Gray pone el diafragma entre el bazo y las costillas 9.ª–11.ª, pero la
  lámina de la ZOA acaba `zoaBelowReflectionMm` (20 mm [SUPUESTO], decisión 22) bajo la reflexión pleural, por encima del reborde
  al que baja el bazo normal: en el 27–34 % de sus columnas (58 de 177 en el paciente por omisión) el bazo apoya en la grasa de la
  cara interna de la pared y no en el diafragma (`notYetMet`). Llevar la inserción costal del diafragma al reborde (Gray: su parte
  costal nace de la cara interna de los seis últimos cartílagos y costillas) cambia la ZOA de los dos lados y su meta A-T15: queda
  para una decisión propia.
- **El costo de la impresión renal**: la sombra evalúa la grasa del riñón solo cerca del plano de su borde (a menos de
  `KIDNEY_SHADOW_SKIP_MM`, 10 mm, por delante de él o por detrás del fondo; más lejos, la cota de y, que no cambia lo que se
  clasifica), y la impresión no se calcula cuando el único órgano cercano es el estómago. Medido abajo.
- **Uniforms**: con `uSeriesParts` de la decisión 38 la pasada B estaba en 126 (128 en su programa dirigido); el estómago suma
  `uStomach`, y lo demás va en las ranuras libres (`uLiverS.zw`: sus mm por unidad de arco y el nivel del gas; `uLiverTip.w`: su
  grueso); el bazo normal usa los mismos `uSpleen` y `uSpleenR` que el de la decisión 37 (la primera versión sumaba `uSpleenPole`
  para el cono); la y de los riñones sale de `uTorso`. 127 y 129, bajo el tope de 130 (`shaderLimits.test.ts`).
- **La cobertura** (`app/coverage.ts`): cuentan el riñón con su grasa (a los dos lados) y el estómago (a la izquierda;
  `AnatomyScene.inStomach`, porque su pared es el tejido del «resto»); el medidor cruza la grasa retroperitoneal solo si detrás está
  el riñón (la pararrenal posterior, como la grasa de la pared); delante de otra cosa, la grasa es lo que hay.

**Consecuencias: antes → después** (main `4f2473e` frente a esta decisión).

| Medida                                               | Antes                                                             | Después                                                                                                                                           | Fuente o meta                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Cobertura (anterior / lateral / posterior / vértice) | 127/138 (25/28, 56/60, 40/44, 6/6)                                | **136/138** (28/28, 59/60, 43/44, 6/6)                                                                                                            | requisito de cobertura, 100 % en la v0.2.0        |
| Las 11 celdas de la tarea                            | 0 de 11                                                           | 10 de 11 (7 estómago; 2 riñón y, en la escapular derecha, el hígado que rodea el polo superior del riñón; el polo posterior del bazo de Gray, no) |                                                   |
| La paravertebral derecha en el EIC11                 | el hígado (detrás del riñón)                                      | el riñón                                                                                                                                          | Gray: el riñón apoya en el diafragma              |
| La LAP izquierda en el EIC9                          | cumplida (el bazo de la decisión 37, sobre la 10.ª costilla)      | pendiente: el bazo normal empieza más abajo                                                                                                       | Shen: desde la 9.ª costilla en el 41 %            |
| Estómago: volumen / gas / pared                      | —                                                                 | 158 mL / 18 mL / ≈ 3,6 mm                                                                                                                         | Fidler 167 ± 45, 21–25; Henry 3,61 ± 0,51         |
| Riñones: largo / giro sagital / profundidad          | —                                                                 | 10,7 cm / 25,8° y 24,3° / 70,4 y 68,1 mm                                                                                                          | Glodny 10,9–11,1; Glodny; Xue 70,3 y 68,2         |
| Riñones: punto más alto / \|x\|                      | —                                                                 | punta de T11 (el derecho, 1 cm más abajo) / 32–88 mm                                                                                              | Gray, Morris (25–95)                              |
| Riñones: ancho / grueso                              | —                                                                 | 5,4 / 4,6 cm (los de VExUS)                                                                                                                       | Glodny 5,1–5,3, Kang 6,25; Bhardwaj 4,3, Kang 4,7 |
| Bazo: volumen                                        | 134 mL                                                            | **161 mL** (152–164 en los seis hábitos)                                                                                                          | Lucius 160, Gray ≈ 184; Chow 86–318 (P5–P95)      |
| Bazo: largo × ancho × grueso (ejes principales)      | 11,6 cm de largo                                                  | 10,7 × 6,9 × 4,6 cm                                                                                                                               | Chow 11,0 × 6,5 × 4,5 (medianas)                  |
| Bazo: sitio                                          | sobre la 10.ª; el punto más alto a 11 cm de la línea media, z −28 | el eje en la 11.ª, dentro del reborde, 12–17 mm por delante de la LAM de Shen; de z −56 a −140                                                    | Mirjalili, Shen (26,6 ± 23,3 mm)                  |
| Ranuras de uniforms de la pasada B (y su dirigido)   | 126 (128)                                                         | 127 (129)                                                                                                                                         | ≤ 130                                             |
| Bazo: columnas radiales partidas (seis hábitos)      | —                                                                 | 0 (la primera versión del bazo normal: 15 de 177 en el paciente por omisión)                                                                      | un órgano entero                                  |
| Bazo: cara diafragmática contra el diafragma         | —                                                                 | 66–73 % (el resto, contra la grasa de la pared)                                                                                                   | Gray: toda                                        |
| Chunk de entrada / total de JS                       | 269,8 / 823,6 kB                                                  | 299,6 / 854,4 kB (con la 42)                                                                                                                      | presupuestos: 300 / 860                           |

- **Costo con SwiftShader** (el CI; `boot2.mjs`, la primera página de un navegador nuevo: el arranque es la compilación de los
  programas, y el costo por cuadro, 4 cuadros con `frameCostMs`; tres vueltas alternando los árboles, carga 28 / 7 / 5). Antes de la
  decisión 37 (`92aeade`) / main (`4f2473e`) / esta decisión:

  | Medida                                      | Antes de la 37      | Main               | Esta decisión      |
  | ------------------------------------------- | ------------------- | ------------------ | ------------------ |
  | Arranque (s)                                | 112,5 / 44,1 / 30,4 | 73,6 / 42,4 / 43,4 | 58,0 / 36,1 / 31,1 |
  | Cuadro en el BLUE superior (ms)             | 682 / 453 / 422     | 801 / 557 / 516    | 541 / 413 / 295    |
  | Cuadro en el espacio de Traube (ms)         | 525 / 436 / 389     | 674 / 468 / 511    | 525 / 402 / 303    |
  | Cuadro en la base izquierda (LAP EIC10, ms) | 512 / 463 / 415     | 701 / 475 / 490    | 571 / 405 / 307    |

  Medido con la primera versión del bazo (con el cono del polo: algo más de código que el bazo normal). El bucle de `faceGradient` devuelve el arranque y el cuadro a lo de antes de la decisión 37 o por debajo, con el estómago, los
  riñones y el retroperitoneo dentro: en la medición sin órganos nuevos (03-10-2026, carga 4–17) el bucle solo daba 31–35 s y
  408–488 ms frente a 39–65 s y 388–681 de main. Con la GPU real no se midió.

  Remedido con la versión final (el bazo normal, la impresión renal con su atajo y la sombra acotada), frente a main `532d3bc`,
  tres vueltas de dos arranques alternando los árboles (03-10-2026, carga 4–10): arranque 78–110 s (mediana 78,5) frente a
  65–112 (mediana ≈ 80); cuadro en el BLUE superior 386–669 ms frente a 603–2516, en el espacio de Traube 445–927 frente a
  575–1196 y en la base izquierda 453–599 frente a 543–964. La rama no cuesta más que main en ninguna medida; los absolutos
  de esta tanda son más altos que los de la tabla por la carga del equipo, no por el código.

- **Las celdas pendientes** [DISCREPANCIA], con su motivo, sin deformar el bazo para cubrirlas: la escapular izquierda en el EIC10
  (Gray pone ahí el polo posterior del bazo; lo que hay es la grasa retroperitoneal bajo el diafragma) y la axilar posterior
  izquierda en el EIC9 (la cumplía el bazo de la decisión 37, sobre la 10.ª costilla; Shen y cols. ponen el bazo desde la 9.ª en 4
  de cada 10 adultos, y el del modelo, en la banda más frecuente, empieza más abajo; queda el «resto»). La axilar posterior
  izquierda en el EIC11, que la primera versión perdía (el borde de su bazo grande quedaba en la banda de Gray y ahí la base pone el
  ángulo esplénico del colon), la cubre el bazo normal, con su borde posterior en la 12.ª.
- **La firma del gas** (`app/gasBench.ts`, gancho `stomachGas`, e2e): en la LMC izquierda en el EIC7, el gas a 21,8 mm (170 líneas);
  detrás, a 10–40 mm, el nivel mostrado es −59,2 dB, y −53,8 con la mutación del estómago lleno de líquido (la pared de detrás y el
  «resto» que el gas tapa): una sombra 5,4 dB más oscura; la primera reverberación (a 2 veces la profundidad del gas) queda 1,9 dB
  sobre el valle (a 1,5 veces), y sin el gas 2,6 dB bajo él (SwiftShader). Emerge de la física: la mutación lo quita. Lo que no
  está: el eco de la propia cara del gas (k = 1), que la pasada B del gas que no es pulmón no dibuja (la pleura sí, `pleuraEcho`);
  queda con `test.fail` en la e2e y en `stomach-traube-lens`. Con el preajuste pulmonar, el «resto» que el gas tapa ya está cerca
  del negro: la firma es tenue
- **El riñón y la cara de Morison**: sin ella, el receso de Morison lo dibuja la cápsula del hígado.
- **El tamaño del riñón** (`anatomy.kidney`: `lengthMm`, `widthMm`, `thicknessMm`, con fuente): el de VExUS (10,8 × 5,4 × 4,6 cm)
  es el de un adulto normal de hoy: el largo, el de Glodny y cols.; el ancho, entre el de Glodny en el corte axial (5,1–5,3) y el
  de Kang y cols. (6,25); el grueso, el de Kang y cols. (4,73 ± 0,65 cm), cerca de Bhardwaj y cols. (4,3) y Alyami y cols. (4,1).
  [DISCREPANCIA] con Gray: su «algo más de 2,5 cm» de grueso queda bajo todas las medidas de hoy; manda la morfometría. Se porta tal cual (sus pirámides y su seno van con él).
- **El campo respiratorio** no cambia: el estómago y los riñones se clasifican en el marco material; `respiratoryField.test.ts`
  comprueba la invertibilidad también en ellos.
- Limitaciones: `abdomen-generic-tissue` (lo que queda: la vesícula, el colon, el páncreas, las suprarrenales, los vasos) y
  `liver-spleen-simplified` actualizadas; nuevas `stomach-traube-lens` y `kidney-retroperitoneum-port`.

**Verificación.** `npm run check`; `stomachKidney.test.ts` (el estómago: volumen y gas de Fidler, gas sobre su nivel, pared de Henry,
nada en la línea media; los riñones: el punto más alto de Gray, las verticales de Morris, la profundidad de Xue, el largo y el giro
de Glodny, la grasa detrás, el ancho y el grueso; las ventanas de la firma del gas, sintéticas), `liverSpleen.test.ts` (el bazo normal: su largo,
su ancho y su grueso radial y su volumen en lo normal, con mutaciones del largo y el grueso; un solo tramo de bazo en cada
columna radial en los seis hábitos, y ninguna grieta del hígado donde actúa la impresión renal, que fallan con la impresión
anterior; su extremo anterior frente a la línea de Shen en los seis hábitos; el reborde costal de la construcción frente a las
costillas que se clasifican, y el bazo dentro de él, que muerde el sitio del primer intento; la cara diafragmática: con diafragma
o con la grasa de la pared, nunca con el «resto», y entera contra el diafragma `notYetMet`; la parte gástrica hundida; el punto
más alto de Gray, `notYetMet`; el riñón fuera del hígado), `stomachKidney.test.ts` (también: detrás del riñón, en una rejilla y en
los seis hábitos, ni hígado ni bazo, que falla sin la sombra; la distancia a la grasa perirrenal, continua al salir de su esfera,
que falla con la cota de la esfera), `coverage.test.ts` (136/138, el estómago, el riñón y el bazo por celda, cada órgano en su
lado, las dos pendientes con su motivo), `organPrefilter.test.ts` (el
prefiltro del estómago y el bazo frente a la cuenta completa, con la impresión renal), `respiratoryField.test.ts`, `anatomy.test.ts`,
`organs.test.ts`, `shaderLimits.test.ts`. En la e2e: la equivalencia TS ↔ GLSL con los planos nuevos (`traube`, `leftScapularBase`,
`leftKidney`), los tejidos nuevos en el volumen y la cápsula renal en `capsules`; la firma del gas con su mutación. La mutación «sin
la sombra del riñón» deja hígado detrás del riñón derecho y la prueba lo ve. Revisión adversarial de contexto limpio (ejecutando):
tres bloqueantes, el hígado detrás del riñón derecho (13 mL; la celda de la paravertebral derecha la cumplía el hígado) y la prueba
que lo vigilaba debilitada (ahora la sombra del riñón y una prueba que la muerde), el medidor de la cobertura que cruzaba sin límite la
grasa retroperitoneal (el polo del bazo pasaba con 7 mm de grasa delante; ahora solo la cruza hacia el riñón, el bazo apoya en el
diafragma y la grasa tiene tope sobre los riñones) y la distancia a la frontera del estómago que no contaba el hígado ni el bazo (se
pasaba 31 veces junto al bazo; ahora los cuenta y la pared sigue ahí); importantes: la decisión sin las medidas del costo (ahora
arriba), la grasa retroperitoneal sin tope, filas de procedencia que no decían lo que el código hace y la distancia de la corteza que
no contaba la cápsula (corregidos); menores: el grueso del estómago de otro hábito, umbrales flojos, una prueba citada que no existía,
la profundidad del riñón en el obeso y el lóbulo izquierdo detrás del estómago (documentados o corregidos). Aplicado.

## 44. La ladera de la cúpula pleural sin esquina y con pendiente acotada; el recorrido de la 2.ª costilla queda para una decisión aparte

**Fecha.** 2026-10-03.

**Contexto.** La app arranca en el BLUE superior clínico (decisión 42) y el borde craneal de su sector llega a la base de la
cúpula pleural. Con la curva de la decisión 27, Rc·(1 − √(1 − h)), la pared tenía una esquina sobre la 1.ª costilla (engruesa de
golpe Rc/2H por mm: la pleura del borde del sector bajaba 3,5 mm en un paso de 8 líneas) y una pendiente sin cota junto al techo
(≈ 16 mm de pared por mm de z en la ladera; 37 en el peor punto por delante y 45 junto a la línea media posterior). Por eso la cara interna de la pared variaba 3,05 mm
bajo la cara en el punto clínico (la prueba de la compresión pide ≤ 3) y la equivalencia TS ↔ GLSL de la distancia de las caras
necesitó una tolerancia escalada con el gradiente (decisión 42, `wall-cupola-transition`). Además, la caída de 19 mm de la 2.ª
costilla del esternón a la medioclavicular, que pone el BLUE superior en el EIC1, no tenía fuente. Objetivo O2.

**Fuentes** (búsqueda del 03-10-2026; texto completo salvo donde se dice):

- **La cúpula**: Gray la pone 2,5–5 cm sobre el extremo esternal de la 1.ª costilla y ≈ 2,5 cm sobre el tercio medial de la
  clavícula, más cerca del borde anterior del esternocleidomastoideo; la membrana suprapleural (fascia de Sibson) va del borde
  interno de la 1.ª costilla a la transversa de C7; la abertura superior mide ≈ 5 × 10 cm [@gray-anatomia-1918]. NO ENCONTRADO:
  el radio o la pendiente de la ladera.
- **La fosa supraclavicular**: la piel a la «corner pocket» (la 1.ª costilla y la subclavia, no la pleura), 1,7 ± 0,8 cm por
  ecografía [@yadav-supraclavicular-2016] (ya en A-T24); [DERIVADO] ≈ 1,8 cm de la piel a la pleura con el plexo a 1,34 ± 0,39 cm
  [@mistry-plexo-2016] y 0,42 cm del plexo a la pleura en supino [@chen-plexo-pleura-2021] (solo el resumen). **Detrás de la
  clavícula**, [DERIVADO] ≈ 29 mm de la piel a la pleura por la vena subclavia (piel–vena 10,6 mm, vena 9,5, vena–pleura 9,2 en
  el tercio medial; 20 adultos [@berk-subclavia-2026]; no dicen a qué pared de la vena miden).
- **Las capas**: el esternocleidomastoideo, 8,1 ± 2,0 mm a media altura del cuello [@pirri-ecm-2021] y 9,8 ± 1,8 en C3–C4
  [@sidiropoulos-ecm-2025]; el escaleno anterior, 11–13 mm a la altura del cricoides [@magdy-escaleno-2026]; el platisma, ≈ 1 mm
  (cadáveres, ilustrativo) [@kildal-platisma-2025]. NO ENCONTRADO: la grasa supraclavicular y estas capas en la propia fosa.
- **La 2.ª costilla**: el 2.º cartílago es horizontal; el 1.º baja un poco y el 3.º sube un poco ([@gray-anatomia-1918], «The
  Costal Cartilages», ya en anatomy.md). El ángulo de «asa de cubo» de la 2.ª costilla, 5,4 ± 6,9° con la cara lateral hacia
  arriba [@holcombe-geometria-2017] (TC de 1042 adultos; el giro de la costilla entera alrededor de su cuerda, sin el cartílago).
  NO ENCONTRADO: una medida de la pendiente frontal de su tramo anterior.

**Opciones.** Para la ladera: (a) dejarla; (b) un cuarto de elipse, e = Rc·(1 − √(1 − h²)), que sale de la pared sin esquina
pero sigue con pendiente infinita junto al techo (medido: peor, 52 mm por mm); (c) e = D·h², sin esquina y con la pendiente
acotada, con D = min(Rc, pendiente·H/2). Para la 2.ª costilla: (i) corregirla aquí; (ii) dejarla para una decisión aparte.

**Decisión.** (c) y (ii).

- **La ladera** (`cupolaMm`, TS y GLSL): e = D·h², con h la fracción de la altura entre zApex (la 1.ª costilla más 2 mm) y zTop
  (el techo), y D = min(Rc, `cupolaMaxSlope`·H/2). La pleura cervical deja la pared tangente a ella, como una membrana, y llega
  al techo con la pendiente 2D/H. `anatomy.lungApex.cupolaMaxSlope`, 1,5 mm por mm [estimado]: la del vértice medial con Rc 30 y su
  altura sobre la 1.ª costilla (≈ 39 mm en el avatar, la de Gray), con Rc 30 [SUPUESTO]. Como ninguna columna sube más de 40
  mm, el min casi nunca actúa: D ≈ 0,75·H en todas. Fuera del tercio medial, donde la cúpula sube solo 5 mm sobre la 1.ª
  costilla, su techo queda menos hondo (≈ 4 mm) en vez de más empinado. Sobre zTop, el techo, como antes.
- **La distancia al borde sobre el techo** (`wallCupolaRoofBd`, TS y GLSL): el músculo sobre el techo suma la distancia al
  tramo horizontal del techo (zTop, desde la profundidad D hacia dentro). Antes solo tenía la cota vertical hasta zApex, que
  con la ladera nueva daba hasta 9,9 veces la distancia real (20,8 mm frente a 2,1 en φ 0,65π, z 190; con la de la decisión
  27, 4,4); ahora, 1,78 veces en lo peor de la misma rejilla.
- **La 2.ª costilla queda como está** en esta decisión. Baja 10,5 mm del esternón a su unión condrocostal y 19,8 hasta la
  medioclavicular. Y es más que esos milímetros: en el modelo el punto más bajo de las costillas 2.ª–5.ª está en la medioclavicular
  (u ≈ 96), por fuera de su unión condrocostal (u 64–84), cuando en la anatomía el tramo óseo sube hacia fuera desde ella y lo más
  bajo de la costilla ósea es su extremo anterior: un defecto de forma de la parrilla anterior (`anterior-rib-shape`, nueva).
  Hacerla horizontal (Gray) con la 5.ª en la línea de Treves en la
  medioclavicular obliga a ensanchar los espacios 2.º–4.º en la medioclavicular de 46 a ≈ 65 mm en total (hoy, [DERIVADO] de
  Seong y Kim), o a que la costilla baje desde la unión condrocostal, contra el ángulo de Holcombe (la cara lateral de la costilla, arriba). Cualquiera de
  las dos sube las costillas 2.ª–4.ª en la medioclavicular hasta ≈ 19 mm. Eso mueve lo que ve la vista de medida del BLUE superior
  (la pose fija de 83,7 mm quedaría sobre la 3.ª costilla) y con ella el banco y la calibración de las decisiones 21, 24 y 35.
  Necesita una decisión propia con la recalibración (hoja de ruta).

**Consecuencias.**

- **La compresión en el BLUE superior clínico** (`compression.test.ts`, vista nueva `blueUpperClinical`): la cara interna varía
  2,25 mm bajo la cara (−0,88 a 1,37), bajo los 3 de siempre. Con la curva de antes, 3,05: la prueba falla con ella, por poco.
  La elipse, quitar el min o la pendiente 3 la pasan; a esas las atrapa la prueba de la ladera. En la vista de medida del BLUE
  superior no cambia (2,05).
- **El gradiente de la pared** sobre la cúpula, en todo el perímetro por debajo del techo (rejilla de 1 mm × 0,25 mm): |∇W| ≤ 1,9
  mm por mm por delante y ≤ 4,3 junto a la línea media posterior, donde la cúpula pasa al cuello (antes, 37 y 45). Sin esquina:
  a 1 mm de su arranque la pared engruesó ≤ 0,15 mm (antes 0,39 en la LMC y 3,17 fuera del tercio medio). Lo fijan tres pruebas
  de `chestWall.test.ts` (la pendiente, el arranque y el gemelo GLSL de la curva, que se comprueba en el texto del shader); la
  curva de antes falla las dos primeras.
- **En la imagen de arranque** la pleura del borde craneal del sector queda a 18,7 mm (antes 21,9: se hundía al final).
- **La tolerancia escalada de la cáscara** (decisión 42) ya no se activa: con SwiftShader el mayor |Δd| de la cáscara baja a
  0,0088 mm en espiración y 0,0129 en la inspiración profunda (antes 0,025 y 0,11), todos bajo la tolerancia fija de 0,02; la GPU
  real, ≤ 0,0067. El mecanismo se queda (no cuesta nada donde |∇d| ≈ 1) para el próximo gradiente empinado.
- **Lo que no cambia**: A-T23 (el vértice ≈ 2,5 cm sobre la clavícula; el techo no se movió), A-T24 (por la fosa, la pleura a
  24,5 mm, antes 25,6; Yadav ± 2 DE en los cinco hábitos), la cobertura, las vistas de medida.
- **Comparación con las fuentes nuevas**: por la fosa, el músculo sobre la cúpula suma 23 mm, lo que dan los escalenos y el
  esternocleidomastoideo medidos a media altura del cuello (11–14 y 8–10 mm). Detrás de la clavícula, la pleura a 18–27 mm en los
  tercios medial y medio, menos que los ≈ 29 derivados de Berk (antes, 20–35): una ladera que arranca sin esquina engruesa la pared
  despacio al principio. Queda en `apex-cupola-wall`.
- **Lo que queda** (`wall-cupola-transition`, reescrita): el techo horizontal de cada columna. Con la sonda sobre la clavícula o por
  encima, las líneas que pasan sobre él entran en el pulmón casi rasantes y A0 les dibuja una pleura brillante, una franja casi
  vertical en la imagen. Lo arreglaría una cúpula con su propia superficie (un casquete con su distancia y su normal) en lugar del
  grosor radial por columna: hoja de ruta, con la 2.ª costilla.

- **El bundle:** la entrada pasa de 299,9 a 300,6 kB, sobre el techo de 300 que dejó la decisión 43; sube a 310 kB y el total
  a 870 (`tools/ci/bundle-budget.ts`).

**Verificación.** `chestWall.test.ts` (la pendiente de la ladera ≤ 2 en todo el tronco y el arranque sin esquina; las dos
fallan con la curva de la decisión 27), `compression.test.ts` (el BLUE superior clínico ≤ 3 mm; falla con la curva de antes),
`anatomyTargets.test.ts` (A-T23 y A-T24 en los cinco hábitos), `coverage.test.ts`. La cáscara TS ↔ GLSL medida con SwiftShader y
con la GPU real (espiración e inspiración profunda). Las imágenes de arranque y de la sonda subiendo hacia la clavícula (z 140, 155 y 170) con la GPU real, antes y después. `npm run check`, la e2e con SwiftShader y el CI de la PR. Revisión adversarial de contexto
limpio (resumen en la PR).

## 45. La piel del sector se mide sobre lo encendido: el detector deja de correrse con la mano del operador

**Fecha.** 2026-10-03.

**Contexto.** Con la mano del operador (decisión 39), el detector del sector se corría con la piel: en el PLAPS respirando,
el borde detectado se movía hasta 1,2–1,6 px a lo largo del ciclo y a veces saltaba a 4,8 px, con d_pl 2,8–3,0 mm más larga
que la verdadera. Por eso las guardas de coherencia del detector (ápice, bordes, piel y d_pl) se medían con la mano apagada y
el defecto quedó como limitación (`sector-detector-moving-skin`) y prueba «aún no se cumple». Medido sobre 20 pilas volcadas de
la GPU real (seis del PLAPS con la mano y seis sin ella; cuatro del BLUE superior y cuatro del inferior con la mano):

- **Sin la mano, la imagen está quieta.** Menos de la mitad de lo encendido varía y el detector usa la máscara de intensidad.
  Con la mano usa la temporal (63–75 % de lo encendido varía).
- **La piel y el campo cercano casi no varían, porque la sonda sigue a la piel.** σ temporal de 0,3–1,4 grises, junto al
  umbral de la máscara, max(0,75 escalones; 2 % del brillo). La máscara temporal los agujerea, en la línea central del PLAPS
  hasta 8,6 px por debajo de la piel. El arco de la piel deja de aceptarse o se ajusta sobre lo primero que varía.
- **Entonces el ápice lo dan los bordes.** Se ven en el campo lejano y se mueven con el contenido de la imagen: entre las seis
  pilas del PLAPS el ápice de los bordes varía ±0,35 px. El radio de la piel, el p10 de los radios mínimos por ángulo medido
  desde ese ápice, hereda esa variación.
- **El arco ajustado sobre lo encendido es idéntico en las doce pilas del PLAPS**, con y sin la mano: está fijo a la cara de
  la sonda. Pero queda medio píxel hondo (los puntos son el centro de lo primero encendido, no el borde de la máscara) y su
  error típico (0,44 px) pierde frente al de los bordes (0,25–0,33).

**Opciones.** Se midieron sobre las 20 pilas y sobre los 34 clips del banco (`bankdet`, la geometría propuesta frente a la
fijada en el manifiesto):

- **Registro rígido de los cuadros antes de la máscara temporal** (traslación entera, ±6 px): la piel queda igual o peor,
  −1,4 a +1,0 px en el PLAPS y hasta 2,6 px en el BLUE inferior. En el banco, la suma de los errores del ápice sube de 58 a
  472 px, LUS-03 (lineal) sale convexa y LUS-35l sale lineal. El sector no se mueve en la pantalla y lo que se mueve no es
  rígido: alinear el tejido desalinea el abanico.
- **σ robusta (1,4826·MAD) en vez de la desviación típica:** −1,3 a −0,1 px en el PLAPS. La piel sigue casi quieta y por
  debajo del umbral. En el banco, LUS-04c (lineal) sale convexa.
- **El arco por cuadro, con la geometría promediada:** en el simulador da −0,78 a 0,46 px, pero en el banco la suma de los
  errores del ápice sube de 61,6 a 75,1 px y 13 clips empeoran (LUS-35j de 0,6 a 3,6 px). La máscara de intensidad de un
  cuadro suelto se lleva las marcas quemadas.
- **Rellenar la máscara temporal desde lo que varía** (reconstrucción geodésica sobre lo encendido, por histéresis, solo
  hacia arriba o por componentes): arregla el simulador, pero en el banco convierte LUS-02 (sectorial) en convexa (ápice a
  300–2600 px) o LUS-03 (lineal) en convexa. La histéresis con un umbral débil no basta en el simulador: parte de la piel
  tiene σ ≈ 0.
- **Elegida: la piel sobre lo encendido, sin tocar la máscara temporal de los bordes.**

**Decisión.** En `detectSectorFromStats` (`src/measure/fidelity/sector.ts`):

1. **El arco y el radio mínimo de la piel se miden sobre lo encendido** cuando el clip usa la máscara temporal (sus
   componentes grandes, `skinSupport`). Los bordes, el fondo y las marcas siguen saliendo de la máscara temporal. Una marca
   quieta sobre la piel deja puntos fuera del círculo y el arco no se acepta: mandan los bordes, como antes.
2. **Cada punto del arco es el borde de la máscara,** medio píxel por encima del centro de lo primero encendido
   (`SKIN_EDGE_OFFSET_PX`).
3. **El arco manda también cuando su error típico es menor de 1 px** (`ARC_PREFERRED_SIGMA_PX`), no solo cuando gana a los
   bordes. Su error es sobre todo el escalón del píxel, que no cambia entre pilas, y los bordes sí cambian.
4. **Con el arco, la piel es su radio:** el ápice y la piel salen del mismo ajuste.

**Consecuencias.**

| Piel detectada − verdadera (px), GPU real | Main          | Esta decisión |
| ----------------------------------------- | ------------- | ------------- |
| PLAPS con la mano (6 pilas)               | −1,43 a −0,33 | −0,30 a −0,24 |
| PLAPS sin la mano (6 pilas)               | −0,10 a 0,16  | −0,30         |
| BLUE superior con la mano (4)             | −0,19 a 0,46  | −0,31 a −0,27 |
| BLUE inferior con la mano (4)             | −1,84 a 2,64  | −0,30 a −0,24 |

- **La piel ya no depende de la mano ni del punto.** −0,24 a −0,31 px en las 20 pilas. El resto es fijo: el radio del arco,
  medio píxel de la discretización. El ápice queda a −0,24 a −0,16 px en la vertical (antes, −3,4 a 1,4).
- **El banco real no cambia.** En los 34 clips el arco no se acepta en ninguno (la piel es el borde del recorte, o el arco no
  cubre el sector), así que la geometría propuesta es la misma, número a número. `npm run fidelity:bank` pasa sin regenerar
  `reference-stats.json`. El costo: una búsqueda de componentes conexas más por clip con máscara temporal.
- **Las guardas de coherencia del detector de `e2e/fidelidad.spec.ts`** (ápice < 25 px, bordes < 4°, piel < 10 px y
  d_pl < 2 mm) **vuelven a medirse con la mano encendida**, en las dos pilas de cada punto, como los clips. Se quita la
  excepción de la decisión 39. La guarda del modo M sigue con la mano apagada: allí la mano mueve la pared, que no es un
  defecto del detector.
- **La prueba «aún no se cumple» pasa a guarda.** Seis pilas del PLAPS respirando con la mano: |piel| ≤ 0,5 px y d_pl a
  < 2 mm. Con la GPU real y con SwiftShader (04-10-2026) dan lo mismo: piel −0,30 a −0,24 px y d_pl −1,37 a +0,09 mm
  (el −1,37 es la pleura inclinada del PLAPS que cae en dos grupos de columnas, decisión 36).
- **Se quita la limitación `sector-detector-moving-skin`.**
- **La piel detectada deja de hundirse con el contraste en el caso de fast-check de `fidelityInvariance.test.ts`** (el
  sector desplazado hacia el blanco, donde la pared quieta del sintético deja de «variar»): con la máscara temporal se
  hundía más de 10 px; sobre lo encendido queda a −1,8 px de la verdadera. La prueba pasa a exigirlo (< 3 px en los dos
  contrastes). La geometría del banco sigue fijada en el manifiesto: en los clips el arco no se acepta y la piel la siguen
  dando los bordes.
- **Lo que queda:** la piel del simulador sigue 0,3 px corta por la discretización del arco, y los bordes con la mano siguen
  moviéndose ±0,35 px entre pilas. No se exige más a la geometría del detector, que solo propone: el banco mide con la geometría
  fijada.

**Verificación.**

- `fidelityBench.test.ts`: un clip sintético vivo con los primeros 6 px bajo la piel quietos. La piel y el ápice son los del
  mismo clip sin la banda quieta (±0,1 px) y la piel queda a < 1,5 px de la verdadera. Con el detector de main, 5,0 px: la
  prueba falla sin el cambio.
- Las pruebas del detector de siempre, la invariancia afín y `npm run fidelity:bank` (el banco dorado, sin cambios).
- `e2e/fidelidad.spec.ts` con la GPU real y con SwiftShader: las tres ventanas del banco y la guarda del detector con la mano.
- Sin revisión adversarial de contexto limpio: el agente que la llevaba se detuvo por el límite de uso; la revisó el
  coordinador (04-10-2026).

## 46. Los vasos del hilio del bazo y de los riñones: la arteria y la vena esplénicas y las renales, anecoicas y con los calibres de la fuente

**Fecha.** 2026-10-04.

**Contexto.** Daniel pidió el bazo normal «con vasos venosos y arteriales» y recordó que la vena esplénica entra en la congestión
venosa del VExUS ampliado (03-10-2026). Desde la decisión 43 el bazo y los riñones no tenían hilio: sus vasos caían en la lista de
lo que el abdomen no tiene (`abdomen-generic-tissue`, `liver-spleen-simplified`, `kidney-retroperitoneum-port`). Desde las ventanas
de la base izquierda (la axilar posterior en el EIC10, la media en el EIC10–11, la escapular en el EIC11) el plano de la sonda llega
al hilio del bazo y al del riñón. La búsqueda bibliográfica de esa sesión (PubMed y Europe PMC, sin enviar datos personales) dio los
calibres de adultos sanos y la ausencia de un umbral validado para la vena esplénica.

**Opciones.**

- **Portar el árbol vascular de VExUS** (`vesselTree.ts`, con la aorta, la cava, la porta y las suprahepáticas): trae al tórax un
  hígado con vasos y una cava que lus-sim no tiene, y el corte por cuadro de VExUS para 128 tubos. Es la unión (decisión 1), no
  este paso.
- **Pintar los vasos como manchas en el bazo**: rompe «nada se pinta».
- **Elegida: seis tubos fijos** (la arteria y la vena esplénicas y la arteria y la vena renales de cada lado) con la consulta de
  tubo de VExUS (`tubeQuery`), anclados a la escena y con sus calibres con fuente; los extremos mediales, ciegos.

**Decisión.** `src/anatomy/organs/vessels.ts` (`HILUM_VESSELS`, `buildHilumVessels`):

1. **Calibres** (radios): la vena esplénica 3,3 mm (Strohm y cols. y Huang y cols. por ecografía, 6,6 y 6,2 mm; Stella y cols.:
   < 8 mm en el hilio en el 98 %); la arteria esplénica 2 mm junto al hilio y 2,6 hacia la línea media (Brinkman y cols.: se
   estrecha del origen al hilio); la arteria renal 2,45 mm (Turba y cols.); la vena renal izquierda 4,7 mm y la derecha 5 mm (Durur
   Karakaya y cols., por TC). La pared de las venas, la fina de VExUS (`VesselWallThin`, 0,6 mm); la de las arterias, la suya
   (`ArteryWall`, 0,6 mm) [SUPUESTO].
2. **El hilio del bazo**: `AnatomyScene.spleenHilum` busca, en la línea radial de la pared por el centro de la parte gástrica de su
   cara visceral (`gastricImpressionCenter`), el punto donde sale el bazo. Los dos vasos esplénicos entran 5 mm en él
   (`SPLENIC_INTRA_MM`) y van hacia un extremo a 25 mm a la izquierda y 56 por delante del centro del cuerpo vertebral (por detrás
   de donde iría el páncreas), arqueados 10 mm hacia delante para pasar por delante del riñón izquierdo (`SPLENIC_BOW_MM`); la
   arteria, 10 mm craneal a la vena y con dos ondas hacia arriba de 3 mm (Brinkman y cols.: asas en el 86 %) [SUPUESTO el trazado].
3. **Los renales**: los nodos del seno y del hilio de VExUS en el marco del riñón; la vena, 6 mm por delante en w (VExUS, 5) y la
   arteria, 4,5 mm por detrás y 3 hacia el polo superior (VExUS, 4 detrás): con la vena derecha de 10 mm, las de VExUS se tocaban.
   Hacia la línea media, respecto a la columna: la vena derecha, corta, hacia donde iría la cava; la arteria derecha, por detrás de
   ella; la vena izquierda, por delante de donde iría la aorta; la arteria izquierda, corta, hacia la aorta.
4. **Extremos ciegos**: el último tramo se estrecha al 60 % del radio (`BLIND_END_TAPER`; en los esplénicos, un muñón de ≈ 6 mm tras
   alcanzar su calibre medial, `SPLENIC_FULL_T`): el vaso sale del modelo. Acaban a 0–2,8 cm de la línea media
   (`hilum-vessels-blind-ends`).
5. **Clasificación** (`AnatomyScene.classifyTubes`, la de VExUS sin los conductos ni el Doppler): bajo el diafragma, antes de los
   órganos (entran en el bazo y en el seno renal), con la sangre en la luz, su pared fuera y la cara de su luz
   (`Interface.VeinLumen`, `ArteryLumen`) a |d|; fuera de ellos, la distancia a su pared entra en la de los órganos y el «resto».
   Cada vaso se descarta por su esfera envolvente con un margen de 6 mm sobre la pared (`VESSEL_BOUND_MARGIN_MM`, más que el tope
   de 5 mm de la distancia del «resto»: fuera de la esfera, la pared queda más lejos que cualquier distancia que se use).
   `faceGradient` da la normal analítica del tubo (`tubeFaceGradient`), la de la GPU en `Cls.n`.
6. **GPU**: la tabla de los seis vasos (cabecera, esfera envolvente y hasta 8 nodos) en la textura de escena tras la de los bordes
   del pulmón (`HILUM_VESSEL_BASE`), y el gemelo GLSL (`hvTubeQuery`, la `tubeQuery` del shader de VExUS para la sección circular, y
   `classifyTubes`) en `classifyWith` antes de `classifyOrgans`. Sin uniforms nuevos.

**Consecuencias.**

- **Para el alumno:** en la base izquierda y en la escapular se ven el hilio del bazo y el del riñón con sus vasos anecoicos de
  pared fina; la vena esplénica, de 6,6 mm, por delante del riñón izquierdo. Sin Doppler: la velocidad y la pulsatilidad llegan con
  VExUS.
- **La vena esplénica y la congestión** (`docs/UNIFICATION.md`): en adultos no hay un índice de la vena esplénica validado frente
  a la presión auricular derecha ni un umbral propio (solo series de casos y un estudio pediátrico); las revisiones del VExUS
  ampliado la proponen como sustituta de la porta [@turk-evexus-2023; @koratala-esplenica-2026]. La propuesta: los umbrales de la
  fracción de pulsatilidad de la porta (30 % y 50 %) como extrapolación declarada. El índice «esplénico» de Bolognesi y cols. es
  arterial [@bolognesi-esplenica-2012].
- **Rendimiento:** con SwiftShader (`boot2.mjs`, tres vueltas de dos arranques alternando los árboles, carga 5–9; 04-10-2026), frente
  a la decisión 45: arranque 54–103 s (mediana ≈ 67) frente a 56–113 (≈ 80); cuadro en el BLUE superior 433–598 ms frente a
  470–602, en el espacio de Traube 439–591 frente a 442–871 y en la base izquierda (la de los vasos) 440–614 frente a 447–724. No
  cuesta más: el bucle de los seis tubos solo corre bajo el diafragma y descarta cada uno por su esfera envolvente. Con la GPU real
  no se midió.
- **Pruebas:** la e2e de equivalencia compara la cara de la luz de los vasos en las bases (con SwiftShader, 160 muestras de la
  vena y 123 de la arteria; acuerdo 1, error de distancia ≤ 0,0012 mm, normales ≥ 0,99999).
- **Pendiente:** las ramas del hilio esplénico (la arteria se divide en dos en el 95 %, Moraes y cols.), las arterias polares, las
  interlobares renales de VExUS, el páncreas y la unión con el árbol de VExUS.

**Verificación.**

- `hilumVessels.test.ts`: los calibres de la fuente; el eje de cada vaso es sangre y su pared la rodea en los seis hábitos; los
  esplénicos empiezan dentro del bazo (con la clasificación sin vasos, bazo) y los renales dentro del seno; fuera de su órgano no
  tocan el hígado, el estómago, el pulmón, el diafragma, el hueso ni el otro órgano, en los seis hábitos; entre las paredes de dos
  vasos queda al menos 1 mm (con los nodos de VExUS y la vena derecha de la fuente, −1,2 mm: la prueba falló y se separaron); la
  tabla de la GPU y el gemelo en `classifyWith`; la normal radial de la cara de la luz; en muestras al azar junto a los vasos, la
  distancia a la frontera de lo que no es vaso no pasa de la distancia verdadera a la pared más cercana, y la luz y la pared dan
  la distancia de su cara (quitar la distancia a la pared del órgano o del «resto» la hace fallar). La salida barata de la pasada
  B acota las caras de tubo con √(1 + estrechamiento²) de su segmento más cónico (`faceGradient.test.ts`).
- `e2e/imagen.spec.ts` con SwiftShader: la equivalencia TS ↔ GLSL de las cápsulas, ahora con la luz de los vasos (al menos 60
  muestras de cada una).
- Revisión adversarial de contexto limpio (04-10-2026): sin bloqueantes; el gemelo GLSL portado a JS coincide con TS en 720 000
  puntos de los seis hábitos (0 desacuerdos de tejido o cara; ≤ 4,8·10⁻⁶ mm). Pidió el calibre medial esplénico que el muñón
  ciego no alcanzaba, pruebas que mataran sus mutaciones (de 11, solo 1 caía), el margen de la esfera envolvente y dos cifras de
  las fuentes: aplicado.
- `npm run check`, la e2e con SwiftShader y el CI de la PR.

## 47. Sin las tarjetas de los puntos BLUE: la sonda se explora libre sobre el tórax

**Fecha.** 2026-10-04.

**Contexto.** Daniel, el 04-10-2026: los puntos de Lichtenstein «no aportan mucho». La interfaz tenía, bajo el navegador 3D, la
sección «Puntos de referencia» con catorce tarjetas (los puntos BLUE superior, inferior, frénico y PLAPS de cada hemitórax por la
regla de las manos, decisión 42, y las tres áreas paravertebrales sentado, decisión 33) que deslizaban la sonda hasta su punto
(`ProbeAnimator`). Con la cobertura completa como requisito (`docs/MISSION.md`) la exploración es la del tórax entero, no la de
siete puntos.

**Opciones.** (a) Dejarlas plegadas; (b) dejarlas solo en un modo docente; (c) quitarlas de la interfaz y conservar los puntos
como datos donde los usan las pruebas y el banco.

**Decisión.** (c). Fuera de la interfaz: la sección de `index.html`, `startPointCards.ts` (con su prueba), la animación hacia
un punto (`probeAnimation.ts`, con su prueba en `uiInput.test.ts`), su cableado en `src/main.ts` y sus reglas de estilo. Se
conservan `START_POINTS` y sus poses (`app/startPoints.ts`, `app.startPointPoses`): los usan el barrido de equivalencia, los
ganchos de prueba, las e2e del banco y la pose de arranque (el BLUE superior clínico); las vistas de medida (decisión 42) no
cambian. Para sentar al paciente queda Ajustes → Paciente.

**Consecuencias.** El alumno llega a cada zona arrastrando la sonda en el navegador 3D o sobre la imagen. Las e2e que pulsaban una
tarjeta (`adquisicion.spec.ts`, `smoke.spec.ts`, `navegacion3d.spec.ts`) llevan la sonda por el gancho de pruebas o por el
arrastre, y comprueban la pose del cuadro mostrado en lugar de la tarjeta resaltada.

**Verificación.** `npm run check`; la e2e de la adquisición, el humo y el navegador 3D con SwiftShader; ninguna referencia a las
tarjetas queda en `src/` ni en `index.html`.

## 48. Los brazos arriba en el maniquí y la sonda hasta la fosa supraclavicular, por encima del vértice

**Fecha.** 2026-10-04.

**Contexto.** Daniel pidió (04-10-2026) que el modelo 3D tenga los brazos arriba para examinar todo el tórax, axilas incluidas, y
señaló que faltaba campo ecográfico sobre las clavículas. Es el requisito de cobertura de `docs/MISSION.md`: el vértice y la fosa
supraclavicular se alcanzan, y el lateral se explora entero. Medido en `main`:

- **Los brazos colgaban junto al tronco** (decisión 25). Desde la vista «Lateral» (elevación 0,1 rad) el brazo era lo primero
  que tocaba el rayo sobre la axilar media desde z −63 hacia arriba, sobre la axilar anterior desde z 124 y sobre la posterior
  desde 122. La pared lateral alta y la axila no se podían tocar con el ratón: el clic caía en el brazo («Zona no explorable»).
  La 1.ª costilla de la axilar media está en z 172,8 y su EIC1 en 158,3.
- **La sonda no subía de z 200** (`clampPose`, el tope de VExUS). La clavícula del modelo tiene el borde superior en z 173,3
  (tercio medial) a 188 (extremo acromial): quedaban 12–27 mm de piel sobre ella. El vértice de la base sube 2,5 cm (hasta 5) sobre el tercio medial de la clavícula (Gray): a z 223,3 en el tope de su rango, por encima del alcance. La piel funcional
  del navegador acababa en ese mismo tope.

**Opciones.**

- **Mover la anatomía con los brazos arriba** (la escápula rotada, la piel de la axila estirada, el hombro): con el brazo
  elevado la escápula rota hacia arriba ≈ 50° (McClure y cols., pines óseos en el plano escapular) y, con la mano sobre la cabeza,
  su borde vertebral sigue aprox. la cisura oblicua (Gray). Es una escápula por postura, que hoy no existe ni para los brazos
  cruzados (A-T18): el modelo tiene una sola, la de los brazos a los lados, que usa la exploración posterior sentado. Se descarta
  aquí y queda como limitación (`arms-raised-anatomy`).
- **Un alcance por ángulo φ** (la axila más baja que la fosa): el navegador y `clampPose` usan un rectángulo en (φ, z); con un
  tope variable, la piel funcional y `surfacePose` cambian de forma. Lo que el tope uniforme deja de más (la pared lateral por
  encima de la 1.ª costilla, donde en el paciente está el contenido de la axila y la cabeza del húmero) ya lo deja el tronco
  cilíndrico (`thorax-cylindrical-cage`). Se descarta.
- **Elegida: los brazos arriba como contexto visual y el tope craneal donde termina el vértice de la base.**

**Decisión.**

1. **El maniquí con los brazos arriba y las manos detrás de la cabeza** (`ui/thorax/humanTorso.ts`, `raisedArmNodes`): la
   postura de la exploración lateral en supino: la técnica pide los brazos colocados para que la sonda llegue a la pared lateral
   sin estorbo [@koenig-respiratoria-2020]. Las manos detrás de la cabeza, la abducción del hombro ≈ 163° (del hombro al codo,
   16,7° de la vertical) y el codo doblado son elecciones de autoría, no de la fuente. Cada brazo es un tubo por un camino de nodos (`tubeMesh`, nuevo en `ui/thorax/geometry.ts`:
   Catmull-Rom con marcos por transporte paralelo), porque un perfil por alturas (`loftMesh`) no sigue un codo doblado. Su raíz
   queda dentro del tronco y lo que asoma empieza sobre el tope de la piel explorable. La cabeza no se mueve (perfiles con la
   altura de antes, `HEAD_BASE_MM`); sin el hombro de los brazos a los lados, la elipse del tronco sigue 14 mm sobre el tope y
   baja por el trapecio al cuello. Son medidas de autoría visual, como las de la decisión 25.
2. **La sonda sube hasta z 225** (`SCAN_REACH`, `probe.scanReach.cranialMm`, en `probe/probe.ts`; derivado): el borde superior
   del tercio medial de la clavícula (la escotadura yugular a 163,3, derivada de Gray: a la altura del borde inferior de T2, más
   10 mm, `anatomy.clavicle`) y el vértice hasta 5 cm por encima (Gray) dan 223,3, que se redondea a 225. Una prueba exige que
   el tope no quede por debajo de `apexMaxZ` en ningún hábito. Más arriba, la piel cilíndrica del tronco ya no es la de la fosa ni la
   del cuello: no se sube más. `SCAN_LIMITS` del navegador sale del mismo `clampPose`, y la piel funcional llega al nuevo tope.
3. **Una celda de cobertura más por lado: la fosa supraclavicular sobre el vértice** (`app/coverage.ts`). La sonda va a la
   altura del vértice más alto de la base (`apexMaxZ`, 223,3), a 70 mm de la línea media, transversal (paralela a la
   clavícula) e inclinada hacia los pies (+0,7 y +0,5 rad; con el signo contrario el haz va hacia la cabeza). Se prueba primero la
   inclinación más empinada (40°), la que lleva el haz detrás de la clavícula a la ladera de la cúpula; con menos, el haz entra
   rasante por el techo de la cúpula (`wall-cupola-transition`).
4. **La anatomía no cambia con los brazos arriba**: la escápula, la pared lateral y la axila siguen las de los brazos a los
   lados (`arms-raised-anatomy`).

**Consecuencias.**

- **El navegador alcanza la axila y la fosa.** Desde la vista lateral, con elevaciones de −0,3 a 0,4 rad, el primer impacto
  sobre las tres líneas axilares es la piel funcional de z −150 hasta el tope (antes, el brazo desde z −63 en la axilar media).
  Desde la vista anterior y la de «Centrar modelo», la fosa supraclavicular (a 70 mm de la línea media) es piel funcional de la
  clavícula al tope. El alumno arrastra la sonda por la axilar media hasta z > 215 y por la fosa hasta el tope (e2e).
- **La imagen sobre la clavícula.** La sonda en la fosa ve la pared genérica (sin escalenos, esternocleidomastoideo, vasos
  subclavios ni plexo, `apex-cupola-wall`), la sombra de la clavícula cuando el haz pasa detrás de ella y la cúpula pleural con
  el vértice, que no desliza (`sliding-linear-height`, como en la base). Sobre el vértice, de plano, el haz no cruza pulmón
  (solo partes blandas); inclinada 40° hacia los pies, la pleura de la cúpula aparece a 44,5 mm por la línea central (con
  presión de examen). Es más honda que el «corner pocket» de Yadav (1,7 ± 0,8 cm, sobre el tercio medio, junto a la clavícula):
  la sonda está 5 cm sobre la clavícula en una piel cilíndrica sin la depresión de la fosa (`thorax-cylindrical-cage`).
- **Cobertura:** de 136 a 138 de 140 (vértice 8/8): las dos celdas nuevas se cumplen; con el tope de antes (z ≤ 200), no.
  Las dos pendientes son las de la decisión 43.
- **Presupuesto del maniquí:** 17 416 triángulos con la sonda (tope 18 000; los brazos, 1 640 cada uno).
- **Lo que queda:** la escápula rotada, la axila estirada y el hombro con los brazos arriba (`arms-raised-anatomy`); la fosa con
  su depresión y sus partes blandas; un alcance que siga la forma real de la axila.

**Verificación.**

- `thoraxAppearance.test.ts`: los rayos de la cámara del navegador, desde la vista lateral (tres elevaciones) sobre las tres
  axilares de z −150 al tope y desde la anterior y la de «Centrar» sobre la fosa, tocan primero la piel funcional. Con los
  brazos de `main` falla (el brazo tapa la axilar media desde z −63). La abducción del hombro queda entre 150° y 180°, la mano
  detrás de la cabeza y ningún vértice del brazo fuera del tronco bajo el tope. El tubo tiene las caras hacia fuera (el material
  es de una sola cara).
- `coverage.test.ts`: las dos celdas nuevas, con la sonda en supino, pulmón inclinada hacia los pies y nada de plano; con el
  alcance de antes (z ≤ 200) no se cumplen y la fosa de siempre sí (mutación del alcance). El total pasa a 138/140.
- `probe.test.ts` y `thoraxGeometry.test.ts`: el tope craneal de `clampPose` es 225 y el caudal sigue en −200; `surfacePose`
  rechaza la piel por encima del tope.
- `e2e/humanNavigator.spec.ts` («brazos arriba»): arrastre real con el ratón por la axilar media derecha en la vista lateral y
  por la fosa supraclavicular en la anterior, sin «Zona no explorable».
- Capturas con la GPU real (Metal): el maniquí, la sonda en la axila y la vista supraclavicular.

## 49. El corazón de EchoTwin en el tórax: fase 1, estático en telediástole, horneado en un volumen y en su propio chunk

**Fecha.** 2026-10-04.

**Contexto.** Daniel, el 04-10-2026: «falta agregar corazón que puedes sacar de simulador EchoTwin TTE». El corazón de lus-sim era
el de la decisión 18: un elipsoide de miocardio (120 × 90 × 65 mm [SUPUESTO]) con una cavidad y un tapón de miocardio de hasta
25 mm que lo unía a la pared en la ventana de Latham (`heart-simplified`). En la ventana cardiaca y en la región paraesternal
izquierda la imagen mostraba una pared gruesa y un hueco, no un corazón. EchoTwin (`echotwin-tte`, público, el mismo autor) tiene
un corazón analítico completo (cuatro cavidades, paredes con su grosor regional, válvulas mitral, tricúspide, aórtica y pulmonar
con sus cuerdas, raíz aórtica y aorta ascendente, tracto de salida y tronco pulmonar con sus ramas, venas cavas y pulmonares,
seno coronario, pericardio y grasa epicárdica), con su clasificador TS y su gemelo GLSL escrito a mano (≈ 1100 líneas). Límites de
partida: la pasada B en 127/129 de sus 130 ranuras de uniforms, los 32 tejidos llenos (`TISSUE_VEC4`), la entrada del bundle en
302,5 de 310 kB, y la guarda de compilación de SwiftShader (`shaderLimits.test.ts`: el JIT crece con el código inlineado).

**Opciones.** Para el corazón: (a) agrandar el elipsoide con cavidades propias; (b) portar el de EchoTwin con procedencia. Para la
GPU: (i) su clasificador en cada programa que clasifica, con sus parámetros en una textura (como en EchoTwin); (ii) un volumen
horneado: su clasificador solo en un programa que, al llegar el corazón, escribe en una textura 3D lo que dice en el centro de
cada vóxel, y las pasadas leen el vóxel. Medido con SwiftShader, (i) llevaba el primer dibujo de A0 de 26 a 900 s, el de B de 47 a
756 s (166 s sin el bucle de los planos) y el de la consulta de 56 a 73 s: la e2e del CI no cabe. Para los tejidos: añadir los de
EchoTwin (no caben) o llevarlos a los de lus-sim. Para el bundle: subir el presupuesto (≈ 104 kB más en la entrada) o un chunk
diferido. Para lo que rodea al corazón (el tapón, la franja, el pulso pulmonar, lo que no respira): rehacerlo o conservarlo.

**Decisión.** (b) con (ii), en dos fases; esta es la 1: el corazón del caso normal, estático en el comienzo del QRS, en un chunk
diferido.

- **El puerto** (`src/anatomy/heart/`, filas en `docs/PROVENANCE.md`, `echotwin-tte@c15aec7`): el modelo, la pose y el
  clasificador de EchoTwin; 15 archivos idénticos y el resto con importaciones relativas, el caso sin Zod (`schema.ts`,
  `normal-excellent.ts`: los tipos y los valores por omisión escritos), solo las constantes de la columna del tórax de EchoTwin y la
  forma del estado del latido (`CycleState`). Su GLSL (`gpu/`) lleva el prefijo `et_` escrito en el fuente (sus nombres —`smin`,
  `sdRoundCone`, `T_BLOOD`, `P`— chocaban con los de lus-sim; así el renombrado del build ve los nombres finales); `paramLayout.ts`
  empaqueta solo el corazón (`packHeart`). Conservan el formato de su origen (`.prettierignore`).
- **El puente** (`heart/cardiac.ts`, propio): el estado del latido es el de `cycleStateAt(tables, 0)` del caso en EchoTwin
  (`HEART_ED_STATE`: el VI con 120 mL, las valvas cerradas); el marco, el de EchoTwin (cm, dextrógiro, origen en la piel sobre el
  esternón en el 4.º EIC) convertido al de lus-sim con `core/units.ts` (`lusToEchoTwinCm`, `echoTwinCmToLus`, `swapYZ`: cambiar
  y por z invierte la quiralidad sin espejar la izquierda); una caja en el marco del corazón (`CARDIAC_BOX_CM`) que contiene todo
  lo cardiaco; los tejidos de EchoTwin sobre los de lus-sim (`ET_TO_LUS_TISSUE`: sangre y miocardio los suyos; valvas, cuerdas y
  paredes de vasos, la pared arterial; pericardio y anillos fibrosos, el ligamento venoso; la grasa epicárdica, la grasa).
- **El volumen** (`heart/cardiacRuntime.ts`, propio, el chunk diferido): una rejilla de 0,7 mm en el marco del corazón sobre su
  caja (206 × 198 × 238 vóxeles, RG8UI 3D, ≈ 19 MB): en cada vóxel, el tejido de lus-sim que el clasificador de EchoTwin da en su
  centro (o nada) y la distancia de su `sdf` en décimas de mm. El renderizador lo hornea al llegar el corazón (`bakeHeart`, que lleva paso a paso `ultrasound/heartBake.ts`, del chunk del
  corazón: un
  programa con la GLSL de EchoTwin, con los parámetros del modelo en RGBA32F y la retícula de su pared en R8 3D, que solo usa ese
  programa) sin pararla de una vez: el programa se enlaza en los hilos del navegador (`GLProgram.linkLater`) y dibuja 30 capas
  por paso (8 pasos), cada paso tras la valla del anterior, sin ninguna lectura (un `readPixels` final paraba la página ≈ 46 s con
  SwiftShader, lo halló la segunda revisión; con 4 capas por paso, entre paso y paso la imagen dibujaba sus cuadros y el horneado
  con SwiftShader tardó 333 s); el volumen nuevo sustituye al vacío al terminar. Las pasadas leen el vóxel (`heartVoxel` en
  `organs/heart.ts`, `uHeartVol`, con la rejilla en la textura de escena desde `HEART_VOL_BASE`, ceros mientras no está horneado);
  su gemela TS evalúa el clasificador en el mismo centro (`voxelCode`). La distancia de un punto es la del centro menos dos
  semidiagonales, con un tope de 2 mm (`HEART_VOXEL_BD_CAP_MM`), y no es una cota: la `sdf` de EchoTwin no cuenta las valvas ni las
  cuerdas que flotan en la sangre ni los vasos fuera del saco (su exceso llega a 19 mm), y con ella el entorno de ese radio cambia
  de tejido en ≈ 2–3 % de los puntos (≈ 0,7 % aun con 0,5 mm de tope; medido en `cardiac.test.ts`). Nadie la usa como cota: la
  pasada B solo reutiliza el tejido del centro si la distancia pasa de σ_elev + 0,5 mm (`sampleSide`), y σ_elev nunca baja de
  1,6 mm, así que dentro de la rejilla toda muestra de elevación se reclasifica (la prueba lo fija). Cero ranuras de uniforms nuevas
  (`uHeartBase` ocupa la de `uHeartCav`).
- **Un horneado fallido**: el corazón sale de la escena (`failCardiac`: la CPU queda como la GPU, sin él) y de las que vengan, no se
  vuelve a intentar ni a compilar, y el error llega a `errorLog` (origen `gpu`). Antes la excepción subía desde `setScene` y dejaba
  la escena a medias, rompía «Reiniciar paciente» y la recuperación del contexto, y cada intento recompilaba (lo halló la segunda
  revisión; `heartBake.test.ts`).
- **La carga diferida**: nada de la entrada importa `anatomy/heart/` en tiempo de ejecución; `SimulationSession.loadCardiac` lo
  pide al construir la sesión (el primer cuadro es el BLUE superior derecho, sin corazón a la vista) y lo registra para las
  escenas que vengan (`registerCardiac`). En la viva (`Simulator.attachCardiac`) se coloca aparte y entra en la escena cuando el
  renderizador tiene su volumen: la CPU y la GPU lo ven desde el mismo cuadro. Su llegada no borra el cine ni una imagen congelada
  (`heartChanged` ya no es un cambio de escena; sí invalida las miradas guardadas). Una escena nueva del mismo paciente (otra
  respiración, «Restablecer paciente») trae el mismo volumen (`buildCardiac` recuerda los cuatro últimos corazones por su sitio y
  el chunk, su volumen por corazón) y no se vuelve a hornear; con un renderizador nuevo (tras perder el contexto), se vuelve a
  hornear y, mientras tanto, la GPU ve la escena sin él. Las pruebas lo registran al arrancar
  (`validation/support/setupHeart.ts`). La e2e tiene el corazón, como producción, y sus ganchos llegan con él horneado; las
  pruebas lejos del corazón lo apagan con `?e2e=1&corazon=0` (todas salvo las de `imagen.spec.ts`, con la equivalencia, el
  costo y el pulso pulmonar): con SwiftShader el horneado ocupa ≈ 46 s en cada página, y la suite entera con el corazón en
  todas (5 trabajadores, carga ≈ 20) agotó los plazos de seis pruebas, con el fragmento del CI que lo lleva ya en 20,2 de sus
  25 min. Esas pruebas ven una escena que producción solo tiene unos instantes: en la ventana, el pulmón de la cortina de 20 a
  80 mm, y `heartAtWall` apagando la pleura igual.
- **El sitio** (`attachEchoTwinHeart`): el eje del caso (Engblom); el ápex del saco pericárdico, primero en el del elipsoide de la
  decisión 18 (la pleura bajo la piel a 9 cm de la línea media en el 5.º EIC, 10 mm hacia dentro) y después el corazón llevado por
  la normal de la ventana hasta que su punto más cercano a la pleura bajo el disco queda a `windowContactMm` (0 [SUPUESTO]: en la
  zona desnuda el pericardio se apoya en el esternón y los cartílagos). Donde queda en el avatar: el ápex del saco a 79,7 mm de la
  línea media, en el 5.º EIC, 5,2 mm por dentro de la pleura. Las traslaciones se miden con el corazón de partida trasladado y el
  corazón se construye una vez en su sitio (96 ms en la CPU, medido por la revisión).
- **Lo de alrededor, conservado** (con dos cambios medidos): el tapón de la ventana es grasa, de la pleura hasta el pericardio
  (≈ 10,8 mm en el avatar; antes, 25 mm de miocardio); la franja, grasa bajo la lámina de la cortina; el pulso pulmonar, el elipsoide y
  `heartAtWall`, sin cambios. (1) Lo que no respira (`heartStillWeight`): el elipsoide con su tapón y una esfera que cubre la base
  del corazón de EchoTwin que él no cubre (aurículas y raíces; 78 mm de radio), con una rampa de 50 mm desde su superficie
  (`baseStillRampMm` [SUPUESTO]; con 20 mm el campo se plegaba sobre ella): con la del elipsoide, que empieza tras el margen del
  tapón, el hígado a 9 cm a la derecha no respiraba entero (peso 0,96 en z 0; 19 mm de
  descenso en lugar de > 40 en la inspiración profunda), y sin la esfera las aurículas y la aorta se estiraban con la respiración.
  (2) Fuera del disco de la ventana, la lámina de la cortina gana al corazón (`scene.classify` y `classifyWith`): la cara anterior
  del ventrículo derecho llega a ≤ 1,7 mm por dentro de la pleura en un anillo de ≈ 4 cm alrededor del disco, y la pleura que A0
  registra fuera de la ventana debe tener pulmón debajo.
- **La cúpula**: el corazón solo existe sobre ella, como antes; lo que EchoTwin pone por debajo (≈ 70 mL: la cava inferior, la
  vena hepática y la cara inferior de los ventrículos) es del abdomen.

**Consecuencias.**

- En la ventana cardiaca (con GPU real): bajo la pared, el pericardio y el ventrículo derecho, el tabique, el ventrículo izquierdo
  con sus papilares, la válvula mitral y la aorta; en la paraesternal izquierda, el corazón detrás del pulmón donde el pulmón lo
  tapa (capturas en la PR; el volumen y el clasificador dan la misma imagen a la vista). Volúmenes (rejilla de 2,5 mm): VI y VD los
  del caso, aurículas en su mínimo de telediástole (≈ 29 y 30 mL), masa del VI normal.
- Costo, medido con la GPU real (Apple M4, Metal) y con SwiftShader (el del CI), frente a main (d954a97): el cuadro del BLUE
  superior 4,9 ms (main 7,9; el ruido de la máquina) y el de la ventana 7,2 (main 7,5) con GPU, 268 y 266 ms (main 263 y 254) con
  SwiftShader; el horneado, 525 ms con GPU y 46,5 s con SwiftShader (compilación incluida, de una vez y con una lectura al
  final, que paraba la página), tras el primer cuadro; por pasos (con la carga de la máquina en 5–9), 0,25 s con GPU y 41–43 s con SwiftShader, con la tarea más larga del hilo en
  0,26 s con GPU (main 0,37) y 12,6–13,1 s con SwiftShader (main 5,1–5,9; antes, el horneado entero), y los ganchos de la e2e, con
  el corazón ya horneado, a 1,0 s con GPU (main 0,5) y a 117–120 s con SwiftShader (main 85–244: el ruido de la máquina); la prueba de arranque y costo, 55,5 s con
  SwiftShader (main 53,4).
- Bundle: la entrada con el chunk compartido que separa Rollup pasa de 302,5 a 309,9 kB (de 310); el corazón y su horneado,
  105,7 kB en `cardiacRuntime` (`app/cardiacRuntime.ts`: `anatomy/` no importa el horneado, que es de `ultrasound/`), diferido;
  el total, de 857,3 a 971,7 (su presupuesto sube a 980).
- Equivalencia TS ↔ GLSL con GPU real: 50 000 puntos, acuerdo de tejido 1 (sangre y miocardio en el volumen); la distancia a la
  frontera en el volumen, a una décima (su cuanto: `boundaryDistanceMaxErrHeart` < 0,12 mm); los interiores bajan a ≈ 39 400 (más
  interfaces) y la e2e exige > 38 000.
- La cobertura vuelve a 136 de 138 (la ventana cuenta como corazón la grasa del tapón seguida de un tejido cardiaco,
  `CARDIAC_TISSUES`).
- `heart-simplified` se reescribe: el corazón no late ni respira, la cúpula lo corta, la ventana sigue siendo el disco de Latham,
  está horneado en vóxeles de 0,7 mm, llega después del primer cuadro, sin caras propias ni anisotropía, sin el resto del
  mediastino.
- Fase 2 (`docs/ROADMAP.md`): el latido desde el reloj único con las tablas de EchoTwin (`cycleModel.ts` entero), la pose por fase
  (≈ 35–60 ms en la CPU) y el pulso pulmonar del mismo volumen. El volumen no se puede hornear en cada cuadro (≈ 9,7 M vóxeles):
  una serie de volúmenes por fase del latido (≈ 19 MB cada uno: pocos, o comprimidos), o hornear solo la losa que corta el
  sector. Después, el paso siguiente: el diafragma ajustado al corazón (decisión 229 de EchoTwin) en lugar del corte de la cúpula
  (≈ 70 mL, de ellos ≈ 33 de ventrículo según la segunda revisión).

**Verificación.** `npm run check` (cobertura incluida, con las pruebas lentas: `respiratoryField.test.ts` vigila que la esfera de la base no pliegue el campo) y la e2e con GPU real y con SwiftShader. Revisión adversarial de contexto limpio (con scripts): halló la rampa de 20 mm que plegaba el campo, la distancia del volumen que no era cota (ahora con tope), la tolerancia de la equivalencia que abarcaba toda la esfera del volumen (ahora solo la rejilla), y un horneado fallido que dejaba la CPU con corazón y la GPU sin él (ahora el volumen solo se cambia si el horneado termina, y el error llega a `errorLog`); corregidos. `cardiac.test.ts`: el puerto
reproduce el clasificador de EchoTwin en 320 puntos del origen (`support/echotwinHeartGolden.json`, generados con EchoTwin en
c15aec7: mismo tejido, misma estructura y la sdf a 1e-8), los volúmenes, la caja (nada cardiaco fuera), la esfera de la base con el
elipsoide (nada del saco fuera de lo que no respira), el ápex en el 5.º EIC entre 7 y 10 cm y por dentro de la pleura, el centro
mitral detrás del 3.º–4.º cartílago, el contacto en la ventana a windowContactMm, la lámina fuera del disco, lo que queda bajo la
cúpula, la conversión de marcos (ida y vuelta, direcciones, quiralidad), el prefijo de la GLSL, el vóxel igual al clasificador en
su centro y la escena sin corazón antes de que llegue. Las pruebas con WebGL falso que cuentan dibujos y enlaces corren sin el
corazón. A-T16, la cobertura, las guardas de la GLSL (samplers, uniforms, el orden de la cortina, las copias de classify, que no
cambian) y la equivalencia e2e, al día. Segunda revisión adversarial (sin bloqueantes; el puerto, sin discrepancias en 40 000
puntos frente a c15aec7): el horneado fallido sin atrapar, la lectura que paraba la página, la e2e sin corazón por omisión, la
distancia del volumen que no es cota, la llegada que borraba el cine y la caché sin límite; corregidos, con `heartBake.test.ts`
(por pasos, sin lecturas, la escena con el corazón solo con su volumen; el fallo lo saca, se informa una vez y no se recompila) y
las pruebas de la distancia y de la caché en `cardiac.test.ts`.
