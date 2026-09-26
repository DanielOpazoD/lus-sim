# Guía de desarrollo de lus-sim

Documento rector del proyecto. Junto con la base de conocimiento (`docs/KNOWLEDGE.md`) forma su
especificación. Adapta a la ecografía pulmonar la guía de desarrollo de VExUS (21-09-2026) y añade las
reglas que Daniel pidió para este proyecto: los mismos principios de alta fidelidad anatómica,
ecográfica, clínica y física; buenas prácticas de programación con documentación y pruebas; y
desarrollo en paralelo, preparado para unirse a VExUS y EchoTwin.

## 0. Misión

Construir un gemelo digital de ecografía pulmonar que corra en el navegador: el alumno mueve una sonda
virtual sobre un paciente virtual y obtiene en tiempo real la imagen en modo B y en modo M, con los
controles de un ecógrafo real. La imagen sale de una cadena causal:

paciente → anatomía y fisiología → interacción acústica → señal → procesamiento del ecógrafo → imagen →
medición → interpretación.

El médico debe poder equivocarse de la misma manera en que se equivocaría con un paciente real. El
simulador debe enseñar no solo a reconocer patrones, sino a obtenerlos correctamente.

## 1. La especificación manda

- `docs/KNOWLEDGE.md` es la fuente primaria de la física, la anatomía, la fisiopatología y la clínica.
  No se rehace la revisión bibliográfica: se amplía solo cuando falta algo concreto para implementar.
- Si el código y la especificación discrepan, manda la especificación salvo razón técnica fundada; el
  apartamiento se documenta como decisión (qué, por qué, impacto, cómo corregirlo).
- **No se inventan valores clínicos.** Todo número propio se declara con `defineParameters`
  (`src/core/evidence.ts`): documentado, de consenso o derivado, con fuente; o estimado, con rango y
  entrada en `docs/APPROXIMATIONS.md` (decisión 4).

## 2. Cuatro fidelidades, cada una con su prueba

| Fidelidad      | Qué significa                                                                                                                                                   | Cómo se comprueba                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Anatómica**  | Geometría del tórax con dimensiones documentadas: pared por región, costillas y espacios intercostales, profundidad de la pleura, recesos, diafragma, escápula. | Dimensiones del modelo dentro de los rangos de la base (pruebas); cortes de anatomía; revisión clínica.                |
| **Física**     | Los artefactos salen del modelo acústico: reflexión especular de la pleura, reverberación, trampas subpleurales, atenuación, sombra.                            | Invariantes físicas (§18) con mutación; gemelos TS ↔ GLSL con equivalencia exacta.                                     |
| **Ecográfica** | La imagen se parece a la real en su estadística y cambia como la real al mover la sonda o un control.                                                           | Banco de fidelidad contra el banco de referencia real (decisión 5); prueba ciega con el rasgo que delata al simulador. |
| **Clínica**    | Los casos reproducen los hallazgos publicados; el puntaje emerge de la señal; las trampas diagnósticas existen.                                                 | Cadena del alumno por caso (puntaje y perfil medidos con técnica correcta); revisión experta en ciego.                 |

Una fidelidad sin su prueba no cuenta como lograda.

## 3. Tres estados separados

**A. Estado del paciente** (verdad latente): respiración (patrón, frecuencia, volumen corriente,
ventilación espontánea o mecánica, PEEP), ritmo y frecuencia cardíaca, estado regional del pulmón
(fracción de aire, agua intersticial, llenado alveolar, consolidación), espacio pleural (aire y su
extensión, líquido y su ecogenicidad, adherencias o pleurodesis), pared torácica (hábito, enfisema
subcutáneo) y posición del paciente.

**B. Estado físico**: la geometría en el instante del reloj (superficie pleural, campo de deslizamiento,
borde de un neumotórax, líquido y pulmón flotante) y las propiedades acústicas de cada punto.

**C. Señal adquirida**: lo que produce la adquisición: posición y ángulo de la sonda, contacto y presión,
tipo de transductor y frecuencia, profundidad, foco, ganancia, TGC, rango dinámico, armónicos,
composición espacial, persistencia, línea del modo M.

Nunca se confunden. Una mala adquisición debe poder generar una imagen engañosa aunque el paciente esté
perfectamente definido.

## 4. Un único reloj

La respiración, el latido, el deslizamiento pleural, el pulso pulmonar, el movimiento del borde de un
neumotórax, el broncograma dinámico, el pulmón flotante en un derrame y el modo M derivan del
`SimulationClock` (`src/core/clock.ts`). Nada se anima con un temporizador propio. Más adelante, el
ventilador (puente con el simulador del R860) moverá la fase respiratoria a través del mismo reloj.

## 5. Nada se asigna: el patrón y el puntaje emergen

No: `zona.puntaje = 2 → dibujar líneas B confluentes`. Tampoco: `caso = neumotórax → quitar el
deslizamiento`.

