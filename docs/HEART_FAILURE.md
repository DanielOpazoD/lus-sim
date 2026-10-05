# Propuesta: protocolos de insuficiencia cardiaca guiados por la presión de llenado

**Estado:** propuesta (03-10-2026), a pedido de Daniel; **implementada en parte** por las decisiones 51 (la física de las líneas B y el detector) y 51 (capas 0–3, el paso de la capa 4 al paciente, la regla de los protocolos y la interfaz; ver allí lo calibrado y lo pendiente). No es una decisión: cada paso, al implementarse,
abre su entrada en `docs/DECISIONS.md`. **Respaldo:** un estudio bibliográfico del 03-10-2026 que vive fuera del repo; aquí
solo entran sus conclusiones con las claves de `docs/REFERENCES.md`. Lo que la base ya tenía, más lo que esta propuesta
le añade (filas 1.2.16–1.2.17 y 1.11.12, metas P-T30–T31 y C-T32), está en `docs/knowledge/clinical.md` (§1.1, §1.8.5,
§3.3, §3.6, §3.6 bis y §6.8) y en `docs/knowledge/pathophysiology.md` (§1.1, §1.2, §1.11, §1.12, §2 y §3).

## 1. Objetivo

Dos piezas que van juntas:

1. **Protocolos de insuficiencia cardiaca (IC) como esquemas de exploración**: 28 sitios, 8 zonas (puntaje y conteo) y los
   4 sitios de estrés. El alumno recorre los sitios con la sonda y el simulador agrega lo medido sobre la señal con la
   regla de cada protocolo.
2. **Un mando hemodinámico**: el usuario elige una presión auricular izquierda (PAI), una presión diastólica final del VI
   (PD2VI), una presión capilar pulmonar (PCWP) o directamente el agua extravascular pulmonar indexada (EVLWI), y el
   simulador muestra, en el mapa de cada protocolo, cuántas líneas B resultan y dónde.

**Relación con la misión** (`docs/MISSION.md`):

- **O4, fidelidad clínica.** Los casos de IC (casos 21–23 de `docs/knowledge/clinical.md`) dejan de ser estados fijos y
  salen de una presión con su cinética. El puntaje se mide sobre la señal y se contrasta con anclas publicadas (§5).
- **O5, docencia.** Enseña dos lecciones que la literatura respalda y que un atlas no puede mostrar: **la misma presión da
  pulmones distintos** (FE preservada o reducida, subida o bajada, supino o sentado) y **el mismo
  pulmón da números distintos** según el protocolo, la regla de confluencia o el clip.
- **O1, como restricción.** Nada se pinta (`docs/GUIDE.md` §5): el modelo de presión y agua no dibuja líneas B, alimenta la
  física subpleural.

## 2. La regla que manda: el modelo alimenta la física, no la imagen

```text
mando (PAI | PD2VI | PCWP | EVLWI)
  → EVLWI estable (umbral)            capa 1   physiology/
  → EVLWI en el tiempo (cinética)     capa 2   physiology/
  → agua por región (gravedad)        capa 3   physiology/
  → estado subpleural de cada EIC     capa 4   physiology/ → anatomy/ (fracción de gas, población de trampas)
  → imagen                                     ultrasound/ (reirradiación de las trampas: physics.md, Parte 2, §2.4)
  → líneas B medidas en cada EIC               measure/ (clinical.md §6.3)
  → regla del protocolo               capa 5   lus/ (reglas puras sobre observables)
```

El modelo nunca fija «n líneas B en este espacio intercostal» ni elige un puntaje. Calcula el agua intersticial y alveolar
de cada región; de ella sale la microestructura subpleural (fracción de gas, densidad, tamaño, contenido y apertura de las
trampas: `docs/knowledge/physics.md`, Parte 3, §3.1, principio 3); la imagen se forma y la medición cuenta. El número de
líneas B **esperado** para un estado solo existe en las pruebas, como meta de calibración, nunca en el camino de la imagen.
Por eso una mala técnica (otro clip, otra sonda, la sonda fuera del sitio) puede dar un conteo distinto con el mismo
paciente, como en la clínica.

