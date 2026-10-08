/**
 * Protocolos de ecografía pulmonar en la insuficiencia cardiaca (lus-sim, decisión 52; `docs/HEART_FAILURE.md` §3 y
 * `docs/knowledge/clinical.md` §6.3): reglas puras sobre lo medido en cada sitio, sin ver la imagen ni el modelo
 * (`docs/ARCHITECTURE.md`: `lus` aplica las reglas; `measure` mide). Cada protocolo es un dato: sus sitios (lado, línea del
 * tórax, espacio intercostal), cómo se agrupan en zonas, el valor de una zona, la agregación y sus cortes con su fuente. Así el
 * mismo estado por espacio intercostal da, por construcción, la cifra de cada protocolo: la conversión entre ellos es una
 * **predicción del modelo**, no un dato publicado (ninguna conversión 4 ↔ 8 ↔ 28 está validada).
 */

export type Side = 'right' | 'left';
/** Las líneas del tórax (las de `anatomy/thoraxLines.ts`, que `lus` no importa). */
export type SiteLine = 'parasternal' | 'midclavicular' | 'anteriorAxillary' | 'midaxillary' | 'posteriorAxillary';

export interface Site {
  side: Side;
  line: SiteLine;
  /** Espacio intercostal (1–11). */
  ics: number;
}

export interface Zone {
  id: string;
  label: string;
  side: Side;
  /** Los sitios de la zona: su valor es el del peor (2026, D6_7.4; EACVI). */
  sites: Site[];
}

/** Lo medido en un sitio (un clip, su peor cuadro): `measure/bLines.ts`. */
export interface SiteObservation {
  /**
   * N_B del clip (discretas o %/10 si confluyen). NaN si el clip no se pudo leer (todos sus cuadros con la ganancia saturada,
   * `measure/bLines.ts`): no es 0, es «no evaluable».
   */
  count: number;
  confluent: boolean;
  /** Derrame en el sitio: la zona no es evaluable (EACVI). */
  effusion?: boolean;
}

export type ProtocolId = 'blue28' | 'zones8score' | 'zones8count' | 'zones6' | 'zones4platz' | 'stress4';

export interface Band {
  /** Límite superior incluido (Infinity el último). */
  upTo: number;
  label: string;
}

export interface Flag {
  label: string;
  test: (r: ProtocolResult) => boolean;
  source: string;
}

export interface Protocol {
  id: ProtocolId;
  label: string;
  /** Orientación de la sonda en cada sitio: longitudinal (cruza las costillas) o intercostal (paralela a ellas). */
  orientation: 'longitudinal' | 'intercostal';
  zones: Zone[];
  /** `count`: el valor de la zona es N_B con tope de 10; `positive`: 1 si ≥ 3 líneas en un cuadro o confluentes. */
  value: 'count' | 'positive';
  /** Máximo del agregado (para la escala del mapa). */
  max: number;
  bands: Band[];
  flags: Flag[];
  sources: string[];
  description: string;
}

export interface ZoneResult {
  zone: Zone;
  /**
   * null: sin medir; 'NE': no evaluable (derrame, o los sitios legibles no bastan: un sitio ilegible pudo ser el peor); un
   * número con `partial`: cota inferior (el peor de los sitios legibles, y un sitio ilegible pudo ser peor).
   */
  value: number | null | 'NE';
  /** Sitios medidos de la zona. */
  measured: number;
  /** La zona tiene un sitio ilegible (conteo NaN) que pudo cambiar su valor: no es una medida completa. */
  partial: boolean;
}

export interface ProtocolResult {
  protocol: Protocol;
  zones: ZoneResult[];
  /** Suma (o número de zonas positivas) de las zonas evaluables medidas. */
  total: number;
  /** Zonas positivas por lado (≥ 3 o confluentes). */
  positive: Record<Side, number>;
  /** Zonas medidas y evaluables por lado. */
  evaluable: Record<Side, number>;
  /** Todas las zonas medidas y ninguna parcial (un sitio ilegible que pudo cambiarla). */
  complete: boolean;
  /** Zonas con un sitio ilegible que pudo cambiar su valor: el total es entonces una cota inferior. */
  partialZones: number;
  /** La banda clínica del total: solo con el protocolo completo (con zonas sin medir o parciales no hay banda que dar). */
  band: string | null;
  flags: string[];
}

