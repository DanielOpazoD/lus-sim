# Unión con VExUS y EchoTwin

lus-sim nace separado (decisión 1), pero con el destino de unirse a VExUS y EchoTwin en un simulador
de ecografía multiórgano: un mismo paciente virtual visto desde el corazón, las venas y el pulmón.
Este documento dice qué reglas hacen barata esa unión hoy y qué quedará por decidir entonces.

## Por qué unirlos

- **Un solo paciente, tres ventanas**: la congestión izquierda (EchoTwin: presiones de llenado), la
  derecha (VExUS: presión auricular derecha y Doppler venoso) y la pulmonar (líneas B) son la misma
  fisiología. Casos como la insuficiencia cardiaca descompensada, la falla del VD o el SDRA solo son
  coherentes si los tres simuladores leen el mismo estado.
- **Un solo motor de imagen**: la pleura, la pared y el moteado mejoran una vez para los tres.
- **Un puente al ventilador**: el simulador del R860 comparte la mecánica respiratoria que mueve el
  pulmón (PEEP, volumen corriente, reclutamiento).

## Reglas que se cumplen desde hoy

1. **Misma pila y convenciones que VExUS** (decisión 2): mismos nombres de capas, de documentos y de
   herramientas.
2. **Procedencia** (decisión 3): cada archivo portado conserva su ruta y su fila en
   `docs/PROVENANCE.md`; `npm run provenance` mide la deriva.
3. **Capas compartidas con las mismas reglas** (`src/validation/layers.test.ts`): lo propio del pulmón
   vive en archivos nuevos (módulos de órgano, física subpleural, `measure/`, `lus/`).
4. **Contratos del paciente y del reloj**: el estado pulmonar se define como una parte separada del
   estado del paciente, con unidades del motor y sin referencias a la imagen, para que el paciente común
   lo incorpore sin traducirlo. El reloj es el mismo `SimulationClock`.
5. **Evidencia y documentación con el mismo formato** (decisión 4): la bibliografía con claves y las
   decisiones numeradas se pueden fusionar con un prefijo por módulo.

## Qué quedará por decidir al unir

- **Dónde vive el resultado**: un monorepo nuevo con paquetes (motor, módulos cardíaco, venoso y
  pulmonar) o uno de los tres repos que absorbe a los otros.
- **Marco y unidades**: lus-sim y VExUS comparten mm y un marco levógiro con origen en el xifoides
  (decisión 7); EchoTwin usa cm, un marco dextrógiro y origen en la piel sobre el esternón. Hará falta
  una conversión con su prueba.
- **Hilos**: EchoTwin corre el núcleo en un Web Worker con `OffscreenCanvas`; VExUS y lus-sim, en el
  hilo principal.
- **La pila de la interfaz**: EchoTwin usa React; VExUS y lus-sim, DOM sin framework.
- **La generación de GLSL**: EchoTwin genera el GLSL escalar desde TypeScript (ts2glsl); VExUS escribe
  gemelos a mano; lus-sim usa ambos (decisión 8).
- **El modelo del paciente común**: qué contrato fisiológico une presión auricular izquierda,
  presión auricular derecha, agua pulmonar extravascular y mecánica respiratoria.
- **La numeración de decisiones y limitaciones**: prefijo por módulo o numeración nueva.

## Pasos previstos al unir

1. Congelar los tres repos en un commit y medir la deriva de todo lo portado (`npm run provenance`).
2. Reconciliar cada archivo portado con su origen (trayendo las mejoras de ambos lados).
3. Traer lo propio de cada módulo sin cambiarlo.
4. Unir los contratos del paciente y del reloj detrás de una prueba de coherencia entre módulos (el
   mismo caso produce hallazgos coherentes en los tres).
