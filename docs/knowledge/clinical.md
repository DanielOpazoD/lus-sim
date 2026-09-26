# Ecografía pulmonar clínica del adulto — base de conocimiento para `lus-sim`

Fecha de la búsqueda: 26-09-2026. Alcance: clínica, protocolos, signos, puntajes, esquemas de zonas, casos docentes y trampas de la ecografía pulmonar (LUS) del adulto, más ecografía diafragmática clínica.

## 0. Cómo leer este documento

**Etiquetas de evidencia** (en cada cifra o afirmación no trivial):

- **[DOCUMENTADO]**: medido en un estudio.
- **[CONSENSO]**: guía, consenso de expertos o revisión de autor de referencia.
- **[DERIVADO]**: calculado o construido a partir de valores documentados; se muestra el cálculo o la lógica.
- **[DISCREPANCIA]**: las fuentes no coinciden; se dan ambas.

**Cómo se verificó cada fuente**: cada referencia se abrió en PubMed (registro leído mediante la API oficial E-utilities de NCBI, porque la web de PubMed pedía reCAPTCHA), en Europe PMC o PMC (texto completo XML) o en la página del editor. En la bibliografía (§7) se indica el nivel de lectura de cada fuente:

- **TC**: texto completo leído (XML de Europe PMC o NCBI).
- **TC-e**: texto completo del editor o de PMC leído con extracción asistida de pasajes concretos.
- **R**: solo el resumen.
- **S**: fuente secundaria que reproduce datos de una primaria inaccesible.

Las cifras marcadas «(R)» salen solo del resumen.

**Derechos de autor**: las definiciones de consensos se dan como **paráfrasis fiel en español**, con su código de enunciado (p. ej., «B-D2-S2») para localizar el texto exacto. No se reproducen párrafos textuales.

**Nomenclatura de zonas usada en todo el documento** (esquema de 12 regiones, §3.4): D = hemitórax derecho, I = izquierdo; As = anterior superior, Ai = anterior inferior, Ls = lateral superior, Li = lateral inferior, Ps = posterior superior, Pi = posterior inferior. Un vector de grados se escribe así: D[As, Ai, Ls, Li, Ps, Pi] | I[...].

---

## 1. Definiciones operativas

### 1.0 Estado de los consensos internacionales (verificado)

| Documento                                                                                                 | Método                                                                                                                                                                          | Qué aporta                                                                                                                                  | Acceso                                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Consenso internacional de 2012                                                                            | 28 expertos de 8 países; GRADE con método RAND y Delphi modificado presencial; 73 enunciados (65 fuertes, 2 débiles, 6 sin acuerdo). Preveía actualizarse al menos cada 4 años. | Base de las definiciones de este documento                                                                                                  | TC-e ([@volpicelli-consenso-2012])        |
| Guías de Demi y cols. (J Ultrasound Med 2023)                                                             | Delphi con clínicos, ingenieros y físicos; de 80 enunciados iniciales, 20 finales                                                                                               | Técnica, seguridad (índice mecánico), terminología, protocolos y formación                                                                  | TC ([@demi-guias-2023])                   |
| Consenso ESICM–ESPNIC de ecografía pulmonar cuantitativa (2025)                                           | 20 expertos (adultos, pediatría y neonatología) y 2 metodólogos; 14 preguntas; 46 enunciados, todos con acuerdo                                                                 | Puntajes cuantitativos en UCI                                                                                                               | Solo R ([@mongodi-esicm-espnic-2025])     |
| **Actualización focalizada 2025 del consenso de 2012** (publicada en Intensive Care Med en julio de 2026) | Delphi con 21 expertos y 1775 publicaciones nuevas revisadas (2012–2025); umbral de acuerdo del 80 %; recomendaciones ACCORD                                                    | 83 enunciados sobre signos, técnica, monitorización y aplicaciones clínicas de la ecografía pulmonar a pie de cama como herramienta aislada | Solo R ([@volpicelli-actualizacion-2026]) |

Es el consenso internacional más reciente. **Sus enunciados concretos no pudieron verificarse**, porque el texto completo está tras un muro de pago. Cuando sea accesible, conviene contrastar con él las definiciones de 2012 usadas abajo.

### 1.1 Superficie pulmonar normal

| Signo                                               | Definición operativa (paráfrasis fiel)                                                                                                                                                                                                                                                                                                                                                                                                                             | Etiqueta y fuente                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Línea pleural y «signo del murciélago» (_bat sign_) | La línea pleural es una línea horizontal hiperecoica situada unos 0,5 cm por debajo de la línea de las costillas en adultos. Las dos costillas con su sombra y la línea pleural forman el «murciélago». Es un reparo permanente que indica la pleura parietal y es visible aun en pacientes agitados, bariátricos o con enfisema subcutáneo.                                                                                                                       | [CONSENSO] [@lichtenstein-luci-2014] (texto y leyenda de la Fig. 2)                                                 |
| Deslizamiento pulmonar (_lung sliding_)             | Movimiento rítmico, sincrónico con la respiración, entre las pleuras parietal y visceral, en aposición directa o separadas por una lámina fina de líquido. Se prefiere el término _sliding_ a _gliding_. En modo M produce el «signo de la orilla del mar» (_seashore sign_): estratificado sobre la pleura y granular («arena») por debajo. Es más discreto en los vértices. Los filtros de promediado y de ruido dinámico pueden ocultar un deslizamiento sutil. | [CONSENSO] [@volpicelli-consenso-2012] (comentarios y B-D2-S9); [@lichtenstein-luci-2014]                           |
| Líneas A                                            | Artefactos horizontales de repetición (reverberación) de la línea pleural, equidistantes y paralelos, generados por el aire subpleural. Con deslizamiento indican superficie aireada normal o con exceso de aire; en ausencia de deslizamiento también aparecen en el neumotórax.                                                                                                                                                                                  | [CONSENSO] [@lichtenstein-blue-2008] (Métodos, TC-e); [@picano-aguapulmonar-2016] (Tabla 1); [@gargani-howido-2014] |
| Pulso pulmonar (_lung pulse_)                       | Movimiento sutil y rítmico de la pleura visceral sobre la parietal, sincrónico con el latido cardiaco, perceptible en la línea pleural cuando no hay deslizamiento respiratorio. Descarta neumotórax en ese punto.                                                                                                                                                                                                                                                 | [CONSENSO] [@volpicelli-consenso-2012] (comentarios); [DOCUMENTADO] [@lichtenstein-pulso-2003] (R)                  |
| Signo de la cortina (_curtain sign_)                | Entrada y salida cíclica del pulmón aireado en el receso costofrénico con la respiración: en inspiración «cubre» el hígado o el bazo y el diafragma. Normal en ausencia de derrame.                                                                                                                                                                                                                                                                                | [CONSENSO] [@gargani-howido-2014]                                                                                   |

### 1.2 Síndrome intersticial (líneas B)

| Signo                                            | Definición operativa                                                                                                                                                                                                                                                                                  | Etiqueta y fuente                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Línea B                                          | Artefacto vertical de reverberación, discreto, hiperecoico, «en láser». Nace de la línea pleural, llega al fondo de la pantalla sin atenuarse y se mueve sincrónicamente con el deslizamiento. Es un artefacto y su base anatómica y física no se conoce con certeza (2012).                          | [CONSENSO] [@volpicelli-consenso-2012] (P-D2-S1, RL-D5-S1, RL-D5-S2)                                                                                                                                                                                                       |
| Criterios de Lichtenstein                        | Tres criterios **constantes**: artefacto en cola de cometa, nace de la línea pleural y se mueve con el deslizamiento. Cuatro **casi constantes**: largo, bien definido, en láser e hiperecoico, y borra las líneas A.                                                                                 | [CONSENSO] [@lichtenstein-luci-2014]                                                                                                                                                                                                                                       |
| Patrón B / «cohetes pulmonares» (_lung rockets_) | Tres o más líneas B entre dos costillas. Hasta 3–4 líneas B son «cohetes septales», que se correlacionan con líneas B de Kerley. El doble son «cohetes en vidrio esmerilado», que se correlacionan con áreas en vidrio esmerilado. El consenso 2012 recomienda llamarlo «patrón B» (_B-pattern_).     | [CONSENSO] [@lichtenstein-luci-2014]; [@volpicelli-consenso-2012] (B-D2-S10)                                                                                                                                                                                               |
| Región positiva                                  | ≥3 líneas B en un plano longitudinal entre dos costillas.                                                                                                                                                                                                                                             | [CONSENSO] [@volpicelli-consenso-2012] (B-D2-S2, fuerte, nivel A)                                                                                                                                                                                                          |
| Examen positivo para síndrome intersticial       | ≥2 regiones positivas en cada hemitórax (bilateral).                                                                                                                                                                                                                                                  | [CONSENSO] [@volpicelli-consenso-2012] (B-D2-S4, fuerte, B)                                                                                                                                                                                                                |
| B1 frente a B2 (aireación)                       | B1: líneas B múltiples, bien definidas, espaciadas unos 7 mm o irregularmente (pérdida moderada de aireación). B2: líneas B coalescentes (pérdida grave).                                                                                                                                             | [DOCUMENTADO] [@bouhemad-peep-2011] (R: cuatro entidades); detalle de «7 mm» solo en fuente secundaria [@lopes-reaireacion-2025] (S)                                                                                                                                       |
| «Pulmón blanco»                                  | Líneas B coalescentes que ocupan toda la ventana; corresponde a edema alveolar o a una pérdida grave de aireación.                                                                                                                                                                                    | [CONSENSO] [@picano-aguapulmonar-2016]; [@gargani-howido-2014]                                                                                                                                                                                                             |
| Semicuantificación                               | Contar las líneas B de 0 a 10 por espacio intercostal. Si son confluentes, estimar el % de la ventana bajo la pleura ocupado por blanco y dividir por 10 (30 % ≈ 3 líneas B), con máximo de 10 por zona. Contar en el punto «peor» de cada zona.                                                      | [CONSENSO] [@volpicelli-consenso-2012] (B-D2-S4); [@gargani-howido-2014]; [@gargani-eacvi-2023]                                                                                                                                                                            |
| Líneas B «normales»                              | Hasta 2 líneas B por espacio intercostal o hasta 5 en el barrido anterolateral completo (28 zonas) pueden ser normales, más en las zonas laterobasales. En sujetos sin síndrome intersticial radiológico, los cometas estaban ausentes o confinados al último espacio intercostal lateral en 120/129. | [CONSENSO] [@picano-aguapulmonar-2016]; [DOCUMENTADO] [@lichtenstein-cometas-1997] (R); [@gargani-eacvi-2023]                                                                                                                                                              |
| Líneas Z                                         | Artefactos verticales mal definidos y cortos que nacen de la línea pleural, **no borran las líneas A** y no son perfectamente sincrónicos con la respiración. Frecuentes en población sana (>80 % según revisión secundaria).                                                                         | [CONSENSO] [@lichtenstein-luci-2014] (leyenda de la Fig. 5); [@francisco-lineas-2016] (S)                                                                                                                                                                                  |
| Líneas E (enfisema subcutáneo)                   | Líneas verticales que **nacen del tejido subcutáneo con gas, no de la pleura**. No se mueven con la respiración y pueden borrar las líneas A, lo que las confunde con líneas B.                                                                                                                       | [CONSENSO] [@francisco-lineas-2016] (revisión; fuente primaria NO ENCONTRADA, §8)                                                                                                                                                                                          |
| «Haz de luz» (_light beam_)                      | Banda hiperecoica ancha que nace de la pleura. Es un signo del patrón de alta probabilidad de COVID-19 y un predictor independiente de RT-PCR positiva. No es específico.                                                                                                                             | [DOCUMENTADO] [@volpicelli-covid-2021] (TC)                                                                                                                                                                                                                                |
| Áreas respetadas (_spared areas_)                | Al menos un espacio intercostal con patrón normal rodeado de áreas de síndrome intersticial.                                                                                                                                                                                                          | [DOCUMENTADO] [@copetti-sdra-2008] (Métodos, TC)                                                                                                                                                                                                                           |
| Alteración de la línea pleural                   | Engrosamiento >2 mm, pequeñas consolidaciones subpleurales o aspecto grueso o irregular de la línea pleural.                                                                                                                                                                                          | [DOCUMENTADO] [@copetti-sdra-2008]. [DISCREPANCIA] Demi 2023 (enunciado 4) declara que **no existe consenso** sobre parámetros objetivos de regularidad o engrosamiento pleural ni sobre el límite en mm entre micro- y macroconsolidación, y pide informar tamaños en mm. |

### 1.3 Consolidación

| Signo                                          | Definición operativa                                                                                                                                                                                                            | Etiqueta y fuente                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Consolidación                                  | Región subpleural hipoecoica o con ecotextura tisular (hepatización). No descarta consolidaciones que no alcanzan la pleura.                                                                                                    | [CONSENSO] [@volpicelli-consenso-2012] (B-D3-S1, fuerte, C; P-D3-S3)                                                          |
| Definición operativa del estudio de referencia | Patrón tisular visible en la pared, que nace de la línea pleural y carece de dinámica inspiratoria centrífuga. Sensibilidad 90 % y especificidad 98 % frente a TC; kappa 0,89.                                                  | [DOCUMENTADO] [@lichtenstein-consolidacion-2004] (R)                                                                          |
| Signo fractal o _shred_                        | En la consolidación **no translobar**, el borde profundo con el pulmón aireado es irregular («fractal»), a diferencia de la «línea pulmonar» regular del derrame.                                                               | [CONSENSO] [@lichtenstein-luci-2014]                                                                                          |
| Signo tisular (_tissue-like_)                  | En la consolidación **translobar**, el pulmón tiene el aspecto del hígado. Ambos signos: sensibilidad 90 % y especificidad 98 %. El 98 % de las consolidaciones tocan la pared y el 90 % se localizan en el punto PLAPS.        | [CONSENSO/DOCUMENTADO] [@lichtenstein-luci-2014]                                                                              |
| Broncograma aéreo dinámico                     | Focos hiperecoicos dentro de la consolidación que se mueven con la respiración. En consolidación con broncograma: especificidad 94 % y VPP 97 % para neumonía frente a atelectasia de reabsorción. Sensibilidad 61 %, VPN 43 %. | [DOCUMENTADO] [@lichtenstein-broncograma-2009] (R); [DERIVADO] 32/52 = 61,5 %, 15/16 = 93,8 %, 32/33 = 97,0 %, 15/35 = 42,9 % |
| Broncograma estático                           | Visto en la mayoría de las atelectasias de reabsorción (dinámico solo en 1/16) y en un tercio de las neumonías (20/52).                                                                                                         | [DOCUMENTADO] [@lichtenstein-broncograma-2009] (R)                                                                            |
| Líneas C                                       | Imágenes focales subpleurales hipoecoicas, con o sin interrupción de la línea pleural (lesión parenquimatosa periférica).                                                                                                       | [DOCUMENTADO] [@soldati-contusion-2006] (R); [@francisco-lineas-2016] (S)                                                     |