La conexión entre agua y física ya está propuesta en `docs/knowledge/pathophysiology.md` §2.2: el agua regional se suma
al tejido, de ahí sale la fracción de gas, y las anclas de densidad por patrón (A, B separadas, B coalescentes,
consolidación) la ligan con lo que se ve [@mongodi-qlus-2024]. Esta propuesta añade lo que va antes (de la presión al agua
regional) y lo que va después (la regla de cada protocolo).

## 3. Protocolos que se implementan primero

Son los de más evidencia y los que usan las anclas de §5. Cada protocolo es un dato, no código: una lista de sitios (lado,
línea, espacios intercostales), una regla por sitio o zona, una regla de agregación y sus cortes con fuente. Así el mismo
modelo cubre después las variantes de 4 zonas al alta [@platz-alta-2019], 6, 11 y 12 zonas.

| Protocolo              | Sitios                                                                                                       | Valor por sitio o zona                                    | Agregado            | Cortes que se muestran, con su fuente                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **28 sitios**          | Paraesternal, medioclavicular, axilar anterior y media × EIC 2–5 a la derecha (16) y 2–4 a la izquierda (12) | Líneas discretas o %/10 si confluyen; tope 10 (C-T16)     | Suma 0–280          | ≤5 / 6–15 / 16–30 / >30 [@picano-aguapulmonar-2016]; >15 antes del alta [@gargani-pronostico-2015]                                                  |
| **8 zonas, puntaje**   | Anterior superior e inferior, lateral superior y basal, por lado (`docs/knowledge/clinical.md` §3.3)         | Positiva con ≥3 líneas en un cuadro o líneas coalescentes | Zonas positivas 0–8 | Difuso: ≥2 positivas por lado [@volpicelli-actualizacion-2026]; ≥1 por lado, umbral de Buessler 2020 (resumen; `docs/knowledge/clinical.md` §1.8.5) |
| **8 zonas, conteo**    | Las mismas 8 zonas                                                                                           | Peor espacio de la zona, %/10 con tope 10 (C-T17)         | Suma 0–80           | ≥3 en la IC crónica ambulatoria [@platz-ambulatorio-2016]; ≥6 ⇒ PCWP por encima de la bisagra [@imanishi-pcwp-2023]                                 |
| **4 sitios de estrés** | 3.er EIC en las líneas axilares anterior y media, ambos lados                                                | 0–10 por sitio                                            | Suma 0–40           | 0–1 / 2–4 / 5–9 / ≥10 [@scali-se2020-2020]; el EACVI no da umbrales [@gargani-eacvi-2023]                                                           |

**Por qué estos tres.** Los 28 sitios tienen la ecuación frente al agua mejor ajustada y más usada (§4, capa 4; Mayr da otra para 4 sectores, P-T4) y el corte pronóstico más repetido. Las 8 zonas son el esquema de la IC por omisión [@gargani-eacvi-2023], y en ellas se midió la única curva por intervalos de PCWP invasiva [@imanishi-pcwp-2023]; las demás relaciones con la presión son correlaciones o cortes sueltos (`docs/knowledge/pathophysiology.md` 1.2). Los 4 sitios son el protocolo del ecocardiograma de esfuerzo [@scali-se2020-2020], el escenario dinámico donde la presión sube en minutos. Los cortes hemodinámicos del ejercicio [@reddy-hfpef-2019] se midieron en otros 2 puntos y se prueban allí (P-T10, C-T29).

**Reglas comunes.** Una zona con derrame es «no evaluable» (C-T18). La conversión entre protocolos no está publicada: el
simulador la obtiene por construcción, al aplicar dos reglas al mismo estado por espacio intercostal, y debe rotularla en
pantalla como **predicción del modelo**, no como dato. Los «4 sitios de estrés» no son las 4 zonas al alta de Platz 2019,
con otros sitios y otros cortes (`docs/knowledge/clinical.md` §3.6 bis).

## 4. Modelo por capas

