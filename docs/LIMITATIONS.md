# Limitaciones

Este documento existe para que nadie use el simulador más allá de lo que hace. Cada punto lleva el
identificador que lo declara en `src/validation/limitations.ts` (la suite exige que ambos coincidan).
Cuando una limitación se resuelve, se borra de los dos sitios en el mismo cambio. Las heredadas de VExUS
conservan su identificador (decisiones 10 y 11).

## Estado del proyecto

- **La interfaz es mínima** (`ui-minimal`, decisión 13): solo el modo B con un paciente sintético (el adulto sano
  por omisión), sin casos, modo M, medición, modo docente ni navegador 3D; la sonda se mueve sin
  ver el tórax (los puntos de partida la llevan cerca de cada ventana). La anatomía del tórax con las dimensiones de
  la base llega en el paso C (`docs/ROADMAP.md`).

## Anatomía y fisiología

- **El marco anatómico es levógiro** (`left-handed-anatomy-frame`, decisión 7): x = izquierda del
  paciente, y anterior, z craneal, en mm, con el origen en el centro del tronco a la altura del xifoides.
  Una vista que dibuje la escena en un marco dextrógiro debe espejarla (VExUS lo hace en su navegador 3D);
  la conversión a EchoTwin es deuda de la unión.
- **Sin bazo ni costillas izquierdas** (`no-spleen-no-left-ribs`): todas las costillas son las derechas de
  VExUS (`rightOnly`); una ventana del hemitórax izquierdo no muestra sombras costales. `anatomy.test.ts`
  falla si se añade una costilla izquierda sin revisar esta limitación.
- **Solo las costillas 5.ª a 10.ª** (`ribs-5-10-only`): las de VExUS, con sus extremos anteriores a 40, 20,
  0, −25, −50 y −75 mm del xifoides (20–25 mm entre ellas) y 12 mm de ancho. Por encima de la 5.ª no hay
  costillas: en el punto BLUE superior (EIC2) no hay signo del murciélago, y los espacios intercostales y
  el periodo costal no son los de la base (metas A-T7 a A-T9 de `src/validation/anatomyTargets.test.ts`).
- **La pared del tórax es la del abdomen de VExUS** (`thorax-wall-abdominal-habitus`): piel 2 mm, grasa
  14 mm y músculo 12 mm, el mismo espesor (28 mm en la métrica radial) en todo el tronco. La pleura queda a
  25–28 mm de la piel, no a los 12–20 mm de la base, y la cara lateral no es más delgada que la anterior
  (metas A-T1 a A-T3).
- **La pared es genérica** (`wall-generic-layers`): el modelo de VExUS de tres músculos con dos planos
  intermusculares y grasa preperitoneal en todo el tronco, sin intercostales, pectoral, serrato ni
  paravertebrales propios; sin banda intercostal (meta A-T10) y la pared no cambia con la respiración.
  Las texturas, retrodispersiones y rugosidades de sus caras son [ESTIMADO] de VExUS.
- **Todo el tórax sobre las cúpulas es pulmón aireado** (`thorax-all-lung`): sin corazón, mediastino,
  grandes vasos ni escotadura cardíaca; tampoco hay ventana cardíaca paraesternal izquierda.
- **La cortina y la pleura parietal solo en el hemitórax derecho** (`lung-curtain-right-only`): la lámina
  del receso costofrénico es la de VExUS (lateral y posterior derecha) y la huella donde la imagen registra
  la pleura parietal acaba en x = 10 mm (`pleuraXMax`). En el hemitórax izquierdo el pulmón bajo la pared no
  registra pleura: la imagen del paso B no tendría allí línea pleural ni líneas A.
- **El abdomen es un tejido genérico** (`abdomen-generic-tissue`): bajo el diafragma queda el tejido por
  defecto de la clasificación de VExUS, su «resto» del abdomen (`Tissue.Bowel`), sin hígado, bazo, riñones,
  vesícula, vasos ni gas intestinal. La cara abdominal del diafragma conserva las propiedades de su cara
  hepática en VExUS. En la imagen es un moteado sin estructura: la textura del «resto» de VExUS
  (`restTexture`) no se porta (decisión 12), y con el preajuste pulmonar queda casi negro (mediana 0–8 de gris
  bajo la cúpula). El hígado vuelve en la fase 3 como módulo portado.
- **El deslizamiento es una traslación caudal uniforme** (`sliding-uniform-caudal`): el pulmón bajo la
  pleura baja lo mismo que el diafragma en todo el tórax (el descenso del diafragma, 10 mm en respiración
  tranquila y 30 en profunda), no más en las bases que en los vértices como en la base de conocimiento, y
  no se mueve con el latido (sin pulso pulmonar).

## Sonda

- **Solo la sonda convexa de 3,5 MHz** (`convex-probe-only`): la de VExUS (radio 60 mm, ±34°, 192 líneas).
  Las metas de anatomía de la base son para una sonda lineal de 38–40 mm y se miden, por ahora, con esta.
  La lineal de alta frecuencia llega en la fase 2.