### 1.4 Derrame pleural

| Signo                                                  | Definición operativa                                                                                                                                                                                                                                                                                                                                                | Etiqueta y fuente                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Derrame libre                                          | En casi todos los derrames libres coexisten (a) un espacio, habitualmente anecoico, entre pleura parietal y visceral y (b) el movimiento respiratorio del pulmón dentro del derrame (signo sinusoidal).                                                                                                                                                             | [CONSENSO] [@volpicelli-consenso-2012] (RL-D4-S3, fuerte, A)                                         |
| Signo del cuadrilátero (_quad sign_)                   | El borde profundo de la colección, regular y casi paralelo a la línea pleural, es la «línea pulmonar» (pleura visceral). Con la línea pleural y las sombras costales forma un cuadrilátero. La definición no depende del color: los derrames más graves (empiema, hemotórax) son ecogénicos. Sensibilidad 93 %, especificidad 97 %.                                 | [CONSENSO/DOCUMENTADO] [@lichtenstein-luci-2014]                                                     |
| Signo sinusoidal                                       | En modo M, la línea pulmonar se acerca a la línea pleural en inspiración. Indica derrame libre de viscosidad baja.                                                                                                                                                                                                                                                  | [CONSENSO] [@lichtenstein-luci-2014]                                                                 |
| Signo de la columna (extensión de la columna torácica) | La columna torácica se ve por encima del diafragma cuando hay líquido, porque el aire lo impide normalmente. Sensibilidad 73,7 % y especificidad 92,9 % en urgencias. Al excluir derrames «traza»: 92,9 % y 92,9 %.                                                                                                                                                 | [DOCUMENTADO] [@dickman-columna-2015] (R; n = 75 hemitórax, urgencias, referencia TC)                |
| Ecogenicidad                                           | Ecos internos sugieren exudado o hemorragia. La mayoría de los trasudados son anecoicos, pero algunos exudados también. En 320 casos, los patrones complejo septado, complejo no septado u homogéneamente ecogénico fueron **siempre** exudados. El ecogénico homogéneo correspondió a hemorragia o empiema, y el nódulo pleural fue específico de derrame maligno. | [CONSENSO] [@volpicelli-consenso-2012] (RL-D4-S5, fuerte, A); [DOCUMENTADO] [@yang-derrame-1992] (R) |
| Sitio óptimo                                           | Línea axilar posterior por encima del diafragma, para derrame no loculado.                                                                                                                                                                                                                                                                                          | [CONSENSO] [@volpicelli-consenso-2012] (RL-D4-S2, fuerte, B)                                         |
| Umbral de seguridad para punción                       | Distancia interpleural inspiratoria ≥15 mm.                                                                                                                                                                                                                                                                                                                         | [CONSENSO] [@lichtenstein-luci-2014]                                                                 |

### 1.5 Neumotórax

| Signo                                        | Definición operativa                                                                                                                                                                                                                                                              | Etiqueta y fuente                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Signos de neumotórax                         | Punto pulmonar, ausencia de deslizamiento, ausencia de líneas B y ausencia de pulso pulmonar.                                                                                                                                                                                     | [CONSENSO] [@volpicelli-consenso-2012] (B-D1-S1, fuerte, A)                                                |
| Técnica                                      | En supino, explorar primero las zonas menos declives (anteriores) y avanzar lateralmente. Para neumotórax se prefiere la sonda microconvexa.                                                                                                                                      | [CONSENSO] [@volpicelli-consenso-2012] (B-D1-S2, fuerte B; P-D1-S2, fuerte B)                              |
| Signo de la estratosfera o código de barras  | En modo M, patrón estratificado por encima y por debajo de la línea pleural, que reemplaza al signo de la orilla del mar. Indica ausencia total de movimiento.                                                                                                                    | [CONSENSO] [@lichtenstein-luci-2014]                                                                       |
| Punto pulmonar (_lung point_)                | En un lugar concreto de la pared, el patrón de neumotórax (sin deslizamiento ni líneas B móviles) alterna con la respiración con un patrón pulmonar (deslizamiento o líneas B transitorias). Marca el límite físico del neumotórax en la pared.                                   | [CONSENSO] [@volpicelli-consenso-2012] (comentarios); [DOCUMENTADO] [@lichtenstein-puntopulmonar-2000] (R) |
| Una línea B descarta neumotórax en ese punto | Las líneas B solo se generan con la pleura visceral en contacto con la parietal.                                                                                                                                                                                                  | [CONSENSO] [@lichtenstein-luci-2014]; [DOCUMENTADO] [@lichtenstein-cometaneumotorax-1999] (R)              |
| Localización del punto pulmonar y tamaño     | Un punto pulmonar anterior indica neumotórax moderado; uno lateral, mayor; uno posterior o ausente, masivo. Con punto lateral se requirió drenaje en el 90 %, frente al 8 % con punto anterior. Un pulmón completamente colapsado no alcanza la pared y no genera punto pulmonar. | [CONSENSO/DOCUMENTADO] [@lichtenstein-luci-2014] (cita el estudio de neumotórax oculto de 2005)            |

### 1.6 Perfiles del protocolo BLUE (Lichtenstein y Mezière 2008; Lichtenstein 2014)

Población: 260 pacientes de UCI con insuficiencia respiratoria aguda y diagnóstico definido. Se excluyeron diagnósticos inciertos, múltiples o con frecuencia <2 % [DOCUMENTADO] [@lichtenstein-blue-2008].

| Perfil                          | Definición                                                                                                           | Diagnóstico sugerido                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **A**                           | Deslizamiento anterior con predominio de líneas A.                                                                   | Si hay TVP: TEP. Sin TVP, buscar PLAPS. |
| **A'**                          | Perfil A con deslizamiento abolido.                                                                                  | Buscar punto pulmonar: neumotórax.      |
| **B**                           | Deslizamiento anterior con cohetes pulmonares (≥3 líneas B entre dos costillas) bilaterales y simétricos.            | Edema pulmonar hemodinámico.            |
| **B'**                          | Perfil B con deslizamiento abolido.                                                                                  | Neumonía.                               |
| **A/B**                         | Medio perfil A en un pulmón y medio perfil B en el otro.                                                             | Neumonía.                               |
| **C**                           | Consolidación anterior de cualquier tamaño y número. Una línea pleural engrosada e irregular equivale a este perfil. | Neumonía.                               |
| **PLAPS**                       | Síndrome alveolar y/o pleural posterolateral: consolidación y/o derrame.                                             | Se busca tras un perfil A sin TVP.      |
| **A-V-PLAPS**                   | Perfil A, venas libres y PLAPS.                                                                                      | Neumonía.                               |
| **Desnudo** (_nude_) o «normal» | Perfil A sin TVP ni PLAPS.                                                                                           | EPOC exacerbada o asma grave.           |

Fuentes: [CONSENSO/DOCUMENTADO] [@lichtenstein-blue-2008] (Métodos y Tabla 4, TC-e); [@lichtenstein-luci-2014] (Tabla 1).

**Algoritmo** [CONSENSO] ([@lichtenstein-blue-2008], TC-e; [@lichtenstein-luci-2014], Fig. 8):

1. Deslizamiento anterior presente: se descarta neumotórax.
2. Líneas B anteriores:
   - Perfil B: edema.
   - Perfiles B', A/B o C: neumonía.
3. Perfil A: buscar trombosis venosa profunda.
   - TVP presente: TEP.
   - TVP ausente: buscar PLAPS. Si hay PLAPS, neumonía; si no, EPOC o asma.
4. Perfil A' (deslizamiento abolido sin líneas B): buscar punto pulmonar; si está presente, neumotórax.

Solo cuentan los cohetes anterolaterales, porque las alteraciones posteriores pueden deberse a la gravedad [CONSENSO] [@lichtenstein-luci-2014]. La exactitud global del protocolo fue del 90,5 % [DOCUMENTADO] [@lichtenstein-blue-2008] (R). La exactitud por perfil está en §2.

### 1.7 Protocolo FALLS (_Fluid Administration Limited by Lung Sonography_)

Siete pasos según Lichtenstein y Bar 2024 [CONSENSO] [@lichtenstein-falls-2024] (TC); [@lichtenstein-luci-2014]; [@lichtenstein-blue-falls-2015] (R):

1. Descartar taponamiento pericárdico (ecocardiografía).
2. Descartar dilatación del VD (sugiere TEP).
3. Comprobar deslizamiento para descartar neumotórax. Con los pasos 1–3 se descarta el shock obstructivo.
4. Buscar el perfil B: sugiere edema pulmonar hemodinámico, es decir, shock cardiogénico izquierdo. El perfil B no es «cualquier línea B»: exige más de dos líneas B entre dos costillas, distribución anterior simétrica y deslizamiento. Su ausencia descarta el shock cardiogénico izquierdo.
5. Con perfil A, el paciente «responde a FALLS» y se administran fluidos.
6. **Round-FALLS**: buscar un foco de hipovolemia (sangrado) o de sepsis (p. ej., perfiles de neumonía).
7. **Perfil FALLS**: la transición de líneas A a líneas B durante la reposición. Sin mejoría clínica indica shock distributivo (habitualmente séptico) y el momento de detener los fluidos.

Umbral hemodinámico:

- Los autores sitúan la aparición de líneas B en unos 18 mmHg de PAOP [CONSENSO] [@lichtenstein-blue-falls-2015] (R); [@lichtenstein-falls-2024].
- Dato primario: el predominio A anterior predice PAOP ≤13 mmHg con especificidad 90 % y sensibilidad 67 %, y PAOP ≤18 mmHg con especificidad 93 %, sensibilidad 50 % y VPN 24 %. El predominio B se observa en un rango amplio de PAOP [DOCUMENTADO] [@lichtenstein-paop-2009] (R; 102 pacientes ventilados con catéter en la arteria pulmonar).
- **[DISCREPANCIA]**: Picano y Pellikka subrayan que «las líneas B son agua extravascular, no presión de enclavamiento». Para una misma PAOP varían según el tiempo de evolución, la membrana alveolocapilar, la presión oncótica y el drenaje linfático [@picano-aguapulmonar-2016].

Exactitud del paso 7: frente a no respuesta a fluidos medida con Doppler esofágico en cirugía abdominal, sensibilidad 80 % y especificidad 57 % [DOCUMENTADO, citado en [@lichtenstein-falls-2024]; estudio primario de Bar 2022 no abierto].

### 1.8 Puntajes de aireación y de congestión

#### 1.8.1 Puntaje LUS «clásico» (coalescencia; Bouhemad, Soummer)

- Cuatro patrones de aireación, a menudo en progresión, con su grado:
  - 0 = normal (N): deslizamiento con líneas A y ≤2 líneas B aisladas.
  - 1 = B1: múltiples líneas B separadas.
  - 2 = B2: líneas B coalescentes.
  - 3 = C: consolidación.

  Fuentes: [CONSENSO] [@volpicelli-consenso-2012] (RL-D2-S1, fuerte, A); [DOCUMENTADO] [@bouhemad-nav-2010] (R), [@bouhemad-peep-2011] (R). El umbral «≤2» para el grado 0 aparece en [@vetrugno-itaco-2021] (TC) y es coherente con [@picano-aguapulmonar-2016].

- Se exploran 12 regiones (6 por hemitórax). Cada región recibe el grado del **peor** patrón observado y el total va de 0 a 36 [DOCUMENTADO/CONSENSO] [@bouhemad-peep-2011] (R); [@soummer-destete-2012] (R); [@demi-guias-2023] (enunciado 10); regla de «peor punto» en [@gargani-eacvi-2023] y [@soldati-covid-2020].
- Destete, en 100 pacientes de UCI [DOCUMENTADO] [@soummer-destete-2012] (R):
  - Al final de una prueba de ventilación espontánea exitosa, el LUS fue 19 [16–21] en quienes tuvieron distrés posextubación y 10 [7–13] en quienes se destetaron, con AUC 0,86.
  - En el grupo con distrés, el LUS subió de 15 [13–17] a 19 [16–21] durante la prueba.
  - Los umbrales habitualmente citados (<13 y >17) están **NO VERIFICADOS** (§8).

#### 1.8.2 Puntaje LUS modificado o cuantitativo (Mongodi 2017; redacción de ITACO)

- **Problema que resuelve**: en el corte longitudinal, la longitud de pleura visible depende del espacio intercostal. Además, la coalescencia focal es frecuente en enfermedad no homogénea. En 38 pacientes de UCI [DOCUMENTADO] [@mongodi-lusmod-2017] (R):
  - El corte transversal (intercostal) mostró más pleura (3,9 frente a 2,0 cm), más líneas B (70 % frente a 59 % de los cortes), más coalescencia (39 % frente a 28 %) y más consolidaciones subpleurales (22 % frente a 14 %).
  - La coalescencia focal fue el 52 % de los casos de coalescencia.
