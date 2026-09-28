import type { EquipmentCommand } from '../app/equipment';
import type { Store } from '../app/store';

/**
 * Atajos de teclado (misma familia que EchoTwin): Espacio congela, [ ] profundidad, − + ganancia. Se ignoran
 * cuando el foco está en un control de formulario que escribe texto (un deslizador no los usa: con él enfocado,
 * Espacio descongela).
 *
 * lus-sim (decisión 13): solo el modo B; sin los modos (2, M, C, P), el carril (H) ni la herramienta (Esc) de
 * VExUS. Con ⌘, Ctrl o ⌥ la tecla es del navegador o del sistema (⌘[ vuelve atrás, Ctrl − aleja), y Espacio sobre un
 * botón lo pulsa (lo halló la revisión: congelaba en vez de plegar la sección).
 */
export function bindKeyboardShortcuts(store: Store, dispatch: (cmd: EquipmentCommand) => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if ((tag === 'INPUT' && (el as HTMLInputElement).type !== 'range') || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (el?.isContentEditable || el?.closest?.('dialog[open]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A' || e.repeat)) return;
    // Una imagen histórica conserva su adquisición; los ajustes se cambian al reanudar.
    if (store.get().frozen && e.key !== ' ') return;
    switch (e.key) {
      case ' ':
        store.set({ frozen: !store.get().frozen });
        e.preventDefault();
        break;
      case '[':
        dispatch({ type: 'stepDepth', deltaMm: -10 });
        break;
      case ']':
        dispatch({ type: 'stepDepth', deltaMm: 10 });
        break;
      case '-':
        dispatch({ type: 'stepGain', deltaDb: -2 });
        break;
      case '+':
      case '=':
        dispatch({ type: 'stepGain', deltaDb: 2 });
        break;
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
