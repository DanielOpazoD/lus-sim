# Glosario

Términos clínicos, físicos y del código que aparecen en los documentos y en los identificadores. Si un
término nuevo entra en el código, entra aquí. Las definiciones operativas con su fuente están en
`docs/KNOWLEDGE.md`; aquí van en una línea.

## Clínica

| Término                                   | Significado                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LUS**                                   | Ecografía pulmonar (_lung ultrasound_).                                                                                                                               |
| **Línea pleural**                         | Línea hiperecoica horizontal bajo las costillas: la interfaz entre la pared y el pulmón aireado.                                                                      |
| **Signo del murciélago**                  | En corte longitudinal, dos costillas con su sombra (las alas) y la línea pleural entre ellas (el cuerpo).                                                             |
| **Deslizamiento pulmonar**                | Centelleo de la línea pleural sincrónico con la respiración: la pleura visceral se mueve contra la parietal.                                                          |
| **Líneas A**                              | Líneas horizontales hiperecoicas y equidistantes bajo la pleura: repeticiones de la línea pleural por reverberación.                                                  |
| **Líneas B**                              | Artefactos verticales hiperecoicos que nacen en la línea pleural, llegan al fondo de la pantalla sin atenuarse, borran las líneas A y se mueven con el deslizamiento. |
| **Líneas B confluentes**                  | Líneas B que se tocan y forman una banda blanca continua bajo la pleura.                                                                                              |
| **Síndrome intersticial**                 | Líneas B múltiples y difusas, en varias zonas de ambos hemitórax (umbral en la base de conocimiento).                                                                 |
| **Líneas Z**                              | Artefactos verticales cortos desde la línea pleural que se apagan en profundidad y no borran las líneas A; sin significado patológico.                                |
| **Líneas E**                              | Artefactos verticales que nacen en el enfisema subcutáneo, por encima de la línea pleural, y la ocultan.                                                              |
| **Pulso pulmonar**                        | Movimiento de la línea pleural sincrónico con el latido, sin deslizamiento: pleuras en contacto sin ventilación.                                                      |
| **Punto pulmonar**                        | Lugar donde el patrón con deslizamiento alterna con el patrón sin deslizamiento al ritmo de la respiración: el borde de un neumotórax.                                |
| **Orilla de mar**                         | En modo M, líneas horizontales sobre la pleura (pared inmóvil) y granulado debajo (pulmón que desliza).                                                               |
| **Código de barras (estratósfera)**       | En modo M, líneas horizontales en todo el trazado: no hay deslizamiento.                                                                                              |
| **Signo sinusoide**                       | En modo M, la línea del pulmón se acerca y se aleja de la pleura parietal con la respiración dentro de un derrame.                                                    |
| **Signo del cuadrilátero**                | Derrame delimitado por la línea pleural, las sombras de dos costillas y la línea del pulmón.                                                                          |
| **Consolidación**                         | Pulmón sin aire con aspecto tisular, parecido al hígado.                                                                                                              |
| **Signo del desgarro** (_shred_)          | Borde profundo irregular de una consolidación que no ocupa todo el lóbulo.                                                                                            |
| **Broncograma aéreo dinámico / estático** | Ecos puntiformes o lineales de aire en los bronquios de una consolidación, que se mueven con la respiración (dinámico) o no (estático).                               |
| **Signo de la cortina**                   | El pulmón aireado que baja con la inspiración y tapa las estructuras abdominales en el receso costofrénico.                                                           |
| **Signo de la columna**                   | Los cuerpos vertebrales visibles por encima del diafragma cuando hay líquido o consolidación; con el pulmón aireado no se ven.                                        |
| **Imagen en espejo**                      | Réplica del hígado o del bazo por encima del diafragma cuando el pulmón basal está aireado.                                                                           |
| **Pulmón flotante** (_jellyfish_)         | Pulmón atelectásico que ondula dentro de un derrame grande.                                                                                                           |
| **Signo del plancton**                    | Ecos internos en movimiento dentro de un derrame complejo.                                                                                                            |
| **Protocolo BLUE**                        | Protocolo de urgencia para la insuficiencia respiratoria aguda, con puntos de exploración (BLUE superior, BLUE inferior, PLAPS) y perfiles.                           |
| **Perfiles BLUE**                         | Combinaciones de patrón y deslizamiento en los puntos anteriores (A, A′, B, B′, A/B, C); definiciones en la base de conocimiento.                                     |
| **PLAPS**                                 | Síndrome alveolar o pleural posterolateral (_posterolateral alveolar and/or pleural syndrome_).                                                                       |
| **Puntaje LUS**                           | Grado 0–3 por zona según la pérdida de aireación; la suma de las zonas exploradas.                                                                                    |
| **Puntaje de reaireación**                | Cambio de grado de cada zona entre dos momentos (p. ej., antes y después de subir la PEEP).                                                                           |
| **Zonas de exploración**                  | Regiones del tórax que un protocolo explora (6, 8, 12 o 28 según el protocolo).                                                                                       |
| **EVLW / ELWI**                           | Agua pulmonar extravascular (_extravascular lung water_) y su índice por peso corporal.                                                                               |
| **Excursión diafragmática**               | Desplazamiento craneocaudal del diafragma con la respiración, medido en modo M.                                                                                       |
| **Fracción de engrosamiento**             | Cambio relativo del espesor del diafragma entre espiración e inspiración en la zona de aposición.                                                                     |

## Física de la imagen

| Término                  | Significado                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **PSF**                  | Función de dispersión del punto: la respuesta del sistema a un dispersor puntual; fija el grano del moteado.                       |
| **Moteado anclado**      | Speckle generado por dispersores fijos al tejido: se mueve con él y no se regenera en cada cuadro.                                 |
| **Reverberación**        | Ecos que rebotan varias veces entre dos reflectores fuertes (p. ej., la sonda y la pleura) y aparecen a múltiplos de la distancia. |
| **Reflexión especular**  | Eco de una interfaz lisa que vuelve a la sonda solo cuando el haz la incide casi de frente.                                        |
| **Composición espacial** | Promedio de varias miradas con ángulos distintos; reduce el moteado y puede atenuar los artefactos.                                |
| **Armónicos (THI)**      | Imagen formada con la segunda armónica del eco; cambia la resolución y los artefactos.                                             |
| **TGC**                  | Compensación de ganancia en profundidad.                                                                                           |
| **Rango dinámico**       | Intervalo de amplitudes (en dB) que el mapa de grises reparte entre el negro y el blanco.                                          |

## Código y proceso

| Término                  | Significado                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Reloj único**          | `SimulationClock`: la única fuente de tiempo del motor (`src/core/clock.ts`).                                             |
| **Gemelos TS/GLSL**      | La misma fórmula escrita en TypeScript (pruebas, CPU) y en GLSL (GPU), con una prueba de equivalencia exacta.             |
| **Evidencia**            | Tipo de respaldo de un parámetro: documentado, consenso, derivado, estimado o extrapolación (`src/core/evidence.ts`).     |
| **Procedencia / deriva** | De dónde viene un archivo portado y cuánto se ha alejado de su origen (`docs/PROVENANCE.md`, `npm run provenance`).       |
| **Banco de referencia**  | Ecografías reales con licencia, guardadas fuera del repo, contra las que se mide la imagen simulada (decisión 5).         |
| **Prueba ciega**         | Mosaicos con imágenes reales y simuladas mezcladas; un observador experto señala las simuladas y el rasgo que las delata. |
| **Revisión adversarial** | Revisión de un cambio por un agente o persona sin el contexto de quien lo hizo, que ejecuta y mide en lugar de solo leer. |
