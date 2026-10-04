# Limitaciones

Este documento existe para que nadie use el simulador más allá de lo que hace. Cada punto lleva el
identificador que lo declara en `src/validation/limitations.ts` (la suite exige que ambos coincidan).
Cuando una limitación se resuelve, se borra de los dos sitios en el mismo cambio. Las heredadas de VExUS
conservan su identificador (decisiones 10 y 11).

## Estado del proyecto

- **Adquisición normal, alcance docente inicial** (`normal-acquisition-only`, decisión 23): modo B con un adulto
  sintético, navegador torácico 3D y cine con pose y respiración históricas. Con línea M a cadencia de B y calibre manual (`docs/MMODE.md`, `docs/REVIEW.md`);
  sin casos patológicos ni modo docente/examen. Los puntos de partida (desde la decisión 42, los cuatro de la regla de las manos
  —BLUE superior, BLUE inferior, frénico y PLAPS— y los tres paravertebrales, en los dos hemitórax) se sitúan con las manos del
  avatar promedio: no siguen a las variantes de hábito, sexo o edad, son el sitio donde empezar y no una garantía de obtener la
  ventana correcta, y en qué espacio intercostal caen lo da la parrilla del modelo (ninguna fuente lo mide). Cambiar la profundidad inicia un
  cine nuevo para evitar mezclar persistencia entre escalas polares distintas; no hay revisión continua
  entre profundidades diferentes.
- **Navegador paramétrico** (`navigator-parametric`, decisión 23): muestra la superficie y referencias que utiliza
  el motor, con las simplificaciones de `thorax-cylindrical-cage`. No es un atlas segmentado ni amplía la cobertura
  posterior permitida por la posición del paciente (decisión 33: sentado, toda la espalda). Desde la decisión 25, un maniquí procedural añade cabeza, hombros,
  brazos y terminación abdominal no explorables; desde la decisión 48, con los brazos arriba y las manos detrás de la cabeza. La piel funcional conserva la elipse acústica y muestra
  el contacto del cuadro por la deformación existente; entre vértices es una aproximación teselada.
  Las costillas opcionales permanecen como guía en reposo (desde la decisión 33, con las clavículas y las escápulas del
  modelo, de otro tono). La carcasa y cable son contexto de interfaz,
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
- **La pared alta de la espalda sube de golpe y a la altura de la axila** (`chest-wall-height-transition`, decisiones 29 y 33):
  la espalda alta (32 mm junto a la columna, 20 en la infraescapular) pasa a la baja (28 y 16) con la transición en altura de
  las capas altas de la axila, del centro del EIC5 a la 4.ª costilla de la LAM (z 41,8 a 85,8 en el avatar: 44 mm, con un
  `smoothstep`, cuya pendiente máxima es 1,5 veces la media), a la misma z en toda la vuelta. Detrás no tiene fuente: en Wada y
  cols. la pared baja 7 mm de la 5.ª a la 8.ª costilla (27 → 20 mm de piel a costilla junto al borde medial de la escápula),
  unos 70 mm de altura en la paravertebral (≈ 0,1 mm por mm). Con el modelo, 4 mm (32 frente a 28) en 44 mm dan 0,09 de media y
  0,14 en el centro; 7 mm (35, el valor de Wada más el complejo pleural según Okçu) dan 0,16 y 0,24, y la pleura bajo la 7.ª y la
  8.ª costilla de la paravertebral se inclina tanto que F-T08 deja un lado a 8,2 mm de la cresta (meta: 4–6). Por eso la
  espalda alta se queda en 32 y no en 35: lo fija la forma de la transición del modelo, no la anatomía. Una transición propia de
  la espalda, que baje con la parrilla de la 5.ª a la 8.ª costilla, la quitaría. Los 20 mm de la infraescapular ya no los fija
  el banco de fidelidad (decisión 36: con 24, la pleura del PLAPS se sigue en todas sus columnas y F-T08 cumple): son un
  supuesto sin fuente (NO ENCONTRADO).
