## Qué cambia

<!-- Una o dos frases. Si toca física, anatomía o clínica: qué observable cambia y por qué. -->

## Decisión de diseño

<!-- Número de la entrada añadida o modificada en docs/DECISIONS.md, o «no aplica». -->

## Evidencia

<!-- Parámetros nuevos o cambiados: etiqueta (documentado, consenso, derivado, estimado, extrapolación) y claves de docs/REFERENCES.md. -->

## Cómo se verificó

- [ ] `npm run check` en verde (formato, lint, tipos, pruebas rápidas y lentas con cobertura, build, presupuesto)
- [ ] `npm run e2e` si toca GPU, UI o la cadena de imagen
- [ ] Verificado en vivo en el navegador (qué se miró: zona, profundidad, modo, captura)
- [ ] Si toca un archivo portado: `docs/PROVENANCE.md` actualizado y `npm run provenance` revisado
- [ ] Si añade una limitación o aproximación: `docs/LIMITATIONS.md` / `docs/APPROXIMATIONS.md`
- [ ] Revisión adversarial de contexto limpio (cambios de física, anatomía o clínica)
