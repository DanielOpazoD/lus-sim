import { defineParameters } from '../core/evidence';

/**
 * Las líneas B contadas sobre la señal (lus-sim, decisión 51): un detector sobre el nivel mostrado de un cuadro en su rejilla
 * polar (línea × profundidad, la envolvente con la compensación, la ganancia y el recorte del rango dinámico de la pantalla), sin
 * mirar el modelo (guía §5 y §20): ni la pleura ni las costillas vienen de la anatomía. Aplica las definiciones de la base
 * (`docs/knowledge/clinical.md` §6.3, paso A.5–A.6; `docs/knowledge/physics.md` §2.4):
 *
 *  1. **La línea pleural, en la imagen.** En cada línea, el primer eco que llega a `pleuraFindDb` de su máximo (entre
 *     `pleuraFromMm` y el 70 % de la profundidad), afinado a su pico; si el máximo está en el blanco (la pleura satura), el primer
 *     eco saturado. Es pleura visible si su nivel queda a menos de `shadowDb`
 *     de la pleura del cuadro (la mediana de la mitad más brillante) y si debajo, a su doble distancia, hay su reverberación (una
 *     línea A, una línea B o el blanco) a menos de `reverbDb` de ella: bajo una costilla el eco de la cortical no tiene debajo
 *     más que sombra, y un eco de la pared (a menos de `SHALLOW_FRACTION` de la profundidad de las pleuras más brillantes) no
 *     es la pleura.
 *  2. **Nace en la pleura y se sostiene.** El nivel de la columna es la mediana de su nivel entre `startMm` y `startMm + bandMm`
 *     bajo su pleura (la mediana no ve las líneas A, que son finas). Una columna es de línea B si supera el umbral: el nivel de la
 *     pleura del cuadro menos `marginDb` (como el ojo, frente a la pleura del mismo cuadro), si queda `wallContrastDb` sobre la
 *     pared del cuadro (es hiperecoica: con mucha ganancia la pleura satura y la neblina normal pasaría el margen), y si
 *     sobre la pleura (la pared, de −10 a −3 mm) no está más de `originDb` por encima de la pared de las otras líneas: una franja
 *     que baja desde la piel no nace en la pleura. No se exige que llegue al fondo: con poca ganancia distal o mucha
 *     profundidad una línea B puede no llegar sin dejar de serlo (2026, D1_1.1).
 *  3. **Discretas o confluentes.** Las columnas contiguas forman tramos; un tramo más ancho que `confluentMm` (en la pleura) es
 *     confluente, y en los demás se cuentan sus máximos separados por un valle de al menos `valleyDb`. El número del cuadro
 *     (`N_B`, clinical.md §6.3, A.6) es el conteo; con confluencia, máx(conteo de los tramos no confluentes, redondeo(10·f)), con
 *     f la fracción de la pleura visible ocupada por columnas de línea B (la regla %/10; el tope de 10 lo pone el protocolo).
 *
 * Un cuadro fuera del rango de operación (la ganancia sobre el preajuste pasa `maxGainOverPresetDb`, o la TGC varía más de
 * `maxTgcSpreadDb`, de la piel a la profundidad que lee) o con la pared casi en el
 * blanco no se lee (`saturated`, conteo NaN), como el ecografista que baja la ganancia antes de contar. Un clip se lee en su peor cuadro (2026, D6_7.4): `clipBLines`. Lo que no mira: el deslizamiento (un artefacto vertical quieto,
 * `Bsin`, contaría igual).
 */
