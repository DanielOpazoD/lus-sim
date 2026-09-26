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

export function registerDevtools(getSim: () => Simulator, dispatch: (cmd: EquipmentCommand) => void): void {
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('e2e')) {
    // Carga diferida: el código de prueba no entra en el bundle principal
    void import('./testHooks').then((m) => (window.__lusTest = m.createTestHooks(getSim, dispatch)));
  }
  if (!import.meta.env.DEV) return;
  window.__sim = getSim;
}
