import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProbeAnimator } from '../app/probeAnimation';
import { START_POINTS } from '../app/startPoints';
import { Store } from '../app/store';
import type { EquipmentCommand } from '../app/equipment';
import { clampPose, defaultPose, type ProbePose } from '../probe/probe';
import { bindKeyboardShortcuts } from '../ui/keyboardShortcuts';
import { ProbeInput } from '../ui/probeInput';

/**
 * La interfaz que mueve la sonda y el equipo, sin DOM (decisión 13): el estado de la UI, la animación hacia un punto
 * de partida, los atajos de teclado y la entrada de la sonda con ratón, trackpad, teclado y táctil. Los eventos se
 * entregan a mano a un `window` y un elemento falsos que solo registran oyentes: se prueba lo que cada gesto hace con
 * la pose y el equipo, no el navegador (eso lo hace la e2e).
 */
type Handler = (e: never) => void;
class FakeTarget {
  readonly handlers = new Map<string, Handler[]>();
  addEventListener(type: string, h: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), h]);
  }
  removeEventListener(type: string, h: Handler): void {
    this.handlers.set(
      type,
      (this.handlers.get(type) ?? []).filter((x) => x !== h),
    );
  }
  fire(type: string, e: Record<string, unknown>): void {
    for (const h of this.handlers.get(type) ?? []) h(e as never);
  }
  setPointerCapture(): void {}
}
const g = globalThis as unknown as { window?: FakeTarget };
let win: FakeTarget;
beforeEach(() => {
  win = new FakeTarget();
  g.window = win;
});
afterEach(() => {
  delete g.window;
});
const key = (k: string, target: object = {}) => ({ key: k, target, preventDefault: () => undefined });

describe('Estado de la UI', () => {
  it('avisa solo cuando algo cambia, un oyente que lanza no corta a los demás y darse de baja funciona', () => {
    const errors: unknown[] = [];
    const s = new Store({ frozen: false }, (e) => errors.push(e));
    const seen: boolean[] = [];
    s.subscribe(() => {
      throw new Error('oyente roto');
    });
    const off = s.subscribe((st, prev) => seen.push(st.frozen !== prev.frozen));
    s.set({ frozen: false });
    expect(seen).toEqual([]);
    s.set({ frozen: true });
    expect(seen).toEqual([true]);
    expect(errors.map((e) => (e as Error).message)).toEqual(['oyente roto']);
    off();
    s.set({ frozen: false });
    expect(seen).toEqual([true]);
    expect(s.get().frozen).toBe(false);
  });
});

describe('Animación hacia un punto de partida (animar, nunca teletransportar)', () => {
  it('se desliza hasta el punto en ~1 s sin saltos, suelta la presión y termina; un gesto la cancela', () => {
    let pose: ProbePose = { ...defaultPose(), lift: -4 };
    const a = new ProbeAnimator(
      () => pose,
      (p) => (pose = clampPose(p)),
    );
    const target = START_POINTS.find((s) => s.id === 'plaps')!;
    a.goTo(target);
    expect(a.active).toBe(true);
    let maxStepMm = 0;
    let t = 0;
    for (; t < 3 && a.active; t += 1 / 60) {
      const before = pose;
      a.tick(1 / 60);
      maxStepMm = Math.max(maxStepMm, Math.abs(pose.z - before.z), 160 * Math.abs(pose.phi - before.phi));
    }
    expect(a.active).toBe(false);
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(3);
    expect(Math.abs(pose.phi - target.phi)).toBeLessThan(0.003);
    expect(Math.abs(pose.z - target.z)).toBeLessThan(0.5);
    // ningún cuadro salta más de ~2 cm sobre la piel, y la presión se suelta
    expect(maxStepMm).toBeLessThan(20);
    expect(Math.abs(pose.lift)).toBeLessThan(0.5);
    a.goTo(START_POINTS[0]);
    a.tick(1 / 60);
    a.cancel();
    const frozenAt = pose;
    a.tick(1 / 60);
    expect(pose).toBe(frozenAt);
  });
});

