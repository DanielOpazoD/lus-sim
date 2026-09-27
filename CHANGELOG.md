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
  BLUE inferior y PLAPS derechos.
- e2e de la imagen (`e2e/imagen.spec.ts`): equivalencia TS ↔ GLSL en el tórax (planos, volumen, caras, pleura de A0,
  normales y transmisión, en reposo y en inspiración), estadística de Rayleigh del moteado del músculo de la pared y
  líneas A en la envolvente de la GPU (su separación, y F-T01 frente a la línea pleural mostrada: el fallo conocido de los
  órdenes 3 y 4 hasta la decisión 15, que la cumple), cada guarda comprobada con una mutación.
- Limitación `pleura-echo-offset`: la serie de la pleura se dibuja 0,35 mm por encima de su cruce y las líneas A de
  orden 3 y 4 no cumplen F-T01 frente a la línea pleural mostrada (+0,56…+1,13 mm); la prueba exige el fallo.
- Fase 1, paso B2b: la aplicación con una interfaz mínima del modo B (13): la imagen del tórax a la vista con la
  sonda libre (ratón, trackpad, teclado y táctil), los puntos de partida BLUE superior, BLUE inferior y PLAPS, la
  consola (imagen, sonda, respiración y avanzado), el HUD, los atajos, congelar con el cine, el informe técnico exportable, la
  recuperación de la pérdida del contexto WebGL y el aviso de que no es un dispositivo médico.
- e2e de humo de la aplicación (`e2e/smoke.spec.ts`) y pruebas de la interfaz sin DOM, cada guarda con su mutación.
- Sombra costal medida en la envolvente de la GPU (meta F-T08, `e2e/imagen.spec.ts`), con la penumbra de la pasada A:
  la intensidad media de cada sombra (−37…−39 dB del eco pleural intercostal) cumple, y la pleura visible cerca del borde
  es la penumbra de la apertura; bajo el centro de la costilla la línea pleural aún se ve gris y la línea A, tenue
  (limitación nueva `rib-shadow-pleura-residual`, la prueba exige el fallo). En TypeScript, la pleura a 7,2–8,8 mm bajo la
  cresta costal (F-T08 pide 4–6) y la línea base de las costillas y los espacios intercostales, en la anatomía y en la
  imagen, como metas del paso C.
- Fase 1, paso C1: la parrilla costal del adulto promedio (16): 12 costillas numeradas por hemitórax, bilaterales, con sus
  cartílagos (1–7 al esternón, 8–10 al de arriba, 11–12 libres), el esternón (manubrio, cuerpo y xifoides) y 11 espacios
  intercostales por lado con sus anchos por nivel y región (EIC2/3/4/5 de la medioclavicular 18/14/14/15 mm; paraesternales
  18,1 y 12,3; laterales bajos 17; posteriores bajos 16; 9,3 junto a la columna), costillas de 14 mm con la pleura 5 mm bajo
  su cresta y la oblicuidad de la base (la 7.ª baja 102,9 mm y 36,2°; la línea de Treves); las uniones condrocostales bajo
  la línea de piel, hacia fuera de la 1.ª a la 10.ª, con los cartílagos que alargan hasta la 7.ª y acortan después.
  Módulos nuevos `src/anatomy/organs/ribcage.ts` (TS y GLSL; la tabla de alturas en la textura de escena) y
  `src/anatomy/thoraxLines.ts`; el signo del murciélago aparece en el punto BLUE superior. Pruebas: las cuentas por línea
  (sin costillas fundidas), los anchos en la anatomía y en la imagen, la simetría, A-T7 en los espacios de cada línea,
  A-T8, A-T9, A-T19 y la geometría de F-T08 pasan a cumplirse; A-T13 y los EIC visibles altos, medidos y pendientes;
  `src/validation/ribcage.test.ts`; la equivalencia TS ↔ GLSL en los extremos de las 24 costillas (`ribEnds`).