- **La pared es genérica en sus tejidos** (`wall-generic-layers`): un solo músculo sobre los intercostales (el pectoral, el
  serrato o el dorsal, sin el plano pectoral mayor/menor ni fascias entre ellos) y la banda intercostal como músculo; las
  texturas, retrodispersiones y rugosidades de sus caras son [ESTIMADO] de VExUS. Bajo el reborde costal, la pared de tres
  músculos del abdomen de VExUS.
- **El corazón es un elipsoide estático** (`heart-simplified`, decisión 18): miocardio con una sola cavidad de sangre, su
  ápex donde lo pone Gray (5.º EIC, 9 cm de la línea media, 10 mm por dentro de la pleura: la língula) y un tapón de
  miocardio que lo une a la pared en el disco de la ventana cardiaca (regla de Latham: 5 cm centrado a 47,5 mm de la línea
  media en el 5.º EIC; un elipsoide que tocara la pared dejaría una ventana alargada de lado a lado). No late: su
  latido solo mueve el pulmón de alrededor (el pulso pulmonar, decisión 32: el deslizamiento tangente a la pared de un campo
  que sigue a la cara del corazón, con su alcance estimado) y no el corazón en la ventana, que sigue quieto, ni el borde del
  pulmón ni el de la ventana; su pericardio no tiene cara propia y el
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
  costilla fuera de los tercios medial y medio). La forma de la curva (hasta 30 mm hacia dentro, sin esquina sobre la 1.ª
  costilla y con pendiente ≤ 1,5 mm por mm, decisión 44) es [SUPUESTO]. El músculo genérico sobre la cúpula, 23 mm por la fosa
  supraclavicular, cae en lo que suman los escalenos y el esternocleidomastoideo medidos a media altura del cuello (11–14 y
  8–10 mm), pero sin sus fascias, los vasos subclavios ni el plexo braquial. Por detrás de la clavícula la pleura queda a
  18–27 mm de la piel en el tercio medial y el medio, por debajo de los ≈ 29 mm que se derivan de Berk y cols. (la piel, la vena
  subclavia y la pleura en el camino de la punción; antes de la decisión 44, 20–35). Como el tronco no se
  estrecha hacia la abertura superior (`thorax-cylindrical-cage`), la cúpula ocupa todo el ancho de la parrilla y no hay dos
  vértices separados por la tráquea (no hay mediastino). Por encima de la cúpula, la sonda ve solo músculo, también en el
  hombro (z ≤ 225 en todo φ desde la decisión 48; antes, 200). En el cuello, junto a la línea media (por delante de las articulaciones esternoclaviculares y
  delante de la columna) no hay pulmón sobre la escotadura yugular, pero más adentro las columnas radiales del vértice convergen
  y el centro del corte sigue siendo pulmón (no hay mediastino). El contacto de la sonda toma por pared rígida la del tórax, sin
  lo que la cúpula le suma. Por la fosa supraclavicular la pleura queda 1,1 DE más honda que en Yadav (la pared de la columna es
  la de delante, con el pectoral); en la variante obesa de mujer, dentro de 2 DE desde el tronco de la decisión 28 (37,7 mm
  frente a ≤ 39,6; con el de 210 mm, 40,4). Ahí
  el deslizamiento es nulo (`sliding-linear-height`). Desde la decisión 27, en el vértice y en lo que se ve por la fosa supraclavicular el deslizamiento es nulo,
  como lo da la base en el ápex: Lichtenstein 2017 lo describe «discreto» o «mínimo» en el punto BLUE superior y «habitualmente
  nulo» en el ápex (`physics.md` D4 y D5a; la decisión 27 lo citó al revés). Por debajo de la clavícula el cero sale de la
  forma de la recta, un supuesto: se apaga en z ≈ 163 en la paraesternal, 145 en la LMC y 128 en la LAM, la LAP y la paravertebral, y deja sin
  deslizar el pulmón alto de detrás (el segmento posterior del lóbulo superior, que en Wang 2013 está entre los tumores más
  móviles). Lo que el modelo no tiene es el «habitualmente»: en el paciente a veces desliza algo y aquí nunca. Que el vértice no
  deslice es lo normal, no un neumotórax: un alumno no debería leerlo como tal.
