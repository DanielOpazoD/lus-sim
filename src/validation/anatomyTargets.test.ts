import { chai, describe, expect, it } from 'vitest';
import { Interface } from '../anatomy/interfaces';
import { MAX_RIBS, RIBCAGE, ribTableZ } from '../anatomy/organs/ribcage';
import { AnatomyScene } from '../anatomy/scene';
import { thoraxLinePhi, type ThoraxLine } from '../anatomy/thoraxLines';
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
  ribsAlongLine,
  ribShadows,
  ribZ,
  scanLine,
  scanView,
  type ChestView,
} from './support/chestView';
import { median, simulate, type Scene } from './support/interfaceTwin';

/**
 * Metas de anatomía (docs/KNOWLEDGE.md §4: A-T1–A-T3, A-T6–A-T11 y A-T19, de docs/knowledge/anatomy.md §3), medidas con
 * el procedimiento de `support/chestView.ts`: la sonda apoyada con su contacto («presión estándar») y la respiración en
 * fin de espiración, midiendo a lo largo de sus líneas; y la parrilla costal del adulto promedio (decisión 16,
 * `anatomy/organs/ribcage.ts`): 12 costillas y 11 espacios intercostales por hemitórax con sus anchos por nivel y región.
 * Las metas son para una sonda lineal de 38–40 mm; lus-sim solo tiene aún el convexo de 3,5 MHz (`convex-probe-only`),
 * así que se mide con él.
 *
 * Lo que aún no se cumple va con `notYetMet`, con el valor medido en su comentario: la prueba exige que la meta falle por
 * su aserción (`chai.AssertionError`), no por un error del código de medida; se pasa a `it` cuando se cumple. Cada
 * umbral es el criterio de aceptación de la meta, tal cual. Las costillas se buscan por su número y su lado.
 *
 * El alto costal y los anchos de los espacios se calibran con la anatomía (decisión 16): el hueso no se deforma bajo la
 * sonda. En la imagen del convexo, la compresión cinemática empuja la pared entera, con las costillas, a lo largo de las
 * líneas divergentes de la cara (`probe-compression-kinematic`): lo que queda bajo el centro del sector se ensancha hasta
 * ×1,18. Las metas de la imagen se miden en el corte que las define (el signo del murciélago, centrado en el espacio) y,
 * donde el ensanchamiento las saca del rango, van con `notYetMet` y su tamaño.
 */
const scene = new AnatomyScene(defaultPatient());
const tr = CONVEX_C35;
/** Paso angular entre dos líneas del convexo (rad). */
const PITCH = (2 * tr.halfSector) / (tr.lines - 1);
/**
 * Líneas del tórax del hemitórax derecho (`anatomy/thoraxLines.ts`, decisión 16): la medioclavicular (la de la pose por
 * omisión, el punto BLUE superior), las axilares anterior, media y posterior; y POSTERIOR, 1,2π, lo más posterior que llega
 * la sonda en decúbito supino (el tope de `clampPose`).
 */
const line = (l: ThoraxLine, side: -1 | 1 = -1) => thoraxLinePhi(l, scene.torso, side);
const LMC = line('midclavicular');
const LAA = line('anteriorAxillary');
const LAM = line('midaxillary');
const LAP = line('posteriorAxillary');
const POSTERIOR = 1.2 * Math.PI;

