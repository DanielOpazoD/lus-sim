import { describe, expect, it } from 'vitest';
import { MIRROR_WINDOW, PRESENT_MIN_DB, columnLevel, mirrorContrast, mirrorDepths } from '../app/mirrorBench';

/**
 * La medida del espejo del diafragma (lus-sim, decisión 37; meta F-T34, que la e2e mide sobre la envolvente de la GPU): con
 * campos sintéticos, sin WebGL.
 */
describe('mirrorBench: el contraste del espejo en la envolvente', () => {
  const lines = 4;
  const samples = 160;
  const depth = 160;
  /** Envolvente de amplitud `a` antes del espejo y `b` detrás, con el espejo de cada línea. */
  function frame(mirror: number[], a: number, b: number) {
    const data = new Float32Array(lines * samples);
    for (let k = 0; k < samples; k++)
      for (let u = 0; u < lines; u++) data[k * lines + u] = (k + 0.5) * (depth / samples) < mirror[u] ? a : b;
    return { lines, samples, data };
  }

  it('el espejo de cada línea es la primera fila de la pasada A que lo tiene', () => {
    // dos filas por línea: la línea 0 lo tiene desde la fila 1, la 1 nunca
    const hit = [-1, -1, 80, -1];
    expect(mirrorDepths(2, 2, hit)).toEqual([80, -1]);
  });

  const flat = (envDb: number) => envDb;
  it('mide la diferencia de potencia entre el tejido real y el virtual, solo en las líneas con las dos ventanas dentro', () => {
    const mirror = [100, 100, 10, -1];
    const r = mirrorContrast(frame(mirror, 1, 0.5), mirror, depth, flat);
    // 20·log10(2): la amplitud mitad es −6,02 dB
    expect(r.lines).toBe(2);
    expect(r.mirrorMm).toBe(100);
    expect(r.contrastDb).toBeCloseTo(20 * Math.log10(2), 9);
    expect(r.rawContrastDb).toBeCloseTo(20 * Math.log10(2), 9);
    expect(r.realDb).toBeCloseTo(0, 9);
  });

  it('mide en el nivel mostrado: una TGC que compensa la atenuación del camino de más borra esa diferencia', () => {
    // la envolvente cae 0,3 dB/mm (la atenuación de ida y vuelta); la TGC la devuelve: el contraste mostrado es 0, el crudo no
    const mirror = [100, 100, 100, 100];
    const data = new Float32Array(lines * samples);
    for (let k = 0; k < samples; k++) for (let u = 0; u < lines; u++) data[k * lines + u] = 10 ** ((-0.3 * (k + 0.5)) / 20);
    const tgc = (envDb: number, r: number) => envDb + 0.3 * r;
    const r = mirrorContrast({ lines, samples, data }, mirror, depth, tgc);
    expect(r.contrastDb).toBeCloseTo(0, 6);
    expect(r.rawContrastDb).toBeGreaterThan(8);
  });

  it('mutación «sin espejo, el rayo sigue recto»: detrás del espejo solo el ruido: el virtual no está presente', () => {
    const mirror = [100, 100, 100, 100];
    // el real a −70 dB mostrados, el virtual en el ruido (−100): bajo el umbral de presencia; con el espejo, a −72, sobre él
    const absent = mirrorContrast(frame(mirror, 10 ** (-70 / 20), 1e-5), mirror, depth, flat);
    expect(absent.virtualDb).toBeLessThan(PRESENT_MIN_DB);
    const present = mirrorContrast(frame(mirror, 10 ** (-70 / 20), 10 ** (-72 / 20)), mirror, depth, flat);
    expect(present.virtualDb).toBeGreaterThanOrEqual(PRESENT_MIN_DB);
  });

  it('la columna: el nivel mostrado a ±3 mm de donde la línea recta la encontraría', () => {
    const data = new Float32Array(lines * samples).fill(0.5);
    for (let u = 0; u < lines; u++) data[130 * lines + u] = 50;
    const c = columnLevel({ lines, samples, data }, [130.5, -1, 130.5, -1], depth, flat);
    expect(c.lines).toBe(2);
    expect(c.columnDb).toBeGreaterThan(20);
    expect(columnLevel({ lines, samples, data }, [-1, -1, -1, -1], depth, flat).columnDb).toBeNaN();
  });

  it('sin líneas medibles no inventa un número', () => {
    const far = depth - MIRROR_WINDOW.gapMm - MIRROR_WINDOW.lengthMm + 1;
    const r = mirrorContrast(frame([far, -1, -1, 5], 1, 1), [far, -1, -1, 5], depth, flat);
    expect(r.lines).toBe(0);
    expect(r.contrastDb).toBeNaN();
    expect(() => mirrorContrast(frame([1, 1, 1, 1], 1, 1), [1, 1], depth, flat)).toThrow(RangeError);
  });
});