/** El tope de 10 por sitio de la regla %/10 (28 sitios, EACVI, estrés). */
export const SITE_CAP = 10;

const site = (side: Side, line: SiteLine, ics: number): Site => ({ side, line, ics });
const zone = (id: string, label: string, side: Side, sites: Site[]): Zone => ({ id, label, side, sites });
const lines = (side: Side, ls: SiteLine[], ics: number[]): Site[] => ls.flatMap((l) => ics.map((n) => site(side, l, n)));

/** Los 28 sitios (Jambrik 2004; Gargani y Volpicelli 2014): PSL, MCL, AAL y MAL × EIC 2–5 a la derecha y 2–4 a la izquierda. */
function blue28Zones(): Zone[] {
  const out: Zone[] = [];
  const L: SiteLine[] = ['parasternal', 'midclavicular', 'anteriorAxillary', 'midaxillary'];
  const short: Record<SiteLine, string> = {
    parasternal: 'PE',
    midclavicular: 'MC',
    anteriorAxillary: 'AA',
    midaxillary: 'AM',
    posteriorAxillary: 'AP',
  };
  for (const side of ['right', 'left'] as const)
    for (const l of L)
      for (const n of side === 'right' ? [2, 3, 4, 5] : [2, 3, 4])
        out.push(zone(`${side}-${l}-${n}`, `${side === 'right' ? 'D' : 'I'} ${short[l]} ${n}`, side, [site(side, l, n)]));
  return out;
}

/**
 * Las 8 zonas (Volpicelli 2006 y 2012; EACVI 2023): por lado, anterior superior e inferior (del esternón a la axilar anterior,
 * separadas hacia el EIC 2–3) y lateral superior y basal (de la axilar anterior a la posterior). Cada zona con los sitios donde
 * se busca su peor espacio intercostal.
 */
function zones8(): Zone[] {
  const out: Zone[] = [];
  for (const side of ['right', 'left'] as const) {
    const s = side === 'right' ? 'D' : 'I';
    out.push(zone(`${side}-ant-sup`, `${s}1 anterior superior`, side, lines(side, ['parasternal', 'midclavicular'], [2, 3])));
    out.push(
      zone(
        `${side}-ant-inf`,
        `${s}2 anterior inferior`,
        side,
        lines(side, ['parasternal', 'midclavicular'], side === 'right' ? [4, 5] : [4]),
      ),
    );
    out.push(zone(`${side}-lat-sup`, `${s}3 lateral superior`, side, lines(side, ['anteriorAxillary', 'midaxillary'], [3, 4])));
    out.push(zone(`${side}-lat-bas`, `${s}4 lateral basal`, side, lines(side, ['midaxillary', 'posteriorAxillary'], [5, 6])));
  }
  return out;
}

const z8 = zones8();
const byId = (ids: string[]): Zone[] => ids.map((id) => z8.find((z) => z.id === id)!);

