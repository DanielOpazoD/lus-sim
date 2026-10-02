import { describe, expect, it } from 'vitest';
import {
  ASYMMETRY_BAND,
  estimateGreyMap,
  fitGreyMap,
  fitGreyMapAcrossGains,
  dbOfGreyMap,
  mapOfLine,
  RAYLEIGH_P90_P50_DB,
  RAYLEIGH_QUANTILE_ASYMMETRY,
  rayleighQuantile,
  SPECKLE_LOG_SD_DB,
  speckleTiles,
} from '../measure/fidelity/speckleMap';
import { GREY_8BIT } from '../measure/fidelity/sector';
import {
  greyOfDb,
  SYNTHETIC_GREY_MAP as S,
  syntheticGreyMapFrames,
  syntheticGreyMapGeometry,
  type SyntheticGreyMapOptions,
} from './support/syntheticGreyMap';

/**
 * El estimador del mapa de grises desde el moteado (decisión 31) sobre cuadros sintéticos de Rayleigh con un mapa conocido
 * (`support/syntheticGreyMap.ts`). Tolerancias declaradas antes de mirar los clips: con teselas de 16 px y grano ≤ 1 px,
 * c a ±15 % (±0,3 si c < 2) y el rango dinámico a ±8 %. El sesgo es sistemático, no ruido: RD sale +2 % con grano de
 * 0,6 px y +4–5,5 % con grano de 1 px en todas las semillas (las teselas de 16 px tienen pocas muestras independientes), así
 * que el margen frente a ±8 % es de ~3 puntos; el grano medido lo vigila (MIN_TILE_GRAINS).
 */
const run = (p: Partial<SyntheticGreyMapOptions>, frames = 2) => {
  const o = { ...S, ...p };
  return estimateGreyMap(syntheticGreyMapFrames(o, frames), syntheticGreyMapGeometry(o), { tile: 16 });
};
const cOk = (c: number, truth: number): boolean => Math.abs(c - truth) <= Math.max(0.15 * Math.abs(truth), Math.abs(truth) < 2 ? 0.3 : 0);

describe('constantes del moteado de Rayleigh', () => {
  it('DE de 20·log₁₀A 5,57 dB; p90 − p50 5,21 dB; asimetría por cuantiles 1,57', () => {
    expect(SPECKLE_LOG_SD_DB).toBeCloseTo(5.57, 3);
    expect(RAYLEIGH_P90_P50_DB).toBeCloseTo(5.214, 2);
    expect(RAYLEIGH_QUANTILE_ASYMMETRY).toBeCloseTo(1.569, 2);
    expect(rayleighQuantile(1 - Math.exp(-1))).toBeCloseTo(1, 12);
  });

  it('la recta de los cuantiles da c y el rango dinámico del mapa (y el logaritmo puro con pendiente 0)', () => {
    const q = (20 * Math.log(4.5)) / Math.LN10 / 70;
    const slope = Math.pow(rayleighQuantile(0.9) / rayleighQuantile(0.5), q) - 1;
    const m = mapOfLine(slope, (slope * 255) / 3.5, 255);
    expect(m.c).toBeCloseTo(3.5, 9);
    expect(m.rangeDb).toBeCloseTo(70, 9);
    expect(mapOfLine(0, (RAYLEIGH_P90_P50_DB * 255) / 60, 255)).toEqual({ c: 0, rangeDb: 60 });
    expect(Number.isNaN(mapOfLine(0.1, -1, 255).c)).toBe(true);
    // un mapa que aplasta los grises bajos (c = −0,6): pendiente negativa, ordenada positiva
    const qn = (20 * Math.log(0.4)) / Math.LN10 / 60;
    const sn = Math.pow(rayleighQuantile(0.9) / rayleighQuantile(0.5), qn) - 1;
    expect(sn).toBeLessThan(0);
    const n = mapOfLine(sn, (sn * 255) / -0.6, 255);
    expect(n.c).toBeCloseTo(-0.6, 9);
    expect(n.rangeDb).toBeCloseTo(60, 9);
    // la recta de un c ≤ −1 no es de la familia
    expect(Number.isNaN(mapOfLine(-0.05, 5, 255).c)).toBe(true);
  });

  it('los dB de un gris por el mapa: diferencias exactas para c > 0, c = 0 y c < 0', () => {
    for (const [c, rd] of [
      [3.5, 70],
      [0, 60],
      [-0.6, 60],
    ] as const) {
      const g = (db: number): number => greyOfDb(db, c, rd);
      expect(dbOfGreyMap(g(-10), c, rd, 255) - dbOfGreyMap(g(-40), c, rd, 255)).toBeCloseTo(30, 6);
    }
  });
});