Cada parámetro lleva su origen: **[PUBLICADO]**, cifra o ecuación impresa en la fuente; **[FIGURA]**, leído de una figura
publicada; **[DERIVADO]**, calculado por nosotros a partir de datos publicados; **[SUPUESTO]**, decisión de diseño sin
respaldo cuantitativo. Al pasar a `defineParameters` (`src/core/evidence.ts`): publicado → `documentado` o `consenso`;
figura y derivado → `derivado`; supuesto → `estimado`, con rango obligatorio; un dato animal llevado al humano →
`extrapolacion`.

### Capa 0: entradas

- **Mando**: PAI, PD2VI, PCWP o EVLWI. Las tres presiones se tratan como **una sola presión de llenado izquierda, Pfill**
  **[SUPUESTO]**. La curva por intervalos usa la PCWP [@imanishi-pcwp-2023], otras cohortes pequeñas usan la PD2VI o la
  presión pre-A, y la relación cuantitativa entre PCWP, PAI media y PD2VI no se investigó. La interfaz lo dice junto al
  selector.
- **Fenotipo**: **FE preservada** o **FE reducida**, que es lo que se midió; las dos ramas de la fuente eran IC aguda. Un
  tercer fenotipo, **sano**, con su P\* como **[SUPUESTO]** (sin dato humano), sostiene las metas del pulmón sano. La
  **cronicidad** como modificador de P\* es **[SUPUESTO]** con una **[DISCREPANCIA]**: Picano la cita entre los factores
  que separan presión y líneas B [@picano-aguapulmonar-2016], pero en Imanishi la bisagra no cambia con un ingreso previo
  por IC (`docs/knowledge/pathophysiology.md` 1.2.16).
- **Escenario**: presión auricular derecha (PAD), postura y tiempo desde el último cambio del mando. Más adelante: PEEP
  (P-T7), índice de masa corporal y albúmina.

### Capa 1: de la presión al agua en estado estable

`EVLWI_ss = EVLWI_0 + k · max(0, Pfill − P*)`

| Parámetro                           | Valor                                      | Origen                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EVLWI_0, agua normal                | 7,4 mL/kg (DE 3,3)                         | [PUBLICADO] [@tagami-evlwnormal-2010]                                                                                                                             |
| P\*, FE preservada                  | ≈19 mmHg                                   | [PUBLICADO] en el texto de [@imanishi-pcwp-2023]; la forma alrededor, [FIGURA]                                                                                    |
| P\*, FE reducida                    | ≈25 mmHg                                   | [PUBLICADO] en el texto de [@imanishi-pcwp-2023]; la forma alrededor, [FIGURA]                                                                                    |
| P\*, sano                           | sin valor                                  | [SUPUESTO]                                                                                                                                                        |
| k, mL/kg por mmHg, uno por fenotipo | sin valor publicado                        | [SUPUESTO] calibrable contra P-T30                                                                                                                                |
| Efecto de la PAD                    | baja P\* o sube k (menos salida linfática) | asociación [PUBLICADO] [@reddy-hfpef-2019]; el mecanismo (presión venosa como poscarga linfática) es de estudios en ovejas → `extrapolacion`; magnitud [SUPUESTO] |
| Forma de la bisagra                 | recta con codo, o suavizada con un ancho   | [SUPUESTO]: no hay ningún ajuste publicado (bisagra, sigmoide ni logarítmico)                                                                                     |

Si el usuario elige directamente el EVLWI, esta capa se salta.

**El ejercicio no tiene una P\* propia.** Reddy da cortes ROC (PCWP ≥32 y PAD ≥19 mmHg en el pico) sobre una respuesta sí o
no, no una bisagra en estado estable: sus pacientes sin líneas B nuevas ya pasaban de 19 mmHg. Esos cortes quedan como meta
(P-T10) y deben salir de la misma bisagra con la τ de subida de la capa 2; si no salen, es un hallazgo que se documenta, no
una tercera P\* que se añade.

