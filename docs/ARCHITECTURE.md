# Arquitectura

## Tres estados (guía §3, decisión 6)

| Capa                    | Módulos (actuales y previstos) | Qué contiene                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado del paciente** | `physiology/` (fase 1)         | La verdad latente: respiración (patrón, frecuencia, volumen corriente, ventilación espontánea o mecánica, PEEP), ritmo cardíaco, estado regional del pulmón (aireación, agua intersticial, llenado alveolar), espacio pleural (aire, líquido, adherencias), pared torácica y hábito. No contiene ningún puntaje. |
| **Estado físico**       | `physiology/`, `anatomy/`      | La geometría del tórax y del pulmón en el instante del reloj: superficie pleural, campo de deslizamiento, borde de un neumotórax, líquido, y las propiedades acústicas de cada punto.                                                                                                                            |
| **Señal adquirida**     | `probe/`, `ultrasound/`        | Lo que la sonda, el haz, la transmisión, el foco, la ganancia, los armónicos, la composición y la presentación producen. Puede ser incorrecta con un paciente perfectamente definido.                                                                                                                            |
| **Observables**         | `measure/` y `lus/`            | Lo medido sobre la señal adquirida (líneas B, confluencia, consolidación, deslizamiento en modo M) y las reglas clínicas puras que lo convierten en puntaje y perfil.                                                                                                                                            |

La medición sobre la señal adquirida y la verdad latente comparten las reglas clínicas de `lus/` pero
nunca se mezclan: el modo docente muestra ambas.

## Reglas de dependencia

Matriz completa en `src/validation/layers.test.ts` (`ALLOWED`); cualquier import fuera de ella falla la
suite, incluidos los dinámicos y los de efecto lateral. Las capas compartidas con VExUS tienen sus mismas
reglas (decisión 1).

```
core ← physiology ← anatomy ← probe ← ultrasound ← measure
             ↑  ↖ cases                              ↙
            lus (reglas clínicas puras) ←───────────
app (orquesta todo el motor) ← ui (vistas) ← main
```

`lus` ocupa el lugar de `vexus` y `measure` el de `doppler` en VExUS: la medición lee la imagen y aplica
las reglas puras; las reglas nunca ven la imagen.

## Carpetas

| Carpeta               | Estado | Contenido                                                                                                                                                 |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`           | fase 0 | Reloj único (`src/core/clock.ts`), azar por semilla (`src/core/random.ts`), unidades, vectores, registro de evidencia (`src/core/evidence.ts`).           |
| `src/validation/`     | fase 0 | Pruebas y registros que usan las pruebas: capas, documentación, evidencia, procedencia, limitaciones (`src/validation/limitations.ts`).                   |
| `src/main.ts`         | fase 0 | Punto de entrada; hoy solo presenta el proyecto y comprueba WebGL2.                                                                                       |
| `src/physiology/`     | fase 1 | Estado del paciente y modelo respiratorio (portado de VExUS y ampliado con el estado pulmonar).                                                           |
| `src/anatomy/`        | fase 1 | Primitivas, tejidos, caras de interfaz, módulos de órgano (pared, costillas, pleura, pulmón) con gemelos TS/GLSL.                                         |
| `src/probe/`          | fase 1 | Sonda de 6 grados de libertad, contacto y compresión.                                                                                                     |
| `src/ultrasound/`     | fase 1 | Formación de imagen: haz, moteado anclado, transmisión, pleura y reverberaciones, grafo de pasadas WebGL2.                                                |
| `src/measure/`        | fase 2 | Detección de líneas B, modo M, consolidación; control de calidad de la adquisición.                                                                       |
| `src/lus/`            | fase 4 | Zonas, puntaje LUS, perfiles BLUE, a partir de observables.                                                                                               |
| `src/cases/`          | fase 4 | Pacientes virtuales parametrizados.                                                                                                                       |
| `src/app/`, `src/ui/` | fase 1 | Sesión de simulación, equipo por comandos, interfaz.                                                                                                      |
| `tools/`              | fase 0 | Índice de decisiones (`tools/docs/decisions-index.ts`), presupuesto de bundle, notas de release, deriva del código portado (`tools/provenance/drift.ts`). |

## Frontera con VExUS y EchoTwin

Lo portado conserva su ruta de origen y su fila en `docs/PROVENANCE.md`. Lo propio de lus-sim vive en
archivos nuevos (módulos de órgano del pulmón, física subpleural, `measure/`, `lus/`), de modo que al
unir los proyectos se reconcilia lo portado y se trae lo propio sin separarlo de nada
(`docs/UNIFICATION.md`).