describe('estimador de una imagen sobre moteado de Rayleigh con un mapa conocido', () => {
  it.each<[string, Partial<SyntheticGreyMapOptions>, number, number]>([
    ['la curva del simulador (c 3,5, 70 dB)', {}, 3.5, 70],
    ['logarítmico puro (60 dB)', { c: 0, rangeDb: 60 }, 0, 60],
    ['c 1, 60 dB', { c: 1, rangeDb: 60 }, 1, 60],
    ['c 8, 80 dB', { c: 8, rangeDb: 80 }, 8, 80],
    ['c −0,6 (aplasta los grises bajos), 60 dB', { c: -0.6, rangeDb: 60 }, -0.6, 60],
    ['con recorte en el negro y el blanco (50 dB)', { rangeDb: 50 }, 3.5, 50],
    ['grano fino (0,6 px)', { grain: 0.6 }, 3.5, 70],
  ])('%s', (_name, p, c, rangeDb) => {
    const e = run(p);
    expect(cOk(e.c, c), `c ${e.c}`).toBe(true);
    expect(Math.abs(e.rangeDb / rangeDb - 1), `RD ${e.rangeDb}`).toBeLessThanOrEqual(0.08);
    expect(e.asymmetry).toBeGreaterThan(ASYMMETRY_BAND[0]);
    expect(e.asymmetry).toBeLessThan(ASYMMETRY_BAND[1]);
    expect(e.reliable, e.reasons.join('; ')).toBe(true);
  });

  it('el moteado suavizado (la interpolación entre líneas) no cambia c pero sube el rango dinámico: la asimetría lo delata', () => {
    for (const k of [2, 3]) {
      const e = run({ interpolate: k });
      expect(cOk(e.c, 3.5), `c ${e.c}`).toBe(true);
      expect(e.rangeDb).toBeGreaterThan(1.1 * 70);
      // la interpolación mezcla píxeles intactos y promediados: la asimetría baja poco (1,43–1,45), pero sale de la banda
      expect(e.asymmetry).toBeGreaterThan(1.3);
      expect(e.asymmetry).toBeLessThan(ASYMMETRY_BAND[0]);
      expect(e.reliable).toBe(false);
    }
  });

  it('la persistencia (dos cuadros promediados en el gris): RD un tercio más alto, y la asimetría lo delata', () => {
    const e = run({ looks: 2 });
    expect(cOk(e.c, 3.5), `c ${e.c}`).toBe(true);
    expect(e.rangeDb).toBeGreaterThan(1.25 * 70);
    expect(e.asymmetry).toBeLessThan(ASYMMETRY_BAND[0]);
    expect(e.reliable).toBe(false);
  });

  it('los dB entre dos grises por el mapa estimado, solo dentro de los grises que cubren las teselas', () => {
    const e = run({});
    const g = (db: number): number => greyOfDb(db, 3.5, 70);
    // 30 dB entre −50 y −20 (dentro): con el sesgo de RD (+4–5,5 %), a ±8 %
    expect(Math.abs(e.dbBetween(g(-50), g(-20)) / 30 - 1)).toBeLessThan(0.08);
    // fuera (el negro, por debajo de la franja más oscura): NaN, no una extrapolación
    expect(e.greySpan[0]).toBeGreaterThan(8);
    expect(Number.isNaN(e.dbBetween(0, g(-20)))).toBe(true);
  });

  it('el ruido de recepción sumado al eco antes de la detección no lo sesga: la suma sigue siendo de Rayleigh', () => {
    const e = run({ noiseDb: -45 });
    expect(cOk(e.c, 3.5), `c ${e.c}`).toBe(true);
    expect(Math.abs(e.rangeDb / 70 - 1), `RD ${e.rangeDb}`).toBeLessThanOrEqual(0.08);
    expect(e.reliable, e.reasons.join('; ')).toBe(true);
  });

  it('el grano grueso sesga el rango dinámico hacia arriba con teselas pequeñas: lo rechaza el grano medido', () => {
    for (const grain of [2, 3]) {
      const o = { ...S, grain };
      const frames = syntheticGreyMapFrames(o, 2);
      const g = syntheticGreyMapGeometry(o);
      const small = estimateGreyMap(frames, g, { tile: 16 });
      const large = estimateGreyMap(frames, g, { tile: 16 * grain, minPerBin: 3, minTiles: 50 });
      expect(small.rangeDb).toBeGreaterThan(1.1 * 70);
      expect(small.reliable).toBe(false);
      expect(small.reasons.join(' ')).toMatch(/grano grueso/);
      // el grano medido (el desfase con autocorrelación 0,5) crece con el de la PSF
      expect(small.grainPx[0]).toBeGreaterThan(0.7 * grain);
      expect(Math.abs(large.rangeDb / 70 - 1)).toBeLessThan(0.08);
      expect(large.reasons.join(' ')).not.toMatch(/grano grueso/);
    }
  });

  it('un moteado que no es de Rayleigh (una textura de 5 dB encima, como la pared del simulador): el diagnóstico lo delata', () => {
    const e = run({ textureDb: 5 });
    expect(e.asymmetry).toBeLessThan(ASYMMETRY_BAND[0]);
    expect(e.reliable).toBe(false);
    expect(e.reasons.join(' ')).toMatch(/asimetría/);
    // y el rango dinámico que daría, suponiendo Rayleigh, saldría muy bajo: la dispersión es más ancha que 5,21 dB
    expect(e.rangeDb).toBeLessThan(0.8 * 70);
  });

  it('sin moteado que medir: lo dice y no da el mapa por fiable', () => {
    const o = { ...S, levelsDb: [-30] };
    const e = estimateGreyMap(syntheticGreyMapFrames(o, 1), syntheticGreyMapGeometry(o), { tile: 16 });
    expect(e.reliable).toBe(false);
    expect(e.reasons.join(' ')).toMatch(/franjas|grises/);
    expect(fitGreyMap([]).reliable).toBe(false);
    expect(() => speckleTiles([], syntheticGreyMapGeometry(S))).toThrow(/sin cuadros/);
  });

  it('las teselas con estructura (un borde entre dos niveles) o recortadas quedan fuera', () => {
    // dos franjas de 40 px: las teselas que cruzan el borde no entran
    const o = { ...S, height: 80, levelsDb: [-40, -10] };
    const tiles = speckleTiles(syntheticGreyMapFrames(o, 1), syntheticGreyMapGeometry(o), { tile: 16, scale: GREY_8BIT });
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(t.y + 16 <= 40 || t.y >= 40, `${t.y}`).toBe(true);
  });
});

describe('la familia de mapas con un barrido de ganancia conocido (la autoprueba del simulador)', () => {
  it('por ubicación recupera c y el rango dinámico aunque el moteado no sea de Rayleigh', () => {
    // el mismo moteado (misma semilla) desplazado en dB por la ganancia; el grano grueso lo aleja de Rayleigh en cada tesela
    const geometry = syntheticGreyMapGeometry(S);
    const series = [-12, -6, 0, 6, 12].map((gainDb) => {
      const o = { ...S, grain: 1.5, levelsDb: S.levelsDb.map((l) => l + gainDb) };
      return { gainDb, tiles: speckleTiles(syntheticGreyMapFrames(o, 1), geometry, { tile: 16 }) };
    });
    const s = fitGreyMapAcrossGains(series);
    expect(s.locations).toBeGreaterThan(50);
    expect(Math.abs(s.c - 3.5)).toBeLessThan(0.5);
    expect(Math.abs(s.rangeDb / 70 - 1)).toBeLessThan(0.05);
  });
});