export const B_LINE_DETECTOR = defineParameters('measure.bLineDetector', {
  marginDb: {
    value: 30,
    unit: 'dB',
    range: [24, 36],
    evidence: 'estimado',
    sources: ['brattain-lineasb-2013', 'moshavegh-lineasb-2019'],
    note:
      'Una columna es de línea B si su mediana bajo la pleura queda a menos de esto bajo la línea pleural del cuadro. Los ' +
      'detectores publicados umbralan la intensidad de la columna frente a su entorno (Brattain 2013; Moshavegh 2019); el margen ' +
      'frente a la pleura es propio. En el gemelo, la neblina del pulmón normal queda 55–65 dB bajo la pleura y una línea B ' +
      'aislada, 15–25 dB',
  },
  startMm: {
    value: 6,
    unit: 'mm',
    range: [3, 10],
    evidence: 'estimado',
    sources: ['volpicelli-actualizacion-2026'],
    note: 'La columna se mide desde aquí bajo la pleura: fuera la cola de la línea pleural y su reverberación más próxima',
  },
  bandMm: {
    value: 30,
    unit: 'mm',
    range: [20, 50],
    evidence: 'estimado',
    sources: ['mathis-wfumb-2021', 'volpicelli-actualizacion-2026'],
    note:
      'Largo de la banda donde se mide la columna: la mediana exige que la línea se sostenga más de la mitad (15 mm); la WFUMB ' +
      'separa la línea B (≥ 10 cm) de la cola de cometa (< 10 cm), pero 2026 no exige llegar al fondo, que depende de la ganancia',
  },
  valleyDb: {
    value: 3,
    unit: 'dB',
    range: [2, 6],
    evidence: 'estimado',
    sources: ['anantrasirichai-lineas-2017'],
    note: 'Dos máximos de un tramo son dos líneas si entre ellos el nivel baja al menos esto (líneas que se tocan pero se distinguen)',
  },
  confluentMm: {
    value: 6,
    unit: 'mm',
    range: [4, 10],
    evidence: 'estimado',
    sources: ['gargani-eacvi-2023', 'zhao-revision-2022'],
    note:
      'Un tramo de columnas de línea B más ancho que esto en la pleura es confluente (el «blanco» que se mide en %): dos líneas a ' +
      '≤ 3 mm se tienen por coalescentes (Zhao, definición) y una línea aislada mide 1–3 mm',
  },
  wallContrastDb: {
    value: 6,
    unit: 'dB',
    range: [3, 12],
    evidence: 'estimado',
    sources: ['volpicelli-consenso-2012', 'lichtenstein-luci-2014'],
    note:
      'Una línea B es hiperecoica (2012; Lichtenstein): su columna queda al menos esto sobre la pared del mismo cuadro (la mediana ' +
      'de la pared de las líneas visibles). Con mucha ganancia la pleura satura y la neblina del pulmón normal pasa el margen ' +
      'frente a ella, pero no queda sobre la pared: en el gemelo, +20 dB de ganancia daban 9–10 líneas confluentes en el pulmón ' +
      'normal sin esta regla (revisión de la decisión 51) y 0 con ella',
  },
  originDb: {
    value: 6,
    unit: 'dB',
    range: [3, 10],
    evidence: 'estimado',
    sources: ['volpicelli-actualizacion-2026'],
    note: 'Una columna cuya pared (de −10 a −3 mm sobre su pleura) supera en esto la de las otras líneas no nace en la pleura',
  },
  pleuraFindDb: {
    value: 10,
    unit: 'dB',
    range: [6, 15],
    evidence: 'estimado',
    sources: ['lichtenstein-luci-2014'],
    note: 'La pleura es el primer eco que llega a esto del máximo de su línea (la línea más brillante de la mitad alta de la imagen)',
  },
  shadowDb: {
    value: 20,
    unit: 'dB',
    range: [12, 30],
    evidence: 'estimado',
    sources: ['lichtenstein-luci-2014'],
    note: 'Una línea cuya pleura queda más de esto bajo la del cuadro está en sombra (la cortical o el cartílago de una costilla)',
  },
  reverbDb: {
    value: 40,
    unit: 'dB',
    range: [30, 50],
    evidence: 'estimado',
    sources: ['demi-guias-2023'],
    note:
      'Bajo una pleura visible, a su doble distancia, hay su reverberación (línea A, línea B o blanco) a menos de esto de ella: en ' +
      'el gemelo la línea A de orden 2 queda ≈ 28 dB bajo la pleura; bajo una costilla no hay más que sombra',
  },
  maxGainOverPresetDb: {
    value: 25,
    unit: 'dB',
    range: [20, 30],
    evidence: 'estimado',
    sources: ['demi-guias-2023', 'lichtenstein-luci-2014'],
    note:
      'El rango de operación del contador: la ganancia de pantalla (más la TGC a la altura de la pleura) sobre el preajuste ' +
      'pulmonar, que la cadena conoce. Las guías piden no saturar la línea pleural (Demi 2023, enunciado 15) y el ecografista ' +
      'baja la ganancia antes de contar. En el gemelo (5 realizaciones, revisiones de la decisión 51) el conteo es correcto de 0 ' +
      'a +25 dB en el pulmón normal y en el congestivo (φ 0,54, 0,45 y 0,35); con +30 dB el normal ya daba 9–10 líneas blancas ' +
      '(la pared satura y se toma por pleura) y con +40 dB el pulmón blanco daba 0 (todo satura). Sobre este límite el conteo es ' +
      'NaN: ninguna regla de la señal probada separó la pared de la pleura en el sector curvo',
  },
  maxTgcSpreadDb: {
    value: 6,
    unit: 'dB',
    range: [3, 10],
    evidence: 'estimado',
    sources: ['demi-guias-2023', 'lichtenstein-luci-2014'],
    note:
      'El rango de operación también pide la TGC casi plana de la piel a la profundidad que el contador lee (la pleura + ' +
      'startMm + bandMm): la diferencia entre la mayor y la menor ganancia sobre el preajuste en ese tramo. Subir la TGC bajo ' +
      'la pleura (o bajarla sobre ella) aclara la neblina frente a la línea pleural: en el gemelo, +15 dB bajo la pleura con +15 de ' +
      'ganancia daban 9–13 líneas en el pulmón normal y, a ganancia 0, el pulmón blanco se leía con 4 en vez de 10 (revisión de ' +
      'la decisión 51). Medido en el gemelo: ver la decisión 51',
  },
  pleuraFromMm: {
    value: 5,
    unit: 'mm',
    range: [3, 10],
    evidence: 'estimado',
    sources: ['lichtenstein-luci-2014'],
    note: 'La búsqueda de la pleura empieza aquí (fuera la cara de la sonda y su transitorio)',
  },
});

