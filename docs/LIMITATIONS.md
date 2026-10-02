# Limitaciones

Este documento existe para que nadie use el simulador más allá de lo que hace. Cada punto lleva el
identificador que lo declara en `src/validation/limitations.ts` (la suite exige que ambos coincidan).
Cuando una limitación se resuelve, se borra de los dos sitios en el mismo cambio. Las heredadas de VExUS
conservan su identificador (decisiones 10 y 11).

## Estado del proyecto

- **Adquisición normal, alcance docente inicial** (`normal-acquisition-only`, decisión 23): modo B con un adulto
  sintético, navegador torácico 3D y cine con pose y respiración históricas. Con línea M a cadencia de B y calibre manual (`docs/MMODE.md`, `docs/REVIEW.md`);
  sin casos patológicos ni modo docente/examen. Los puntos BLUE son referencias aproximadas derechas, no posiciones
  anatómicas universales ni una garantía de obtener la ventana correcta. Cambiar la profundidad inicia un
  cine nuevo para evitar mezclar persistencia entre escalas polares distintas; no hay revisión continua
  entre profundidades diferentes.
- **Navegador paramétrico** (`navigator-parametric`, decisión 23): muestra la superficie y referencias que utiliza
  el motor, con las simplificaciones de `thorax-cylindrical-cage`. No es un atlas segmentado ni amplía la cobertura
  posterior permitida por la pose. Desde la decisión 25, un maniquí procedural añade cabeza, hombros,
  brazos y terminación abdominal no explorables. La piel funcional conserva la elipse acústica y muestra
  el contacto del cuadro por la deformación existente; entre vértices es una aproximación teselada.
  Las costillas opcionales permanecen como guía en reposo. La carcasa y cable son contexto de interfaz,
  no nuevos transductores ni una simulación mecánica del cable. La lente y el plano se calculan con la
  geometría activa y el marco efectivo de la adquisición. La cuerda activa derivada es 67,10 mm frente
  al ancho nominal de 62 mm: se documenta, no se concilia cambiando la física por estética.
  La validación con participantes y la fluidez en GPU de usuario requieren medición; SwiftShader
  comprueba comportamiento, no rendimiento de un Mac o iPhone.

## Anatomía y fisiología

- **El marco anatómico es levógiro** (`left-handed-anatomy-frame`, decisión 7): x = izquierda del
  paciente, y anterior, z craneal, en mm, con el origen en el centro del tronco a la altura del xifoides.
  Una vista que dibuje la escena en un marco dextrógiro debe espejarla (VExUS lo hace en su navegador 3D);
  la conversión a EchoTwin es deuda de la unión.
- **La parrilla forra un tronco cilíndrico** (`thorax-cylindrical-cage`, decisión 16): el tronco es el cilindro elíptico
  de VExUS a todas las alturas (320 × 210 mm de piel en VExUS; en lus-sim, desde la decisión 28, 320 × 226: la profundidad del
  tórax de ANSUR II en los varones de IMC 18,5–25), así que la parrilla no se estrecha hacia la abertura superior (Gray:
  10 × 5 cm): las costillas 1.ª–3.ª son tan anchas como las bajas, la 1.ª y el 1.er espacio intercostal corren bajo la
  medioclavicular (36 mm de espacio; en el tórax real, tras la clavícula; desde la decisión 27 la clavícula existe, pero su eje queda ≈ 24 mm sobre el de la 1.ª costilla en la LMC) y el esternón es
  vertical (Gray: oblicuo hacia delante). Con la pared heredada de 28 mm la caja mide 274 × 166 mm y 350 de alto (Robinson,
  hombres: 303 × 195 × 366); con la pared torácica por región (decisión 17: 12,8 mm al lado), 303 × 182 mm, y con el tronco de
  226 mm y la pared paravertebral de sus fuentes (decisión 28), 303 × 189 (−0,4 DE de Robinson); con las costillas hasta la
  punta de la transversa de la TAC y la espalda alta (decisión 29), 303 × 192. La 1.ª costilla cae lo que la
  real (47,7 mm de su extremo posterior a su unión condrocostal) pero a lo largo de la profundidad del cilindro: 15,0° bajo el
  plano transversal frente a los 31 ± 8,2 de Robinson (la 7.ª, 31,8 frente a 29 ± 7,7).
