import type { EquipmentCommand } from './equipment';
import type { Simulator } from './simulator';
import type { TestHooks } from './testHooks';

/**
 * Ganchos de depuración en `window`, solo en desarrollo (`import.meta.env.DEV`):
 * `__sim()` devuelve el simulador vivo (cambia al cambiar de caso). Es una función, no un objeto,
 * precisamente porque el simulador se reemplaza. Nada del código de la aplicación depende de ellos.
 *
 * lus-sim (decisión 12): los ganchos de prueba en `window.__lusTest` (VExUS: `__vexusTest`); sin las vistas del
 * navegador 3D, el corte ni el espectro, que lus-sim aún no tiene.
 */
declare global {
  interface Window {
    __sim?: () => Simulator;
    __lusTest?: TestHooks;
  }
}

export function registerDevtools(
  getSim: () => Simulator,
  dispatch: (cmd: EquipmentCommand) => void,
  ready: Promise<void> = Promise.resolve(),
): void {
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('e2e')) {
    // Carga diferida: el código de prueba no entra en el bundle principal
    // lus-sim (decisión 29): una carga fallida lo dice (antes la e2e solo veía 60 s sin ganchos)
    // lus-sim (decisión 49): los ganchos llegan con el corazón de EchoTwin ya en la escena (`ready`)
    Promise.all([import('./testHooks'), ready])
      .then(([m]) => (window.__lusTest = m.createTestHooks(getSim, dispatch)))
      .catch((e: unknown) => console.error('devtools: no cargaron los ganchos de prueba (testHooks)', e));
  }
  if (!import.meta.env.DEV) return;
  window.__sim = getSim;
}
