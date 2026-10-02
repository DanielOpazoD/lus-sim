import { errorLog, errorMessage } from '../../app/errorLog';
import type { Simulator } from '../../app/simulator';
import type { Banner } from './banner';

/**
 * Pérdida y recuperación del contexto WebGL de la imagen: avisa, registra y reconstruye el
 * renderer al restaurarse (y avisa con `onRestored`: el cine y la franja M eran del renderer viejo). `lost` lo
 * consulta el bucle para no dibujar sin contexto: el contexto se pierde en el acto, pero `webglcontextlost` llega en
 * una tarea posterior, y un cuadro entre las dos dibujaba sin contexto («FBO incompleto: 0x8cdd» en el registro de
 * errores: 3 de los 5 fallos de la e2e de la pérdida en el CI, 29-09 a 02-10). Por eso `lost` pregunta también al contexto.
 */
export function bindGpuLifecycle(
  canvas: HTMLCanvasElement,
  getSim: () => Simulator,
  banner: Banner,
  onRestored: () => void = () => undefined,
): { readonly lost: boolean } {
  const state = { lost: false };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    state.lost = true;
    errorLog.report('gpu', 'contexto WebGL perdido');
    banner.show('Contexto GPU perdido: recuperando…');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      getSim().rebuildRenderer(canvas);
      state.lost = false;
      banner.hide();
      onRestored();
    } catch (e) {
      errorLog.report('gpu', e);
      banner.show(`No se pudo recuperar la GPU: ${errorMessage(e)}`);
    }
  });
  return {
    get lost() {
      return state.lost || getSim().renderer.gl.isContextLost();
    },
  };
}
