# lus-sim — simulador de ecografía pulmonar

Simulador educativo de ecografía pulmonar (LUS) que corre entero en el navegador. La imagen no será un
vídeo ni un atlas de fotogramas: cada cuadro saldrá de una cadena causal —paciente virtual → anatomía y
fisiología → interacción acústica → señal → procesamiento del ecógrafo → imagen en modo B y M →
observables → puntaje— de modo que las líneas A y B, el deslizamiento, el punto pulmonar, la
consolidación o el derrame **emerjan** de la física y no se pinten.

> ### Aviso
>
> **No es un dispositivo médico y no debe usarse para decidir nada sobre un paciente real.** Todos los
> pacientes son sintéticos y paramétricos. El repositorio es público: no contiene, ni contendrá, datos
> ni imágenes de personas reales (decisión 5). Las limitaciones conocidas están en
> `docs/LIMITATIONS.md`.

Es el tercer simulador de una familia, junto a EchoTwin (ecocardiografía) y VExUS (Doppler venoso), y
nace preparado para unirse a ellos (decisión 1, `docs/UNIFICATION.md`): comparte la pila, las
convenciones y el motor de VExUS, portado con registro de procedencia.

## Estado (v0.1.0, fase 0 cerrada)

Cimientos terminados: repositorio, integración continua, misión y objetivos, documentos rectores,
base de conocimiento verificada y guardas automáticas. La fase 1 porta el motor de VExUS en tres pasos (decisión 10;
`docs/ROADMAP.md`). Sin publicar: el paso A porta la física en TypeScript, el B1 la pone al día con el main de VExUS
(decisión 11), el B2a forma la imagen del tórax en la GPU, igual a la de TypeScript y comprobada en la e2e
(decisión 12), y el B2b la muestra con una interfaz mínima del modo B (decisión 13): la primera imagen, con la
línea pleural, las líneas A, la sombra costal y el deslizamiento. La interfaz es mínima (`ui-minimal`) y el
tórax conserva la pared y las dimensiones heredadas de VExUS hasta el paso C.

Ya existe:

- el núcleo portado de VExUS: reloj único (`src/core/clock.ts`), azar reproducible por semilla
  (`src/core/random.ts`), unidades y vectores;
- el registro de evidencia de los parámetros (`src/core/evidence.ts`): cada número del modelo declara
  su valor, rango, tipo de evidencia y fuentes;
- (fase 1, paso A) el motor de VExUS en TypeScript con cortes para el tórax: el núcleo del paciente y el
  motor fisiológico (`src/physiology/engine.ts`), la escena del tórax (`src/anatomy/scene.ts`), la sonda con
  su contacto (`src/probe/contact.ts`) y la física de la imagen, con la pleura y sus líneas A
  (`src/ultrasound/pleura.ts`), probados con invariantes físicas (`src/validation/physicsInvariants.test.ts`)
  y con las metas de anatomía medidas (`src/validation/anatomyTargets.test.ts`);
- (fase 1, paso B2a) la formación de imagen en la GPU (`src/ultrasound/renderer.ts`) con la anatomía GLSL del tórax
  (`src/anatomy/gpu/anatomy.glsl.ts`) y el preajuste pulmonar (`src/ultrasound/lungPreset.ts`), probada en la e2e
  (`e2e/imagen.spec.ts`): equivalencia TS ↔ GLSL, moteado de Rayleigh y líneas A a múltiplos de la pleura;
- (fase 1, paso B2b) la aplicación (`src/main.ts`): la imagen a la vista con la sonda libre, los puntos de partida
  BLUE, la consola del equipo, el HUD y la recuperación de la pérdida del contexto WebGL (`e2e/smoke.spec.ts`);
- las guardas: capas (`src/validation/layers.test.ts`), documentación y bibliografía
  (`src/validation/docs.test.ts`), evidencia (`src/validation/evidence.test.ts`) y procedencia del código
  portado (`src/validation/provenance.test.ts`, `tools/provenance/drift.ts`).

## Principios

La misión y los objetivos que ordenan el trabajo están en `docs/MISSION.md`.

1. **Cuatro fidelidades, cada una con su prueba**: anatómica, física, ecográfica y clínica
   (`docs/GUIDE.md` §2).
2. **Tres estados separados**: el paciente (verdad latente), el estado físico y la señal adquirida.
   Una mala adquisición produce una mala imagen aunque el paciente esté bien definido.
3. **Un solo reloj** para la respiración, el latido, el deslizamiento, el pulso pulmonar y el modo M.
4. **Nada se asigna**: el patrón y el puntaje LUS se calculan sobre la señal, no se eligen.
5. **Ningún número sin evidencia**: documentado, de consenso, derivado o estimado con rango y plan de
   calibración.

## Uso

Requiere Node 22 o superior (`.nvmrc`: 24).

```bash
npm install
npm run dev          # servidor de desarrollo en http://localhost:6700
npm test             # pruebas rápidas
npm run test:all     # todas las pruebas (rápidas y lentas)
npm run check        # formato, lint, tipos, pruebas con cobertura, build y presupuesto (lo mismo que CI)
npm run e2e          # extremo a extremo con Playwright (necesita `npx vite build` antes)
npm run provenance   # deriva del código portado respecto de VExUS y EchoTwin
npm run docs:index   # regenera docs/DECISIONS_INDEX.md
npm run fidelity:ref # banco de fidelidad: mide el banco de referencia (fuera del repo) y escribe sus estadísticas
npm run fidelity:compare -- <informes de la e2e>  # la tabla simulador frente a la referencia
npm run fidelity:geometry -- --out <carpeta fuera del repo>  # propuestas de geometría y hojas de contacto
```

## Documentos

| Documento                | Qué contiene                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `docs/MISSION.md`        | Misión, objetivos medibles y cómo se prioriza: cada PR declara qué objetivo mueve.        |
| `docs/GUIDE.md`          | Guía de desarrollo: misión, principios, reglas de física y de proceso. Documento rector.  |
| `docs/KNOWLEDGE.md`      | Base de conocimiento: física, anatomía, fisiopatología y clínica con fuentes verificadas. |
| `docs/REFERENCES.md`     | Bibliografía con claves (`[@clave]` en los documentos, `sources` en el código).           |
| `docs/DECISIONS.md`      | Decisiones de diseño numeradas (índice en `docs/DECISIONS_INDEX.md`).                     |
| `docs/ARCHITECTURE.md`   | Tres estados, capas y reglas de dependencia.                                              |
| `docs/PROVENANCE.md`     | Código portado de VExUS y EchoTwin: origen, commit y estado.                              |
| `docs/UNIFICATION.md`    | Cómo se unirá con VExUS y EchoTwin y qué reglas lo hacen barato.                          |
| `docs/ROADMAP.md`        | Fases, entregables y criterios de cierre.                                                 |
| `docs/TESTING.md`        | Estrategia de pruebas.                                                                    |
| `docs/LIMITATIONS.md`    | Limitaciones conocidas, con identificador.                                                |
| `docs/APPROXIMATIONS.md` | Parámetros estimados pendientes de calibración.                                           |
| `docs/GLOSSARY.md`       | Términos clínicos, físicos y del código.                                                  |
| `CONTRIBUTING.md`        | Flujo de trabajo, commits, plantilla de decisión, publicación.                            |
| `CLAUDE.md`              | Guía para agentes.                                                                        |

## Licencia

MIT (`LICENSE`). Las imágenes o datos de terceros que alguna vez se incorporen llevarán su licencia y
atribución en un archivo propio.
