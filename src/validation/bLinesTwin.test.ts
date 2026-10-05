// @tier slow
import { beforeAll, describe, expect, it } from 'vitest';
import { B_LINES } from '../ultrasound/bLines';
import { detectBLines, type BLineFrame } from '../measure/bLines';
import {
  HALF,
  LINES,
  RC,
  displayLevelAt,
  envAt,
  levelDbAt,
  liverReference,
  pleuraLateral,
  simulatePleura,
  thetaOf,
  type PleuraTwinOpts,
  type PleuraTwinOut,
} from './support/pleuraTwin';

/**
 * Las líneas B en la imagen formada (decisión 51): el gemelo B → C → D de la pleura (`support/pleuraTwin.ts`) con la población
 * de trampas de producción, con el foco en la pleura (28 mm) y 120 mm de profundidad, medidas con el detector
 * (`measure/bLines.ts`) sobre lo que se ve (el nivel con el recorte de la pantalla y la pleura 1 dB bajo el blanco, como el
 * preajuste) en una ventana de ±12° (≈ 37 mm de pleura, un espacio intercostal ancho). Metas de `docs/knowledge/physics.md` §3.3
 * (F-T13, T17, T18, T22, T26 y T27) y la calibración de la reirradiación. **Cada meta se mide en cinco realizaciones de la
 * población de trampas** (semillas 921, 1, 2, 3 y 77) y con el moteado de otra semilla en cada una: se exigen medianas y
 * proporciones, no lo que dé una sola realización.
 */
const FOCUS = 28;
/**
 * Trampas sueltas (calibración, F-T13, F-T22): cinco realizaciones con la trampa en otra línea (du), a otra distancia
 * elevacional del plano (mm), con otra reirradiación (hash) y sobre el moteado de su semilla.
 */
const CONFIGS = [
  { du: 0, elev: 0, hash: 1000 },
  { du: -9, elev: 0.4, hash: 8919 },
  { du: 5, elev: -0.6, hash: 16838 },
  { du: 11, elev: 0.2, hash: 24757 },
  { du: -4, elev: -0.3, hash: 32676 },
] as const;
const DEPTH = 120;
const SEEDS = [921, 1, 2, 3, 77] as const;
const deg = Math.PI / 180;
const WINDOW = [...Array(LINES).keys()].filter((u) => Math.abs(thetaOf(u)) <= 12 * deg);
let liver = 1;
let white = 0;
const cache = new Map<string, PleuraTwinOut>();
/** El gemelo con la semilla de trampas `trapSeed` y el moteado de su índice (cacheado). */
function twin(o: Partial<PleuraTwinOpts> & { trapSeed?: number }): PleuraTwinOut {
  const ts = o.trapSeed ?? 921;
  const full: PleuraTwinOpts = {
    edgeMm: -Infinity,
    focusMm: FOCUS,
    depth: DEPTH,
    seed: 1 + SEEDS.indexOf(ts as (typeof SEEDS)[number]),
    ...o,
    trapSeed: ts,
  };
  if (!(full.seed! >= 1)) full.seed = 1;
  const key = JSON.stringify(full);
  if (!cache.has(key)) cache.set(key, simulatePleura(full));
  return cache.get(key)!;
}
const normalOf = (trapSeed: number, focusMm = FOCUS) => twin({ trapSeed, focusMm });
const level = (o: PleuraTwinOut, u: number, r: number): number => levelDbAt(envAt(o, u, r), r, liver);
const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
};

/**
 * El detector con `gainDb` de ganancia sobre el preajuste y, si se da, una TGC `tgc(r)` (dB a la profundidad r, mm), en la
 * ventana de ±12° o en el sector entero; con `known`, la cadena le da esa curva (su rango de operación); sin él, solo la señal.
 */
