import { describe, expect, it } from 'vitest';
import {
  analyzeClip,
  frameMetrics,
  CLIP_MEAN_MAX,
  flattenMetrics,
  levelBands,
  RESOLUTION_MIN_PX,
  stackMetrics,
  summarize,
} from '../measure/fidelity/metrics';
import { FB, FIDELITY_BENCH } from '../measure/fidelity/parameters';
import {
  beamSampler,
  detectSector,
  fanEdges,
  GREY_8BIT,
  insideSector,
  outsideBlack,
  skinArcCenterY,
  temporalStats,
  type GreyFrame,
  type GreyScale,
} from '../measure/fidelity/sector';
import { aLinePeaks, boxSmooth, detectStructures, profileBand, sampleRow, type BeamImage } from '../measure/fidelity/structures';
import { SYNTHETIC_CONVEX, syntheticGeometry, syntheticLus, to8bit, type SyntheticLusOptions } from './support/syntheticLus';

/**
 * Banco de fidelidad (decisión 21): las métricas sobre cuadros sintéticos del patrón normal con respuesta conocida
 * (`support/syntheticLus.ts`): la geometría del sector detectada, la pleura, las sombras, las líneas A y cada métrica de
 * `docs/knowledge/reference-images.md` §3.2 y de las propuestas (M sin suelo, N1–N4), con el valor que el cuadro lleva por
 * construcción, y la censura de lo recortado. Las tolerancias salen del ruido del sintético (σ 0,02) y del muestreo
 * (1 px = ⅓ mm).
 */
const CONT: GreyScale = { lo: 0, hi: 1, quantum: 0 };
const O = SYNTHETIC_CONVEX;
const [FRAME] = syntheticLus(O);
const TRUE = syntheticGeometry(O);
const mmPerPx = 1 / O.scale;
const beamOf = (f: GreyFrame, g = TRUE): BeamImage => {
  const s = beamSampler(g, f.width, f.height);
  return { rows: s.rows, cols: s.cols, data: s.sample(f) };
};

