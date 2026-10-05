# Hoja de ruta

Fases verticales (guía §21): cada una termina con algo que funciona de punta a punta, una evaluación
por revisores adversariales de contexto limpio (ingeniería, física de la imagen y clínica) con nota
sobre 7, y una versión etiquetada. El orden puede cambiar con lo que muestre cada evaluación; los
cambios quedan en `docs/DECISIONS.md`. Cada fase dice qué objetivos de `docs/MISSION.md` mueve.

## Fase 0 — Cimientos (v0.1.0)

Objetivos: O6, O7 (y la base de O1–O4).

- Repositorio público con CI (`check` + e2e), protección de `main` y las herramientas de VExUS.
- Documentos rectores: `docs/GUIDE.md` y `docs/KNOWLEDGE.md` con bibliografía verificada
  (`docs/REFERENCES.md`).
- Guardas: capas, documentación y citas, evidencia de los parámetros, procedencia del código portado.
- Núcleo portado de VExUS (reloj, azar, unidades, vectores).

**Cierre**: `npm run check` y e2e en verde en CI; base de conocimiento revisada por Daniel.

## Fase 1 — Motor portado y primera imagen (v0.2.0)

Objetivos: O1, O2, O3, O7.

Se hace en tres pasos (decisión 10): **A**, la física en TypeScript (fisiología recortada, anatomía del
tórax, sonda y formación de la imagen) con sus pruebas, invariantes y metas A medidas; **B**, en dos: B1
vuelve a fijar el origen en el main de VExUS y pone al día lo portado (decisión 11), y B2 porta la GPU
(renderizador, pasadas y shaders), la app y el banco de fidelidad: la primera imagen, en dos PR (B2a, la GPU con
su equivalencia TS ↔ GLSL en la e2e, decisión 12; B2b, la app y la interfaz, decisión 13); **C**, la anatomía del
tórax con las dimensiones de la base, que hace cumplir las metas A (sus pruebas pasan a `it`).

- Portar de VExUS, con procedencia, el motor de imagen necesario: haz y PSF, moteado anclado al
  tejido, transmisión, receptor y mapa de grises, geometría del sector, pared en capas, costillas, pleura
  con su serie de reverberaciones y el deslizamiento, contacto y compresión de la sonda, modelo
  respiratorio y el grafo de pasadas WebGL2, con sus gemelos TS/GLSL y sus pruebas.
- Anatomía mínima: hemitórax anterior derecho con costillas, cartílagos, pared en capas, pleura y
  pulmón aireado, con las dimensiones de la base de conocimiento declaradas con `defineParameters`.
  Tórax a partir del tronco elíptico de VExUS, con costillas bilaterales y cartílago por costilla (no
  el mapa de alturas anterior de EchoTwin); marco y unidades de VExUS (decisión 7).
- De EchoTwin: guarda de niveles de prueba, espera de carga antes de la e2e y método de fidelidad
  adaptado (`docs/PROVENANCE.md`).
- Sonda libre (convexa) que encuentra el espacio intercostal moviéndose; signo del murciélago en
  longitudinal.
- Invariantes: las líneas A a múltiplos exactos de la profundidad de la pleura; el deslizamiento se
  mueve con el reloj respiratorio; la ganancia no cambia el estado físico.

**Cierre**: línea pleural, líneas A, sombra costal y deslizamiento reconocibles por un clínico;
equivalencia TS ↔ GLSL en e2e.

## Fase 2 — Física pulmonar propia (v0.3.0)

Objetivos: O1, O3.

- Campo de aireación subpleural: líneas B que emergen de la física (y no de una textura), líneas Z,
  consolidación con patrón tisular y broncograma estático o dinámico, derrame con sus signos.
- Modo M desde las mismas líneas del modo B y el mismo reloj: orilla de mar, código de barras,
  sinusoide. Cada columna se forma en su instante (tiempo por columna en la GPU), no desde una caché
  por fase cardíaca como en EchoTwin; partir del modo M de VExUS (su decisión 80, ya en el origen fijado:
  decisión 11).
- ts2glsl para la física escalar propia (decisión 8); desviaciones declaradas con línea base frente al
  banco de referencia.
- Sonda lineal de alta frecuencia; preajuste pulmonar (foco en la pleura, armónicos y composición
  apagables) con su efecto físico en los artefactos.