- **El techo de la cúpula es horizontal y se dibuja como pleura** (`wall-cupola-transition`, decisiones 42 y 44): desde la
  decisión 44 la ladera anterior de la cúpula sale de la pared sin esquina y sube con pendiente acotada (|∇W| ≤ 1,9 mm por mm por
  delante y ≤ 4,3 junto a la línea media posterior, donde la cúpula pasa al cuello; antes, ≈ 16 junto al techo, 37 delante y 45
  detrás), pero cada columna de la pared sigue acabando en un techo
  horizontal: por encima, la radial ya no cruza pulmón y la pared es músculo hasta el centro del tronco. Con la sonda sobre la
  clavícula o por encima (z ≳ 165 en la LMC), las líneas que pasan sobre el techo entran en el pulmón por él, casi rasantes, y A0 les
  dibuja una pleura brillante: una franja casi vertical en la imagen donde el techo de las columnas de fuera baja (zTop cae de 196
  a 168 mm entre el tercio medial y el medio de la clavícula). Una pleura rasante devolvería poco eco. Lo arreglaría una cúpula con
  su propia superficie (un casquete en 3D con su distancia y su normal) en lugar del grosor radial por columna. Por la piel
  cilíndrica (`thorax-cylindrical-cage`) tampoco está la depresión de la fosa supraclavicular. Que la equivalencia TS ↔ GLSL de la
  distancia de las caras necesite la tolerancia escalada con el gradiente (`shellDistanceTolerance`) fue por la ladera de antes;
  con la ladera nueva ya no se activa: con SwiftShader el mayor |Δd| de la cáscara baja a 0,0088 mm en espiración y 0,0129 en la inspiración profunda (antes 0,025 y 0,11), todos bajo la tolerancia fija de 0,02.
- **La forma anterior de las costillas 2.ª–5.ª** (`anterior-rib-shape`, decisión 44): en la parrilla del modelo el punto más bajo
  de cada una está en la medioclavicular (u ≈ 96), por fuera de su unión condrocostal (u 64–84): la 2.ª baja del esternón (118,4
  mm) a la unión (107,9) y sigue bajando hasta 98,6; la 5.ª, de 37,0 a 13,2 y a 10,9. En la anatomía el tramo óseo anterior sube
  hacia fuera desde la unión condrocostal (Holcombe 2017: la cara lateral de la 2.ª costilla, arriba) y el cartílago va al
  esternón horizontal (2.º) o subiendo (3.º–7.º) (Gray): lo más bajo de la costilla ósea es su extremo anterior. Por eso el BLUE
  superior de la regla de las manos cae en el EIC1. Corregirlo mueve las costillas 2.ª–4.ª en la medioclavicular hasta ≈ 19 mm y,
  con ellas, las vistas de medida y los puntos BLUE: va en una decisión aparte con la recalibración (hoja de ruta).
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
  brazos a los lados: con los brazos cruzados (A-T18, el triángulo de auscultación) o el brazo levantado no se mueve
  (`arms-raised-anatomy`). En los
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
  ENCONTRADO como comparación directa. En la interfaz (decisión 33) la posición se elige en Ajustes → Paciente (las tarjetas de la
  espalda se quitaron en la decisión 47); el maniquí del navegador 3D no cambia de postura (sigue erguido, desde la decisión 48
  con los brazos arriba, aunque la escápula del modelo es la de los brazos a los lados: `arms-raised-anatomy`) y los brazos no
  se cruzan para abrir la espalda.
