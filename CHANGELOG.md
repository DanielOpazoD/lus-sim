# Historial de cambios

Formato de [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones semánticas. Los detalles
de cada decisión están en `docs/DECISIONS.md` (número entre paréntesis).

## [Sin publicar]

### Añadido

- Fase 1, paso A: el motor de imagen de VExUS portado en TypeScript con cortes para el tórax (10). Fisiología
  recortada (núcleo del paciente, ritmo, respiración y motor con el reloj único), anatomía del tórax (tejidos,
  caras de interfaz, primitivas, compresión, deformación, pared en capas, costillas, diafragma, cortina y
  pulmón), sonda con su contacto (pose por omisión en el punto BLUE superior) y la física de la imagen (haz,
  receptor, moteado anclado, eco de interfaz, pared, pleura con su serie de reverberaciones y el
  deslizamiento, miradas dirigidas, transmisión, apertura y composición), con su procedencia fila a fila.
- Pruebas del motor: el arnés de VExUS con las cifras del tórax, invariantes físicas con su mutación (líneas A
  a múltiplos de la pleura y decrecientes, energía en una interfaz y reflectividad acotada, la pleura de A0 en el
  cambio de tejido, la sonda que solo empuja, el deslizamiento con el reloj, misma semilla) y las metas A de la fase medidas en la escena heredada (las que aún no se cumplen exigen
  fallar por su aserción).
- Limitaciones heredadas y nuevas con identificador (costillas solo derechas y solo 5.ª–10.ª, pared del
  abdomen, cortina solo derecha, abdomen genérico, pulmón sin líneas B, sonda convexa, entre otras).
- Fase 1, paso B1: el origen de VExUS vuelve a fijarse en su main `8e83d9a` (11). Se portan la armónica
  tisular (`src/ultrasound/harmonic.ts`) y los ecos parásitos del modo fundamental (`src/ultrasound/clutter.ts`:
  pedestal de lóbulos laterales y reverberación de la pared), con sus pruebas en TypeScript, y sus limitaciones con el
  id de VExUS (`no-sidelobes`, `harmonic-simplified`).
- Fase 1, paso B2a: la formación de imagen en la GPU portada de VExUS con cortes para el tórax (12): el renderizador
  WebGL2 con su grafo de pasadas, el cine y el modo M, la anatomía GLSL de la escena del tórax en el orden de
  clasificación de VExUS, el minificador y el renombrado del GLSL en el build, el equipo en modo B con el preajuste
  pulmonar del consenso de 2026 y la compensación nominal de la pared torácica, y los puntos de partida BLUE superior,
  BLUE inferior y PLAPS derechos. Sin imagen a la vista todavía: la ve el banco de la e2e (`?e2e`).
- e2e de la imagen (`e2e/imagen.spec.ts`): equivalencia TS ↔ GLSL en el tórax (planos, volumen, caras, pleura de A0,
  normales y transmisión, en reposo y en inspiración), estadística de Rayleigh del moteado del músculo de la pared y
  líneas A en la envolvente de la GPU (su separación, y F-T01 frente a la línea pleural mostrada, con el fallo conocido
  de los órdenes 3 y 4), cada guarda comprobada con una mutación.
- Limitación `pleura-echo-offset`: la serie de la pleura se dibuja 0,35 mm por encima de su cruce y las líneas A de
  orden 3 y 4 no cumplen F-T01 frente a la línea pleural mostrada (+0,56…+1,13 mm); la prueba exige el fallo.

### Cambiado

- Lo portado de VExUS, al día con `8e83d9a` (11): la PEEP sube la presión pleural también con respiración espontánea
  (CPAP) y el motor pasa a la respiración la del paciente en cada paso; el haz, la elevación y la composición admiten
  la armónica (en fundamental no cambian); el gemelo de los ecos de interfaz lleva el pedestal de lóbulos laterales; el
  presupuesto del bundle deja fuera del total los chunks de solo pruebas; `CONTRIBUTING.md` remite a la misión.
- El presupuesto del chunk principal sube de 40 a 160 kB con la GPU portada (148,5 kB medidos) (12).
- `no-sidelobes` lleva la doble cuenta de la reverberación de la pared medida en la GPU (12).

## [0.1.0] — 2026-09-26 — fase 0: cimientos

### Añadido

- Fase 0, cimientos: repositorio con la pila y las herramientas de VExUS (2), integración continua
  (`check` y e2e), núcleo portado de VExUS con registro de procedencia y medición de deriva (3),
  registro de evidencia de los parámetros (4), guardas de capas, documentación, bibliografía y
  procedencia, y documentos rectores: guía de desarrollo, base de conocimiento, arquitectura, hoja de
  ruta y plan de unión con VExUS y EchoTwin (1, 5, 6).
- Base de conocimiento (fase 0): física de la imagen pulmonar, anatomía cuantitativa del tórax,
  fisiopatología para el paciente virtual, clínica y banco de imágenes de referencia, con bibliografía
  verificada y deduplicada (`docs/REFERENCES.md`), metas de prueba ordenadas por fase y vacíos de
  conocimiento declarados.
- Clínica al día con textos completos aportados por Daniel: la actualización 2025 del consenso
  internacional (Intensive Care Med 2026), el consenso EACVI de insuficiencia cardiaca (2023), las
  guías de Demi y cols. (2023) y revisiones de neumonía, UCI, urgencias e integración con la
  ecocardiografía; atribuciones a fuentes corregidas donde el texto no las respaldaba.
- Marco anatómico y unidades de VExUS (7); ts2glsl para la física escalar propia (8).
- Guardas de documentación: scripts de npm citados que existen, documentos de tema enlazados desde
  `docs/KNOWLEDGE.md`, citas `[@clave]` que existen y bibliografía sin entradas huérfanas.

- Misión y objetivos medibles (`docs/MISSION.md`) como criterio de prioridad; cada PR declara qué
  objetivo mueve (9).

### Cambiado

- CI: el check `check` que exige la protección de `main` agrega la verificación y la e2e.
