# Base de conocimiento

Especificación científica de lus-sim junto con la guía (`docs/GUIDE.md`, §1): la física de la imagen
pulmonar, la anatomía del tórax, la fisiopatología que conecta el paciente virtual con lo que se ve y la
clínica que el simulador debe enseñar y evaluar. Versión 1 (26-09-2026), pendiente de revisión clínica
por Daniel antes de cerrar la fase 0.

## Cómo se construyó y cómo leerla

- Cinco investigaciones independientes, una por tema, con una regla común: toda cifra lleva su fuente,
  abierta y comprobada (PubMed, PMC, el editor o el PDF), y se indica si se leyó el texto completo o
  solo el resumen. Nada se completó de memoria; lo que no se encontró dice «NO ENCONTRADO» y qué se
  buscó.
- Etiquetas de cada valor: **[DOCUMENTADO]** (medido en un estudio), **[CONSENSO]** (guía o consenso),
  **[DERIVADO]** (calculado desde valores documentados, con el cálculo a la vista), **[DISCREPANCIA]**
  (fuentes en conflicto, con ambas) y, en anatomía, **[SUPUESTO]** (valor de trabajo sin fuente,
  marcado para calibrar).
- Las citas van como `[@clave]` y todas las claves están en `docs/REFERENCES.md` (la suite lo
  comprueba). Cuando un valor entra al código, se declara con `defineParameters`
  (`src/core/evidence.ts`) con las mismas claves.
- Cada documento de tema trae, al final, sus «implicaciones para el simulador»: metas medibles para
  pruebas automáticas. Aquí se ordenan por fase (§4).

## 1. Documentos de tema