export const PROTOCOLS: readonly Protocol[] = [
  {
    id: 'blue28',
    label: '28 sitios (suma de líneas B)',
    orientation: 'intercostal',
    zones: blue28Zones(),
    value: 'count',
    max: 280,
    bands: [
      { upTo: 5, label: 'ausente (≤ 5)' },
      { upTo: 15, label: 'leve (6–15)' },
      { upTo: 30, label: 'moderada (16–30)' },
      { upTo: Infinity, label: 'grave (> 30)' },
    ],
    flags: [{ label: '> 15 líneas: riesgo de reingreso si es al alta', test: (r) => r.total > 15, source: 'gargani-pronostico-2015' }],
    sources: ['jambrik-cometas-2004', 'picano-aguapulmonar-2016', 'gargani-pronostico-2015'],
    description:
      'Sonda paralela a las costillas; cada sitio de 0 a 10 (las confluentes, el % de blanco / 10). Bandas de Picano y Pellikka 2016.',
  },
  {
    id: 'zones8score',
    label: '8 zonas, puntaje (zonas positivas)',
    orientation: 'longitudinal',
    zones: z8,
    value: 'positive',
    max: 8,
    bands: [],
    flags: [
      {
        label: 'Síndrome intersticial difuso: ≥ 2 zonas positivas en cada hemitórax',
        test: (r) => r.positive.right >= 2 && r.positive.left >= 2,
        source: 'volpicelli-actualizacion-2026',
      },
      {
        label: '≥ 1 zona positiva en cada hemitórax (umbral de Buessler 2020, del resumen)',
        test: (r) => r.positive.right >= 1 && r.positive.left >= 1,
        source: 'gargani-eacvi-2023',
      },
    ],
    sources: ['volpicelli-consenso-2012', 'volpicelli-actualizacion-2026', 'gargani-eacvi-2023'],
    description: 'Zona positiva: ≥ 3 líneas B en un cuadro o líneas B coalescentes (consensos de 2012 y 2026).',
  },
  {
    id: 'zones8count',
    label: '8 zonas, conteo (suma de los peores)',
    orientation: 'longitudinal',
    zones: z8,
    value: 'count',
    max: 80,
    bands: [],
    flags: [
      { label: '≥ 3 líneas: congestión en la IC crónica ambulatoria', test: (r) => r.total >= 3, source: 'platz-ambulatorio-2016' },
      { label: '≥ 6 líneas: PCWP por encima de la bisagra', test: (r) => r.total >= 6, source: 'imanishi-pcwp-2023' },
    ],
    sources: ['gargani-eacvi-2023', 'platz-ambulatorio-2016', 'imanishi-pcwp-2023'],
    description: 'El peor espacio intercostal de cada zona, de 0 a 10 (%/10 si confluyen), sumados (EACVI 2023).',
  },
  {
    id: 'zones6',
    label: '6 zonas (Pivetta)',
    orientation: 'longitudinal',
    zones: (['right', 'left'] as const).flatMap((side) => {
      const s = side === 'right' ? 'D' : 'I';
      return [
        zone(`${side}-mcl2`, `${s} MC 2`, side, [site(side, 'midclavicular', 2)]),
        zone(`${side}-mcl4`, `${s} MC 4`, side, [site(side, 'midclavicular', 4)]),
        zone(`${side}-mal5`, `${s} AM 5`, side, [site(side, 'midaxillary', 5)]),
      ];
    }),
    value: 'positive',
    max: 6,
    bands: [],
    flags: [
      {
        label: 'Patrón B difuso: ≥ 2 zonas positivas en cada hemitórax',
        test: (r) => r.positive.right >= 2 && r.positive.left >= 2,
        source: 'pivetta-simeu-2015',
      },
    ],
    sources: ['pivetta-simeu-2015'],
    description:
      'Por lado, la medioclavicular en los EIC 2 y 4 y la axilar media en el EIC 5 (sin las basales del derrame). Los reparos de ' +
      'las zonas NO están verificados: la base documenta otro reparto de 6 zonas (2026: medioclavicular, axilar anterior y axilar ' +
      'media) y Pivetta 2015 solo se leyó en su resumen; la regla (positiva con ≥ 3 líneas B, difuso con ≥ 2 por lado) es la del consenso.',
  },
  {
    id: 'zones4platz',
    label: '4 zonas (Platz, al alta)',
    orientation: 'longitudinal',
    zones: byId(['right-ant-sup', 'right-lat-bas', 'left-ant-sup', 'left-lat-bas']),
    value: 'count',
    max: 40,
    bands: [],
    flags: [{ label: 'Suma ≥ 7 al alta (tercil superior)', test: (r) => r.total >= 7, source: 'platz-alta-2019' }],
    sources: ['platz-alta-2019', 'gargani-eacvi-2023'],
    description:
      'Las zonas anterior superior y lateral basal del esquema de 8 zonas, con el máximo de líneas en un espacio, sumado. Los ' +
      'reparos de las 4 zonas de Platz NO están verificados: el artículo los define en una figura que la base no tiene, y esta ' +
      'elección es del simulador.',
  },
  {
    id: 'stress4',
    label: '4 sitios de estrés (EIC 3)',
    orientation: 'intercostal',
    zones: (['right', 'left'] as const).flatMap((side) => {
      const s = side === 'right' ? 'D' : 'I';
      return [
        zone(`${side}-aal3`, `${s} AA 3`, side, [site(side, 'anteriorAxillary', 3)]),
        zone(`${side}-mal3`, `${s} AM 3`, side, [site(side, 'midaxillary', 3)]),
      ];
    }),
    value: 'count',
    max: 40,
    bands: [
      { upTo: 1, label: 'sin congestión (0–1)' },
      { upTo: 4, label: 'leve (2–4)' },
      { upTo: 9, label: 'moderada (5–9)' },
      { upTo: Infinity, label: 'grave (≥ 10)' },
    ],
    flags: [],
    sources: ['scali-se2020-2020', 'gargani-eacvi-2023'],
    description:
      'El 3.er espacio en las axilares anterior y media de ambos lados, 0–10 cada uno (ecocardiograma de estrés); EACVI no da umbrales.',
  },
];

