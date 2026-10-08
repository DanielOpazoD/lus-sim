import { gainOverPresetDb } from '../app/bLineClip';
import { DEFAULT_BMODE } from '../ultrasound/renderer';
import { describe, expect, it } from 'vitest';
import { B_LINE_DETECTOR, clipBLines, detectBLines, type PolarFrame } from '../measure/bLines';

/**
 * El detector de líneas B (decisión 51, `measure/bLines.ts`) sobre cuadros polares sintéticos en dB de la pantalla: la pared
 * (−20 dB) sobre la pleura (40 dB a D = 20 mm), sus líneas A y la neblina (−20 ± 3 dB) debajo, y columnas de línea B que nacen en
 * la pleura donde se pidan; `ribs`, líneas con la cortical de una costilla 5 mm sobre la pleura y sombra debajo. Cada prueba mata
 * una regla del detector: el valle, la mediana, la banda que se sostiene, el origen en la pleura, el %/10 solo de lo confluente,
 * la pleura del cuadro como referencia y la sombra costal.
 */
function syntheticFrame(
  columns: Array<{ at: number; width: number; db?: number; untilMm?: number; fromSkin?: boolean }>,
  opts: {
    lines?: number;
    noise?: number;
    ribs?: [number, number];
    spikes?: number;
    /** Líneas con la pleura 25 dB más tenue (un cartílago que deja pasar poco) y lo demás igual. */
    dimPleura?: [number, number];
    /** Líneas en sombra con un eco de la pared a 6 mm tan brillante como la pleura, su reverberación y un brillo debajo. */
    fascia?: [number, number];
    /** Ganancia (dB) y blanco de la pantalla (dB): el nivel se recorta en el blanco. */
    gainDb?: number;
    whiteDb?: number;
    /** Un eco de la pared en todas las líneas, a 13 mm, con este nivel (dB). */
    wallEchoDb?: number;
  } = {},
): PolarFrame & { level: Float32Array } {
  const lines = opts.lines ?? 128;
  const samples = 512;
  const sampleMm = 0.2;
  const D = 20;
  const level = new Float32Array(lines * samples);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296 - 0.5) * (opts.noise ?? 6);
  for (let s = 0; s < samples; s++) {
    const r = s * sampleMm;
    for (let l = 0; l < lines; l++) {
      const rib = opts.ribs && l >= opts.ribs[0] && l < opts.ribs[1];
      const dim = opts.dimPleura && l >= opts.dimPleura[0] && l < opts.dimPleura[1];
      const fascia = opts.fascia && l >= opts.fascia[0] && l < opts.fascia[1];
      const wallEcho = opts.wallEchoDb !== undefined && Math.abs(r - 13) < 0.6;
      let v = -20 + rnd();
      if (fascia) {
        v = Math.abs(r - 6) < 0.6 ? 40 : Math.abs(r - 12) < 0.6 ? 30 : r > 6 ? 20 + rnd() * 0.5 : -20 + rnd();
      } else if (rib) {
        v = r < D - 5.6 ? -20 + rnd() : Math.abs(r - (D - 5)) < 0.6 ? 38 : -60 + rnd();
      } else {
        if (Math.abs(r - D) < 0.6) v = dim ? 15 : 40;
        for (let k = 2; k < 6; k++) if (Math.abs(r - k * D) < 0.6) v = Math.max(v, 30 - 6 * k);
        for (const c of columns) {
          const x = (l - c.at) / c.width;
          const on = (c.fromSkin ? r > 1 : r > D) && r < D + (c.untilMm ?? 1e9);
          if (on) v = Math.max(v, (c.db ?? 20) - 12 * x * x + rnd() * 0.5);
        }
        // picos sueltos muy brillantes (2 de cada 5 muestras bajo la pleura en una línea): la media sube, la mediana no
        if (opts.spikes !== undefined && l === opts.spikes && r > D + 6 && s % 5 < 2) v = 60;
      }
      if (wallEcho) v = Math.max(v, opts.wallEchoDb!);
      level[s * lines + l] = Math.min(opts.whiteDb ?? Infinity, v + (opts.gainDb ?? 0));
    }
  }
  return { lines, samples, sampleMm, level, apexMm: 0, lineStepRad: 0.5 };
}

