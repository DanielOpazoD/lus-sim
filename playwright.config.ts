import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo sobre el build de producción (`vite preview`). En CI no hay GPU:
 * Chromium usa SwiftShader (WebGL2 por software), más lento pero suficiente para comprobar que la
 * cadena funciona. Puerto 6709: el 6609 es de VExUS y esta máquina corre las dos suites.
 *
 * `LUS_E2E_GPU=1` (lus-sim, decisión 21) lanza Chromium con la GPU real (Metal en macOS, como el banco de VExUS): la línea
 * base del banco de fidelidad y las medidas «con GPU real» de las decisiones. En CI nunca se pone.
 */
const GPU = process.env.LUS_E2E_GPU === '1';
const GL_ARGS = GPU
  ? process.platform === 'darwin'
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // en CI la e2e se reparte en fragmentos (`--shard`, ci.yml) por prueba y no por archivo, que son dos y muy desiguales, y
  // cada fragmento corre con un trabajador: dos trabajadores en los 4 núcleos de un corredor se estorban con SwiftShader
  // (13,6 min la e2e entera frente a 8,5 min sumando cada prueba sola). En local, por archivo como siempre.
  fullyParallel: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:6709',
    trace: 'retain-on-failure',
    launchOptions: { args: GL_ARGS },
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // node + vite.js en vez de npx: en algunos entornos npx no llega a arrancar el servidor
    command: 'node node_modules/vite/bin/vite.js preview --port 6709 --strictPort',
    url: 'http://localhost:6709',
    // Nunca reutilizar: un `vite preview` huérfano en el puerto serviría un dist viejo y la e2e
    // «pasaría» probando otra compilación (lección de VExUS, 23-09-2026)
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