Sí: estado regional → física subpleural → imagen → observables (líneas B por espacio intercostal,
fracción de la pleura con líneas B, consolidación, deslizamiento en modo M) → clasificador (puntaje LUS,
perfil BLUE).

Deben poder existir pacientes discordantes (misma cifra de puntaje por mecanismos distintos) y errores
del operador (un puntaje falso por mala técnica).

## 6. Reglas clínicas mínimas

Las definiciones operativas (línea pleural, líneas A, líneas B y su umbral por espacio intercostal,
puntaje LUS 0–3 por zona, perfiles BLUE, punto pulmonar, pulso pulmonar, signos del derrame y de la
consolidación) son las de consenso que recoge `docs/KNOWLEDGE.md`, con su fuente. El clasificador
(`lus/`) las implementa como reglas puras sobre observables; cualquier criterio adicional es una
decisión documentada.

## 7. Sonda virtual

Objeto físico con 6 grados de libertad, contacto con la piel, presión (solo empuja: la compresión de
VExUS), marcador, huella y tipo de transductor (convexo, sectorial y lineal de alta frecuencia) con su
frecuencia. El usuario encuentra cada zona y cada espacio intercostal moviendo la sonda; no hay un botón
por zona que salte la adquisición. Los puntos de partida, si existen, dejan la sonda cerca, no en la
imagen perfecta. Interacción inicial con ratón, trackpad y pantalla táctil; arquitectura preparada para
IMU de teléfono u otros dispositivos.

## 8. Primera rebanada vertical (fase 1)

Anatomía mínima: hemitórax anterior derecho con tres o cuatro costillas y sus cartílagos, pared en
capas, pleura y pulmón aireado. Interacción: sonda libre, contacto y compresión, orientación longitudinal
(signo del murciélago) y oblicua intercostal (pleura continua). Imagen: moteado anclado al tejido, PSF
dependiente de la profundidad, atenuación, sombra costal limpia, línea pleural, líneas A y
deslizamiento. Casos: el sano y el síndrome intersticial difuso, con el mismo motor y distintos
parámetros (la física de las líneas B llega en la fase 2; la rebanada deja listo el estado que la
producirá).

## 9. Artefactos: física exigida

Cada artefacto tiene su mecanismo en la base de conocimiento y se implementa desde él:

- **Línea pleural**: eco especular de la interfaz pared–pulmón, dependiente de la incidencia.
- **Líneas A**: reverberación entre la sonda y la pleura, a múltiplos de su profundidad.
- **Líneas B**: artefactos verticales desde la pleura que borran las líneas A y se mueven con el
  deslizamiento, producidos por la mezcla subpleural de aire y agua; su aspecto depende de la
  frecuencia y del enfoque si la física lo dice así.
- **Líneas Z y E**: verticales cortas desde la pleura; las E nacen en el enfisema subcutáneo, sobre la
  pleura.
- **Deslizamiento y pulso pulmonar**: movimiento relativo de la pleura visceral con la respiración y con
  el latido.
- **Punto pulmonar**: el borde de un neumotórax que entra y sale del haz con la respiración.
- **Consolidación**: pulmón sin aire con patrón tisular, borde profundo irregular y broncograma
  estático o dinámico.
- **Derrame**: espacio anecoico entre las pleuras con sus signos (cuadrilátero, sinusoide, pulmón
  flotante, columna), ecos internos si es complejo.
- **Sombra costal, espejo sobre el diafragma y signo de la cortina** en las bases.

## 10. Modo M

La tira del modo M es la misma línea del modo B muestreada en el tiempo del reloj único, no una
animación aparte. La orilla de mar, el código de barras y la sinusoide emergen del movimiento real de
las estructuras bajo la línea.

## 11. Anatomía

No hace falta el cuerpo entero desde el primer día, pero la arquitectura admite los dos hemitórax, las
zonas posteriores con la escápula, las bases con el diafragma, el hígado y el bazo, variantes de hábito
corporal y la deformación respiratoria. Ningún dataset externo entra sin comprobar su licencia.

## 12. Respiración y movimiento

La respiración desplaza el pulmón bajo la pared con una amplitud que depende de la región (menor en los
vértices, mayor en las bases) y del volumen corriente; baja el borde del pulmón en los recesos (signo de
la cortina) y mueve el diafragma. Se distinguen respiración tranquila, profunda, apnea y ventilación
mecánica con PEEP. El latido mueve la pleura junto al corazón (pulso pulmonar).

## 13. Controles del ecógrafo

Cada control actúa en la etapa física que le corresponde: la ganancia amplifica la presentación, no la
ecogenicidad; la profundidad cambia el rango adquirido; el foco cambia la PSF alrededor de su
profundidad; la frecuencia cambia la atenuación, la resolución y, si la física lo dice, la visibilidad
de los artefactos; los armónicos, la composición espacial y la reducción de moteado cambian los
artefactos como en un equipo real. El preajuste pulmonar sigue las recomendaciones de la base de
conocimiento, y apagarlo o cambiarlo debe tener consecuencias visibles y enseñables.

