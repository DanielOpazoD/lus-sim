import { describe, expect, it } from 'vitest';
import {
  HEMODYNAMICS,
  aerationFromExcess,
  DEFAULT_CALIBRATION,
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
import {
  PROTOCOLS,
  SITE_CAP,
  evaluateProtocol,
  protocolById,
  protocolSites,
  siteKey,
  type Protocol,
  type ProtocolId,
  type SiteObservation,
} from '../lus/protocols';
import { formatTotal, showsSideCounts } from '../ui/heartFailurePanel';

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

describe('Los valores de la cadena, fijados (g, β, k, la bisagra y las cinéticas)', () => {
  // cifras calculadas aparte con la fórmula: k·w·ln(1 + e^((Pc − P*)/w)), w = 1,5 mmHg
  it('la bisagra suavizada y la pendiente k de cada fenotipo', () => {
    expect(softHinge(0)).toBeCloseTo(1.5 * Math.LN2, 9);
    expect(softHinge(3)).toBeCloseTo(3.19039, 4);
    expect(softHinge(-30)).toBeLessThan(1e-8);
    // FE preservada (P* = 19, k = 1,2): en el pivote, sobre él, y muy por debajo
    expect(regionalExcessSs(19, 'hfpef', 6)).toBeCloseTo(1.24766, 4);
    expect(regionalExcessSs(22, 'hfpef', 6)).toBeCloseTo(3.82847, 4);
    expect(regionalExcessSs(10, 'hfpef', 6)).toBeCloseTo(0.004456, 5);
    // FE reducida (P* = 25, k = 2,4)
    expect(regionalExcessSs(25, 'hfref', 6)).toBeCloseTo(2.49533, 4);
    expect(regionalExcessSs(28, 'hfref', 6)).toBeCloseTo(7.65694, 4);
    // el sano (P* = 22, k = 1,2)
    expect(regionalExcessSs(25, 'healthy', 6)).toBeCloseTo(3.82847, 4);
    expect(hingeMmHg('healthy', 6)).toBe(22);
    // la PAD baja el pivote 0,3 mmHg por mmHg sobre 8
    expect(hingeMmHg('hfpef', 18)).toBeCloseTo(16, 9);
    expect(regionalExcessSs(18, 'hfpef', 18)).toBeCloseTo(2.82113, 4);
  });

  it('la gravedad: 0,77 mmHg/cm sin amortiguar, y la profundidad bajo la aurícula izquierda', () => {
    expect(regionalPressure(20, 10)).toBeCloseTo(27.7, 9);
    expect(regionalPressure(20, -10)).toBeCloseTo(12.3, 9);
    expect(regionalPressure(20, 10, { ...DEFAULT_CALIBRATION, gravityDamping: 0.5 })).toBeCloseTo(23.85, 9);
    // supino: de delante atrás desde y = −20 mm; sentado: hacia abajo desde z = 60 mm
    expect(depthBelowLaCm(-100, 0, 'supine')).toBeCloseTo(8, 9);
    expect(depthBelowLaCm(-100, 0, 'sitting')).toBeCloseTo(6, 9);
    expect(depthBelowLaCm(0, -100, 'sitting')).toBeCloseTo(16, 9);
    // la región a 10 cm bajo la aurícula, con PCWP 22 en FE preservada: Pc = 29,7
    const ex = steadyExcess({ control: { kind: 'pcwp', mmHg: 22 }, phenotype: 'hfpef', rapMmHg: 6 }, [10], [true]);
    expect(ex[0]).toBeCloseTo(12.84144, 4);
  });

  it('el gas que quita cada mL/kg (β = 0,035) y el suelo de 0,05', () => {
    const g0 = SUBPLEURAL_AERATION.params.normalGasFraction.value;
    const a = aerationFromExcess(flat.map((_, i) => (i === 0 ? 5 : i === 1 ? 10 : i === 2 ? 40 : 0)));
    expect(a.gas[0]).toBeCloseTo(g0 - 0.035 * 5, 9);
    expect(a.gas[1]).toBeCloseTo(g0 - 0.35, 9);
    expect(a.gas[2]).toBe(0.05);
    expect(DEFAULT_CALIBRATION).toMatchObject({ gravityDamping: 1, gasPerEvlwi: 0.035, slopeScale: 1 });
  });

  it('las constantes de tiempo: 15 min de subida y 180 min de bajada', () => {
    expect(relaxExcess([0], [10], 900)[0]).toBeCloseTo(6.321206, 5);
    expect(relaxExcess([10], [0], 10800)[0]).toBeCloseTo(3.678794, 5);
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
    expect(w.total).toBe(280);
    expect(SITE_CAP).toBe(10);
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

describe('Los cortes de cada protocolo, en su frontera', () => {
  /** Cada zona con el mismo conteo en todos sus sitios (los `values`; el resto de las zonas, 0), el protocolo entero medido. */
  function byZone(p: Protocol, values: number[], confluent = false): Map<string, SiteObservation> {
    const m = new Map<string, SiteObservation>();
    p.zones.forEach((z, i) => {
      for (const s of z.sites) m.set(siteKey(s), { count: values[i] ?? 0, confluent: confluent && i < values.length });
    });
    return m;
  }
  /** Reparte un total en conteos de a lo más 10 (el tope por sitio). */
  const spread = (total: number, n: number): number[] =>
    Array.from({ length: n }, (_, i) => Math.max(0, Math.min(SITE_CAP, total - i * SITE_CAP)));
  const totalOf = (id: ProtocolId, total: number) => {
    const p = protocolById(id);
    return evaluateProtocol(p, byZone(p, spread(total, p.zones.length)));
  };

  it('28 sitios: las bandas de Picano cortan en 5/6, 15/16 y 30/31, y la bandera es > 15', () => {
    const band = (t: number) => totalOf('blue28', t).band;
    expect(band(0)).toBe('ausente (≤ 5)');
    expect(band(5)).toBe('ausente (≤ 5)');
    expect(band(6)).toBe('leve (6–15)');
    expect(band(15)).toBe('leve (6–15)');
    expect(band(16)).toBe('moderada (16–30)');
    expect(band(30)).toBe('moderada (16–30)');
    expect(band(31)).toBe('grave (> 30)');
    const flagged = (t: number) => totalOf('blue28', t).flags.length;
    expect(flagged(15)).toBe(0);
    expect(flagged(16)).toBe(1);
  });

  it('4 sitios de estrés: las bandas cortan en 1/2, 4/5 y 9/10', () => {
    const band = (t: number) => totalOf('stress4', t).band;
    expect(band(1)).toBe('sin congestión (0–1)');
    expect(band(2)).toBe('leve (2–4)');
    expect(band(4)).toBe('leve (2–4)');
    expect(band(5)).toBe('moderada (5–9)');
    expect(band(9)).toBe('moderada (5–9)');
    expect(band(10)).toBe('grave (≥ 10)');
    expect(totalOf('stress4', 10).flags).toEqual([]);
  });

  it('8 zonas en conteo: las banderas son ≥ 3 y ≥ 6', () => {
    const flags = (t: number) => totalOf('zones8count', t).flags;
    expect(flags(2)).toEqual([]);
    expect(flags(3)).toHaveLength(1);
    expect(flags(3)[0]).toContain('≥ 3');
    expect(flags(5)).toHaveLength(1);
    expect(flags(6)).toHaveLength(2);
    expect(flags(6)[1]).toContain('≥ 6');
  });

  it('4 zonas de Platz: la bandera es una suma ≥ 7', () => {
    expect(totalOf('zones4platz', 6).flags).toEqual([]);
    expect(totalOf('zones4platz', 7).flags).toHaveLength(1);
  });

  it('una zona es positiva con ≥ 3 líneas en un cuadro o con confluentes, y el valor de un sitio se topa en 10', () => {
    for (const id of ['zones8score', 'zones6'] as const) {
      const p = protocolById(id);
      expect(evaluateProtocol(p, byZone(p, [2])).total).toBe(0);
      expect(evaluateProtocol(p, byZone(p, [3])).total).toBe(1);
      // confluentes con pocas líneas: positiva (el conteo no manda)
      expect(evaluateProtocol(p, byZone(p, [0], true)).total).toBe(1);
      expect(evaluateProtocol(p, byZone(p, [0, 0], true)).total).toBe(2);
    }
    // el tope: 9, 10, 11 y 23 (un pulmón blanco en el sector completo)
    const c = protocolById('zones8count');
    for (const [n, v] of [
      [9, 9],
      [10, 10],
      [11, 10],
      [23, 10],
    ]) {
      expect(evaluateProtocol(c, byZone(c, [n])).zones[0].value).toBe(v);
    }
    const b = protocolById('blue28');
    expect(evaluateProtocol(b, byZone(b, [11])).total).toBe(10);
    expect(evaluateProtocol(b, byZone(b, [9])).total).toBe(9);
    // la zona de varios sitios vale el peor, topado: [23, 1] da 10
    const z0 = c.zones[0].sites;
    const mixed = byZone(c, []);
    mixed.set(siteKey(z0[0]), { count: 23, confluent: false });
    mixed.set(siteKey(z0[1]), { count: 1, confluent: false });
    expect(evaluateProtocol(c, mixed).zones[0].value).toBe(10);
  });

  it('el síndrome difuso pide ≥ 2 zonas positivas en cada hemitórax (8 zonas y Pivetta); la variante, ≥ 1', () => {
    /** `r` zonas positivas a la derecha y `l` a la izquierda (el orden de las zonas: derecha primero). */
    const pos = (p: Protocol, r: number, l: number) => {
      const half = p.zones.length / 2;
      const values = p.zones.map((_, i) => (i < r || (i >= half && i < half + l) ? 3 : 0));
      return evaluateProtocol(p, byZone(p, values));
    };
    for (const id of ['zones8score', 'zones6'] as const) {
      const p = protocolById(id);
      const diffuse = (r: number, l: number) => pos(p, r, l).flags.some((f) => f.includes('difuso'));
      expect(diffuse(2, 2)).toBe(true);
      expect(diffuse(3, 2)).toBe(true);
      expect(diffuse(1, 2)).toBe(false);
      expect(diffuse(2, 1)).toBe(false);
      expect(diffuse(0, 3)).toBe(false);
    }
    const p = protocolById('zones8score');
    const any = (r: number, l: number) => pos(p, r, l).flags.some((f) => f.includes('≥ 1 zona'));
    expect(any(1, 1)).toBe(true);
    expect(any(1, 0)).toBe(false);
    expect(any(0, 1)).toBe(false);
  });
});

describe('Lo que el panel puede afirmar: banda solo con el protocolo completo, y los sitios ilegibles', () => {
  const nan: SiteObservation = { count: Number.NaN, confluent: false };
  const obs = (p: Protocol, f: (i: number) => SiteObservation | undefined) => {
    const m = new Map<string, SiteObservation>();
    protocolSites(p).forEach((s, i) => {
      const o = f(i);
      if (o) m.set(siteKey(s), o);
    });
    return m;
  };

  it('sin medir (o a medias) no hay banda clínica; el panel no escribe «ausente» de un protocolo vacío', () => {
    for (const id of ['blue28', 'stress4'] as const) {
      const p = protocolById(id);
      const empty = evaluateProtocol(p, new Map());
      expect(empty.complete).toBe(false);
      expect(empty.band).toBeNull();
      expect(formatTotal(p, empty)).toBe('0 (incompleto)');
      const half = evaluateProtocol(
        p,
        obs(p, (i) => (i === 0 ? { count: 2, confluent: false } : undefined)),
      );
      expect(half.band).toBeNull();
      expect(formatTotal(p, half)).not.toContain('·');
      const full = evaluateProtocol(
        p,
        obs(p, () => ({ count: 0, confluent: false })),
      );
      expect(full.complete).toBe(true);
      expect(full.band).not.toBeNull();
      expect(formatTotal(p, full)).toContain(` · ${full.band}`);
    }
    expect(formatTotal(protocolById('blue28'), null)).toBe('—');
  });

  it('un sitio ilegible no es 0: la zona queda parcial (cota inferior) o no evaluable, y el total lo dice', () => {
    const c = protocolById('zones8count');
    const base = obs(c, () => ({ count: 0, confluent: false }));
    const [s0, s1] = c.zones[0].sites;
    // el ilegible con todos los demás en 0: pudo ser el peor, la zona no es evaluable
    const a = new Map(base).set(siteKey(s0), nan);
    const ra = evaluateProtocol(c, a);
    expect(ra.zones[0]).toMatchObject({ value: 'NE', partial: true });
    expect(ra.partialZones).toBe(1);
    expect(ra.complete).toBe(false);
    expect(ra.evaluable.right).toBe(3);
    // con 4 líneas en otro sitio de la zona: cota inferior de 4, parcial
    const b = new Map(a).set(siteKey(s1), { count: 4, confluent: false });
    const rb = evaluateProtocol(c, b);
    expect(rb.zones[0]).toMatchObject({ value: 4, partial: true });
    expect(rb.total).toBe(4);
    expect(formatTotal(c, rb)).toBe('≥ 4 (parcial: 1 zona con un sitio ilegible)');
    // con 10 en el legible el tope no se supera: el valor es exacto
    const t = new Map(a).set(siteKey(s1), { count: 15, confluent: false });
    expect(evaluateProtocol(c, t).zones[0]).toMatchObject({ value: 10, partial: false });
    expect(evaluateProtocol(c, t).complete).toBe(true);
    // en las zonas positivas: positiva pese al ilegible; negativa con un ilegible, no evaluable
    const sc = protocolById('zones8score');
    const baseS = obs(sc, () => ({ count: 0, confluent: false }));
    const [p0, p1] = sc.zones[0].sites;
    const neg = evaluateProtocol(sc, new Map(baseS).set(siteKey(p0), nan));
    expect(neg.zones[0]).toMatchObject({ value: 'NE', partial: true });
    expect(neg.complete).toBe(false);
    expect(formatTotal(sc, neg)).toBe('≥ 0 zonas + (parcial: 1 zona con un sitio ilegible)');
    const posS = evaluateProtocol(sc, new Map(baseS).set(siteKey(p0), nan).set(siteKey(p1), { count: 3, confluent: false }));
    expect(posS.zones[0]).toMatchObject({ value: 1, partial: false });
    expect(posS.total).toBe(1);
    // y en los 28 sitios, un sitio ilegible deja el total sin banda
    const b28 = protocolById('blue28');
    const r28 = evaluateProtocol(
      b28,
      obs(b28, (i) => (i === 0 ? nan : { count: 0, confluent: false })),
    );
    expect(r28.partialZones).toBe(1);
    expect(r28.band).toBeNull();
  });

  it('la fila «zonas + der./izq.» solo en los esquemas de zonas', () => {
    expect(showsSideCounts(protocolById('blue28'))).toBe(false);
    expect(showsSideCounts(protocolById('stress4'))).toBe(false);
    for (const id of ['zones8score', 'zones8count', 'zones6', 'zones4platz'] as const) expect(showsSideCounts(protocolById(id))).toBe(true);
  });
});