| Documento                            | Contenido                                                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/knowledge/physics.md`          | Propiedades acústicas por tejido, línea pleural, líneas A y B y su mecanismo, deslizamiento, pulso y punto pulmonar, consolidación, derrame, sombra costal, espejo; modelos publicados; metas T01–T39.                                       |
| `docs/knowledge/anatomy.md`          | Pared torácica por región y por capa, costillas y espacios intercostales, pleura, límites del pulmón y recesos, diafragma, escápula, microanatomía subpleural; avatar de referencia; metas T1–T22.                                           |
| `docs/knowledge/pathophysiology.md`  | Relaciones cuantitativas entre agua pulmonar, presiones, PEEP, aireación y hallazgos; 14 variables latentes del paciente con sus ecuaciones de acoplamiento; metas T1–T31.                                                                   |
| `docs/knowledge/clinical.md`         | Definiciones de consenso, exactitud diagnóstica, esquemas de zonas, puntajes, protocolos BLUE y FALLS, ecografía diafragmática, 23 casos docentes (3 de insuficiencia cardiaca), trampas, cálculo del puntaje sobre la señal y metas T1–T32. |
| `docs/knowledge/reference-images.md` | Imágenes y vídeos reales con licencia para el banco de referencia (decisión 5), métricas de imagen y riesgos legales y éticos.                                                                                                               |

Para no confundir metas con el mismo número, en este documento se prefijan: **F** física, **A**
anatomía, **P** fisiopatología y **C** clínica (así, F-T01 es la meta T01 de `physics.md`).

## 2. Lo que más condiciona el diseño

**Física**

1. El aire no se propaga: refleja. Bajo la pleura de un pulmón aireado no hay anatomía que dibujar;
   todo sale de la reverberación entre sonda y pleura (líneas A), de las copias de la pared, de la
   reirradiación de trampas subpleurales (artefactos verticales) y de la dispersión de la superficie
   rugosa [@ostras-histopatologia-2023; @demi-mecanismos-2020]. Ninguna textura se fija a la pantalla.
2. Una sola microestructura subpleural (mapa de aireación más una población de trampas con tamaño,
   contenido y acceso) debe producir líneas A, B aisladas, B confluentes, pulmón blanco y consolidación.
   Se cambia la aireación y el contenido, no el «tipo de artefacto» [@soldati-trampas-2020;
   @demi-guias-2023].
3. La trampa es un resonador excitado por el pulso: su intensidad y longitud dependen de la frecuencia
   y del foco, así que cambiar la sonda o el foco cambia el conteo de líneas B, como en un equipo real
   [@demi-espectroscopia-2017; @buda-frecuencia-2021]. Los controles del ecógrafo son física, no filtros.
4. La línea pleural anatómica mide micras, muy por debajo de la longitud de onda: su grosor en la
   imagen lo fija la PSF [@fox-lineapleural-2024].
5. El neumotórax es geometría: una región sin contacto pulmón–pared cuyo borde se mueve con la
   respiración; el punto pulmonar surge de ese borde [@lichtenstein-puntopulmonar-2000].

**Anatomía**

6. La ecografía mide la pared casi a la mitad que la TAC (cociente 0,41–0,59): el simulador se calibra
   con cifras ecográficas y la geometría sin comprimir queda como referencia
   [@mclean-paredus-2011; @laan-paredtoracica-2016].
7. Avatar de referencia (hombre de 175 cm y 70 kg): pleura a 16 mm de la piel en el 2.º espacio
   intercostal medioclavicular (12–20) y a 13 mm en el 5.º lateral; sombra costal de 13–15 mm;
   espacios intercostales de 12–20 mm; línea pleural unos 5 mm bajo la línea costal
   [@kimys-espaciosic-2014; @lichtenstein-luci-2014]. Las variantes delgada, obesa, femenina y mayor
   de 70 años están en `anatomy.md` §2.

**Fisiopatología**

8. Las líneas B siguen al agua pulmonar acumulada, no a la presión instantánea: EVLWI = 0,449 ×
   líneas B en 28 sitios + 3,79 mL/kg (r = 0,93) [@mayr-evlw-2022]. Las presiones de llenado de EchoTwin
   y la presión auricular derecha de VExUS entran al pulmón solo a través del agua, con retardo
   [@picano-aguapulmonar-2016; @caltabeloti-fluidos-2014].
9. La aireación regional ordena el patrón: densidad media ≈ −675/−617/−462/−148 UH para los grados
   0/1/2/3 (fracción de gas ≈ 0,68/0,62/0,46/0,15) [@mongodi-qlus-2024]. La ecografía no ve la
   hiperinsuflación [@bouhemad-peep-2011].
10. El deslizamiento es mayor en la base que en el vértice (8,6 frente a 3,6 mm en ventilación mecánica)
    [@briganti-deslizamiento-2023].

**Clínica**

11. Las definiciones operativas son las de la actualización focalizada de 2026
    [@volpicelli-actualizacion-2026], leída completa el 26-09-2026 (PDF aportado por Daniel). Tiene 113
    enunciados: 83 votados con ≥80 % de acuerdo, 1 escindido y 29 heredados; ninguno trae gradación.
    Donde 2026 difiere del consenso de 2012 [@volpicelli-consenso-2012], leído completo, **manda 2026**.
    Lo heredado conserva la gradación de 2012. Donde 2026 no dice nada, valen las guías técnicas de 2023
    [@demi-guias-2023] y las demás fuentes (`clinical.md` §1.0 bis). Cambios que afectan al simulador:
    - la zona positiva se define por cuadro y el síndrome intersticial es difuso o focal;
    - las líneas A pueden coexistir con las B;
    - la pleura alterada se describe como irregular o fragmentada, no por su grosor;
    - aparecen el hidropunto y la rama de estabilidad del neumotórax;
    - se acepta cualquier sonda, incluida la de matriz de fase;
    - el preajuste es un foco en la pleura, armónicos y compuesto apagados y 10–12 cm;
    - el puntaje de 12 zonas usa el peor cuadro y tiene una variante del 50 %, y no diagnostica.
12. El puntaje se calcula sobre la señal: rasgos por espacio intercostal (pleura, deslizamiento, pulso,
    líneas A y B, fracción de pleura afectada, consolidación, derrame), grado por región igual al peor
    espacio, y agregados por esquema (12 regiones, 8 zonas, 28 sitios, 14 áreas, reaireación, perfil
    BLUE). Una región con neumotórax es «no puntuable», no 0 (`clinical.md` §6).
13. La consolidación necesita dos estados más: la perfusión, que da el flujo del Doppler color, y el
    contenido y la forma del árbol bronquial (aire móvil, aire inmóvil o líquido; arboriforme o paralelo
    según el volumen). Con ellos se separan la neumonía y la atelectasia [@demi-guias-2023;
    @kok-neumonia-2025; @berry-uci-2025]. Ninguna de las fuentes leídas aporta un puntaje diagnóstico de
    la neumonía asociada al ventilador (`clinical.md` §8).
14. La insuficiencia cardiaca (IC) tiene su propio consenso, el de la EACVI de 2023
    [@gargani-eacvi-2023], leído completo, con dos fuentes de apoyo [@yuriditsky-ecocardiografistas-2021;
    @gargani-cardiopractice-2025]. Cambios que afectan al simulador (`clinical.md` §1.8.5, §1.8.8 y §6.3):
    - el conteo de la IC usa 8 zonas por omisión, frente a las 28 u 8 que admite 2026 para el agua
      extravascular;
    - una zona con derrame visible no es evaluable para líneas B;
    - las líneas B se cuentan en el peor punto de cada zona; las confluentes, como % ÷ 10, con un tope de
      10 por zona;
    - los cortes al alta llevan intervalos de confianza muy amplios, y el criterio de 8 zonas es ambiguo
      en su fuente;
    - la descongestión eficaz es llegar a cero líneas B o bajar ≥50 %;
    - la matriz E/e′ × líneas B es la prueba de coherencia con EchoTwin y VExUS.

## 3. El paciente virtual

`pathophysiology.md` §2 propone 14 variables latentes con sus fuentes: agua pulmonar global y su reparto
regional, permeabilidad, presiones motrices externas (de EchoTwin y VExUS), fracción de gas por región,
lesiones focales, espesor de consolidación, aire y líquido pleurales, adherencias, ventilación regional
y esfuerzo inspiratorio (del simulador del ventilador), volumen corriente y modo, y postura. Cada
observable ecográfico se calcula desde ellas, nunca se pinta; las ecuaciones de acoplamiento llevan su
fuente y marcan como parámetros libres lo que no se encontró (la dinámica de filtración y drenaje).

Ese conjunto es el contrato pulmonar que el paciente común de la unión incorporará
(`docs/UNIFICATION.md`): las entradas externas (presiones, gas regional, esfuerzo) son las que
entregarán EchoTwin, VExUS y el simulador del R860.

## 4. Metas de prueba por fase

| Fase (`docs/ROADMAP.md`)   | Metas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — motor y primera imagen | A-T1–T3, A-T6–T11 (profundidades, líneas A, murciélago, espacios intercostales, grosor de la línea pleural); F-T01–T09, F-T35 (espaciado y decaimiento de líneas A, incidencia, sombra, cartílago).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2 — física pulmonar        | F-T10–T34 y F-T37–T39 (modo M, deslizamiento, líneas B y su selectividad, foco, armónicos, composición, líneas Z y E, consolidación con sus artefactos de margen, reclutamiento corriente y broncograma líquido, derrame, espejo); A-T20–T21 (líneas B septales, broncograma); C-T1, C-T2 y C-T15 (geometría del broncograma, flujo Doppler según la perfusión, índice mecánico del preajuste).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3 — tórax completo         | A-T12–T19 (líquido fisiológico, cortina, diafragma, ventana cardiaca, escápula, oblicuidad costal); P-T23–T26 (neumotórax, derrame, deslizamiento, diafragma); F-T36 (hidropunto).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4 — clínica                | C §6 (rasgos, puntajes y agregados sobre la señal; modo examen; cohortes virtuales frente a la exactitud publicada); P-T1–T12 y P-T18–T22 (agua y conteos, presiones, distribución, cinética); C-T3–T6 y C-T10–T14 (neumonía frente a atelectasia, dependencia del esquema, falsos negativos, curso de la neumonía, tiempo, aprendizaje, pensamiento diagnóstico, patrón de referencia y LUS-ARDS, esta bloqueada); C-T16–T24 y C-T27–T31 (conteo de la IC, derrame no evaluable, exactitud, sanos, 8 frente a 28 zonas, banderas, descongestión, cambio mínimo, IC derecha aislada, rasgos diferenciales, estrés y postura); P-T28–T29 (derrame más lento que el edema y magnitud de la descongestión); P-T30–T31 y C-T32 (bisagra presión → líneas B, suelo del pulmón sano y estrés en sanos; propuesta de protocolos de IC en `docs/HEART_FAILURE.md`). |
| 5 — puentes                | P-T13–T17 (PEEP, reaireación, hiperinsuflación invisible, densidad, mecánica); C-T7–T9 (reaireación de la neumonía asociada al ventilador, destete, umbrales diafragmáticos con su maniobra); C-T25–T26 y P-T27 (coherencia de la E/e′ de EchoTwin y la vena cava de VExUS con las líneas B).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Cada meta entra como prueba en la fase de su módulo, con su mutación (`docs/TESTING.md`). Las
tolerancias marcadas [DERIVADO] en los documentos de tema son propuestas razonables, no valores
publicados, y se declaran como tales en la prueba.

## 5. Discrepancias que el modelo debe tratar explícitamente

- **Reflexión efectiva del pulmón aireado**: interfaz ideal (≈ 1) frente a impedancia efectiva ex vivo
  (0,8–0,9); se modela microestructura y se verifica F-T06 (`physics.md`, anexo B).
- **Atenuación del pulmón sin aire**: 0,12–0,6 dB/cm/MHz (consolidado o inundado) frente a 14 dB/cm/MHz
  (IT'IS, pulmón desinflado): se usa el rango bajo para la consolidación.
- **Líneas B y presión de llenado**: predominio A con PAOP alta entre el 7 % y el 60 % según la cohorte
  [@lichtenstein-paop-2009; @volpicelli-paop-2014]: el modelo usa agua acumulada con retardo.
- **PEEP**: la reaireación sigue al reclutamiento por curvas P-V (rho 0,88) pero no al de la TAC
  (R = 0,01) [@bouhemad-peep-2011; @chiumello-tac-2018]: se calculan ambas métricas.
- **Volumen de derrame**: 20 × separación [@balik-derrame-2006] es la fórmula que respalda 2026, en
  supino y en corte transversal lateral sobre el ángulo costofrénico [@volpicelli-actualizacion-2026]
  (D6_11). Pero validó mal fuera de su cohorte (ICC 0,34) [@hassan-ecuaciones-2017]: error de medición
  realista.
- **Espesor de la pared lateral frente a la anterior** y **borde posterior del pulmón** (T10 frente a
  T12): discrepancias anatómicas documentadas en `anatomy.md` §0.
- **Grosor del diafragma en la zona de aposición**: 1,4–1,9 mm en la mayoría de las series frente a
  2,7–3,8 mm en una grande.
- **Umbral de disfunción diafragmática**: < 10 mm [@kim-disfuncion-2011] frente a < 2 cm
  [@haaksma-exodus-2022], y 25 mm con dos lecturas y sin maniobra declarada: por debajo, disfunción grave
  [@berry-uci-2025]; por encima durante la prueba de ventilación espontánea, éxito [@demi-guias-2023].
  Cada umbral se muestra con su maniobra (`clinical.md` §1.9).
- **Perfusión de la atelectasia**: sin flujo en el Doppler color según [@berry-uci-2025], pero con un
  realce precoz y marcado, igual que la inflamación, en la ecografía con contraste según
  [@demi-guias-2023]. La perfusión y el flujo visible se modelan como observables distintos.
- **Puntaje de una consolidación subpleural pequeña**: 3 en el clásico y en la variante 2026 del 50 %
  [@volpicelli-actualizacion-2026] (D6_7.4), 1–2 en el modificado [@mongodi-lusmod-2017].
- **Puntuación de una zona con derrame**: la leyenda de la Fig. 4A de 2026 le da 3, pero el enunciado
  D6_7.4 solo nombra la consolidación. Por omisión se puntúa el pulmón visible y el derrame se informa
  aparte, con la opción «derrame = 3» conmutable (`clinical.md` §1.0 bis y §6.3). El documento tiene
  otras siete inconsistencias internas menores, listadas allí mismo.
- **Artefactos verticales sin deslizamiento**: pueden verse, pero 2026 no les da el valor de una línea B
  (D1_1.1). Se clasifican aparte y no entran en el grado mientras no haya consenso.
- **Consenso de 2026 frente al EACVI en la IC**: ámbito general frente a específico de la IC. Se anotan
  ambos (`clinical.md` §5.12):
  - Esquema: 8 zonas «idealmente» según [@gargani-eacvi-2023], frente a 28 u 8 zonas, las 28 sobre todo
    en cardiología y diálisis, en 2026 (D6_2.4) [@volpicelli-actualizacion-2026].
  - Postura para cuantificar: sentado, semirrecostado o supino, siempre la misma, según el EACVI;
    supino o casi supino según 2026.
  - Armónicos: el EACVI acepta el preajuste cardiaco y no describe diferencias clínicamente
    significativas entre ajustes; [@yuriditsky-ecocardiografistas-2021] los apaga, y 2026 sugiere
    apagarlos, aunque admite que los ajustes cambian el aspecto de las líneas B y no su significado
    (D1_1.2).
  - Frente a la radiografía con NT-proBNP: la ecografía «mejora» la exactitud según el EACVI, y «no es
    inferior» y es más rápida según 2026 (D3_3.4) y [@gargani-cardiopractice-2025].
- **Criterio de 8 zonas al alta (Coiro 2015)**: «≥1 zona positiva en cada hemitórax» según el EACVI y «≥1
  de 8» según una revisión sistemática; sin verificar en el texto completo (`clinical.md` §8).

## 6. Vacíos de conocimiento

Parámetros sin fuente, que quedan como calibrables y declarados en `docs/APPROXIMATIONS.md` cuando
entren al código: reflexión de la cara del transductor, rugosidad RMS de la pleura, amplitud del pulso
pulmonar, amplitud de la sinusoide del derrame y ancho de las líneas B in vivo (`physics.md` §3.4);
distancia piel–pleura posterior, grosor de los músculos de la pared en sanos y correspondencia de los
puntos BLUE con los espacios intercostales (`anatomy.md` §4); líneas B que desaparecen por litro de
ultrafiltración, coeficiente de filtración y umbral de edema en humanos, relación punto pulmonar–volumen
en humanos y volumen de derrame que produce atelectasia visible (`pathophysiology.md` §1.13).

La actualización 2026 del consenso internacional [@volpicelli-actualizacion-2026] ya está leída completa
(26-09-2026) y aplicada en `clinical.md` y `physics.md`. Quedan pendientes tres cosas:

- sus porcentajes de acuerdo por enunciado y qué enunciados tuvieron abstención alta, que solo están en
  el material suplementario ESM 4, no incluido en el PDF;
- el texto completo del consenso ESICM–ESPNIC de 2025 [@mongodi-esicm-espnic-2025], que 2026 cita como
  respaldo del esquema de 12 zonas sin detallarlo;
- los vacíos que 2026 declara: umbrales de pronóstico del puntaje, subtipos del SDRA, predicción del
  destete, cuantificación del neumotórax y del derrame, y cuantificación del deslizamiento.

En la insuficiencia cardiaca, el EACVI no da umbrales numéricos para la IC crónica ni para el estrés, ni
cifras de concordancia, así que el cambio mínimo detectable del conteo queda como parámetro. Tampoco
define los reparos de sus esquemas de 4 y 6 zonas (`clinical.md` §8).

Las revisiones de 2024–2025 [@kok-neumonia-2025; @berry-uci-2025; @ovesen-urgencias-2024], leídas
completas, no cierran tres vacíos: el umbral <13 de Soummer sigue sin verificar, no traen ningún puntaje
diagnóstico de la neumonía asociada al ventilador (VPLUS o CPIS con ecografía) y dan las reglas del
LUS-ARDS solo de segunda mano (`clinical.md` §8).

## 7. Preguntas para la revisión clínica

- ~~¿Puntaje por omisión clásico o modificado?~~ **Respondida por 2026** (D6_7.4 y D6_7.5).
  - Por omisión va el clásico de 12 zonas: grados 0–3 con «<3 líneas B con deslizamiento» como 0,
    el peor cuadro de cada zona y un total de 0–36.
  - Como alternativa oficial solo se admite separar el 1 del 2 por la fracción de pleura ocupada por
    líneas B (≤50 % o >50 %); cualquier consolidación sigue valiendo 3.
  - El modificado de Mongodi e ITACO no figura en 2026, que además considera no esencial complicar el
    puntaje. Queda como tercera opción rotulada «fuera del consenso».
  - Falta que Daniel confirme la prioridad docente.
- ~~¿Qué esquema de zonas usa el modo examen por omisión?~~ **Respondida por 2026**: depende de la
  pregunta clínica (`clinical.md` §3.8).
  - Síndrome intersticial: 8 zonas (D3_1.2), o 4 en el crítico con insuficiencia respiratoria aguda.
  - Aireación y SDRA en la UCI: 12 zonas (D6_7.4).
  - Congestión en cardiología o diálisis: 28 u 8 zonas (D6_2.4). En la IC, el modo examen usa 8 zonas
    por omisión, porque el consenso específico de la IC las prefiere y su índice C no es inferior al de
    28 [@gargani-eacvi-2023]; las 28 quedan como alternativa (`clinical.md` §3.8).
  - EPI y consolidaciones: todo el tórax, con las zonas posteriores (D3_1.2, D4_1.5).
  - El modo examen elige el esquema según el caso.
  - En la investigación de urgencias, el de 8 zonas es también el más usado (74 de 406 estudios, 18 %)
    [@ovesen-urgencias-2024].
- ¿Qué casos docentes del hospital (`clinical.md` §4) conviene priorizar para la fase 4?
