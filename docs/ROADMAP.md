# Hoja de ruta

Fases verticales (guía §21): cada una termina con algo que funciona de punta a punta, una evaluación
por revisores adversariales de contexto limpio (ingeniería, física de la imagen y clínica) con nota
sobre 7, y una versión etiquetada. El orden puede cambiar con lo que muestre cada evaluación; los
cambios quedan en `docs/DECISIONS.md`.

## Fase 0 — Cimientos (v0.1.0)

- Repositorio público con CI (`check` + e2e), protección de `main` y las herramientas de VExUS.
- Documentos rectores: `docs/GUIDE.md` y `docs/KNOWLEDGE.md` con bibliografía verificada
  (`docs/REFERENCES.md`).
- Guardas: capas, documentación y citas, evidencia de los parámetros, procedencia del código portado.
- Núcleo portado de VExUS (reloj, azar, unidades, vectores).

**Cierre**: `npm run check` y e2e en verde en CI; base de conocimiento revisada por Daniel.

## Fase 1 — Motor portado y primera imagen (v0.2.0)

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

- Campo de aireación subpleural: líneas B que emergen de la física (y no de una textura), líneas Z,
  consolidación con patrón tisular y broncograma estático o dinámico, derrame con sus signos.
- Modo M desde las mismas líneas del modo B y el mismo reloj: orilla de mar, código de barras,
  sinusoide. Cada columna se forma en su instante (tiempo por columna en la GPU), no desde una caché
  por fase cardíaca como en EchoTwin; coordinar con el modo M que VExUS tiene en curso.
- ts2glsl para la física escalar propia (decisión 8); desviaciones declaradas con línea base frente al
  banco de referencia.
- Sonda lineal de alta frecuencia; preajuste pulmonar (foco en la pleura, armónicos y composición
  apagables) con su efecto físico en los artefactos.
- Banco de fidelidad y primera prueba ciega contra el banco de referencia (decisión 5).

**Cierre**: prueba ciega con el rasgo que delata al simulador registrado y atacado.

## Fase 3 — Tórax completo (v0.4.0)

- Las zonas de exploración de ambos hemitórax (anteriores, laterales y posteriores, con la escápula),
  bases con diafragma, hígado y bazo (signo de la cortina, imagen en espejo, signo de la columna).
- Neumotórax con su geometría y el punto pulmonar; pulso pulmonar desde el reloj cardíaco.
- Variantes de hábito corporal (delgado, obeso).

## Fase 4 — Clínica (v0.5.0)

- Paciente virtual con estado pulmonar regional y casos de la base de conocimiento (normal, edema
  cardiogénico, SDRA, neumonía, neumotórax, derrame con atelectasia, intubación selectiva, perfil A en
  EPOC o TEP, entre otros).
- `measure/` y `lus/`: puntaje LUS y perfiles BLUE calculados sobre la señal; modo examen ciego; modo
  docente con verdad y medida lado a lado.
- Revisión clínica experta en ciego.

## Fase 5 — Puentes (v1.0.0)

- Ventilador: el estado mecánico (PEEP, volumen corriente, reclutamiento) mueve la aireación regional;
  puntaje de reaireación.
- Ecografía diafragmática: excursión y fracción de engrosamiento.
- Contrato del paciente común con VExUS y EchoTwin, preparado para la unión (`docs/UNIFICATION.md`).