- **Los brazos arriba son solo del maniquí** (`arms-raised-anatomy`, decisión 48): el navegador 3D muestra los brazos arriba con
  las manos detrás de la cabeza (abducción ≈ 163°, elección de autoría), para que los brazos no estorben la sonda en la pared
  lateral, como pide la técnica en supino [@koenig-respiratoria-2020], pero
  la anatomía es la de los brazos a los lados. Con el brazo elevado la escápula rota hacia arriba ≈ 50° (McClure y cols.) y, con
  la mano sobre la cabeza, su borde vertebral sigue aprox. la cisura oblicua (Gray): la lámina sube hacia la axila y podría
  quedar bajo la sonda en la axilar posterior alta, lo que el modelo no hace (su escápula, la de `scapula-plate`, no pasa de la
  escapular). La piel y los músculos de la axila no se estiran ni adelgazan con el brazo (cuánto, sin medida en la base), y el
  tronco no tiene hombro: por encima de la 1.ª costilla de las axilares (z 172,8 en la media) la sonda se apoya, hasta el tope
  de z 225, en la pared genérica del cilindro, donde en el paciente están el contenido de la axila y la cabeza del húmero
  (`thorax-cylindrical-cage`). La fosa supraclavicular es la piel del cilindro, sin su depresión: sobre el vértice (z 223,3),
  inclinada 40° hacia los pies, la pleura de la cúpula queda a 44,5 mm, más honda que el «corner pocket» de Yadav junto a la
  clavícula (1,7 ± 0,8 cm).
- **El abdomen, fuera de sus órganos, es un tejido genérico** (`abdomen-generic-tissue`): desde la decisión 37 bajo el diafragma
  están el hígado y el bazo y, desde la 43, el estómago, los riñones y el retroperitoneo de VExUS (el psoas, el cuadrado lumbar y la
  grasa); lo demás queda en el tejido por defecto de la clasificación de VExUS, su «resto» del abdomen (`Tissue.Bowel`), sin
  vesícula, colon, páncreas, suprarrenales, gas intestinal ni más vasos que los del hilio del bazo y de los riñones (decisión 46). En la cobertura, las dos celdas pendientes caen ahí: la axilar
  posterior izquierda en el EIC9, donde la base pone el bazo de 4 de cada 10 adultos (Shen y cols.) y el bazo normal del modelo no
  llega, y la escapular izquierda en el EIC10, donde Gray pone el polo posterior del bazo (la grasa retroperitoneal). La cara abdominal del diafragma
  conserva las propiedades de su cara hepática en VExUS. En la imagen el «resto» es un moteado sin estructura: la textura del
  «resto» de VExUS (`restTexture`) no se porta (decisión 12), ni la del retroperitoneo (`retroTexture`, sus septos), y con el
  preajuste pulmonar queda casi negro.