- **Grados**, en paráfrasis de [@vetrugno-itaco-2021] (TC) [CONSENSO]:
  - 0: líneas A con deslizamiento o como máximo 2 líneas B separadas.
  - 1: ≥3 líneas B separadas, o líneas B coalescentes o consolidaciones subpleurales que ocupan **<50 %** de la línea pleural.
  - 2: líneas B coalescentes o consolidaciones subpleurales que ocupan claramente **>50 %** de la línea pleural.
  - 3: consolidación lobar o hemilobar con patrón tisular predominante.
  - Doce regiones delimitadas por esternón, línea axilar anterior y línea axilar posterior.
- **[DISCREPANCIA]** entre el puntaje clásico y el modificado: una consolidación subpleural pequeña (p. ej., un infarto de 10 mm) vale 3 en el clásico y 1 o 2 en el modificado [DERIVADO a partir de ambas definiciones].

#### 1.8.3 Puntaje de reaireación (Bouhemad)

- **Transiciones que suman** entre dos exploraciones por región [DOCUMENTADO] [@bouhemad-peep-2011]; tabla de puntos reproducida en [@lopes-reaireacion-2025] (S):
  - +1: B1→N, B2→B1, C→B2.
  - +3: B2→N, C→B1.
  - +5: C→N.
- **Transiciones que restan**:
  - −1: N→B1, B1→B2, B2→C.
  - −3: N→B2, B1→C.
  - −5: N→C.
  - Nota: la fuente secundaria escribe «B1 → 2», que es una errata de B1→B2.
- **Umbrales de reclutamiento con PEEP** (30 SDRA + 10 LPA, PEEP 0 frente a 15 cmH₂O) [DOCUMENTADO] [@bouhemad-peep-2011] (R):
  - Rho 0,88 con el reclutamiento medido por curva presión-volumen.
  - Reaireación ≥ +8 se asoció a reclutamiento >600 mL.
  - Reaireación ≤ +4 se asoció a reclutamiento de 75 a 450 mL.
- **Limitación**: la ecografía **no evalúa la hiperinsuflación** y no debe ser el único método para titular la PEEP [CONSENSO] [@bouhemad-peep-2011].
- **Neumonía asociada al ventilador con antibióticos** [DOCUMENTADO] [@bouhemad-nav-2010] (R):
  - Puntaje >5: reaireación por TC >400 mL y éxito del tratamiento.
  - Puntaje < −10: pérdida de aireación por TC >400 mL y fracaso.
  - Rho 0,85.

#### 1.8.4 Puntaje COVID-19 de Soldati 2020 (14 áreas, 0–42)

Grados por área [CONSENSO] [@soldati-covid-2020] (TC-e):

- 0: línea pleural continua y regular, con líneas A.
- 1: línea pleural indentada, con áreas verticales blancas bajo la indentación.
- 2: línea pleural rota, con áreas consolidadas pequeñas o grandes (más oscuras) y áreas blancas debajo.
- 3: pulmón blanco denso y extenso, con o sin consolidaciones mayores.

Se anota **el puntaje más alto** de cada área y el total va de 0 a 42 [DERIVADO: 14 × 3]. La adquisición (10 s por área, intercostal) está en §3.5.

#### 1.8.5 Congestión en insuficiencia cardiaca (conteo de líneas B)

- **Categorías con 28 sitios** [CONSENSO] [@picano-aguapulmonar-2016] (Tabla 2):
  - ≤5 líneas B: ausente.
  - 6–15: leve.
  - 16–30: moderada.
  - > 30: grave.
- **Diagnóstico de edema en urgencias**: líneas B «múltiples» (≥3 en una zona), «difusas» (≥2 zonas positivas por hemitórax) y bilaterales [CONSENSO] [@gargani-eacvi-2023]; [@platz-checklist-2019]; [@volpicelli-consenso-2012].
- **Pronóstico al alta** [DOCUMENTADO en los estudios originales; compilado en la Tabla 2 de [@gargani-eacvi-2023]]:
  - 4 zonas, ≥7 líneas B: HR ajustado de reingreso o muerte a 90 días 3,03.
  - 8 zonas, ≥1 zona con ≥3 líneas B en cada hemitórax: HR 3,30 a 90 días.
  - 28 zonas, >15 líneas B: HR 11,74 a 180 días.
- **Enfermedad renal terminal con IC**: >60 líneas B se asociaron a un riesgo de muerte 4,2 veces mayor que <15 [CONSENSO/revisión] [@picano-aguapulmonar-2016].

#### 1.8.6 Modelo LUS-ARDS

Regresión logística sobre un examen de 12 regiones que usa los puntajes de aireación izquierdo y derecho más las alteraciones de la línea pleural anterolateral. AUC 0,90 en la cohorte de derivación («casos seguros») y 0,80 en la validación externa [DOCUMENTADO] [@smit-lusards-2023] (R; pacientes con ventilación invasiva).

### 1.9 Ecografía diafragmática: definiciones y valores

**Excursión** (modo M; sonda de 2–5 MHz subcostal o intercostal baja, perpendicular a la cúpula posterior):

- **Valores normales, bipedestación** (n = 210, 150 hombres y 60 mujeres) [DOCUMENTADO] [@boussuges-excursion-2009] (R); posición y medias citadas en [@boussuges-excursion-2021]:

  | Maniobra              | Límite inferior en mujeres | Límite inferior en hombres | Media ± DE                     |
  | --------------------- | -------------------------- | -------------------------- | ------------------------------ |
  | Respiración tranquila | ~0,9 cm                    | ~1,0 cm                    | H 1,8 ± 0,4 cm; M 1,6 ± 0,4 cm |
  | Olfateo voluntario    | 1,6 cm                     | 1,8 cm                     | —                              |
  | Respiración profunda  | 3,7 cm                     | 4,7 cm                     | —                              |

- **Valores normales, sedestación** (n = 410; media ± DE, entre paréntesis límites inferior y superior de la normalidad). Hay dependencia del sexo y del IMC, no de la edad [DOCUMENTADO] [@boussuges-excursion-2021] (TC, Tablas 1–3):

  | Maniobra  | Mujeres, derecha    | Hombres, derecha    | Mujeres, izquierda  | Hombres, izquierda  |
  | --------- | ------------------- | ------------------- | ------------------- | ------------------- |
  | Tranquila | 1,7 ± 0,4 (0,9–2,5) | 1,9 ± 0,5 (0,9–2,8) | 1,7 ± 0,4 (0,9–2,5) | 2,0 ± 0,6 (0,9–3,0) |
  | Olfateo   | 2,6 ± 0,6 (1,3–3,9) | 2,9 ± 0,7 (1,5–4,3) | 2,6 ± 0,6 (1,5–3,8) | 3,0 ± 0,8 (1,6–4,5) |
  | Profunda  | 5,4 ± 1,1 (3,3–7,5) | 6,6 ± 1,3 (4,1–9,0) | 5,4 ± 1,2 (3,2–7,7) | 6,7 ± 1,3 (4,2–9,2) |

  Valores en cm. En supino la excursión es mayor que de pie o sentado para un mismo volumen, así que los valores dependen de la posición [CONSENSO] [@boussuges-excursion-2021].

- **Disfunción**:
  - Excursión vertical <10 mm o movimiento paradójico, con prevalencia del 29 % en UCI médica y más fracaso del destete [DOCUMENTADO] [@kim-disfuncion-2011] (R).
  - **[DISCREPANCIA]**: EXODUS considera que una excursión <2 cm en respiración tranquila indica disfunción [CONSENSO] [@haaksma-exodus-2022], mientras que los límites inferiores normales rondan 0,9–1,0 cm (Boussuges).

**Grosor (Tdi) y fracción de engrosamiento (TFdi)** (sonda lineal de 7–12 MHz en la zona de aposición, línea axilar media o algo anterior, 8.º–11.º espacio). Se mide entre pleura y peritoneo **sin incluir** esas líneas [CONSENSO] [@haaksma-exodus-2022]; [@demi-guias-2023] (enunciado 16).

- **Fórmula**: TFdi = (Tdi fin de inspiración − Tdi fin de espiración) / Tdi fin de espiración × 100 [CONSENSO] [@ferrari-destete-2014] (TC).
- **Valores normales, sedestación** (n = 200). Mujeres más delgadas; la TF no difiere por sexo [DOCUMENTADO] [@boussuges-grosor-2021] (TC):

  | Medida                                 | Hombres, derecha                  | Mujeres, derecha       | Hombres, izquierda     | Mujeres, izquierda     |
  | -------------------------------------- | --------------------------------- | ---------------------- | ---------------------- | ---------------------- |
  | Tdi a fin de espiración                | 2,1 ± 0,4 mm [1,3–3,0]            | 1,9 ± 0,4 mm [1,1–2,7] | 2,0 ± 0,4 mm [1,3–2,7] | 1,7 ± 0,3 mm [1,1–2,4] |
  | Engrosamiento en respiración tranquila | 32 ± 15 %                         | 35 ± 16 %              | 30 ± 14 %              | 33 ± 15 %              |
  | TF máxima (capacidad pulmonar total)   | 106 ± 34 % (límite inferior 40 %) | 116 ± 40 % (39 %)      | 112 ± 37 % (39 %)      | 121 ± 37 % (48 %)      |

- **Otros valores** [DOCUMENTADO] [@boon-grosor-2013] (R; n = 150, pacientes no críticos):
  - Límite inferior normal del grosor a capacidad residual funcional: 0,15 cm.
  - Engrosamiento ≥20 % entre capacidad residual funcional y capacidad pulmonar total: normal.
  - Diferencia entre lados >0,33 cm: anormal.
- **Ventilación mecánica** [DOCUMENTADO] [@goligher-reproducibilidad-2015] (R):
  - Tdi derecho 2,4 ± 0,8 mm, con coeficiente de repetibilidad de 0,2 mm; el izquierdo no se obtuvo de forma consistente.
  - TFdi mediana 11 % en ventilados frente a 35 % en sanos.
  - Por debajo del 50 % de la capacidad inspiratoria, la insuflación pasiva no engruesa el diafragma.
- **Atrofia**:
  - Una caída ≥10 % del grosor basal es el punto de corte de atrofia clínicamente relevante [CONSENSO] [@haaksma-exodus-2022].
  - En la primera semana de ventilación, el grosor cayó >10 % en el 44 %, no cambió en el 44 % y aumentó >10 % en el 12 % [DOCUMENTADO] [@goligher-atrofia-2015] (R; n = 107).
- **Disfunción por engrosamiento**: TFdi <29 % identifica disfunción (Ptr,stim <11 cmH₂O) bajo presión de soporte, con sensibilidad 85 % y especificidad 88%. En asistida-controlada no hubo correlación [DOCUMENTADO] [@dube-disfuncion-2017] (R). EXODUS no alcanzó consenso sobre un corte de TF para disfunción [CONSENSO] [@haaksma-exodus-2022].
- **Destete** [DISCREPANCIA de umbrales y de maniobra]:

  | Predictor  | Condiciones del estudio                                                             | Sensibilidad | Especificidad | VPP  | VPN  | AUC  | Fuente                                     |
  | ---------- | ----------------------------------------------------------------------------------- | ------------ | ------------- | ---- | ---- | ---- | ------------------------------------------ |
  | Δtdi ≥30 % | Respiración espontánea o presión de soporte (n = 63)                                | 88 %         | 71 %          | 91 % | 63 % | 0,79 | [DOCUMENTADO] [@dinino-destete-2014] (R)   |
  | TF >36 %   | Maniobra de capacidad pulmonar total a volumen residual, traqueostomizados (n = 46) | 82 %         | 88 %          | 92 % | 75 % | —    | [DOCUMENTADO] [@ferrari-destete-2014] (TC) |

  El metaanálisis de 19 estudios (1071 pacientes) da [DOCUMENTADO] [@llamas-destete-2017] (R):
  - TF: AUC 0,87 y DOR 21.
  - Excursión: sensibilidad 75 % y especificidad 75 %.
  - LUS: AUC 0,77.

- **Efecto del ventilador**: la PEEP baja la posición de reposo del diafragma, reduce la excursión y aumenta el grosor de fin de espiración [CONSENSO] [@haaksma-exodus-2022].
- **Entrenamiento**: ≥40 exámenes, la mitad supervisados. El lado derecho es un sustituto aceptable salvo sospecha de patología unilateral [CONSENSO] [@haaksma-exodus-2022].

### 1.10 Volumen de derrame: fórmulas y sus condiciones

Todas son **[DOCUMENTADO]** en su población. Sus resultados no son intercambiables entre sí: **[DISCREPANCIA]**.

