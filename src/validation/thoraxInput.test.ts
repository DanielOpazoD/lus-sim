import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { torsoSkinPoint } from '../anatomy/primitives';
import type { Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';
import { clampPose, defaultPose } from '../probe/probe';
import { bindThoraxInput } from '../ui/thorax/input';

type Handler = (event: never) => void;
class Target {
  readonly handlers = new Map<string, Set<Handler>>();
  readonly captured = new Set<number>();
  clientHeight = 240;
  addEventListener(type: string, handler: Handler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }
  removeEventListener(type: string, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }
  setPointerCapture(id: number): void {
    this.captured.add(id);
  }
  hasPointerCapture(id: number): boolean {
    return this.captured.has(id);
  }
  releasePointerCapture(id: number): void {
    this.captured.delete(id);
  }
  fire(type: string, event: Record<string, unknown> = {}): void {
    for (const handler of this.handlers.get(type) ?? [])
      handler({
        pointerId: 1,
        button: 0,
        clientX: 10,
        clientY: 10,
        preventDefault: () => undefined,
        ...event,
      } as never);
  }
}

function setup() {
  const win = new Target();
  vi.stubGlobal('window', win);
  const canvas = new Target();
  const scene = new AnatomyScene(defaultPatient());
  const state = {
    pose: defaultPose(),
    mode: 'move' as 'move' | 'orient',
    frozen: false,
    point: torsoSkinPoint(1.15 * Math.PI, 50, scene.torso) as Vec3 | 'probe' | 'blocked' | null,
    orbits: [] as number[][],
    unavailable: 0,
  };
  const dispose = bindThoraxInput(canvas as unknown as HTMLCanvasElement, {
    getPose: () => state.pose,
    getTorso: () => scene.torso,
    setPose: (p) => {
      state.pose = clampPose(p);
    },
    frozen: () => state.frozen,
    mode: () => state.mode,
    pick: () => state.point,
    orbit: (dx, dy) => {
      state.orbits.push([dx, dy]);
    },
    unavailable: () => {
      state.unavailable++;
    },
  });
  return { win, canvas, scene, state, dispose };
}

afterEach(() => vi.unstubAllGlobals());

describe('Gestos del navegador del tórax', () => {
  it('coloca y desliza con un puntero capturado; no acepta un segundo arrastre simultáneo', () => {
    const { canvas, scene, state, dispose } = setup();
    canvas.fire('pointerdown');
    expect(state.pose.phi).toBeCloseTo(1.15 * Math.PI, 12);
    expect(canvas.captured.has(1)).toBe(true);
    state.point = torsoSkinPoint(0.25 * Math.PI, 80, scene.torso);
    canvas.fire('pointerdown', { pointerId: 2 });
    canvas.fire('pointermove', { pointerId: 2 });
    expect(state.pose.z).toBe(50);
    canvas.fire('pointermove');
    expect([state.pose.phi, state.pose.z]).toEqual([0.25 * Math.PI, 80]);
    canvas.fire('pointerup');
    expect(canvas.captured.size).toBe(0);
    dispose();
  });

  it('zona posterior no alcanzable deja la sonda donde estaba y avisa', () => {
    const { canvas, scene, state, dispose } = setup();
    const before = state.pose;
    state.point = torsoSkinPoint(-Math.PI / 2, 50, scene.torso);
    canvas.fire('pointerdown');
    expect(state.pose).toEqual(before);
    expect(state.unavailable).toBe(1);
    dispose();
  });

  it('Orientar cambia ángulos, usa ajuste fino y permite rotar con rueda', () => {
    const { canvas, state, dispose } = setup();
    state.mode = 'orient';
    canvas.fire('pointerdown');
    canvas.fire('pointermove', { clientX: 20, clientY: 30 });
    expect(state.pose.rock).toBeCloseTo(0.04);
    expect(state.pose.tilt).toBeCloseTo(0.08);
    canvas.fire('pointermove', { clientX: 30, clientY: 40, shiftKey: true });
    expect(state.pose.rock).toBeCloseTo(0.05);
    expect(state.pose.tilt).toBeCloseTo(0.09);
    const prevented = vi.fn();
    canvas.fire('wheel', { deltaY: 1, deltaMode: 1, preventDefault: prevented });
    expect(state.pose.yaw).toBeCloseTo(16 * 0.0015);
    expect(prevented).toHaveBeenCalledOnce();
    state.mode = 'move';
    canvas.fire('wheel', { deltaY: 200, deltaMode: 0, preventDefault: prevented });
    expect(prevented).toHaveBeenCalledOnce();
    dispose();
  });

  it('fondo o Alt giran la cámara; congelar bloquea la sonda también durante un arrastre', () => {
    const { canvas, state, dispose } = setup();
    const before = state.pose;
    canvas.fire('pointerdown', { altKey: true });
    canvas.fire('pointermove', { clientX: 20, clientY: 25 });
    expect(state.orbits).toEqual([[10, 15]]);
    expect(state.pose).toEqual(before);
    canvas.fire('pointerup');
    state.mode = 'orient';
    canvas.fire('pointerdown');
    state.frozen = true;
    canvas.fire('pointermove', { clientX: 100, clientY: 100 });
    canvas.fire('wheel', { deltaY: 200, deltaMode: 0 });
    expect(state.pose).toEqual(before);
    canvas.fire('pointerup');
    canvas.fire('pointerdown');
    canvas.fire('pointermove', { clientX: 30, clientY: 40 });
    expect(state.orbits).toEqual([
      [10, 15],
      [20, 30],
    ]);
    dispose();
  });

  it('cancelación, blur y dispose sueltan captura y oyentes sin seguir moviendo la sonda', () => {
    const { canvas, win, state, dispose } = setup();
    state.point = null;
    canvas.fire('pointerdown');
    canvas.fire('pointercancel');
    canvas.fire('pointermove', { clientX: 20 });
    expect(state.orbits).toEqual([]);
    canvas.fire('pointerdown');
    win.fire('blur');
    expect(canvas.captured.size).toBe(0);
    canvas.fire('pointermove', { clientX: 20 });
    expect(state.orbits).toEqual([]);
    dispose();
    for (const handlers of canvas.handlers.values()) expect(handlers.size).toBe(0);
    for (const handlers of win.handlers.values()) expect(handlers.size).toBe(0);
  });
  it('el cuerpo de contexto bloquea la selección y no inicia un arrastre a través de él', () => {
    const { canvas, state, dispose } = setup();
    const before = state.pose;
    state.point = 'blocked';
    canvas.fire('pointerdown');
    canvas.fire('pointermove', { clientX: 35 });
    expect(state.pose).toEqual(before);
    expect(state.unavailable).toBe(1);
    expect(canvas.captured.size).toBe(0);
    expect(state.orbits).toEqual([]);
    dispose();
  });
  it('agarrar la sonda no la teletransporta; el arrastre continúa sobre piel válida', () => {
    const { canvas, scene, state, dispose } = setup();
    const before = state.pose;
    state.point = 'probe';
    canvas.fire('pointerdown');
    expect(state.pose).toEqual(before);
    state.point = torsoSkinPoint(0.4 * Math.PI, 40, scene.torso);
    canvas.fire('pointermove');
    expect(state.pose.z).toBe(40);
    dispose();
  });
  it('Escape y congelar durante el gesto cancelan sin reactivar un arrastre viejo', () => {
    const { canvas, win, state, dispose } = setup();
    state.mode = 'orient';
    canvas.fire('pointerdown');
    win.fire('keydown', { key: 'Escape' });
    expect(canvas.captured.size).toBe(0);
    canvas.fire('pointerdown');
    state.frozen = true;
    canvas.fire('pointermove');
    expect(canvas.captured.size).toBe(0);
    state.frozen = false;
    const before = state.pose;
    canvas.fire('pointermove', { clientX: 100 });
    expect(state.pose).toEqual(before);
    dispose();
  });
});
