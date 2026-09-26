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

| Documento                            | Contenido                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/knowledge/physics.md`          | Propiedades acústicas por tejido, línea pleural, líneas A y B y su mecanismo, deslizamiento, pulso y punto pulmonar, consolidación, derrame, sombra costal, espejo; modelos publicados; metas T01–T35. |
| `docs/knowledge/anatomy.md`          | Pared torácica por región y por capa, costillas y espacios intercostales, pleura, límites del pulmón y recesos, diafragma, escápula, microanatomía subpleural; avatar de referencia; metas T1–T22.     |
| `docs/knowledge/pathophysiology.md`  | Relaciones cuantitativas entre agua pulmonar, presiones, PEEP, aireación y hallazgos; 14 variables latentes del paciente con sus ecuaciones de acoplamiento; metas T1–T26.                             |
| `docs/knowledge/clinical.md`         | Definiciones de consenso, exactitud diagnóstica, esquemas de zonas, puntajes, protocolos BLUE y FALLS, ecografía diafragmática, 15 casos docentes, trampas y cálculo del puntaje sobre la señal.       |
| `docs/knowledge/reference-images.md` | Imágenes y vídeos reales con licencia para el banco de referencia (decisión 5), métricas de imagen y riesgos legales y éticos.                                                                         |

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

11. Las definiciones operativas son las del consenso de 2012 [@volpicelli-consenso-2012], leído
    completo, y de las guías técnicas de 2023 [@demi-guias-2023]. Existe una actualización focalizada
    publicada en 2026 [@volpicelli-actualizacion-2026] cuyo texto completo no se pudo leer (§6).
12. El puntaje se calcula sobre la señal: rasgos por espacio intercostal (pleura, deslizamiento, pulso,
    líneas A y B, fracción de pleura afectada, consolidación, derrame), grado por región igual al peor
    espacio, y agregados por esquema (12 regiones, 8 zonas, 28 sitios, 14 áreas, reaireación, perfil
    BLUE). Una región con neumotórax es «no puntuable», no 0 (`clinical.md` §6).

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

| Fase (`docs/ROADMAP.md`)   | Metas                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — motor y primera imagen | A-T1–T3, A-T6–T11 (profundidades, líneas A, murciélago, espacios intercostales, grosor de la línea pleural); F-T01–T09, F-T35 (espaciado y decaimiento de líneas A, incidencia, sombra, cartílago). |
| 2 — física pulmonar        | F-T10–T34 (modo M, deslizamiento, líneas B y su selectividad, foco, armónicos, composición, líneas Z y E, consolidación, derrame, espejo); A-T20–T21 (líneas B septales, broncograma).              |
| 3 — tórax completo         | A-T12–T19 (líquido fisiológico, cortina, diafragma, ventana cardiaca, escápula, oblicuidad costal); P-T23–T26 (neumotórax, derrame, deslizamiento, diafragma).                                      |
| 4 — clínica                | C §6 (rasgos, puntajes y agregados sobre la señal; modo examen; cohortes virtuales frente a la exactitud publicada); P-T1–T12 y P-T18–T22 (agua y conteos, presiones, distribución, cinética).      |
| 5 — puentes                | P-T13–T17 (PEEP, reaireación, hiperinsuflación invisible, densidad, mecánica).                                                                                                                      |

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
- **Volumen de derrame**: 20 × separación [@balik-derrame-2006] validó mal fuera de su cohorte
  (ICC 0,34) [@hassan-ecuaciones-2017]: error de medición realista.
- **Espesor de la pared lateral frente a la anterior** y **borde posterior del pulmón** (T10 frente a
  T12): discrepancias anatómicas documentadas en `anatomy.md` §0.
- **Grosor del diafragma en la zona de aposición**: 1,4–1,9 mm en la mayoría de las series frente a
  2,7–3,8 mm en una grande.
- **Umbral de disfunción diafragmática**: < 10 mm [@kim-disfuncion-2011] frente a < 2 cm
  [@haaksma-exodus-2022].
- **Puntaje de una consolidación subpleural pequeña**: 3 en el clásico, 1–2 en el modificado
  [@mongodi-lusmod-2017].

## 6. Vacíos de conocimiento

Parámetros sin fuente, que quedan como calibrables y declarados en `docs/APPROXIMATIONS.md` cuando
entren al código: reflexión de la cara del transductor, rugosidad RMS de la pleura, amplitud del pulso
pulmonar, amplitud de la sinusoide del derrame y ancho de las líneas B in vivo (`physics.md` §3.4);
distancia piel–pleura posterior, grosor de los músculos de la pared en sanos y correspondencia de los
puntos BLUE con los espacios intercostales (`anatomy.md` §4); líneas B que desaparecen por litro de
ultrafiltración, coeficiente de filtración y umbral de edema en humanos, relación punto pulmonar–volumen
en humanos y volumen de derrame que produce atelectasia visible (`pathophysiology.md` §1.13).

Pendiente de acceso: el texto completo de la actualización 2026 del consenso internacional
[@volpicelli-actualizacion-2026] y del consenso ESICM–ESPNIC de 2025 [@mongodi-esicm-espnic-2025]. Antes
de fijar las definiciones clínicas del simulador (fase 4) conviene leerlos; si Daniel tiene acceso
institucional, se contrastan con las definiciones de 2012 usadas aquí.

## 7. Preguntas para la revisión clínica

- ¿Puntaje por omisión clásico o modificado (umbral del 50 % de la pleura)? El simulador puede calcular
  ambos; la pregunta es cuál se muestra y evalúa primero.
- ¿Qué esquema de zonas usa el modo examen por omisión: 12 regiones (UCI), 8 zonas (urgencias) o
  28 sitios (cardiología)?
- ¿Qué casos docentes del hospital (`clinical.md` §4) conviene priorizar para la fase 4?