- **El hígado y el bazo son formas lisas sin estructura interna** (`liver-spleen-simplified`, decisiones 37 y 43): el hígado, la
  envolvente de VExUS escalada a la cavidad con el borde de Gray, sin vasos (ni la cava, ni las porta, ni las suprahepáticas),
  tríadas portales, vesícula, fisuras ni ligamentos; el bazo, el de un adulto normal (decisión 43: 11 × 6,5 × 4 cm de Chow y cols.), una
  lámina rígida de su grueso en las coordenadas de la pared, contra el diafragma, con la huella elíptica, los bordes redondeados
  [SUPUESTO] y la parte gástrica de la cara visceral hundida [SUPUESTO], sin escotaduras, sin la cresta entre la parte gástrica y
  la renal; con la arteria y la vena esplénicas entrando por el hilio (decisión 46, `hilum-vessels-blind-ends`), con la retrodispersión del
  hígado [ESTIMADO]; en el sitio de la TC (el eje en la 11.ª costilla, dentro del reborde costal), no en el de las marcas de
  superficie de Gray. Medidos frente a la base (metas pendientes, `notYetMet`): el hígado tiene 1,76 L, por encima del peso de Gray
  (1,4–1,6 kg en el varón: 1,33–1,52 L) y de la fórmula de Vauthey para el avatar (≈ 1,5 L) [@vauthey-volumen-2002]: llena la
  cavidad del tronco de 226 mm (decisión 28) de delante atrás hasta el diafragma posterior, 13–17 cm, más que los 10–12,5 de Gray;
  su alto junto a su cara derecha es de 13,4 cm (Gray: 15–17,5); su ancho (21,3 cm) y su alto en la LMC (12,9 cm, −1 DE de Kratzer
  [@kratzer-higado-2003]) sí caen en la base. El bazo mide 10,7 × 6,9 × 4,6 cm por sus ejes principales y 161 mL (Chow:
  86–318; Gray, ≈ 184), pero no llega a las marcas de Gray: su punto más alto queda a 10 cm de la línea media y bajo T9 (Gray: a 4
  cm, en T9; `notYetMet`), porque entre esa marca y la de su punto más bajo (la axilar media en L1) hay ≈ 16 cm en el avatar. En
  el tercio inferior de su cara diafragmática (58 de 177 columnas) no tiene el diafragma por fuera sino la grasa de la pared: la
  lámina de la ZOA acaba 20 mm [SUPUESTO] bajo la reflexión pleural, por encima del reborde (Gray: el diafragma lo separa de las
  costillas 9.ª–11.ª; `notYetMet`). El
  lóbulo izquierdo acaba a 5 cm de la línea media, el extremo medial de lo que da Gray (no pocas veces llega a la línea mamilar).
  Con el preajuste pulmonar el hígado a 7–11 cm queda cerca del negro. Los dos se mueven con el campo respiratorio (decisión 22),
  cuyo peso es 0 en la pared: junto a ella bajan menos que la cúpula, sin deslizar sobre el peritoneo
  (`respiratory-field-vertical`). Sin hepatomegalia ni esplenomegalia (el tamaño variable de VExUS, `sizeFactor`, no se porta). El
  espejo del diafragma (F-T34) deja el virtual 1,7–2,0 dB bajo el real en el nivel mostrado, no los ≥ 3 que pide la base (meta
  pendiente).
- **El estómago es una lente bajo el espacio de Traube** (`stomach-traube-lens`, decisión 43): medio elipsoide en las coordenadas
  de la pared (como el bazo), con el contorno de Traube y el grueso que da el volumen en ayunas de Fidler y cols. (167 mL: 15,4 mm
  hacia dentro en el paciente por omisión, 14,9–18,9 en los seis hábitos; medido tras el recorte del hígado y el bazo, 158 mL); sin cardias,
  antro ni píloro, sin pliegues ni las capas de su pared (3,6 mm de Henry y cols., con el tejido del «resto»: no tiene tejido propio,
  porque los 32 tejidos llenan las tablas de la GPU), sin la cara de la mucosa. Su gas, el del estómago en ayunas de Fidler (23 mL;
  medido, 18), arriba de la luz por un nivel horizontal de supino que no cambia con la posición del paciente; calculado sin el
  recorte del bazo y con la profundidad bajo la pared (no bajo el diafragma). La firma del gas (las reverberaciones y la cola sucia)
  es la de la pasada B para el gas que no es pulmón (decisión 20), sin el eco de la propia cara del gas (`test.fail` en la e2e); con
  el preajuste pulmonar es tenue (la sombra, 5 dB bajo lo que se vería sin gas). Bajo la cúpula, el medio elipsoide sigue al
  diafragma hacia dentro: el fondo llega a ≈ 7 cm bajo la pared; en la LMC en el EIC6, detrás del estómago queda el lóbulo
  izquierdo del hígado, que en el adulto está delante de él.
