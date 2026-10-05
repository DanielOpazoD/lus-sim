// Presupuesto de tamaño del bundle (práctica de EchoTwin y VExUS; adaptado de vexus-sim, docs/PROVENANCE.md, con
// presupuestos propios). Regla: un presupuesto solo se sube a propósito, en el mismo cambio que explica
// el crecimiento, y el motivo queda anotado aquí con la medida. Se ejecuta tras `vite build` y falla si
// algún activo lo supera.
// 2026-09-26: fase 0 (sin motor): index ≈ 2 kB. Presupuestos de partida ajustados a la fase 0; el motor
// portado de VExUS en la fase 1 los subirá con su medida (en vexus-sim el index ronda 284 kB, main 007204e).
// 2026-09-26 (origen 8e83d9a, decisión 11): como en VExUS, los chunks que un usuario nunca descarga (los ganchos
// de prueba, `testHooks`, solo con `?e2e` o en desarrollo) salen del JS total y conservan su límite por chunk.
// Aún no hay ninguno: llegan con la app en el paso B2. Los límites no cambian.
// 2026-09-26 (paso B2a, decisión 12): la formación de imagen en la GPU portada de VExUS (renderizador, grafo de
// pasadas, cine y modo M, el GLSL de las pasadas y de la anatomía del tórax, que viaja como texto en el chunk
// principal tras quitarle comentarios y renombrarlo, y los módulos gemelos que usa en tiempo de ejecución) lleva
// index de ≈ 2 a 148,5 kB (vite build sobre main a647cb1; VExUS, con el color, el Doppler, el hígado y el riñón,
// ronda 300 kB). index sube a 160 kB; el paso B2b (la interfaz) lo vuelve a medir. `testHooks` mide 18,1 kB.
// 2026-09-26 (paso B2b, decisión 13): la aplicación y su interfaz mínima (raíz de composición, sesión, consola,
// entrada de la sonda, HUD, atajos, tarjetas, cine y diagnóstico) llevan index de 148,4 a 172,5 kB (vite build); la hoja de
// estilos va en su propio archivo (9,4 kB) y `testHooks` baja a 15,6 kB (comparte ahora módulos con index). index
// sube a 180 kB.
// 2026-09-26 (origen c6c81ad, decisión 14): el build quita además los espacios y los saltos de línea que no separan
// nada del texto GLSL (`tools/build/glslCompact.ts`, tercera etapa de `glslMinify.ts`, #100 de VExUS): index baja de
// 172,5 a 163,5 kB (176 622 → 167 443 B, vite build sobre main 8ed8a6d). Los límites no cambian.
// 2026-09-26 (paso C1, decisión 16): la parrilla costal del adulto promedio (`anatomy/organs/ribcage.ts`: su construcción,
// sus ~40 parámetros con su evidencia y su gemelo GLSL, que entra en cada programa con la anatomía), las líneas del tórax
// y el cartílago llevan index de 163,5 a 186,8 kB. index sube a 195 kB; el total de JS (200 kB) no cambia.
// 2026-09-27 (paso C2, decisión 17): la pared torácica por región (`anatomy/organs/chestWall.ts`: sus ~25 parámetros con su
// evidencia, la tabla y su gemelo GLSL) y las capas por región de la pared, el contacto y la clasificación llevan index de
// 187,7 a 203,4 kB. index sube a 210 kB y el total de JS a 215.
// 2026-09-27 (paso C3, decisión 18): los bordes del pulmón y el corazón (`anatomy/organs/lungBorder.ts` y `heart.ts`: sus
// ~30 parámetros con su evidencia, ≈ 13 kB de notas, sus tablas y sus gemelos GLSL), la cortina de los dos lados y la ZOA
// llevan index de 205,3 a 221,8 kB. index sube a 230 kB y el total de JS a 235.
// 2026-09-27 (ciclo 2, decisión 20): la costilla que apaga la pleura (la lente de fase en TS y en las dos GLSL de A, la
// costilla de A0, el pedestal por la apertura de la línea, `ultrasound/boneTransmission.ts` con la evidencia de sus dos
// parámetros, la ganancia del preajuste y los gemelos de las paridades, que viven en módulos que el renderizador importa)
// llevan index de 226,6 a 235,7 kB. index sube a 240 kB y el total de JS a 245.
// 2026-09-27 (decisión 22): el campo respiratorio invertible (la bisección y la pared que mira el campo, en TS y GLSL) y la
// evidencia de sus parámetros (`physiology.diaphragmExcursion`, `anatomy.respiratoryWall`, las notas de los derivados de la
// excursión) llevan index de 235,7 a 240,4 kB. index sube a 245 kB y el total de JS a 250.
// 2026-09-28 (decisión 23): adquisición con controles contextuales e historial espacial, más navegador 3D diferido.
// Primer build medido: entrada 245,3 KiB y thorax 529,6 KiB (incluye Three.js 0.186.1; 133,5 KiB gzip).
// El núcleo tiene 260 KiB de presupuesto INICIAL; el módulo opcional 560 KiB. El total de 820 KiB cuenta ambos:
// cargar tarde no borra el coste de descarga. El navegador solo se solicita después de la primera imagen modo B.
// Revisión del cuadro (docs/REVIEW.md): frozenReview se solicita al congelar por primera vez, no al iniciar.
// Tiene un techo propio de 24 KiB y siempre cuenta en el total. Se conservan los límites inicial (260 KiB)
// y total (820 KiB); la clasificación diferida no permite ocultar el coste de descarga.
// 2026-10-01 (decisión 26): la cobertura de exploración (`app/coverage.ts`) solo la usa el informe técnico, que la importa al
// pedirlo: chunk diferido de 6,2 kB, que cuenta en el total (809,5 kB). La entrada queda en 258,9 kB (con el chunk compartido
// del contacto) frente a 263,8 si la cobertura entraba en ella. Los límites no cambian.
// 2026-10-01 (decisión 27): la cúpula pleural (`anatomy/organs/lungApex.ts`) y la clavícula (en la parrilla), con sus
// parámetros y su evidencia (≈ 4,5 kB de notas) y sus gemelos GLSL en cada programa, llevan la entrada de 258,9 a 266,2 kB y el
// total de 812,1 a 818,3. La entrada sube a 270 kB y el total a 830.
// 2026-10-02 (decisión 29): la posición del paciente, la escápula, las apófisis espinosas y la espalda alta, con su evidencia,
// llevaban la entrada (con el chunk compartido del contacto) de 269,4 a 284,1 kB y el total a 835,8. Las notas de evidencia de los
// parámetros, ≈ 36 kB del bundle que la aplicación no lee, salen del build (`tools/build/evidenceNotes.ts`): la entrada queda en
// 249,0 kB y el total en 800,4. Los límites no cambian.
// 2026-10-03 (decisión 37): el hígado y el bazo (sus módulos, sus gemelos GLSL en cada programa que clasifica y la medida del
// espejo en los ganchos) llevan la entrada de 254,7 a 269,0 kB y el total de 808,0 a 822,8, a 1 kB del techo. La entrada y el
// inicial suben a 280 kB y el total a 840.
// 2026-10-03 (decisión 43): el estómago, los riñones (portados de VExUS, con sus pirámides y su grasa) y el retroperitoneo, con
// sus gemelos GLSL y la medida del gas en los ganchos, llevan la entrada de 269,8 a 292,0 kB y el total de 823,6 a 846,2. La
// entrada y el inicial suben a 300 kB y el total a 860.
// 2026-10-04 (decisión 44): la ladera de la cúpula pleural sin esquina (`anatomy/organs/lungApex.ts`, con su gemelo GLSL en
// cada programa que clasifica, y el techo de la distancia a la frontera) lleva la entrada de 299,9 a 300,6 kB y el total de
// 854,8 a 855,5. La entrada y el inicial suben a 310 kB y el total a 870: lo siguiente en la cola (los vasos del hilio
// esplénico y renal) también va en cada programa.
// 2026-10-04 (decisión 49): el corazón de EchoTwin (el modelo, la pose de telediástole, el clasificador portados, ≈ 5000 líneas de
// TS, y el programa que hornea su volumen en la GPU, `ultrasound/heartBake.ts`) va en su propio chunk, `cardiacRuntime` (105,7 kB,
// `app/cardiacRuntime.ts`), que la aplicación pide después de construir la sesión (el primer cuadro es el BLUE superior derecho, sin
// corazón a la vista): diferido. La entrada con el chunk compartido que separa Rollup pasa de 302,5 a 309,9 kB (la lectura del
// volumen en cada programa, la carga y el horneado por pasos que el renderizador lleva); el total, de 857,3 a 971,7. La entrada
// y el inicial no cambian; el total sube a 980.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KB = 1024;
const BUDGETS: Array<[RegExp, number]> = [
  [/^thorax-.*\.js$/, 560 * KB],
  [/^frozenReview-.*\.js$/, 24 * KB],
  [/index-.*\.js$/, 310 * KB],
  [/\.css$/, 20 * KB],
  [/\.js$/, 120 * KB], // cualquier otro chunk
];
const INITIAL_JS_BUDGET = 310 * KB;
const TOTAL_JS_BUDGET = 980 * KB;
const DEFERRED_JS = /^(?:thorax|frozenReview|coverage|cardiacRuntime)-.*\.js$/;
/** Chunks que un usuario nunca descarga (solo `?e2e` o desarrollo): fuera del total, con su límite por chunk. */
const TEST_ONLY = /^testHooks-.*\.js$/;