**Cómo se calibra k sin inventarlo.** Las dos anclas cuantitativas miden cosas distintas: Mayr liga el agua con la suma de
28 sitios (capa 4) e Imanishi liga la presión con la suma de 8 zonas. P-T30 no basta para fijarlo todo a la vez: también
dependen de él el umbral regional y la amortiguación de la capa 3, y una sola k no da a la vez ≈8 líneas con FE preservada
y ≈24 con FE reducida. El orden es: primero la física de la capa 4 con Mayr; luego la amortiguación con sus anclas propias
(C-T31, P-T21); al final una k por fenotipo con P-T30. El valor resultante es una predicción del modelo, y solo es coherente
si la relación entre 8 y 28 zonas que produce el simulador es razonable.

### Capa 2: cinética

`dEVLW/dt = (EVLWI_ss − EVLW) / τ`, con τ distinta para la subida y la bajada.

| Parámetro                                 | Valor                                          | Origen                                                                                                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| τ de subida                               | minutos                                        | las líneas B aparecen durante un ejercicio submáximo [PUBLICADO] [@reddy-hfpef-2019]; en la lesión animal, primera subida significativa a los 15 min [@gargani-oleico-2007] → `extrapolacion`; rango [SUPUESTO] 3–60 min |
| Caída, IC hipertensiva con VNI y nitratos | t½ del puntaje ≈48–50 min                      | [DERIVADO] de [@martindale-vni-2018] (P 1.11.12)                                                                                                                                                                         |
| Caída, IC aguda tratada en urgencias      | t½ del puntaje ≈2,7 h y luego ≈22 h (bifásica) | [DERIVADO] de [@cortellaro-cinetica-2017] (P-T21)                                                                                                                                                                        |
| Suelo residual en la congestión crónica   | sin valor                                      | [SUPUESTO]: muchos pacientes llegan al alta con líneas B (48 ± 48 → 20 ± 23 en 28 sitios) [@gargani-pronostico-2015]                                                                                                     |

**Las t½ son de puntajes, no del agua.** Cortellaro usa un ordinal de 0–2 por zona y el puntaje de Martindale incluye la
fusión y satura; la t½ de un puntaje no lineal no es la τ del agua. Por eso τ se ajusta para que el puntaje simulado con el
protocolo de cada estudio caiga como se observó. Además, son medianas de cohortes, no ajustes por paciente: son el centro de
la variabilidad entre pacientes (capa 6), no la constante de cada uno.

**Retraso sí, subida continuada no.** Un primer orden produce retraso: con la presión ya normal, el agua sigue alta un rato,
que es el estado transitorio «E/e′ normal con líneas B» de C-T25. No produce una subida que continúe después de bajar la
presión, y ningún dato de IC lo pide: la meta P-T20 [@caltabeloti-fluidos-2014] es un SDRA con la PCWP en 12–14 mmHg, por
debajo de cualquier bisagra, y pertenece a la permeabilidad (L2 de `docs/knowledge/pathophysiology.md` §2.1), no a esta
propuesta. Si hiciera falta, la forma completa es la de filtración menos linfa de §2.2 del mismo documento.

### Capa 3: reparto regional

- **Presión hidrostática local**: `Pc(z) = Pfill + 0,77 mmHg/cm · (z − z_AI)`, con z la profundidad bajo la aurícula
  izquierda en la dirección de la gravedad **[DERIVADO]** (cálculo físico: densidad de la sangre ≈1,05). En supino, z va de
  delante atrás; sentado, del vértice a la base. Cada región aplica su propia bisagra (capa 1) y su cinética (capa 2).
  Como la bisagra publicada es global, el umbral regional se calibra para que la suma reproduzca P-T30: las regiones
  declives se encienden antes y las no declives después.
- **Amortiguación** del gradiente **[SUPUESTO]**: aplicado tal cual, exagera el efecto de la postura. Se calibra con dos
  anclas: un 25 % más de líneas B en supino que sentado [@picano-aguapulmonar-2016] (C-T31), y los ápices que se aclaran
  antes que las bases, 75 % frente a 38 % a las 24 h [@cortellaro-cinetica-2017] (P-T21).