- **La compresión de la sonda es cinemática, no elástica** (`probe-compression-kinematic`): no hay
  rigideces ni fuerza. La sonda se hunde a lo largo de su eje lo que haga falta para que apoye toda la cara,
  con un tope de presión [ESTIMADO] que depende de la blandura de la pared; la pared entera, con las
  costillas, se empuja como un bloque (no se comprime) y el tejido de debajo absorbe el empuje. Sin
  histéresis ni viscoelasticidad.
- **La compresión solo mueve el tejido a lo largo de las líneas de la cara** (`probe-compression-in-plane`):
  es radial en el plano de la cara, plana en elevación y lineal a tramos entre los 64 nodos de la cara;
  donde la pared no queda paralela a la cara con la presión máxima, la línea no acopla (los bordes de un
  corte transversal de la pared lateral, más allá de ±20,5°).

## Imagen (física en TypeScript y, desde el paso B2a, en la GPU)

- **Sin líneas B ni colas de cometa** (`no-lung-comet-tails`): el pulmón bajo la pleura es la serie de
  reverberaciones de la pared y el deslizamiento incoherente; no hay líneas Z ni B, ni pulmón patológico. La
  física de las líneas B es de la fase 2.
- **La serie bajo la pleura remuestrea la pared en la misma línea** (`pleura-series-same-line`): las copias
  de la pared y las líneas A se forman con la pared del propio camino, no con la de la dirección reflejada
  por una pleura oblicua; las líneas A llevan el lóbulo de Kirchhoff una sola vez y tienen la anchura de la
  línea pleural.
- **El eco de interfaz es solo la parte coherente de una cara lisa** (`interface-echo-coherent-only`): sin
  destellos ni parte difusa de las superficies rugosas, una cara por estructura y sin interferencia de capa
  fina; su nivel sale de K = 55 dB, que se calibra con la GPU.
- **Las líneas A no están a múltiplos de la línea pleural mostrada** (`pleura-echo-offset`): la cara de la pleura
  parietal es de un lado (`IF_PLEURA_WALL`, la dibuja la pared, decisión 61 de VExUS) y su perfil se desplaza
  2,5σh = 0,35 mm dentro de su dueña; las líneas A son réplicas de ese perfil, así que toda la serie se dibuja 0,35 mm
  por encima de k·D (D, el cruce de la pleura), con la separación entre órdenes exacta (≤ 0,084 mm). Frente a la línea
  pleural mostrada el error crece con el orden, 0,35·(k − 1): medido en la envolvente de la GPU (decisión 12), el orden
  2 a +0,27…+0,39 mm, el 3 a +0,56…+0,76 y el 4 a +0,87…+1,13. **No cumple la meta F-T01** (±0,5 mm o un píxel) en los
  órdenes 3 y 4, y un alumno que mida la profundidad de la pleura y la de la línea A de orden 3 verá una diferencia de
  0,7 mm. `e2e/imagen.spec.ts` exige el fallo con su tamaño: corregirlo obliga a cambiar la prueba y esta limitación a
  la vez. Las opciones de la corrección están en la decisión 12; la fase 1 no cierra sin ella.
- **Estadística del moteado sin calibrar** (`speckle-statistics-uncalibrated`): la célula, la SNR local y la
  asimetría del moteado no se han medido contra clips reales de pulmón; el banco de referencia (decisión 5)
  lo hará.
- **Lóbulos laterales simplificados, sin lóbulos de rejilla ni en elevación** (`no-sidelobes`, heredada con
  `src/ultrasound/clutter.ts`, decisión 11): el núcleo lateral lleva un pedestal gaussiano con una pantalla de
  fase fija (ISLR −24 dB con los 14 mm de grasa del paciente por omisión), no el diagrama real de la apertura; la
  reverberación de la pared es de primer y segundo orden y solo de los ecos fuertes (compuerta por el módulo del
  campo, no por la cara que la produce). En el tórax la pleura es la cara interna de la pared, así que sus réplicas
  caen a W y 2W bajo ella (W, el grosor de la pared, es casi la profundidad de la pleura), junto a las líneas A que la
  serie de reverberaciones ya forma: una doble cuenta. Medida en la GPU (decisión 12), la réplica de la línea pleural
  queda dentro de la línea A de orden 2 en unas 440 de 576 líneas de los tres puntos de partida (27–31 dB por debajo: el
  perfil cambia 0,02 dB) y, donde la compresión deja la pleura más alta que W (el centro del punto BLUE superior),
  1,5–2,8 mm por debajo de ella, 44 dB más débil, subiendo 3,2 dB el fondo oscuro que sigue a la línea A.
- **Armónica tisular simplificada** (`harmonic-simplified`, heredada con `src/ultrasound/harmonic.ts`,
  decisión 11): la acumulación del armónico es una curva fija del campo cercano (1 − e^(−r/2 mm), compensada desde
  4 mm), no la integral del haz con su foco; las líneas A y la cola del gas no cambian con la armónica; el eje axial
  conserva la banda del fundamental; la pérdida de conversión es +3 dB de ruido del receptor, y no hay penumbra
  armónica. En el pulmón pesa más que en el abdomen: la base pide que la armónica baje el contraste de las líneas B
  (meta F-T24 de `docs/knowledge/physics.md`) y el preajuste pulmonar la apaga [@volpicelli-actualizacion-2026].
