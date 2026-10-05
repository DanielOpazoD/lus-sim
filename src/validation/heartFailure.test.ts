import { describe, expect, it } from 'vitest';
import {
  HEMODYNAMICS,
  aerationFromExcess,
  depthBelowLaCm,
  globalEvlwi,
  hingeMmHg,
  regionalExcessSs,
  regionalPressure,
  relaxExcess,
  softHinge,
  steadyExcess,
} from '../physiology/hemodynamics';
import { SUBPLEURAL_AERATION, SUBPLEURAL_NODES } from '../physiology/lungAeration';
import { PROTOCOLS, SITE_CAP, evaluateProtocol, protocolById, protocolSites, siteKey, type SiteObservation } from '../lus/protocols';

/**
 * La cadena de la presión al agua y a la aireación (decisión 52, `physiology/hemodynamics.ts`) y las reglas puras de los
 * protocolos (`lus/protocols.ts`), sin GPU. Lo que el detector mide en cada sitio con la física de las líneas B está en la e2e.
 */
const HP = HEMODYNAMICS.params;
const flat = new Array<number>(SUBPLEURAL_NODES).fill(0);
const allLung = new Array<boolean>(SUBPLEURAL_NODES).fill(true);

describe('Capa 1: la bisagra de la presión al agua', () => {
  it('casi nada bajo el pivote de cada fenotipo; luego crece con k (Imanishi: 19 con FE preservada, 25 con FE reducida)', () => {
    expect(hingeMmHg('hfpef', 6)).toBe(19);
    expect(hingeMmHg('hfref', 6)).toBe(25);
    expect(regionalExcessSs(12, 'hfpef', 6)).toBeLessThan(0.05);
    expect(regionalExcessSs(22, 'hfref', 6)).toBeLessThan(0.5);
    expect(regionalExcessSs(22, 'hfpef', 6)).toBeGreaterThan(2);
    // la misma presión da pulmones distintos según el fenotipo
    expect(regionalExcessSs(22, 'hfpef', 6)).toBeGreaterThan(5 * regionalExcessSs(22, 'hfref', 6));
    // monótona y suave
    let prev = 0;
    for (let p = 0; p < 50; p += 0.5) {
      const e = regionalExcessSs(p, 'hfpef', 6);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    expect(softHinge(100)).toBeCloseTo(100, 6);
  });

  it('la PAD alta baja el pivote (la presión venosa, poscarga de la linfa)', () => {
    expect(hingeMmHg('hfpef', 18)).toBeLessThan(hingeMmHg('hfpef', 8));
    expect(regionalExcessSs(18, 'hfpef', 18)).toBeGreaterThan(regionalExcessSs(18, 'hfpef', 6));
  });
});

describe('Capa 2: la cinética', () => {
  it('una subida brusca casi no cambia el agua en el primer minuto (P-T8) y la bajada es más lenta que la subida', () => {
    const target = flat.map(() => 10);
    const oneMin = relaxExcess(flat, target, 60);
    expect(oneMin[0] / 10).toBeLessThan(1 - Math.exp(-60 / (HP.tauUpMin.value * 60)) + 1e-9);
    expect(oneMin[0] / 10).toBeLessThan(0.1);
    const up = relaxExcess(flat, target, 1800)[0];
    const down = 10 - relaxExcess(target, flat, 1800)[0];
    expect(down).toBeLessThan(up);
    // y con la presión ya normal, el agua sigue alta un rato (el estado «E/e′ normal con líneas B», C-T25)
    expect(relaxExcess(target, flat, 600)[0]).toBeGreaterThan(5);
  });
});

describe('Capa 3: la gravedad', () => {
  it('las regiones declives (detrás en supino, abajo sentado) tienen más presión y más agua', () => {
    const back = depthBelowLaCm(-100, 0, 'supine');
    const front = depthBelowLaCm(100, 0, 'supine');
    expect(back).toBeGreaterThan(0);
    expect(front).toBeLessThan(0);
    expect(regionalPressure(22, back)).toBeGreaterThan(regionalPressure(22, front));
    expect(depthBelowLaCm(0, -100, 'sitting')).toBeGreaterThan(depthBelowLaCm(0, 200, 'sitting'));
    const ex = steadyExcess({ control: { kind: 'pcwp', mmHg: 22 }, phenotype: 'hfpef', rapMmHg: 6 }, [back, front], [true, true]);
    expect(ex[0]).toBeGreaterThan(ex[1]);
  });

  it('con el EVLWI como mando, el reparto da ese EVLWI global', () => {
    const depths = Array.from({ length: SUBPLEURAL_NODES }, (_, i) => ((i % 25) - 12) * 0.8);
    for (const e of [10, 15, 20]) {
      const ex = steadyExcess({ control: { kind: 'evlwi', mlKg: e }, phenotype: 'hfpef', rapMmHg: 6 }, depths, allLung);
      expect(globalEvlwi(ex, allLung)).toBeCloseTo(e, 2);
    }
    expect(
      globalEvlwi(steadyExcess({ control: { kind: 'evlwi', mlKg: 5 }, phenotype: 'hfpef', rapMmHg: 6 }, depths, allLung), allLung),
    ).toBe(HP.evlwiNormal.value);
  });
});

describe('Capa 4: del agua a la aireación subpleural', () => {
  it('sin agua de más, la aireación normal; con más, menos gas, con su suelo', () => {
    const g0 = SUBPLEURAL_AERATION.params.normalGasFraction.value;
    expect(aerationFromExcess(flat).gas.every((g) => g === g0)).toBe(true);
    const a = aerationFromExcess(flat.map((_, i) => i / 10));
    for (let i = 1; i < SUBPLEURAL_NODES; i++) expect(a.gas[i]).toBeLessThanOrEqual(a.gas[i - 1]);
    expect(Math.min(...a.gas)).toBeGreaterThanOrEqual(0.05);
    expect(() => aerationFromExcess([1, 2])).toThrow(RangeError);
  });
});

describe('Protocolos (reglas puras sobre lo medido)', () => {
  const obsAll = (p: (typeof PROTOCOLS)[number], f: (k: string) => SiteObservation) =>
    new Map(protocolSites(p).map((s) => [siteKey(s), f(siteKey(s))]));

  it('los sitios de cada protocolo son los de su fuente', () => {
    expect(protocolSites(protocolById('blue28'))).toHaveLength(28);
    expect(protocolById('blue28').zones.filter((z) => z.side === 'left')).toHaveLength(12);
    expect(protocolById('zones8score').zones).toHaveLength(8);
    expect(protocolById('zones6').zones).toHaveLength(6);
    expect(protocolById('zones4platz').zones).toHaveLength(4);
    const st = protocolSites(protocolById('stress4'));
    expect(st).toHaveLength(4);
    expect(st.every((s) => s.ics === 3)).toBe(true);
  });

  it('28 sitios: suma con tope de 10 por sitio, bandas de Picano y la bandera > 15', () => {
    const p = protocolById('blue28');
    const r = evaluateProtocol(
      p,
      obsAll(p, () => ({ count: 1, confluent: false })),
    );
    expect(r.total).toBe(28);
    expect(r.band).toBe('moderada (16–30)');
    expect(r.flags.some((f) => f.includes('> 15'))).toBe(true);
    const w = evaluateProtocol(
      p,
      obsAll(p, () => ({ count: 14, confluent: true })),
    );
    expect(w.total).toBe(28 * SITE_CAP);
    expect(w.complete).toBe(true);
  });

  it('8 zonas: el peor sitio de cada zona; positiva con ≥ 3 o coalescentes; difuso con ≥ 2 por lado', () => {
    const p = protocolById('zones8score');
    const count = protocolById('zones8count');
    // dos zonas positivas por lado (las anteriores superiores y las laterales basales), el resto con 2
    const pos = (k: string) => k.includes('-2') || k.includes('posteriorAxillary-5');
    const obs = obsAll(p, (k) => ({ count: pos(k) ? 4 : 2, confluent: false }));
    const r = evaluateProtocol(p, obs);
    expect(r.positive).toEqual({ right: 2, left: 2 });
    expect(r.total).toBe(4);
    expect(r.flags.some((f) => f.includes('difuso'))).toBe(true);
    const c = evaluateProtocol(count, obs);
    expect(c.total).toBe(4 * 4 + 4 * 2);
    expect(c.flags.length).toBe(2);
    // una zona con derrame no es evaluable: no suma ni cuenta
    const eff = new Map(obs);
    for (const s of count.zones[0].sites) eff.set(siteKey(s), { count: 9, confluent: true, effusion: true });
    const e = evaluateProtocol(count, eff);
    expect(e.zones[0].value).toBe('NE');
    expect(e.total).toBe(c.total - 4);
    // un sitio ilegible (ganancia saturada, conteo NaN) no es 0: la zona vale lo legible; sin nada legible, no es evaluable
    const sat = new Map(obs);
    const [s0, ...rest] = count.zones[0].sites;
    sat.set(siteKey(s0), { count: Number.NaN, confluent: false });
    expect(evaluateProtocol(count, sat).zones[0].value).toBe(c.zones[0].value);
    for (const s of rest) sat.set(siteKey(s), { count: Number.NaN, confluent: false });
    const u = evaluateProtocol(count, sat);
    expect(u.zones[0].value).toBe('NE');
    expect(u.total).toBe(c.total - 4);
    expect(Number.isNaN(u.total)).toBe(false);
    // sin medir: incompleto
    expect(evaluateProtocol(count, new Map()).complete).toBe(false);
  });

  it('la misma medida, cifras distintas según el protocolo (la conversión es del modelo)', () => {
    const obs = new Map(
      PROTOCOLS.flatMap((p) => protocolSites(p)).map((s) => [siteKey(s), { count: s.line === 'midaxillary' ? 5 : 1, confluent: false }]),
    );
    const totals = Object.fromEntries(PROTOCOLS.map((p) => [p.id, evaluateProtocol(p, obs).total]));
    expect(new Set(Object.values(totals)).size).toBeGreaterThan(3);
    expect(totals.stress4).toBe(2 * 1 + 2 * 5);
  });
});
