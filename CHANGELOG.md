# Historial de cambios

Formato de [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones semánticas. Los detalles
de cada decisión están en `docs/DECISIONS.md` (número entre paréntesis).

## [Sin publicar]

### Añadido

- El vértice (27): la cúpula pleural sobre la 1.ª costilla (la pared engruesa hasta cerrarse a 25 mm sobre el tercio medial de
  la clavícula, Gray) y la clavícula subcutánea con su sombra (15,6 cm y 14 mm, Yang). La fosa supraclavicular ve la cúpula
  con su pleura; el pulmón ya no sube hasta el tope del tronco. Metas A-T23 y A-T24. Cobertura de exploración: 62 → 68 de 138.

- Cobertura de exploración (26): una prueba por celda del tórax (EIC 1.º–11.º de las líneas paraesternal, medioclavicular,
  axilares, escapular y paravertebral, por hemitórax; el vértice en todo el corte y la fosa supraclavicular) con lo que la base
  pone en cada una (pulmón con pleura, ventana cardiaca, escápula, o diafragma con el hígado o el bazo), y el indicador N/M en
  el informe técnico. En main, 62 de 138: falta la cara posterior (la sonda no llega en supino), el vértice (el pulmón sube
  hasta el tope del tronco) y el órgano bajo el diafragma (abdomen genérico). Línea escapular a 85 mm de la línea media.

- C3b-A, calibración preliminar del contraste normal (24): protocolo fijo de tres réplicas por rango dinámico y punto de
  partida, registro de parámetros y comparación por sujetos separados. Ajuste K = 54 dB, R_t = 0,3 y ganancia −20 dB:
  mejora modesta del gris de pared y neblina, con pruebas de sombras y líneas A conservadas; la fidelidad sigue abierta.
  La prueba anatómica `maxTotal` acumula el peor exceso antes de afirmarlo, conservando escenas, rejilla, tolerancias y
  detección de no finitos, para evitar millones de llamadas de aserción.

- Adquisición con navegación torácica 3D (23): transductor y plano desde el marco efectivo, desplazamiento
  continuo y cine con pose y respiración históricas. Dos superficies, barra compacta de profundidad/ganancia/foco,
  ajustes contextuales y navegador plegable en móvil. Corrige profundidad de 65 mm, límite del foco,
  Espacio sobre botones y sincronización del contacto sin paso de reloj; HUD estable y FPS de tiempo real.

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
- Fase 1, paso C3: pulmón y pleura en los dos hemitórax (18): el borde del pulmón en FRC de Gray (la 6.ª costilla en la
  LMC, la 8.ª en la LAM, T10 detrás) y la reflexión pleural (el 8.º cartílago, la 10.ª costilla, T12) por columna de la pared
  (`src/anatomy/organs/lungBorder.ts`), con la cúpula que baja a la pared en el borde y sus vértices de la base en FRC; la
  cortina y la pleura parietal en los dos hemitórax; la zona de aposición del diafragma (1,9 mm en FRC, 5 a TLC); el corazón
  y la ventana cardiaca paraesternal izquierda (`src/anatomy/organs/heart.ts`, tejido nuevo: el miocardio). A-T12, A-T14,
  A-T15, el borde y la reflexión de A-T13 y la ventana de A-T16 pasan a cumplirse; la excursión profunda de A-T13 y el
  pulso pulmonar de A-T16, medidos y pendientes.
- Limitaciones nuevas `heart-simplified` y `lung-border-table`; se borran `thorax-all-lung`, `lung-curtain-right-only` y
  `lung-border-above-ribcage` (18).
- Fase 1, paso C4: el deslizamiento por región (19): el pulmón bajo la pleura baja más en la base que en el vértice, en
  recta con la altura sobre el borde de su columna y sin pasar de lo que baja el borde (el cociente de Briganti, F-T12).
  Limitación `sliding-linear-height` en lugar de `sliding-uniform-caudal`. La excursión de la base en supino y los puntos
  BLUE por la regla de las manos quedan pendientes.
- El campo respiratorio invertible por construcción y la excursión de la base (22): el diafragma baja 16 mm en la respiración
  tranquila y 53 en la profunda (la base en supino; 47 en la mujer; antes 10 y 30), y la cortina de la LAM con él (A-T13 pasa a
  cumplirse). El campo es caudal con la ley de altura del pulmón (1 bajo la cúpula, 0 a 147 mm por encima) y mira una pared cuyo
  paso al abdomen no engruesa más de 0,1 mm/mm (`anatomy.respiratoryWall.slopeMax`): su jacobiano es ≥ 0,57 en todo el tronco
  con 53 mm y ≥ 0,39 con 75, con cualquier hábito (antes, con 53, negativo en ≈ 350 cm³); su inversa, una bisección de 10 pasos
  en la vertical, exacta a 0,026 mm en el punto material (antes, dos pasos de punto fijo que erraban hasta 15 mm con 30).
  `src/validation/respiratoryField.test.ts` (fast-check, con sus mutaciones) y la equivalencia de la e2e en inspiración profunda
  con la ventana cardiaca, el borde de la LAM izquierda y la cortina derecha. Limitación nueva `respiratory-field-vertical`
  (entre otras cosas, la cúpula izquierda baja el 35 % de la excursión: meta pendiente).
- Ciclo 3a, el banco de fidelidad (21): métricas de imagen puras (`src/measure/fidelity/`), las mismas para la pantalla del
  simulador y para los clips reales: la pleura, las sombras costales y las líneas A detectadas sin verdad de terreno; las del
  patrón normal de `docs/knowledge/reference-images.md` §3.2 (P1, P2, P4, A1, A2, T1, T2, S1) y las propuestas sin suelo (M, el
  nivel de la pared, de la neblina subpleural y del campo profundo en caídas pleura → línea A, y N4, el cociente de brechas),
  con la censura de todo lo recortado hasta la comparación (una cota nunca sale ↓ ni ↑). Los niveles sobre el suelo de la
  sombra (N1–N3) se miden pero no se comparan: con el suelo en el negro dependen de la ganancia. Invariancia afín con
  fast-check (200 corridas: continua con a ∈ [0,05; 3], en 8 bits y la tubería del banco) y mutaciones del código. El gancho
  `fidelity` y `e2e/fidelidad.spec.ts` miden la imagen mostrada en los tres puntos de partida (con la geometría verdadera y la
  detectada) y barren la ganancia de −30 a −12 dB; `npm run fidelity:ref` mide el banco de referencia real, fuera del repo
  (34 clips, con los 24 convexos de 4 sujetos de Born), con la geometría fijada en el manifiesto, compuertas automáticas y
  estratos entre clips y entre sujetos, y escribe solo estadísticas derivadas (`docs/reference-bank/reference-stats.json`);
  `npm run fidelity:compare` da la tabla frente al simulador y `npm run fidelity:geometry` las propuestas de geometría con sus
  hojas de contacto, fuera del repo. `LUS_E2E_GPU=1` corre la e2e con la GPU real. Limitación nueva `display-uncalibrated`.

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
- La e2e del CI en cinco fragmentos paralelos con un trabajador cada uno: de 10–14 min a unos 3 min de reloj; la prueba de
  la pérdida del contexto WebGL espera 90 s a la línea pleural (antes 150).

- La costilla apaga la pleura (meta F-T08) (20): la pasada A suma el cono de la apertura con la fase que el hueso añade a cada
  toma (la costilla es una lente; su cuerda exacta sale de A0), los lóbulos laterales de la pasada D ven lo de al lado a través
  de lo que la apertura de su línea tiene delante, el hueso atenúa a la frecuencia del pulso que le llega (3,26 MHz) y sus caras
  cuestan cuatro cruces (7,42 dB), y el preajuste pulmonar no satura la línea pleural (−21 dB de ganancia; el equipo baja hasta
  −40). En el núcleo de la sombra la línea pleural pasa de −40,6…−62,7 a −68,7…−86,1 dB del eco intercostal y de gris 57–137 al
  negro de la pantalla; la línea A, del gris al negro en toda la sombra completa. Coste del cuadro en el M4: 2,5 → 3,1 ms.
  F-T05 (la línea pleural con la anchura del pulso axial, ±20 %) se exige en el gemelo; A-T11 sigue sin cumplirse.
- Con la excursión de la base (22), el deslizamiento en la respiración tranquila pasa a 16 mm en la base, 8,7 en el punto BLUE
  inferior, 8,4 en el PLAPS y 6,7 en el superior (antes 10, 5,4, 5,2 y 4,2; F-T12 no cambia; la media de 12 campos, 9,3 mm
  frente a los 5,4 ± 2,5 de D5 en sanos, +1,5 DE; declarado en `sliding-linear-height`); el campo respiratorio baja en −z,
  sin la componente anterior de VExUS, y el pulmón sobre la cúpula baja menos cuanto más alto. Coste del cuadro en el M4, el
  mismo (3,2–3,3 ms).

### Quitado

- La limitación `no-image-yet`: la imagen está a la vista (13); la sustituye `ui-minimal`.
- La limitación `pleura-echo-offset`: las líneas A cumplen F-T01 (15).
- Las limitaciones `ribs-5-10-only` y `no-spleen-no-left-ribs` (el bazo sigue en `abdomen-generic-tissue`): la parrilla
  costal del adulto promedio (16).
- La limitación `thorax-wall-abdominal-habitus`: la pared torácica por región (17).
- La limitación `rib-shadow-pleura-residual`: bajo la costilla no se ven la línea pleural ni las líneas A (20); la sustituye
  `rib-acoustics-simplified`, lo que el modelo de la costilla aún simplifica.
- La limitación `respiratory-inverse-fixed-point`: la inversa del campo respiratorio es exacta (22); la sustituye
  `respiratory-field-vertical`, lo que el campo aún simplifica.

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
