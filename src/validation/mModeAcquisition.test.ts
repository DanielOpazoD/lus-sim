import { describe, expect, it } from 'vitest';
import { MModeAcquisition } from '../app/mModeAcquisition';

type Source = Parameters<MModeAcquisition['prepare']>[0];
function fixture() {
  let clears = 0;
  const source: Source = {
    frozen: false,
    pose: { phi: 0, z: 0, lift: 0, yaw: 0, rock: 0, tilt: 0 },
    transducer: { halfSector: Math.PI / 4 },
    bmode: {
      depthMm: 120,
      focusMm: 18,
      gainDb: -20,
      dynamicRangeDb: 70,
      persistence: 0,
      compound: false,
      harmonic: false,
      tgcDb: Array<number>(8).fill(0),
    },
    renderer: { mStrip: { clear: () => clears++ } },
  };
  return { source, clears: () => clears, acquisition: new MModeAcquisition() };
}

describe('Modo M: una franja, una adquisición', () => {
  it('apagado no prepara una línea ni borra GPU; al activar solo inicia una franja', () => {
    const { source, clears, acquisition } = fixture();
    expect(acquisition.prepare(source, false, 0)).toBeUndefined();
    expect(clears()).toBe(0);
    expect(acquisition.prepare(source, true, 0.2)).toBe(0.2);
    expect(clears()).toBe(1);
    for (let i = 0; i < 10; i++) acquisition.prepare(source, true, 0.2);
    expect(clears()).toBe(1);
  });

  it.each(['phi', 'z', 'lift', 'yaw', 'rock', 'tilt'] as const)('otra %s descarta la franja anterior, aun mutada en sitio', (key) => {
    const { source, clears, acquisition } = fixture();
    acquisition.prepare(source, true, 0);
    source.pose[key] += 0.01;
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(2);
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(2);
  });

  it.each(['depthMm', 'focusMm', 'gainDb', 'dynamicRangeDb', 'persistence'] as const)('otro %s no se mezcla', (key) => {
    const { source, clears, acquisition } = fixture();
    acquisition.prepare(source, true, 0);
    source.bmode = { ...source.bmode, [key]: source.bmode[key] + 1 };
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(2);
  });

  it.each(['compound', 'harmonic'] as const)('otro procesamiento %s no se mezcla', (key) => {
    const { source, clears, acquisition } = fixture();
    acquisition.prepare(source, true, 0);
    source.bmode = { ...source.bmode, [key]: true };
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(2);
  });

  it('copia la TGC, compara sus bandas y no depende de la identidad de los ajustes', () => {
    const { source, clears, acquisition } = fixture();
    const bands = Array<number>(8).fill(0);
    source.bmode = { ...source.bmode, tgcDb: bands };
    acquisition.prepare(source, true, 0);
    source.bmode = { ...source.bmode };
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(1);
    bands[3] = 1;
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(2);
    source.bmode = { ...source.bmode, tgcDb: [0, 0] };
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(3);
  });

  it('otra línea, reactivar y reiniciar inician franjas, no reconstruyen historia', () => {
    const { source, clears, acquisition } = fixture();
    acquisition.prepare(source, true, 0);
    acquisition.prepare(source, true, 0.1);
    expect(clears()).toBe(2);
    acquisition.prepare(source, false, 0.1);
    acquisition.prepare(source, true, 0.1);
    expect(clears()).toBe(3);
    acquisition.reset();
    acquisition.prepare(source, true, 0.1);
    expect(clears()).toBe(4);
  });

  it('congelar conserva la historia y no prepara ni modifica una línea', () => {
    const { source, clears, acquisition } = fixture();
    acquisition.prepare(source, true, 0);
    source.frozen = true;
    expect(acquisition.prepare(source, true, 0)).toBeUndefined();
    expect(clears()).toBe(1);
    source.frozen = false;
    acquisition.prepare(source, true, 0);
    expect(clears()).toBe(1);
  });

  it('otro paciente o renderizador nunca reutiliza la adquisición anterior', () => {
    const { source, clears, acquisition } = fixture();
    acquisition.prepare(source, true, 0);
    const next = { ...source };
    acquisition.prepare(next, true, 0);
    expect(clears()).toBe(2);
    next.renderer = { mStrip: { clear: () => source.renderer.mStrip.clear() } };
    acquisition.prepare(next, true, 0);
    expect(clears()).toBe(3);
  });

  it.each([NaN, Infinity, -Infinity, Math.PI, -Math.PI])('rechaza una línea inválida %s antes de tocar GPU', (theta) => {
    const { source, clears, acquisition } = fixture();
    expect(() => acquisition.prepare(source, true, theta)).toThrow(RangeError);
    expect(clears()).toBe(0);
  });
});