describe('sector: detección automática desde la imagen (§3.1, pasos 2–3)', () => {
  it('convexa: el ápice, los bordes y el arco de la piel del sintético', () => {
    const d = detectSector([FRAME], CONT);
    expect(d.maskSource).toBe('intensity');
    const g = d.geometry;
    expect(g.kind).toBe('convex');
    if (g.kind === 'linear') return;
    expect(Math.hypot(g.apexX - O.apexX, g.apexY - O.apexY)).toBeLessThan(1.5);
    expect(Math.abs(g.thetaLeft + O.halfSector)).toBeLessThan(0.005);
    expect(Math.abs(g.thetaRight - O.halfSector)).toBeLessThan(0.005);
    expect(Math.abs(g.rhoMin - O.radiusMm * O.scale)).toBeLessThan(1.5);
    expect(Math.abs(g.rhoMax - (O.radiusMm + O.depthMm) * O.scale)).toBeLessThan(2);
  });

  it('un abanico cortado por el cuadro: los extremos de fila en el borde del cuadro no entran en la recta del borde (LUS-01)', () => {
    // el borde derecho sale del cuadro a media profundidad: debajo, el extremo de cada fila es la columna 479
    const cut: SyntheticLusOptions = { ...O, apexX: 330 };
    const d = detectSector(syntheticLus(cut), CONT);
    const g = d.geometry;
    expect(g.kind).toBe('convex');
    if (g.kind === 'linear') return;
    expect(Math.abs(g.thetaRight - cut.halfSector)).toBeLessThan(0.01);
    expect(Math.hypot(g.apexX - cut.apexX, g.apexY - cut.apexY)).toBeLessThan(3);
    // la recta del borde derecho se ajusta con menos filas que la del izquierdo: las de abajo tocan el marco
    expect(d.edgeInliers.right).toBeLessThan(0.8 * d.edgeInliers.left);
  });

  it('una sombra costal en el borde: el borde del abanico es la recta de apoyo del soporte, no la de la sombra (decisión 36)', () => {
    // como en el BLUE inferior del simulador con el punto en el centro del EIC4: una costilla cubre el borde derecho y bajo
    // ella todo es negro, así que en esas filas el soporte acaba en la sombra, que también es una recta por el ápice y con
    // más filas que el borde de verdad (solo lo ven el campo cercano y la cresta de la costilla). El detector de la decisión
    // 21 tomaba la sombra: el borde derecho a −14,1° y el ápice a 3,9 px
    const edge: SyntheticLusOptions = {
      ...O,
      ribs: [
        { from: -0.25, to: -0.05, topMm: 10 },
        { from: 0.32, to: 0.6, topMm: 10 },
      ],
      floor: 0,
      deep: 0,
      hazeUntilMm: 40,
    };
    const d = detectSector(syntheticLus(edge), CONT);
    const g = d.geometry;
    if (g.kind === 'linear') throw new Error('no es convexa');
    expect(Math.abs(g.thetaRight - edge.halfSector)).toBeLessThan(0.005);
    expect(Math.abs(g.thetaLeft + edge.halfSector)).toBeLessThan(0.005);
    expect(Math.hypot(g.apexX - edge.apexX, g.apexY - edge.apexY)).toBeLessThan(1.5);
  });

  it('los bordes: simétricos y sin soporte por fuera; una recta con extremos por fuera no es el borde', () => {
    // extremos de fila de un abanico x = 200 ∓ 0,6·(y + 100): en las filas 0–49 llegan al borde y en las 50–199 acaban en
    // una sombra a cada lado (x = 200 ∓ 0,45·(y + 100)), simétricas y con más filas que el borde (150 frente a 50). La
    // simetría sola no las separa (sin la restricción, gana la sombra con sus 50 filas por fuera); el campo cercano sí
    const ys = Array.from({ length: 200 }, (_, i) => i);
    const side = (s: number) => ({ ys, xs: ys.map((y) => 200 + s * (y < 50 ? 0.6 : 0.45) * (y + 100)) });
    const e = fanEdges(side(-1), side(1))!;
    expect(e.left.b).toBeCloseTo(-0.6, 6);
    expect(e.right.b).toBeCloseTo(0.6, 6);
    expect(e.left.a).toBeCloseTo(140, 4);
    expect(e.right.a).toBeCloseTo(260, 4);
    expect([e.left.inliers, e.right.inliers, e.left.outside, e.right.outside]).toEqual([50, 50, 0, 0]);
    // con el campo cercano en solo 6 filas, la sombra deja 6 extremos por fuera: con una fracción (3 % de 200) pasaba; con
    // `EDGE_OUTSIDE_ROWS` (2), no. Las 6 filas no bastan para la pendiente, pero la recta elegida pasa por ellas y no las deja fuera
    const short = (s: number) => ({ ys, xs: ys.map((y) => 200 + s * (y < 6 ? 0.6 : 0.45) * (y + 100)) });
    const sh = fanEdges(short(-1), short(1))!;
    expect([sh.left.outside, sh.right.outside]).toEqual([0, 0]);
    expect(Math.abs(sh.right.b)).not.toBeCloseTo(0.45, 2);
    // con un borde a cada lado en todas las filas y una mota pegada por fuera en dos de ellas, el borde no se mueve
    const clean = (s: number) => ({ ys, xs: ys.map((y) => 200 + s * (0.6 * (y + 100) + (y === 50 || y === 120 ? 6 : 0))) });
    const c = fanEdges(clean(-1), clean(1))!;
    expect(c.right.a).toBeCloseTo(260, 4);
    expect(c.right.outside).toBe(2);
  });

  it('el arco de la piel sitúa el ápice cuando los bordes solo se ven en pocas filas; no si la piel es el borde del recorte', () => {
    // las dos costillas cubren los dos bordes desde 8 mm: los bordes se ven en ≈ 20 filas y su intersección queda a 7 px
    // del ápice (1,6° en los bordes); el arco de la piel, entero en el cuadro, lo da a < 1 px
    const dark: SyntheticLusOptions = {
      ...O,
      apexY: -100,
      ribs: [
        { from: -0.6, to: -0.3, topMm: 8 },
        { from: 0.3, to: 0.6, topMm: 8 },
      ],
      floor: 0,
      deep: 0,
      hazeUntilMm: 30,
    };
    const g = detectSector(syntheticLus(dark), CONT).geometry;
    if (g.kind === 'linear') throw new Error('no es convexa');
    expect(Math.hypot(g.apexX - dark.apexX, g.apexY - dark.apexY)).toBeLessThan(1.5);
    expect(Math.abs(g.thetaRight - dark.halfSector)).toBeLessThan(0.005);
    // el arco directamente, desde un ápice de partida a 10 px: lo encendido del sintético
    const mask = (f: GreyFrame): Uint8Array => Uint8Array.from(f.data as Float64Array, (v) => (v > 0.02 ? 1 : 0));
    const [f] = syntheticLus(dark);
    const arc = skinArcCenterY(mask(f), f.width, f.height, dark.apexX, dark.apexY + 10, -dark.halfSector, dark.halfSector);
    expect(arc).not.toBeNull();
    expect(Math.abs(arc!.y - dark.apexY)).toBeLessThan(1);
    // y su error típico, el que lo compara con el de los bordes (2,1 px en este caso: gana el arco)
    expect(arc!.sigma).toBeLessThan(1);
    // la piel en el borde superior del cuadro (los clips de Born): no hay arco que ajustar y mandan los bordes
    const cut: SyntheticLusOptions = { ...O, apexY: -O.radiusMm * O.scale + 2 };
    const [fc] = syntheticLus(cut);
    expect(skinArcCenterY(mask(fc), fc.width, fc.height, cut.apexX, cut.apexY, -cut.halfSector, cut.halfSector)).toBeNull();
  });

  it('lineal y sectorial (sonda de fase): el tipo y el rectángulo o el ápice', () => {
    const lin: SyntheticLusOptions = {
      ...O,
      kind: 'linear',
      xLeft: 60,
      xRight: 420,
      yTop: 20,
      depthMm: 60,
      dPlMm: 12,
      ribs: [],
      hazeUntilMm: 45,
    };
    const gl = detectSector(syntheticLus(lin), CONT).geometry;
    expect(gl).toEqual({ kind: 'linear', xLeft: 60, xRight: 420, yTop: 20, yBottom: 200 });
    const sec: SyntheticLusOptions = { ...O, kind: 'sector', apexY: 10, radiusMm: 1, halfSector: 0.6 };
    const gs = detectSector(syntheticLus(sec), CONT).geometry;
    expect(gs.kind).toBe('sector');
    if (gs.kind !== 'linear') expect(Math.hypot(gs.apexX - sec.apexX, gs.apexY - sec.apexY)).toBeLessThan(2);
  });

  it('un clip vivo usa el soporte temporal: una marca fija fuera del cono no deforma el sector', () => {
    const stack = syntheticLus(O, 6, 1, 0.01).map((f) => {
      const data = Float64Array.from(f.data as Float64Array);
      // un rótulo fijo, brillante, a la derecha del sector y por debajo de su esquina
      for (let y = 380; y < 400; y++) for (let x = 400; x < 470; x++) data[y * f.width + x] = 0.9;
      return { ...f, data };
    });
    const d = detectSector(stack, CONT);
    expect(d.maskSource).toBe('temporal');
    const g = d.geometry;
    if (g.kind === 'linear') throw new Error('no es lineal');
    expect(Math.abs(g.thetaRight - O.halfSector)).toBeLessThan(0.005);
    // con el soporte por intensidad, el rótulo entra en el soporte (lo que la máscara temporal evita)
    const still = detectSector([stack[0]], CONT);
    expect(still.maskSource).toBe('intensity');
    expect(still.supportFraction).toBeGreaterThan(d.supportFraction);
  });

  it('el cuadro entero es imagen si las esquinas están encendidas; sin soporte, lanza', () => {
    const full: GreyFrame = { width: 40, height: 30, data: new Float64Array(1200).fill(0.5) };
    expect(detectSector([full], CONT)).toMatchObject({ maskSource: 'full-frame', geometry: { kind: 'linear', xRight: 39, yBottom: 29 } });
    expect(() => detectSector([{ width: 40, height: 30, data: new Float64Array(1200) }], CONT)).toThrow(/soporte insuficiente/);
    expect(() => detectSector([], CONT)).toThrow(/sin cuadros/);
    expect(() => temporalStats([full, { width: 10, height: 10, data: new Float64Array(100) }])).toThrow(/tamaños distintos/);
  });

  it('el negro del clip: la moda fuera del sector (no tiene por qué ser 0) y sin las zonas quemadas; null si no queda fuera', () => {
    // el marco a 3 de 255, como LUS-01, con un rótulo brillante fuera del sector que se excluye
    const f = to8bit(syntheticLus({ ...O, outside: 3 / 255 })[0]);
    expect(outsideBlack([f], TRUE)).toBe(3);
    const data = Uint8Array.from(f.data as Uint8Array);
    for (let y = 0; y < 200; y++) for (let x = 0; x < 60; x++) data[y * f.width + x] = 200;
    const labelled = { ...f, data };
    const rect = { x0: 0, y0: 0, x1: 59, y1: 199 };
    expect(outsideBlack([labelled], TRUE, [rect])).toBe(3);
    // un lineal a lo ancho no deja marco
    expect(outsideBlack([f], { kind: 'linear', xLeft: 0, xRight: f.width - 1, yTop: 0, yBottom: f.height - 1 })).toBeNull();
    expect(insideSector(TRUE, O.apexX, O.apexY + O.radiusMm * O.scale + 10)).toBe(true);
    expect(insideSector(TRUE, 0, 0)).toBe(false);
  });
});