function atGain(o: PleuraTwinOut, gainDb: number, opts: { known?: boolean; full?: boolean; tgc?: (r: number) => number } = {}): BLineFrame {
  const us = opts.full ? [...Array(LINES).keys()] : WINDOW;
  const lines = us.length;
  const lv = new Float32Array(o.nv * lines);
  const g = new Float32Array(o.nv);
  for (let v = 0; v < o.nv; v++) {
    const r = (v + 0.5) * o.dr;
    g[v] = gainDb + (opts.tgc?.(r) ?? 0);
    // la ganancia sube el nivel y el blanco de la pantalla queda donde está
    us.forEach((u, k) => (lv[v * lines + k] = displayLevelAt(o.env[v * LINES + u], r, liver, white - g[v]) + g[v]));
  }
  return detectBLines({
    lines,
    samples: o.nv,
    sampleMm: o.dr,
    level: lv,
    apexMm: RC,
    lineStepRad: (2 * HALF) / (LINES - 1),
    whiteDb: white,
    gainOverPresetDb: opts.known === false ? undefined : g,
  });
}

/** El detector sobre la ventana de ±12°, con el recorte de la pantalla; las posiciones, en líneas del gemelo. */
function detect(o: PleuraTwinOut): BLineFrame {
  const lines = WINDOW.length;
  const lv = new Float32Array(o.nv * lines);
  for (let v = 0; v < o.nv; v++)
    WINDOW.forEach((u, k) => (lv[v * lines + k] = displayLevelAt(o.env[v * LINES + u], (v + 0.5) * o.dr, liver, white)));
  const d = detectBLines({
    lines,
    samples: o.nv,
    sampleMm: o.dr,
    level: lv,
    apexMm: RC,
    lineStepRad: (2 * HALF) / (LINES - 1),
    whiteDb: white,
  });
  expect(d.saturated).toBe(false);
  return { ...d, positions: d.positions.map((k) => WINDOW[k]) };
}

/** Energía media de la envolvente bajo la pleura (τ 2–30 mm) sin la de `ref`, llevada a τ = 4 mm con la caída. */
function excess(o: PleuraTwinOut, ref: PleuraTwinOut, u: number): number {
  const L = B_LINES.params.ringDownEfoldMm.value;
  let s = 0;
  let n = 0;
  for (let tau = 2; tau <= 30; tau += 0.1) {
    const r = o.D[u] + tau;
    s += Math.max(envAt(o, u, r) ** 2 - envAt(ref, u, r) ** 2, 0) * Math.exp((2 * (tau - 4)) / L);
    n++;
  }
  return s / n;
}
const pleuraPeak = (o: PleuraTwinOut, u: number): number => {
  let pk = 0;
  for (let r = o.D[u] - 1; r <= o.D[u] + 1; r += 0.02) pk = Math.max(pk, envAt(o, u, r));
  return pk;
};
/**
 * Contraste de la réplica de orden 2 sobre su entorno, en potencia media (el pico de un moteado sesgaría +3–4 dB): la banda de
 * ±0,8 mm en 2D frente a la de 1,5–6 mm a cada lado, en la línea y sus dos vecinas.
 */
function aLineContrast(o: PleuraTwinOut, u: number): number {
  const D = o.D[u];
  let on = 0;
  let nOn = 0;
  let off = 0;
  let nOff = 0;
  for (let k = -1; k <= 1; k++)
    for (let x = -6; x <= 6; x += 0.05) {
      const p = envAt(o, u + k, 2 * D + x) ** 2;
      if (Math.abs(x) <= 0.8) {
        on += p;
        nOn++;
      } else if (Math.abs(x) >= 1.5) {
        off += p;
        nOff++;
      }
    }
  return 10 * Math.log10(on / nOn / (off / nOff));
}
/** Energía media de la réplica de orden 2 (±0,8 mm de 2D) en una línea. */
function aLineEnergy(o: PleuraTwinOut, u: number): number {
  let s = 0;
  let n = 0;
  for (let x = -0.8; x <= 0.8; x += 0.02) {
    s += envAt(o, u, 2 * o.D[u] + x) ** 2;
    n++;
  }
  return s / n;
}

beforeAll(() => {
  liver = liverReference(1);
  // el blanco de la pantalla, 1 dB sobre la línea pleural normal (el preajuste pulmonar)
  const n = normalOf(921);
  const pk = [...Array(LINES - 40).keys()].map((k) => {
    let m = -Infinity;
    for (let r = n.D[k + 20] - 1; r <= n.D[k + 20] + 1; r += 0.05) m = Math.max(m, level(n, k + 20, r));
    return m;
  });
  white = median(pk) + 1;
}, 600_000);

