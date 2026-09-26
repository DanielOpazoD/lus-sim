import { chai, describe, expect, it } from 'vitest';
import { Interface } from '../anatomy/interfaces';
import { AnatomyScene } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import { defaultPatient } from '../physiology/patientState';
import { RespiratoryModel } from '../physiology/respiratory';
import { CONVEX_C35, defaultPose, pointOnLine, type ProbePose } from '../probe/probe';
import { interfaceEchoField } from '../ultrasound/interfaceEcho';
import { pleuraCoherence, pleuraTerms } from '../ultrasound/pleura';
import {
  arcMm,
  chestView,
  intercostalZ,
  longitudinalPose,
  ribOf,
  ribShadows,
  ribZ,
  scanLine,
  scanView,
  type ChestView,
} from './support/chestView';
import { median, simulate, type Scene } from './support/interfaceTwin';

/**
 * Metas de anatomía de la fase 1 (docs/KNOWLEDGE.md §4: A-T1–A-T3 y A-T6–A-T11, de
 * docs/knowledge/anatomy.md §3) medidas sobre la escena del tórax heredada de VExUS (decisión 10), con el
 * procedimiento de `support/chestView.ts`: la sonda apoyada con su contacto («presión estándar») y la
 * respiración en fin de espiración, midiendo a lo largo de sus líneas. Las metas son para una sonda lineal de
 * 38–40 mm; lus-sim solo tiene aún el convexo de 3,5 MHz (`convex-probe-only`), así que se mide con él.
 *
 * Lo que la escena heredada aún no cumple va con `notYetMet`, con el valor medido en su comentario: la prueba
 * exige que la meta falle por su aserción (`chai.AssertionError`), no por un error del código de medida; el
 * paso C (anatomía del tórax) las pasará a `it`. No se ajusta la anatomía aquí. Cada umbral es el criterio de
 * aceptación de la meta, tal cual. Las costillas se buscan por su número (`AnatomyScene.ribNumbers`): si falta
 * una que la meta necesita, la prueba lo afirma primero.
 */
const scene = new AnatomyScene(defaultPatient());
const tr = CONVEX_C35;
/** Paso angular entre dos líneas del convexo (rad). */
const PITCH = (2 * tr.halfSector) / (tr.lines - 1);
/**
 * Líneas del tórax en la escena (ángulo del tronco φ), posiciones de medida de las pruebas:
 *  - LMC, la medioclavicular derecha: la de la pose por omisión (`BLUE_UPPER_POSE`), donde el cartílago costal de
 *    VExUS pasa a hueso;
 *  - LAM, la axilar media: φ = π, el costado del tronco, donde VExUS pone su ventana intercostal;
 *  - LAA, la axilar anterior: 0,9π, entre la medioclavicular y la axilar media, más cerca de esta. No hay fuente
 *    que la sitúe en el tronco elíptico (docs/knowledge/anatomy.md no da la posición de las líneas axilares): A-T2
 *    admite la LAA o la LAM y se miden las dos, así que el resultado no depende de esta estimación;
 *  - POSTERIOR, la axilar posterior: 1,2π, el tope de `clampPose` en decúbito supino (VExUS la llama así), lo más
 *    posterior que llega la sonda. Yoshida midió la banda posterior a 50–60 mm de las apófisis espinosas y
 *    sentado: la meta posterior se mide aquí más lateral de lo que pide.
 */
const LMC = defaultPose().phi;
const LAA = 0.9 * Math.PI;
const LAM = Math.PI;
const POSTERIOR = 1.2 * Math.PI;

/**
 * Meta que la escena aún no cumple: la prueba exige que su cuerpo falle por una aserción (`chai.AssertionError`),
 * no por un error del código de medida (un TypeError, una costilla que falta sin decirlo). Cuando el paso C la
 * cumpla, esta prueba falla y hay que pasarla a `it`.
 */
function notYetMet(title: string, body: () => void): void {
  it(`${title} [aún no se cumple]`, () => {
    expect(body).toThrow(chai.AssertionError);
  });
}

/** Profundidad de la pleura parietal (mm) bajo la línea central de la sonda en la pose. */
function pleuraDepth(pose: ProbePose): number {
  const d = scanLine(chestView(scene, pose), 0).pleuraMm;
  if (d === null) throw new Error(`sin pleura en φ ${pose.phi.toFixed(3)}, z ${pose.z.toFixed(1)}`);
  return d;
}