## 14. Interfaz

Genérica y profesional, sin copiar ninguna marca comercial. Modo alumno (sin verdad latente ni
diagnóstico), modo docente (verdad y medida lado a lado) y modo de depuración (anatomía 3D, plano del
haz, estado fisiológico, campos de aireación y de deslizamiento).

## 15. Pila

La de VExUS (decisión 2): TypeScript, Vite, WebGL2 sin intermediarios, three.js para el navegador 3D,
Web Workers cuando sirvan, sin framework de interfaz; el núcleo de simulación es independiente de la
interfaz.

## 16. Organización

Capas y reglas de dependencia en `docs/ARCHITECTURE.md`, comprobadas por
`src/validation/layers.test.ts`.

## 17. Determinismo

Misma semilla, mismo estado del paciente y mismas acciones del usuario producen la misma situación
(`src/core/random.ts`). Lo exigen las pruebas, los casos docentes y los exámenes.

## 18. Invariantes que se prueban

Cada una con su mutación (que la prueba falle si se quita la regla):

- La separación entre líneas A es la profundidad de la pleura (a lo largo del haz), y cambia si la
  pared se comprime.
- Las líneas B nacen en la línea pleural, llegan al fondo del sector y se mueven con el deslizamiento.
- Donde hay líneas B confluentes, las líneas A desaparecen.
- Sin deslizamiento (neumotórax, apnea, adherencias) el modo M muestra el código de barras; con
  deslizamiento, la orilla de mar; con pleuras en contacto sin ventilación, el pulso pulmonar.
- El punto pulmonar solo existe en el borde del neumotórax y se desplaza con la respiración.
- La ganancia, el rango dinámico y el mapa de grises no cambian el estado físico ni el puntaje latente.
- El puntaje LUS emerge de los observables: no existe un camino que lo fije desde el caso.
- Misma semilla y mismo estado → misma imagen, bit a bit.
- La respiración y el latido usan el mismo reloj que el modo M.

## 19. Rendimiento

Objetivos iniciales, no dogmas: interfaz a 60 FPS, modo B a 30 FPS o más en un computador moderno,
modo M continuo, latencia sonda → imagen que se sienta física. Se perfila antes de optimizar; nada de
lecturas GPU → CPU por cuadro.

## 20. No sacrificar física por un efecto bonito

Prohibido:

- vídeos o bucles pregrabados que cambian según una etiqueta;
- líneas B o líneas A dibujadas como textura o sprite;
- ruido superpuesto para fingir moteado, o moteado regenerado en cada cuadro;
- modo M dibujado desde una plantilla;
- puntaje o perfil decidido antes de formar la imagen;
- sombras costales pintadas en una textura fija;
- patrones que aparecen aunque la sonda esté mal colocada.

Se permiten aproximaciones por rendimiento que preserven la causalidad, documentadas en
`docs/APPROXIMATIONS.md`.

## 21. Desarrollo iterativo

Fases verticales de `docs/ROADMAP.md`. Cada una termina con algo que funciona de punta a punta, una
evaluación adversarial con nota y una versión etiquetada.

## 22. Preparado para la unión

Las cinco reglas de la decisión 1 (`docs/UNIFICATION.md`): misma pila, procedencia con deriva medida,
capas compartidas con las mismas reglas, contratos del paciente y del reloj, evidencia y documentación
con el mismo formato.

## 23. Proceso y documentación

- Rama y PR por cambio, con CI en verde (`check` + e2e) y la plantilla completa.
- Decisión numerada para todo lo que cambie el modelo o el proceso (`docs/DECISIONS.md`).
- Limitaciones con identificador (`docs/LIMITATIONS.md`), aproximaciones con plan de calibración
  (`docs/APPROXIMATIONS.md`), glosario al día (`docs/GLOSSARY.md`).
- Revisión adversarial de contexto limpio antes de integrar física, anatomía o clínica: el revisor
  ejecuta y mide, no solo lee.
- `npm run check` antes de cada PR; nunca filtrar su salida con `grep` antes de decidir.

## 24. Criterio de calidad

En cada decisión:

- «Si un médico experto mueve la sonda o cambia este control, ¿el resultado se comportaría como en un
  ecógrafo real?»
- «¿Este cambio ocurre porque cambió la geometría, la fisiología o la señal, o solo porque imita el
  resultado?»
- «¿Un ecografista experto, en ciego, distinguiría esta imagen de una real? ¿Por qué rasgo?»

Se prefiere siempre la primera respuesta de cada pregunta.

## 25. Objetivo final

No un simulador de patrones pulmonares, sino un gemelo digital ecográfico simplificado donde haga
falta para correr en un navegador, construido sobre una cadena causal coherente y unido, más adelante,
al corazón (EchoTwin), a las venas (VExUS) y al ventilador en un mismo paciente virtual.
