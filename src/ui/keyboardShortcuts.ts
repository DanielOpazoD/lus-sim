import type { EquipmentCommand } from '../app/equipment';
import type { Store } from '../app/store';

/**
 * Atajos de teclado (misma familia que EchoTwin): Espacio congela, [ ] profundidad, − + ganancia. Se ignoran
 * cuando el foco está en un control de formulario que escribe texto (un deslizador no los usa: con él enfocado,
 * Espacio descongela).
 *
 * lus-sim (decisión 13): solo el modo B; sin los modos (2, M, C, P), el carril (H) ni la herramienta (Esc) de
 * VExUS.
 */
export function bindKeyboardShortcuts(store: Store, dispatch: (cmd: EquipmentCommand) => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if ((tag === 'INPUT' && (el as HTMLInputElement).type !== 'range') || tag === 'SELECT' || tag === 'TEXTAREA') return;
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