- **Una sola sección para todas las costillas** (`rib-section-uniform`, decisión 16): las 24 costillas y sus cartílagos
  tienen la misma elipse de 14 mm de alto (medido en vertical, el corte longitudinal de la ecografía: la sección
  perpendicular de una costilla oblicua es más estrecha) y 4,7 mm de grosor, de hueso homogéneo, sin cortical ni esponjosa
  ni surco costal; la 1.ª real es plana y horizontal, y los cartílagos se afinan hacia el esternón (Gray). Las uniones
  condrocostales de la 1.ª–3.ª y la 6.ª–10.ª, las puntas de los cartílagos del reborde, las de la 11.ª y la 12.ª y los
  espacios altos de las axilares son supuestos (`docs/APPROXIMATIONS.md`). La caída de las costillas 10.ª–12.ª hasta su
  punta no baja tras la 9.ª como dice Gray: sigue los espacios laterales de Kim y cols.
- **La pared torácica por región, sobre una piel fija** (`chest-wall-regional-approx`, decisión 17): el grosor de la pared
  y sus capas siguen la base por estación (16 mm en EIC2-LMC, 12,8 en EIC5 LAA/LAM, 18 en la axila alta, 16 infraescapular),
  pero la piel es el cilindro elíptico de VExUS: lo que cambia de grosor mueve la pleura y la parrilla hacia dentro, no la
  piel hacia fuera. La pared baja del EIC5 (Nelson) y la alta de la axila (McLean, 18 mm en el EIC4) no caben en un solo
  espacio intercostal: la transición va del centro del EIC5 a la 4.ª costilla de la LAM y el EIC4 queda a 16,7 mm; la pleura
  se inclina bajo la 5.ª costilla y el signo del murciélago del EIC5 lateral queda a 4,2 mm (el de F-T08 del punto BLUE
  inferior, con un lado a 7,4). Sobre el esternón, piel y grasa presternal sobre el hueso (5,5 mm; 3,6 la delgada), sin el
  pectoral que cubre sus bordes. El contacto de la sonda toma, en cada línea, la pared donde entra en la piel, no la de cada
  profundidad. Detrás, arriba (sobre la 4.ª costilla de la LAM, decisión 29), la espalda con la escápula: 32 mm de la línea
  media a la escapular (Wada, Okçu) y 20 en la infraescapular [SUPUESTO], con la misma transición en altura que la axila
  (del centro del EIC5 a la 4.ª costilla de la LAM), que detrás no tiene fuente; sin los límites
  craneocaudales de la mama (la variante de mujer suma sus 2 mm a toda altura, del esternón a la axilar anterior), con la
  pared junto a la columna de 28 mm por la normal (decisión 28: Folli, piel → costilla en prono, más la costilla; Okçu, el punto
  más fino por dentro de la escápula en la TAC en supino), la misma de la paravertebral a la línea media, en un solo músculo (sin
  trapecio, romboides ni erectores por separado; sus grosores en sanos, NO ENCONTRADO) y el paso a la pared del abdomen en 100 mm bajo el reborde costal [SUPUESTO]. La variante de
  mujer no tiene la sección costal 20–35 % menor ni la caja más pequeña de la base.
- **La pared es genérica en sus tejidos** (`wall-generic-layers`): un solo músculo sobre los intercostales (el pectoral, el
  serrato o el dorsal, sin el plano pectoral mayor/menor ni fascias entre ellos) y la banda intercostal como músculo; las
  texturas, retrodispersiones y rugosidades de sus caras son [ESTIMADO] de VExUS. Bajo el reborde costal, la pared de tres
  músculos del abdomen de VExUS.