describe('Atajos de teclado', () => {
  it('Espacio congela y descongela; [ ] cambian la profundidad y − + la ganancia; no actúan al escribir en un campo', () => {
    const store = new Store({ frozen: false });
    const cmds: EquipmentCommand[] = [];
    const off = bindKeyboardShortcuts(store, (c) => cmds.push(c));
    win.fire('keydown', key(' '));
    expect(store.get().frozen).toBe(true);
    win.fire('keydown', key(' ', { tagName: 'INPUT', type: 'range' })); // con un deslizador enfocado, sí
    expect(store.get().frozen).toBe(false);
    for (const k of ['[', ']', '-', '+', '=']) win.fire('keydown', key(k));
    expect(cmds).toEqual([
      { type: 'stepDepth', deltaMm: -10 },
      { type: 'stepDepth', deltaMm: 10 },
      { type: 'stepGain', deltaDb: -2 },
      { type: 'stepGain', deltaDb: 2 },
      { type: 'stepGain', deltaDb: 2 },
    ]);
    win.fire('keydown', key(']', { tagName: 'INPUT', type: 'text' }));
    win.fire('keydown', key(']', { tagName: 'SELECT' }));
    win.fire('keydown', key(']', { tagName: 'TEXTAREA' }));
    expect(cmds).toHaveLength(5);
    // con ⌘, Ctrl o ⌥ la tecla es del navegador (⌘[ vuelve atrás, Ctrl − aleja); Espacio sobre un botón lo pulsa
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) win.fire('keydown', { ...key('['), [mod]: true });
    expect(cmds).toHaveLength(5);
    win.fire('keydown', key(' ', { tagName: 'BUTTON' }));
    expect(store.get().frozen).toBe(false);
    off();
    win.fire('keydown', key(' '));
    expect(store.get().frozen).toBe(false);
  });
});

describe('Entrada compuesta: sonda y atajos instalados como en main', () => {
  it('Espacio sobre un botón conserva su acción nativa y no mueve ni congela', () => {
    const store = new Store({ frozen: false });
    let pose = defaultPose();
    const initial = pose;
    const input = new ProbeInput(
      new FakeTarget() as unknown as HTMLElement,
      () => pose,
      (p) => (pose = p),
      () => !store.get().frozen,
    );
    const commands: EquipmentCommand[] = [];
    bindKeyboardShortcuts(store, (cmd) => commands.push(cmd));
    let cancelled = 0;
    for (const tagName of ['BUTTON', 'SUMMARY']) {
      win.fire('keydown', { ...key(' ', { tagName }), preventDefault: () => cancelled++ });
      input.tick(0.1);
    }
    expect(cancelled).toBe(0); // la mutación: ProbeInput cancelaba este mismo evento antes del atajo
    expect(store.get().frozen).toBe(false);
    expect(pose).toBe(initial);
    expect(commands).toEqual([]);
    win.fire('keydown', key(' '));
    expect(store.get().frozen).toBe(true);
    win.fire('keydown', { ...key(' '), repeat: true });
    expect(store.get().frozen).toBe(true);
    for (const k of ['[', ']', '-', '+']) win.fire('keydown', key(k));
    expect(commands).toEqual([]); // el cine no recibe ajustes de adquisición futuros
  });

  it('escribir o navegar en controles no integra movimiento; congelar suelta teclas mantenidas', () => {
    let live = true;
    let pose = defaultPose();
    const initial = pose;
    const input = new ProbeInput(
      new FakeTarget() as unknown as HTMLElement,
      () => pose,
      (p) => (pose = p),
      () => live,
    );
    for (const target of [{ tagName: 'BUTTON' }, { tagName: 'TEXTAREA' }, { isContentEditable: true }]) {
      win.fire('keydown', key('w', target));
      input.tick(0.1);
    }
    expect(pose).toBe(initial);
    win.fire('keydown', key('w'));
    input.tick(0.1);
    expect(pose.z).toBeGreaterThan(initial.z);
    live = false;
    input.tick(0.1);
    const atFreeze = pose;
    live = true;
    input.tick(0.1);
    expect(pose).toBe(atFreeze);
  });
});