const P = B_LINE_DETECTOR.params;
/** Cuánto bajo el umbral de la pleura queda la mediana de la pared entre un eco suyo y la pleura saturada bajo él (dB). */
export const PLEURA_GAP_DB = 10;
/** Un eco a menos de esta fracción de la profundidad de la pleura del cuadro es de la pared, no de la pleura. */
export const SHALLOW_FRACTION = 0.6;

/**
 * Un cuadro en su rejilla polar: `level[s·lines + l]`, el nivel mostrado (dB) de la muestra s de la línea l, con el recorte de la
 * pantalla; `sampleMm`, el paso en profundidad; la geometría del sector para el paso lateral entre líneas a la altura de la pleura,
 * (R + D)·Δθ: el radio de la cara (`apexMm`; 0 en una lineal, que da `lineStepRad` como paso en mm) y el ángulo entre líneas.
 */
export interface PolarFrame {
  lines: number;
  samples: number;
  sampleMm: number;
  level: ArrayLike<number>;
  apexMm: number;
  lineStepRad: number;
  /** El blanco de la pantalla (dB), si el nivel está recortado: para reconocer un cuadro saturado. */
  whiteDb?: number;
  /**
   * La ganancia de pantalla más la TGC sobre las del preajuste pulmonar, en dB, en cada muestra en profundidad (o una constante),
   * si la cadena la da: el contador la mira de la piel a la profundidad que lee (la pleura + `startMm` + `bandMm`); si pasa
   * `maxGainOverPresetDb` o varía más de `maxTgcSpreadDb` en ese tramo, el cuadro está fuera de su rango de operación.
   */
  gainOverPresetDb?: number | ArrayLike<number>;
}

export interface BLineFrame {
  /** Líneas B discretas (los máximos de los tramos no confluentes). */
  discrete: number;
  /** Fracción de la pleura visible ocupada por columnas de línea B. */
  whiteFraction: number;
  /** ¿Algún tramo confluente? */
  confluent: boolean;
  /** N_B del cuadro (clinical.md §6.3, A.6). */
  count: number;
  /** Línea central de cada línea discreta. */
  positions: number[];
  /** Nivel de la línea pleural del cuadro (dB) y umbral usado. */
  pleuraDb: number;
  thresholdDb: number;
  /** Profundidad de la pleura hallada en cada línea (mm; −1 si no es visible). */
  pleuraMm: number[];
  /** Líneas con pleura visible. */
  visibleLines: number;
  /**
   * Ganancia excesiva: el cuadro no se lee. Su conteo es NaN (no 0: ilegible no es «sin líneas B») y `clipBLines` lo descarta.
   * `saturatedBy`: `gain`, fuera del rango de operación (`maxGainOverPresetDb`); `wall`, la pared del cuadro queda a menos de
   * `wallContrastDb` del blanco y ninguna columna puede ser hiperecoica frente a ella.
   */
  saturated: boolean;
  saturatedBy: 'gain' | 'wall' | null;
}

const median = (a: number[]): number => {
  if (a.length === 0) return Number.NaN;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
};