- **Los vasos del hilio acaban ciegos** (`hilum-vessels-blind-ends`, decisión 46): la arteria y la vena esplénicas y las renales
  salen del bazo y del seno renal hacia la línea media y acaban, estrechadas, a 0–2,8 cm de ella (la arteria renal derecha, en la línea media, donde la aorta empezaría): el modelo no tiene la aorta,
  la cava, la porta ni el tronco celíaco, y el páncreas, detrás del que corre la vena esplénica, es el «resto». Sus calibres son los
  de la fuente (la vena esplénica por ecografía; la arteria esplénica, las renales y las venas renales por TC, que da algo más), su
  trazado medial es [SUPUESTO] (Gray: la vena por delante del riñón izquierdo, la arteria craneal y sinuosa; la vena renal
  izquierda por delante de donde iría la aorta), sin las ramas del hilio esplénico (la arteria se divide en dos en el 95 %,
  Moraes y cols.) ni las arterias polares, y en el modo B son anecoicos sin Doppler: la velocidad de la sangre y la pulsatilidad
  de la vena esplénica (la congestión venosa, `docs/UNIFICATION.md`) llegan con la unión con VExUS.
- **El riñón y el retroperitoneo son los de VExUS** (`kidney-retroperitoneum-port`, decisión 43): el riñón de VExUS (contorno,
  seno, pirámides, pelvis, cápsula y grasa perirrenal) en el sitio de la base (Gray, Morris, Xue y cols.) con los ejes de Glodny y
  cols. y Choi y cols., con la arteria y la vena renales del hilio (decisión 46) y sin las interlobares, el uréter, la suprarrenal ni la cara de Morison (la dibuja la cápsula del hígado o del bazo que apoya
  en su grasa); su tamaño es el de VExUS (10,8 × 5,4 × 4,6 cm; medido, 10,7 de largo), el de un adulto
  normal de hoy (Glodny y cols., Kang y cols., Bhardwaj y cols.); el grueso pasa del «algo más de 2,5 cm» de Gray, que queda bajo
  todas las medidas de hoy. Su profundidad, la de Xue, no cambia con el hábito: en el obeso queda a ≈ 5 mm de
  la pared y su grasa de detrás se pierde contra ella. Detrás de él (su sombra, `kidneyShadow`: lo que tiene su grasa real delante por la y del mundo, no por la normal de su cara
  posterior) no va el hígado ni el bazo; al lado de su borde lateral sí, y el hígado queda posterolateral al polo superior del
  riñón derecho, a 9–18 mm y tras 6–13 mm de grasa, en el borde de la sombra (los segmentos VI y VII lo rodean; la escapular
  derecha en el EIC11 ve hígado y no riñón). El
  retroperitoneo de VExUS (el psoas, el cuadrado lumbar y la grasa) con su marco anclado a lus-sim (la unión T12–L1 y el paso lumbar
  de VExUS: la parrilla no tiene vértebras lumbares); por encima de los riñones su grasa queda en la gotera paravertebral
  [ESTIMADO]. Entre el diafragma y la grasa del riñón, la grasa pararrenal posterior: en el EIC11, 11 mm en la escapular izquierda,
  15 en la derecha y 3 en la paravertebral; su grosor, NO ENCONTRADO en la base. La cobertura la cruza solo si detrás está el riñón.
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
  hábito del abdomen; la mujer, 47 mm en la profunda y la misma tranquila. La inversa (mundo → material) es exacta a 0,0065 mm
  en el punto material (en el mundo, ≤ 0,017): una bisección de 12 pasos en la vertical (10 hasta la decisión 33).
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
- **La mano del operador es una traslación rígida** (`operator-hand-rigid`, decisión 39). La pared que respira bajo la
  sonda y el temblor mueven la sonda y su compresión como un bloque, sin recalcular el contacto y sin comprimir. El
  componente AP acerca la pared entera, 0,32 mm en la respiración tranquila y 1,07 mm en la profunda, y la cara «muestrea»
  esos milímetros bajo la piel. El movimiento es el del volumen mamario en la TC 4D, usado en todos los puntos (también el
  PLAPS y los paravertebrales con el paciente sentado) y escalado en lineal con la excursión del diafragma. Lo que sigue la
  mano (`chestFollow`) no tiene fuente; está ajustado con la exploración del banco y deja T2 de la pared en 0,998–0,999,
  sobre el banco (0,982–0,993): el temblor que la bajaría rompe F-T11. El latido transmitido a la pared no se modela.