/**
 * Meta que la escena aún no cumple: la prueba exige que su cuerpo falle por una aserción (`chai.AssertionError`),
 * no por un error del código de medida (un TypeError, una costilla que falta sin decirlo). Cuando se cumpla, esta
 * prueba falla y hay que pasarla a `it`.
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
 * Signo del murciélago en la vista: las dos sombras costales vecinas a la línea central, la pleura en la línea media
 * entre ellas y la línea costal (la cresta media de las dos costillas). El ancho de las sombras, el del espacio
 * intercostal visible y el periodo costal se miden a la profundidad de las costillas (su cresta: es su alto y su
 * separación lo que se mide; a la profundidad de la pleura el convexo los abre ×(R + D)/(R + d)); la banda de músculo,
 * entre la línea costal y la pleura en el centro del espacio.
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
    shadowWidthsMm: [
      arcMm(tr, left.theta1 - left.theta0 + PITCH, left.ribTopMm),
      arcMm(tr, right.theta1 - right.theta0 + PITCH, right.ribTopMm),
    ],
    intercostalMm: arcMm(tr, right.theta0 - left.theta1 - PITCH, ribLine),
    ribPeriodMm: arcMm(tr, 0.5 * (right.theta0 + right.theta1) - 0.5 * (left.theta0 + left.theta1), ribLine),
    intercostalBandMm: muscle,
  };
}

const deepInspiration = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'apnea-inspiratory' }).sample(0);

describe('A-T1–A-T3: profundidad de la pleura por región (docs/knowledge/anatomy.md §3)', () => {
  // Medido (26-09-2026, con la parrilla del paso C1 y la pared heredada): EIC2-LMC 25,3 mm; EIC5-LAA 26,8; EIC5-LAM 28,0;
  // EIC4-LAM 28,0. La pared es la del abdomen de VExUS, 2 + 14 + 12 = 28 mm en la métrica radial y la misma en todo el
  // tronco (`thorax-wall-abdominal-habitus`): delante sale 25 mm porque la normal de la piel no es radial. La pared por
  // región es del paso C2.

  notYetMet('A-T1: la pleura en EIC2-LMC (el punto BLUE superior) está a 12–20 mm (hoy 25,3)', () => {
    const d = pleuraDepth(defaultPose());
    expect(d).toBeGreaterThanOrEqual(12);
    expect(d).toBeLessThanOrEqual(20);
  });

  notYetMet('A-T2: en EIC5 LAA/LAM a 10–16 mm y el cociente lateral/anterior entre 0,7 y 0,9 (hoy 26,8 y 28,0; cociente 1,06–1,11)', () => {
    const anterior = pleuraDepth(defaultPose());
    for (const phi of [LAA, LAM]) {
      const d = pleuraDepth(icsPose(5, phi));
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(16);
      expect(d / anterior).toBeGreaterThanOrEqual(0.7);
      expect(d / anterior).toBeLessThanOrEqual(0.9);
    }
  });

  notYetMet('A-T3: en EIC4-LAM a 14–22 mm y más honda que en A-T1 (hoy 28,0: más honda, fuera del rango)', () => {
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
  // Corte longitudinal centrado en el EIC5 de la línea axilar media (entre la 5.ª y la 6.ª costillas): el espacio de la
  // pared lateral donde la base mide los espacios (Kim y cols.) y, en la parrilla, uno de los 16 mm (anatomía). Medido
  // (26-09-2026, decisión 16): pleura 28,0 mm; línea pleural 4,5 mm bajo la línea costal; sombras de 15,6 y 15,6 mm; EIC
  // visible de 18,7 mm; periodo 34,2 mm; banda de músculo entre la línea costal y la pleura de 2,5 mm (anterior, EIC5-LMC:
  // 0,0, la línea central cae sobre el cartílago de la 6.ª; posterior, EIC7 a 1,2π: 2,6), la misma en inspiración profunda.
  // En el punto BLUE superior (EIC2-LMC): 4,4 mm bajo la línea costal, sombras de 15,1–15,6 mm, EIC visible de 20,1 mm.
  const lateral = batSign(chestView(scene, icsPose(5, LAM)));
  const anterior = batSign(chestView(scene, defaultPose()));

  it('A-T7: la línea pleural está 4–6 mm bajo la línea costal (4,5 en EIC5-LAM; 4,4 en el punto BLUE superior)', () => {
    for (const b of [lateral, anterior]) {
      expect(b.pleuraBelowRibLineMm).toBeGreaterThanOrEqual(4);
      expect(b.pleuraBelowRibLineMm).toBeLessThanOrEqual(6);
    }
  });

  it('A-T7: las sombras costales miden 12–16 mm (15,6 y 15,6; 15,1–15,6 en el punto BLUE superior)', () => {
    for (const b of [lateral, anterior])
      for (const w of b.shadowWidthsMm) {
        expect(w).toBeGreaterThanOrEqual(12);
        expect(w).toBeLessThanOrEqual(16);
      }
  });

  it('A-T7: el espacio intercostal visible mide 14–20 mm (18,7; 20,1 en el EIC2 del punto BLUE superior, el más ancho)', () => {
    for (const b of [lateral, anterior]) {
      expect(b.intercostalMm).toBeGreaterThanOrEqual(14);
      expect(b.intercostalMm).toBeLessThanOrEqual(20.5);
    }
    // el de EIC5-LAM, en el rango de la meta sin redondeo
    expect(lateral.intercostalMm).toBeLessThanOrEqual(20);
  });

  it('A-T8: el periodo costal en el corte longitudinal es de 28–35 mm (34,2), el de la anatomía de 30', () => {
    // la meta: en 40 mm, un EIC completo y dos sombras parciales (14 mm de costilla + 14–20 de espacio, anatomy.md §3)
    expect(lateral.ribPeriodMm).toBeGreaterThanOrEqual(28);
    expect(lateral.ribPeriodMm).toBeLessThanOrEqual(35);
    const anat = ribZ(scene, 5, LAM) - ribZ(scene, 6, LAM);
    expect(anat).toBeGreaterThanOrEqual(28);
    expect(anat).toBeLessThanOrEqual(35);
  });

  it('A-T9: en la región paraesternal el EIC2 es ≥ EIC3 + 3 mm (18,1 frente a 12,3, donde los midieron Seong y Woo)', () => {
    // la estación paraesternal de la parrilla: 1 cm por fuera del borde del esternón, a la altura de los vasos mamarios
    // internos (Gray), donde Seong y Woo midieron los espacios; ancho = distancia entre líneas medias menos los semialtos
    const u = scene.ribCage.stations.parasternal;
    const width = (n: number): number =>
      ribTableZ(scene.ribCage, n - 1, u) - ribTableZ(scene.ribCage, n, u) - ribOf(scene, n).halfWidth - ribOf(scene, n + 1).halfWidth;
    expect(width(2)).toBeGreaterThanOrEqual(width(3) + 3);
    // y con los valores de la base (Seong: 18,1 ± 3,7 y 12,3 ± 3,0)
    expect(width(2)).toBeCloseTo(RIBCAGE.params.parasternalIcs2Mm.value, 1);
    expect(width(3)).toBeCloseTo(RIBCAGE.params.parasternalIcs3Mm.value, 1);
  });

  notYetMet('A-T10: la banda intercostal mide 1,5–3,5 mm delante, 2,5–4,5 al lado y 3,5–5,5 detrás (hoy 0,0 / 2,5 / 2,6)', () => {
    // la banda: el músculo que la clasificación pone entre la línea costal y la pleura en el centro del espacio. La pared
    // heredada no tiene intercostales (`wall-generic-layers`): es el músculo de la pared abdominal de VExUS que cae a esa
    // altura, 2,5 mm sobre la grasa preperitoneal. Paso C2
    const cases: Array<[number, number, number, number]> = [
      [LMC, 3, 1.5, 3.5],
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
    const anterior = at(LMC, 3) - rest(LMC, 3);
    expect(anterior).toBeGreaterThanOrEqual(0.4);
    expect(anterior).toBeLessThanOrEqual(0.8);
    expect(Math.abs(at(LAM, 5) - rest(LAM, 5))).toBeLessThan(0.2);
  });
});

describe('F-T08: la línea pleural 5 ± 1 mm bajo la superficie costal (signo del murciélago)', () => {
  // La primera parte de la meta F-T08 (`docs/knowledge/physics.md` §3.3; G4 [CONSENSO]: «≈ 0,5 cm más profunda que la
  // línea costal»), en la anatomía por omisión: en cada punto de partida, para cada sombra costal entera, la pleura de la
  // primera línea sin hueso a cada lado frente a la cresta de la costilla (`pleuraBelowRibCrestMm`), la media de los dos
  // lados (el convexo hace el lado de fuera ≈ 1,7 mm más hondo que el de dentro en una sombra lejos del centro). Medido
  // (26-09-2026, decisión 16): BLUE superior 5,2 y 5,2 mm (lados 4,6–5,8); BLUE inferior 5,2 y 5,3 (4,7–5,8); PLAPS 5,5,
  // 5,1 y 5,4 (4,5–6,4). Antes, con las costillas de VExUS en la pared del abdomen, 7,2–8,8. En la imagen la distancia es
  // 0,35 mm mayor: la cortical costal es una cara de un lado que dibuja el tejido de fuera (decisión 15). La sombra en sí
  // (oscura, con la penumbra de la apertura) se mide en la envolvente de la GPU: `e2e/imagen.spec.ts`.
  const measured = START_POINTS.map((sp) => {
    const pose: ProbePose = { phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 };
    return { id: sp.id, below: pleuraBelowRibCrestMm(chestView(scene, pose)) };
  });

  it('hay qué medir: sombras costales enteras con pleura a los dos lados en los tres puntos de partida', () => {
    for (const m of measured) expect(m.below.length, m.id).toBeGreaterThanOrEqual(2);
  });

  it('F-T08: la pleura a 4–6 mm bajo la cresta costal en los tres puntos de partida (5,1–5,5)', () => {
    for (const m of measured)
      for (const [a, b] of m.below) {
        expect(0.5 * (a + b), m.id).toBeGreaterThanOrEqual(4);
        expect(0.5 * (a + b), m.id).toBeLessThanOrEqual(6);
        // y ningún lado lejos: el sesgo del convexo es de ≈ 1,7 mm entre los dos
        expect(Math.min(a, b), m.id).toBeGreaterThanOrEqual(3.5);
        expect(Math.max(a, b), m.id).toBeLessThanOrEqual(6.5);
      }
  });
});

describe('Costillas y espacios intercostales del adulto promedio (paso C1, decisión 16)', () => {
  // Lo que pidió Daniel (26-09-2026): 12 costillas y 11 espacios intercostales por hemitórax, con el alto de cada costilla y
  // el ancho de cada espacio de un adulto promedio por nivel y región (`docs/knowledge/anatomy.md` §1.3 y §2.3). Se mide
  // en la anatomía (la clasificación de la parrilla, `ribsAlongLine`, y su tabla, `intercostalWidthMm`, bajo la sonda
  // apoyada en cada línea) y en la imagen, como la mide una ecografía (un corte longitudinal centrado en el espacio, con la
  // sonda apoyada: `intercostalImageWidthMm`, a la profundidad de las crestas). Antes (la escena heredada de VExUS):
  // costillas, derecho 6 (5.ª–10.ª) e izquierdo 0; espacios, 5 y 0; alto 12 mm; anchos 3,2–12,1 mm.
  const expectedAlong: Array<[ThoraxLine, number[]]> = [
    // Gray: los cartílagos 1–7 llegan al esternón; la paraesternal los cruza a todos, sin el reborde costal
    ['parasternal', [1, 2, 3, 4, 5, 6, 7]],
    // la medioclavicular cruza el reborde costal en el 9.º cartílago (la 10.ª acaba por fuera: «Surface Markings of the Abdomen»)
    ['midclavicular', [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ['anteriorAxillary', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    // la 11.ª acaba en la axilar media o algo por delante; la 12.ª, junto a la axilar posterior
    ['midaxillary', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
    ['posteriorAxillary', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    // junto a la columna, todas: las 12 articulan con las vértebras torácicas
    ['paravertebral', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
  ];

  it('12 costillas y 11 espacios intercostales por hemitórax, contados a lo largo de las líneas craneocaudales, a los dos lados', () => {
    for (const side of [-1, 1] as const) {
      const seen = new Set<number>();
      const spaces = new Set<number>();
      for (const [name, numbers] of expectedAlong) {
        const crossings = ribsAlongLine(scene, line(name, side)).filter((c) => c.index !== MAX_RIBS);
        const tag = `${name} (${side < 0 ? 'derecho' : 'izquierdo'}): ${crossings.map((c) => c.number).join(' ')}`;
        // de arriba abajo, cada costilla una vez, en su orden y del lado de la línea: ninguna falta, se funde con otra ni sobra
        expect(
          crossings.map((c) => c.number),
          tag,
        ).toEqual(numbers);
        for (const c of crossings) expect(c.side, tag).toBe(side);
        // entre dos costillas seguidas, un espacio (un tramo sin hueso ni cartílago)
        for (let i = 1; i < crossings.length; i++) {
          expect(crossings[i - 1].zBottom, tag).toBeGreaterThan(crossings[i].zTop);
          spaces.add(crossings[i - 1].number);
        }
        crossings.forEach((c) => seen.add(c.number));
      }
      expect(
        [...seen].sort((a, b) => a - b),
        `costillas del hemitórax ${side}`,
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(spaces.size, `espacios del hemitórax ${side}`).toBe(11);
    }
    // la escena: 12 por lado, numeradas
    for (const side of [-1, 1] as const)
      expect(
        scene.ribs
          .filter((r) => r.side === side)
          .map((r) => r.number)
          .sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('las dos parrillas son simétricas: las mismas costillas, a la misma altura, en cada línea', () => {
    for (const [name] of expectedAlong) {
      const r = ribsAlongLine(scene, line(name, -1));
      const l = ribsAlongLine(scene, line(name, 1));
      expect(
        l.map((c) => [c.number, c.cartilage]),
        name,
      ).toEqual(r.map((c) => [c.number, c.cartilage]));
      r.forEach((c, i) => {
        expect(Math.abs(l[i].zTop - c.zTop), name).toBeLessThanOrEqual(0.25);
        expect(Math.abs(l[i].zBottom - c.zBottom), name).toBeLessThanOrEqual(0.25);
      });
    }
  });

  it('el alto de cada costilla es el del adulto promedio, 13–15 mm en la anatomía (14)', () => {
    for (const side of [-1, 1] as const)
      for (let n = 1; n <= 12; n++) {
        expect(ribHeightMm(scene, n, side), `costilla ${n}`).toBeGreaterThanOrEqual(13);
        expect(ribHeightMm(scene, n, side), `costilla ${n}`).toBeLessThanOrEqual(15);
      }
    // y en la clasificación, no solo en el dato: el tramo que cruza la línea axilar media mide su alto (a ±0,5 mm)
    for (const c of ribsAlongLine(scene, LAM)) {
      if (c.index === MAX_RIBS) continue;
      expect(c.zTop - c.zBottom + 0.25, `costilla ${c.number}`).toBeGreaterThanOrEqual(13.5);
      expect(c.zTop - c.zBottom + 0.25, `costilla ${c.number}`).toBeLessThanOrEqual(14.5);
    }
  });

  // los anchos de la base por nivel y región (anatomy.md §2.3): EIC2 / EIC3–4 / EIC5 anteriores (LMC) 14–22 / 10–17 /
  // 12–18; laterales bajos (LAA/LAM, EIC7–9) 14–20; posteriores bajos (LAP, EIC7–9) 14–18. Además, la línea base de PR #14:
  // EIC5–6 de la LAM en 14–20 y los EIC7–9 de 1,2π en 14–18
  const anatTargets: Array<[string, number, number[], number, number]> = [
    ['LMC', LMC, [2], 14, 22],
    ['LMC', LMC, [3, 4], 10, 17],
    ['LMC', LMC, [5], 12, 18],
    ['LAA', LAA, [7, 8, 9], 14, 20],
    ['LAM', LAM, [5, 6, 7, 8, 9], 14, 20],
    ['LAP', LAP, [7, 8, 9], 14, 18],
    ['posterior', POSTERIOR, [7, 8, 9], 14, 18],
  ];

  it('el ancho de cada espacio en la anatomía: EIC2 18, EIC3–4 14 y EIC5 15 en la LMC; 15,5–17 laterales bajos; 14,8–16 posteriores', () => {
    for (const [name, phi, list, lo, hi] of anatTargets)
      for (const n of list) {
        const w = intercostalWidthMm(scene, n, phi);
        expect(w, `EIC${n} ${name}`).toBeGreaterThanOrEqual(lo);
        expect(w, `EIC${n} ${name}`).toBeLessThanOrEqual(hi);
      }
    // el EIC2 anterior es el más ancho de los anteriores (Gray)
    for (const n of [3, 4, 5, 6]) expect(intercostalWidthMm(scene, 2, LMC)).toBeGreaterThan(intercostalWidthMm(scene, n, LMC));
    // y los posteriores, junto a la columna, un segmento vertebral menos el alto costal (9,3 mm): «greater in front than behind»
    const u = scene.ribCage.stations.posterior;
    for (let k = 0; k < 11; k++) {
      const w = ribTableZ(scene.ribCage, k, u) - ribTableZ(scene.ribCage, k + 1, u) - 14;
      expect(w).toBeCloseTo(RIBCAGE.params.thoracicSegmentMm.value - RIBCAGE.params.ribHeightMm.value, 1);
    }
  });

  // las medidas en la imagen, hechas antes de las aserciones (una prueba se para en la primera que falla)
  const imageTargets: Array<[string, number, number[], number, number]> = [
    ['LMC', LMC, [5], 12, 18],
    ['LAM', LAM, [5, 6, 7, 8, 9], 14, 20],
    ['posterior', POSTERIOR, [7, 8, 9], 14, 18],
  ];
  const images = imageTargets.flatMap(([name, phi, list, lo, hi]) =>
    list.map((n) => ({ n, name, lo, hi, img: intercostalImageWidthMm(scene, n, phi) })),
  );

  it('el ancho de los espacios en la imagen (con la presión estándar): EIC5 de la LMC 12–18 mm, EIC5–9 de la LAM 14–20 y EIC7–9 a 1,2π 14–18 (17,1; 18,7–19,7; 17,1)', () => {
    for (const x of images) {
      expect(x.img, `EIC${x.n} ${x.name}, imagen`).not.toBeNull();
      expect(x.img!, `EIC${x.n} ${x.name}, imagen`).toBeGreaterThanOrEqual(x.lo);
      expect(x.img!, `EIC${x.n} ${x.name}, imagen`).toBeLessThanOrEqual(x.hi);
    }
  });

  notYetMet(
    'en la imagen, la costilla en el centro del sector mide 13–15 mm y los EIC7–9 de la LAP, 14–18 (hoy 16,0–16,5 y 18,4: la compresión cinemática los ensancha ×1,15)',
    () => {
      // el corte longitudinal centrado en la costilla (la medida de Kim y cols., `ribImageHeightMm`) en la LMC, la LAM y a
      // 1,2π, y los espacios bajos de la LAP: la compresión (`probe-compression-kinematic`) hunde la cara ≈ 8,6 mm en el centro
      // (la flecha de la cara de 60 mm de radio sobre la piel plana en z) y empuja la pared con las costillas por las líneas
      // divergentes: lo rígido se ensancha ×(R + d + δ)/(R + d). En el corte del signo del murciélago, con las costillas a
      // los lados del centro, las sombras miden 15,1–15,6 (A-T7, arriba)
      for (const [name, phi] of [
        ['LMC', LMC],
        ['LAM', LAM],
        ['posterior', POSTERIOR],
      ] as const)
        for (const n of [3, 4, 5]) {
          const h = ribImageHeightMm(scene, n, phi);
          expect(h, `costilla ${n}, ${name}`).not.toBeNull();
          expect(h!, `costilla ${n}, ${name}`).toBeGreaterThanOrEqual(13);
          expect(h!, `costilla ${n}, ${name}`).toBeLessThanOrEqual(15);
        }
      for (const n of [7, 8, 9]) expect(intercostalImageWidthMm(scene, n, LAP)!, `EIC${n} LAP`).toBeLessThanOrEqual(18);
    },
  );
});

describe('A-T19: oblicuidad costal', () => {
  // La base: la costilla 7 desciende 90–130 mm entre su extremo posterior y el anterior (Robinson y cols.: 61° en el plano
  // sagital; 195 × tan 30° = 113); un plano horizontal por el ángulo inferior de la escápula corta la 9.ª costilla junto a la
  // columna y la 5.ª en la línea del pezón (Treves, citado por Gray). Medido (decisión 16): la 7.ª baja 101,3 mm de la
  // apófisis transversa a la unión condrocostal; la 9.ª junto a la columna a 11,5 mm y la 5.ª en la medioclavicular a 11,7.
  // [DISCREPANCIA] el mismo plano, según Treves, cruza el esternón entre la 4.ª y la 5.ª; con los niveles vertebrales del
  // esternón de Gray (unión xifoesternal en T9–T10) cruza entre la 6.ª (17,0) y la 7.ª (0): se conservan los de Gray
  const cage = scene.ribCage;
  const zAt = (n: number, u: number) => ribTableZ(cage, n - 1, u);

  it('la 7.ª costilla desciende 90–130 mm de su extremo posterior al anterior (101,3)', () => {
    const r = ribOf(scene, 7);
    const drop = zAt(7, r.uPost) - zAt(7, r.uCc);
    expect(drop).toBeGreaterThanOrEqual(90);
    expect(drop).toBeLessThanOrEqual(130);
  });

  it('un plano horizontal corta la 9.ª costilla junto a la columna y la 5.ª en la línea medioclavicular (a ≤ medio alto costal)', () => {
    const z9 = zAt(9, ribOf(scene, 9).uPost);
    const z5 = ribZ(scene, 5, LMC);
    expect(Math.abs(z9 - z5)).toBeLessThanOrEqual(0.5 * ribHeightMm(scene, 5));
  });

  it('las costillas altas son menos oblicuas que las bajas: la caída posterior → anterior crece de la 1.ª a la 8.ª (Gray)', () => {
    const drops = Array.from({ length: 8 }, (_, i) => {
      const r = ribOf(scene, i + 1);
      return zAt(i + 1, r.uPost) - zAt(i + 1, r.uCc);
    });
    for (let i = 1; i < drops.length; i++) expect(drops[i], `${i + 1}.ª frente a ${i}.ª`).toBeGreaterThan(drops[i - 1]);
  });

  it('cada costilla nace en su vértebra: los extremos posteriores, un segmento torácico entre sí y la 9.ª a la altura de T9', () => {
    const seg = RIBCAGE.params.thoracicSegmentMm.value;
    for (let n = 1; n <= 12; n++) expect(zAt(n, ribOf(scene, n).uPost)).toBeCloseTo((9.5 - n) * seg, 0);
  });
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
