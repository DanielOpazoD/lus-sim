import { chai, describe, expect, it } from 'vitest';
import { Interface } from '../anatomy/interfaces';
import { AnatomyScene } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import { defaultPatient } from '../physiology/patientState';
import { RespiratoryModel } from '../physiology/respiratory';
import { CONVEX_C35, defaultPose, pointOnLine, type ProbePose } from '../probe/probe';
import { pleuraCoherence, pleuraSeriesEcho, pleuraTerms } from '../ultrasound/pleura';
import { START_POINTS } from '../app/startPoints';
import {
  arcMm,
  chestView,
  intercostalImageWidthMm,
  intercostalWidthMm,
  intercostalZ,
  longitudinalPose,
  pleuraBelowRibCrestMm,
  ribHeightMm,
  ribImageHeightMm,
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
      return p.gain * pleuraSeriesEcho(1, p.depth, k0);
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
  // (EIC2) solo asoma, en el borde caudal del sector, la sombra de la 5.ª costilla (de −34° a −31,2°, cresta
  // a 18,9 mm): no hay signo del murciélago (`ribs-5-10-only`). Medido (26-09-2026): pleura 28,0 mm; línea
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

describe('F-T08: la línea pleural 5 ± 1 mm bajo la superficie costal (signo del murciélago)', () => {
  // La primera parte de la meta F-T08 (`docs/knowledge/physics.md` §3.3; G4 [CONSENSO]: «≈ 0,5 cm más profunda que la
  // línea costal»), en la anatomía por omisión: en cada punto de partida, para cada sombra costal entera, la pleura de la
  // primera línea sin hueso a cada lado frente a la cresta de la costilla (`pleuraBelowRibCrestMm`). La sombra en sí
  // (oscura, con la penumbra de la apertura) se mide en la envolvente de la GPU: `e2e/imagen.spec.ts`. Medido
  // (26-09-2026): BLUE inferior 7,2–8,5 mm y PLAPS 7,6–8,8 (el BLUE superior solo corta el borde de la 5.ª costilla, con la
  // cresta fuera del sector: no cuenta). Es la geometría heredada de VExUS (la pared del abdomen, 28 mm, con las costillas
  // a 19–21 mm): la arregla el paso C. En la imagen la distancia es 0,35 mm mayor: la cortical costal es una cara de un
  // lado que dibuja el tejido de fuera (decisión 15).
  const measured = START_POINTS.filter((sp) => sp.id !== 'blueUpper').map((sp) => {
    const pose: ProbePose = { phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 };
    return { id: sp.id, below: pleuraBelowRibCrestMm(chestView(scene, pose)) };
  });

  it('hay qué medir: sombras costales enteras con pleura a los dos lados en el BLUE inferior y el PLAPS', () => {
    // fuera de la notYetMet: si un punto de partida perdiera sus sombras, la notYetMet no puede pasar en falso
    for (const m of measured) expect(m.below.length, m.id).toBeGreaterThanOrEqual(4);
  });

  notYetMet('F-T08: la pleura a 4–6 mm bajo la cresta costal en el BLUE inferior y el PLAPS (hoy 7,2–8,8)', () => {
    for (const m of measured)
      for (const d of m.below) {
        expect(d, m.id).toBeGreaterThanOrEqual(4);
        expect(d, m.id).toBeLessThanOrEqual(6);
      }
  });
});

describe('Costillas y espacios intercostales del adulto promedio (paso C): la línea base de la escena heredada', () => {
  // Lo que pide el paso C (indicación de Daniel, 26-09-2026): 12 costillas y 11 espacios intercostales por hemitórax, con
  // el alto de cada costilla y el ancho de cada espacio de un adulto promedio por nivel y región
  // (`docs/knowledge/anatomy.md` §1.3 y §2.3). Se mide de dos maneras con `support/chestView.ts`: en la anatomía (la ley
  // costal de `sdRib`: `ribHeightMm`, `intercostalWidthMm`, en z del material) y en la imagen, como la mide una ecografía
  // y como están tomados los valores de la base (un corte longitudinal centrado en la costilla o en el espacio, con la
  // sonda apoyada: `ribImageHeightMm`, `intercostalImageWidthMm`, a la profundidad de las crestas). La compresión de la
  // sonda ensancha la imagen del corte ×1,1–1,2 (`anatomy/compression.ts`): el paso C tiene que cumplir las dos, o
  // decidir contra cuál calibra. Línea base (26-09-2026) en la línea medioclavicular (LMC, 0,75π), la axilar media (LAM,
  // π) y la posterior (1,2π):
  //  - costillas: hemitórax derecho 6 (de la 5.ª a la 10.ª), izquierdo 0 (`ribs-5-10-only`, `no-spleen-no-left-ribs`);
  //    espacios intercostales: derecho 5 (EIC5–EIC9), izquierdo 0;
  //  - alto de cada costilla: 12 mm en la anatomía (hueso en las tres líneas); en la imagen, LMC 13,2–13,7, LAM 14,1 y
  //    posterior 13,4–13,9 (ya en 13–15 por el ensanchamiento);
  //  - ancho de EIC5, EIC6, EIC7, EIC8 y EIC9 en la anatomía: LMC 7,1 / 7,1 / 12,1 / 12,1 / 12,1 mm; LAM 5,0 / 5,0 / 10,0
  //    / 10,0 / 10,0; posterior 3,2 / 3,2 / 8,2 / 8,2 / 8,2. En la imagen: LMC 7,6 / 8,0 / 13,7 / 13,3 / —; LAM 6,0 / 6,0 /
  //    12,1 / 12,1 / 12,1; posterior — / — / 9,6 / 9,6 / 9,1 (con 3,2 mm, las sombras de las costillas 5.ª–7.ª se funden y
  //    los EIC5–6 no se pueden medir en la imagen). Son los EIC5–6 estrechos de la LAM y de la posterior los que se ven en
  //    el PLAPS.
  notYetMet('12 costillas y 11 espacios intercostales por hemitórax (hoy: derecho 6 y 5; izquierdo 0 y 0)', () => {
    const right = scene.ribs.length;
    const left = scene.ribs.filter((r) => !r.rightOnly).length;
    expect(right, 'costillas del hemitórax derecho').toBe(12);
    expect(left, 'costillas del hemitórax izquierdo').toBe(12);
    for (let n = 1; n <= 12; n++) expect(scene.ribNumbers, `la escena no tiene la costilla ${n}`).toContain(n);
  });

  const lines3 = [
    ['LMC', LMC],
    ['LAM', LAM],
    ['posterior', POSTERIOR],
  ] as const;
  // las medidas en la imagen, hechas antes de las aserciones (una notYetMet se para en la primera que falla)
  const ribImages = scene.ribNumbers.flatMap((n) => lines3.map(([name, phi]) => ({ n, name, h: ribImageHeightMm(scene, n, phi) })));
  // la base da el EIC5 de la LMC (§2.3), el espacio visible del EIC5 en la LAM (A-T7) y los bajos laterales (EIC7–9) y
  // posteriores (§1.3 y §2.3); el EIC6 lateral queda entre los dos rangos, que coinciden. Los EIC5–6 posteriores no
  // tienen rango en la base
  const spaceTargets: Array<[string, number, number[], number, number]> = [
    ['LMC', LMC, [5], 12, 18],
    ['LAM', LAM, [5, 6, 7, 8, 9], 14, 20],
    ['posterior', POSTERIOR, [7, 8, 9], 14, 18],
  ];
  const spaces = spaceTargets.flatMap(([name, phi, list, lo, hi]) =>
    list.map((n) => ({ n, name, lo, hi, anat: intercostalWidthMm(scene, n, phi), img: intercostalImageWidthMm(scene, n, phi) })),
  );

  it('las medidas en la imagen encuentran cada costilla (salvo la 10.ª en la LMC, ya en el reborde) y cada espacio con meta', () => {
    for (const r of ribImages) if (!(r.n === 10 && r.name === 'LMC')) expect(r.h, `costilla ${r.n}, ${r.name}`).not.toBeNull();
    for (const x of spaces) expect(x.img, `EIC${x.n} ${x.name}`).not.toBeNull();
  });

  notYetMet('el alto de cada costilla, 13–15 mm en la anatomía y en la imagen (hoy 12 mm anatómicos; 13,2–14,1 en la imagen)', () => {
    for (const n of scene.ribNumbers) {
      expect(ribHeightMm(scene, n), `costilla ${n}`).toBeGreaterThanOrEqual(13);
      expect(ribHeightMm(scene, n), `costilla ${n}`).toBeLessThanOrEqual(15);
    }
    for (const r of ribImages) {
      if (r.h === null) continue;
      expect(r.h, `costilla ${r.n}, ${r.name}, imagen`).toBeGreaterThanOrEqual(13);
      expect(r.h, `costilla ${r.n}, ${r.name}, imagen`).toBeLessThanOrEqual(15);
    }
  });

  notYetMet(
    'el ancho de los espacios: EIC5 de la LMC 12–18 mm, EIC5–9 de la LAM 14–20 y EIC7–9 de la posterior 14–18 (hoy 7,1; 5,0–10,0; 8,2)',
    () => {
      for (const x of spaces) {
        expect(x.anat, `EIC${x.n} ${x.name}`).toBeGreaterThanOrEqual(x.lo);
        expect(x.anat, `EIC${x.n} ${x.name}`).toBeLessThanOrEqual(x.hi);
        expect(x.img!, `EIC${x.n} ${x.name}, imagen`).toBeGreaterThanOrEqual(x.lo);
        expect(x.img!, `EIC${x.n} ${x.name}, imagen`).toBeLessThanOrEqual(x.hi);
      }
    },
  );
});

describe('A-T11: grosor de la línea pleural frente a la profundidad', () => {
  /**
   * PLT: anchura a media altura de la envolvente de la línea pleural en las líneas centrales del convexo, con el
   * gemelo B → C → D de los ecos de interfaz (`support/interfaceTwin.ts`): una pleura plana a D mm bajo la cara
   * (la cara `Interface.PleuraWall`, que dibuja el músculo de encima) sin moteado, el pulso axial de la pasada C
   * y la PSF lateral de la D. El modelo no tiene grosor pleural anatómico: la línea sale de la PSF
   * (recomendación 2 de anatomy.md §3, que la segunda mitad de la meta pide). La imagen dibuja la línea pleural
   * centrada en el cruce (`pleuraSeriesEcho`, decisión 15) y aquí la dibuja el músculo con el perfil de un lado,
   * 0,35 mm por encima: la anchura, que es lo que se mide, es la misma.
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
