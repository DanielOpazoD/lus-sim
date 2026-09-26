# Estrategia de pruebas

Qué protege cada capa de pruebas, cuándo corre y qué no cubre. Regla general: una prueba debe fallar si
el comportamiento clínico o físico se rompe; una prueba que repite una constante o un umbral ajustado a
la salida actual no protege nada.

| Capa               | Dónde                                      | Cuándo corre                      | Qué protege                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias rápidas  | `src/validation/*.test.ts` sin marcador    | `npm test`, `check`, CI           | Núcleo (reloj, azar por semilla, unidades), evidencia de los parámetros, capas, documentación (rutas y scripts citados, enlaces a los documentos de tema) y bibliografía (citas que existen, entradas localizables y sin huérfanas), procedencia del código portado. |
| Lentas             | primera línea `// @tier slow`              | `npm run test:all`, `check`, CI   | (desde la fase 1) cadena completa del alumno, propiedades con fast-check, gemelos de la física.                                                                                                                                                                      |
| Cobertura          | `npm run test:coverage`                    | `check`, CI                       | Umbrales globales (≥ 90 % sentencias, ≥ 85 % ramas) que solo pueden subir; excluye lo que necesita DOM o WebGL.                                                                                                                                                      |
| e2e                | `e2e/*.spec.ts` (Playwright + SwiftShader) | `npm run e2e`, CI                 | Arranque sin errores y WebGL2; desde la fase 1, equivalencia TS ↔ GLSL y estadística del moteado.                                                                                                                                                                    |
| Procedencia        | `src/validation/provenance.test.ts`        | `npm test` (verdad solo en local) | La tabla de `docs/PROVENANCE.md` dice la verdad frente a los repos de origen; en CI, formato y existencia.                                                                                                                                                           |
| Banco de fidelidad | (fase 1–2) herramienta con GPU real        | a mano en cada PR de imagen       | Estadística de la imagen frente al banco de referencia real (fuera del repo, decisión 5): brillo de la pleura, decaimiento de las líneas A, ancho y contraste de las líneas B.                                                                                       |
| Prueba ciega       | (fase 2) mosaicos real/simulado            | al cerrar cada fase de imagen     | Que un observador experto no distinga la imagen simulada por un rasgo concreto; se registra el rasgo que la delata.                                                                                                                                                  |
| Casos clínicos     | (fase 4) cadena del alumno por caso        | `test:all`                        | Que el puntaje y el perfil medidos sobre la señal, con técnica correcta, caigan en lo que la bibliografía espera para el caso.                                                                                                                                       |

## Principios

- **Pipeline real**: las pruebas de regresión recorren el camino que usa la app, no una copia.
- **Técnica del operador**: la sonda se coloca como lo haría un alumno correcto, sin atajos que el
  alumno no tiene.
- **Mutación**: al añadir una guarda, se comprueba que falla con el defecto que pretende atrapar (las
  reglas de `evidence.test.ts` se prueban en los dos sentidos; la de procedencia, marcando «idéntico»
  un archivo adaptado).
- **Contraejemplos**: lo que fast-check encuentra se arregla o se documenta como `it.fails` enlazado a
  una limitación de `docs/LIMITATIONS.md`.
- **Semillas fijas**: fisiología, dispersores y fast-check son deterministas (`src/core/random.ts`).
- **Primero la prueba que falla**: una decisión de imagen planificada deja antes sus pruebas con
  `it.fails` y los umbrales del plan; el PR de la decisión las pasa a `it`.
- **Datos con la forma real**: las pruebas de regresión usan escenas y casos con la forma clínica real
  (lección de otros proyectos: una prueba con datos «limpios» dejó pasar dos regresiones clínicas).

## Invariantes previstas

Las de la guía (§18) entran como pruebas cuando llega su módulo; cada una con su mutación.