describe('estructuras y métricas del patrón normal sobre el sintético convexo', () => {
  const a = analyzeClip([FRAME], { geometry: TRUE, mmPerPx, scale: CONT });
  const m = a.perFrame[0];
  // los picos de las líneas A de orden 2 (36 mm, en la neblina) y 3 (54 mm, ya en el campo profundo, que empieza a 50 mm):
  // la prominencia de la pleura sobre la neblina por la razón entre órdenes
  const gA1 = O.haze + O.decay * (O.pleura - O.haze);
  const gA2 = O.deep + O.decay ** 2 * (O.pleura - O.haze);

  it('la pleura a d_pl, dos sombras con la superficie costal encima (P4) y las líneas A a k·d_pl (A1)', () => {
    expect(Math.abs(m.structures.dPl.mm! - O.dPlMm)).toBeLessThan(0.2);
    expect(m.structures.shadows).toHaveLength(2);
    expect(m.structures.rejectedShadows).toBe(0);
    expect(m.structures.shadowSplitEta).toBeGreaterThan(0.9);
    for (const s of m.structures.shadows) expect(Math.abs(s.ribTop.mm! - 12)).toBeLessThan(0.4);
    expect(Math.abs(m.P4.mm! - 6)).toBeLessThan(0.4);
    expect(m.P4.dPl).toBeCloseTo(6 / 18, 1);
    // la serie a u = k y el espaciado a menos del 1 % de d_pl
    for (const p of m.structures.aLines.filter((x) => x.k <= 5)) expect(Math.abs(p.u - p.k)).toBeLessThan(0.03);
    expect(m.A1.max).toBeLessThan(0.015);
  });

  it('A2: r_k ≈ decay^(k−1), la pendiente de ln r_k ≈ ln(decay) y las líneas A visibles (r_k ≥ 5 %)', () => {
    // r_2…r_5 = 0,5, 0,25, 0,125, 0,0625 por construcción; el fondo local de la pleura mezcla pared y neblina, así que
    // su prominencia es algo menor y los r_k algo mayores
    [0.5, 0.25, 0.125, 0.0625].forEach((r, i) => expect(Math.abs(m.A2.ratios[i + 1] - r)).toBeLessThan(0.05));
    expect(m.A2.visible).toBe(4);
    expect(m.A2.slopeLn).toBeGreaterThan(Math.log(0.5) - 0.1);
    expect(m.A2.slopeLn).toBeLessThan(Math.log(0.5) + 0.1);
    // con una razón de 0,2 solo dos órdenes pasan del 5 % (0,2 y 0,04 → uno)
    const [steep] = syntheticLus({ ...O, decay: 0.2 });
    expect(analyzeClip([steep], { geometry: TRUE, scale: CONT }).perFrame[0].A2.visible).toBe(1);
  });

  it('los niveles de cada banda, M sin suelo (en caídas pleura → línea A) y N1–N4, con el valor del sintético', () => {
    const l = m.levels;
    expect(l.wall.grey).toBeCloseTo(O.wall, 1);
    expect(l.haze.grey).toBeCloseTo(O.haze, 1);
    expect(l.deep.grey).toBeCloseTo(O.deep, 1);
    expect(l.floor.grey).toBeCloseTo(O.floor, 1);
    for (const x of [l.wall, l.haze, l.deep, l.floor]) expect(x.censored).toBeNull();
    const g1 = l.pleuraPeak;
    expect(Math.abs(g1 - O.pleura)).toBeLessThan(0.05);
    expect(Math.abs(l.a1Peak - gA1)).toBeLessThan(0.03);
    // M_x = (g_pl − g_x)/(g_pl − g_A1), con los picos del perfil medidos…
    const measured = (g: number): number => (g1 - g) / (g1 - l.a1Peak);
    expect(m.M.wall).toBeCloseTo(measured(l.wall.grey), 12);
    expect(m.M.haze).toBeCloseTo(measured(l.haze.grey), 12);
    expect(m.M.deep).toBeCloseTo(measured(l.deep.grey), 12);
    // …y los del sintético: la pared 1,67, la neblina 2,0 y el campo profundo 2,17 caídas de línea A, a ≤ 10 % (el pico de la
    // pleura, máximo de un perfil con ruido, sale ≈ 0,03 alto y agranda la caída)
    const drop = O.pleura - gA1;
    expect(Math.abs(m.M.wall / ((O.pleura - O.wall) / drop) - 1)).toBeLessThan(0.1);
    expect(Math.abs(m.M.haze / ((O.pleura - O.haze) / drop) - 1)).toBeLessThan(0.1);
    expect(Math.abs(m.M.deep / ((O.pleura - O.deep) / drop) - 1)).toBeLessThan(0.1);
    // N1–N3 sobre el suelo medido (aquí no está recortado)
    expect(m.N1).toBeCloseTo((O.wall - O.floor) / (g1 - O.floor), 1);
    expect(m.N2).toBeCloseTo((O.haze - O.floor) / (g1 - O.floor), 1);
    expect(m.N3).toBeCloseTo((O.deep - O.floor) / (g1 - O.floor), 1);
    // N4: (pleura − pared)/(A1 − A2) = 0,6/0,24 = 2,5
    expect(Math.abs(m.N4 - (O.pleura - O.wall) / (gA1 - gA2))).toBeLessThan(0.4);
    // sin nada recortado, nada censurado salvo las anchuras al límite del muestreo
    expect(Object.keys(m.censored).filter((k) => m.censored[k] !== 'resolution')).toEqual([]);
  });

  it('P1, P2 y T1: el brillo relativo de la pleura, su grosor (2,355σ) y el grano del ruido de la pared', () => {
    // P1 = (p95 pleura − tejido)/(p95 costilla − tejido) ≈ (0,9 − 0,3)/(0,8 − 0,3) = 1,2 (el p95 del ruido lo sube)
    expect(m.P1).toBeGreaterThan(1.1);
    expect(m.P1).toBeLessThan(1.45);
    expect(Math.abs(m.P2.mm! - 2.355 * O.echoSigmaMm)).toBeLessThan(0.15);
    expect(m.P2.clippedPeaks).toBe(0);
    // 2,355 × 1,5 px = 3,5 px: bajo 5 px, P2 está al límite del muestreo y no se compara como medida
    expect(m.P2.px).toBeLessThan(RESOLUTION_MIN_PX.P2);
    expect(m.censored['P2.dPl']).toBe('resolution');
    expect(m.censored['P2.mm']).toBe('resolution');
    const wide = analyzeClip(syntheticLus({ ...O, echoSigmaMm: 1.2 }), { geometry: TRUE, mmPerPx, scale: CONT }).perFrame[0];
    // la media altura sobre el fondo local (la pared arriba, la neblina abajo): a ≤ 20 % de 2,355σ
    expect(Math.abs(wide.P2.mm! / (2.355 * 1.2) - 1)).toBeLessThan(0.2);
    expect(wide.P2.px).toBeGreaterThan(RESOLUTION_MIN_PX.P2);
    expect(wide.censored['P2.dPl']).toBeUndefined();
    // el ruido de caja 3 × 3: autocorrelación triangular de semiancho 3 px, FWHM 3 px = 1 mm (justo en el límite de T1)
    expect(Math.abs(m.T1.axial.px - 3)).toBeLessThan(0.6);
    expect(Math.abs(m.T1.lateral.px - 3)).toBeLessThan(0.6);
    expect(m.censored['T1.axial.dPl'] === 'resolution').toBe(m.T1.axial.px < RESOLUTION_MIN_PX.T1);
    // σ del moteado de la pared (el ruido, 0,02) sobre la prominencia de la pleura (≈ 0,6): la interpolación del muestreo y la
    // media lateral que quita las capas le quitan parte de la varianza (medido: 0,76 de la del ruido)
    const expected = O.noise / (O.pleura - O.wall);
    expect(m.T1.sigmaOverProminence).toBeGreaterThan(0.6 * expected);
    expect(m.T1.sigmaOverProminence).toBeLessThan(1.05 * expected);
  });

  it('el resumen del clip lleva mediana, IQR y censura de cada métrica escalar', () => {
    expect(a.analyzedFrames).toBe(1);
    expect(a.summary['M.wall'].median).toBe(m.M.wall);
    expect(a.summary['M.wall'].censored).toBeNull();
    expect(a.summary['P2.dPl'].censored).toBe('resolution');
    expect(a.summary['A2.r2'].median).toBe(m.A2.ratios[1]);
    expect(a.summary['levels.floor.grey'].n).toBe(1);
    expect(a.stack).toBeNull();
    expect(Object.keys(flattenMetrics(m))).toEqual(expect.arrayContaining(['T1.lateral.mm', 'M.deep', 'N4', 'shadows.rejected']));
  });

  it('lineal: la pleura, la costilla y las líneas A en coordenadas de la imagen', () => {
    const lin: SyntheticLusOptions = {
      ...O,
      kind: 'linear',
      xLeft: 60,
      xRight: 420,
      yTop: 20,
      depthMm: 60,
      dPlMm: 12,
      ribs: [{ from: 100, to: 170, topMm: 8 }],
      hazeUntilMm: 45,
    };
    const ml = analyzeClip(syntheticLus(lin), { mmPerPx, scale: CONT }).perFrame[0];
    expect(Math.abs(ml.structures.dPl.mm! - 12)).toBeLessThan(0.3);
    expect(Math.abs(ml.P4.mm! - 4)).toBeLessThan(0.4);
    expect(ml.A2.visible).toBe(3);
  });

  it('sin la piel en el borde superior (un recorte), A1 no se da: mide el recorte y no el espaciado', () => {
    const cropped = analyzeClip([FRAME], { geometry: TRUE, scale: CONT, skinAtTop: false }).perFrame[0];
    expect(cropped.A1.errors).toEqual([]);
    expect(Number.isNaN(cropped.A1.max)).toBe(true);
    // lo demás no cambia
    expect(cropped.M.wall).toBe(m.M.wall);
  });

  it('las zonas excluidas no se miden: un rótulo quemado en la pared, más brillante que la pleura, no la reemplaza', () => {
    // una banda blanca de 6 a 10 mm bajo la piel, a lo ancho del sector
    const data = Float64Array.from(FRAME.data as Float64Array);
    const y0 = Math.round(O.apexY + (O.radiusMm + 6) * O.scale);
    const y1 = Math.round(O.apexY + (O.radiusMm + 10) * O.scale);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < O.width; x++) data[y * O.width + x] = 1;
    const burned = { ...FRAME, data };
    const rect = { x0: 0, y0, x1: O.width - 1, y1 };
    const dirty = analyzeClip([burned], { geometry: TRUE, scale: CONT, mmPerPx }).perFrame[0];
    const clean = analyzeClip([burned], { geometry: TRUE, scale: CONT, mmPerPx, exclude: [rect] }).perFrame[0];
    // sin excluirla, la «pleura» es el rótulo; excluida, la de verdad y la pared de verdad
    expect(dirty.structures.dPl.mm!).toBeLessThan(12);
    expect(Math.abs(clean.structures.dPl.mm! - O.dPlMm)).toBeLessThan(0.5);
    expect(clean.levels.wall.grey).toBeCloseTo(O.wall, 1);
    const sampler = beamSampler(TRUE, O.width, O.height, [rect]);
    expect(Array.from(sampler.sample(burned)).filter((v) => Number.isNaN(v)).length).toBeGreaterThan(0);
  });
});