- **Sin líneas B ni colas de cometa** (`no-lung-comet-tails`): el pulmón bajo la pleura es la serie de
  reverberaciones de la pared y el deslizamiento incoherente; no hay líneas Z ni B, ni pulmón patológico. La
  física de las líneas B es de la fase 2.
- **La serie bajo la pleura remuestrea la pared en la misma línea** (`pleura-series-same-line`): las copias
  de la pared y las líneas A se forman con la pared del propio camino, no con la de la dirección reflejada
  por una pleura oblicua; las líneas A llevan el lóbulo de Kirchhoff una sola vez y tienen la anchura de la
  línea pleural. Así, al inclinar la sonda, las líneas A no se apagan antes que la línea pleural (F-T04). El lóbulo en cada
  ida y vuelta se probó y quedó aplazado (decisión 38, rama `feat/lobulo-pleura`): censura M y r₂ en el BLUE inferior y su
  modelo (un Λ(θ) constante por orden) no es aún el de la desviación acumulada de `physics.md` §2.3.
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
- **El tiempo de GPU por pasada del informe técnico no se ha validado en la GPU real** (`gpu-timer-unverified`, decisión 40):
  `gpuMs` sale de `EXT_disjoint_timer_query_webgl2` (`ultrasound/gpuTimer.ts`). En Chrome con Metal (Apple M4) la consulta
  TIME_ELAPSED alrededor de 60 cuadros da 13,6–18,5 ms por cuadro, y la media del renderizador, 6,7–59 ms, mientras el cuadro
  sincronizado en tiempo de pared cuesta 5,2–6,9 ms y dibujar y esperar cada cuadro, 6,4–7,9: más tiempo de GPU que de pared,
  imposible. El indicador de O6 es el tiempo de pared (`frameCostMs`, ya sincronizado) y los FPS del modo B (`bmodeFps`);
  `gpuMs` es orientativo hasta medirlo contra ellos en otras GPU. Con SwiftShader no hay temporizadores (null).
- **El detector del sector supone un abanico simétrico y necesita ver algo de cada borde** (`sector-detector-symmetric`,
  decisión 36): fuerza pendientes opuestas en los dos bordes (el eje del abanico, vertical), como en los 34 clips del banco y en
  el simulador; pero la geometría fijada de los clips la propuso el detector de la decisión 21 y está redondeada a 0,01 rad, así
  que esa simetría no está medida mejor que ±0,6°. Con un abanico girado alrededor del ápice el detector falla sin avisar (un
  sintético: 0,57° → el ápice a 3,4 px y un borde a 0,75°; 1° → 13,5 px y 1,95°; 3° → 47,5 px y 6°), donde el de la decisión 21
  acertaba; LUS-04a y 04f se apartan algo más de su geometría fijada (0,37° y 0,68°, antes 0,22° y 0,27°). Si un borde no se ve
  en ninguna fila (la sombra lo tapa desde la piel), su ordenada sale de los extremos de la sombra y el ápice baja por el eje
  aunque el ángulo esté bien (LUS-35v: 5 filas en el borde derecho, el ápice a 9,6 px; un sintético con la piel en el borde del
  cuadro, 19 px). Si las sombras tapan los dos bordes desde 4 mm de la piel, el arco da el ápice pero las filas de los bordes son
  las de una cuerda del contorno y los bordes quedan a 7–9° (el de la decisión 21, a 12,6°). Una marca encendida pegada al borde
  en el soporte por intensidad (un cuadro suelto o un clip quieto) mueve el ápice ≈ 7 px. Con `edgeInliers` muy bajo en un
  lado (≤ 5 filas) la geometría propuesta es de poca confianza; en el banco la geometría se fija igual (decisión 21).