- **Orden de aparición** **[PUBLICADO, cualitativo]**: el edema cardiogénico avanza de las zonas laterales inferiores a las
  anteriores superiores [@gargani-howido-2014]. Debe salir solo del gradiente, sin regla aparte.
- **Simetría** derecha–izquierda por omisión **[SUPUESTO]**: no se encontraron datos de asimetría de las líneas B.
- **Lo que no se ve**: el barrido anterolateral no capta el agua de los lóbulos inferiores dorsales [@baldi-densidad-2013].
  El modelo lo reproduce porque cada protocolo solo lee sus sitios: con agua dorsal abundante, la suma de 28 sitios
  infraestima el agua total.

### Capa 4: del agua regional a la física de cada espacio intercostal

- **Dos compartimentos [SUPUESTO, con anclas cualitativas]**: el agua intersticial engrosa los tabiques y crea trampas
  separadas (líneas B discretas); el agua alveolar llena espacios aéreos y hace crecer la fracción de pleura ocupada
  (confluencia, «pulmón blanco»). Es la escala negro → negro y blanco → blanco de [@picano-aguapulmonar-2016].
- **Paso a la física**: agua regional → tejido regional → fracción de gas → población de trampas
  (`docs/knowledge/pathophysiology.md` §2.2, variables L1, L4 y L5). Lo que la física haga con esa población (frecuencia,
  foco, ganancia) es de la fase 2.
- **Ancla global [PUBLICADO]**: `EVLWI = 0,449 · BL28 + 3,79` mL/kg, r 0,93, válida para EVLWI de 5 a 27 mL/kg
  [@mayr-evlw-2022]. Invertida **[DERIVADO]**: `BL28 ≈ 2,23 · EVLWI − 8,4`, que da ≈14 líneas con 10 mL/kg y ≈25 con 15
  (P-T1). La relación entre la población de trampas y las líneas B medidas se calibra para cumplirla.
- **Suelo del pulmón sano [SUPUESTO necesario]**: con el agua normal (7,4 mL/kg), la recta invertida da ≈8 líneas, por
  encima del «≤5 normal» [@picano-aguapulmonar-2016] y lejos del 87,5 % de sanos sin ninguna línea B
  [@zoneff-sanos-2019]. Mayr se ajustó en críticos, el 84 % ventilados. El suelo **no es una regla sobre el agua ni sobre
  el conteo**: sale del paso agua → trampas, porque con poca agua las trampas son pocas o pequeñas y su reirradiación queda
  bajo el ruido. Su parámetro (el agua regional a la que aparecen trampas visibles) vive en esa capa y debe quedar por encima
  del agua basal. Por debajo de ≈10 mL/kg manda P-T31 y desde ≈10, P-T1 (`docs/knowledge/pathophysiology.md` §1.12).
- **La recta invertida es aproximada**: lo publicado es la regresión de EVLWI sobre BL28, no la media de BL28 dado el
  EVLWI. La prueba exacta es la regresión de la cohorte simulada (P-T2).
- **Modificadores de lo observado, no del agua**: la PEEP baja las líneas visibles sin quitar agua (P-T7); con obesidad, el
  conteo infraestima (`docs/knowledge/clinical.md` §1.8.5); los clips cortos muestran menos líneas que los largos
  [@platz-checklist-2019]. En lus-sim **no se aplican como factores**: deben salir de la fracción de gas (PEEP), de la pared
  (obesidad) o de la adquisición (clip). Si uno no emerge, es un fallo de la física, no un parámetro que añadir.

### Capa 5: la regla del protocolo

Reglas puras en `lus/` sobre los observables medidos (`docs/ARCHITECTURE.md`): por sitio o zona, agregación y banderas de
§3. Son las mismas para la verdad latente y para lo medido; el modo docente muestra ambas lado a lado.

### Capa 6: variabilidad