- **El corazón es un elipsoide estático** (`heart-simplified`, decisión 18): miocardio con una sola cavidad de sangre, su
  ápex donde lo pone Gray (5.º EIC, 9 cm de la línea media, 10 mm por dentro de la pleura: la língula) y un tapón de
  miocardio que lo une a la pared en el disco de la ventana cardiaca (regla de Latham: 5 cm centrado a 47,5 mm de la línea
  media en el 5.º EIC; un elipsoide que tocara la pared dejaría una ventana alargada de lado a lado). No late: no hay pulso
  pulmonar (la segunda parte de A-T16) ni movimiento del corazón en la ventana; su pericardio no tiene cara propia y el
  borde de la ventana es duro (sin el volumen parcial de la cortina), aunque el pulmón que la rodea es una cuña fina sobre el
  corazón (una franja de 25 mm donde el corazón llega a la lámina de la cortina [SUPUESTO]). El corazón, con su tapón y su
  franja, no se mueve con la respiración (el campo respiratorio vuelve a su valor a 50 mm [SUPUESTO]), y la ventana no se
  achica al inspirar (en el paciente real el pulmón se interpone y la tapa en parte; la e2e exige hoy que no cambie). En la ventana el
  miocardio mide hasta 25 mm antes de la cavidad (el tapón; el ventrículo derecho real, ≈ 5 mm); la cara inferior, cortada
  por la cúpula, es pared de 10 mm. Fuera del corazón, todo el tórax sobre las cúpulas
  sigue siendo pulmón: sin mediastino, grandes vasos, timo ni esófago. Largo, ancho, grosor, orientación y paredes son
  [SUPUESTO] (la base no los da).
- **Los bordes del pulmón son una tabla por columna, la misma a los dos lados** (`lung-border-table`, decisión 18): el borde
  en FRC y la reflexión pleural se anclan en la paraesternal, la LMC, la LAM y la paravertebral (Gray) y se interpolan
  entre ellas; sin el receso costomediastínico izquierdo (Choi) ni diferencia entre los dos lados salvo la ventana
  cardiaca. La cúpula baja a la pared en una rampa de 40 mm [SUPUESTO] y su diafragma sigue siendo la lámina de 2,5 mm de
  VExUS; bajo el borde, la ZOA es una lámina de grosor uniforme contra la pared (1,9 mm en FRC, 5 a TLC) con solo su cara
  abdominal (la pleural es la cara interna de la pared), hasta 20 mm bajo la reflexión [SUPUESTO; la longitud de la ZOA es NO
  ENCONTRADO]: A-T15 a TLC depende de él (con los 53 mm de la inspiración profunda, la cortina dejaba la ZOA medible a ≥ 10 mm
  de su inserción solo en el EIC 9 de la LAA, a 10,3 mm, decisión 22; con el tronco de 226 mm de la decisión 28 ese EIC queda a
  9,8 mm y ningún EIC cumple: A-T15 a TLC pendiente, `notYetMet`, y volvería a medirse con ≥ 20,3 mm). La lámina de la
  cortina, 3 mm de pulmón de punta roma, baja lo que el diafragma (la base en supino, decisión 22: 16 mm en respiración
  tranquila y 53 en la profunda), sin pasar de la reflexión (junto a la columna se detiene a 23 mm). El borde anterior se ancla en la línea
  paraesternal (el centro del 6.º cartílago, z 1,5) y sigue igual hasta la línea media: junto al borde del esternón, donde
  Gray lo pone en la 6.ª articulación condroesternal, queda ≈ 15 mm más bajo. Hacia arriba, desde la decisión 27, el vértice
  es la cúpula pleural (`apex-cupola-wall`).
- **La cúpula pleural es la pared que se cierra** (`apex-cupola-wall`, decisión 27): sobre la piel fija del tronco cilíndrico,
  por encima de la 1.ª costilla de cada columna las partes blandas del cuello y del hombro engruesan la pared (músculo genérico,
  sin escalenos, esternocleidomastoideo, vasos subclavios ni plexo braquial) y su cara interna, la pleura cervical, se curva hacia
  dentro hasta el techo de la cúpula (25 mm sobre el borde superior del tercio medial de la clavícula, Gray; 5 mm sobre la 1.ª
  costilla fuera de los tercios medial y medio). La forma de la curva (30 mm hacia dentro) es [SUPUESTO]. Como el tronco no se
  estrecha hacia la abertura superior (`thorax-cylindrical-cage`), la cúpula ocupa todo el ancho de la parrilla y no hay dos
  vértices separados por la tráquea (no hay mediastino). Por encima de la cúpula, la sonda ve solo músculo, también en el
  hombro (z ≤ 200 en todo φ). En el cuello, junto a la línea media (por delante de las articulaciones esternoclaviculares y
  delante de la columna) no hay pulmón sobre la escotadura yugular, pero más adentro las columnas radiales del vértice convergen
  y el centro del corte sigue siendo pulmón (no hay mediastino). El contacto de la sonda toma por pared rígida la del tórax, sin
  lo que la cúpula le suma. Por la fosa supraclavicular la pleura queda 1,1 DE más honda que en Yadav (la pared de la columna es
  la de delante, con el pectoral); en la variante obesa de mujer, dentro de 2 DE desde el tronco de la decisión 28 (37,7 mm
  frente a ≤ 39,6; con el de 210 mm, 40,4). Ahí
  el deslizamiento es nulo (`sliding-linear-height`). Desde la decisión 27, por encima de ≈ z 160 (el vértice y lo que se ve por la fosa supraclavicular) el deslizamiento
  es nulo: Lichtenstein lo da «mínimo» en el vértice, no ausente, y un alumno podría leer ahí un neumotórax.
