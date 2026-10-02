import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { evidenceNotes } from './tools/build/evidenceNotes';
import { glslMinify } from './tools/build/glslMinify';

/**
 * Niveles de prueba (práctica de EchoTwin y VExUS): un archivo cuya PRIMERA línea es
 * `// @tier slow` queda fuera de `npm test` y entra en `test:slow` / `test:all`.
 * Así una prueba pesada no se cuela en la suite rápida por omisión.
 */
// Relativo a este archivo, no al cwd: el servidor puede arrancar desde otro directorio
const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ROOT, 'src');
function testFilesWithMarker(marker: string, dir = SRC_DIR): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...testFilesWithMarker(marker, p));
    else if (/\.test\.ts$/.test(f) && readFileSync(p, 'utf8').split('\n')[0].trim() === marker) out.push(p);
  }
  return out;
}
const SLOW = testFilesWithMarker('// @tier slow');

/** Versión y commit del build, visibles en la app. */
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'desconocido';
  }
}
const tier = process.env['VITEST_TIER'] ?? 'fast';

export default defineConfig({
  // el texto de los shaders sin comentarios, sangría, nombres largos ni espacios de más en el build (tools/build/glslMinify.ts);
  // y sin las notas de evidencia de los parámetros, que la aplicación no lee (tools/build/evidenceNotes.ts, decisión 29)
  plugins: [glslMinify(), evidenceNotes()],
  define: {
    __APP_VERSION__: JSON.stringify(PKG.version),
    __GIT_COMMIT__: JSON.stringify(process.env['GITHUB_SHA']?.slice(0, 7) ?? gitCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // 6700/6709: fuera de los puertos de VExUS (6600/6609) y EchoTwin (654x, 4191), que corren en la misma máquina
  server: { port: 6700, strictPort: true },
  preview: { port: 6709, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: tier === 'slow' ? SLOW : ['src/**/*.test.ts'],
    exclude: tier === 'fast' ? ['node_modules/**', ...SLOW] : ['node_modules/**'],
    environment: 'node',
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Solo se excluye lo que necesita DOM o WebGL (lo cubre la e2e), como en VExUS; los módulos puros de
      // ultrasound/ (haz, sector, transmisión, pasadas como datos) sí cuentan. Las herramientas de tools/ se prueban
      // desde src/validation, pero no cuentan para la cobertura
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        'src/ui/**',
        'src/**/*.d.ts',
        'src/ultrasound/renderer.ts',
        'src/ultrasound/gl.ts',
        'src/ultrasound/shaders/**',
        'src/app/devtools.ts',
        'src/app/testHooks.ts', // ganchos de la e2e (la ejecuta Playwright)
        'src/app/fidelityBench.ts', // el banco de fidelidad del simulador, un gancho de la e2e (decisión 21)
        'src/app/lungPulseBench.ts', // el pulso pulmonar en el modo M y su gemelo GLSL, un gancho de la e2e (decisión 32)
        'src/app/session.ts', // construye el Simulator sobre un canvas WebGL: lo cubre la e2e (como en VExUS)
      ],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Umbrales: solo pueden subir. Medidos con todos los niveles.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