const dir = join(process.cwd(), 'dist', 'assets');
let files: string[];
try {
  files = readdirSync(dir);
} catch {
  console.error('bundle-budget: no existe dist/assets — ejecuta `vite build` antes');
  process.exit(1);
}
let over = false;
let totalJs = 0;
let initialJs = 0;
const rows: string[][] = [];
for (const f of files) {
  if (f.endsWith('.map')) continue;
  const size = statSync(join(dir, f)).size;
  if (f.endsWith('.js') && !TEST_ONLY.test(f)) {
    totalJs += size;
    if (!DEFERRED_JS.test(f)) initialJs += size;
  }
  const budget = BUDGETS.find(([re]) => re.test(f));
  const max = budget ? budget[1] : Infinity;
  const ok = size <= max;
  if (!ok) over = true;
  rows.push([
    TEST_ONLY.test(f) ? `${f} (solo pruebas)` : f,
    `${(size / KB).toFixed(1)} kB`,
    Number.isFinite(max) ? `${(max / KB).toFixed(0)} kB` : '—',
    ok ? 'ok' : 'OVER',
  ]);
}
const w = rows.reduce((m, r) => Math.max(m, r[0].length), 10);
for (const r of rows) console.log(`${r[0].padEnd(w)}  ${r[1].padStart(10)}  ${r[2].padStart(8)}  ${r[3]}`);
console.log(
  `${'js inicial'.padEnd(w)}  ${(initialJs / KB).toFixed(1).padStart(7)} kB  ${(INITIAL_JS_BUDGET / KB).toFixed(0).padStart(5)} kB  ${initialJs <= INITIAL_JS_BUDGET ? 'ok' : 'OVER'}`,
);
console.log(
  `${'total js'.padEnd(w)}  ${(totalJs / KB).toFixed(1).padStart(7)} kB  ${(TOTAL_JS_BUDGET / KB).toFixed(0).padStart(5)} kB  ${totalJs <= TOTAL_JS_BUDGET ? 'ok' : 'OVER'}`,
);
if (over || initialJs > INITIAL_JS_BUDGET || totalJs > TOTAL_JS_BUDGET) {
  console.error('bundle-budget: presupuesto superado');
  process.exit(1);
}
