# Bibliografía

Una entrada por línea: «- `clave` — referencia completa», con DOI, PMID o URL y si se leyó el texto
completo o solo el resumen. Los documentos citan con `[@clave]`; el código, en el campo `sources` de
`defineParameters` (`src/core/evidence.ts`). `src/validation/docs.test.ts` exige que toda cita exista
aquí y que cada entrada sea localizable.