- **La clavícula tiene una sola sección** (`clavicle-section-uniform`, decisión 27): un cilindro de 14 mm de diámetro (el del
  tercio medio, Yang) a lo largo de la piel del tronco, de la escotadura clavicular del manubrio (20 mm de la línea media) a 156
  mm de piel, con el eje 3 mm sobre la escotadura y subiendo 15 mm hasta el extremo acromial [SUPUESTO]. Sin las curvas en S,
  sin los extremos de 25–26 mm, sin articulaciones ni acromion; sigue la piel del cilindro, no la del hombro.
- **La escápula es una lámina** (`scapula-plate`, decisión 29): un triángulo de hueso de 3 mm (la parte central del cuerpo,
  Burke) bajo la piel, la grasa y el trapecio medio de la espalda (13,9 mm por la normal), a la misma profundidad en toda ella,
  con el ángulo inferior en la línea escapular a la altura de la apófisis de T8 y el superior a 9 cm de la línea media. Sin la
  espina (7–18 mm de grosor), el borde lateral (9,7), la glena ni el acromion; sin el infraespinoso, que engruesa hacia el
  centro de la fosa (≈ 2 cm, Ortega-Santamaría, sin unidad declarada), ni el subescapular y el serrato entre ella y la parrilla
  (NO ENCONTRADO). La espalda alta, más gruesa (32 mm de la línea media a la escapular, Wada y Okçu), adelgaza hacia la axila (20
  en la infraescapular [SUPUESTO], 18 en la LAP): como el tronco no tiene hombro, la lámina se recorta por fuera hasta que
  ninguna costilla asoma sobre su cara posterior (`fitScapula`), y mide 54 mm de ancho en la raíz de la espina, no 103,5 (la
  glena de Garzón-Alfaro quedaría 49 mm más allá): falta la mitad lateral de la fosa infraespinosa. Bajo su cara posterior la
  lámina llega a la cresta de las costillas (en su extremo de fuera corta hasta 2 mm de ellas; no se ve, es su sombra). En la
  mujer (la escápula de 137 mm), la glena, a la altura de la raíz de la espina, queda 3 mm sobre el ángulo superior [SUPUESTO].
  Solo con los
  brazos a los lados: con los brazos cruzados (A-T18, el triángulo de auscultación) o el brazo levantado no se mueve. En los
  varones, las distancias a la línea media son de poblaciones mixtas o de mujeres (NO ENCONTRADO en varones sanos en acceso
  abierto).
- **La columna por detrás es un arco continuo** (`spine-arch-slab`, decisión 29): las láminas y las apófisis transversas, una
  caja de la cara posterior a 27 mm de la piel hasta 47 (VExUS), hasta 29,3 mm de la línea media (Li, TAC) en toda la altura:
  sin transversas por nivel (en la TAC, 14 mm de hueco entre dos en T8–T10), sin articulaciones costotransversas ni cuellos
  costales. La pared junto a la columna es la de la espalda (28 mm abajo, 32 arriba): la columna se clasifica también dentro de
  ella, pero por fuera del arco, a partir de esa profundidad, hay pulmón (en el cadáver, la apófisis transversa queda 12–21 mm
  por detrás de la pleura, Tan). Las apófisis espinosas, barras de 6 mm [SUPUESTO] con la punta a 11 mm de la piel en el
  avatar (Grünwald, TAC de mayores con escoliosis; con la piel y la grasa de cada hábito) y la inclinación de la regla de los
  tres; sin cara cortical propia (como el resto de la columna de VExUS): en la línea media la imagen es su sombra.
