# Cómo contribuir

## Arquitectura git

```
main ──●──●──●──●──●──●──►   siempre verde; solo recibe merges de PR con CI en verde
        \      /   \    /
         ●──●──     ●──●      ramas cortas: feat/…, fix/…, docs/…, chore/…
```

- **`main`** es la única rama larga. Cada commit de `main` pasa `npm run check` (lo ejecuta también CI
  en `.github/workflows/ci.yml`). No se empuja directamente a `main`.
- **Ramas de trabajo** cortas con prefijo por intención: `feat/`, `fix/`, `docs/`, `chore/`, `perf/`,
  `test/`. Ejemplo: `feat/lineas-b-trampas-subpleurales`.
- **Pull request** por cada rama, con la plantilla (`.github/pull_request_template.md`): qué cambia,
  número de decisión, evidencia de los parámetros y cómo se verificó. Se integra con _squash_.
- **Etiquetas** `vN.N.N` en `main` al cerrar una fase (`docs/ROADMAP.md`); `CHANGELOG.md` la resume.

## Mensajes de commit

[Conventional Commits](https://www.conventionalcommits.org/es/) en español, tiempo presente:

```
feat(ultrasound): líneas B desde las trampas acústicas subpleurales
fix(anatomy): espacios intercostales anteriores con el ancho documentado
docs: decisiones 7–9 y cierre de la fase 1
test(lus): puntaje por zona frente a la verdad latente
chore(ci): e2e en dos fragmentos
```

Ámbitos: `core`, `physiology`, `anatomy`, `probe`, `ultrasound`, `lus`, `cases`, `app`, `ui`, `tools`,
`ci`, `docs`.

## Antes de abrir un PR

```bash
npm run check
```

Ejecuta formato, lint, tipos, **todas** las pruebas (rápidas y lentas) con umbrales de cobertura, build
y presupuesto de bundle. No se acepta `npm run check | grep …`: el código de salida es lo que cuenta.
Si el cambio toca la imagen, además `npm run e2e`.

## Reglas del proyecto (resumen de `docs/DECISIONS.md`)

1. **Nada asigna un patrón ni un puntaje**: emergen de la señal adquirida. Un PR que «pinte» un
   hallazgo se rechaza.
2. **Un solo reloj** (`src/core/clock.ts`); todo lo temporal deriva de él.
3. **Ningún número sin evidencia**: `defineParameters` con etiqueta, rango y fuentes; lo estimado
   figura en `docs/APPROXIMATIONS.md` con su plan de calibración.
4. **Código portado con procedencia**: toda copia de VExUS o EchoTwin tiene su fila en
   `docs/PROVENANCE.md`, y todo cambio a ella la actualiza.
5. **Decisiones numeradas, nunca renumeradas** (`docs/DECISIONS.md`); una decisión superada se marca
   `[Estado: superada por N]` y `npm run docs:index` regenera el índice (CI lo comprueba).
6. **Limitaciones con id** (`src/validation/limitations.ts` ↔ `docs/LIMITATIONS.md`): se añade o se
   borra en ambos sitios en el mismo cambio.
7. **Capas**: `src/validation/layers.test.ts` fija las fronteras; la lista de ciclos aceptados solo
   puede encoger.
8. **Sin datos de pacientes** en el repo, en issues ni en PR: es público.

## Pruebas

- Rápidas por defecto (`npm test`). Una prueba cuya primera línea es `// @tier slow` sale de la suite
  rápida y entra en `test:slow` / `test:all`.
- Sin WebGL ni DOM en las pruebas unitarias: lo físico se prueba en TypeScript puro. Lo que solo el
  navegador puede ver va en `e2e/` (Playwright + SwiftShader).
- Los umbrales de una aserción se justifican en un comentario (qué observable, de dónde sale).
- Al añadir una guarda, se comprueba que falla con el defecto que pretende atrapar (mutación).

## Estilo

`.editorconfig` (2 espacios, LF, UTF-8), `eslint` estricto con información de tipos y `prettier`
(`npm run format`). Nombres de dominio en español; identificadores de código en inglés cuando son
términos técnicos de programación (como en VExUS, para facilitar la unión); comentarios en español.

## Publicar una versión

1. Mueve lo de «Sin publicar» del `CHANGELOG.md` a `## [X.Y.Z] — fecha — resumen` y sube `version` en
   `package.json` (PR `chore(release): X.Y.Z`).
2. Tras el merge: `git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`.
3. `release.yml` comprueba que el tag coincide con `package.json`, construye, adjunta el `dist` en zip
   y usa la sección del CHANGELOG como notas.

## Herramientas locales

- `npm install` activa el hook `.githooks/pre-push` (tipos y pruebas rápidas antes de empujar).
- Dependabot abre cada lunes una PR agrupada por ecosistema; entra si CI está en verde.

## Plantilla de decisión

```markdown
## N. Título en una línea

**Contexto.** Qué problema o evidencia la motiva (con cifras o la prueba que falló).
**Opciones.** Alternativas consideradas y por qué no.
**Decisión.** Qué se hace, con los nombres de código y archivos.
**Consecuencias.** Qué cambia para el alumno, el rendimiento y las pruebas; qué queda pendiente.
**Verificación.** Qué prueba lo protege (y, si es una guarda, cómo se comprobó que falla sin el cambio).
```