- **Entre pacientes [SUPUESTO]**: k, P\* y τ se sortean por paciente virtual (semilla fija) para reproducir la dispersión
  publicada: correlación alta frente al agua (P-T2) y débil y con excepciones frente a la presión, incluidos los pacientes
  con PCWP alta y patrón A (P-T9). Las metas de dispersión son los rangos intercuartílicos de `docs/knowledge/pathophysiology.md` 1.2.17.
- **Del lector**: no se suma ruido a las líneas B. La variabilidad entre exámenes sale de la adquisición (recolocar la
  sonda dentro de la zona, otro clip), y su tamaño lo fija la meta C-T24.

## 5. Metas de prueba con anclas publicadas

Las metas viven en la base de conocimiento; aquí se listan las que esta propuesta debe cumplir.

| Ancla                                | Qué se exige                                                                                                                                                                                                                                 | Meta y fuente                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Bisagra presión → líneas B**       | En estado estable y con clips de 3 s como en la fuente, suma de 8 zonas ≈0 hasta 18 mmHg y ≈8 con 19–24 en la FE preservada; ≈1 hasta 24 y ≈24 con ≥25 en la FE reducida; ≥6 líneas separan la PCWP por encima y por debajo de la bisagra    | P-T30 [@imanishi-pcwp-2023]                                                 |
| **Regresión de Mayr**                | Regresión de EVLWI sobre BL28 de la cohorte simulada con pendiente e intercepto dentro de rango; BL28 ≈14 / 25 / 36 con EVLWI 10 / 15 / 20 mL/kg, como orientación                                                                           | P-T1–T3 [@mayr-evlw-2022]                                                   |
| **Cortes pronósticos como banderas** | >15 en 28 sitios antes del alta; ≥3 en 8 zonas en la consulta; bandas de estrés de 4 sitios. Las banderas son monótonas con el agua (C-T22); la EVLWI a la que cada una se enciende es una predicción del modelo que se informa, no una meta | [@gargani-pronostico-2015]; [@platz-ambulatorio-2016]; [@scali-se2020-2020] |
| **Suelo del pulmón sano**            | Con agua y presiones normales, BL28 ≤5 y suma de 8 zonas 0–1; ≥80 % de los sanos virtuales sin ninguna línea B; un sano tras un esfuerzo casi máximo, ≈0                                                                                     | P-T31 [@zoneff-sanos-2019]; C-T20; C-T32 [@hind-deportistas-2025]           |
| **Ejercicio en FE preservada**       | Medido en los 2 puntos de Reddy: con PCWP <32 mmHg en el pico, sin líneas B nuevas en la mayoría; con ≥32 y PAD ≥19, con ellas                                                                                                               | P-T10, C-T29 [@reddy-hfpef-2019]                                            |
| **Retraso y descongestión**          | Una subida brusca de la presión no cambia las líneas B en el primer minuto; el puntaje de cada estudio cae como se observó (capa 2), con los ápices antes que las bases                                                                      | P-T8, P-T21, C-T23 [@cortellaro-cinetica-2017]; [@martindale-vni-2018]      |
| **Ingreso y alta en 28 sitios**      | Un paciente virtual típico pasa de ≈48 a ≈20 líneas entre el ingreso y el alta                                                                                                                                                               | P 1.11.11 [@gargani-pronostico-2015]                                        |

## 6. Incertidumbres y lo NO ENCONTRADO

- **No existe una curva publicada «presión → líneas B».** La bisagra sale de medianas por intervalos de PCWP con 13 a 38
  pacientes por intervalo, y la celda de FE preservada con PCWP ≥25 tiene 4. Usó clips de 3 s y su regla de conteo por zona no se verificó. Además, Imanishi midió cerca del alta, durante
  la descongestión: si la presión baja antes que el agua, la bisagra en estado estable podría estar algo desplazada
  (lectura nuestra, sin dato que la confirme).
- **Supuestos calibrables**: k, las constantes de tiempo humanas, el aumento de la capacidad linfática en la IC crónica, la
  pendiente entre la linfa y la PAD, la amortiguación de la gravedad y el umbral de detección del sano.
