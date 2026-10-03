import { describe, expect, it } from 'vitest';
import { BmodeFrameRate } from '../app/frameRate';

/** FPS reales del modo B del informe técnico (decisión 40; el indicador de O6). */
describe('BmodeFrameRate: los FPS del modo B en una ventana', () => {
  it('a 60 cuadros por segundo: fps 60 y el intervalo de 16,7 ms en la mediana y el p95', () => {
    const r = new BmodeFrameRate(10_000);
    expect(r.summary()).toBeNull();
    for (let i = 0; i <= 120; i++) r.frame(1000 + (i * 1000) / 60);
    const s = r.summary()!;
    expect(s.fps).toBeCloseTo(60, 9);
    expect(s.frames).toBe(121);
    expect(s.windowS).toBeCloseTo(2, 9);
    expect(s.frameMsP50).toBeCloseTo(1000 / 60, 9);
    expect(s.frameMsP95).toBeCloseTo(1000 / 60, 9);
  });

  it('los tirones salen en el p95 y no en la media: uno de cada 15 cuadros (6,5 %) de 100 ms entre los de 20', () => {
    const r = new BmodeFrameRate(60_000);
    let t = 0;
    r.frame(t);
    for (let i = 1; i <= 200; i++) r.frame((t += i % 15 === 0 ? 100 : 20));
    const s = r.summary()!;
    expect(s.frameMsP50).toBe(20);
    expect(s.frameMsP95).toBe(100);
    expect(s.fps).toBeCloseTo((200 * 1000) / t, 9);
    // con menos del 5 % de tirones (uno de cada 25) el p95 es un cuadro normal: el p95 no es el máximo
    const q = new BmodeFrameRate(60_000);
    let u = 0;
    q.frame(u);
    for (let i = 1; i <= 200; i++) q.frame((u += i % 25 === 0 ? 100 : 20));
    expect(q.summary()!.frameMsP95).toBe(20);
  });

  it('la ventana descarta lo viejo y un hueco sin cuadros (congelar, perder la GPU) la vacía', () => {
    const r = new BmodeFrameRate(1000);
    for (let i = 0; i <= 300; i++) r.frame(i * 10);
    // solo el último segundo: de 2000 a 3000 ms
    expect(r.summary()!.frames).toBe(101);
    r.reset();
    expect(r.summary()).toBeNull();
    r.frame(10_000);
    r.frame(10_030);
    expect(r.summary()!.fps).toBeCloseTo(1000 / 30, 9);
    expect(() => new BmodeFrameRate(0)).toThrow(/ventana/);
  });
});