describe('Entrada de la sonda: ratón, trackpad, teclado y táctil dan la misma pose', () => {
  function setup(live = () => true) {
    const el = new FakeTarget();
    let pose = defaultPose();
    const input = new ProbeInput(
      el as unknown as HTMLElement,
      () => pose,
      (p) => (pose = p),
      live,
    );
    return { el, input, pose: () => pose };
  }
  const ptr = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    altKey: false,
    shiftKey: false,
    ...extra,
  });

  it('arrastrar desliza la sonda por la piel; con el botón derecho o ⌥ bascula e inclina; ⇧ afina', () => {
    const { el, pose } = setup();
    const p0 = pose();
    el.fire('pointerdown', ptr(100, 100));
    win.fire('pointermove', ptr(120, 90));
    win.fire('pointerup', ptr(120, 90));
    expect(pose().phi).toBeCloseTo(p0.phi - 20 * 0.0035, 12);
    expect(pose().z).toBeCloseTo(p0.z + 10 * 0.3, 12);
    expect([pose().rock, pose().tilt]).toEqual([p0.rock, p0.tilt]);
    const p1 = pose();
    el.fire('pointerdown', ptr(0, 0, { button: 2 }));
    win.fire('pointermove', ptr(10, 5, { button: 2, shiftKey: true }));
    win.fire('pointerup', ptr(10, 5));
    expect(pose().rock).toBeCloseTo(p1.rock + 10 * 0.004 * 0.3, 12);
    expect(pose().tilt).toBeCloseTo(p1.tilt + 5 * 0.004 * 0.3, 12);
    expect(pose().phi).toBe(p1.phi);
    // sin botón pulsado, mover el ratón no hace nada
    const p2 = pose();
    win.fire('pointermove', ptr(50, 50));
    expect(pose()).toBe(p2);
  });

  it('la rueda rota y con ⇧ aprieta; un dedo desliza y dos basculan', () => {
    const { el, pose } = setup();
    const p0 = pose();
    el.fire('wheel', { deltaY: 100, shiftKey: false, preventDefault: () => undefined });
    expect(pose().yaw).toBeCloseTo(p0.yaw + 0.15, 12);
    el.fire('wheel', { deltaY: -200, shiftKey: true, preventDefault: () => undefined });
    expect(pose().lift).toBeCloseTo(p0.lift - 2, 12);
    const p1 = pose();
    el.fire('pointerdown', ptr(0, 0, { pointerType: 'touch', pointerId: 7 }));
    win.fire('pointermove', ptr(10, -20, { pointerType: 'touch', pointerId: 7 }));
    expect(pose().phi).toBeCloseTo(p1.phi - 10 * 0.004, 12);
    expect(pose().z).toBeCloseTo(p1.z + 20 * 0.35, 12);
    const p2 = pose();
    el.fire('pointerdown', ptr(0, 0, { pointerType: 'touch', pointerId: 8 }));
    win.fire('pointermove', ptr(10, -20, { pointerType: 'touch', pointerId: 7 }));
    expect([pose().phi, pose().z]).toEqual([p2.phi, p2.z]);
    win.fire('pointermove', ptr(20, -10, { pointerType: 'touch', pointerId: 7 }));
    expect(pose().rock).toBeCloseTo(p2.rock + 10 * 0.004, 12);
    expect(pose().tilt).toBeCloseTo(p2.tilt + 10 * 0.004, 12);
  });

  it('un arrastre empezado antes de congelar no mueve la sonda congelada; ⌘ + tecla no la mueve', () => {
    let live = true;
    const { el, input, pose } = setup(() => live);
    el.fire('pointerdown', ptr(0, 0));
    win.fire('pointermove', ptr(10, 0));
    const p1 = pose();
    live = false;
    win.fire('pointermove', ptr(40, 30));
    expect(pose()).toBe(p1);
    live = true;
    win.fire('pointerup', ptr(40, 30));
    win.fire('keydown', { ...key('a'), metaKey: true });
    input.tick(0.5);
    expect(pose()).toBe(p1);
  });

  it('las teclas mantenidas integran con el tiempo; con la imagen congelada nada mueve la sonda', () => {
    let live = true;
    const { el, input, pose } = setup(() => live);
    const p0 = pose();
    win.fire('keydown', key('w'));
    input.tick(0.5);
    expect(pose().z).toBeCloseTo(p0.z + 20, 12);
    win.fire('keyup', key('w'));
    win.fire('keydown', key('Q'));
    input.tick(0.5);
    expect(pose().yaw).toBeCloseTo(p0.yaw - 0.45, 12);
    win.fire('blur', {});
    input.tick(0.5);
    expect(pose().yaw).toBeCloseTo(p0.yaw - 0.45, 12);
    live = false;
    const p1 = pose();
    win.fire('keydown', key('d'));
    input.tick(0.5);
    el.fire('pointerdown', ptr(0, 0));
    win.fire('pointermove', ptr(30, 30));
    el.fire('wheel', { deltaY: 100, shiftKey: false, preventDefault: () => undefined });
    expect(pose()).toBe(p1);
  });
});