- **Mayr se ajustó en críticos casi todos ventilados**, no en la IC aguda con respiración espontánea.
- **Tres presiones tratadas como una.** La relación entre PCWP, PAI media y PD2VI no se investigó; las correlaciones
  lineales con la presión izquierda en la literatura van de débiles a nulas, y algunas cohortes pequeñas describen una recta
  donde Imanishi ve un tramo plano.
- **NO ENCONTRADO**: un ajuste formal de líneas B frente a PCWP o PAI con su banda de confianza; una comparación humana con
  PAI transeptal directa; una conversión validada entre 4, 8 y 28 zonas; valores normales por zona en los esquemas de 8 y
  28; datos de asimetría derecha–izquierda; el tiempo de redistribución tras un cambio de postura; cuánto tardan en
  desaparecer las líneas B tras el esfuerzo; cuánto baja el umbral con la hipoalbuminemia en humanos; el umbral humano de
  EVLWI para la inundación alveolar; una vida media publicada de aclaramiento; un objetivo «seco» validado para
  ambulatorios. El umbral animal clásico de la PAI (Guyton y Lindsey 1959, en perros) solo se leyó en fuente secundaria y
  no se usa (`docs/knowledge/pathophysiology.md` §1.13).

## 7. Cómo se vería en la interfaz

- **Panel «Hemodinamia»**: selector de la variable de mando (PAI, PD2VI, PCWP o EVLWI) con su deslizador en mmHg o mL/kg; el
  aviso de que las tres presiones se tratan como una; fenotipo, PAD y postura; y un control del tiempo («esperar 30 min»,
  reloj acelerado) para ver la cinética, porque las líneas B no cambian en el instante en que se mueve la presión. En el
  modo docente, el agua actual frente a su valor de equilibrio.
- **Mapa del protocolo**: un tórax esquemático (vista anterior y laterales) con los sitios del protocolo elegido. Cada sitio
  muestra el número medido sobre lo que el alumno adquirió; los no visitados quedan en gris y los que tienen derrame, como
  «no evaluable». El número va escrito, no solo en color. En el modo docente, al lado, la verdad del modelo, medida con la
  misma física en la pose ideal de cada sitio (no una tabla aparte).
- **Totales**: la suma o el puntaje de cada protocolo lado a lado, con sus bandas y banderas, cada una con su fuente. Cuando
  se muestran dos protocolos del mismo paciente, el rótulo «conversión = predicción del modelo».
- **Curva docente**: la suma de 8 zonas frente a Pfill para el fenotipo elegido, con las medianas publicadas de Imanishi
  encima como puntos de referencia.
- **El mapa no es un atajo**: la sonda sigue teniendo que llegar a cada sitio (`docs/GUIDE.md` §7). En el modo examen se
  ocultan el mando, el agua y la verdad.
- **Modo ensayo** (opcional, más adelante): el mismo paciente virtual clasificado con las definiciones de congestión de los
  ensayos guiados por ecografía, que no coinciden entre sí [@chotalia-ensayos-2026].

## 8. Orden de implementación sugerido

1. **Reglas de los protocolos en `lus/`**, con observables sintéticos declarados como tales: C-T16–T18, y C-T22 con un
   observable sintético monótono. No necesita la física de las líneas B y puede adelantarse.
2. **Capas 1–3 en `physiology/`**, con `defineParameters` y las etiquetas de §4. Se prueban sobre el agua latente: la
   bisagra en el EVLWI de equilibrio, el retraso del agua tras un escalón de presión y el orden regional de aclaramiento.
   Las metas en líneas B (P-T8, P-T21, P-T30) esperan a la capa 4.
3. **Capa 4 con la física de las líneas B (fase 2)**: calibración a Mayr (P-T1–T3) y al suelo del sano (P-T31); después,
   la amortiguación y k por fenotipo contra P-T8, P-T21 y P-T30.
4. **Medición sobre la señal, mapa y mando en la interfaz**; e2e de la cadena del alumno.
5. **Cohortes virtuales** (P-T2, P-T9, C-T20, C-T24) y revisión clínica adversarial de contexto limpio.
