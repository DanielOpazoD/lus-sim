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