- **La posición del paciente no cambia la anatomía** (`patient-position-anatomy`, decisión 29): sentado, la sonda alcanza la
  espalda, pero el pulmón, el diafragma, la pared y la escápula son los del supino. Sentado, la capacidad residual funcional
  sube (806 ± 293 mL más que en supino en 13 varones, Lumb y Nunn, resumen; el volumen pulmonar espiratorio, un 9,5 % más en la
  TAC sentada que en la de supino, Yamada y cols.) y el diafragma baja (en supino queda más craneal, Traser y cols., RM
  dinámica de 3 cantantes); cuánto baja el borde posterior del pulmón, NO ENCONTRADO. La pared de la espalda no cambia en
  la ecografía sentado frente a en prono (Wada y cols., 18 varones). La escápula, de pie según Cooperstein; sentado, NO
  ENCONTRADO como comparación directa.
- **El abdomen es un tejido genérico** (`abdomen-generic-tissue`): bajo el diafragma queda el tejido por
  defecto de la clasificación de VExUS, su «resto» del abdomen (`Tissue.Bowel`), sin hígado, bazo, riñones,
  vesícula, vasos ni gas intestinal. La cara abdominal del diafragma conserva las propiedades de su cara
  hepática en VExUS. En la imagen es un moteado sin estructura: la textura del «resto» de VExUS
  (`restTexture`) no se porta (decisión 12), y con el preajuste pulmonar queda casi negro (mediana 0–8 de gris
  bajo la cúpula). El hígado vuelve en la fase 3 como módulo portado.
- **El campo respiratorio es una traslación caudal con pesos** (`respiratory-field-vertical`, decisión 22): el tejido baja el
  descenso del diafragma por un peso que es 0 en la pared, la columna y el corazón con su ventana, sube en sus rampas (25, 30
  y 50 mm; la de la pared y la de la columna, [EXTRAPOLACIÓN PROPIA] de VExUS) y, por encima de la cúpula más alta, baja en
  recta hasta 0 a 147 mm, en z 161, sobre la 1.ª costilla de la LMC [SUPUESTO: el tramo del deslizamiento llevado a la cúpula;
  el deslizamiento se apaga más abajo, a 128–145 mm]. Por encima de z 161 el pulmón del campo no baja ni se estira, aunque el
  del modelo llega a z 212 (la cúpula pleural, decisión 27). No hay movimiento anterior ni lateral (la pared del abdomen no
  sale al inspirar y la parrilla no se expande: la piel es fija) ni cizalla en la pleura: el pulmón junto a la pared baja con la
  rampa de la pared, sin deslizar (el deslizamiento de la imagen es un modelo aparte, `sliding-linear-height`). La rampa de la
  pared, donde el abdomen es más grueso que el tórax, no mira la pared de verdad sino una cuyo paso al abdomen bajo el reborde
  costal se alarga hasta no engrosar hacia abajo más de 0,1 mm/mm (`anatomy.respiratoryWall.slopeMax`): así el campo no se
  pliega con ningún hábito del abdomen, pero el tejido junto a la pared empieza a bajar más hondo, tanto más cuanta más grasa
  tenga el abdomen. Con la del paciente por omisión (14 mm; la interfaz no la cambia), 9,0 mm más en el reborde costal de la
  LAM, 5,5 a la altura de la reflexión y < 1 mm desde z −39 (12,4, 9,2 y desde z 1 en la delgada), sin cambiar la cúpula junto
  a la axilar; con 25 y 35 mm de grasa, 22 y 33 mm en el reborde, un paso de 393 y 543 mm (todo el tórax) y, con 53 mm de
  excursión, la cúpula en (−120, 0) baja 43 y 8 mm y en (±130, 0), 7–10 y 0: queda quieta mientras la cortina baja sobre ella
  (meta pendiente en `respiratoryField.test.ts`; la base dice que la excursión crece con el IMC). El jacobiano queda ≥ 0,57 con
  53 mm y ≥ 0,39 con 75 (sobre el corazón) y llega a 2,51 bajo él: el campo no conserva el volumen (el pulmón sobre el corazón se
  comprime al inspirar y las vísceras bajo él se estiran). La cúpula junto al corazón,
  que no respira, baja menos que la excursión (con 53 mm): la derecha, entera junto a la axilar y el 52 % en su vértice; la
  izquierda, el 35 % junto a la axilar y el 4 % en su vértice, cuando la base da la misma a los dos lados (meta pendiente en
  `respiratoryField.test.ts`); junto a la pared del flanco, el 66 %. La excursión es la del avatar en supino y no depende del
  hábito del abdomen; la mujer, 47 mm en la profunda y la misma tranquila. La inversa (mundo → material) es exacta a 0,026 mm
  en el punto material (en el mundo, ≤ 0,068): una bisección de 10 pasos en la vertical.
