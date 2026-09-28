import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Simulator } from '../app/simulator';
import { Store } from '../app/store';
import { bindCine } from '../ui/controllers/cine';

/** Entrega eventos al controlador real, sin DOM ni GPU; la e2e comprueba la entrega del navegador. */
class FakeTarget {
  private readonly handlers = new Map<string, Array<(event: never) => void>>();
  addEventListener(type: string, handler: (event: never) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  fire(type: string, event: object): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event as never);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('Atajos del cine en el contexto de adquisición', () => {
  it('conserva el cuadro al navegar en Ajustes, desplegables, editables o con modificadores; las flechas de adquisición siguen funcionando', () => {
    const win = new FakeTarget();
    vi.stubGlobal('window', win);
    const slider = Object.assign(new FakeTarget(), { value: '0', max: '0', setAttribute: vi.fn() });
    const shown: number[] = [];
    const renderer = {
      cineCount: 4,
      cineSeal: vi.fn(),
      showCine: (index: number) => shown.push(index),
      cineFrame: (index: number) => ({ t: index }),
    };
    const cine = bindCine({
      bar: { hidden: false } as HTMLElement,
      slider: slider as unknown as HTMLInputElement,
      label: { textContent: '' } as HTMLElement,
      freezeButton: {} as HTMLElement,
      host: new FakeTarget() as unknown as HTMLElement,
      getSim: () => ({ renderer }) as unknown as Simulator,
      store: new Store({ frozen: true }),
    });
    cine.sync();
    expect(slider.value).toBe('3');
    const contexts = [
      { target: { tagName: 'BUTTON', closest: (selector: string) => selector === 'dialog[open]' } },
      { target: { tagName: 'SUMMARY' } },
      { target: { isContentEditable: true } },
      { target: { tagName: 'INPUT' } },
      { target: { tagName: 'SELECT' } },
      { target: { tagName: 'TEXTAREA' } },
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
    ];
    for (const context of contexts) {
      for (const key of ['ArrowLeft', 'Home']) {
        const preventDefault = vi.fn();
        win.fire('keydown', { key, target: {}, ...context, preventDefault });
        cine.tick();
        expect(slider.value).toBe('3');
        expect(shown.at(-1)).toBe(3);
        expect(preventDefault).not.toHaveBeenCalled();
      }
    }
    const preventDefault = vi.fn();
    win.fire('keydown', { key: 'ArrowLeft', target: {}, preventDefault });
    cine.tick();
    expect(slider.value).toBe('2');
    expect(shown.at(-1)).toBe(2);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