describe('detección de estructuras: la pleura guiada por el cuadro medio y las sombras con una sola superficie', () => {
  const beam = beamOf(FRAME);
  const truth = detectStructures(beam);

  it('con una fascia más brillante que la pleura, la cresta la toma; con la pleura del cuadro medio (±30 %), no', () => {
    const data = Float64Array.from(beam.data);
    const row = Math.round(0.45 * truth.dPlPx);
    for (let j = 0; j < beam.cols; j++) for (let i = row - 1; i <= row + 1; i++) data[i * beam.cols + j] = 1.2;
    const fascia: BeamImage = { ...beam, data };
    expect(Math.abs(detectStructures(fascia).dPlPx - row)).toBeLessThan(3);
    const guided = detectStructures(fascia, { dPlPx: truth.dPlPx });
    expect(Math.abs(guided.dPlPx - truth.dPlPx)).toBeLessThan(1);
    // una pleura del cuadro medio sin sentido (NaN, 0) no guía
    expect(detectStructures(beam, { dPlPx: Number.NaN }).dPlPx).toBe(truth.dPlPx);
  });

  it('un tramo oscuro con crestas de dos poblaciones (una costilla somera y otra honda) no es una sombra limpia', () => {
    const [f] = syntheticLus({
      ...O,
      ribs: [
        { from: -0.4, to: -0.22, topMm: 12 },
        { from: 0.12, to: 0.21, topMm: 5 },
        { from: 0.21, to: 0.3, topMm: 13 },
      ],
    });
    const st = detectStructures(beamOf(f));
    expect(st.shadows).toHaveLength(1);
    expect(st.rejectedShadows).toBe(1);
  });
});

