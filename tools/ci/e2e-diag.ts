/**
 * TEMPORAL (diagnóstico de la PR fix/e2e-estables; se quita antes de integrar). Mide con SwiftShader, sobre una
 * compilación dada, lo que cuesta cada paso de la prueba de la pérdida del contexto WebGL (`e2e/smoke.spec.ts`).
 * uso: node --import tsx tools/ci/e2e-diag.ts <distDir> <puerto> <repeticiones> <etiqueta>
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer): { data: Buffer } } };
};

const [distArg, port = '6719', reps = '1', label = distArg] = process.argv.slice(2);
const dist = path.resolve(distArg);
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const since = (t: number) => +((Date.now() - t) / 1000).toFixed(2);

interface Marks {
  old: unknown;
  call?: number;
  restoreStart?: number;
  restoreEnd?: number;
}
type W = Window & { __m: Marks; __lc: WEBGL_lose_context };

function maxGrey(data: Uint8Array | Uint8ClampedArray): number {
  let max = 0;
  for (let i = 0; i < data.length; i += 4) max = Math.max(max, (data[i] + data[i + 1] + data[i + 2]) / 3);
  return max;
}

/** El coste de mirar la pantalla: captura del lienzo y decodificación en la página (como hoy) o en Node. */
async function screenCost(page: Page, inPage: boolean) {
  let t = Date.now();
  const png = await page.locator('#gl').screenshot({ timeout: 0 });
  const shot = since(t);
  // la misma región con una captura de la página: sin la espera a que el elemento esté «estable» (dos cuadros iguales)
  const box = (await page.locator('#gl').boundingBox())!;
  t = Date.now();
  const clipPng = await page.screenshot({ clip: box, timeout: 0 });
  const clipShot = since(t);
  const clipMax = maxGrey(PNG.sync.read(clipPng).data);
  t = Date.now();
  const nodeMax = maxGrey(PNG.sync.read(png).data);
  const node = since(t);
  let pageMax: number | null = null;
  let pageDecode: number | null = null;
  if (inPage) {
    t = Date.now();
    pageMax = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, (d[i] + d[i + 1] + d[i + 2]) / 3);
      return max;
    }, png.toString('base64'));
    pageDecode = since(t);
  }
  return { shot, clipShot, clipMax, node, nodeMax, pageDecode, pageMax };
}

const cine = (page: Page) => page.evaluate(() => window.__lusTest!.sim().renderer.cineCount);
const freshCine = (page: Page) =>
  page.evaluate(() =>
    window.__lusTest!.sim().renderer !== (window as unknown as W).__m.old ? window.__lusTest!.sim().renderer.cineCount : -1,
  );

async function once(browser: Browser): Promise<Record<string, unknown>> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(0);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const r: Record<string, unknown> = { label };
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?e2e=1`);
  await page.waitForFunction(() => /\d+ fps/.test(document.getElementById('status')?.textContent ?? ''), null, {
    timeout: 300_000,
    polling: 100,
  });
  r.bootFps = since(t0);
  await page.waitForFunction(() => typeof window.__lusTest === 'object', null, { timeout: 120_000, polling: 100 });
  await page.waitForFunction(() => window.__lusTest!.sim().renderer.cineCount >= 1, null, { timeout: 300_000, polling: 100 });
  r.boot1 = since(t0);
  await page.waitForFunction(() => window.__lusTest!.sim().renderer.cineCount >= 3, null, { timeout: 300_000, polling: 100 });
  r.boot3 = since(t0);
  let c0 = await cine(page);
  let t = Date.now();
  await sleep(15_000);
  r.secPerFrameLive = +((Date.now() - t) / 1000 / Math.max(1, (await cine(page)) - c0)).toFixed(2);
  r.liveScreen = await screenCost(page, true);
  // congelada: el bucle solo vuelve a presentar el cuadro del cine
  await page.locator('#sector-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(' ');
  await page.waitForFunction(() => document.getElementById('live-chip')!.textContent === 'Congelada');
  r.frozenScreen = await screenCost(page, true);
  t = Date.now();
  await page.evaluate(() => {
    const w = window as unknown as W;
    const canvas = document.getElementById('gl') as HTMLCanvasElement;
    const ext = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    w.__lc = ext;
    w.__m = { old: window.__lusTest!.sim().renderer };
    document.addEventListener('webglcontextrestored', () => (w.__m.restoreStart = performance.now()), { capture: true, once: true });
    canvas.addEventListener('webglcontextrestored', () => (w.__m.restoreEnd = performance.now()), { once: true });
    ext.loseContext();
  });
  r.loseEval = since(t);
  await page.waitForFunction(() => /Contexto GPU perdido/.test(document.querySelector('.banner')?.textContent ?? ''), null, {
    timeout: 120_000,
  });
  t = Date.now();
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__m.call = performance.now();
    w.__lc.restoreContext();
  });
  await page.waitForFunction(() => (window as unknown as W).__m.restoreEnd !== undefined, null, { timeout: 300_000, polling: 50 });
  const m = await page.evaluate(() => {
    const { call, restoreStart, restoreEnd } = (window as unknown as W).__m;
    return { call: call!, restoreStart: restoreStart!, restoreEnd: restoreEnd! };
  });
  r.restoreEventDelay = +((m.restoreStart - m.call) / 1000).toFixed(2);
  r.rebuild = +((m.restoreEnd - m.restoreStart) / 1000).toFixed(3);
  await page.waitForFunction(
    () => window.__lusTest!.sim().renderer !== (window as unknown as W).__m.old && window.__lusTest!.sim().renderer.cineCount >= 1,
    null,
    { timeout: 300_000, polling: 50 },
  );
  r.restored1 = since(t);
  await page.waitForFunction(() => window.__lusTest!.sim().renderer.cineCount >= 3, null, { timeout: 300_000, polling: 50 });
  r.restored3 = since(t);
  // ¿cuándo se ve la línea pleural? capturas decodificadas en Node, sin tarea en la página
  const shots: string[] = [];
  for (;;) {
    const s = await screenCost(page, false);
    shots.push(`${s.shot}:${s.nodeMax.toFixed(0)}/${s.clipShot}:${s.clipMax.toFixed(0)}`);
    if (s.nodeMax >= 230 || Date.now() - t > 300_000) break;
  }
  r.pleuraVisible = since(t);
  r.shotsAfter = shots.join(' ');
  r.liveScreenAfter = await screenCost(page, true);
  c0 = await freshCine(page);
  const t2 = Date.now();
  await sleep(15_000);
  r.secPerFrameAfter = +((Date.now() - t2) / 1000 / Math.max(1, (await freshCine(page)) - c0)).toFixed(2);
  r.errors = errors.join(' | ');
  await page.close();
  return r;
}

const server = spawn(
  process.execPath,
  [
    path.join(import.meta.dirname, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview',
    '--port',
    port,
    '--strictPort',
    '--outDir',
    dist,
  ],
  {
    cwd: path.dirname(dist),
    stdio: 'ignore',
  },
);
await sleep(3000);
try {
  for (let i = 0; i < +reps; i++) {
    const browser = await chromium.launch({ args: ARGS });
    try {
      console.log('E2E_DIAG', JSON.stringify(await once(browser)));
    } catch (e) {
      console.log('E2E_DIAG', JSON.stringify({ label, error: String(e).slice(0, 400) }));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
}