| Método                                                                      | Condiciones de medida                                                                                                                                                                                                                                                                                                 | Resultado                                                                                                                                                                      | Fuente                                                                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Balik**: V (mL) = 20 × Sep (mm)                                           | UCI con ventilación mecánica, supino con tronco a 15°. Sonda en línea axilar posterior, corte transversal perpendicular al eje corporal. Sep = distancia máxima entre pleuras en la base, a **fin de espiración**. Se excluyeron deformidad torácica, cirugía pulmonar, patología diafragmática, hemotórax y empiema. | Sep 35 ± 13 mm; V 658 ± 320 mL; r = 0,72; error medio 158 ± 161 mL                                                                                                             | [@balik-derrame-2006] (R). [DERIVADO] 20 × 35 = 700 mL, coherente con la media drenada                                                                               |
| **Vignon**: umbral de distancia interpleural espiratoria en la base         | UCI médico-quirúrgica                                                                                                                                                                                                                                                                                                 | >45 mm (derecha) o >50 mm (izquierda) predice ≥800 mL: sensibilidad 94 % y 100 %, especificidad 76 % y 67 %. R² derecho 0,78 e izquierdo 0,51. Sesgo en validación 24 ± 355 mL | [@vignon-derrame-2005] (R)                                                                                                                                           |
| **Roch**: distancia pulmón–pared posterior en la base (PLDbase)             | UCI con ventilación, supino, fin de espiración                                                                                                                                                                                                                                                                        | PLDbase >5 cm predice >500 mL: sensibilidad 83 %, especificidad 90 %, VPP 91 %, VPN 82 %                                                                                       | [@roch-derrame-2005] (R)                                                                                                                                             |
| **Eibenberger**: espesor máximo de líquido                                  | Supino, 51 pacientes                                                                                                                                                                                                                                                                                                  | 20 mm ≈ 380 ± 130 mL; 40 mm ≈ 1000 ± 330 mL; r = 0,80; error medio 224 mL                                                                                                      | [@eibenberger-derrame-1994] (R). [DERIVADO] pendiente de unos 31 mL/mm entre ambos puntos. La ecuación «47,6·d − 837», citada con frecuencia, está **NO VERIFICADA** |
| **Remérand** (multiplano): V = longitud paravertebral × área a media altura | UCI, 58 pacientes y 102 derrames                                                                                                                                                                                                                                                                                      | r = 0,84 frente a drenaje y r = 0,90 frente a TC; sesgo −33 mL (límites de acuerdo −292 a +227)                                                                                | [@remerand-derrame-2010] (R)                                                                                                                                         |
| **Hassan** (validación): (H + D) × 70 y H × 100                             | Línea axilar posterior. H = altura lateral, D = distancia pulmón–diafragma. Drenaje a sequedad (n = 46)                                                                                                                                                                                                               | CCI 0,83 y 0,79                                                                                                                                                                | [@hassan-ecuaciones-2017] (R). Unidades no indicadas en el resumen: **NO VERIFICADO**                                                                                |

---

## 2. Tabla de exactitud diagnóstica

VPP y VPN dependen de la prevalencia de cada serie.

| Signo o perfil                                                       | Patología                                                     | Sensibilidad                                                      | Especificidad                                   | Población y referencia                                                                                                                | Fuente                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Perfil B (BLUE)                                                      | Edema pulmonar hemodinámico                                   | 97 % (62/64)                                                      | 95 % (187/196)                                  | UCI, insuficiencia respiratoria aguda (n = 260); diagnóstico final                                                                    | [DOCUMENTADO] [@lichtenstein-blue-2008] (Tabla 4)                                                                                   |
| Perfil desnudo (A sin PLAPS ni TVP)                                  | EPOC o asma                                                   | 89 % (74/83)                                                      | 97 % (172/177)                                  | Ídem                                                                                                                                  | Ídem                                                                                                                                |
| Perfil A + TVP                                                       | TEP                                                           | 81 % (17/21)                                                      | 99 % (238/239)                                  | Ídem                                                                                                                                  | Ídem                                                                                                                                |
| Perfil A' + punto pulmonar                                           | Neumotórax                                                    | **88 % (8/9)** en la Tabla 4; **81 %** en el resumen              | 100 % (251/251)                                 | Ídem                                                                                                                                  | [DISCREPANCIA interna] [@lichtenstein-blue-2008]. [DERIVADO] 8/9 = 88,9 %. El artículo tiene una fe de erratas (Chest 2013;144:721) |
| Perfiles B', A/B, C y A-V-PLAPS (conjunto)                           | Neumonía                                                      | 89 % (74/83)                                                      | 94 % (167/177)                                  | Ídem                                                                                                                                  | Ídem. Por separado: B' 11 %/100 %; A/B 14,5 %/100 %; C 21,5 %/99 %; A-V-PLAPS 42 %/96 %                                             |
| Protocolo BLUE completo                                              | Seis causas principales                                       | Exactitud 90,5 %                                                  | —                                               | Ídem                                                                                                                                  | [DOCUMENTADO] [@lichtenstein-blue-2008] (R)                                                                                         |
| Deslizamiento abolido                                                | Neumotórax                                                    | 95,3 %                                                            | 91,1 % (VPN 100 %)                              | UCI médica; 43 neumotórax frente a 68 hemitórax con TC negativa                                                                       | [DOCUMENTADO] [@lichtenstein-deslizamiento-1995] (R)                                                                                |
| Solo artefactos horizontales (sin líneas B)                          | Neumotórax completo                                           | 100 % (VPN 100 %)                                                 | 60 %                                            | UCI; 41 neumotórax frente a 146 hemitórax (TC)                                                                                        | [DOCUMENTADO] [@lichtenstein-cometaneumotorax-1999] (R). [DERIVADO] 87/143 = 60,8 %                                                 |
| Artefactos horizontales + deslizamiento abolido                      | Neumotórax completo                                           | 100 %                                                             | 96,5 %                                          | Ídem                                                                                                                                  | Ídem                                                                                                                                |
| Punto pulmonar                                                       | Neumotórax                                                    | 66 % global (75 % en los ocultos a la radiografía)                | 100 %                                           | UCI; 66 neumotórax frente a 233 hemitórax con TC                                                                                      | [DOCUMENTADO] [@lichtenstein-puntopulmonar-2000] (R)                                                                                |
| Deslizamiento abolido                                                | Neumotórax oculto                                             | 100 %                                                             | 78 %                                            | UCI; 43 neumotórax frente a 302 controles (TC)                                                                                        | [DOCUMENTADO] [@lichtenstein-ocultoneumotorax-2005] (R). [DERIVADO] 237/302 = 78,5 %                                                |
| Deslizamiento abolido + signo de línea A                             | Neumotórax oculto                                             | 95 %                                                              | 94 %                                            | Ídem                                                                                                                                  | Ídem. [DERIVADO] 41/43 y 286/302                                                                                                    |
| Punto pulmonar                                                       | Neumotórax oculto                                             | 79 %                                                              | 100 %                                           | Ídem                                                                                                                                  | Ídem. [DERIVADO] 34/43                                                                                                              |
| Ecografía (deslizamiento y cometa), metaanálisis                     | Neumotórax                                                    | 90,9 % (IC 86,5–93,9)                                             | 98,2 % (97,0–99,0)                              | 8 estudios, 1048 adultos; referencia TC o salida de aire al drenar. Radiografía en supino: 50,2 % y 99,4 %                            | [DOCUMENTADO] [@alrajhi-neumotorax-2012] (R)                                                                                        |
| Ecografía por médicos no radiólogos, Cochrane                        | Neumotórax traumático en urgencias                            | 0,91 (0,85–0,94)                                                  | 0,99 (0,97–1,00)                                | 9 estudios, 1271 pacientes; radiografía en supino: 0,47 y 1,00                                                                        | [DOCUMENTADO] [@chan-cochrane-2020] (R)                                                                                             |
| Deslizamiento abolido en EPOC                                        | Neumotórax                                                    | 100 % y 78 % (según observador)                                   | 71 % y 65 % solo en EPOC (84 % y 81 % en total) | Estudio ciego con 41 pacientes                                                                                                        | [DOCUMENTADO] [@slater-epoc-2006] (R)                                                                                               |
| Consolidación                                                        | Neumonía                                                      | 93,4 % (89,2–96,3)                                                | 97,7 % (93,4–99,6)                              | 362 pacientes con sospecha de neumonía comunitaria, 14 centros europeos; referencia radiografía en 2 planos o TC. CP+ 40,5 y CP− 0,07 | [DOCUMENTADO] [@reissig-nac-2012] (R)                                                                                               |
| Ecografía, metaanálisis                                              | Neumonía del adulto                                           | 94 % (92–96)                                                      | 96 % (94–97)                                    | 10 estudios, 1172 pacientes. En UCI: 93 % y 97 %                                                                                      | [DOCUMENTADO] [@chavez-neumonia-2014] (TC)                                                                                          |
| Ecografía, metaanálisis                                              | Neumonía del adulto                                           | AUC 0,93; DOR 50 (21–120)                                         | —                                               | 16 estudios, 2359 pacientes; heterogeneidad significativa                                                                             | [DOCUMENTADO] [@llamas-neumonia-2017] (R)                                                                                           |
| Signo tisular o fractal                                              | Consolidación alveolar                                        | 90 %                                                              | 98 %                                            | UCI; 65 consolidaciones frente a 53 controles por TC                                                                                  | [DOCUMENTADO] [@lichtenstein-consolidacion-2004] (R)                                                                                |
| Broncograma dinámico                                                 | Neumonía frente a atelectasia de reabsorción                  | 61 %                                                              | 94 % (VPP 97 %)                                 | UCI con ventilación; 52 neumonías frente a 16 atelectasias                                                                            | [DOCUMENTADO] [@lichtenstein-broncograma-2009] (R)                                                                                  |
| Pulso pulmonar                                                       | Atelectasia completa por intubación selectiva                 | 93 %                                                              | 100 %                                           | 15 intubaciones selectivas, 30 correctas y 15 sanos                                                                                   | [DOCUMENTADO] [@lichtenstein-pulso-2003] (R)                                                                                        |
| Ecografía de tráquea con deslizamiento                               | Intubación bronquial frente a traqueal                        | 93 %                                                              | 96 %                                            | 42 adultos en anestesia; auscultación 66 % y 59 %                                                                                     | [DOCUMENTADO] [@ramsingh-intubacion-2016] (R)                                                                                       |
| Líneas B difusas anterolaterales (8 zonas)                           | Síndrome alveolointersticial radiológico                      | 85,7 %                                                            | 97,7 %                                          | 300 pacientes de urgencias o medicina de urgencias                                                                                    | [DOCUMENTADO] [@volpicelli-8zonas-2006] (R)                                                                                         |
| Cometas difusos                                                      | Síndrome alveolointersticial difuso                           | 93,4 %                                                            | 93,0 %                                          | UCI médica, 250 pacientes                                                                                                             | [DOCUMENTADO] [@lichtenstein-cometas-1997] (R)                                                                                      |
| Diagnóstico implementado con ecografía                               | IC aguda descompensada en urgencias                           | 97 % (95–98,3)                                                    | 97,4 % (95,7–98,6)                              | 1005 pacientes en 7 servicios de urgencias. Radiografía 69,5 %/82,1 %; péptidos natriuréticos 85 %/61,7 %                             | [DOCUMENTADO] [@pivetta-simeu-2015] (R)                                                                                             |
| Ecografía, metaanálisis                                              | Edema pulmonar cardiogénico                                   | 0,88 (0,75–0,95)                                                  | 0,90 (0,88–0,92)                                | 6 estudios, 1827 pacientes con disnea. Radiografía 0,73 y 0,90                                                                        | [DOCUMENTADO] [@maw-ica-2019] (TC)                                                                                                  |
| Ecografía                                                            | Derrame, consolidación y síndrome alveolointersticial en SDRA | Exactitud 93 %, 97 % y 95 %                                       | —                                               | 32 SDRA y 10 sanos; 384 regiones; referencia TC. Kappa 0,73 a 0,77                                                                    | [DOCUMENTADO] [@lichtenstein-sdra-2004] (R)                                                                                         |
| Deslizamiento reducido o abolido, áreas respetadas y consolidaciones | SDRA frente a EAP cardiogénico                                | Prevalencia en SDRA 100 %, 100 % y 83,3 %                         | Prevalencia en EAP 0 %, 0 % y 0 %               | 18 SDRA y 40 EAP                                                                                                                      | [DOCUMENTADO] [@copetti-sdra-2008] (TC). Detalle en §5.3                                                                            |
| Síndrome alveolointersticial                                         | Contusión pulmonar                                            | 94,6 %                                                            | 96,1 %                                          | 121 traumatismos torácicos cerrados en urgencias; referencia TC; se excluyeron neumotórax                                             | [DOCUMENTADO] [@soldati-contusion-2006] (R)                                                                                         |
| Lesión parenquimatosa periférica (líneas C)                          | Contusión pulmonar                                            | 18,9 %                                                            | 100 %                                           | Ídem. Radiografía 27 % y 100 %                                                                                                        | Ídem                                                                                                                                |
| ≥2 lesiones subpleurales típicas, o 1 con derrame                    | TEP                                                           | 74 %                                                              | 95 %                                            | 352 pacientes con sospecha; referencia angio-TC; prevalencia 55 %                                                                     | [DOCUMENTADO] [@mathis-tep-2005] (R). [DERIVADO] 144/194 y 150/158                                                                  |
| Ecografía pulmonar sola; multiórgano (pulmón, corazón y venas)       | TEP                                                           | 60,9 % y 95,9 %; 90 % y 86,2 %                                    | —                                               | 357 pacientes en urgencias; prevalencia 30,8 %                                                                                        | [DOCUMENTADO] [@nazerian-tep-2014] (R)                                                                                              |
| Signo de la columna                                                  | Derrame pleural                                               | 73,7 %; 92,9 % sin derrames traza                                 | 92,9 %                                          | 75 hemitórax en urgencias; referencia TC                                                                                              | [DOCUMENTADO] [@dickman-columna-2015] (R)                                                                                           |
| Signos de cuadrilátero y sinusoidal                                  | Derrame pleural                                               | 93 %                                                              | 97 %                                            | UCI                                                                                                                                   | [DOCUMENTADO, citado en] [@lichtenstein-luci-2014]                                                                                  |
| Patrón de alta probabilidad, o alta más intermedia                   | Neumonía COVID-19 (RT-PCR)                                    | Alta + intermedia: 90,2 % (99,3 % con insuficiencia respiratoria) | Alta: 88,8 % (94,4 % en fenotipo leve)          | 1462 pacientes en 20 hospitales                                                                                                       | [DOCUMENTADO] [@volpicelli-covid-2021] (TC, Tabla 2)                                                                                |
| Predominio A anterior                                                | PAOP ≤18 mmHg                                                 | 50 %                                                              | 93 % (VPP 97 %)                                 | 102 pacientes de UCI con ventilación y catéter en la arteria pulmonar                                                                 | [DOCUMENTADO] [@lichtenstein-paop-2009] (R)                                                                                         |
| TFdi <29 %                                                           | Disfunción diafragmática (Ptr,stim <11 cmH₂O)                 | 85 %                                                              | 88 %                                            | 112 pacientes con ventilación en presión de soporte                                                                                   | [DOCUMENTADO] [@dube-disfuncion-2017] (R)                                                                                           |

