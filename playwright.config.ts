import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo sobre el build de producción (`vite preview`). En CI no hay GPU:
 * Chromium usa SwiftShader (WebGL2 por software), más lento pero suficiente para comprobar que la
 * cadena funciona. Puerto 6709: el 6609 es de VExUS y esta máquina corre las dos suites.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:6709',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
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