/** Pose longitudinal centrada en el espacio intercostal n en φ (lanza si la escena no tiene sus costillas). */
function icsPose(n: number, phi: number): ProbePose {
  return longitudinalPose(phi, intercostalZ(scene, n, phi));
}

/**
 * Signo del murciélago en la vista: las dos sombras costales vecinas a la línea central, la pleura en la
 * línea media entre ellas, la línea costal (la cresta de las costillas), el ancho de las sombras y del
 * espacio intercostal a la profundidad de la pleura, el periodo costal y la banda de músculo entre la línea
 * costal y la pleura en el centro del espacio.
 */
function batSign(v: ChestView) {
  const shadows = ribShadows(scanView(v));
  const left = shadows.filter((s) => s.theta1 < 0).pop();
  const right = shadows.find((s) => s.theta0 > 0);
  if (!left || !right) throw new Error('sin dos sombras costales a los lados de la línea central');
  const center = 0.5 * (left.theta1 + right.theta0);
  const D = scanLine(v, center).pleuraMm;
  if (D === null) throw new Error('sin pleura en el centro del espacio intercostal');
  const ribLine = 0.5 * (left.ribTopMm + right.ribTopMm);
  let muscle = 0;
  const step = 0.02;
  for (let r = ribLine; r < D; r += step)
    if (scene.classify(v.material(pointOnLine(v.contact.frame, tr, center, r)), v.instant).tissue === Tissue.Muscle) muscle += step;
  return {
    pleuraMm: D,
    pleuraBelowRibLineMm: D - ribLine,
    shadowWidthsMm: [arcMm(tr, left.theta1 - left.theta0 + PITCH, D), arcMm(tr, right.theta1 - right.theta0 + PITCH, D)],
    intercostalMm: arcMm(tr, right.theta0 - left.theta1 - PITCH, D),
    ribPeriodMm: arcMm(tr, 0.5 * (right.theta0 + right.theta1) - 0.5 * (left.theta0 + left.theta1), D),
    intercostalBandMm: muscle,
  };
}

const deepInspiration = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'apnea-inspiratory' }).sample(0);

describe('A-T1–A-T3: profundidad de la pleura por región (docs/knowledge/anatomy.md §3)', () => {
  // Medido (26-09-2026, en la escena heredada): EIC2-LMC 25,2 mm; EIC5-LAA 27,2; EIC5-LAM 28,0; EIC4-LAM 28,0.
  // La pared es la del abdomen de VExUS, 2 + 14 + 12 = 28 mm en la métrica radial y la misma en todo el
  // tronco (`thorax-wall-abdominal-habitus`): delante sale 25 mm porque la normal de la piel no es radial.

  notYetMet('A-T1: la pleura en EIC2-LMC (el punto BLUE superior) está a 12–20 mm (hoy 25,2)', () => {
    const d = pleuraDepth(defaultPose());
    expect(d).toBeGreaterThanOrEqual(12);
    expect(d).toBeLessThanOrEqual(20);
  });

  notYetMet('A-T2: en EIC5 LAA/LAM a 10–16 mm y el cociente lateral/anterior entre 0,7 y 0,9 (hoy 27,2 y 28,0; cociente 1,08–1,11)', () => {
    const anterior = pleuraDepth(defaultPose());
    for (const phi of [LAA, LAM]) {
      const d = pleuraDepth(icsPose(5, phi));
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(16);
      expect(d / anterior).toBeGreaterThanOrEqual(0.7);
      expect(d / anterior).toBeLessThanOrEqual(0.9);
    }
  });

  notYetMet('A-T3: en EIC4-LAM a 14–22 mm y más honda que en A-T1 (hoy sin 4.ª costilla; medio periodo sobre la 5.ª, 28,0)', () => {
    // EIC4 necesita la 4.ª costilla, que la escena no tiene (`ribs-5-10-only`). Medido medio periodo costal por
    // encima de la 5.ª (con el de la 5.ª y la 6.ª en esa línea): la pleura, a 28,0 mm, más honda que en A-T1 pero
    // fuera del rango
    expect(scene.ribNumbers, 'la escena no tiene la 4.ª costilla').toContain(4);
    const d = pleuraDepth(icsPose(4, LAM));
    expect(d).toBeGreaterThan(pleuraDepth(defaultPose()));
    expect(d).toBeGreaterThanOrEqual(14);
    expect(d).toBeLessThanOrEqual(22);
  });
});

