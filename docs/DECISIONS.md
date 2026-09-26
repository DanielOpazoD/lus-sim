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
Hacer de dos lados la cara en la tabla: cambia su fila de `uIface` para todo lo que la lea y contradice que la pared sea
su dueña. (c) Desplazar las réplicas a k·(D − 0,35): casa la imagen con la meta pero no con la geometría (la línea pleural
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

- F-T01 se cumple en los tres puntos de partida (medido igual que arriba, SwiftShader y Apple M4): la serie a
  −0,11…+0,07 mm de k·D, la separación entre órdenes a ≤ 0,08 mm de D y, frente a la línea pleural mostrada, los órdenes 2–4
  a −0,19…+0,05 mm. La línea pleural baja 0,35 mm: ahora está en el cruce de la pleura que registra A0.
- La prominencia mediana de las líneas A sobre la neblina baja 0,4–1,9 dB (sigue en 16–40 dB); la de la línea pleural
  no cambia (48–50 dB).
- La e2e de las líneas A exige la meta en los órdenes 1–4 y, además, la serie en k·D a ≤ 0,2 mm (un tercio de la FWHM
  axial del pulso, como la separación). La invariante en TypeScript (`src/validation/physicsInvariants.test.ts`) pasa a
  exigir los picos de la serie en k·D a 0,002 mm y F-T01 en el gemelo; A-T6 se mide con el perfil que se dibuja.
- Con GPU real el orden 4 del PLAPS (16 dB de prominencia) se detecta en 5 de sus 6 grupos en unas pasadas y en 6 en otras,
  antes y después del cambio; la e2e, con SwiftShader, los ve todos. Si CI llega a verlo, hay que mirar esa detección,
  no relajar F-T01.
- Se borra `pleura-echo-offset`. La huella del main de la pasada B cambia (`shaderLimits.test.ts`).

**Verificación.** `npm run check` y `npm run e2e` en verde. Mutaciones: con el desplazamiento de vuelta en la GLSL de
`pleuraSeriesEcho`, la e2e falla por la serie fuera de k·D (0,37 mm frente a 0,2) y, sin esa guarda, por F-T01 («orden 3:
0,76 mm frente a 0,5 mm»); con el desplazamiento de vuelta en la de TypeScript fallan la invariante (los picos en k·D) y la
prueba del perfil centrado de `pleura.test.ts`.
