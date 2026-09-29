import type { Torso } from '../../anatomy/primitives';
import type { Vec3 } from '../../core/vec3';
import type { ProbePose } from '../../probe/probe';
import { surfacePose } from './geometry';

export interface ThoraxInputOptions {
  getPose: () => ProbePose;
  getTorso: () => Torso;
  setPose: (p: ProbePose) => void;
  frozen: () => boolean;
  mode: () => 'move' | 'orient';
  pick: (x: number, y: number, dragging?: boolean) => Vec3 | 'probe' | 'blocked' | null;
  orbit: (dx: number, dy: number) => void;
  unavailable: () => void;
}

/** Un puntero capturado, sin reloj propio. Los botones nativos son la alternativa al arrastre táctil. */
export function bindThoraxInput(canvas: HTMLCanvasElement, options: ThoraxInputOptions): (() => void) & { cancel(): void } {
  let drag: { id: number; kind: 'move' | 'orient' | 'camera'; x: number; y: number } | null = null;
  const moveTo = (point: Vec3) => {
    const p = surfacePose(point, options.getTorso(), options.getPose());
    if (p) options.setPose(p);
    else options.unavailable();
  };
  const down = (event: PointerEvent) => {
    if (drag || event.button > 2) return;
    const point = options.pick(event.clientX, event.clientY);
    if (point === 'blocked' && !event.altKey && event.button === 0 && !options.frozen()) {
      options.unavailable();
      event.preventDefault();
      return;
    }
    const kind = event.altKey || event.button !== 0 || !point || options.frozen() ? 'camera' : options.mode();
    drag = { id: event.pointerId, kind, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (kind === 'move' && Array.isArray(point)) moveTo(point);
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.kind === 'camera') options.orbit(dx, dy);
    else if (!options.frozen()) {
      if (drag.kind === 'move') {
        const point = options.pick(event.clientX, event.clientY, true);
        if (Array.isArray(point)) moveTo(point);
        else if (point === 'blocked') options.unavailable();
      } else {
        const p = options.getPose();
        const step = event.shiftKey ? 0.001 : 0.004;
        options.setPose({ ...p, rock: p.rock + dx * step, tilt: p.tilt + dy * step });
      }
    } else blur();
  };
  const up = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: WheelEvent) => {
    // La rueda solo orienta cuando se ha elegido Orientar; en Mover deja desplazar la página.
    if (options.mode() !== 'orient' || options.frozen()) return;
    event.preventDefault();
    const p = options.getPose();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    options.setPose({ ...p, yaw: p.yaw + pixels * 0.0015 });
  };
  const menu = (event: MouseEvent) => event.preventDefault();
  const blur = () => {
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') blur();
  };
  window.addEventListener('keydown', key);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', menu);
  window.addEventListener('blur', blur);
  const dispose = () => {
    blur();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('lostpointercapture', up);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', menu);
    window.removeEventListener('blur', blur);
    window.removeEventListener('keydown', key);
  };
  return Object.assign(dispose, { cancel: blur });
}