Valores predictivos del deslizamiento abolido para neumotórax según la población: 87 % en población general, 56 % en críticos y 27 % en insuficiencia respiratoria [DOCUMENTADO, citados en [@lichtenstein-luci-2014]].

---

## 3. Esquemas de exploración y sus límites

Líneas de referencia utilizadas: paraesternal (PE), medioclavicular (MC), axilar anterior (AA), axilar media (AM), axilar posterior (AP), paravertebral (PV).

### 3.1 Puntos BLUE (3 por hemitórax, BLUE y FALLS)

Colocación con las manos [CONSENSO] [@lichtenstein-bluepoints-2011] (TC-e); [@lichtenstein-luci-2014]:

- **Manos**: dos manos del tamaño de las del paciente, sin pulgares. La superior con el meñique en el borde inferior de la clavícula y la punta de los dedos en la línea media; la inferior justo debajo.
- **Punto BLUE superior**: centro de la mano superior (raíz de los dedos medio y anular).
- **Punto BLUE inferior**: centro de la palma de la mano inferior.
- **Línea frénica**: borde inferior de la mano inferior, que marca el final del pulmón.
- **Punto frénico**: intersección de la línea frénica con la línea axilar media.
- **Punto PLAPS**: continuación horizontal del punto BLUE inferior, tan posterior como se pueda por detrás de la línea axilar posterior con el paciente en supino. Allí se localizan el 90 % de las consolidaciones y todos los derrames libres.

### 3.2 Esquema de 6 zonas (3 por hemitórax)

- El documento de expertos de insuficiencia cardiaca sugiere examinar **al menos 3 zonas por hemitórax (6 en total)** y comunicar el número de líneas B, porque en urgencias se usó sin pérdida aparente de exactitud [CONSENSO] [@platz-checklist-2019].
- Los reparos exactos de esas 6 zonas solo aparecen en la figura 3B y están **NO VERIFICADOS en texto** (§8).
- **Alternativa verificable**: los 6 puntos BLUE (superior, inferior y PLAPS de cada lado) [CONSENSO] [@lichtenstein-bluepoints-2011].

### 3.3 Esquema de 8 zonas (Volpicelli; 4 por hemitórax)

| Área | Localización      | Límites                                                                                                    |
| ---- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 1    | Anterior superior | Entre la línea paraesternal y la axilar anterior; desde la clavícula hasta el 2.º–3.er espacio intercostal |
| 2    | Anterior inferior | Misma franja; desde el 3.er espacio hasta el diafragma                                                     |
| 3    | Lateral superior  | Entre la línea axilar anterior y la posterior; mitad superior                                              |
| 4    | Lateral basal     | Misma franja; mitad basal                                                                                  |

Fuentes: [CONSENSO] [@volpicelli-consenso-2012] (B-D2-S2 y leyenda de figura), [@gargani-howido-2014]. Límites descritos en los Métodos de [@copetti-sdra-2008] (TC), que añade un área posterior por detrás de la línea axilar posterior (5 por lado).

- **Positividad**: zona positiva con ≥3 líneas B; examen positivo con ≥2 zonas positivas en cada hemitórax [CONSENSO] (§1.2).
- En el paciente crítico, un barrido anterior rápido de 2 regiones puede bastar para descartar edema cardiogénico, pero no en disnea leve [CONSENSO] [@volpicelli-consenso-2012] (B-D2-S2); [@gargani-howido-2014].

### 3.4 Esquema de 12 regiones (puntaje LUS; Bouhemad, Soummer)

- En cada hemitórax, el esternón, la línea axilar anterior y la línea axilar posterior delimitan tres campos: anterior, lateral y posterior. Cada campo se divide en superior e inferior [CONSENSO] [@demi-guias-2023] (enunciado 10); [@vetrugno-itaco-2021].
- El límite medial del campo posterior es la línea paravertebral [DERIVADO del esquema de 14 áreas de Soldati, §3.5].
- Se exploran todos los espacios intercostales de cada región y se asigna el peor patrón [CONSENSO] (§1.8.1).
- Equivalencias aproximadas [DERIVADO]:
  - Punto BLUE superior ≈ As.
  - Punto BLUE inferior ≈ Ai.
  - Punto PLAPS ≈ transición Li/Pi.
- Un estudio multicéntrico en COVID-19 (4, 8, 12 y 14 adquisiciones en 88 pacientes) concluyó que 12 áreas son un buen equilibrio entre tiempo y exactitud [DOCUMENTADO] [@mento-protocolos-2021] (R); también citado en [@demi-guias-2023].

### 3.5 Esquema de 14 áreas (Soldati, COVID-19)

Posición sentada si es posible. Si el paciente no puede sentarse, empezar por el área 7. Barrido **intercostal**, 10 s por área [CONSENSO] [@soldati-covid-2020] (TC-e):

| Áreas                            | Línea           | Niveles                                                                                                               |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1–3 (derecha) y 4–6 (izquierda)  | Paravertebral   | Basal (por encima del signo de la cortina), media (ángulo inferior de la escápula) y superior (espina de la escápula) |
| 7–8 (derecha) y 9–10 (izquierda) | Axilar media    | Basal (bajo la línea intermamilar) y superior (sobre ella)                                                            |
| 11–14                            | Medioclavicular | Basal y superior de cada lado, con el mismo patrón                                                                    |

### 3.6 Esquema de 28 sitios (Jambrik y Picano; cardiología y nefrología)

- Cara anterolateral: del 2.º al 4.º espacio intercostal a la izquierda y del 2.º al 5.º a la derecha, desde la línea paraesternal hasta la axilar [CONSENSO] [@gargani-howido-2014].
- En total, 16 barridos a la derecha y 12 a la izquierda [CONSENSO] [@demi-guias-2023].
- Las cuatro líneas más probables son paraesternal, medioclavicular, axilar anterior y axilar media, porque 16 = 4 × 4 y 12 = 4 × 3 [DERIVADO]. La figura original no está verificada.
- Se suman las líneas B de todos los sitios; las categorías están en §1.8.5.
- Es la técnica preferida para cuantificar en insuficiencia cardiaca crónica y en diálisis, y como alternativa en el consenso 2012 [CONSENSO] [@picano-aguapulmonar-2016]; [@volpicelli-consenso-2012].
- Para ecografía de estrés, en [@gargani-eacvi-2023]:
  - Se usa un esquema simplificado de 4 zonas, con la sonda en el 3.er espacio intercostal en las líneas axilar anterior y axilar media.
  - En insuficiencia cardiaca se han descrito esquemas de 4 a 28 zonas. El de 8 zonas es el más usado.

### 3.7 Reglas comunes de técnica relevantes para zonificar

- **Sondas**: se prefieren convexas de 3–7 MHz; las lineales de 7–13 MHz sirven para detallar la pleura. **No se recomiendan** las de matriz de fase por su resolución y ancho de banda limitados [CONSENSO] [@demi-guias-2023] (enunciado 15).
- **[DISCREPANCIA] sobre las sondas de matriz de fase**:
  - La matriz de fase es suficiente para líneas B en adultos y muestra más líneas B que la curvilínea [CONSENSO/DOCUMENTADO] [@gargani-eacvi-2023]; [@platz-checklist-2019].
  - En la práctica de Lichtenstein basta una microconvexa para todo el cuerpo [CONSENSO] [@lichtenstein-luci-2014].
- **Profundidad y foco**:
  - Ajustar al hábito corporal y reducir la profundidad para neumotórax.
  - Foco en la línea pleural [CONSENSO] [@gargani-howido-2014]; [@soldati-covid-2020].
  - **[DISCREPANCIA]** sobre la profundidad habitual: unos 15–18 cm para líneas B en insuficiencia cardiaca ([@gargani-eacvi-2023]) frente a 8–10 cm en el estudio de COVID ([@volpicelli-covid-2021]).
- **Clip**: unos 6 s ([@gargani-eacvi-2023]), 6–7 s ([@platz-checklist-2019]) o 10 s por área ([@soldati-covid-2020]).
- **Posición**: en exámenes seriados, siempre la misma. En insuficiencia cardiaca aguda hay un 25 % más de líneas B en supino que sentado [CONSENSO/DOCUMENTADO] [@gargani-eacvi-2023]; [@picano-aguapulmonar-2016].

---

## 4. Casos docentes con hallazgos esperados por zona

**Construcción**: todos los casos son **[DERIVADO]**. Combinan patrones documentados; los signos concretos llevan su fuente. Los vectores de grados usan el puntaje LUS **clásico** (0–3 por región, §1.8.1) sobre las 12 regiones, en el orden D[As, Ai, Ls, Li, Ps, Pi] | I[As, Ai, Ls, Li, Ps, Pi]. «NT» significa zona no puntuable por neumotórax. «Der» significa derrame, que se informa aparte.

### Caso 1 — Pulmón normal (control)

- **Todas las zonas**:
  - Deslizamiento presente, con signo de la orilla del mar.
  - Líneas A y ≤2 líneas B por espacio intercostal.
  - Pueden verse líneas B aisladas en el último espacio lateral o en las bases [DOCUMENTADO/CONSENSO] [@lichtenstein-cometas-1997]; [@picano-aguapulmonar-2016].
  - Pueden verse líneas Z [CONSENSO] [@francisco-lineas-2016].
- **Recesos**: signo de la cortina presente y sin columna supradiafragmática [CONSENSO] [@gargani-howido-2014]; [@dickman-columna-2015].
- **Pulso pulmonar**: aparece en apnea en el 100 % de los sanos [DOCUMENTADO] [@lichtenstein-pulso-2003].
- **Grados**: D[0,0,0,0,0,0] | I[0,0,0,0,0,0], LUS = 0. Con 28 sitios, ≤5 líneas B. Perfil A sin PLAPS.
- **Diafragma**: excursión tranquila sentado de 1,7–2,0 cm y engrosamiento tidal del 30–35 % [DOCUMENTADO] [@boussuges-excursion-2021]; [@boussuges-grosor-2021].

### Caso 2 — Edema pulmonar cardiogénico agudo

| Zonas               | Hallazgos esperados                                                                                                                           | Fuente                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| As y Ai bilaterales | ≥3 líneas B por espacio intercostal con deslizamiento conservado (perfil B). Línea pleural fina y regular.                                    | [@lichtenstein-blue-2008]; [@gargani-eacvi-2023] (Tabla 1); en [@copetti-sdra-2008] solo el 25 % tuvo alteraciones pleurales |
| Ls y Li             | Líneas B abundantes que coalescen hacia las bases, con gradiente gravitacional y **sin áreas respetadas**                                     | [@gargani-eacvi-2023]; [@copetti-sdra-2008] (áreas respetadas en el 0 %)                                                     |
| Ps y Pi             | B2 o pulmón blanco. Derrame bilateral frecuente (95 %), con posible atelectasia compresiva basal. Fuera de ella no suele haber consolidación. | [@copetti-sdra-2008]; [@gargani-eacvi-2023]                                                                                  |

- **Grados**: D[1,2,2,2,2,3] | I[1,2,2,2,2,3], LUS = 24 [DERIVADO: 12 + 12]. El rango plausible va de 18 a 30 según la gravedad.
- **Congestión**: con 28 sitios, >30 líneas B (grave). Con 8 zonas, ≥2 zonas positivas por hemitórax.
- **Fisiología**:
  - Las líneas B reflejan el agua extravascular: normal <500 mL, edema franco >2000 mL [CONSENSO] [@picano-aguapulmonar-2016].
  - Disminuyen en minutos u horas con diuréticos o diálisis [CONSENSO] [@picano-aguapulmonar-2016]; [@volpicelli-consenso-2012] (B-D4-S1, B-D4-S2).
- **FALLS**: el perfil B en el paso 4 orienta a shock cardiogénico [CONSENSO] [@lichtenstein-falls-2024].

### Caso 3 — SDRA (neumonía grave o sepsis extrapulmonar) con ventilación mecánica

| Zonas                  | Hallazgos esperados                                                                                                                                                                    | Fuente                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Anteriores             | Síndrome intersticial **no homogéneo** con áreas respetadas (100 %). Consolidaciones subpleurales anteriores. Deslizamiento reducido o abolido (100 %), con pulso pulmonar en el 50 %. | [@copetti-sdra-2008]; [@volpicelli-consenso-2012] (RL-D3-S4) |
| Línea pleural          | Irregular, engrosada (>2 mm) y fragmentada (100 %)                                                                                                                                     | [@copetti-sdra-2008]                                         |
| Posteriores (declives) | Pulmón blanco compacto y consolidaciones basales (83,3 %) con broncograma estático o dinámico. Derrame pequeño (66,6 %; habitualmente trivial o leve).                                 | [@copetti-sdra-2008]; [@gargani-eacvi-2023]                  |

- **Grados**: D[1,0,2,2,3,3] | I[2,1,2,3,3,3], LUS = 25.
  - La región D-Ai vale 0 porque es **completamente** respetada.
  - Un área respetada no reduce el grado de su región si otro espacio intercostal de esa región está afectado, por la regla del «peor punto» [DERIVADO].