describe('Detector de líneas B (measure/bLines.ts), sobre cuadros sintéticos', () => {
  it('halla la pleura en la imagen; un pulmón con solo líneas A no tiene ninguna', () => {
    const d = detectBLines(syntheticFrame([]));
    expect(d.count).toBe(0);
    expect(d.whiteFraction).toBe(0);
    expect(d.pleuraDb).toBeCloseTo(40, 6);
    expect(d.visibleLines).toBe(128);
    for (const D of d.pleuraMm) expect(Math.abs(D - 20)).toBeLessThan(0.7);
  });

  it('cuenta las líneas discretas y da su posición; dos que se tocan, separadas por su valle', () => {
    const d = detectBLines(
      syntheticFrame([
        { at: 20, width: 1.5 },
        { at: 60, width: 1.5 },
        { at: 100, width: 1.5 },
      ]),
    );
    expect(d.count).toBe(3);
    expect(d.confluent).toBe(false);
    expect(d.positions.map((p) => Math.round(p / 10) * 10)).toEqual([20, 60, 100]);
    // dos líneas a 4 líneas (2 mm): un solo tramo con un valle de ≈ 8 dB entre ellas; sin el valle sería una
    expect(
      detectBLines(
        syntheticFrame([
          { at: 60, width: 2.5 },
          { at: 64, width: 2.5 },
        ]),
      ).discrete,
    ).toBe(2);
  });

  it('la mediana de la columna: picos sueltos muy brillantes no hacen una línea B', () => {
    expect(detectBLines(syntheticFrame([], { spikes: 100 })).count).toBe(0);
  });

  it('una columna corta (≤ 12 mm bajo la pleura) no cuenta; una franja que baja desde la piel no nace en la pleura', () => {
    expect(detectBLines(syntheticFrame([{ at: 64, width: 1.5, untilMm: 12 }])).count).toBe(0);
    expect(detectBLines(syntheticFrame([{ at: 64, width: 1.5, fromSkin: true }])).count).toBe(0);
    expect(detectBLines(syntheticFrame([{ at: 64, width: 1.5 }])).count).toBe(1);
  });

  it('confluencia: el tramo ancho entra por el %/10, no por sus máximos; el mixto, el mayor de los dos', () => {
    const white = detectBLines(syntheticFrame([{ at: 64, width: 40, db: 25 }], { noise: 12 }));
    expect(white.confluent).toBe(true);
    expect(white.whiteFraction).toBeGreaterThan(0.6);
    expect(white.discrete).toBe(0);
    expect(white.count).toBe(Math.round(10 * white.whiteFraction));
    const mixed = detectBLines(
      syntheticFrame([
        { at: 20, width: 12, db: 25 },
        { at: 70, width: 1.5 },
        { at: 90, width: 1.5 },
        { at: 110, width: 1.5 },
      ]),
    );
    expect(mixed.confluent).toBe(true);
    expect(mixed.discrete).toBe(3);
    expect(mixed.count).toBe(Math.max(3, Math.round(10 * mixed.whiteFraction)));
  });

  it('frente a la pleura del cuadro: la ganancia no cambia el conteo, ni una TGC distal de −2 dB/cm', () => {
    const f = syntheticFrame([
      { at: 30, width: 1.5 },
      { at: 90, width: 1.5 },
    ]);
    const n = detectBLines(f).count;
    expect(n).toBe(2);
    expect(detectBLines({ ...f, level: Float32Array.from(f.level, (v) => v + 12) }).count).toBe(n);
    const tgc = Float32Array.from(f.level, (v, i) => v - 0.2 * Math.max(0, Math.floor(i / f.lines) * f.sampleMm - 20));
    expect(detectBLines({ ...f, level: tgc }).count).toBe(n);
    expect(B_LINE_DETECTOR.params.marginDb.value).toBeGreaterThan(20);
  });

  it('bajo una costilla no hay pleura visible (sin reverberación debajo), y un clip se lee en su peor cuadro', () => {
    const d = detectBLines(syntheticFrame([{ at: 40, width: 1.5 }], { ribs: [30, 50] }));
    expect(d.count).toBe(0);
    expect(d.visibleLines).toBe(108);
    const frames = [
      detectBLines(syntheticFrame([{ at: 80, width: 1.5 }])),
      detectBLines(
        syntheticFrame([
          { at: 20, width: 1.5 },
          { at: 80, width: 1.5 },
        ]),
      ),
      d,
    ];
    expect(clipBLines(frames).count).toBe(2);
    expect(() => clipBLines([])).toThrow();
  });

  it('una pleura en sombra (25 dB más tenue que la del cuadro) no es visible: no entra en el ancho de la pleura', () => {
    const d = detectBLines(syntheticFrame([{ at: 80, width: 1.5 }], { dimPleura: [30, 50] }));
    expect(d.visibleLines).toBe(108);
    expect(d.count).toBe(1);
    // el blanco se mide sobre la pleura visible: 20 líneas menos
    const all = detectBLines(syntheticFrame([{ at: 80, width: 1.5 }]));
    expect(d.whiteFraction).toBeCloseTo((all.whiteFraction * 128) / 108, 6);
  });

  it('un eco de la pared tan brillante como la pleura, a 6 mm, no es la pleura (ni lo que tiene debajo, una línea B)', () => {
    const d = detectBLines(syntheticFrame([], { fascia: [30, 50] }));
    expect(d.visibleLines).toBe(108);
    expect(d.count).toBe(0);
  });

  it('con mucha ganancia (la pleura satura) el pulmón normal no se vuelve blanco: una línea B es hiperecoica frente a la pared', () => {
    // +30 dB y el blanco en 40: la pleura satura y la neblina (−20 + 30) llega al margen frente a ella, pero no sobre la pared
    expect(detectBLines(syntheticFrame([], { gainDb: 30, whiteDb: 40 })).count).toBe(0);
    expect(detectBLines(syntheticFrame([{ at: 64, width: 1.5 }], { gainDb: 30, whiteDb: 40 })).count).toBe(1);
  });

  it('fuera del rango de operación (ganancia sobre el preajuste) o con la pared casi en el blanco, el cuadro no se lee: NaN, no 0', () => {
    const line = syntheticFrame([{ at: 64, width: 1.5 }]);
    expect(detectBLines({ ...line, gainOverPresetDb: 25 }).count).toBe(1);
    const d = detectBLines({ ...line, gainOverPresetDb: 25.5 });
    expect(d.saturated).toBe(true);
    expect(d.saturatedBy).toBe('gain');
    expect(d.count).toBeNaN();
    // la pared (−20 + ganancia) a menos de wallContrastDb (6 dB) del blanco (40): ninguna columna puede ser hiperecoica frente a ella
    const wall = (gainDb: number) => detectBLines({ ...syntheticFrame([{ at: 64, width: 1.5 }], { gainDb, whiteDb: 40 }), whiteDb: 40 });
    expect(wall(57).saturatedBy).toBe('wall');
    expect(wall(57).count).toBeNaN();
    expect(wall(50).saturated).toBe(false);
    expect(wall(50).count).toBe(1);
    // un clip descarta los cuadros ilegibles (en cualquier orden) y, si todos lo están, su conteo es NaN
    const good = detectBLines(line);
    expect(clipBLines([d, good]).count).toBe(1);
    expect(clipBLines([good, d]).count).toBe(1);
    expect(clipBLines([d, d]).count).toBeNaN();
  });

  it('el blanco confluente bajo una pleura saturada se lee y da su %/10', () => {
    // la pleura (40 + 25) y el blanco que sigue (25 + 25) saturan sin hueco entre ellos
    for (const gain of [15, 20, 25]) {
      const d = detectBLines({ ...syntheticFrame([{ at: 64, width: 60, db: 25 }], { gainDb: gain, whiteDb: 40 }), whiteDb: 40 });
      expect(d.saturated, `+${gain}`).toBe(false);
      expect(d.confluent, `+${gain}`).toBe(true);
      expect(d.count, `+${gain}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('con la pleura saturada, la pleura es el primer eco en el blanco (no un eco de la pared 10 dB más tenue)', () => {
    // +25 dB y el blanco en 40: la pleura (65) satura; el eco de la pared a 13 mm queda en 33 (7 dB bajo el blanco)
    const f = { ...syntheticFrame([], { wallEchoDb: 8, gainDb: 25, whiteDb: 40 }), whiteDb: 40 };
    const d = detectBLines(f);
    expect(d.saturated).toBe(false);
    for (const D of d.pleuraMm) expect(Math.abs(D - 20)).toBeLessThan(0.7);
    expect(d.count).toBe(0);
  });

  it('el rango mira la ganancia y la TGC de la piel a lo que lee (la pleura + 36 mm): una TGC bajo la pleura lo saca', () => {
    // la pleura a 20 mm: el contador lee hasta 56 mm (la muestra 280)
    const line = syntheticFrame([{ at: 64, width: 1.5 }]);
    const curve = (fromMm: number, db: number, base = 0) =>
      Float32Array.from({ length: line.samples }, (_, s) => (s * line.sampleMm >= fromMm ? base + db : base));
    expect(detectBLines({ ...line, gainOverPresetDb: curve(30, 6) }).count).toBe(1);
    expect(detectBLines({ ...line, gainOverPresetDb: curve(30, 6.5) }).saturatedBy).toBe('gain');
    expect(detectBLines({ ...line, gainOverPresetDb: curve(30, -6.5) }).saturatedBy).toBe('gain');
    // la TGC más honda que lo que lee no cuenta; la ganancia sí, a cualquier profundidad que lea
    expect(detectBLines({ ...line, gainOverPresetDb: curve(60, 15) }).count).toBe(1);
    expect(detectBLines({ ...line, gainOverPresetDb: curve(50, 5, 20) }).count).toBe(1);
    expect(detectBLines({ ...line, gainOverPresetDb: curve(54, 5.5, 20) }).saturatedBy).toBe('gain');
    expect(detectBLines({ ...line, gainOverPresetDb: curve(58, 5.5, 20) }).count).toBe(1);
  });

  it('sin pleura hallada, el rango mira la imagen entera', () => {
    // costillas en todas las líneas: ninguna pleura visible; la ganancia pasa el límite solo a partir de 50 mm
    const f = syntheticFrame([], { ribs: [0, 128] });
    expect(detectBLines(f).visibleLines).toBe(0);
    const curve = Float32Array.from({ length: f.samples }, (_, s) => (s * f.sampleMm >= 50 ? 30 : 0));
    expect(detectBLines({ ...f, gainOverPresetDb: curve }).saturatedBy).toBe('gain');
  });

  it('un blanco hondo que satura bajo una pleura que no satura no es la pleura (el pulmón blanco se lee)', () => {
    // la pleura (40) a 20 mm bajo el blanco (45); el pulmón blanco debajo (30) y, desde 40 mm, en el blanco
    const f = syntheticFrame([{ at: 64, width: 120, db: 30 }], { whiteDb: 45 });
    for (let s = 0; s < f.samples; s++) if (s * f.sampleMm >= 40) for (let l = 0; l < f.lines; l++) f.level[s * f.lines + l] = 45;
    const d = detectBLines({ ...f, whiteDb: 45 });
    for (const D of d.pleuraMm.filter((x) => x > 0)) expect(Math.abs(D - 20)).toBeLessThan(0.7);
    expect(d.visibleLines).toBeGreaterThan(100);
    expect(d.confluent && d.count >= 8).toBe(true);
  });

  it('la curva de ganancia sobre el preajuste que la cadena da al contador: la ganancia y la TGC en cada profundidad', () => {
    const f = 3.5;
    const at = (b: Partial<typeof DEFAULT_BMODE>) => gainOverPresetDb({ ...DEFAULT_BMODE, ...b }, f, 600);
    for (const v of at({})) expect(v).toBeCloseTo(0, 6);
    for (const v of at({ gainDb: DEFAULT_BMODE.gainDb + 30 })) expect(v).toBeCloseTo(30, 6);
    // con 60 mm de profundidad y +15 en las bandas 4–7, la TGC sube desde ≈ 34 mm (bajo la pleura) hasta el fondo
    const deep = at({ depthMm: 60, tgcDb: [0, 0, 0, 0, 15, 15, 15, 15] });
    expect(deep[50]).toBeCloseTo(0, 6); // 5 mm
    expect(deep[599]).toBeCloseTo(15, 6); // 60 mm
    expect(deep[400]).toBeGreaterThan(10); // 40 mm
  });
});