describe('recortes: la censura en el negro y en el blanco (§3.1, principio 5)', () => {
  it('con el suelo y el campo profundo en el negro de 8 bits: sus niveles son cotas, N1–N3 no son medidas y M.deep es una cota inferior', () => {
    const [f] = syntheticLus({ ...O, floor: -0.05, deep: -0.02 });
    const m = analyzeClip([to8bit(f)], { geometry: TRUE, scale: GREY_8BIT }).perFrame[0];
    expect(m.levels.floor.censored).toBe('low');
    expect(m.levels.floor.clippedLow).toBeGreaterThan(0.9);
    expect(m.levels.deep.censored).toBe('low');
    expect(m.levels.wall.censored).toBeNull();
    for (const k of ['N1', 'N2', 'N3']) expect(m.censored[k]).toBe('unknown');
    expect(m.censored['M.deep']).toBe('lower');
    expect(m.censored['M.wall']).toBeUndefined();
    expect(m.censored['M.haze']).toBeUndefined();
    expect(m.censored['levels.floor.grey']).toBe('upper');
  });

  it('con la pleura saturada: su p95 censurado en el blanco, P2 una cota superior y lo que usa su pico, sin medida', () => {
    const [f] = syntheticLus({ ...O, pleura: 1.3, echoSigmaMm: 1.2 });
    const m = analyzeClip([to8bit(f)], { geometry: TRUE, scale: GREY_8BIT }).perFrame[0];
    expect(m.levels.pleuraP95.censored).toBe('high');
    expect(m.levels.peaks.pleura.clippedHigh).toBeGreaterThan(0.5);
    expect(m.P2.clippedPeaks).toBeGreaterThan(0.5);
    expect(m.censored['P2.dPl']).toBe('upper');
    for (const k of ['M.wall', 'M.haze', 'N4', 'A2.r2', 'A2.slopeLn', 'P1', 'T1.sigmaOverProminence'])
      expect(m.censored[k], k).toBe('unknown');
  });

  it('una mediana aguanta hasta la mitad recortada; una σ, una autocorrelación o una media, solo hasta el 5 % (CLIP_MEAN_MAX)', () => {
    // la pared rozando el negro: una parte de su moteado en el gris 0, menos de la mitad
    const [f] = syntheticLus({ ...O, wall: 0.012 });
    const m = analyzeClip([to8bit(f)], { geometry: TRUE, scale: GREY_8BIT }).perFrame[0];
    expect(m.levels.wall.clippedLow).toBeGreaterThan(CLIP_MEAN_MAX);
    expect(m.levels.wall.clippedLow).toBeLessThan(0.5);
    // la mediana de la pared es una medida y M de la pared también; el moteado (σ y autocorrelación), no
    expect(m.levels.wall.censored).toBeNull();
    expect(m.censored['M.wall']).toBeUndefined();
    for (const k of ['T1.sigmaOverProminence', 'T1.axial.dPl', 'T1.lateral.dPl']) expect(m.censored[k], k).toBe('unknown');
  });

  it('en la pila: T2 y S1 no son medidas si la banda tiene un 5 % o más de muestras recortadas', () => {
    // la neblina y el campo profundo en el negro: la banda bajo la pleura, recortada
    const frames = syntheticLus({ ...O, haze: -0.03, deep: -0.03 }, 4, 1.5, 0.01).map(to8bit);
    const s = analyzeClip(frames, { geometry: TRUE, scale: GREY_8BIT }).stack!;
    expect(s.censored['T2.subPleura']).toBe('unknown');
    expect(s.censored['S1.ratio']).toBeDefined();
    expect(s.censored['S1.decorrelationS']).toBe('unknown');
    expect(s.censored['T2.wall']).toBeUndefined();
  });

  it('el resumen de un clip: censurada si lo está la mitad o más de sus cuadros, con la censura más frecuente', () => {
    expect(summarize([1, 2, 3, 4], [undefined, 'lower', undefined, undefined])).toMatchObject({
      median: 2.5,
      censored: null,
      censoredFraction: 0.25,
    });
    expect(summarize([1, 2, 3, 4], ['upper', 'lower', 'lower', undefined])).toMatchObject({ censored: 'lower', censoredFraction: 0.75 });
    expect(summarize([], [])).toMatchObject({ censored: null, censoredFraction: 0 });
  });
});