- Limitaciones nuevas `thorax-cylindrical-cage`, `rib-section-uniform` y `lung-border-above-ribcage` (16).
- Fase 1, paso C2: la pared torácica por región y por hábito (17): el estado ecográfico de la base por estación (16 mm en
  EIC2-LMC, 12,8 en EIC5 LAA/LAM, 18 en la axila alta, 16 infraescapular) con sus capas (piel, grasa, pectoral, serrato o
  dorsal, banda intercostal y complejo pleural), la banda intercostal que engruesa delante al inspirar y las variantes
  delgada, obesa y mujer (`habitus.chest`). Módulo nuevo `src/anatomy/organs/chestWall.ts` (TS y GLSL; la tabla en la
  textura de escena). Las cúpulas y la cortina siguen la cara interna de la pared y la pleura se ilumina con la normal de
  su cara. A-T1–A-T5 y A-T10 pasan a cumplirse (A-T13 sigue pendiente, paso C3); `src/validation/chestWall.test.ts`.
- Limitación nueva `chest-wall-regional-approx` (17).

### Cambiado

- Lo portado de VExUS, al día con `8e83d9a` (11): la PEEP sube la presión pleural también con respiración espontánea
  (CPAP) y el motor pasa a la respiración la del paciente en cada paso; el haz, la elevación y la composición admiten
  la armónica (en fundamental no cambian); el gemelo de los ecos de interfaz lleva el pedestal de lóbulos laterales; el
  presupuesto del bundle deja fuera del total los chunks de solo pruebas; `CONTRIBUTING.md` remite a la misión.
- El presupuesto del chunk principal sube de 40 a 160 kB con la GPU portada (148,5 kB medidos) (12).
- `no-sidelobes` lleva la doble cuenta de la reverberación de la pared medida en la GPU (12).
- El presupuesto del chunk principal sube a 180 kB con la interfaz (172,5 kB medidos) (13).
- Lo portado de VExUS, al día con `c6c81ad` (14): el build quita del GLSL los espacios y los saltos de línea que no
  separan nada (tercera etapa del minificado, `tools/build/glslCompact.ts`; el chunk principal baja de 172,5 a 163,5
  kB), la tabla de tejidos lleva los tres del retroperitoneo de VExUS al final (sin uso en el tórax) y la pared que copia
  la serie de la pleura usa la base del campo de dispersores. La imagen no cambia; el retroperitoneo y los casos trampa
  del origen no se portan.
- Las líneas A caen a múltiplos exactos de la línea pleural mostrada (meta F-T01) (15): la línea pleural y sus réplicas se
  dibujan centradas en su cruce, no 0,35 mm por encima. Medido en la envolvente de la GPU, el orden 4 pasa de
  +0,87…+1,13 mm a −0,19…+0,05 mm de 4 veces la línea pleural; la e2e exige la meta en los órdenes 1–4.
- Paso C1 (16): los puntos BLUE superior (centro del EIC2 de la medioclavicular, a 95 mm de la línea media) e inferior
  (centro del EIC4 de la axilar anterior) sobre la parrilla nueva; el cartílago costal atenúa 2,45 dB/cm/MHz (el rango alto
  de la base; antes 0,9); F-T08 medida de nuevo en la GPU (cada sombra a −34,7…−39,2 dB del eco intercostal; en su núcleo la
  línea pleural aún a −40,8…−41,7 dB, `rib-shadow-pleura-residual`); el moteado de la e2e, en siete vistas paraesternales;
  las líneas A, solo con pulmón detrás de la pleura. El presupuesto del chunk principal sube a 195 kB (186,8 kB medidos).

- Paso C2 (17): el foco del preajuste pulmonar sigue a la pleura (25 → 16 mm; el mínimo del equipo baja a 8); el contacto
  de la sonda toma la pared de cada línea; la e2e exige los órdenes 1–4 de las líneas A de los 6–7 que caben y mide la sombra
  costal con el núcleo a más de 10 líneas del borde; la equivalencia del volumen compara la distancia al borde donde es
  continua. El presupuesto del chunk principal sube a 210 kB (203,4 medidos) y el del total a 215.

### Quitado

- La limitación `no-image-yet`: la imagen está a la vista (13); la sustituye `ui-minimal`.
- La limitación `pleura-echo-offset`: las líneas A cumplen F-T01 (15).
- Las limitaciones `ribs-5-10-only` y `no-spleen-no-left-ribs` (el bazo sigue en `abdomen-generic-tissue`): la parrilla
  costal del adulto promedio (16).
- La limitación `thorax-wall-abdominal-habitus`: la pared torácica por región (17).

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
