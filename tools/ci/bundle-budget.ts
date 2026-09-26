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
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KB = 1024;
const BUDGETS: Array<[RegExp, number]> = [
  [/three.*\.js$/, 700 * KB],
  [/index-.*\.js$/, 180 * KB],
  [/\.css$/, 20 * KB],
  [/\.js$/, 120 * KB], // cualquier otro chunk
];
const TOTAL_JS_BUDGET = 200 * KB;
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
const rows: string[][] = [];
for (const f of files) {
  if (f.endsWith('.map')) continue;
  const size = statSync(join(dir, f)).size;
  if (f.endsWith('.js') && !TEST_ONLY.test(f)) totalJs += size;
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
  `${'total js'.padEnd(w)}  ${(totalJs / KB).toFixed(1).padStart(7)} kB  ${(TOTAL_JS_BUDGET / KB).toFixed(0).padStart(5)} kB  ${totalJs <= TOTAL_JS_BUDGET ? 'ok' : 'OVER'}`,
);
if (over || totalJs > TOTAL_JS_BUDGET) {
  console.error('bundle-budget: presupuesto superado');
  process.exit(1);
}