- **Bajo una costilla casi en el centro de la cara, la línea pleural asoma sobre el negro** (`rib-core-leak-center`,
  decisión 42): en el BLUE inferior clínico de la regla de las manos el punto queda sobre el borde craneal de la 5.ª costilla y,
  en el núcleo de la sombra central, la línea pleural sale en la pantalla hasta 1,03 dB sobre el negro de 8 bits con la GPU real
  y 1,01 con SwiftShader (la línea 84; en 6 líneas del núcleo, sobre 0,3 dB): un gris de 0–1, pero F-T08 pide el negro. En las
  vistas de medida (las de antes de la regla), donde las costillas caen hacia los lados del sector, se cumple (la peor, 0,8 dB
  bajo el negro). Probablemente el borde de la sombra cuando la costilla cubre el centro de la apertura (el pedestal de lóbulos
  laterales que entra por la cara, decisión 20); sin medir la causa. Lo vigila una e2e que exige que la meta aún falle
  (`imagen.spec.ts`).
- **La presentación sigue en calibración preliminar** (`display-uncalibrated`, decisiones 21 y 24): el ajuste C3b-A
  K = 54 dB, R_t = 0,3 y ganancia −20 dB mejora modestamente el gris de pared y neblina del normal convexo. Con rango
  dinámico 70 dB y apnea a t = 60 s, la pared aumenta 1,64–2,02 niveles y la neblina 1,53–1,71 en los tres puntos de partida;
  el recorte pleural mediano es 0 y las pruebas de sombras y líneas A pasan sin cambiar sus guardas
  ([CI 81, 5d1b4cd](https://github.com/DanielOpazoD/lus-sim/actions/runs/36480592122)). No establece fidelidad completa ni
  validación clínica. La comparación con sujetos reservados se documenta por separado; los agregados ya eran conocidos,
  por lo que la partición no constituye validación independiente o ciega.

  Decisión 35: con R_t 0,1 (el borde de abajo de su rango con fuente, ajustado con la exploración), M de la pared queda en
  1,20–1,40 (exploración 0,85–1,40; el BLUE superior, en su borde), A2 r₂ en 0,35–0,40 (0,17–0,25) y se ve una línea A,
  como en los clips; M de la neblina, 1,41–1,54 frente a 0,87–1,00: la neblina sigue 0,05–0,28 caídas por debajo de la
  pared, y ningún σz, R_t ni K lo cambia. Falta un mecanismo de la neblina (decisión 34: no es lo difuso de la pleura).
  Decisión 38: la neblina del simulador es el campo del deslizamiento (`SLIDING_DB`, estimado y en el tope de su rango), a
  9–13 dB bajo la pared en la envolvente. El espejo y la réplica de la pared quedan 20–27 dB bajo ella, porque cada rebote
  en la pleura conserva solo su parte coherente (χ); lo que falta de la reverberación entre las caras de la pared suma
  ≤ 1,4 dB. Con una pleura lisa (σz 0,01–0,02) el espejo calza con el banco, pero la línea pleural se recorta y las líneas
  A caen solo 20–23 dB por orden: falta una pérdida que paguen las líneas A y no el espejo.

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
  En la serie de la pleura no distingue el armónico (decisión 41): ni el que acumula el espejo de la pared ni el que pierde o
  gana cada línea A tras rebotar en la pleura y en la cara de la sonda, que depende del signo y de la magnitud de R_p y de R_t
  a f y a 2f.