/** La pleura de cada línea en la imagen (paso 1): profundidad y nivel del pico; −1 y NaN sin eco. */
export function findPleura(f: PolarFrame): { mm: number[]; peak: number[]; levelDb: number; visible: boolean[] } {
  const lv = (l: number, s: number): number => f.level[s * f.lines + l];
  const s0 = Math.ceil(P.pleuraFromMm.value / f.sampleMm);
  const s1 = Math.floor((0.7 * f.samples * f.sampleMm) / f.sampleMm);
  const mm = new Array<number>(f.lines).fill(-1);
  const peak = new Array<number>(f.lines).fill(Number.NaN);
  for (let l = 0; l < f.lines; l++) {
    let max = -Infinity;
    for (let s = s0; s <= s1; s++) max = Math.max(max, lv(l, s));
    if (!Number.isFinite(max)) continue;
    // el primer eco a pleuraFindDb del máximo de la línea
    const find = max - P.pleuraFindDb.value;
    let s = s0;
    while (s <= s1 && lv(l, s) < find) s++;
    // con el máximo en el blanco, la pleura puede saturar bajo un eco de la pared que no satura: si el primer eco no llega al
    // blanco, el primer punto saturado debajo es la pleura solo si lo que hay entre los dos es pared oscura (su mediana,
    // `PLEURA_GAP_DB` bajo el umbral); un blanco extenso (el de un pulmón sin aire, con mucha ganancia) no se toma por la pleura
    const top = f.whiteDb !== undefined ? f.whiteDb - 0.5 : Infinity;
    if (max >= top && lv(l, s) < top) {
      let k = s;
      while (k <= s1 && lv(l, k) < top) k++;
      const between: number[] = [];
      for (let j = s + Math.ceil(1 / f.sampleMm); j < k; j++) between.push(lv(l, j));
      if (k <= s1 && between.length > 0 && median(between) < find - PLEURA_GAP_DB) s = k;
    }
    // el pico de ese eco (hasta 2 mm más abajo)
    let best = s;
    for (let k = s; k <= Math.min(s1, s + Math.ceil(2 / f.sampleMm)); k++) if (lv(l, k) > lv(l, best)) best = k;
    mm[l] = (best + 0.5) * f.sampleMm;
    peak[l] = lv(l, best);
  }
  const sorted = peak.filter((x) => Number.isFinite(x)).sort((a, b) => b - a);
  const levelDb = median(sorted.slice(0, Math.max(1, sorted.length >> 1)));
  // la profundidad de la pleura de las líneas más brillantes: un eco a menos de `shallowFraction` de ella es de la pared (la
  // piel, una fascia), el único que encuentra una línea en la sombra de una costilla
  const strong = mm.filter((D, l) => D > 0 && peak[l] >= levelDb - 6);
  const minDepth = SHALLOW_FRACTION * median(strong);
  const visible = mm.map((D, l) => {
    if (!(D > 0) || !(D >= minDepth) || !(peak[l] >= levelDb - P.shadowDb.value)) return false;
    // su reverberación a 2D (línea A, línea B o blanco)
    const a = Math.floor((2 * D - 1.5) / f.sampleMm);
    const b = Math.ceil((2 * D + 1.5) / f.sampleMm);
    if (b >= f.samples) return false;
    let r = -Infinity;
    for (let s = a; s <= b; s++) r = Math.max(r, lv(l, s));
    return r >= peak[l] - P.reverbDb.value;
  });
  return { mm: mm.map((D, l) => (visible[l] ? D : -1)), peak, levelDb, visible };
}

/**
 * ¿Fuera del rango de operación? La ganancia sobre el preajuste de la piel a la profundidad que el contador lee (la pleura más
 * honda hallada + `startMm` + `bandMm`; sin pleura, la imagen entera): su máximo pasa `maxGainOverPresetDb` o varía más de
 * `maxTgcSpreadDb` (una TGC que aclara u oscurece lo que hay bajo la pleura frente a ella).
 */
