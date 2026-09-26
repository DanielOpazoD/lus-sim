import { registerDevtools } from './app/devtools';
import { EquipmentController } from './app/equipment';
import { errorLog, errorMessage } from './app/errorLog';
import { Simulator, defaultEquipment } from './app/simulator';
import { C_RECONSTRUCTION_MM_S } from './core/units';
import { defaultPatient } from './physiology/patientState';

/**
 * Punto de entrada (fase 1, paso B2a; docs/ROADMAP.md). La página todavía no muestra imagen ecográfica: dice qué es
 * el proyecto, en qué fase está y si el navegador ofrece WebGL2. Con `?e2e` monta además, sin mostrarlo, el
 * simulador sobre un lienzo WebGL2 y carga los ganchos de prueba (`window.__lusTest`): la e2e comprueba con ellos la
 * formación de imagen en la GPU (equivalencia TS ↔ GLSL, moteado, líneas A) antes de que la interfaz la muestre
 * (paso B2b, decisión 13). No simula nada a la vista ni lo aparenta.
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
    el('p', 'Fase 1: el motor de VExUS portado; la formación de imagen en la GPU está en prueba y la imagen llega con la interfaz.'),
    status,
    build,
  );
  root.replaceChildren(main);
}

/**
 * Banco de pruebas de la e2e (`?e2e`): el simulador con el paciente por omisión y el equipo gobernado por comandos,
 * como lo tendrá la sesión de la aplicación, sobre un lienzo fuera de la vista. Un fallo al montarlo queda en el
 * registro de errores y en la consola: la e2e lo ve.
 */
function mountTestBench(): void {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.cssText = 'position:absolute;left:-10000px;top:0';
  document.body.appendChild(canvas);
  try {
    const sim = new Simulator(defaultPatient(), canvas);
    const equipment = new EquipmentController(defaultEquipment(), {
      halfSectorRad: sim.transducer.halfSector,
      cMmS: C_RECONSTRUCTION_MM_S,
    });
    sim.equipment = equipment.state;
    equipment.subscribe((next) => {
      sim.equipment = next;
    });
    registerDevtools(
      () => sim,
      (cmd) => equipment.dispatch(cmd),
    );
  } catch (e) {
    errorLog.report('gpu', e);
    console.error(`No se pudo montar el simulador: ${errorMessage(e)}`);
  }
}

errorLog.installGlobalHandlers(window);
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('falta el contenedor #app en index.html');
render(root);
if (new URLSearchParams(location.search).has('e2e')) mountTestBench();
