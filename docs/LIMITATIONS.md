# Limitaciones

Este documento existe para que nadie use el simulador más allá de lo que hace. Cada punto lleva el
identificador que lo declara en `src/validation/limitations.ts` (la suite exige que ambos coincidan).
Cuando una limitación se resuelve, se borra de los dos sitios en el mismo cambio. Las heredadas de VExUS
conservan su identificador (decisión 10).

## Estado del proyecto

- **Todavía no hay imagen** (`no-image-yet`): la fase 1 porta el motor de VExUS en tres pasos
  (decisión 10). El paso A deja la física en TypeScript (fisiología, anatomía del tórax, sonda y formación
  de la imagen, con sus pruebas); la imagen en la GPU llega en el paso B y la anatomía del tórax con las
  dimensiones de la base, en el paso C (`docs/ROADMAP.md`).

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
  hepática en VExUS. El hígado vuelve en la fase 3 como módulo portado.
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

## Imagen (física en TypeScript; la GPU llega en el paso B)

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
- **Estadística del moteado sin calibrar** (`speckle-statistics-uncalibrated`): la célula, la SNR local y la
  asimetría del moteado no se han medido contra clips reales de pulmón; el banco de referencia (decisión 5)
  lo hará.