describe('pila: coherencia temporal (T2), modo M reconstruido (S1) y cuadros repetidos', () => {
  it('las réplicas simultáneas conservan métricas espaciales pero no publican medidas temporales', () => {
    const frames = syntheticLus(O, 3, 1.5, 0.01);
    const replicated = analyzeClip(frames, { geometry: TRUE, scale: CONT, frameIntervalS: 0 });
    expect(replicated.stack).toBeNull();
    expect(Number.isFinite(replicated.summary['M.wall'].median)).toBe(true);
    expect(analyzeClip(frames, { geometry: TRUE, scale: CONT }).stack).not.toBeNull();
    for (const frameIntervalS of [-1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => analyzeClip(frames, { frameIntervalS })).toThrow(/intervalo/);
  });
  const geometry = TRUE;
  const moving = analyzeClip(syntheticLus(O, 12, 1.5, 0.01), { geometry, scale: CONT, frameIntervalS: 1 / 30 }).stack!;
  const still = analyzeClip(syntheticLus(O, 12, 0, 0.01), { geometry, scale: CONT, frameIntervalS: 1 / 30 }).stack!;

  it('con el pulmón deslizándose bajo la pleura: menos correlación bajo ella que en la pared, y más σ temporal (orilla de mar)', () => {
    expect(moving.T2.subPleura.median).toBeLessThan(moving.T2.wall.median - 0.2);
    expect(moving.S1.ratio).toBeGreaterThan(1.6);
    expect(moving.S1.decorrelationS).toBeGreaterThan(0);
    expect(moving.S1.columns).toBeGreaterThanOrEqual(3);
    expect(moving.repeatedPairs).toBe(0);
    expect(moving.censored).toEqual({});
  });

  it('quieto: la misma correlación arriba y abajo y S1 ≈ 1 (código de barras)', () => {
    expect(Math.abs(still.T2.subPleura.median - still.T2.wall.median)).toBeLessThan(0.05);
    expect(Math.abs(still.S1.ratio - 1)).toBeLessThan(0.15);
  });

  it('un vídeo que repite cuadros: los pares sin cambio en la pared se cuentan (fuera T2 y S1 en el banco)', () => {
    const f = syntheticLus(O, 3, 1.5, 0.01).map(to8bit);
    const doubled = [f[0], f[0], f[1], f[1], f[2], f[2]];
    const s = analyzeClip(doubled, { geometry, scale: GREY_8BIT }).stack!;
    expect(s.repeatedPairs).toBe(3);
  });

  it('en 8 bits sin ruido temporal, σ_t queda bajo el escalón/√12: S1 no es una medida (no el cociente de dos ceros)', () => {
    const f = to8bit(FRAME);
    const s = analyzeClip([f, f, f, f], { geometry, scale: GREY_8BIT }).stack!;
    expect(s.S1.sigmaBelow).toBe(0);
    expect(s.S1.ratio).toBe(1);
    expect(s.censored['S1.ratio']).toBe('unknown');
    // solo arriba quieto: el cociente es una cota inferior
    const sampler = beamSampler(geometry, O.width, O.height);
    const beams = syntheticLus(O, 4, 2, 0).map((x) => ({ rows: sampler.rows, cols: sampler.cols, data: sampler.sample(to8bit(x)) }));
    expect(stackMetrics(beams, detectStructures(beams[0]), null, GREY_8BIT).censored['S1.ratio']).toBe('lower');
  });

  it('sin intervalo entre cuadros, el tiempo de decorrelación no se da en segundos', () => {
    const sampler = beamSampler(geometry, O.width, O.height);
    const beams: BeamImage[] = syntheticLus(O, 4, 2, 0.01).map((f) => ({
      rows: sampler.rows,
      cols: sampler.cols,
      data: sampler.sample(f),
    }));
    const st = detectStructures(beams[0]);
    expect(stackMetrics(beams, st).S1.decorrelationS).toBeNull();
  });
});

describe('piezas del detector', () => {
  const sampler = beamSampler(TRUE, O.width, O.height);
  const beam: BeamImage = { rows: sampler.rows, cols: sampler.cols, data: sampler.sample(FRAME) };

  it('el muestreo del haz: filas de 1 px desde la piel, NaN fuera del cuadro, y lanza con otro tamaño', () => {
    expect(sampler.rows).toBe(Math.floor(O.depthMm * O.scale));
    // 1 px entre columnas a media profundidad (menos cerca de la piel, más en el fondo)
    const mid = Math.floor(0.5 * sampler.rows);
    expect(sampler.lateralPx(mid)).toBeGreaterThan(0.9);
    expect(sampler.lateralPx(mid)).toBeLessThan(1.1);
    expect(sampler.lateralPx(0)).toBeLessThan(sampler.lateralPx(mid));
    const p = sampler.position(0, Math.floor(sampler.cols / 2));
    expect(Math.hypot(p.x - O.apexX, p.y - O.apexY)).toBeCloseTo(O.radiusMm * O.scale, 6);
    expect(() => sampler.sample({ width: 10, height: 10, data: new Float64Array(100) })).toThrow(/tamaño/);
    const off = beamSampler(syntheticGeometry({ ...O, apexY: -400 }), O.width, O.height);
    expect(Array.from(off.sample(FRAME)).some((v) => Number.isNaN(v))).toBe(true);
  });

  it('el suavizado, la fila fraccionaria, las bandas del perfil y las de nivel (en múltiplos de la pleura de cada columna)', () => {
    const s = boxSmooth({ rows: 1, cols: 3, data: Float64Array.from([0, Number.NaN, 3]) }, 1, 0);
    expect(Array.from(s)).toEqual([0, 1.5, 3]);
    expect(Number.isNaN(sampleRow(beam, -1, 0))).toBe(true);
    const st = detectStructures(beam);
    expect(profileBand(st.profile, st.du, 1.25, 1.75)).toBeCloseTo(O.haze, 1);
    const bands = levelBands(st, beam.rows);
    expect(bands.wall.length).toBe(st.intercostal.length);
    expect(bands.floor.length).toBe(st.shadowCore.length);
    const d = bands.deep[0];
    expect(d.from).toBeCloseTo(FB.deepFrom * st.pleuraPx[d.col], 9);
    expect(d.to).toBeCloseTo(FB.deepTo * st.pleuraPx[d.col], 9);
  });

  it('sin costillas no hay sombras: el suelo no se mide y lo que lo usa queda sin valor', () => {
    const [f] = syntheticLus({ ...O, ribs: [] });
    const m = frameMetrics({ rows: sampler.rows, cols: sampler.cols, data: sampler.sample(f) }, sampler, CONT);
    expect(m.structures.shadows).toEqual([]);
    expect(Number.isNaN(m.levels.floor.grey)).toBe(true);
    expect(Number.isNaN(m.N1)).toBe(true);
    expect(Number.isNaN(m.P4.px)).toBe(true);
    // M no necesita el suelo
    expect(Number.isFinite(m.M.wall)).toBe(true);
  });

  it('un perfil plano no tiene líneas A; con un pico en u = 2, una', () => {
    const flat = new Float64Array(400).fill(0.2);
    const du = 1 / 50;
    expect(aLinePeaks(flat, du).visible).toBe(0);
    const bump = flat.map((v, i) => v + 0.6 * Math.exp(-(((i * du - 1) / 0.02) ** 2)) + 0.2 * Math.exp(-(((i * du - 2) / 0.02) ** 2)));
    const r = aLinePeaks(Float64Array.from(bump), du);
    expect(r.visible).toBe(1);
    expect(r.peaks[1].ratio).toBeCloseTo(1 / 3, 1);
  });

  it('un perfil que cae mucho con la profundidad (LUS-35v): las líneas A se buscan sin la tendencia (decisión 31)', () => {
    // 146 grises en la pleura y la mitad cada 2,7 d_pl, con la pleura (+54) y tres líneas A de 8, 6 y 4 grises; en la ventana
    // del orden 2 (u 1,7–2,3) el perfil crudo es máximo en su borde izquierdo: buscado sobre él, la línea A no se encuentra
    const du = 1 / 40;
    const bump = (u: number, at: number, h: number): number => h * Math.exp(-(((u - at) / 0.04) ** 2));
    const profile = Float64Array.from({ length: 280 }, (_, i) => {
      const u = i * du;
      const trend = u < 1 ? 60 : 146 * Math.exp(-0.26 * (u - 1));
      return trend + bump(u, 1, 54) + bump(u, 2, 8) + bump(u, 3, 6) + bump(u, 4, 4) + 0.3 * Math.sin(i * 2.399);
    });
    const raw = profile.slice(Math.ceil(1.7 / du), Math.floor(2.3 / du) + 1);
    expect(raw.indexOf(Math.max(...raw))).toBe(0);
    const r = aLinePeaks(profile, du);
    expect(r.peaks[1].found).toBe(true);
    expect(Math.abs(r.peaks[1].u - 2)).toBeLessThan(0.02);
    expect(r.visible).toBeGreaterThanOrEqual(2);
    // la prominencia, sobre la tendencia (las medianas de cada lado, sin el pico): los 8 grises de la línea A a ±0,5; una
    // mediana centrada en el pico, sobre esta pendiente, le quitaba 3
    expect(Math.abs(r.peaks[1].prominence - 8)).toBeLessThan(0.5);
    expect(Math.abs(r.peaks[2].prominence - 6)).toBeLessThan(0.5);
  });

  it('el mismo perfil sin líneas A y con ruido correlado: casi ninguna línea A «visible» (revisión de la decisión 31)', () => {
    // ruido gaussiano suavizado (σ de 2 muestras, 0,05 d_pl) de DE 4 grises: la segunda diferencia casi no lo ve y, con
    // solo ella como ruido, 113 de estos 200 perfiles tienen una línea A «visible»; con la DE robusta del perfil sin
    // tendencia, 1
    let seed = 3;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed + 0.5) / 2147483648;
    };
    const gauss = (): number => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
    const du = 1 / 40;
    const trials = 200;
    let visible = 0;
    for (let t = 0; t < trials; t++) {
      const white = Array.from({ length: 300 }, gauss);
      const smooth = white.map((_, i) => {
        let a = 0;
        let w = 0;
        for (let k = -6; k <= 6; k++) {
          const j = i + k;
          if (j < 0 || j >= white.length) continue;
          const g = Math.exp(-0.5 * (k / 2) ** 2);
          a += g * white[j];
          w += g * g;
        }
        return a / Math.sqrt(w);
      });
      const profile = Float64Array.from({ length: 280 }, (_, i) => {
        const u = i * du;
        const trend = u < 1 ? 60 : 146 * Math.exp(-0.26 * (u - 1));
        return trend + 54 * Math.exp(-(((u - 1) / 0.04) ** 2)) + 4 * smooth[i];
      });
      const r = aLinePeaks(profile, du);
      if (r.visible > 0) visible++;
      // un orden encontrado sobresale de la tendencia
      for (const p of r.peaks.slice(1)) if (p.found) expect(p.ratio).toBeGreaterThan(0);
    }
    expect(visible / trials).toBeLessThan(0.03);
  });

  it('las definiciones del banco llevan su evidencia (estimadas, con rango)', () => {
    for (const p of Object.values(FIDELITY_BENCH.params)) expect(p.evidence).toBe('estimado');
    expect(FB.hazeFrom).toBeLessThan(FB.hazeTo);
    expect(FB.deepFrom).toBeLessThan(FB.deepTo);
    expect(FB.wallTo).toBeLessThan(1);
  });
});