- **El deslizamiento es una traslación caudal, lineal con la altura** (`sliding-linear-height`, decisión 19): el pulmón bajo
  la pleura baja lo que el borde de su columna (sin pasar de la reflexión) hasta 15,5 mm sobre él y menos hacia arriba, en la
  recta que da el cociente de Briganti entre el EIC2 de la LMC y la base (0,42), y se apaga ≈ 147 mm sobre la base (138 en la mujer). En la
  respiración tranquila del modelo (16 mm, decisión 22): 16 mm en la base, 8,7 en el punto BLUE inferior, 8,4 en el PLAPS y
  6,7 en el superior, y 9,3 de media en 12 campos (antes, con 10 mm: 10, 5,4, 5,2, 4,2 y 5,8). La base de conocimiento: 8,6 ±
  4,3 en la base en ventilación mecánica (D1, Briganti; el modelo, +1,7 DE, porque la excursión no depende de la ventilación);
  5,4 ± 2,5 en 12 campos en sanos respirando tranquilos (D5, Costamagna; el modelo, +1,5 DE, antes +0,2); ≈ 15 ± 5 en el
  punto BLUE inferior en respiración espontánea (D4, opinión de experto; −1,3 DE, antes −1,9). El deslizamiento de la base es
  el descenso del borde, y quizá solo una fracción de él (≈ 0,6 casaría con D5 y alejaría D4). En la inspiración profunda (53,
  28,8, 27,5 y 22,0 mm) es una extrapolación: la base solo da la respiración tranquila. No depende del modo ventilatorio (la
  ventilación mecánica no se alcanza desde la interfaz), de la ventilación
  regional ni de la deformación (menor delante que detrás, D8), y no se mueve con el latido (sin pulso pulmonar).

## Sonda

- **Solo la sonda convexa de 3,5 MHz** (`convex-probe-only`): la de VExUS (radio 60 mm, ±34°, 192 líneas).
  Las metas de anatomía de la base son para una sonda lineal de 38–40 mm y se miden, por ahora, con esta.
  La lineal de alta frecuencia llega en la fase 2.
- **La compresión de la sonda es cinemática, no elástica** (`probe-compression-kinematic`): no hay
  rigideces ni fuerza. La sonda se hunde a lo largo de su eje lo que haga falta para que apoye toda la cara,
  con un tope de presión [ESTIMADO] que depende de la blandura de la pared; la pared entera, con las
  costillas, se empuja como un bloque (no se comprime) y el tejido de debajo absorbe el empuje. Sin
  histéresis ni viscoelasticidad. Lo rígido
  se ensancha en la imagen (decisión 16): la sonda convexa se hunde ≈ 8,6 mm en el centro para apoyar sobre la piel plana
  en z y empuja la pared con las costillas por las líneas divergentes de la cara, así que una costilla bajo el centro del
  sector mide 16,0–16,5 mm en la imagen (la anatomía, 14) y los espacios, ×1,11–1,18 (los EIC7–9 de la axilar posterior,
  18,4 mm frente al rango 14–18 de la base). En el corte del signo del murciélago, con las costillas a los lados del
  centro, las sombras miden 15,1–15,6 mm. Una sonda real empuja el tejido blando, no las costillas.
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
  fina. Su nivel depende de K, una escala estimada del modelo registrada en `normalCalibration.ts`; las fuentes del
  mecanismo no documentan su valor numérico. C3b-A usa 54 dB dentro del dominio heredado [53, 57], un ajuste preliminar
  medido en la cadena gráfica del simulador (decisión 24), sin resolver la parte difusa ausente.