export function outOfGainRange(f: PolarFrame, pleuraMm: readonly number[]): boolean {
  const g = f.gainOverPresetDb;
  if (g === undefined) return false;
  const deepest = Math.max(-1, ...pleuraMm);
  const readMm = deepest > 0 ? deepest + P.startMm.value + P.bandMm.value : f.samples * f.sampleMm;
  const last = Math.min(f.samples - 1, Math.ceil(readMm / f.sampleMm));
  let max = -Infinity;
  let min = Infinity;
  for (let s = 0; s <= last; s++) {
    const v = typeof g === 'number' ? g : g[s];
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  return max > P.maxGainOverPresetDb.value || max - min > P.maxTgcSpreadDb.value;
}

/** Detecta las líneas B de un cuadro. */
export function detectBLines(f: PolarFrame): BLineFrame {
  const lv = (l: number, s: number): number => f.level[s * f.lines + l];
  const unreadable = (by: 'gain' | 'wall'): BLineFrame => ({
    discrete: Number.NaN,
    whiteFraction: Number.NaN,
    confluent: false,
    count: Number.NaN,
    positions: [],
    pleuraDb: Number.NaN,
    thresholdDb: Number.NaN,
    pleuraMm: new Array<number>(f.lines).fill(-1),
    visibleLines: 0,
    saturated: true,
    saturatedBy: by,
  });
  const pl = findPleura(f);
  if (f.gainOverPresetDb !== undefined && outOfGainRange(f, pl.mm)) return unreadable('gain');
  const pitch = (l: number): number => (f.apexMm > 0 ? (f.apexMm + Math.max(pl.mm[l], 0)) * f.lineStepRad : f.lineStepRad);
  const bottom = f.samples * f.sampleMm;
  const visible = pl.visible.map((v, l) => v && pl.mm[l] + P.startMm.value + 0.5 * P.bandMm.value < bottom);
  const threshold = pl.levelDb - P.marginDb.value;
  const column = new Array<number>(f.lines).fill(Number.NaN);
  const wall = new Array<number>(f.lines).fill(Number.NaN);
  for (let l = 0; l < f.lines; l++) {
    if (!visible[l]) continue;
    const D = pl.mm[l];
    const band: number[] = [];
    for (
      let s = Math.ceil((D + P.startMm.value) / f.sampleMm);
      s < Math.min(f.samples, (D + P.startMm.value + P.bandMm.value) / f.sampleMm);
      s++
    )
      band.push(lv(l, s));
    column[l] = median(band);
    const above: number[] = [];
    for (let s = Math.max(0, Math.floor((D - 10) / f.sampleMm)); s <= Math.floor((D - 3) / f.sampleMm); s++) above.push(lv(l, s));
    wall[l] = median(above);
  }
  const wallRef = median(wall.filter((x) => Number.isFinite(x)));
  // la pared casi en el blanco: nada puede quedar `wallContrastDb` sobre ella, y un 0 sería falso
  if (f.whiteDb !== undefined && wallRef > f.whiteDb - P.wallContrastDb.value) return unreadable('wall');
  const isB = column.map(
    (c, l) => visible[l] && c >= threshold && c >= wallRef + P.wallContrastDb.value && !(wall[l] > wallRef + P.originDb.value),
  );
  let visibleMm = 0;
  let whiteMm = 0;
  let discrete = 0;
  let confluent = false;
  const positions: number[] = [];
  for (let l = 0; l < f.lines; l++) if (visible[l]) visibleMm += pitch(l);
  for (let l = 0; l < f.lines;) {
    if (!isB[l]) {
      l++;
      continue;
    }
    let e = l;
    let width = 0;
    while (e < f.lines && isB[e]) width += pitch(e++);
    whiteMm += width;
    if (width > P.confluentMm.value) {
      // un tramo confluente no se cuenta por sus máximos (serían los del moteado): entra por el %/10
      confluent = true;
      l = e;
      continue;
    }
    // máximos del tramo separados por un valle ≥ valleyDb
    let best = l;
    let low = Infinity;
    let armed = true;
    const found: number[] = [];
    for (let k = l; k < e; k++) {
      const c = column[k];
      if (armed) {
        if (c >= column[best]) best = k;
        if (column[best] - c >= P.valleyDb.value) {
          found.push(best);
          armed = false;
          low = c;
        }
      } else {
        if (c < low) low = c;
        if (c - low >= P.valleyDb.value) {
          armed = true;
          best = k;
        }
      }
    }
    if (armed) found.push(best);
    discrete += found.length;
    positions.push(...found);
    l = e;
  }
  const whiteFraction = visibleMm > 0 ? whiteMm / visibleMm : 0;
  const count = confluent ? Math.max(discrete, Math.round(10 * whiteFraction)) : discrete;
  return {
    discrete,
    whiteFraction,
    confluent,
    count,
    positions,
    pleuraDb: pl.levelDb,
    thresholdDb: threshold,
    pleuraMm: pl.mm,
    visibleLines: visible.filter(Boolean).length,
    saturated: false,
    saturatedBy: null,
  };
}

/** Un clip se lee en su peor cuadro (2026, D6_7.4; Anderson 2013: el conteo es más fiable en el cuadro con más líneas). */
export function clipBLines(frames: readonly BLineFrame[]): BLineFrame {
  if (frames.length === 0) throw new RangeError('clipBLines: clip sin cuadros');
  // los cuadros saturados no se leen; si todos lo están, el clip tampoco (su conteo es NaN)
  const readable = frames.filter((f) => !f.saturated);
  if (readable.length === 0) return frames[0];
  return readable.reduce((a, b) => (b.count > a.count || (b.count === a.count && b.whiteFraction > a.whiteFraction) ? b : a));
}