describe('A-T6: líneas A a múltiplos de la profundidad de la pleura', () => {
  it('la primera línea A está a 2 × la profundidad de la línea pleural ± 1 mm y la segunda a 3 × (serie de pleura.ts)', () => {
    // La serie de reverberaciones (`pleuraTerms`, gemelo de la pasada B) con la pleura medida en el punto BLUE
    // superior: la réplica k del eco pleural. Se buscan los máximos de su amplitud a lo largo de la línea
    // central (incidencia normal); la línea pleural es la réplica 1. Cumple: el modelo es la física de la
    // reverberación (docs/knowledge/physics.md, F-T01)
    const D = pleuraDepth(defaultPose());
    const k0 = (2 * Math.PI) / (1540 / 2500);
    const chi = pleuraCoherence(1, k0);
    const tD = 0.5;
    const amp = (s: number): number => {
      const p = pleuraTerms(s, D, tD, chi, () => tD).find((t) => t.family === 'pleura')!;
      return p.gain * interfaceEchoField(Interface.PleuraWall, 1, 1, p.depth, k0);
    };
    const peak = (lo: number, hi: number): number => {
      let best = lo;
      for (let s = lo; s <= hi; s += 0.005) if (amp(s) > amp(best)) best = s;
      return best;
    };
    const line = peak(0.5 * D, 1.5 * D);
    const a1 = peak(1.5 * D, 2.5 * D);
    const a2 = peak(2.5 * D, 3.5 * D);
    expect(Math.abs(a1 - 2 * line)).toBeLessThanOrEqual(1);
    expect(Math.abs(a2 - 3 * line)).toBeLessThanOrEqual(1);
    // y decaen: cada réplica lleva una ida y vuelta más, G < 1
    expect(amp(a2)).toBeLessThan(amp(a1));
    expect(amp(a1)).toBeLessThan(amp(line));
  });
});

describe('A-T7–A-T10: signo del murciélago, periodo costal, espacios y banda intercostales', () => {
  // Corte longitudinal centrado en el EIC5 de la línea axilar media (entre la 5.ª y la 6.ª costillas de la
  // escena): el primero en que hay costillas a los dos lados de la línea central. En el punto BLUE superior
  // (EIC2) solo asoma, en el borde caudal del sector, la sombra de la 5.ª costilla (de −34° a −26,5°, cresta
  // a 18,4 mm): no hay signo del murciélago (`ribs-5-10-only`). Medido (26-09-2026): pleura 28,0 mm; línea
  // pleural 7,0 mm bajo la línea costal; sombras de 14,8 y 14,8 mm; EIC visible de 6,6 mm; periodo 21,3 mm;
  // banda de músculo entre la línea costal y la pleura de 5,0 mm (anterior, EIC5-LMC: 7,2; posterior,
  // EIC7 a 1,2π: 6,1), la misma en inspiración profunda.
  const lateral = batSign(chestView(scene, icsPose(5, LAM)));

  notYetMet('A-T7: la línea pleural está 4–6 mm bajo la línea costal (hoy 7,0)', () => {
    expect(lateral.pleuraBelowRibLineMm).toBeGreaterThanOrEqual(4);
    expect(lateral.pleuraBelowRibLineMm).toBeLessThanOrEqual(6);
  });

  it('A-T7: las sombras costales miden 12–16 mm (14,8 y 14,8: costillas de 12 mm abiertas por el abanico)', () => {
    for (const w of lateral.shadowWidthsMm) {
      expect(w).toBeGreaterThanOrEqual(12);
      expect(w).toBeLessThanOrEqual(16);
    }
  });

  notYetMet('A-T7: el espacio intercostal visible mide 14–20 mm (hoy 6,6: las costillas están a 17 mm en la línea axilar media)', () => {
    expect(lateral.intercostalMm).toBeGreaterThanOrEqual(14);
    expect(lateral.intercostalMm).toBeLessThanOrEqual(20);
  });

  notYetMet('A-T8: el periodo costal en el corte longitudinal es de 28–35 mm (hoy 21,3)', () => {
    // la meta: en 40 mm, un EIC completo y dos sombras parciales; con este periodo caben dos espacios
    expect(lateral.ribPeriodMm).toBeGreaterThanOrEqual(28);
    expect(lateral.ribPeriodMm).toBeLessThanOrEqual(35);
  });

  notYetMet('A-T9: en la región paraesternal el EIC2 es ≥ EIC3 + 3 mm (hoy no hay EIC2 ni EIC3: faltan las costillas 2.ª–4.ª)', () => {
    for (const n of [2, 3, 4]) expect(scene.ribNumbers, `la escena no tiene la costilla ${n}`).toContain(n);
    // ancho del espacio n en la región paraesternal (φ 0,55π, ~25 mm de la línea media): la distancia entre las
    // líneas medias de sus costillas menos sus dos semianchos
    const width = (n: number): number =>
      ribZ(scene, n, 0.55 * Math.PI) - ribZ(scene, n + 1, 0.55 * Math.PI) - ribOf(scene, n).halfWidth - ribOf(scene, n + 1).halfWidth;
    expect(width(2)).toBeGreaterThanOrEqual(width(3) + 3);
  });

  notYetMet('A-T10: la banda intercostal mide 1,5–3,5 mm delante, 2,5–4,5 al lado y 3,5–5,5 detrás (hoy 7,2 / 5,0 / 6,1)', () => {
    // la banda: el músculo que la clasificación pone entre la línea costal y la pleura en el centro del
    // espacio. La pared heredada no tiene intercostales (`wall-generic-layers`): es el músculo de la pared
    // abdominal de VExUS que cae a esa altura
    const cases: Array<[number, number, number, number]> = [
      [LMC, 5, 1.5, 3.5],
      [LAM, 5, 2.5, 4.5],
      [POSTERIOR, 7, 3.5, 5.5],
    ];
    for (const [phi, n, lo, hi] of cases) {
      const b = batSign(chestView(scene, icsPose(n, phi)));
      expect(b.intercostalBandMm).toBeGreaterThanOrEqual(lo);
      expect(b.intercostalBandMm).toBeLessThanOrEqual(hi);
    }
  });

  notYetMet('A-T10: al inspirar a fondo solo engrosa la banda anterior, +0,4–0,8 mm (hoy +0,0: la pared no respira)', () => {
    const at = (phi: number, n: number, resp = deepInspiration) => batSign(chestView(scene, icsPose(n, phi), resp)).intercostalBandMm;
    const rest = (phi: number, n: number) => batSign(chestView(scene, icsPose(n, phi))).intercostalBandMm;
    const anterior = at(LMC, 5) - rest(LMC, 5);
    expect(anterior).toBeGreaterThanOrEqual(0.4);
    expect(anterior).toBeLessThanOrEqual(0.8);
    expect(Math.abs(at(LAM, 5) - rest(LAM, 5))).toBeLessThan(0.2);
  });
});