- **Criterio de la definición global de SDRA 2024**: líneas B y/o consolidaciones bilaterales no explicadas por derrames, atelectasias o nódulos, vistas por un operador entrenado. Se recomienda valorar también las alteraciones pleurales [CONSENSO] [@matthay-sdra-2024].
- **BLUE**: el SDRA produce un perfil de neumonía (B', A/B o C) en el 86 % [DOCUMENTADO, citado en] [@lichtenstein-luci-2014].
- **PEEP**: la reaireación se calcula por región y la ecografía no detecta hiperinsuflación [DOCUMENTADO] [@bouhemad-peep-2011].

### Caso 4 — Neumonía lobar comunitaria del lóbulo inferior derecho

| Zonas                            | Hallazgos esperados                                                                                                                                                                      | Fuente                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| D-Li y D-Pi                      | Consolidación tisular. Signo fractal si no es translobar. Broncograma aéreo (86,7 %) dinámico (específico). Movimiento respiratorio del infiltrado (97,6 %). Márgenes borrosos (76,5 %). | [@reissig-nac-2012]; [@lichtenstein-luci-2014]; [@lichtenstein-broncograma-2009] |
| D-Ls y D-Ps                      | Líneas B focales perilesionales (patrón intersticial focal)                                                                                                                              | [@volpicelli-consenso-2012] (P-D2-S2); [@demi-guias-2023] (enunciado 17)         |
| Base derecha                     | Derrame paraneumónico pequeño: basal en el 54,4 %, mediana 50 mL                                                                                                                         | [@reissig-nac-2012]                                                              |
| Anteriores e hemitórax izquierdo | Perfil A con deslizamiento. Con PLAPS corresponde al perfil A-V-PLAPS (42 % de sensibilidad y 96 % de especificidad para neumonía).                                                      | [@lichtenstein-blue-2008]                                                        |

- **Grados**: D[0,0,1,3,1,3] | I[0,0,0,0,0,0], LUS = 8.
- **Evolución** [DOCUMENTADO] [@reissig-nac-2012]:
  - El área de las lesiones bajó de 15,3 a 0,2 cm² entre los días 13 y 16.
  - El derrame bajó de 50 a 0 mL.
  - Alrededor del 8 % de las lesiones no son visibles, así que una ecografía anodina no excluye neumonía.

### Caso 5 — Neumotórax derecho: (a) parcial con punto pulmonar; (b) completo o a tensión

**(a) Parcial con punto pulmonar**

- **D-As y D-Ai**:
  - Deslizamiento abolido, con signo de la estratosfera en modo M.
  - Líneas A, **ninguna línea B** y sin pulso pulmonar (perfil A').
  - Fuentes: [@volpicelli-consenso-2012] (B-D1-S1); [@lichtenstein-luci-2014].
- **Punto pulmonar**: en el límite anterolateral (línea axilar anterior o media). Un punto lateral se asocia a drenaje en el 90 % [DOCUMENTADO] [@lichtenstein-luci-2014].
- **Zonas posteriores y hemitórax izquierdo**: deslizamiento presente.
- **Grados**: D[NT,NT,NT/0,0,0,0] | I[0,…], LUS no aplicable en las zonas NT [DERIVADO]. **Un grado 0 con líneas A en una zona con neumotórax es un error de puntuación.**

**(b) Completo o a tensión**

- Todo el hemitórax derecho en perfil A' **sin punto pulmonar**: el pulmón colapsado no alcanza la pared, de ahí la sensibilidad del 66 % del punto pulmonar [DOCUMENTADO] [@lichtenstein-puntopulmonar-2000]; [@lichtenstein-luci-2014].
- FALLS paso 3, shock obstructivo.
- Posibles líneas E por enfisema subcutáneo, que impiden ver la pleura [CONSENSO] [@francisco-lineas-2016]; [@demi-guias-2023]. En el estudio de neumotórax oculto se excluyeron 4 de 47 casos por enfisema parietal [DOCUMENTADO] [@lichtenstein-ocultoneumotorax-2005].

### Caso 6 — Derrame pleural izquierdo moderado a grande con atelectasia compresiva

| Zonas                     | Hallazgos esperados                                                                                                                                                                                                                                    | Fuente                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| I-Li, I-Pi y PLAPS        | Espacio anecoico entre las pleuras con signos de cuadrilátero y sinusoidal. Columna torácica visible por encima del diafragma. Pérdida del signo de la cortina [DERIVADO de su definición].                                                            | [@volpicelli-consenso-2012] (RL-D4-S3); [@lichtenstein-luci-2014]; [@dickman-columna-2015]; [@gargani-howido-2014] |
| Pulmón dentro del derrame | Lóbulo inferior con patrón tisular (atelectasia). Si hay broncograma, predomina el estático; el comportamiento específico de la atelectasia compresiva está **NO VERIFICADO**, porque los datos del estudio de 2009 son de atelectasia de reabsorción. | [@lichtenstein-broncograma-2009]                                                                                   |
| I-Ls y I-Ps               | Líneas B por encima del derrame (congestión o pulmón comprimido) [DERIVADO]                                                                                                                                                                            | —                                                                                                                  |

- **Volumen**:
  - Con Balik, Sep = 40 mm da V ≈ 800 mL [DERIVADO: 20 × 40].
  - Con Vignon, >50 mm a la izquierda predice ≥800 mL (sensibilidad 100 %, especificidad 67 %).
- **Naturaleza**:
  - Anecoico: trasudado o exudado.
  - Septado, complejo o ecogénico: exudado [DOCUMENTADO] [@yang-derrame-1992].
- **Grados**: I[0,0,0,2,1,3] + Der | D[0,…], LUS = 6. **[DISCREPANCIA o sin consenso]**: no hay regla consensuada para puntuar una región ocupada por derrame; aquí se puntúa el pulmón visible.

### Caso 7 — Atelectasia obstructiva (de reabsorción) del lóbulo inferior izquierdo por tapón mucoso, con ventilación mecánica

- **I-Pi e I-Li**:
  - Consolidación con broncograma **estático o sin broncograma**, patrón que sugiere atelectasia obstructiva [CONSENSO] [@volpicelli-covid-2021] (patrón «alternativo»).
  - El broncograma dinámico apareció solo en 1/16 atelectasias [DOCUMENTADO] [@lichtenstein-broncograma-2009].
  - Si la atelectasia es completa: deslizamiento abolido con pulso pulmonar [DOCUMENTADO] [@lichtenstein-pulso-2003].
- **Resto de las zonas**: normales.
- **Grados**: I[0,0,0,1,1,3] | D[0,…], LUS = 5.
- **Tras broncoscopia o fisioterapia**: C→N suma +5 y C→B1 suma +3 en el puntaje de reaireación [DOCUMENTADO/S] [@lopes-reaireacion-2025].

### Caso 8 — Intubación selectiva en el bronquio principal derecho

- **Hemitórax izquierdo**:
  - Deslizamiento abolido **con pulso pulmonar** inmediato (14/15) y líneas A.
  - **Sin punto pulmonar**, lo que lo distingue del neumotórax.
  - Fuente: [DOCUMENTADO] [@lichtenstein-pulso-2003].
- **Hemitórax derecho**: deslizamiento presente.
- **Diagnóstico**: la ecografía de tráquea con deslizamiento tuvo sensibilidad 93 % y especificidad 96 % [DOCUMENTADO] [@ramsingh-intubacion-2016].
- **Grados**: todo 0 al inicio [DERIVADO]. **El puntaje LUS no detecta el problema; hay que evaluar deslizamiento y pulso pulmonar.** La evolución temporal hacia consolidación está **NO VERIFICADA**.

### Caso 9 — EPOC exacerbada o asma grave (perfil desnudo)

- **Anteriores bilaterales**: líneas A con deslizamiento.
- **PLAPS y TVP**: ausentes. El perfil desnudo tiene sensibilidad 89 % y especificidad 97 % [DOCUMENTADO] [@lichtenstein-blue-2008].
- **Grados**: todo 0 (≤2 líneas B), LUS de 0 a 2.
- **Trampas**:
  - Las bullas pueden simular neumotórax (especificidad del 65–71 % en EPOC) [DOCUMENTADO] [@slater-epoc-2006].
  - Pueden generar un «punto bulla» [CONSENSO] [@skulec-puntopulmonar-2021].

### Caso 10 — TEP agudo

- **Anteriores**: perfil A con deslizamiento. Con TVP, sensibilidad 81 % y especificidad 99 % [DOCUMENTADO] [@lichtenstein-blue-2008].
- **Bases posterolaterales**: lesiones subpleurales triangulares o redondeadas de base pleural [DOCUMENTADO] [@mathis-tep-2005]:
  - Tamaño medio 15,5 × 12,4 mm y 2,3 lesiones por paciente.
  - Derrame fino en el 49 %.
  - Criterios: ≥2 lesiones = TEP confirmado; 1 lesión con derrame = probable; lesiones <5 mm o derrame aislado = posible.
- **FALLS paso 2**: VD dilatado.
- **Exactitud**: la ecografía pulmonar sola tiene sensibilidad 60,9 % y el enfoque multiórgano 90 % [DOCUMENTADO] [@nazerian-tep-2014].
- **Grados**:
  - Puntaje clásico: D[0,0,0,3,0,3] | I[0,0,0,0,0,3], LUS = 9.
  - Puntaje modificado: D[0,0,0,1,0,1] | I[0,0,0,0,0,1], LUS = 3.
  - **Caso ideal para enseñar la discrepancia entre los dos puntajes (§1.8.2).**

### Caso 11 — Fibrosis pulmonar (enfermedad intersticial fibrosante)

- **Todas las zonas, con predominio posterobasal**:
  - Líneas B múltiples, difusas y **no homogéneas**, más en las bases, sin áreas respetadas [CONSENSO] [@gargani-eacvi-2023] (Tabla 1); [@volpicelli-consenso-2012] (RL-D3-S1 a S3).
  - Más de 6 cometas por corte en el 98,1 % [DOCUMENTADO] [@reissig-fibrosis-2003].
  - Línea pleural irregular o fragmentada (98,1 %) y engrosada (84,9 %) [DOCUMENTADO] [@reissig-fibrosis-2003].
  - Alteraciones subpleurales (37,7 %) [DOCUMENTADO] [@reissig-fibrosis-2003].
- **Derrame basal**: **[DISCREPANCIA]**. Presente en el 37,7 % según [@reissig-fibrosis-2003] y descrito como «raro salvo enfermedad avanzada» en [@gargani-eacvi-2023].
- **Conducta de las líneas B**: son líneas B «secas», que no cambian con diuréticos [CONSENSO] [@picano-aguapulmonar-2016].
- **Grados**: D[0,1,1,2,2,2] | I[0,1,1,2,2,2], LUS = 16.

### Caso 12 — Contusión pulmonar (traumatismo cerrado)

- **Zona del impacto**:
  - Síndrome alveolointersticial focal (sensibilidad 94,6 %, especificidad 96,1 %).
  - Líneas C subpleurales (sensibilidad 18,9 %, especificidad 100 %) [DOCUMENTADO] [@soldati-contusion-2006].
- **Borde de la contusión**: «seudopunto pulmonar», con estas diferencias respecto al verdadero [CONSENSO] [@skulec-puntopulmonar-2021]:
  - Falta un código de barras completo.
  - Puede haber pulso pulmonar y líneas B.
  - Hay discontinuidad pleural.
- **Descartes**: neumotórax y hemotórax. En el estudio de referencia se excluyeron los neumotórax.
- **Grados**: D[1,2,2,3,1,1] | I[0,…], LUS = 10.

### Caso 13 — Neumonía COVID-19 (viral)

- **Patrón de alta probabilidad** [DOCUMENTADO] [@volpicelli-covid-2021]:
  - Grupos bilaterales y multifocales de líneas B separadas o coalescentes.
  - «Haces de luz».
  - Consolidaciones periféricas multifocales.
  - Línea pleural regular e irregular.
  - Distribución parcheada que alterna bruscamente con áreas A (respetadas).
- **Distribución**: predominio posterior [CONSENSO] [@demi-guias-2023].
- **Puntaje de Soldati** (14 áreas): posteriores 2–3, laterales 1–2 y anteriores 0–1, con total ≈ 20/42 [DERIVADO].

### Caso 14 — Shock séptico con protocolo FALLS

- **Ingreso** [CONSENSO] [@lichtenstein-falls-2024]:
  - Sin taponamiento, VD normal y deslizamiento presente.
  - **Perfil A**, es decir, «responde a FALLS»; se inician fluidos.
- **Durante la reposición**: aparecen líneas B anteriores, la transición A→B que define el perfil FALLS. Hay que detener los fluidos [CONSENSO] [@lichtenstein-falls-2024].
- **Umbral atribuido**: unos 18 mmHg de PAOP [CONSENSO; ver la discrepancia en §1.7].
- **Round-FALLS**: buscar el foco (p. ej., perfiles de neumonía).
- **Grados**: al ingreso 0. Tras los fluidos, las 4 zonas anteriores pasan a B1, con LUS de 4 a 8 [DERIVADO].

### Caso 15 — Disfunción diafragmática (parálisis frénica derecha posoperatoria, destete difícil)

- **Excursión derecha**: <10 mm o paradójica [DOCUMENTADO] [@kim-disfuncion-2011], frente a 1,9 ± 0,5 cm en hombres sentados (límite inferior 0,9) [DOCUMENTADO] [@boussuges-excursion-2021].
- **Engrosamiento**:
  - TFdi <29 %, compatible con disfunción [DOCUMENTADO] [@dube-disfuncion-2017].
  - El diafragma paralizado no engrosa. Se acepta un umbral del 20 % para parálisis [CONSENSO, citado en] [@boussuges-grosor-2021]; [@boon-grosor-2013].
- **Pulmón**:
  - Posible atelectasia basal derecha o derrame.
  - La parálisis frénica figura entre las causas de deslizamiento abolido [CONSENSO] [@lichtenstein-luci-2014].
- **Destete**: la ecografía pulmonar al final de la prueba de ventilación espontánea predice distrés posextubación [DOCUMENTADO] [@soummer-destete-2012].
- **Grados**: D[0,0,0,1,1,3] | I[0,…], LUS = 5.

---

## 5. Trampas diagnósticas

### 5.1 Deslizamiento abolido sin neumotórax

**Causas** [CONSENSO] [@lichtenstein-luci-2014]:

- Adherencias inflamatorias (SDRA).
- Atelectasia, incluida la intubación selectiva.
- Adherencias crónicas y fibrosis.
- Parálisis frénica.
- Ventilación en _jet_.
- Paro cardiorrespiratorio y apnea.
- Intubación esofágica.
- Ajustes o sondas inadecuados.

**Datos por causa**:

| Causa                     | Dato                                                                                                                                                                                                                              | Fuente                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| SDRA                      | Deslizamiento reducido o abolido en el 100 %                                                                                                                                                                                      | [DOCUMENTADO] [@copetti-sdra-2008]                  |
| Apnea                     | Todos los sanos presentan pulso pulmonar en apnea                                                                                                                                                                                 | [DOCUMENTADO] [@lichtenstein-pulso-2003]            |
| Intubación selectiva      | Pulso pulmonar izquierdo en 14 de 15                                                                                                                                                                                              | [DOCUMENTADO] [@lichtenstein-pulso-2003]            |
| EPOC con bullas           | Especificidad del 65–71 %                                                                                                                                                                                                         | [DOCUMENTADO] [@slater-epoc-2006]                   |
| Pleurodesis y adherencias | Se incluyen de forma genérica como «adherencias». No se encontró un estudio primario sobre el deslizamiento tras pleurodesis, que suele ser criterio de exclusión (p. ej., pleurodesis o fibrotórax en [@volpicelli-covid-2021]). | [CONSENSO]; NO ENCONTRADO (§8)                      |
| Críticos en general       | Especificidad del deslizamiento abolido del 78 % en neumotórax oculto                                                                                                                                                             | [DOCUMENTADO] [@lichtenstein-ocultoneumotorax-2005] |

**Reglas de descarte**: cualquier línea B, el pulso pulmonar o el deslizamiento **en ese punto** excluyen neumotórax en ese punto [CONSENSO] [@volpicelli-consenso-2012] (B-D1-S1); [@lichtenstein-luci-2014].

### 5.2 Punto pulmonar falso

**[DISCREPANCIA]**: 100 % de especificidad en las series originales ([@lichtenstein-puntopulmonar-2000], [@lichtenstein-ocultoneumotorax-2005]) frente a comunicaciones de imitaciones:

- Engrosamiento pleural por asbesto tras cirugía de revascularización: se observó una línea B en la misma vista del punto, lo que descartó el neumotórax [DOCUMENTADO, caso] [@steenvoorden-puntopulmonar-2018].
- Punto «fisiológico» en la interfaz pulmón–mediastino o pericardio [CONSENSO/revisión] [@skulec-puntopulmonar-2021].
- Seudopunto en una contusión [CONSENSO/revisión] [@skulec-puntopulmonar-2021].
- Punto bulla, **indistinguible** del verdadero [CONSENSO/revisión] [@skulec-puntopulmonar-2021].
- Punto pleurofascial en el receso costofrénico durante el signo de la cortina [CONSENSO/revisión] [@skulec-puntopulmonar-2021].

La réplica de 2019 (Santos-Silva, Lichtenstein y cols.) mantiene que el punto pulmonar sigue siendo específico. Solo se verificó el título, porque la réplica no tiene resumen; véase [@steenvoorden-puntopulmonar-2018] en §7.

### 5.3 Líneas B que no significan edema cardiogénico

- **Inespecíficas**: aparecen en SDRA, fibrosis, neumonía intersticial, contusión, infarto y neoplasia [CONSENSO] [@volpicelli-consenso-2012] (P-D2-S2); [@gargani-eacvi-2023].
- **Diferencias clave**, en prevalencias de [@copetti-sdra-2008] (TC; SDRA n = 18, EAP n = 40):

  | Hallazgo                         | SDRA   | EAP   |
  | -------------------------------- | ------ | ----- |
  | Síndrome alveolointersticial     | 100 %  | 100 % |
  | Línea pleural anormal            | 100 %  | 25 %  |
  | Deslizamiento reducido o abolido | 100 %  | 0 %   |
  | Áreas respetadas                 | 100 %  | 0 %   |
  | Consolidaciones                  | 83,3 % | 0 %   |
  | Derrame                          | 66,6 % | 95 %  |
  | Pulso pulmonar                   | 50 %   | 0 %   |

  Muestra pequeña.

- **Distinguir líneas B «húmedas» de «secas»**: seguir su variación en minutos con esfuerzo, carga de volumen, diuréticos o diálisis [CONSENSO] [@picano-aguapulmonar-2016].
- **Líneas B en sanos**: ver §1.2.
- **Líneas B posteriores**: pueden deberse solo a la gravedad, por eso BLUE usa solo las anterolaterales [CONSENSO] [@lichtenstein-luci-2014].

### 5.4 Líneas Z y E frente a líneas B

| Artefacto                         | Cómo distinguirlo de una línea B                                                                           | Fuente                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Línea Z                           | Corta, mal definida, **no borra las líneas A** y no es sincrónica                                          | [@lichtenstein-luci-2014]; [@francisco-lineas-2016] |
| Línea E                           | Nace **por encima** de la línea pleural, en el tejido subcutáneo con gas, y no se mueve con la respiración | [@francisco-lineas-2016]                            |
| Sondas lineales muy superficiales | Dificultan distinguir las líneas B de otros cometas                                                        | [CONSENSO] [@lichtenstein-luci-2014]                |

### 5.5 Enfisema subcutáneo

El enfisema subcutáneo masivo es hoy la principal limitación de la ecografía pulmonar [CONSENSO] [@demi-guias-2023] (enunciado 15). En la serie de neumotórax oculto se excluyó por esta causa el 8,5 % de los neumotórax (4/47) [DOCUMENTADO/DERIVADO] [@lichtenstein-ocultoneumotorax-2005].

### 5.6 Imagen en espejo, cortina y columna

- La imagen en espejo del hígado o del bazo sobre el diafragma puede simular una consolidación tisular [CONSENSO/revisión] [@diserafino-artefactos-2020] (Fig. 13). La fuente primaria **NO se encontró** (§8).
- Con derrame desaparecen la cortina y el espejo y aparece la columna [DOCUMENTADO/DERIVADO] [@dickman-columna-2015]; [@gargani-howido-2014].

### 5.7 Tabiques y ecogenicidad del derrame

- Un derrame anecoico **no garantiza** un trasudado [DOCUMENTADO] [@yang-derrame-1992]; [CONSENSO] [@volpicelli-consenso-2012] (RL-D4-S5).
- Los tabiques y el patrón complejo indican exudado.
- La ecografía muestra mejor que la TC los tabiques y la fibrina [CONSENSO] [@gargani-howido-2014].

### 5.8 Pacientes obesos

**[DISCREPANCIA]**:

- La ecografía pulmonar es factible en casi el 100 % de los casos, también en bariátricos por vía anterior [CONSENSO] [@lichtenstein-luci-2014].
- La obesidad es una limitación parcial [CONSENSO] [@demi-guias-2023] (enunciado 15).
- En obesidad grave, la ausencia de congestión no excluye insuficiencia cardiaca [CONSENSO] [@gargani-eacvi-2023].
- La obesidad complica la medición del diafragma [CONSENSO] [@haaksma-exodus-2022].
- En obesos hay que aumentar la profundidad [CONSENSO] [@gargani-howido-2014].
- No se encontró un estudio que cuantifique la factibilidad según el IMC (§8).

### 5.9 Error por ángulo u orientación

| Situación                               | Efecto                                                                                                      | Fuente                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Corte transversal frente a longitudinal | Cambia la longitud de pleura visible y el número de líneas B y consolidaciones detectadas                   | [DOCUMENTADO] [@mongodi-lusmod-2017]      |
| Orientación de la sonda                 | Altera el conteo                                                                                            | [CONSENSO] [@platz-checklist-2019]        |
| Ángulo de incidencia (in vitro)         | Afecta significativamente a los artefactos verticales, igual que la frecuencia, el foco y el ancho de banda | [DOCUMENTADO] [@mento-angulo-2021] (R)    |
| Diafragma fuera de eje                  | Usar modo M anatómico si el haz no es perpendicular                                                         | [DOCUMENTADO] [@boussuges-excursion-2021] |
| Sonda no perpendicular a la pared       | Las tres capas del diafragma deben verse                                                                    | [CONSENSO] [@haaksma-exodus-2022]         |

### 5.10 Parámetros del equipo

**[DISCREPANCIA]** sobre armónicos y frecuencia:

- Los armónicos pueden alterar las líneas B [CONSENSO] [@lichtenstein-luci-2014].
- Evitar armónicos, filtros cosméticos y _compounding_; índice mecánico bajo; foco en la pleura; máxima frecuencia de cuadros [CONSENSO] [@soldati-covid-2020]; [@demi-guias-2023].
- En sentido opuesto: ni el ancho del sector ni los armónicos tienen un impacto conocido en el conteo y el número apenas cambia con el transductor, aunque sin datos sistemáticos [CONSENSO] [@picano-aguapulmonar-2016].
- La frecuencia central es el parámetro más influyente [DOCUMENTADO] [@mento-angulo-2021]; [@demi-guias-2023].
- Duración del clip y tipo de sonda: ver §3.7.

### 5.11 Otras trampas

- **Consolidaciones profundas**: las que no alcanzan la pleura no se ven (≈8 %) [DOCUMENTADO] [@reissig-nac-2012]; [CONSENSO] [@volpicelli-consenso-2012] (P-D3-S3).
- **Puntaje LUS**:
  - En zonas con neumotórax, las líneas A darían un falso 0 [DERIVADO].
  - La ecografía no detecta hiperinsuflación [DOCUMENTADO] [@bouhemad-peep-2011].
  - En intubación selectiva, el puntaje inicial es 0 [DERIVADO].
- **Insuficiencia cardiaca derecha aislada**: sin líneas B; hay que evaluar la congestión venosa sistémica [CONSENSO] [@gargani-eacvi-2023].
- **Posición del paciente**: un 25 % más de líneas B en supino [CONSENSO] [@picano-aguapulmonar-2016].

### 5.12 Tabla consolidada de discrepancias

| Tema                                          | Fuente A                                                                                                                | Fuente B                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensibilidad BLUE para neumotórax             | 81 % (resumen)                                                                                                          | 88 % = 8/9 (Tabla 4; [@lichtenstein-luci-2014])                                                                                              |
| Signo de línea A en neumotórax                | 1999: artefactos horizontales con sensibilidad 100 % y especificidad 60 %; 2005: con deslizamiento abolido, 95 % y 94 % | [@lichtenstein-luci-2014] dice «60 % de sensibilidad, 100 % de especificidad», probablemente invertido                                       |
| Especificidad del punto pulmonar              | 100 % (2000 y 2005)                                                                                                     | Imitaciones ([@steenvoorden-puntopulmonar-2018]; [@skulec-puntopulmonar-2021])                                                               |
| Umbral de PAOP y líneas B                     | «Aparecen a unos 18 mmHg» (Lichtenstein 2015 y 2024)                                                                    | Dato primario 2009: predominio A para ≤18 mmHg con especificidad 93 % y sensibilidad 50 %; «líneas B = agua extravascular, no PAOP» (Picano) |
| Disfunción por excursión                      | <10 mm o paradoja (Kim)                                                                                                 | <2 cm (EXODUS); límite inferior normal 0,9–1,0 cm (Boussuges)                                                                                |
| Umbral de TF                                  | ≥30 % (DiNino, tidal) y >36 % (Ferrari, capacidad pulmonar total a volumen residual)                                    | <29 % = disfunción (Dubé); sin consenso (EXODUS); límite inferior de la TF máxima 39–48 % (Boussuges 2021)                                   |
| Grado de una consolidación subpleural pequeña | 3 en el puntaje clásico                                                                                                 | 1 o 2 en el puntaje modificado (<50 % o >50 % de la pleura)                                                                                  |
| Engrosamiento pleural                         | >2 mm (Copetti)                                                                                                         | Sin consenso objetivo (Demi 2023)                                                                                                            |
| Profundidad y clip                            | 15–18 cm y unos 6 s (EACVI)                                                                                             | 8–10 cm (COVID 2021); 10 s (Soldati)                                                                                                         |
| Armónicos y sonda                             | Alteran las líneas B y deben evitarse (Lichtenstein, Soldati, Demi); más líneas B con matriz de fase (Platz)            | Sin impacto conocido y el número apenas cambia (Picano 2016)                                                                                 |
| Derrame en fibrosis                           | 37,7 % (Reissig)                                                                                                        | «Raro salvo enfermedad avanzada» (EACVI)                                                                                                     |
| Volumen de derrame                            | 20 × Sep, supino a 15° (Balik)                                                                                          | Unos 31 mL/mm [DERIVADO] (Eibenberger); (H + D) × 70 como la mejor ecuación (Hassan)                                                         |
| Reissig: movimiento del infiltrado            | 97,6 % (resumen)                                                                                                        | 205/211 = 97,2 % [DERIVADO]                                                                                                                  |

---

## 6. Implicaciones para el simulador

### 6.1 Principio: el signo emerge del estado

Cada signo de §1 debe **derivarse de variables de estado por región y por espacio intercostal**, no pintarse. Estado mínimo sugerido [DERIVADO de las definiciones citadas]:

| Variable de estado                                                                                          | Signos que debe hacer emerger                                                                                                                                                                 | Base                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fracción de aire subpleural (aireación local) y su heterogeneidad lateral                                   | Líneas A (aireación alta con pleura especular). Líneas B cuando baja la aireación, con mayor número cuanto más baja. Coalescencia y pulmón blanco. Consolidación cuando el aire es casi nulo. | [@volpicelli-consenso-2012] (B-D4-S1; RL-D2-S1); [@picano-aguapulmonar-2016]; [@demi-guias-2023] (enunciado 5: trampas acústicas, dependencia de la frecuencia) |
| Agua extravascular: dinámica intersticial frente a alveolar, con constantes de tiempo                       | Líneas B «húmedas» que cambian en minutos u horas con fluidos o diuréticos, frente a las «secas» (fibrosis)                                                                                   | [@picano-aguapulmonar-2016]; [@lichtenstein-falls-2024] (el edema intersticial precede al alveolar)                                                             |
| PAOP, que modula el agua extravascular pero **no se traduce directamente** en líneas B                      | Predominio A con PAOP baja; transición A→B como perfil FALLS                                                                                                                                  | [@lichtenstein-paop-2009]; [@picano-aguapulmonar-2016]                                                                                                          |
| Acoplamiento pleural: sin, con adherencias o con gas intrapleural (espesor y extensión)                     | Deslizamiento presente, reducido o abolido; pulso pulmonar; punto pulmonar en el borde del gas; ausencia de líneas B sobre el gas                                                             | [@volpicelli-consenso-2012] (B-D1-S1); [@lichtenstein-luci-2014]                                                                                                |
| Ventilación regional: volumen corriente, apnea, intubación selectiva, PEEP                                  | Amplitud del deslizamiento; pulso pulmonar en apnea o atelectasia                                                                                                                             | [@lichtenstein-pulso-2003]                                                                                                                                      |
| Consolidación: extensión, profundidad, tipo de borde (fractal o translobar) y permeabilidad de la vía aérea | Signo fractal frente a tisular; broncograma dinámico con vía aérea permeable y flujo, o estático                                                                                              | [@lichtenstein-luci-2014]; [@lichtenstein-broncograma-2009]                                                                                                     |
| Líquido pleural: volumen, distribución gravitacional, ecogenicidad y tabiques                               | Cuadrilátero, sinusoide, columna, pérdida de la cortina; espesor Sep, H y D para las fórmulas                                                                                                 | §1.4 y §1.10                                                                                                                                                    |
| Geometría de la línea pleural: espesor en mm, continuidad o fragmentación, microconsolidaciones             | Grados de Soldati; puntaje LUS-ARDS; diferencial con el SDRA                                                                                                                                  | [@soldati-covid-2020]; [@copetti-sdra-2008]; [@smit-lusards-2023]                                                                                               |
| Diafragma: posición de reposo, excursión, grosor, fuerza (TF) y atrofia                                     | Excursión en modo M; Tdi y TF; efecto de la PEEP y del soporte                                                                                                                                | §1.9                                                                                                                                                            |
| Pared torácica: espesor (obesidad) y gas subcutáneo                                                         | Necesidad de más profundidad; líneas E; pérdida del signo del murciélago                                                                                                                      | §5.5, §5.8                                                                                                                                                      |

### 6.2 Adquisición que debe modelarse, porque cambia el hallazgo

- **Sonda**: lineal, convexa, microconvexa o matriz de fase. La geometría importa: líneas B paralelas con sonda lineal y convergentes con curvilínea [CONSENSO] [@picano-aguapulmonar-2016].
- **Parámetros**: frecuencia central, foco, profundidad, ganancia, armónicos, índice mecánico y filtros o _compounding_ [CONSENSO/DOCUMENTADO] [@demi-guias-2023]; [@mento-angulo-2021].
- **Orientación y posición**: longitudinal frente a intercostal, y ángulo respecto de la pleura [DOCUMENTADO] [@mongodi-lusmod-2017].
- **Tiempo**: duración del clip de ≥6 s o de 10 s por área [CONSENSO] [@gargani-eacvi-2023]; [@soldati-covid-2020].
- **Paciente**: supino, sentado o en decúbito lateral [CONSENSO] [@gargani-eacvi-2023].
- **Transparencia**: el simulador debe **mostrar al alumno** que el mismo estado da conteos distintos según estos ajustes [DOCUMENTADO/CONSENSO] (§5.9–5.10).

### 6.3 Calcular el puntaje a partir de la señal simulada

**Paso A — extracción de rasgos** por espacio intercostal y clip [DERIVADO de las definiciones]:

1. `pleura`: detectar la línea pleural bajo el signo del murciélago y medir su espesor en mm y su continuidad.
2. `S` (deslizamiento): movimiento lateral relativo del moteado bajo la pleura frente a la pared, con patrón de orilla del mar o estratosfera en modo M. Clasificar como presente, reducido o abolido **respecto de la zona adyacente o contralateral** ([@copetti-sdra-2008]).
3. `L` (pulso pulmonar): componente periódico a la frecuencia cardiaca sin componente respiratorio.
4. `A`: ecos horizontales a múltiplos de la distancia piel–pleura.
5. `B`: cuentan solo los artefactos verticales que nacen en la pleura, llegan al fondo sin atenuarse, se mueven con `S` y borran las líneas A. Así se excluyen las líneas Z y E.
6. `N_B`: conteo en el **cuadro y punto peor**. Si son confluentes, `N_B = round(10 × f_blanco)`, con máximo 10 por zona ([@gargani-eacvi-2023]; [@volpicelli-consenso-2012] B-D2-S4).
7. `f_pl`: fracción de la pleura visible ocupada por líneas B coalescentes o consolidación subpleural, para el umbral del 50 % ([@mongodi-lusmod-2017]; [@vetrugno-itaco-2021]).
8. `C`: región tisular subpleural, con tamaño en mm, borde fractal o regular y broncograma dinámico o estático. Informar en mm, porque no hay umbral consensuado ([@demi-guias-2023], enunciado 4).
9. `E`: espacio anecoico o ecogénico entre las pleuras, con variación inspiratoria de la distancia interpleural (sinusoide). Medir Sep, H y D.
10. `NT`: `S` abolido sin líneas B ni `L` → buscar la transición temporal (punto pulmonar) a lo largo de la pared.

**Paso B — grado por región**: el **máximo** entre los espacios intercostales de la región (peor punto).

- **Puntaje clásico**:
  - 0 si hay deslizamiento y `N_B ≤ 2`.
  - 1 si hay ≥3 líneas B separadas.
  - 2 si hay líneas B coalescentes.
  - 3 si hay consolidación.
- **Puntaje modificado**:
  - 0 si `N_B ≤ 2`.
  - 1 si hay ≥3 líneas B separadas o si `f_pl ≤ 0,5`.
  - 2 si `f_pl > 0,5`.
  - 3 si hay consolidación lobar o hemilobar.
- **Soldati**: 0 a 3 según la continuidad pleural (continua, indentada o rota) y la extensión del blanco o la consolidación.
- **Neumotórax o derrame**: si la región tiene `NT`, marcarla como **no puntuable**, no como 0. Si tiene `E`, puntuar el pulmón visible e informar el derrame aparte. Ambas decisiones son de diseño **[DERIVADO]**, porque no hay consenso verificado.

**Paso C — agregados**:

- Puntaje clásico: suma de 12 regiones (0–36).
- Soldati: suma de 14 áreas (0–42).
- 28 sitios: `Σ N_B`, con las categorías ≤5, 6–15, 16–30 y >30.
- 8 zonas: zona positiva con `N_B ≥ 3`; examen positivo con ≥2 zonas positivas por hemitórax.
- Reaireación: suma de las transiciones por región (§1.8.3).
- Perfil BLUE: según las reglas de §1.6.

### 6.4 Modo examen

**Referencia**: el «examen verdadero» es la salida del paso C aplicada al estado del modelo con adquisición ideal.

**Qué se evalúa**:

- El grado de cada región.
- Los signos clave identificados: deslizamiento, pulso pulmonar, punto pulmonar, tipo de broncograma, signos de cuadrilátero, sinusoidal y columna.
- El perfil BLUE y la hipótesis diagnóstica.
- La calidad de adquisición: pleura en foco, profundidad adecuada, clip ≥6 s, armónicos y filtros desactivados, orientación declarada y misma posición en exámenes seriados.

**Tolerancias sugeridas** [DERIVADO, parámetro de diseño]:

- Conteo de líneas B dentro de ±10 %, coherente con una variabilidad entre observadores <10 % ([@gargani-howido-2014]; [@picano-aguapulmonar-2016]).
- Grado por región exacto o a ±1, con kappa ponderado; como referencia, la concordancia real publicada en SDRA fue de kappa 0,73 a 0,77 ([@lichtenstein-sdra-2004]).

### 6.5 Validación del motor con cohortes virtuales

- Generar pacientes virtuales por caso (§4) con variabilidad fisiológica.
- Comprobar que el «observador algorítmico» reproduce en orden de magnitud las exactitudes de §2 [DERIVADO]:
  - Perfil B para edema: alrededor de 97 % de sensibilidad y 95 % de especificidad.
  - Punto pulmonar: sensibilidad de 66–79 % con especificidad del 100 % en los casos «de libro», y que aparezcan imitaciones al activar las trampas.
- Las exactitudes que no se reproduzcan indican errores del modelo o de la regla de detección.

### 6.6 Módulos específicos

- **Derrame**:
  - Calcular el volumen verdadero con la geometría del modelo.
  - Permitir aplicar Balik, Vignon, Roch, Eibenberger, Remérand y Hassan, **cada una con su postura y su punto de medida**, y mostrar el error.
- **Diafragma**:
  - Normalidad por sexo, lado y postura (§1.9).
  - Módulo de atrofia: caída ≥10 % del grosor.
  - Efecto de la PEEP y del soporte.
  - Umbrales de destete con su contexto de maniobra.
- **Trampas conmutables**:
  - Adherencias o pleurodesis, bulla, contusión, interfaz cardiaca, enfisema subcutáneo e imagen en espejo.
  - Obesidad, ángulo, armónicos, clip corto, posición supina y apnea.

### 6.7 Constantes sugeridas, con fuente

| Constante                                          | Valor                                           | Fuente                                         |
| -------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| Líneas B normales                                  | ≤2 por espacio intercostal; ≤5 en 28 sitios     | [@picano-aguapulmonar-2016]                    |
| Región positiva (8 zonas)                          | ≥3 líneas B entre dos costillas                 | [@volpicelli-consenso-2012]                    |
| Examen positivo (8 zonas)                          | ≥2 regiones positivas por hemitórax             | [@volpicelli-consenso-2012]                    |
| Máximo de líneas B por zona                        | 10; confluentes = % de blanco / 10              | [@gargani-eacvi-2023]                          |
| Categorías de congestión (28 sitios)               | ≤5 / 6–15 / 16–30 / >30                         | [@picano-aguapulmonar-2016]                    |
| Umbral del puntaje modificado                      | 50 % de la línea pleural                        | [@mongodi-lusmod-2017]; [@vetrugno-itaco-2021] |
| Reaireación que predice reclutamiento >600 mL      | ≥ +8                                            | [@bouhemad-peep-2011]                          |
| Engrosamiento pleural anormal                      | >2 mm                                           | [@copetti-sdra-2008]                           |
| Espesor mínimo del derrame para punción            | ≥15 mm en inspiración                           | [@lichtenstein-luci-2014]                      |
| Balik                                              | V = 20 × Sep                                    | [@balik-derrame-2006]                          |
| Límite inferior de la excursión tranquila, sentado | 0,9 cm (ambos sexos, ambos lados)               | [@boussuges-excursion-2021]                    |
| Límite inferior de la excursión profunda, sentado  | 3,3 cm en mujeres y 4,1 cm en hombres (derecha) | [@boussuges-excursion-2021]                    |
| Tdi a fin de espiración, límite inferior           | 1,3 mm en hombres y 1,1 mm en mujeres           | [@boussuges-grosor-2021]                       |
| Atrofia diafragmática                              | Caída ≥10 %                                     | [@haaksma-exodus-2022]                         |

---

## Bibliografía

Las fuentes de este documento están en `docs/REFERENCES.md`; en el texto se citan como `[@clave]`.

## 8. No encontrado o no verificado

| Qué se buscaba                                                                                                                  | Estado                 | Búsqueda realizada                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Enunciados de la actualización 2025 ([@volpicelli-actualizacion-2026])                                                          | Solo resumen           | Springer con muro de pago; springermedicine con acceso por registro                                  |
| Enunciados ESICM–ESPNIC 2025: definiciones del puntaje, zonas y ajustes                                                         | Solo resumen           | Springer con muro de pago; PDF de Amsterdam UMC bloqueado por un desafío anti-bots, que no se sorteó |
| Mención de la ecografía pulmonar en la guía ESC 2016 de insuficiencia cardiaca (Ponikowski)                                     | **NO VERIFICADO**      | Texto de OUP truncado antes de la sección 12 y bloqueado para descarga                               |
| Umbrales de Soummer 2012 (<13 éxito; >17 distrés)                                                                               | **NO VERIFICADO**      | Texto completo de CCM no accesible; el resumen solo da medianas y AUC                                |
| Definiciones textuales de Rouby 2018 (formación en el puntaje)                                                                  | **NO VERIFICADO**      | PMC7205011 bloqueado por reCAPTCHA; en OUP solo es visible el extracto «0–3 por región; 0–36»        |
| Reparos de las 6 zonas de Platz 2019                                                                                            | **NO VERIFICADO**      | Están solo en la figura 3B                                                                           |
| Ecuación de Eibenberger «V = 47,6·d − 837»                                                                                      | **NO VERIFICADO**      | El resumen solo da puntos de 20 y 40 mm                                                              |
| Unidades de las ecuaciones de Hassan                                                                                            | **NO VERIFICADO**      | No aparecen en el resumen                                                                            |
| Fuente primaria de las líneas E (Lichtenstein)                                                                                  | **NO ENCONTRADO**      | Títulos en Europe PMC con «E-lines» y enfisema subcutáneo; se usó una revisión                       |
| Fuente primaria del artefacto en espejo supradiafragmático                                                                      | **NO ENCONTRADO**      | Títulos en Europe PMC con «mirror image» y pleural o diafragma; se usó una revisión                  |
| Estudio sobre el deslizamiento tras pleurodesis                                                                                 | **NO ENCONTRADO**      | Búsqueda no exhaustiva                                                                               |
| Factibilidad de la ecografía pulmonar según el IMC                                                                              | **NO ENCONTRADO**      | Búsqueda no exhaustiva                                                                               |
| Rango de TFdi asociado a grosor estable (Goligher 2015)                                                                         | **NO VERIFICADO**      | Resumen sin el valor                                                                                 |
| Evolución temporal de la atelectasia tras intubación selectiva; comportamiento del broncograma en la atelectasia **compresiva** | **NO VERIFICADO**      | —                                                                                                    |
| Espaciado de 7 mm de B1 y 3 mm de vidrio esmerilado (Lichtenstein 1997 y Bouhemad)                                              | Solo fuente secundaria | Resumen de 1997 sin el dato                                                                          |