- **La costilla es una lente de fase fina, de hueso homogéneo** (`rib-acoustics-simplified`, decisión 20): la sombra costal
  sale de la transmisión de la pasada A con la fase que el hueso añade a cada toma de su cono (la cuerda recta de la costilla
  en la línea de la toma, de la entrada y la salida exactas de A0, por 2π·f·(1/c_músculo − 1/c_hueso), promediada en la banda
  del pulso), de las cuatro caras de la cortical con las impedancias de la tabla (7,4 dB) y de la atenuación del hueso a la
  frecuencia del pulso que llega a la costilla (3,26 MHz, estimada con el recorrido de la costilla del avatar: una más fina o
  más gruesa se desplaza distinto). No tiene la refracción de los rayos en la cortical (c 2,3 veces mayor: se abren y, más
  allá de 26° de incidencia, no entran como onda longitudinal), la conversión a onda transversal, la cortical y el hueso
  esponjoso por separado, ni el desplazamiento por velocidad del eco que atraviesa el hueso (llegaría ≈ 2,5 mm antes). La
  fase solo es la de la primera costilla de cada línea antes del espejo, y en las miradas dirigidas, la de la línea que el
  camino cruza en su primer hueso; en armónica, el cono de emisión pierde la coherencia de p₁ al cuadrado (la fuente del
  armónico), sin el resto de la física de la armónica a través del hueso. Las mediciones de imagen que siguen son
  históricas de la decisión 20, con K = 55 dB, R_t = 0,3 y preajuste de ganancia −21 dB; no se atribuyen al ajuste C3b-A.
  En la sombra completa, el eco de la pleura queda a −68,7…−86,1 dB del intercostal en el
  núcleo (negro en la pantalla del preajuste) y la línea A de orden 2 a más de 100 dB bajo el blanco; la línea pleural se ve
  en la penumbra, el semiancho del cono de emisión en la costilla (6,6–10,5 líneas) más el lóbulo principal de la PSF (1–3
  líneas), por los rayos que pasan junto a la costilla o por su borde redondo, que es fino. Los lóbulos laterales de una
  línea ven lo de al lado con la menor de las dos transmisiones (la de la mirada 0, también en las dirigidas; bajo la pleura
  registrada, la de su fila tope, sin mirar la fracción de aire de la cortina): una aproximación del camino de la apertura de
  la línea hasta la muestra vecina, que no sigue los rayos, y la cota más favorable. Con la transmisión de la línea donde el
  camino recto cruza la costilla (la revisión la probó), el núcleo sube 1,4–3,8 dB y en el BLUE inferior y el PLAPS llega a
  gris 9. La penumbra la fija la apertura de emisión de VExUS (26 mm con el foco a 16 mm, F# 0,6, `NEEDS_CALIBRATION`): la
  pleura se ve en 5–8 mm de cada sombra de 14–17 mm. En esa medición, F-T08 se cumple con el preajuste en los tres puntos de partida y en los
  cortes longitudinales de la LAM, del lado izquierdo y de 1,2π; en la LAM a z 20 el núcleo llega a gris 2 y en un corte
  oblicuo de 60° (la costilla más ancha y de cuerda más plana: menos lente), a gris 6 (10 en armónica). Con más ganancia la
  pleura del núcleo reaparece: con 0 dB, en gris 25–40; con −10, 6–18 (sin el hueso esponjoso, que dispersa, una costilla
  real quizá la apague más). El preajuste pulmonar no satura la línea pleural (−21 dB de ganancia, decisión 20): toda la
  imagen baja lo mismo, la pared queda gris oscura y, sin tocar la TGC, las líneas A se ven hasta ≈ 5 cm y el campo lejano
  es negro, sin suelo de ruido; se sube con la TGC del usuario (el consenso pide ganancia creciente hacia el campo lejano sin
  fijar la pendiente).
- **Estadística del moteado sin calibración completa** (`speckle-statistics-uncalibrated`): la célula, la SNR local y la
  asimetría del moteado no tienen una calibración conjunta frente a clips reales de pulmón. Desde la decisión 21 el banco
  mide el grano de la pared (T1) en el simulador y en los clips; el ajuste preliminar del contraste no resuelve por sí solo
  esta limitación. Desde la decisión 31 se sabe además que la región de la pared del simulador (0,2–0,85 de la pleura, con
  la grasa, las caras, los planos intermusculares y las estrías) no es moteado de Rayleigh: en su envolvente, en parches de
  16 × 8, p90 − p50 de 20·log₁₀ es 8,0–9,2 dB frente a 5,21 (menos en parches con grano) y la asimetría por cuantiles
  0,94–1,30 frente a 1,57 en el BLUE superior y el PLAPS; el músculo sin estructura sí lo es (SNR de Rayleigh,
  `e2e/imagen.spec.ts`), pero casi no tiene
  parches en las vistas del banco. El mapa de grises de los clips no se puede estimar desde su moteado (grano lateral de
  2,1–4,8 px, asimetría en dB 0,55–1,18 en la pared, recomprimidos), así que la comparación de la dispersión del moteado en
  dB queda pendiente.
- **La presentación sigue en calibración preliminar** (`display-uncalibrated`, decisiones 21 y 24): el ajuste C3b-A
  K = 54 dB, R_t = 0,3 y ganancia −20 dB mejora modestamente el gris de pared y neblina del normal convexo. Con rango
  dinámico 70 dB y apnea a t = 60 s, la pared aumenta 1,64–2,02 niveles y la neblina 1,53–1,71 en los tres puntos de partida;
  el recorte pleural mediano es 0 y las pruebas de sombras y líneas A pasan sin cambiar sus guardas
  ([CI 81, 5d1b4cd](https://github.com/DanielOpazoD/lus-sim/actions/runs/36480592122)). No establece fidelidad completa ni
  validación clínica. La comparación con sujetos reservados se documenta por separado; los agregados ya eran conocidos,
  por lo que la partición no constituye validación independiente o ciega.

  Referencia histórica de la decisión 21, con K = 55 dB y R_t = 0,3: el rango dinámico
  (70 dB, de VExUS), la curva de grises (c = 3,5, de EchoTwin) y la ganancia del preajuste (−21 dB, decisión 20) dejan, medido
  con el banco de fidelidad en la imagen mostrada, la pared y la neblina subpleural a 1,6–1,9 y 1,8–2,0 caídas de línea A bajo
  la pleura (M, sin suelo e invariante a la ganancia), frente a 0,75–1,54 y 0,85–1,32 (p10–p90) en 10 clips convexos de 6
  sujetos del banco de referencia (con el detector de líneas A de la decisión 31); el campo profundo y el suelo de la sombra costal quedan en el gris 0 de 8 bits (la
  envolvente, 6–7 y 39–42 dB bajo el negro de −69,7 dB), así que M del campo profundo es una cota inferior y los niveles sobre
  el suelo (N1–N3) no son medidas: dependen de la ganancia. La línea A cae ≈ 20 dB por orden (F-T02 da 20,2–20,4), pero en gris
  decae más despacio que en los clips (r₂ 0,48–0,56 frente a 0,16–0,30) y se ven dos; M se mide en esa caída, así que lee a la
  vez el nivel y la reverberación. El moteado de la pared es tenue frente a la pleura (T1 σ/prominencia 0,035–0,042 frente a
  0,11–0,31) y la pared, quieta hasta el escalón de 8 bits (σ temporal 0,004–0,16 grises; T2 1,000; en un clip real sería un
  vídeo que repite cuadros), así que S1 es una cota (≥ 11–16 frente a 0,76–1,68). Las métricas son invariantes a lo afín en el
  gris, que en el simulador es la ganancia pero no el rango dinámico (la curva de grises es exponencial en el nivel).

  El campo profundo, el moteado (incluido T1 lateral) y la dinámica temporal siguen como limitaciones abiertas. Las réplicas de anatomía fija
  de C3b-A no evalúan T2/S1. Un descenso de M puede reflejar su denominador de reverberación: se contrasta también con
  niveles, prominencia de líneas A y recorte, sin deducir por sí solo que la pared se haya aclarado.

- **Lóbulos laterales simplificados, sin lóbulos de rejilla ni en elevación** (`no-sidelobes`, heredada con
  `src/ultrasound/clutter.ts`, decisión 11): el núcleo lateral lleva un pedestal gaussiano con una pantalla de
  fase fija (ISLR −24 dB con los 14 mm de grasa del paciente por omisión), no el diagrama real de la apertura; la
  reverberación de la pared es de primer y segundo orden y solo de los ecos fuertes (compuerta por el módulo del
  campo, no por la cara que la produce). Desde la decisión 20 cada vecina entra en el pedestal con la menor de las dos
  transmisiones (la de la línea de destino y la suya): en la sombra de una costilla el pedestal ya no trae la línea pleural
  ni las líneas A de los espacios intercostales vecinos. En el tórax la pleura es la cara interna de la pared, así que sus réplicas
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