describe('Gemelo B → C → D: las líneas B emergen de las trampas (decisión 51), en cinco realizaciones', () => {
  it('calibración (media de 5 semillas): una trampa que capta todo el haz a trapSourceDb de la línea pleural; el difuso, a alveolarSourceDb', () => {
    let trap = 0;
    let diffuse = 0;
    let pleura = 0;
    for (const [i, ts] of SEEDS.entries()) {
      const uc = (LINES >> 1) + CONFIGS[i].du;
      const z = pleuraLateral(thetaOf(uc));
      const ref = normalOf(ts);
      // en el plano (todo el haz): la definición del nivel
      const forced = twin({ trapSeed: ts, forced: { trapZMm: z, hash: CONFIGS[i].hash } });
      let best = 0;
      for (let u = uc - 3; u <= uc + 3; u++) best = Math.max(best, excess(forced, ref, u));
      const dif = twin({ trapSeed: ts, forced: { alveolar: 1 } });
      let s = 0;
      for (let u = 30; u < LINES - 30; u++) s += excess(dif, ref, u);
      trap += best;
      diffuse += s / (LINES - 60);
      pleura += pleuraPeak(ref, uc) ** 2;
    }
    expect(Math.abs(10 * Math.log10(trap / pleura) - B_LINES.params.trapSourceDb.value)).toBeLessThan(1);
    expect(Math.abs(10 * Math.log10(diffuse / pleura) - B_LINES.params.alveolarSourceDb.value)).toBeLessThan(1);
  }, 600_000);

  it('F-T27: aireación y patrón (medianas de 5 realizaciones)', () => {
    const gases = [0.8, 0.7, 0.62, 0.54, 0.45, 0.35];
    const runs = gases.map((gas) => SEEDS.map((ts) => detect(twin({ gas, trapSeed: ts }))));
    const med = (i: number, f: (d: BLineFrame) => number) => median(runs[i].map(f));
    // ≥ 70 %: solo líneas A, a lo sumo una vertical aislada
    expect(runs[0].every((d) => d.count === 0)).toBe(true);
    expect(med(1, (d) => d.count)).toBeLessThanOrEqual(1);
    expect(runs[1].every((d) => d.count <= 2 && !d.confluent)).toBe(true);
    // 45–64 %: verticales que cubren < 50 %
    for (const i of [2, 3]) {
      expect(med(i, (d) => d.discrete)).toBeGreaterThanOrEqual(2);
      expect(med(i, (d) => d.whiteFraction)).toBeLessThan(0.5);
    }
    // ≤ 35 % (y ya con 45 %): confluentes en toda la ventana
    for (const i of [4, 5]) for (const d of runs[i]) expect(d.confluent && d.whiteFraction > 0.9).toBe(true);
    // el número del sitio (con el tope de 10 de la regla) y el blanco crecen al perder aire
    for (let i = 1; i < gases.length; i++) {
      expect(med(i, (d) => Math.min(10, d.count))).toBeGreaterThanOrEqual(med(i - 1, (d) => Math.min(10, d.count)));
      expect(med(i, (d) => d.whiteFraction)).toBeGreaterThanOrEqual(med(i - 1, (d) => d.whiteFraction) - 0.03);
    }
    // con ≤ 35 % de aire no quedan líneas A: la réplica de orden 2 no destaca (mediana de líneas y semillas)
    const c35 = SEEDS.flatMap((ts) => WINDOW.map((u) => aLineContrast(twin({ gas: 0.35, trapSeed: ts }), u)));
    expect(median(c35)).toBeLessThan(1);
    const cn = WINDOW.map((u) => aLineContrast(normalOf(921), u));
    expect(median(cn)).toBeGreaterThan(6);
  }, 900_000);

  it('F-T17 y F-T18: nacen en la línea pleural, paralelas al haz, y llegan al fondo de 120 mm con la compensación de referencia', () => {
    let lines = 0;
    let origin = 0;
    let axis = 0;
    let bottom = 0;
    for (const ts of SEEDS) {
      const o = twin({ gas: 0.62, trapSeed: ts });
      const n = normalOf(ts);
      for (const u of detect(o).positions) {
        lines++;
        const D = o.D[u];
        // sobre la pleura la columna es la del pulmón normal; desde ella, la línea B
        if (Math.abs(level(o, u, D - 3) - level(n, u, D - 3)) < 1 && level(o, u, D + 4) - level(n, u, D + 4) > 15) origin++;
        // paralela al haz (radial): su máximo lateral a 10 y a 80 mm bajo la pleura cae en la misma línea (±1: < 0,4°, F-T17 ±2°)
        const peakAt = (tau: number) => {
          let best = u;
          for (let k = u - 4; k <= u + 4; k++) if (excess1(o, n, k, tau) > excess1(o, n, best, tau)) best = k;
          return best;
        };
        if (Math.abs(peakAt(10) - peakAt(80)) <= 1) axis++;
        // a 114 mm sigue a menos de 8 dB de su nivel junto a la pleura y muy sobre el fondo normal
        if (level(o, u, D + 8) - level(o, u, DEPTH - 6) < 8 && level(o, u, DEPTH - 6) - level(n, u, DEPTH - 6) > 15) bottom++;
      }
    }
    expect(lines).toBeGreaterThan(8);
    expect(origin / lines).toBeGreaterThanOrEqual(0.9);
    expect(axis / lines).toBeGreaterThanOrEqual(0.9);
    expect(bottom / lines).toBeGreaterThanOrEqual(0.8);
  }, 900_000);

  it('F-T26: el borrado de las líneas A es local (medianas de las cinco realizaciones)', () => {
    const inside: number[] = [];
    const outside: number[] = [];
    for (const ts of SEEDS) {
      const o = twin({ gas: 0.62, trapSeed: ts });
      const pos = detect(o).positions;
      inside.push(...pos.map((u) => aLineContrast(o, u)));
      outside.push(
        ...WINDOW.filter((u) => pos.every((p) => Math.abs(p - u) > 12) && u > 4 && u < LINES - 5).map((u) => aLineContrast(o, u)),
      );
    }
    expect(median(inside)).toBeLessThanOrEqual(3);
    expect(median(outside)).toBeGreaterThanOrEqual(6);
  }, 900_000);

  it('la pérdida especular: sin reirradiación, la réplica de orden 2 de cada línea cae lo que dicen sus reflexiones (ρ²)', () => {
    const err: number[] = [];
    for (const ts of SEEDS) {
      const o = twin({ gas: 0.62, trapSeed: ts, noReradiation: true });
      const n = normalOf(ts);
      for (let u = 20; u < LINES - 20; u++) {
        if (!(o.eta[u] >= 0.15)) continue;
        const measured = 10 * Math.log10(aLineEnergy(o, u) / aLineEnergy(n, u));
        // dos reflexiones en la pleura (la línea A de orden 2) y la ida y vuelta de la serie: ρ² en amplitud
        err.push(measured - 40 * Math.log10(o.rho[u]));
      }
    }
    expect(err.length).toBeGreaterThan(10);
    expect(Math.abs(median(err))).toBeLessThan(1.5);
  }, 900_000);

  it('F-T13: se mueven con el deslizamiento: el origen de una trampa se desplaza lo que baja el pulmón (±5 %)', () => {
    const shift: number[] = [];
    for (const [i, ts] of SEEDS.entries()) {
      const c = CONFIGS[i];
      const uc = (LINES >> 1) + c.du;
      const z = pleuraLateral(thetaOf(uc));
      const centroid = (caudalMm: number) => {
        const ref = twin({ trapSeed: ts, caudalMm });
        const f = twin({ trapSeed: ts, caudalMm, forced: { trapZMm: z, trapUMm: c.elev, hash: c.hash } });
        let sw = 0;
        let sx = 0;
        for (let u = uc - 25; u <= uc + 25; u++) {
          const w = excess(f, ref, u);
          sw += w;
          sx += w * pleuraLateral(thetaOf(u));
        }
        return sx / sw;
      };
      shift.push(centroid(0) - centroid(6));
    }
    for (const s of shift) expect(Math.abs(s / 6 - 1)).toBeLessThan(0.05);
  }, 900_000);

  it('F-T22: con el foco hondo la línea B de una trampa es más ancha y más tenue (cada realización)', () => {
    // la trampa con la fracción del haz que entra de la física (κ0 ∝ 1/(σl·σe)): con el foco a 60 mm el haz es más ancho en la
    // pleura, entra menos en ella y su línea B se ensancha. La meta pide además que la gCNR baje ≈ 0,10; en el gemelo satura
    // (≈ 0,98 con los dos focos: el fondo es la neblina oscura del pulmón aireado, no el pulmón denso de Ostras) y se mide en el
    // brillo de la línea (`blines-gcnr-saturated`). La población no se usa: qué trampas ve cada línea cambia con el haz y el
    // moteado, y su contraste medio varía de 0,4 a 2,7 dB entre realizaciones (revisión de la decisión 51)
    for (const [i, ts] of SEEDS.entries()) {
      const c = CONFIGS[i];
      const uc = (LINES >> 1) + c.du;
      const z = pleuraLateral(thetaOf(uc));
      const res = (focusMm: number) => {
        const ref = normalOf(ts, focusMm);
        const f = twin({ trapSeed: ts, focusMm, forced: { trapZMm: z, trapUMm: c.elev, hash: c.hash, physicalKappa: true } });
        const prof = Array.from({ length: 41 }, (_, k) => excess(f, ref, uc - 20 + k));
        const sum = prof.reduce((a, b) => a + b, 0);
        const mean = prof.reduce((a, p, k) => a + p * k, 0) / sum;
        return { width: Math.sqrt(prof.reduce((a, p, k) => a + p * (k - mean) ** 2, 0) / sum), peak: Math.max(...prof) };
      };
      const near = res(FOCUS);
      const deep = res(60);
      expect(deep.width).toBeGreaterThan(1.2 * near.width);
      expect(10 * Math.log10(deep.peak / near.peak)).toBeLessThan(-3);
    }
  }, 900_000);

  it('el pulmón normal con +20 dB de ganancia sobre el preajuste (la pleura satura): ninguna línea B', () => {
    for (const ts of SEEDS) {
      const d = atGain(normalOf(ts), 20);
      // la pleura satura y los ecos de la pared no: la pleura es el primer eco saturado y el pulmón normal sigue sin líneas B
      expect(d.saturated).toBe(false);
      expect(d.count).toBe(0);
    }
  }, 900_000);

  it('el pulmón congestivo con +15, +20 y +25 dB sigue legible y da sus líneas (la saturación no esconde la patología)', () => {
    for (const ts of SEEDS.slice(0, 3))
      for (const gain of [15, 20, 25]) {
        for (const gas of [0.45, 0.35]) {
          const d = atGain(twin({ gas, trapSeed: ts }), gain);
          const tag = `φ ${gas}, +${gain} dB, trampas ${ts}`;
          expect(d.saturated, tag).toBe(false);
          expect(d.confluent && d.count >= 8, tag).toBe(true);
        }
        const d = atGain(twin({ gas: 0.54, trapSeed: ts }), gain);
        expect(d.saturated, `φ 0,54, +${gain} dB`).toBe(false);
        expect(d.count, `φ 0,54, +${gain} dB`).toBeGreaterThanOrEqual(1);
      }
  }, 900_000);

  it('sobre +25 dB el contador está fuera de su rango de operación: NaN, nunca un 0 falso ni un blanco falso', () => {
    // la señal sola no basta: sin la ganancia, el pulmón normal a +30 dB daba 9–15 líneas blancas y, en el sector entero, todo
    // pulmón a +40 dB daba 5 (la pared satura y se toma por pleura); por eso el rango es de la cadena, no de la imagen
    for (const ts of SEEDS.slice(0, 3)) {
      const normal = normalOf(ts);
      const white = twin({ gas: 0.35, trapSeed: ts });
      for (const full of [false, true]) {
        for (const gain of [30, 40])
          for (const [name, o] of [
            ['normal', normal],
            ['φ 0,35', white],
          ] as const) {
            const d = atGain(o, gain, { full });
            const tag = `${name}, +${gain} dB, ${full ? 'sector' : 'ventana'}, trampas ${ts}`;
            expect(d.saturatedBy, tag).toBe('gain');
            expect(d.count, tag).toBeNaN();
          }
        // en el borde del rango (+25) lee bien también en el sector entero
        const tag = `+25 dB, ${full ? 'sector' : 'ventana'}, trampas ${ts}`;
        expect(atGain(normal, 25, { full }).count, `normal, ${tag}`).toBe(0);
        const w = atGain(white, 25, { full });
        expect(w.confluent && w.count >= 8, `φ 0,35, ${tag}`).toBe(true);
      }
    }
  }, 1_800_000);

  it('una TGC bajo la pleura fuera del rango (> 6 dB) da NaN; dentro (± 3 dB), el conteo de siempre', () => {
    // la pleura del gemelo a ≈ 30 mm; la TGC sube (o baja) en 8 mm desde r0, bajo ella (las bandas 4–7 con 60 mm de profundidad)
    const step = (r0: number, s: number) => (r: number) => (r <= r0 ? 0 : r >= r0 + 8 ? s : (s * (r - r0)) / 8);
    for (const ts of SEEDS.slice(0, 3)) {
      const normal = normalOf(ts);
      const white = twin({ gas: 0.35, trapSeed: ts });
      for (const [gain, S] of [
        [15, 15],
        [0, 15],
        [20, 10],
        [0, -10],
      ] as const)
        for (const [name, o] of [
          ['normal', normal],
          ['φ 0,35', white],
        ] as const) {
          const d = atGain(o, gain, { tgc: step(34, S) });
          const tag = `${name}, +${gain} dB, TGC ${S} dB, trampas ${ts}`;
          expect(d.saturatedBy, tag).toBe('gain');
          expect(d.count, tag).toBeNaN();
        }
      for (const S of [-3, 3]) {
        const tag = `TGC ${S} dB, trampas ${ts}`;
        expect(atGain(normal, 0, { tgc: step(34, S) }).count, `normal, ${tag}`).toBe(0);
        const w = atGain(white, 0, { tgc: step(34, S) });
        expect(w.confluent && w.count >= 8, `φ 0,35, ${tag}`).toBe(true);
      }
    }
  }, 1_800_000);

  it('el pulmón blanco no cae a 0 dentro del rango: de +5 a +15 dB en pasos de 1, con 60, 120 y 160 mm y la TGC', () => {
    // con mucha ganancia el blanco bajo la pleura llega al blanco de la pantalla antes que ella: no se toma por la pleura
    const ramp = (a: number, b: number, depth: number) => (r: number) => a + ((b - a) * r) / depth;
    for (const depth of [60, 120, 160])
      for (const ts of SEEDS.slice(0, 3)) {
        const normal = twin({ trapSeed: ts, depth });
        const white = twin({ gas: 0.35, trapSeed: ts, depth });
        for (const [name, tgc] of [
          ['plana', undefined],
          ['0→+6', ramp(0, 6, depth)],
          ['pared −6', (r: number) => (r < 20 ? -6 : 0)],
          ['±3', ramp(-3, 3, depth)],
        ] as const)
          for (let g = 5; g <= 15; g++) {
            const tag = `${depth} mm, +${g} dB, TGC ${name}, trampas ${ts}`;
            expect(atGain(normal, g, { tgc }).count, `normal, ${tag}`).toBe(0);
            const w = atGain(white, g, { tgc });
            expect(w.confluent && w.count >= 8, `φ 0,35, ${tag}: ${w.count}`).toBe(true);
          }
      }
  }, 1_800_000);

  it('mutación: sin la reirradiación el detector no ve ninguna línea B (las trampas solo quitan energía)', () => {
    for (const ts of SEEDS) {
      const o = twin({ gas: 0.62, trapSeed: ts, noReradiation: true });
      expect(detect(o).count).toBe(0);
    }
  }, 900_000);
});

/** Exceso de energía de la línea u sobre el pulmón normal en ±2 mm de τ. */
function excess1(o: PleuraTwinOut, n: PleuraTwinOut, u: number, tau: number): number {
  let s = 0;
  for (let t = tau - 2; t <= tau + 2; t += 0.1) s += Math.max(envAt(o, u, o.D[u] + t) ** 2 - envAt(n, u, n.D[u] + t) ** 2, 0);
  return s;
}
