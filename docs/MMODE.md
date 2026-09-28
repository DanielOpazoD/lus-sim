# B + M: adquisición y revisión temporal del pulmón normal

Implementación de la guía §10 sobre la base `aed9401` (PR #29). Este bloque amplía la
interacción de la decisión 23; no cambia la calibración física de la decisión 24.

## Uso

Activa **B + M** junto a Congelar. **Colocar línea** permite tocar el interior del sector sin
mover el transductor; Escape cancela la selección. El ajuste fino contiene un rango nativo
accesible por teclado. El barrido muestra los últimos 4 u 8 segundos del reloj de simulación.

Mantén la sonda quieta para adquirir una franja. Congelar detiene B, M y el reloj; el cine
mueve el instante derecho de M al del cuadro B mostrado. **Nueva franja** borra el registro M,
no el paciente ni el cine. Apagar y reactivar M inicia otro registro.

La ayuda distingue selección, adquisición viva, imagen congelada, ausencia de historia y
pérdida de GPU. El ajuste fino y la explicación técnica permanecen plegados al inicio;
la ayuda viva sigue indicando que M se muestrea a la cadencia de B. La imagen B conserva
un mínimo de 240 píxeles CSS al mostrar M: es jerarquía visual, no resolución acústica.

## Decisiones de implementación

- Se reutilizan `MColumnRing`, `mCapture`, `drawMStrip` y `represent` del renderizador ya
  portado. `Simulator.render` transmite una línea opcional al mismo cuadro de imagen.
- `MModeAcquisition` compara la línea, la pose y los ajustes mediante una copia numérica.
  Un cambio inicia otra franja antes de capturar el siguiente cuadro. Se incluyen los seis
  componentes de pose, profundidad, foco, ganancia, rango dinámico, persistencia, composición,
  armónicos y cada banda de TGC; una mutación de un array tampoco elude la frontera.
- Otro paciente o renderizador inicia un registro nuevo. La congelación no modifica la
  historia. Una maniobra respiratoria continúa la misma adquisición para observar la transición.
- El tiempo mostrado procede de `displayedAcquisition`, también en cine. Cuando ese instante
  está fuera del registro M vigente se informa **Sin datos M para este cuadro del cine**.
  No se reconstruye M de cuadros B que no tenían esa línea adquirida.
- La selección con puntero usa las transformaciones del propio renderizador. Solo el gesto
  explícitamente armado se consume; los demás conservan la navegación de sonda existente.
- M se presenta en un canvas separado. La copia usa `drawImage` y restaura B con `represent`
  en un `finally`, dentro del mismo cuadro. No se añade `readPixels` al camino de producción;
  el coste interno de la copia depende del navegador y necesita medición en hardware real.
- La vista está oculta al iniciar. No añade un store, un reloj, dependencias de producción,
  un generador de patrones ni un clasificador diagnóstico. El barrido y los tamaños de controles
  son decisiones de interfaz, no constantes clínicas.

## Límites que siguen abiertos

El registro se muestrea a la cadencia de B: **no es una adquisición M dedicada de alta
frecuencia**. El eje utiliza tiempo de simulación, cuyo avance ya estaba acotado por el bucle
principal. No debe usarse para enseñar una frecuencia de adquisición equivalente a un ecógrafo real.

Cada columna usa la envolvente y el mapa de grises del cuadro, antes de la persistencia temporal.
Con persistencia activada, B puede estar suavizado y M no. No se añade una segunda persistencia
ni se modifica el ajuste del equipo silenciosamente.

Se conserva la regla de `MColumnRing`: cada columna representa el intervalo desde la anterior
hasta su instante; un hueco superior a 0,5 s permanece negro. Es retención de muestra, no
interpolación ni recuperación de señal ausente. La capacidad es la existente: 2048 columnas
con 512 muestras de profundidad. Mover el transductor continuamente reinicia la franja,
por lo que esta entrega no es un registro del artefacto de movimiento de sonda.

La disponibilidad temporal de una franja **no certifica calidad técnica, contacto, deslizamiento
ni un diagnóstico**. La fidelidad de textura y dinámica conserva las limitaciones del motor.
No se añaden neumotórax, adherencias, pulso pulmonar ni signos diagnósticos prefabricados;
no se certifica orilla de mar o código de barras por mostrar una tira M.

La ampliación modifica únicamente la ausencia de M descrita en el alcance histórico
`normal-acquisition-only`: siguen pendientes casos patológicos, medición y modo docente/examen.
La validación en iPhone físico, VoiceOver, otras GPU y revisores clínicos sigue pendiente.

## Procedencia incremental de este bloque

Complementa `docs/PROVENANCE.md`, cuyo origen fijado y clasificaciones de adaptación no cambian.
Esta nota registra el delta respecto de `aed9401`; no declara una nueva sincronización con VExUS.

- `src/app/simulator.ts` sigue **adaptado**: ahora transmite `mline` al renderer; lo demás
  conserva la orquestación, paciente, contacto y adquisición histórica existentes.
- `src/main.ts` sigue **adaptado**: conecta la vista M al renderizado y al overlay existentes.
- `.github/workflows/ci.yml` sigue **adaptado**: conserva todos los gates, añade el diff del
  formateador cuando falla, archiva capturas M del paciente sintético y redistribuye las pruebas
  en seis fragmentos. No modifica los requisitos del agregador.
- `src/ultrasound/renderer.ts`, `src/ultrasound/mmode.ts` y sus shaders **no se modifican**.
- `src/app/mModeAcquisition.ts`, `src/ui/mMode.ts`, `src/ui/mMode.css` y sus pruebas son
  integración nueva de lus-sim. No se copian nuevos módulos de otros repositorios.

## Verificación reproducible

La suite `src/validation/mModeAcquisition.test.ts` comprueba fronteras de adquisición, cambios
por mutación, congelación, reinicio, reemplazo del paciente/renderizador y ángulos inválidos.
Las pruebas históricas del anillo siguen cubriendo capacidad, orden, cadencia y huecos.

`e2e/mmode.spec.ts` recorre controles reales y lee el estado resultante: señal interior de M,
B congelado idéntico tras cambiar el barrido, reloj común, cine anterior sin datos M,
selección táctil emulada sin mover sonda, teclado, estados de ayuda, reflow y recuperación de GPU.
Las lecturas de píxeles se limitan a la prueba; el umbral de contraste detecta una franja negra,
no es un criterio clínico. Las capturas se archivan como evidencia, no como auditoría humana.

### Distribución de CI tras ampliar la suite

CI87, sobre `98e1da0`, agotó el plazo de 15 minutos del fragmento 2/5: había completado
calibración PLAPS y las tres ventanas de fidelidad, pero no terminó el quinto recorrido.
No hubo una aserción fallida en sus cuatro pruebas completadas. Se conservó el rechazo del
agregador; no se integró esa ejecución cancelada.

La suite pasa a seis fragmentos con un trabajador cada uno, las mismas pruebas, sus plazos y
sus tolerancias. El denominador del comando sale de la matriz. Esta actualización sustituye
el reparto histórico de cinco fragmentos descrito en `docs/TESTING.md`; no es una mejora de
rendimiento del simulador ni una reducción de cobertura. El resultado final debe comprobarse
en el SHA del PR, incluidos todos los fragmentos y el agregador `check`.

Comandos del repositorio: `npm run check` y, tras `npx vite build`, `npm run e2e`.
El resultado efectivo es el de CI del SHA revisado, no la mera existencia de las pruebas.
La comprobación local aislada inicial de la frontera rechazó siete mutaciones: omitir pose,
ganancia, TGC, paciente, renderizador, congelación o límites del sector. No equivale a ejecutar
localmente la suite completa ni a una revisión clínica independiente. En la revisión de cierre,
el entorno local no pudo resolver el dominio de GitHub: la verificación completa usa CI.
