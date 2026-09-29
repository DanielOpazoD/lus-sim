# Revisión de la adquisición: calibre manual y captura B

Extensión de la adquisición histórica de la decisión 23, sobre `c86cbae` (B + M, PR #30).
Objetivos O5/O6: practicar medición manual y conservar una captura docente sin mezclarla con
el estado vivo. No cambia el modelo físico, la anatomía, los shaders, la calibración ni el reloj.

## Uso

Congela la imagen. El cine aparece debajo del sector, sin taparlo. **Medir distancia** permite
colocar A y B con dos toques; también se pueden colocar con flechas y Enter. Mayús aumenta el
paso del cursor y Escape termina la edición. Los botones A/B permiten corregir cada extremo.
**Borrar** elimina el calibre, no el cuadro ni la historia del cine.

**Guardar PNG** captura B con su escala, los extremos confirmados y un encabezado que identifica
el tiempo, la versión, los ajustes y el uso educativo. **Datos JSON** exporta los metadatos del
cuadro mostrado, incluidos la pose, el marco efectivo, la muestra fisiológica, los ajustes y
los extremos con la distancia sin redondear. Son descargas separadas: para una pareja del mismo
cuadro hay que mantener el cine quieto entre ambas acciones.

## Contratos

- Coordenadas `(theta, r)` de la propia imagen adquirida. La distancia es euclídea en el plano,
  usando `beamToPixel` a escala unitaria del mismo `sectorGeometry.ts` que usa el renderer.
  Incluye el radio de curvatura: no es la longitud del arco, la diferencia de profundidades ni
  una distancia entre píxeles CSS. No consulta la anatomía para elegir o corregir los extremos.
- Un calibre pertenece al objeto del cuadro y al renderer. Otro cuadro, reanudar, otro paciente
  o perder la GPU lo borra. Volver al cuadro anterior no recupera mediciones descartadas.
  Redimensionar conserva los extremos en unidades de imagen y los vuelve a proyectar.
- Los gestos del calibre se consumen solo al editar, sobre la imagen congelada. Las flechas
  no desplazan simultáneamente el cine. No se requiere arrastre ni se mueve el transductor.
- Los píxeles y los metadatos de PNG se copian antes de esperar a la codificación del navegador.
  Recorrer el cine durante `toBlob` no modifica la captura que ya se está exportando.
- PNG contiene solo B, sin la línea selectora ni la tira M. El JSON declara `view: B` y
  `containsRawSignal: false`: no es DICOM, una señal cruda ni un archivo para reconstruir el paciente.
- La exportación usa el cuadro histórico mostrado, no los ajustes del equipo vivo. La descarga
  se forma en el navegador mediante un Blob; no se añade servidor, telemetría ni almacenamiento.
- Los errores de carga/exportación se muestran y se notifican al registro; el fallo del módulo
  diferido permite reintentar sin impedir la exploración B ni ocultar los errores de la consola.

## Interfaz y coste

La revisión se importa al congelar por primera vez. No añade controles durante la adquisición
viva, un store, otro reloj ni dependencias de producción. Mantiene un único par de extremos,
un canvas de superposición y copias temporales solo al exportar. El calibre se repinta cuando
cambian extremos, cursor o dimensiones, no por cada cuadro sin cambios.

El presupuesto de JavaScript inicial sigue en 260 KiB y el total en 820 KiB. `frozenReview`
tiene un techo propio de 24 KiB, se clasifica como diferido y sigue contando en el total.
La carga diferida real se comprueba mediante las peticiones del navegador.

## Verificación

`src/validation/manualDistance.test.ts`: unidades, cuerda convexa, simetría, coincidencia,
proyección en varias dimensiones/DPR, rechazo de no finitos y puntos fuera del sector,
pertenencia al cuadro, reinicio y copias sin alias.

`e2e/review.spec.ts`: descarga y lectura real de JSON/PNG, señal dentro de la imagen exportada,
metadatos históricos frente al estado vivo, geometría táctil, teclado sin conflicto con cine,
reflow a 320/390/720 px, conservación al redimensionar y borrado al cambiar de cuadro o reanudar.
Las capturas usan el prefijo `mmode-` para aprovechar el artefacto sintético existente de CI.
Se conservan las pruebas, límites, tolerancias y condiciones de integración anteriores.

La comprobación local aislada y el análisis de sintaxis no sustituyen a `npm run check` ni a
los recorridos GPU: la evidencia completa es la CI del SHA final. No se declara validación
manual en dispositivos físicos a partir de emulación o de una captura automática.

## Procedencia incremental

- `src/main.ts` continúa adaptado: conecta la revisión al cuadro mostrado después de cine y M.
- `tools/ci/bundle-budget.ts` continúa adaptado: clasifica el módulo de revisión cargado al
  congelar, conserva los límites globales y añade su presupuesto específico.
- `src/ui/review.ts`, `src/ui/frozenReview.ts`, `src/ui/review.css`,
  `src/measure/manualDistance.ts` y sus pruebas son integración propia.
- El controlador del cine, el renderer, la geometría del sector, los shaders y las constantes
  físicas se reutilizan sin modificación. No se declara sincronización nueva con VExUS.

## Límites

El decimal mostrado es formato de lectura, no exactitud física de 0,1 mm. La incertidumbre
depende del muestreo, PSF, escala y colocación manual. La distancia en una imagen con artefactos
no equivale necesariamente a distancia anatómica real. No mide automáticamente pleura, derrame
ni excursión, y no valida ninguna conclusión clínica. Solo se mantiene un calibre del cuadro
actual. M, anotaciones múltiples, DICOM y la reapertura de capturas no forman parte del alcance.
La compatibilidad con iPhone físico, VoiceOver y otras GPU necesita verificación específica.
