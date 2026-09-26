# Procedencia del código portado

Registro de todo lo que lus-sim tomó de VExUS o de EchoTwin (decisión 3). Es lo que permitirá
reconciliar los tres proyectos al unirlos (`docs/UNIFICATION.md`), así que tiene que decir la verdad:
`src/validation/provenance.test.ts` lo comprueba donde están los repos de origen.

Reglas:

- Un archivo portado conserva la ruta que tenía en su origen y se copia del commit fijado
  (`git show <commit>:<ruta>`), nunca del árbol de trabajo.
- Estado «idéntico»: byte a byte igual que el origen en ese commit. «adaptado»: cambiado a propósito;
  la columna «Cambios» dice qué y por qué.
- Quien edite un archivo «idéntico» cambia su fila a «adaptado» en el mismo commit. Una mejora que
  también sirva al origen se ofrece allí como PR.
- `npm run provenance` informa la diferencia local frente al commit fijado y los commits del origen
  posteriores a él (lo que el origen corrigió o mejoró desde la copia).

Orígenes: `vexus-sim` = github.com/DanielOpazoD/vexus-sim (carpeta hermana `../vexus-sim` o
`VEXUS_DIR`); `echotwin-tte` = github.com/DanielOpazoD/echotwin-tte (carpeta hermana
`../simuladorecocardiograma` o `ECHOTWIN_DIR`).

## Portado de VExUS

Commit fijado `52354d5` (main de vexus-sim, 26-09-2026, v0.5.0 + tren de fidelidad 66–75).

| Archivo                               | Origen                                                  | Estado   | Cambios                                                                                    |
| ------------------------------------- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `src/core/clock.ts`                   | `vexus-sim@52354d5:src/core/clock.ts`                   | idéntico | —                                                                                          |
| `src/core/random.ts`                  | `vexus-sim@52354d5:src/core/random.ts`                  | idéntico | —                                                                                          |
| `src/core/units.ts`                   | `vexus-sim@52354d5:src/core/units.ts`                   | idéntico | —                                                                                          |
| `src/core/vec3.ts`                    | `vexus-sim@52354d5:src/core/vec3.ts`                    | idéntico | —                                                                                          |
| `src/buildInfo.d.ts`                  | `vexus-sim@52354d5:src/buildInfo.d.ts`                  | idéntico | —                                                                                          |
| `src/validation/layers.test.ts`       | `vexus-sim@52354d5:src/validation/layers.test.ts`       | adaptado | Matriz propia: capas `lus` (en lugar de `vexus`) y `measure` (en lugar de `doppler`)       |
| `src/validation/docs.test.ts`         | `vexus-sim@52354d5:src/validation/docs.test.ts`         | adaptado | Añade bibliografía, citas `[@clave]`, enlaces del README y rutas de todos los documentos   |
| `src/validation/limitations.ts`       | `vexus-sim@52354d5:src/validation/limitations.ts`       | adaptado | Lista propia de limitaciones                                                               |
| `tools/docs/decisions-index.ts`       | `vexus-sim@52354d5:tools/docs/decisions-index.ts`       | idéntico | —                                                                                          |
| `tools/ci/release-notes.ts`           | `vexus-sim@52354d5:tools/ci/release-notes.ts`           | idéntico | —                                                                                          |
| `tools/ci/bundle-budget.ts`           | `vexus-sim@52354d5:tools/ci/bundle-budget.ts`           | adaptado | Presupuestos de la fase 0 y su historial propio                                            |
| `vite.config.ts`                      | `vexus-sim@52354d5:vite.config.ts`                      | adaptado | Sin minificador de GLSL (aún no hay shaders), puertos 6700/6709, `execFileSync`, cobertura |
| `playwright.config.ts`                | `vexus-sim@52354d5:playwright.config.ts`                | adaptado | Puerto 6709 y nunca reutiliza un servidor existente                                        |
| `tsconfig.json`                       | `vexus-sim@52354d5:tsconfig.json`                       | idéntico | —                                                                                          |
| `eslint.config.js`                    | `vexus-sim@52354d5:eslint.config.js`                    | idéntico | —                                                                                          |
| `.editorconfig`                       | `vexus-sim@52354d5:.editorconfig`                       | idéntico | —                                                                                          |
| `.prettierrc.json`                    | `vexus-sim@52354d5:.prettierrc.json`                    | idéntico | —                                                                                          |
| `.prettierignore`                     | `vexus-sim@52354d5:.prettierignore`                     | adaptado | Sin la línea base de fidelidad; ignora los informes de Playwright                          |
| `.nvmrc`                              | `vexus-sim@52354d5:.nvmrc`                              | idéntico | —                                                                                          |
| `.gitignore`                          | `vexus-sim@52354d5:.gitignore`                          | adaptado | Bloquea `referencia/` y `*.dcm` (decisión 5)                                               |
| `.githooks/pre-push`                  | `vexus-sim@52354d5:.githooks/pre-push`                  | adaptado | Comentario sin la duración de VExUS                                                        |
| `.github/workflows/ci.yml`            | `vexus-sim@52354d5:.github/workflows/ci.yml`            | adaptado | Trabajo `check` con ese nombre (lo exige la protección de `main`) y e2e en un fragmento    |
| `.github/workflows/release.yml`       | `vexus-sim@52354d5:.github/workflows/release.yml`       | adaptado | Nombre del paquete de la release                                                           |
| `.github/dependabot.yml`              | `vexus-sim@52354d5:.github/dependabot.yml`              | idéntico | —                                                                                          |
| `.github/pull_request_template.md`    | `vexus-sim@52354d5:.github/pull_request_template.md`    | adaptado | Añade evidencia, procedencia y revisión adversarial                                        |
| `.github/ISSUE_TEMPLATE/config.yml`   | `vexus-sim@52354d5:.github/ISSUE_TEMPLATE/config.yml`   | idéntico | —                                                                                          |
| `.github/ISSUE_TEMPLATE/fidelidad.md` | `vexus-sim@52354d5:.github/ISSUE_TEMPLATE/fidelidad.md` | adaptado | Ecografía pulmonar y aviso de repositorio público                                          |
| `CONTRIBUTING.md`                     | `vexus-sim@52354d5:CONTRIBUTING.md`                     | adaptado | Reglas y ámbitos de lus-sim                                                                |
| `CLAUDE.md`                           | `vexus-sim@52354d5:CLAUDE.md`                           | adaptado | Reglas de lus-sim: nada pintado, procedencia, datos, máquina compartida                    |