export const protocolById = (id: ProtocolId): Protocol => PROTOCOLS.find((p) => p.id === id)!;

/** Clave de un sitio. */
export const siteKey = (s: Site): string => `${s.side}-${s.line}-${s.ics}`;

/** Todos los sitios de un protocolo, sin repetir. */
export function protocolSites(p: Protocol): Site[] {
  const seen = new Map<string, Site>();
  for (const z of p.zones) for (const s of z.sites) seen.set(siteKey(s), s);
  return [...seen.values()];
}

/** ¿Se pudo leer el sitio? (un clip saturado da NaN). */
export const siteReadable = (o: SiteObservation): boolean => Number.isFinite(o.count);
const sitePositive = (o: SiteObservation): boolean => siteReadable(o) && (o.count >= 3 || o.confluent);

/** Valor de una zona a partir de lo medido en sus sitios (el peor; con sitios ilegibles, ver `ZoneResult.partial`). */
function zoneValue(p: Protocol, z: Zone, obs: ReadonlyMap<string, SiteObservation>): ZoneResult {
  const seen = z.sites.map((s) => obs.get(siteKey(s))).filter((o): o is SiteObservation => !!o);
  if (seen.length === 0) return { zone: z, value: null, measured: 0, partial: false };
  if (seen.some((o) => o.effusion)) return { zone: z, value: 'NE', measured: seen.length, partial: false };
  // un sitio ilegible (conteo NaN) no cuenta como 0: pudo ser el peor de la zona
  const readable = seen.filter(siteReadable);
  const unreadable = seen.length - readable.length;
  const done = (value: number | 'NE', partial: boolean): ZoneResult => ({ zone: z, value, measured: seen.length, partial });
  if (readable.length === 0) return done('NE', true);
  const worst = Math.max(...readable.map((o) => Math.min(SITE_CAP, o.count)));
  const positive = readable.some(sitePositive);
  if (p.value === 'positive') {
    // una zona positiva lo es aunque otro sitio no se lea; una negativa con un sitio ilegible no se puede afirmar
    if (positive) return done(1, false);
    return unreadable ? done('NE', true) : done(0, false);
  }
  // el conteo: el tope no se supera aunque el ilegible sea el peor; sin líneas en los legibles no hay nada que sostener la zona;
  // con algunas, el peor de los legibles es una cota inferior
  if (unreadable === 0 || worst >= SITE_CAP) return done(worst, false);
  return worst === 0 ? done('NE', true) : done(worst, true);
}

/** Aplica la regla del protocolo a lo medido en sus sitios (los que falten quedan «sin medir»). */
export function evaluateProtocol(p: Protocol, obs: ReadonlyMap<string, SiteObservation>): ProtocolResult {
  const zones = p.zones.map((z) => zoneValue(p, z, obs));
  const positive: Record<Side, number> = { right: 0, left: 0 };
  const evaluable: Record<Side, number> = { right: 0, left: 0 };
  let total = 0;
  for (const r of zones) {
    if (typeof r.value !== 'number') continue;
    evaluable[r.zone.side]++;
    total += r.value;
    const seen = r.zone.sites.map((s) => obs.get(siteKey(s))).filter((o): o is SiteObservation => !!o);
    if (seen.some(sitePositive)) positive[r.zone.side]++;
  }
  const partialZones = zones.filter((r) => r.partial).length;
  const complete = partialZones === 0 && zones.every((r) => r.value !== null);
  const result: ProtocolResult = { protocol: p, zones, total, positive, evaluable, complete, partialZones, band: null, flags: [] };
  // la banda es del total completo: con zonas sin medir o parciales el total es una cota inferior y no cae en una banda
  result.band = complete ? (p.bands.find((b) => total <= b.upTo)?.label ?? null) : null;
  result.flags = p.flags.filter((f) => f.test(result)).map((f) => f.label);
  return result;
}
