import { describe, expect, it } from 'vitest';
import { bandCorrelation, bandRows, bandSpectrum } from '../measure/lungPulse';
import { PLEURA_GLSL } from '../ultrasound/pleura';
import { FRAG_QUERY, FRAG_RAWFIELD } from '../ultrasound/shaders/passes.glsl';

/**
 * La medida del pulso pulmonar y de la estratósfera en el modo M (decisión 32, `src/measure/lungPulse.ts`), sobre franjas
 * sintéticas: una arena que se desliza con un periodo dado (el pulso) y una quieta (la estratósfera). Y las guardas de texto
 * de la GLSL: sin el latido en `slidingField`, la arena no se mueve (la e2e lo comprueba en la imagen).
 */
function texture(n: number, seed: number): number[] {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return Math.floor((s / 2 ** 31) * 200);
  });
}
/** Franja de `n` columnas a `dt`: la arena de la banda desplazada `shift(t)` filas (entero, como un grano que cambia). */
function strip(n: number, dt: number, shift: (t: number) => number): { columns: number[][]; times: number[] } {
  const tex = texture(400, 7);
  const columns: number[][] = [];
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const s = Math.round(shift(t));
    columns.push(Array.from({ length: 100 }, (_, r) => tex[(r + s + 200) % 400]));
    times.push(t);
  }
  return { columns, times };
}

describe('la banda bajo la pleura', () => {
  it('son las filas entre las dos profundidades bajo la pleura', () => {
    const rows = bandRows(16, 1, 6, 512, 120);
    // 120 mm en 512 filas: 0,234 mm por fila; de 17 a 22 mm
    expect(rows.length).toBe(21);
    expect(((rows[0] + 0.5) / 512) * 120).toBeGreaterThanOrEqual(17);
    expect(((rows[rows.length - 1] + 0.5) / 512) * 120).toBeLessThanOrEqual(22);
  });
});

describe('F-T11: la estratósfera', () => {
  const rows = Array.from({ length: 30 }, (_, i) => 20 + i);
  it('quieta, la correlación es 1; con la arena que se mueve con el latido, cae', () => {
    const still = strip(40, 0.1, () => 0);
    expect(bandCorrelation(still.columns, still.times, rows, 2)).toBe(1);
    const pulse = strip(40, 0.1, (t) => 8 * Math.max(0, Math.sin(2 * Math.PI * 1.2 * t)));
    expect(bandCorrelation(pulse.columns, pulse.times, rows, 2)).toBeLessThan(0.5);
  });
  it('mira solo columnas separadas ≤ la ventana', () => {
    // la arena cambia una vez a los 3 s: dentro de 2 s nada se mueve salvo en el salto
    const step = strip(60, 0.1, (t) => (t < 3 ? 0 : 50));
    expect(bandCorrelation(step.columns.slice(0, 25), step.times.slice(0, 25), rows, 2)).toBe(1);
    expect(bandCorrelation(step.columns, step.times, rows, 2)).toBeLessThan(0.5);
  });
  it('rechaza una banda de menos de 3 filas y largos distintos', () => {
    const s = strip(10, 0.1, () => 0);
    expect(() => bandCorrelation(s.columns, s.times, [1, 2], 2)).toThrow(RangeError);
    expect(() => bandCorrelation(s.columns, s.times.slice(1), rows, 2)).toThrow(RangeError);
  });
});

describe('S3: el pico espectral del pulso pulmonar', () => {
  const rows = Array.from({ length: 30 }, (_, i) => 20 + i);
  it('la arena que se mueve con un periodo da el pico a su frecuencia, muy sobre la mediana', () => {
    for (const hz of [0.75, 1.25, 2]) {
      const s = strip(96, 1 / 24, (t) => 6 * (0.5 - 0.5 * Math.cos(2 * Math.PI * hz * t)));
      const sp = bandSpectrum(s.columns, 1 / 24, rows);
      expect(Math.abs(sp.peakHz - hz)).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(sp.peakOverMedian).toBeGreaterThan(10);
    }
  });
  it('quieta no tiene pico; la frecuencia de cada línea es k/T', () => {
    const s = strip(48, 1 / 12, () => 0);
    const sp = bandSpectrum(s.columns, 1 / 12, rows);
    expect(sp.peakOverMedian).toBe(0);
    expect(sp.hz[0]).toBeCloseTo(0.25, 12);
    expect(sp.hz.length).toBe(24);
  });
  it('rechaza menos de 8 columnas, un intervalo no positivo y una banda de frecuencias vacía', () => {
    const s = strip(12, 0.1, () => 0);
    expect(() => bandSpectrum(s.columns.slice(0, 7), 0.1, rows)).toThrow(RangeError);
    expect(() => bandSpectrum(s.columns, 0, rows)).toThrow(RangeError);
    expect(() => bandSpectrum(s.columns, 0.1, rows, 50, 60)).toThrow(RangeError);
  });
});

describe('el latido en la GLSL (decisión 32)', () => {
  it('la arena del deslizamiento se ancla al punto del pulmón antes del latido, y la consulta lo devuelve', () => {
    // lus-sim (decisión 51): la mirada 0 lo calcula una vez (lo usan también las trampas de las líneas B); la dirigida, en slidingField
    expect(PLEURA_GLSL).toContain(
      'vec2 slidingField(vec3 pD, float h, float salt) { return slidingFieldAt(lungPulseInverse(toMaterial(pD)), h, salt); }',
    );
    expect(FRAG_RAWFIELD).toContain('vec3 mD = needM ? lungPulseInverse(toMaterial(pD)) : vec3(0.0);');
    expect(FRAG_QUERY).toContain('o3 = vec4(lungPulseInverse(m) - m, uLungPulse);');
  });
});