## Portado de EchoTwin

Aún nada. Candidatos, con la fase en que se portarían (EchoTwin es público; rutas del origen):

| Pieza                                                             | Origen                                                                                    | Fase | Motivo                                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| Generador ts2glsl y su prueba                                     | `echotwin-tte:tools/glsl/ts2glsl.ts`, `glslGenerated.test.ts`                             | 2    | Física escalar propia escrita una vez (decisión 8), con prototipos, `**` y constantes de Math |
| Guarda de niveles de prueba                                       | `echotwin-tte:src/tests/testTiers.test.ts`                                                | 1    | Un módulo pesado obliga a declarar `// @tier`                                                 |
| Espera de carga antes de la e2e                                   | `echotwin-tte:e2e/globalSetup.ts`                                                         | 1    | Esta máquina corre varias sesiones; con carga alta las e2e no se pueden interpretar           |
| Tablas de física verificadas                                      | `echotwin-tte:src/tests/physicsDocs.test.ts`                                              | 1–2  | Los números de los documentos de física se contrastan con el código                           |
| Desviaciones declaradas con línea base                            | `echotwin-tte:tools/docs/known-sets.ts`, `limitationsConsistency.test.ts`                 | 2    | Lo que difiere de la referencia real se declara y falla si mejora o empeora sin declararlo    |
| Estadística de imagen sin etiquetas, discriminador y prueba ciega | `echotwin-tte:src/clinical/sectorStats.ts`, `tools/clinical/{discriminate,blind-test}.ts` | 2    | Patrón de CAMUS generalizado a sonda lineal y convexa y a métricas pulmonares                 |
| Método de fidelidad                                               | `echotwin-tte:.claude/skills/fidelity-method/SKILL.md`                                    | 1    | 20 reglas nacidas de errores reales, adaptadas al pulmón                                      |

No se portan: el tórax como mapa de alturas anterior (sin caras lateral ni posterior), las costillas de
sección circular con oblicuidad lineal, la pleura temporizada desde la primera muestra de pulmón ni la
tira del modo M por fase cardíaca (el modo M pulmonar depende del tiempo respiratorio).
