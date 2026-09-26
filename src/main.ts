/**
 * Punto de entrada (fase 0, docs/ROADMAP.md). Todavía no hay imagen ecográfica: la página dice qué es el
 * proyecto, en qué fase está y si el navegador ofrece WebGL2, que la formación de imagen necesitará desde
 * la fase 1. No simula nada ni lo aparenta.
 */
function webgl2Available(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** Nodo con texto plano (nunca HTML interpolado). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, style = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (style) node.style.cssText = style;
  return node;
}

function render(root: HTMLElement): void {
  document.body.style.cssText = 'margin:0;background:#0b0d10;color:#d8dde3;font:15px/1.5 system-ui,sans-serif';
  const gl = webgl2Available();
  const main = el('main', '', 'max-width:44rem;margin:0 auto;padding:3rem 1rem');
  const status = el('p', `WebGL2: ${gl ? 'disponible' : 'no disponible (la simulación lo necesitará)'}`);
  status.dataset['testid'] = 'webgl2';
  status.dataset['available'] = String(gl);
  const build = el('p', `v${__APP_VERSION__} · ${__GIT_COMMIT__}`, 'color:#9aa4ae;font-size:.85rem');
  build.dataset['testid'] = 'build';
  main.append(
    el('h1', 'lus-sim', 'font-size:1.5rem;margin:0 0 .25rem'),
    el('p', 'Simulador de ecografía pulmonar · uso educativo · no es un dispositivo médico', 'margin:0 0 1.5rem;color:#9aa4ae'),
    el('p', 'Fase 0: esqueleto, documentos rectores y pruebas. La imagen llega en la fase 1.'),
    status,
    build,
  );
  root.replaceChildren(main);
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('falta el contenedor #app en index.html');
render(root);