describe('A-T11: grosor de la línea pleural frente a la profundidad', () => {
  /**
   * PLT: anchura a media altura de la envolvente de la línea pleural en las líneas centrales del convexo, con el
   * gemelo B → C → D de los ecos de interfaz (`support/interfaceTwin.ts`): una pleura plana a D mm bajo la cara
   * (la cara `Interface.PleuraWall`, que dibuja el músculo de encima) sin moteado, el pulso axial de la pasada C
   * y la PSF lateral de la D. El modelo no tiene grosor pleural anatómico: la línea sale de la PSF
   * (recomendación 2 de anatomy.md §3, que la segunda mitad de la meta pide).
   */
  function plt(D: number): number {
    const plane: Scene = {
      classify(p) {
        const s = p[1] - D;
        if (s < 0) return { back: 0.35, het: false, kind: 'muscle', n: [0, 1], bd: -s, specOld: 0, face: Interface.PleuraWall, ifd: -s };
        return { back: 0, het: false, kind: 'lung', n: [0, 1], bd: s, specOld: 0 };
      },
    };
    const o = simulate(plane, { model: 'echo', depth: 80, r0: D - 5, r1: D + 5, speckleGain: 0 });
    const widths: number[] = [];
    for (let u = o.lines / 2 - 10; u < o.lines / 2 + 10; u++) {
      let peak = 0;
      for (let v = 0; v < o.nv; v++) peak = Math.max(peak, o.env[v * o.lines + u]);
      let n = 0;
      for (let v = 0; v < o.nv; v++) if (o.env[v * o.lines + u] >= 0.5 * peak) n++;
      widths.push(n * o.dr);
    }
    return median(widths);
  }

  notYetMet('A-T11: la PLT crece 0,67 ± 0,12 mm por cm de profundidad con una sonda de sector (hoy 0: 0,70 mm de 15 a 60 mm)', () => {
    // el pulso axial (σ fija, AXIAL_SIGMA_MM) y el perfil de la cara no dependen de la profundidad, y en las
    // líneas centrales la pleura plana es normal al haz: la PSF lateral no la engruesa
    const slopePerCm = (plt(60) - plt(20)) / 4;
    expect(slopePerCm).toBeGreaterThanOrEqual(0.67 - 0.12);
    expect(slopePerCm).toBeLessThanOrEqual(0.67 + 0.12);
  });
});
