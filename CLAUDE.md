# Guía para agentes y colaboradores

Simulador de ecografía pulmonar: cadena causal paciente → anatomía y fisiología → interacción acústica →
señal → imagen (modo B y M) → observables → puntaje. Lee primero `README.md`, `docs/GUIDE.md` (documento
rector), `docs/ARCHITECTURE.md` y `docs/TESTING.md`; la física y la clínica están en `docs/KNOWLEDGE.md`.

## Antes de terminar un cambio

- `npm run check > /tmp/lus-check.log 2>&1; echo EXIT $?` — nunca `npm run check | grep`: cuenta el
  código de salida.
- `npm run e2e` si tocas GPU, UI o la cadena de imagen (necesita `npx vite build` antes). Puerto 6709.
- Decisión nueva → `docs/DECISIONS.md` con la plantilla de `CONTRIBUTING.md` y `npm run docs:index`.
- Aproximación o limitación nueva → `docs/APPROXIMATIONS.md` / `docs/LIMITATIONS.md` (las limitaciones
  con id en `src/validation/limitations.ts`).
- Número nuevo en la física, la anatomía o la clínica → `defineParameters` (`src/core/evidence.ts`) con
  fuentes de `docs/REFERENCES.md`, y el conjunto registrado en `src/validation/parameterSets.ts`.

## Reglas que se rompen fácil

1. **Nada se pinta.** Ni líneas B como textura, ni modo M como animación aparte, ni puntaje elegido por
   el caso: todo sale de la física y se mide sobre la señal (`docs/GUIDE.md` §5 y §20).
2. **Un solo reloj** (`src/core/clock.ts`): la respiración, el latido, el deslizamiento y el modo M
   derivan de él.
3. **Código portado** (`docs/PROVENANCE.md`): no se edita un archivo portado sin actualizar su fila
   («idéntico» → «adaptado» y qué cambió). `npm run provenance` informa la deriva y la suite comprueba
   que la tabla no miente. Una mejora a un archivo portado se ofrece de vuelta a su origen (VExUS o
   EchoTwin).
4. **Sin datos de pacientes**: el repo es público. El banco de referencia de imágenes vive fuera del
   repo (`docs/DECISIONS.md`, decisión 5); en el repo solo entran estadísticas derivadas y citas.
5. **Capas**: `src/validation/layers.test.ts` fija las fronteras; las compartidas con VExUS tienen sus
   mismas reglas.
6. **Ningún fallo silencioso**: todo `catch` informa con su origen.

## Máquina compartida

En este Mac corren también VExUS (6600/6609), EchoTwin (654x, 4191) y otros proyectos. Si la carga es
alta, las pruebas con plazo pueden caer por tiempo: repetir solas antes de culpar al código. No tocar
los repos hermanos salvo para leer (el origen se lee con `git show <commit>:<ruta>`).

## Flujo de trabajo

Ramas `feat/…`, `fix/…`, `docs/…`, `test/…`, `chore/…`; Conventional Commits en español; PR con la
plantilla; squash-merge con CI en verde (`check` + `e2e`). Revisión adversarial de contexto limpio antes
de integrar cambios de física, anatomía o clínica.