- Banco de fidelidad y primera prueba ciega contra el banco de referencia (decisión 5).

**Cierre**: prueba ciega con el rasgo que delata al simulador registrado y atacado.

## Fase 3 — Tórax completo (v0.4.0)

Objetivos: O2, O1, O5.

- Las zonas de exploración de ambos hemitórax (anteriores, laterales y posteriores, con la escápula),
  **adelantadas a la fase 1 por el requisito de cobertura de `docs/MISSION.md` (v0.2.0)**; bases con diafragma, hígado y bazo (signo de la cortina, imagen en espejo, signo de la columna).
- Neumotórax con su geometría y el punto pulmonar; pulso pulmonar desde el reloj cardíaco.
- Variantes de hábito corporal (delgado, obeso).
- Pendientes de anatomía de las decisiones 42 y 44: la cúpula como superficie propia (un casquete con su distancia y su
  normal) en lugar del techo horizontal de cada columna, que A0 dibuja como pleura rasante (`wall-cupola-transition`); las
  capas del cuello sobre ella con fuente (escalenos, esternocleidomastoideo, vasos subclavios); y la forma anterior de las
  costillas 2.ª–5.ª (`anterior-rib-shape`): en el modelo su punto más bajo está en la medioclavicular (u ≈ 96), por fuera de su
  unión condrocostal (u 64–84), y en la anatomía el tramo óseo sube hacia fuera desde ella y el cartílago va al esternón
  horizontal (2.º) o subiendo; la 2.ª baja 10,5 mm del esternón a la unión y 19,8 hasta la medioclavicular (por eso el BLUE
  superior cae en el EIC1). Corregirlo mueve las costillas 2.ª–4.ª en la medioclavicular hasta ≈ 19 mm y, con ellas, las vistas
  de medida y los puntos BLUE: decisión aparte con la recalibración (decisión 44).
- El corazón de EchoTwin (decisión 49). Fase 1, hecha: el corazón del caso normal, estático en telediástole, en la ventana
  cardiaca y la región paraesternal izquierda. Fase 2, hecha (decisión 53): el latido con el reloj único y el pulso pulmonar de
  la misma curva de volumen. Siguiente paso: el diafragma ajustado bajo el corazón (la decisión 229 de
  EchoTwin) en lugar del corte de la cúpula, que hoy deja en el abdomen ≈ 70 mL de lo que EchoTwin pone bajo el corazón (≈ 33 de
  ventrículo). Después: el pulso pulmonar que siga a la cara del corazón de EchoTwin (hoy, a la del elipsoide de la decisión 18),
  el latido sin GPU (una línea de tiempo más corta o en un trabajador) y la ventana que se achica al inspirar.

## Fase 4 — Clínica (v0.5.0)

Objetivos: O4, O5.

- Paciente virtual con estado pulmonar regional y casos de la base de conocimiento (normal, edema
  cardiogénico, SDRA, neumonía, neumotórax, derrame con atelectasia, intubación selectiva, perfil A en
  EPOC o TEP, entre otros).
- `measure/` y `lus/`: puntaje LUS y perfiles BLUE calculados sobre la señal; modo examen ciego; modo
  docente con verdad y medida lado a lado.
- Protocolos de insuficiencia cardiaca (28 sitios, 8 zonas y 4 sitios de estrés) con un mando hemodinámico: el usuario
  elige la PAI, la PD2VI, la PCWP o el agua extravascular, y las líneas B de cada sitio salen de la cadena presión → agua
  (con umbral y cinética) → reparto por gravedad → trampas subpleurales → señal → regla del protocolo. Propuesta, con sus
  anclas y lo no encontrado: `docs/HEART_FAILURE.md` (metas P-T30–T31 y C-T32). Necesita la física de las líneas B de la
  fase 2.
- Revisión clínica experta en ciego.

## Fase 5 — Puentes (v1.0.0)

Objetivos: O7, O4.

- Ventilador: el estado mecánico (PEEP, volumen corriente, reclutamiento) mueve la aireación regional;
  puntaje de reaireación.
- Ecografía diafragmática: excursión y fracción de engrosamiento.
- Contrato del paciente común con VExUS y EchoTwin, preparado para la unión (`docs/UNIFICATION.md`).
