import { chai, describe, expect, it } from 'vitest';
import { Interface } from '../anatomy/interfaces';
import {
  CLAVICLE,
  MAX_RIBS,
  RIBCAGE,
  SCAPULA_INDEX,
  faceRib,
  probeHitPoint,
  ribLinePoint,
  ribTableZ,
  spinousTipZ,
} from '../anatomy/organs/ribcage';
import { LUNG_APEX } from '../anatomy/organs/lungApex';
import { SITTING_REACH, apexMaxZ, clavicleTopZ, probeCenterContent } from '../app/coverage';
import { torsoNormal, torsoSkinPoint } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { thoraxLinePhi, type ThoraxLine } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { LUNG_BORDER, lungBorderAt, lungSlideMm } from '../anatomy/organs/lungBorder';
import { wallArc, wallPerimeter } from '../anatomy/organs/wall';
import { defaultPatient, type ChestHabitus, type PatientState } from '../physiology/patientState';
import { RespiratoryModel } from '../physiology/respiratory';
import { PhysiologyEngine } from '../physiology/engine';
import { HEART, heartSd } from '../anatomy/organs/heart';
import { LUNG_PULSE, lungPulseInverse } from '../anatomy/organs/lungPulse';
import { CONVEX_C35, defaultPose, pointOnLine, type ProbePose } from '../probe/probe';
import { AXIAL_SIGMA_MM } from '../ultrasound/beamModel';
import { pleuraCoherence, pleuraSeriesEcho, pleuraTerms } from '../ultrasound/pleura';
import { START_POINTS } from '../app/startPoints';
import {
  arcMm,
  chestView,
  intercostalImageWidthMm,
  intercostalWidthMm,
  intercostalZ,
  longitudinalPose,
  lungBorderZ,
  pleuraBelowRibCrestMm,
  ribHeightMm,
  ribImageHeightMm,
  ribOf,
  ribSagittalAngleDeg,
  ribsAlongLine,
  ribShadows,
  ribZ,
  scanLine,
  scanView,
  type ChestView,
} from './support/chestView';
import { median, simulate, type Scene } from './support/interfaceTwin';

/**
 * Metas de anatomía (docs/KNOWLEDGE.md §4: A-T1–A-T11, A-T13 y A-T19, de docs/knowledge/anatomy.md §3), medidas con
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
 * separación lo que se mide; a la profundidad de la pleura el convexo los abre ×(R + D)/(R + d)); la banda intercostal,
 * en la línea media del espacio, entre sus dos caras (decisión 17).
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
  // la banda intercostal (decisión 17): del plano músculo–intercostal (la cara TransversusPlane) a la fascia endotorácica
  // (la Transversalis, el borde del músculo sobre el complejo pleural), donde la clasificación pone esas caras a distancia 0
  let plane = Number.NaN;
  let fascia = Number.NaN;
  let bestPlane = Infinity;
  let bestFascia = Infinity;
  for (let r = 0; r < D; r += 0.01) {
    const c = scene.classify(v.material(pointOnLine(v.contact.frame, tr, center, r)), v.instant);
    if (c.interface === Interface.TransversusPlane && c.interfaceDistance < bestPlane) {
      bestPlane = c.interfaceDistance;
      plane = r;
    }
    if (c.interface === Interface.Transversalis && c.tissue === Tissue.Muscle && c.interfaceDistance < bestFascia) {
      bestFascia = c.interfaceDistance;
      fascia = r;
    }
  }
  return {
    pleuraMm: D,
    pleuraBelowRibLineMm: D - ribLine,
    shadowWidthsMm: [
      arcMm(tr, left.theta1 - left.theta0 + PITCH, left.ribTopMm),
      arcMm(tr, right.theta1 - right.theta0 + PITCH, right.ribTopMm),
    ],
    intercostalMm: arcMm(tr, right.theta0 - left.theta1 - PITCH, ribLine),
    ribPeriodMm: arcMm(tr, 0.5 * (right.theta0 + right.theta1) - 0.5 * (left.theta0 + left.theta1), ribLine),
    intercostalBandMm: fascia - plane,
  };
}

const deepInspiration = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'apnea-inspiratory' }).sample(0);

describe('A-T1–A-T3: profundidad de la pleura por región (docs/knowledge/anatomy.md §3)', () => {
  // La pared torácica por región (decisión 17, `organs/chestWall.ts`): el estado ecográfico de la base, medido como la
  // ecografía (la sonda apoyada, su pleura bajo la línea central). Medido (27-09-2026): EIC2-LMC 16,1 mm; EIC5-LAA 12,8 y
  // EIC5-LAM 12,8 (cocientes 0,79–0,80); EIC4-LAM 16,7. Antes (la pared heredada del abdomen, 28 mm radiales en todo el
  // tronco): 25,3; 26,8 y 28,0 (1,06–1,11); 28,0

  it('A-T1: la pleura en EIC2-LMC (el punto BLUE superior) está a 12–20 mm (16,1)', () => {
    const d = pleuraDepth(defaultPose());
    expect(d).toBeGreaterThanOrEqual(12);
    expect(d).toBeLessThanOrEqual(20);
  });

  it('A-T2: en EIC5 LAA/LAM a 10–16 mm y el cociente lateral/anterior entre 0,7 y 0,9 (12,8 y 12,8; 0,79–0,80)', () => {
    const anterior = pleuraDepth(defaultPose());
    for (const phi of [LAA, LAM]) {
      const d = pleuraDepth(icsPose(5, phi));
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(16);
      expect(d / anterior).toBeGreaterThanOrEqual(0.7);
      expect(d / anterior).toBeLessThanOrEqual(0.9);
    }
  });

  it('A-T3: en EIC4-LAM a 14–22 mm y más honda que en A-T1 (16,7 frente a 16,1)', () => {
    // la axila alta (McLean, 18 en la base) y la pared lateral baja (Nelson, 13) en dos espacios vecinos: la transición va
    // del centro del EIC5 a la 4.ª costilla (`setChestWallCage`), y el EIC4 queda a 16,7
    const d = pleuraDepth(icsPose(4, LAM));
    expect(d).toBeGreaterThan(pleuraDepth(defaultPose()));
    expect(d).toBeGreaterThanOrEqual(14);
    expect(d).toBeLessThanOrEqual(22);
  });
});

describe('A-T4, A-T5 y la variante delgada: la pared por hábito (decisión 17)', () => {
  // Las variantes de la base (anatomy.md §2.4–2.6) como hábito torácico del paciente (`habitus.chest`): la delgada (grasa y
  // músculo proporcionales a los del EIC2 de la base), la obesa (la diferencia con el avatar, en grasa: 23 mm delante y
  // 1,1 × eso al lado) y la mujer (+2 mm de mama en ecografía, del esternón a la axilar anterior; espacios 1,5 mm más
  // estrechos). Medido (27-09-2026): delgada EIC2-LMC 12,1 y EIC5-LAM 10,0; obesa 23,6 y 25,3 (cociente 1,07); mujer 18,1
  // (el varón, 16,1)
  const withChest = (chest: NonNullable<PatientState['habitus']['chest']>) => {
    const p = defaultPatient();
    return new AnatomyScene({ ...p, habitus: { ...p.habitus, chest } });
  };
  const depthIn = (sc: AnatomyScene, pose: ProbePose) => scanLine(chestView(sc, pose), 0).pleuraMm!;
  const icsIn = (sc: AnatomyScene, n: number, phi: number) => longitudinalPose(phi, intercostalZ(sc, n, phi));

  it('A-T4: la obesa, EIC2-LMC a 20–30 mm y EIC5-LAM / EIC2-LMC ≥ 1,0 (23,6; 1,07)', () => {
    const obese = withChest({ build: 'obese', sex: 'male' });
    const anterior = depthIn(obese, defaultPose());
    expect(anterior).toBeGreaterThanOrEqual(20);
    expect(anterior).toBeLessThanOrEqual(30);
    expect(depthIn(obese, icsIn(obese, 5, LAM)) / anterior).toBeGreaterThanOrEqual(1);
  });

  it('A-T5: la mujer, EIC2-LMC = el varón + 0–4 mm en ecografía (+2,0), y sus espacios 1–2 mm más estrechos', () => {
    const woman = withChest({ build: 'average', sex: 'female' });
    const dif = depthIn(woman, defaultPose()) - pleuraDepth(defaultPose());
    expect(dif).toBeGreaterThanOrEqual(0);
    expect(dif).toBeLessThanOrEqual(4);
    for (const [n, phi] of [
      [2, LMC],
      [5, LAM],
      [8, LAP],
    ] as const) {
      const narrower = intercostalWidthMm(scene, n, phi) - intercostalWidthMm(woman, n, phi);
      expect(narrower, `EIC${n}`).toBeGreaterThanOrEqual(1);
      expect(narrower, `EIC${n}`).toBeLessThanOrEqual(2);
    }
  });

  it('la delgada (anatomy.md §2.4): EIC2-LMC 12 mm (10–15) y la pared lateral × 0,8, 10 (8–12) (12,1 y 10,0)', () => {
    const thin = withChest({ build: 'thin', sex: 'male' });
    const anterior = depthIn(thin, defaultPose());
    expect(anterior).toBeGreaterThanOrEqual(10);
    expect(anterior).toBeLessThanOrEqual(15);
    const lateral = depthIn(thin, icsIn(thin, 5, LAM));
    expect(lateral).toBeGreaterThanOrEqual(8);
    expect(lateral).toBeLessThanOrEqual(12);
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
  // (27-09-2026, decisiones 16 y 17): pleura 12,8 mm; línea pleural 4,2 mm bajo la línea costal (la pared sube hacia la
  // axila: la pleura de la costilla de arriba, más honda); sombras de 15,7 y 14,6 mm; EIC visible de 18,8 mm. En el punto
  // BLUE superior (EIC2-LMC): 4,7 mm bajo la línea costal, sombras de 15,1 mm, EIC visible de 20,4 mm. La banda
  // intercostal (del plano músculo–intercostal a la fascia endotorácica): EIC3-LMC 2,0 mm (2,7 en inspiración profunda),
  // EIC5-LAM 3,0 (igual) y EIC7 a 1,2π 4,0. Antes (la pared heredada): 0,0 / 2,5 / 2,6, sin cambio al inspirar
  const lateral = batSign(chestView(scene, icsPose(5, LAM)));
  const anterior = batSign(chestView(scene, defaultPose()));

  it('A-T7: la línea pleural está 4–6 mm bajo la línea costal (4,2 en EIC5-LAM; 4,7 en el punto BLUE superior)', () => {
    for (const b of [lateral, anterior]) {
      expect(b.pleuraBelowRibLineMm).toBeGreaterThanOrEqual(4);
      expect(b.pleuraBelowRibLineMm).toBeLessThanOrEqual(6);
    }
  });

  it('A-T7: las sombras costales miden 12–16 mm (14,6–15,7; 15,1 en el punto BLUE superior)', () => {
    for (const b of [lateral, anterior])
      for (const w of b.shadowWidthsMm) {
        expect(w).toBeGreaterThanOrEqual(12);
        expect(w).toBeLessThanOrEqual(16);
      }
  });

  it('A-T7: el espacio intercostal visible mide 14–20 mm (18,8 en EIC5-LAM; el resto de la parrilla, abajo)', () => {
    expect(lateral.intercostalMm).toBeGreaterThanOrEqual(14);
    expect(lateral.intercostalMm).toBeLessThanOrEqual(20);
  });

  notYetMet(
    'A-T7: el EIC2 visible del punto BLUE superior mide 14–20 mm (hoy 20,4: la compresión ensancha ×1,13 sus 18 mm de anatomía)',
    () => {
      expect(anterior.intercostalMm).toBeGreaterThanOrEqual(14);
      expect(anterior.intercostalMm).toBeLessThanOrEqual(20);
    },
  );

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

  it('A-T10: la banda intercostal mide 1,5–3,5 mm delante, 2,5–4,5 al lado y 3,5–5,5 detrás (2,0 / 3,0 / 4,0)', () => {
    // la banda de los intercostales de la pared torácica por región (decisión 17): Yoshida, 2,2 / 3,0 / 4,3 por la normal
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

  it('A-T10: al inspirar a fondo solo engrosa la banda anterior, +0,4–0,8 mm (+0,7; al lado, +0,0)', () => {
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
  // línea costal»): para cada sombra costal entera del corte, la pleura de la primera línea sin hueso a cada lado frente a
  // la cresta de la costilla (`pleuraBelowRibCrestMm`), la media de los dos lados (el convexo hace el lado de fuera ≈ 1,7 mm
  // más hondo que el de dentro en una sombra lejos del centro). En los tres puntos de partida y en cortes de cada región
  // (EIC4 de la LAA, EIC4 y EIC5 de la LAM, EIC3 de la LMC, EIC2 de la LAP y EIC7 a 1,2π; hasta la decisión 29, el EIC2 a 1,2π), con el avatar y con las variantes.
  // Medido (27-09-2026, decisiones 16 y 17): medias de 5,0–5,9 mm en todos; por lado, 3,9–7,6: en la subida de la pared
  // hacia la axila (del centro del EIC5 a la 4.ª costilla, `chest-wall-regional-approx`) la pleura se inclina ≈ 10° bajo
  // la 5.ª costilla y un lado queda ≈ 2,5 mm más hondo que el otro (EIC4 de la LAA, EIC5 de la LAM, el BLUE inferior). Con la
  // pared heredada, 5,1–5,5; con las costillas de VExUS, 7,2–8,8. En la imagen la distancia es 0,35 mm mayor: la cortical
  // costal es una cara de un lado que dibuja el tejido de fuera (decisión 15). La sombra en sí (oscura, con la penumbra de la
  // apertura) se mide en la envolvente de la GPU: `e2e/imagen.spec.ts`.
  const withChest = (chest: NonNullable<PatientState['habitus']['chest']>) => {
    const p = defaultPatient();
    return new AnatomyScene({ ...p, habitus: { ...p.habitus, chest } });
  };
  const views = (sc: AnatomyScene, all: boolean): Array<[string, ProbePose]> => {
    const out: Array<[string, ProbePose]> = START_POINTS.map((sp) => [
      sp.id,
      { phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 },
    ]);
    const lam = thoraxLinePhi('midaxillary', sc.torso);
    const cuts: Array<[string, number, number]> = all
      ? [
          ['EIC4 LAA', thoraxLinePhi('anteriorAxillary', sc.torso), 4],
          ['EIC4 LAM', lam, 4],
          ['EIC5 LAM', lam, 5],
          ['EIC3 LMC', thoraxLinePhi('midclavicular', sc.torso), 3],
          // (decisión 29) arriba a 1,2π la sonda está sobre la escápula (su sombra no es la de una costilla): el EIC2, en la LAP
          ['EIC2 LAP', LAP, 2],
          // y (decisión 29) la paravertebral, con la espalda alta más gruesa, arriba, en la transición y abajo
          ['EIC5 PV', thoraxLinePhi('paravertebral', sc.torso), 5],
          ['EIC7 PV', thoraxLinePhi('paravertebral', sc.torso), 7],
          ['EIC8 PV', thoraxLinePhi('paravertebral', sc.torso), 8],
          ['EIC7 1,2π', POSTERIOR, 7],
        ]
      : [['EIC5 LAM', lam, 5]];
    for (const [name, phi, n] of cuts) out.push([name, longitudinalPose(phi, intercostalZ(sc, n, phi))]);
    return out;
  };
  const measure = (label: string, sc: AnatomyScene, all: boolean) =>
    views(sc, all).map(([id, pose]) => ({ id: `${label}, ${id}`, below: pleuraBelowRibCrestMm(chestView(sc, pose)) }));
  const measured = [
    ...measure('avatar', scene, true),
    ...measure('delgada', withChest({ build: 'thin', sex: 'male' }), false),
    ...measure('obesa', withChest({ build: 'obese', sex: 'male' }), false),
    ...measure('mujer', withChest({ build: 'average', sex: 'female' }), false),
  ];

  it('hay qué medir: sombras costales enteras con pleura a los dos lados en cada corte', () => {
    for (const m of measured) expect(m.below.length, m.id).toBeGreaterThanOrEqual(1);
  });

  it('F-T08: la pleura a 4–6 mm bajo la cresta costal en todos los cortes y hábitos (medias de 5,0–5,9)', () => {
    for (const m of measured)
      for (const [a, b] of m.below) {
        expect(0.5 * (a + b), m.id).toBeGreaterThanOrEqual(4);
        expect(0.5 * (a + b), m.id).toBeLessThanOrEqual(6);
        // y ningún lado lejos: el sesgo del convexo (≈ 1,7 mm entre los dos) y la inclinación de la pleura en la subida de
        // la pared hacia la axila (≈ 2,5 mm más)
        expect(Math.min(a, b), m.id).toBeGreaterThanOrEqual(3.5);
        expect(Math.max(a, b), m.id).toBeLessThanOrEqual(8);
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

  /** Paso de `ribsAlongLine` (mm): el tramo libre entre dos cruces es su separación menos un paso. */
  const ALONG_STEP_MM = 0.25;

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
        // entre dos costillas seguidas, un espacio: ≥ 1 mm sin hueso ni cartílago en la clasificación de la parrilla y en la
        // de la escena (dos costillas que se tocan o se solapan no son dos costillas con su espacio, aunque cambie el índice)
        for (let i = 1; i < crossings.length; i++) {
          const eic = `${tag}; EIC${crossings[i - 1].number}`;
          expect(crossings[i - 1].zBottom - crossings[i].zTop - ALONG_STEP_MM, eic).toBeGreaterThanOrEqual(1);
          // el centro del espacio, a la profundidad de la línea media de las costillas a esa altura (decisión 17: la pared,
          // y con ella la parrilla, cambia con z)
          const zMid = 0.5 * (crossings[i - 1].zBottom + crossings[i].zTop);
          const mid = scene.classify(ribLinePoint(line(name, side), scene.torso, scene.ribCage, zMid), BASELINE_INSTANT);
          expect([Tissue.Bone, Tissue.Cartilage], eic).not.toContain(mid.tissue);
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

  it('el ancho de los espacios en la imagen (con la presión estándar): EIC5 de la LMC 12–18 mm, EIC5–9 de la LAM 14–20 y EIC7–9 a 1,2π 14–18 (16,8; 18,6–19,5; 16,8)', () => {
    for (const x of images) {
      expect(x.img, `EIC${x.n} ${x.name}, imagen`).not.toBeNull();
      expect(x.img!, `EIC${x.n} ${x.name}, imagen`).toBeGreaterThanOrEqual(x.lo);
      expect(x.img!, `EIC${x.n} ${x.name}, imagen`).toBeLessThanOrEqual(x.hi);
    }
  });

  // A-T7 («EIC visibles de 14–20 mm») en los espacios de cada línea, en el corte centrado en cada uno: el ancho visible es el
  // de la anatomía ×1,12–1,18 (la compresión cinemática). La prueba mide los extremos de cada tramo; el barrido de todos
  // (12 s, 27-09-2026, con la pared torácica por región) dio: LMC EIC3–6 15,1–16,8; LAA EIC2–9 17,0–19,5; LAM EIC1–10
  // 17,3–19,5; LAP EIC7–10 18,2; 1,2π EIC7–10 16,8. Fuera del rango: LMC EIC1 40,2 (el 1.er espacio bajo la medioclavicular,
  // `thorax-cylindrical-cage`) y EIC2 20,4; LAA EIC1 26,0; LAP EIC1–6 13,3–14,1 y 1,2π EIC1–6 12,4 (los espacios altos de
  // detrás, 11–12 mm de anatomía estimada: Gray los da más estrechos que delante y la base no los mide). Con el tronco de la
  // decisión 28 (02-10-2026) cambian solo la LAA (EIC2–9 17,2–19,5; EIC1 26,5) y la LAP (EIC7–10 18,3; EIC1–6 13,6–13,9); con la escápula
  // (decisión 29), a 1,2π los EIC1–6 quedan en parte bajo ella: 13,1; 40,0 (su sombra); 10,4; 13,1; 12,3; 12,6
  const visible = (phi: number, list: number[]) => list.map((n) => ({ n, img: intercostalImageWidthMm(scene, n, phi) }));
  const visibleOk: Array<[string, ReturnType<typeof visible>]> = [
    ['LMC', visible(LMC, [3, 6])],
    ['LAA', visible(LAA, [2, 9])],
    ['LAM', visible(LAM, [1, 10])],
    ['LAP', visible(LAP, [7, 10])],
    ['posterior', visible(POSTERIOR, [7])],
  ];
  const visibleHigh: Array<[string, ReturnType<typeof visible>]> = [
    ['LMC', visible(LMC, [1, 2])],
    ['LAA', visible(LAA, [1])],
    ['LAP', visible(LAP, [1])],
    ['posterior', visible(POSTERIOR, [1])],
  ];
  const expectVisible = (list: Array<[string, ReturnType<typeof visible>]>) => {
    for (const [name, xs] of list)
      for (const x of xs) {
        expect(x.img, `EIC${x.n} ${name}`).not.toBeNull();
        expect(x.img!, `EIC${x.n} ${name}`).toBeGreaterThanOrEqual(14);
        expect(x.img!, `EIC${x.n} ${name}`).toBeLessThanOrEqual(20);
      }
  };

  it('A-T7 en la parrilla: el EIC visible mide 14–20 mm en la LMC (EIC3 y 6), la LAA (2 y 9), la LAM (1 y 10), la LAP (7 y 10) y a 1,2π (7)', () => {
    expectVisible(visibleOk);
  });

  notYetMet('A-T7 en los espacios altos: LMC EIC1–2, LAA EIC1, LAP EIC1 y 1,2π EIC1 (hoy 40,2 y 20,4; 26,5; 13,7; 13,1)', () => {
    expectVisible(visibleHigh);
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

describe('A-T18: la escápula sentado, con los brazos a los lados (decisión 29)', () => {
  // La base: el ángulo inferior a la altura de la apófisis de T8 ± 1 nivel (Cooperstein y cols., de pie; sentado, la base lo toma
  // igual) y en la línea escapular (que pasa por él); el superior a 9,1 ± 1,1 cm de la línea media (Pontin y cols.); del uno al
  // otro, 152,85 ± 16,77 mm (Garzón-Alfaro y cols., varones). Medido en la clasificación (el hueso a la mitad del grosor de la lámina, por la normal; las costillas quedan más
  // hondas), no en la construcción, en una rejilla de 1 mm de piel por 1 mm de altura
  const t = scene.torso;
  const half = 0.5 * wallPerimeter(t);
  /** φ de la piel a la distancia s de la línea media posterior, por la piel, en el lado `side`. */
  const phiAtS = (s: number, side: -1 | 1): number => {
    // de la línea media posterior (1,5π) hacia el lado: la derecha (−1) baja hacia π, la izquierda sube hacia 2π
    let lo = 1.5 * Math.PI;
    let hi = side < 0 ? Math.PI : 2 * Math.PI;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (half - Math.abs(wallArc(torsoSkinPoint(mid, 0, t), t)) < s) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  const plate = scene.ribCage.scapula;
  const ndMid = plate.depth + 0.5 * plate.thickness;
  const boneAt = (s: number, z: number, side: -1 | 1): boolean => {
    const p = torsoSkinPoint(phiAtS(s, side), z, t);
    const n = torsoNormal(p, t);
    // la normal de la piel: la profundidad por la normal es la de la clasificación (la métrica de la pared, ≈ 1 detrás); el
    // hueso de la escápula, no el de una costilla (al lado, la pared es más fina y las costillas suben a esa profundidad)
    const m: Vec3 = [p[0] - n[0] * ndMid, p[1] - n[1] * ndMid, z];
    if (scene.classify(m, BASELINE_INSTANT).tissue !== Tissue.Bone) return false;
    return faceRib(m, t, scene.ribCage) === SCAPULA_INDEX;
  };
  const extent = (side: -1 | 1) => {
    let zMin = Infinity;
    let zMax = -Infinity;
    let sAtTop = NaN;
    let sAtAngle = NaN;
    for (let z = -40; z <= 200; z += 1)
      for (let s = 30; s <= 220; s += 1) {
        if (!boneAt(s, z, side)) continue;
        if (z < zMin) {
          zMin = z;
          sAtAngle = s;
        }
        if (z > zMax) {
          zMax = z;
          sAtTop = s;
        }
      }
    return { zMin, zMax, sAtTop, sAtAngle };
  };
  const both = ([-1, 1] as const).map((side) => ({ side, ...extent(side) }));

  it('el ángulo inferior, a la altura de la apófisis de T8 ± 1 nivel (Cooperstein): entre las de T7 y T9', () => {
    for (const e of both) {
      expect(e.zMin, `${e.side}`).toBeGreaterThanOrEqual(spinousTipZ(9) - 1);
      expect(e.zMin, `${e.side}`).toBeLessThanOrEqual(spinousTipZ(7) + 1);
    }
  });

  it('el ángulo superior a 9,1 ± 2 DE cm de la línea media (Pontin) y el inferior en la línea escapular (Moon y Kim; 8,5)', () => {
    const lineS = half - Math.abs(wallArc(torsoSkinPoint(line('scapular'), 0, t), t));
    for (const e of both) {
      expect(e.sAtTop, `${e.side}`).toBeGreaterThanOrEqual(91 - 2 * 11);
      expect(e.sAtTop, `${e.side}`).toBeLessThanOrEqual(91 + 2 * 11);
      expect(Math.abs(e.sAtAngle - lineS), `${e.side}`).toBeLessThanOrEqual(2);
    }
  });

  it('del ángulo superior al inferior, 152,85 ± 2 DE mm (Garzón-Alfaro, varones): el alto de la lámina en la clasificación', () => {
    for (const e of both) {
      // el alto vertical: el borde medial se inclina 24 mm en él (el largo es la recta entre los ángulos)
      expect(e.zMax - e.zMin, `${e.side}`).toBeGreaterThanOrEqual(152.85 - 2 * 16.77 - 1);
      expect(e.zMax - e.zMin, `${e.side}`).toBeLessThanOrEqual(152.85 + 2 * 16.77);
    }
  });

  it('el plano horizontal por el ángulo inferior corta la 9.ª costilla junto a la columna (Treves, citado por Gray; A-T19)', () => {
    const z9 = ribTableZ(scene.ribCage, 8, ribOf(scene, 9).uPost);
    for (const e of both) expect(Math.abs(e.zMin - z9), `${e.side}`).toBeLessThanOrEqual(0.5 * ribHeightMm(scene, 9));
  });

  it('sentado, la sonda llega a la escápula: a 10,3 cm de la línea media, del EIC3 al 6.º, la línea central encuentra el hueso', () => {
    // la línea escapular corre junto al borde medial (Pontin: casi vertical, a 9 cm); 1 cm por fuera, sobre la lámina
    for (const side of [-1, 1] as const) {
      const phi = phiAtS(103, side);
      for (let n = 3; n <= 6; n++) {
        const z = intercostalZ(scene, n, phi);
        expect(SITTING_REACH.admit(longitudinalPose(phi, z)), `${side} EIC${n}`).not.toBeNull();
        expect(probeCenterContent(scene, longitudinalPose(phi, z)).content, `${side} EIC${n}`).toBe('bone');
      }
    }
  });

  // Gray: con los brazos cruzados y el tronco flexionado la escápula va hacia delante y el EIC entre la 6.ª y la 7.ª costilla
  // queda bajo la piel junto al borde medial (el triángulo de auscultación). El modelo solo tiene los brazos a los lados: 5 mm por
  // fuera del borde medial, en ese espacio, la sonda encuentra la escápula
  notYetMet('A-T18: con los brazos cruzados y el tronco flexionado, el EIC 6.º–7.º junto al borde medial queda libre (Gray)', () => {
    for (const side of [-1, 1] as const) {
      const sc = scene.ribCage.scapula;
      const zc = intercostalZ(scene, 6, phiAtS(80, side));
      const f = (zc - sc.inferior[1]) / (sc.superior[1] - sc.inferior[1]);
      const sBorder = sc.inferior[0] + f * (sc.superior[0] - sc.inferior[0]);
      expect(probeCenterContent(scene, longitudinalPose(phiAtS(sBorder + 5, side), zc)).content, `${side}`).toBe('lung');
    }
  });
});

describe('A-T19: oblicuidad costal', () => {
  // La base: la costilla 7 desciende 90–130 mm entre su extremo posterior y el anterior (Robinson y cols.: 61° en el plano
  // sagital; 195 × tan 30° = 113); un plano horizontal por el ángulo inferior de la escápula corta la 9.ª costilla junto a la
  // columna y la 5.ª en la línea del pezón (Treves, citado por Gray). Medido (decisión 16): la 7.ª baja 102,9 mm de la
  // apófisis transversa a la unión condrocostal; la 9.ª junto a la columna a 11,5 mm y la 5.ª en la medioclavicular a 11,7.
  // [DISCREPANCIA] el mismo plano, según Treves, cruza el esternón entre la 4.ª y la 5.ª; con los niveles vertebrales del
  // esternón de Gray (unión xifoesternal en T9–T10) cruza entre la 6.ª (17,0) y la 7.ª (0): se conservan los de Gray. La
  // línea de Treves y los extremos en su vértebra se cumplen por construcción (la 5.ª se ancla en esa línea y cada extremo
  // posterior en su vértebra, `buildRibCage`): esas pruebas vigilan la construcción, no la validan; la caída y los ángulos sí
  const cage = scene.ribCage;
  const zAt = (n: number, u: number) => ribTableZ(cage, n - 1, u);

  it('la 7.ª costilla desciende 90–130 mm de su extremo posterior al anterior (102,9)', () => {
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

  // Robinson y cols. (hombres): el ángulo sagital de la 7.ª, 61,1 ± 7,7° respecto de la línea posterior (29 ± 7,7 bajo el plano
  // transversal), y el de la 1.ª, 58,9 ± 8,2 (31 ± 8,2). Medido (27-09-2026): la 7.ª, 36,2°; la 1.ª, 17,6: cae 47,7 mm, lo
  // que baja la real, pero a lo largo de los 150 mm de profundidad del cilindro (`thorax-cylindrical-cage`). Con el tronco de
  // 226 mm (decisión 28), 32,2 y 15,2; con las costillas hasta la transversa de la TAC y la espalda alta (decisión 29), 31,8 y 15,0
  it('la 7.ª costilla desciende 29 ± 7,7° bajo el plano transversal en el plano sagital (Robinson y cols.; 31,8)', () => {
    const a = ribSagittalAngleDeg(scene, 7);
    expect(a).toBeGreaterThanOrEqual(29 - 7.7);
    expect(a).toBeLessThanOrEqual(29 + 7.7);
  });

  notYetMet('la 1.ª costilla desciende 31 ± 8,2° bajo el plano transversal (Robinson y cols.; hoy 15,0: el tronco cilíndrico)', () => {
    const a = ribSagittalAngleDeg(scene, 1);
    expect(a).toBeGreaterThanOrEqual(31 - 8.2);
    expect(a).toBeLessThanOrEqual(31 + 8.2);
  });

  it('cada costilla nace en su vértebra: los extremos posteriores, un segmento torácico entre sí y la 9.ª a la altura de T9', () => {
    const seg = RIBCAGE.params.thoracicSegmentMm.value;
    for (let n = 1; n <= 12; n++) expect(zAt(n, ribOf(scene, n).uPost)).toBeCloseTo((9.5 - n) * seg, 0);
  });
});

describe('A-T12–A-T16: pulmón, pleura, diafragma y corazón en los dos hemitórax (paso C3, decisión 18)', () => {
  // El pulmón y las cúpulas de VExUS acababan unas dos costillas por encima del borde de Gray (con la pared por región,
  // decisión 17, en fin de espiración y a 4 mm por dentro de la pleura: derecho z 43 en la LMC —la 4.ª costilla—, 20 en la
  // LAM —la 6.ª— y 45 en la paravertebral; izquierdo 17,5, 4 y 10,5), la cortina solo bajaba en el receso lateral y
  // posterior derecho y el hemitórax izquierdo no tenía pleura. Desde la decisión 18 (`organs/lungBorder.ts`): el borde de
  // la base en FRC (Gray: la 6.ª costilla en la LMC, la 8.ª en la LAM y la apófisis espinosa de T10 detrás, cuya punta queda
  // a la altura del cuerpo de T11, z −35), la reflexión pleural (el 8.º cartílago, la 10.ª costilla, T12) y la cortina en
  // los dos lados. Se mide el pulmón que toca la pleura, a 1,5 mm por dentro de ella (la lámina de la cortina): derecho e
  // izquierdo, z −17,5 en la LMC, −35 en la LAM y −35 en la paravertebral. A 4 mm, en la rampa de la cúpula hacia la pared,
  // queda 6–11 mm más arriba (el ángulo costofrénico).
  const PARAVERTEBRAL = (side: -1 | 1) => line('paravertebral', side);
  /** El borde, «a la altura de la costilla n»: entre el centro del espacio de encima y el del de debajo. */
  const atRib = (z: number | null, n: number, phi: number) => {
    expect(z).not.toBeNull();
    expect(z!).toBeLessThanOrEqual(intercostalZ(scene, n - 1, phi));
    expect(z!).toBeGreaterThanOrEqual(intercostalZ(scene, n, phi));
  };
  // desde z 140: por encima, la cúpula pleural (cobertura torácica) ya no deja pulmón junto a la pared en todas las líneas
  const at = (phi: number, caudal = 0) => lungBorderZ(scene, phi, 1.5, 140, -250, 0.5, { diaphragmCaudalMm: caudal });
  const border = ([-1, 1] as const).map((side) => ({
    side,
    lmc: at(line('midclavicular', side)),
    lam: at(line('midaxillary', side)),
    post: at(PARAVERTEBRAL(side)),
  }));

  it('hay pulmón bajo la pleura en lo alto de las tres líneas, a los dos lados', () => {
    for (const b of border) for (const z of [b.lmc, b.lam, b.post]) expect(z, `lado ${b.side}`).not.toBeNull();
  });

  it('A-T13: en la LAM el borde del pulmón está a la altura de la 8.ª costilla en FRC, a los dos lados (z −35)', () => {
    for (const b of border) atRib(b.lam, 8, line('midaxillary', b.side));
  });

  it('borde del pulmón de Gray: la 6.ª costilla en la LMC y T10 detrás (z −17,5 y −35)', () => {
    const seg = RIBCAGE.params.thoracicSegmentMm.value;
    for (const b of border) {
      atRib(b.lmc, 6, line('midclavicular', b.side));
      expect(b.post!).toBeLessThanOrEqual((9.5 - 10) * seg);
      expect(b.post!).toBeGreaterThanOrEqual((9.5 - 12) * seg);
    }
  });

  it('A-T13: la reflexión pleural, a la altura de la 10.ª costilla en la LAM (8.º cartílago en la LMC, T12 detrás)', () => {
    // el pulmón no baja de la reflexión aunque el diafragma bajara sin límite
    const seg = RIBCAGE.params.thoracicSegmentMm.value;
    for (const side of [-1, 1] as const) {
      atRib(at(line('midaxillary', side), 500), 10, line('midaxillary', side));
      atRib(at(line('midclavicular', side), 500), 8, line('midclavicular', side));
      // detrás, la apófisis de T12 a la altura de su cuerpo (la regla de los tres), con el paso de la medida
      const post = at(PARAVERTEBRAL(side), 500)!;
      expect(post).toBeLessThanOrEqual((9.5 - 11.5) * seg);
      expect(post).toBeGreaterThanOrEqual((9.5 - 13) * seg);
    }
  });

  it('A-T13: en la respiración tranquila la cortina baja 0,9–2,8 cm (16 mm, lo que el diafragma: la base en supino)', () => {
    const quiet = new RespiratoryModel(defaultPatient()).excursionMm();
    for (const side of [-1, 1] as const) {
      const phi = line('midaxillary', side);
      const d = at(phi)! - at(phi, quiet)!;
      expect(d).toBeGreaterThanOrEqual(9);
      expect(d).toBeLessThanOrEqual(28);
    }
  });

  // lus-sim (decisión 22): con la excursión de la base, 53 mm (en VExUS y hasta el paso C4, 30: con 53 su campo respiratorio
  // se plegaba). Medido: 53 a los dos lados (la reflexión de la LAM queda 62 mm bajo el borde de FRC)
  it('A-T13: en la inspiración profunda la cortina baja 3,1–7,5 cm en la LAM, a los dos lados (53 mm)', () => {
    const deep = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'deep' }).excursionMm();
    for (const side of [-1, 1] as const) {
      const phi = line('midaxillary', side);
      const d = at(phi)! - at(phi, deep)!;
      expect(d).toBeGreaterThanOrEqual(31);
      expect(d).toBeLessThanOrEqual(75);
    }
  });

  it('A-T14: en la inspiración profunda la cortina izquierda tapa el espacio intercostal por el que se ve la cúpula', () => {
    // el primer EIC entero bajo el borde del pulmón en FRC en la LAM y la LAP izquierdas (el 8.º y el 9.º): en FRC, a 1,5 mm de
    // la pleura, es diafragma (la ZOA) en todo su alto; en la inspiración profunda, pulmón (la cortina)
    const deep = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'deep' }).excursionMm();
    for (const l of ['midaxillary', 'posteriorAxillary'] as const) {
      const phi = line(l, 1);
      const frc = at(phi)!;
      let n = 1;
      while (ribZ(scene, n, phi) - ribOf(scene, n, 1).halfWidth > frc) n++;
      const top = ribZ(scene, n, phi) - ribOf(scene, n, 1).halfWidth;
      const bottom = ribZ(scene, n + 1, phi) + ribOf(scene, n + 1, 1).halfWidth;
      const expir = lungBorderZ(scene, phi, 1.5, top, bottom - 1, 0.5);
      const insp = lungBorderZ(scene, phi, 1.5, top, bottom - 1, 0.5, { diaphragmCaudalMm: deep });
      expect(expir, l).toBeNull();
      expect(insp!, l).toBeLessThan(bottom);
    }
  });

  /** Alto (mm) de la lámina de diafragma bajo la pleura, por la normal de la piel (A-T15). */
  const zoaThicknessAt = (phi: number, z: number, caudal: number) => {
    const t = scene.torso;
    let run = 0;
    for (let d = 0.01; d < 12; d += 0.02) {
      let p = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + d, t, z);
      p = probeHitPoint(phi, scene.wallThicknessAt(p) + d, t, z);
      if (scene.classify(p, { diaphragmCaudalMm: caudal }).tissue === Tissue.Diaphragm) run += 0.02;
    }
    return run;
  };

  it('A-T15: el diafragma de la ZOA (EIC 9, LAA y LAM) mide 1,1–2,7 mm en FRC', () => {
    for (const side of [-1, 1] as const)
      for (const l of ['anteriorAxillary', 'midaxillary'] as const) {
        const phi = line(l, side);
        // en FRC, en el EIC 9 (el de Boon)
        const frc = zoaThicknessAt(phi, intercostalZ(scene, 9, phi), 0);
        expect(frc, `${l} ${side}`).toBeGreaterThanOrEqual(1.1);
        expect(frc, `${l} ${side}`).toBeLessThanOrEqual(2.7);
      }
  });

  // A TLC se mide en el primer EIC desde el 8.º cuyo centro queda a ≥ 5 mm bajo la cortina (tapado, bajo la lámina quedan 2 mm
  // de la ZOA) y a ≥ 10 mm sobre la inserción de la ZOA (la reflexión menos `zoaBelowReflectionMm`, 20 mm [SUPUESTO]: la
  // longitud de la ZOA es NO ENCONTRADO). Con los 53 mm de la base (decisión 22), en el tronco de 210 mm de profundidad: en la
  // LAA, el 9.º (10,3 mm sobre la inserción; Boon y el consenso miden ahí, EIC 8–9 por delante de la LAA); en la LAM ninguno (el
  // 9.º lo tapa la cortina y el centro del 10.º queda a 4,4 mm de la inserción). Con el tronco de 226 mm (decisión 28) la
  // reflexión de la LAA sube 1,2 mm y el EIC 9 solo 0,8: queda a 9,8 mm de la inserción: ningún EIC cumple el criterio y la meta, que cuelga
  // del supuesto de la longitud de la ZOA, queda pendiente (con `zoaBelowReflectionMm` ≥ 20,3 volvería a medirse; no se toca un
  // supuesto para que pase una prueba)
  notYetMet('A-T15: el diafragma de la ZOA (EIC 8–10, LAA) engruesa ≥ 20 % a TLC en un EIC a ≥ 10 mm de su inserción', () => {
    const deep = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'deep' }).excursionMm();
    const ZB = LUNG_BORDER.params.zoaBelowReflectionMm.value;
    for (const side of [-1, 1] as const)
      for (const l of ['anteriorAxillary', 'midaxillary'] as const) {
        const phi = line(l, side);
        const tlcBorder = at(phi, deep)!;
        const insertion = lungBorderAt(scene.lungBorder, wallArc(torsoSkinPoint(phi, 0, scene.torso), scene.torso))[1] - ZB;
        const n = [8, 9, 10].find((k) => intercostalZ(scene, k, phi) <= tlcBorder - 5 && intercostalZ(scene, k, phi) >= insertion + 10);
        if (l === 'midaxillary' && n === undefined) continue;
        expect(n, `${l} ${side}: ningún EIC 8–10 descubierto a TLC y a ≥ 10 mm de la inserción de la ZOA`).toBeDefined();
        const z = intercostalZ(scene, n!, phi);
        expect(zoaThicknessAt(phi, z, deep) / zoaThicknessAt(phi, z, 0), `${l} ${side}`).toBeGreaterThanOrEqual(1.2);
      }
  });

  it('A-T12: sin líquido pleural a la vista (ni en los recesos declives)', () => {
    for (let phi = -Math.PI; phi < Math.PI; phi += Math.PI / 24)
      for (let z = -120; z <= 150; z += 5)
        for (const d of [0.5, 2, 5])
          expect(
            scene.classify(
              probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, scene.torso)) + d, scene.torso, z),
              BASELINE_INSTANT,
            ).tissue,
          ).not.toBe(Tissue.Fluid);
  });

  it('A-T16: en la ventana cardiaca (5.º EIC a 3–6 cm y 4.º a 5 cm de la línea media, a la izquierda) no hay pulmón', () => {
    const t = scene.torso;
    const check = (X: number, n: number, side: 1 | -1) => {
      const phi = Math.acos((side * X) / t.a);
      const z = intercostalZ(scene, n, phi);
      const pleura = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)), t, z);
      const deep = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + 1.5, t, z);
      return { tissue: scene.classify(deep, BASELINE_INSTANT).tissue, edge: scene.lungEdgeMm(pleura, BASELINE_INSTANT)! };
    };
    for (const [X, n] of [
      [30, 5],
      [45, 5],
      [60, 5],
      [50, 4],
    ] as const) {
      const left = check(X, n, 1);
      // corazón bajo la pleura, y la pasada A0 no registra pleura (su borde, muy por debajo)
      expect(left.tissue, `izquierda, EIC${n} a ${X} mm`).toBe(Tissue.Myocardium);
      expect(left.edge).toBeLessThan(-100);
      // al otro lado, pulmón
      expect(check(X, n, -1).tissue, `derecha, EIC${n} a ${X} mm`).toBe(Tissue.Lung);
    }
    // el ápex, en el 5.º EIC a 9 cm, lo tapa la língula; el borde del pulmón izquierdo sigue en la 6.ª costilla de la LMC
    expect(check(90, 5, 1).tissue).toBe(Tissue.Lung);
  });

  it('A-T16: en apnea, el pulmón junto a la ventana muestra el pulso pulmonar (decisión 32): se desliza con el latido, a la FC', () => {
    // el pulmón bajo la pleura, 5 mm por fuera del borde craneal de la ventana: el punto del pulmón (antes del latido) que está
    // ahí, a lo largo de cuatro latidos en apnea espiratoria; el reloj único da el latido (`cardiacEjection`)
    const t = scene.torso;
    const w = scene.heart.window;
    const phi = Math.acos(HEART.params.windowOffsetMm.value / t.a);
    const z = w.z + w.r + 5;
    const p = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + 1.5, t, z);
    expect(scene.classify(p, BASELINE_INSTANT).tissue).toBe(Tissue.Lung);
    const engine = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: 'apnea-expiratory' });
    const lung = (s: { cardiacEjection: number }) => lungPulseInverse(scene.heart, t, p, s.cardiacEjection);
    const series: { t: number; d: number; beat: number }[] = [];
    for (let i = 0; i < Math.round(4 / engine.clock.dt); i++) {
      const s = engine.step();
      const x = lung(s);
      series.push({ t: s.t, d: Math.hypot(x[0] - p[0], x[1] - p[1], x[2] - p[2]), beat: s.beatIndex });
    }
    // la parte tangente del campo del latido junto a la cara anterior (el ventrículo derecho, casi paralela a la pared): ≈ 0,9
    // mm, más que el ruido de la medida en apnea de Costamagna (1,2 ± 0,6 mm, sin el latido filtrado)
    const peak = Math.max(...series.map((s) => s.d));
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThan(LUNG_PULSE.params.rightVentricleMm.value);
    // hacia el corazón: en la telesístole, el pulmón que ahora está en p venía de más lejos del corazón
    const x = lungPulseInverse(scene.heart, t, p, 1);
    expect(heartSd(scene.heart, x)).toBeGreaterThan(heartSd(scene.heart, p));
    // una vez por latido: en cada latido completo un máximo y vuelta a 0 (la telediástole, el corazón lleno)
    const beats = [...new Set(series.map((s) => s.beat))].slice(1, -1);
    expect(beats.length).toBeGreaterThanOrEqual(3);
    for (const b of beats) {
      const inBeat = series.filter((s) => s.beat === b);
      expect(Math.max(...inBeat.map((s) => s.d))).toBeCloseTo(peak, 1);
      expect(Math.min(...inBeat.map((s) => s.d))).toBe(0);
    }
    // y la respiración no lo mueve: en apnea nada más cambia
    expect(engine.sample.resp.diaphragmCaudalMm).toBe(0);
  });
});

describe('F-T12: deslizamiento por región (paso C4, decisión 19)', () => {
  // La amplitud del deslizamiento es lo que baja el pulmón bajo la pleura en una inspiración (Briganti: el desplazamiento de
  // un artefacto en modo B): `lungSlideMm`, el que ancla la retícula del deslizamiento de la pasada B, en la pleura del centro
  // de la vista, de fin de espiración a fin de inspiración. El ápex de Briganti es el EIC2 de la LMC (el punto BLUE superior);
  // su base, la LAM un espacio sobre el diafragma (el EIC7, con el borde del pulmón en la 8.ª costilla).
  const pleuraAt = (pose: ProbePose): Vec3 => {
    const v = chestView(scene, pose);
    const D = scanLine(v, 0).pleuraMm!;
    return v.material(pointOnLine(v.contact.frame, tr, 0, D));
  };
  const slide = (p: Vec3, caudal: number) => lungSlideMm(scene.lungBorder, p, scene.torso, caudal);
  const quiet = new RespiratoryModel(defaultPatient()).excursionMm();
  const deep = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'deep' }).excursionMm();

  it('F-T12: el cociente ápex/base es 0,42 ± 0,1 (la recta se calibra con él: se cumple por construcción) y crece con el volumen', () => {
    const apex = pleuraAt(longitudinalPose(LMC, intercostalZ(scene, 2, LMC)));
    const base = pleuraAt(longitudinalPose(LAM, intercostalZ(scene, 7, LAM)));
    for (const exc of [quiet, deep]) {
      const r = slide(apex, exc) / slide(base, exc);
      expect(r, `excursión ${exc}`).toBeGreaterThanOrEqual(0.32);
      expect(r, `excursión ${exc}`).toBeLessThanOrEqual(0.52);
    }
    expect(slide(apex, deep)).toBeGreaterThan(slide(apex, quiet));
    expect(slide(base, deep)).toBeGreaterThan(slide(base, quiet));
  });

  it('decrece con la altura en cada línea y no pasa de lo que baja el borde de su columna (se detiene en la reflexión)', () => {
    for (const side of [-1, 1] as const)
      for (const l of ['midclavicular', 'midaxillary', 'paravertebral'] as const) {
        const phi = line(l, side);
        let prev = Infinity;
        for (let z = -30; z <= 200; z += 10) {
          const p = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, scene.torso)) + 1, scene.torso, z);
          const s = slide(p, deep);
          expect(s, `${l} z ${z}`).toBeLessThanOrEqual(prev + 1e-9);
          prev = s;
          const b = lungBorderAt(scene.lungBorder, wallArc(p, scene.torso));
          expect(s).toBeLessThanOrEqual(b[0] - b[1] + 1e-9);
        }
        // y se apaga arriba (Lichtenstein: «habitualmente nulo» en el vértice)
        expect(prev, l).toBe(0);
      }
  });

  it('D5a: en el punto BLUE superior desliza, menos que en la base, y en el vértice y la fosa supraclavicular no (Lichtenstein 2017)', () => {
    // Lichtenstein 2017 (Fig. 3): «minimal at the upper BLUE-point and usually null at the apex» (el cociente BLUE superior/base
    // lo fija F-T12). La decisión 27 lo citó al revés; esta prueba fija lo que dice la fuente: si el vértice desliza, falla
    const blueUpper = pleuraAt(longitudinalPose(LMC, intercostalZ(scene, 2, LMC)));
    const base = pleuraAt(longitudinalPose(LAM, intercostalZ(scene, 7, LAM)));
    for (const exc of [quiet, deep]) {
      expect(slide(blueUpper, exc), `BLUE superior, excursión ${exc}`).toBeGreaterThan(0);
      expect(slide(blueUpper, exc)).toBeLessThan(slide(base, exc));
    }
    // el vértice: el pulmón junto a la pared desde el borde superior de la clavícula (lo que se ve por la fosa) hasta el tope que
    // admite la base, en todo el contorno de los dos lados
    let lungPoints = 0;
    for (let phi = -Math.PI; phi < Math.PI; phi += Math.PI / 36)
      for (let z = clavicleTopZ(scene); z <= apexMaxZ(scene); z += 5) {
        const p = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, scene.torso)) + 1, scene.torso, z);
        if (scene.classify(p, BASELINE_INSTANT).tissue !== Tissue.Lung) continue;
        lungPoints++;
        expect(slide(p, deep), `φ ${phi.toFixed(2)}, z ${z.toFixed(0)}`).toBe(0);
      }
    expect(lungPoints).toBeGreaterThan(20);
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

  // F-T05 (`docs/knowledge/physics.md` §3.3): la anchura a media altura de la envolvente del eco pleural, a ±20 % de la FWHM
  // axial de la PSF (el pulso de la pasada C, 2,355·σ = 0,61 mm), e invariable con el grosor anatómico de la pleura (el modelo
  // no lo tiene: es una cara). En la GPU (ciclo 2, decisión 20), en las líneas intercostales de los tres puntos de partida, la
  // mediana es 0,69–0,73 mm y las líneas oblicuas llegan a 0,85 (la incidencia y la PSF lateral). No depende de la ganancia: la
  // saturación engrosaba la línea en la pantalla (1,71–2,00 mm con 0 dB; 1,29–1,46 con el preajuste), no su envolvente
  it('F-T05: la línea pleural tiene la anchura del pulso axial (±20 %) a 20 y a 60 mm', () => {
    const axialFwhm = 2 * Math.sqrt(2 * Math.LN2) * AXIAL_SIGMA_MM;
    for (const D of [20, 60]) {
      const w = plt(D);
      expect(w / axialFwhm, `${D} mm: ${w.toFixed(3)} mm`).toBeGreaterThanOrEqual(0.8);
      expect(w / axialFwhm, `${D} mm: ${w.toFixed(3)} mm`).toBeLessThanOrEqual(1.2);
    }
  });

  notYetMet('A-T11: la PLT crece 0,67 ± 0,12 mm por cm de profundidad con una sonda de sector (hoy 0: 0,70 mm de 15 a 60 mm)', () => {
    // el pulso axial (σ fija, AXIAL_SIGMA_MM) y el perfil de la cara no dependen de la profundidad, y en las
    // líneas centrales la pleura plana es normal al haz: la PSF lateral no la engruesa
    const slopePerCm = (plt(60) - plt(20)) / 4;
    expect(slopePerCm).toBeGreaterThanOrEqual(0.67 - 0.12);
    expect(slopePerCm).toBeLessThanOrEqual(0.67 + 0.12);
  });
});

describe('A-T23 y A-T24: el vértice, la clavícula y la fosa supraclavicular (cobertura torácica, decisión 27)', () => {
  const t = scene.torso;
  const C = CLAVICLE.params;
  /** Borde superior del tercio medial de la clavícula según la base (Gray y Yang: 10 mm sobre la escotadura yugular). */
  const clavicleTop = scene.ribCage.sternum.zTop + C.medialTopAboveNotchMm.value;
  const lung = (sc: AnatomyScene, m: Vec3) => sc.classify(m, BASELINE_INSTANT).tissue === Tissue.Lung;
  /** La z más alta con pulmón en el corte, en los puntos que cumplen `where` (rejilla de 4° y 3 mm hacia dentro, z cada 1 mm). */
  const lungTop = (where: (m: Vec3) => boolean): number => {
    for (let z = 260; z > 120; z -= 1)
      for (let deg = -180; deg < 180; deg += 4) {
        const tau = (deg * Math.PI) / 180;
        const sx = t.a * Math.sin(tau);
        const sy = t.b * Math.cos(tau);
        const R = Math.hypot(sx, sy);
        for (let d = 1; d < R; d += 3) {
          const m: Vec3 = [sx * (1 - d / R), sy * (1 - d / R), z];
          if (where(m) && lung(scene, m)) return z;
        }
      }
    return -Infinity;
  };
  const medialThird = C.medialEndXMm.value + C.lengthMm.value / 3;
  const skinArcOf = (phi: number) => Math.abs(wallArc(torsoSkinPoint(phi, 0, t), t));
  /** La columna de la piel de la articulación esternoclavicular, por delante. */
  const uSc = skinArcOf(Math.acos(C.medialEndXMm.value / t.a));

  /** La z más alta del pulmón 1,5 mm bajo la pleura a lo largo de la línea φ (desde la 2.ª costilla hacia arriba). */
  const lungBorderTopZ = (phi: number): number => {
    let top = -Infinity;
    for (let z = ribZ(scene, 2, phi); z < 260; z += 0.5) {
      let p = probeHitPoint(phi, scene.wallThicknessAt(torsoSkinPoint(phi, z, t)) + 1.5, t, z);
      p = probeHitPoint(phi, scene.wallThicknessAt(p) + 1.5, t, z);
      if (!lung(scene, p)) break;
      top = z;
    }
    return top;
  };

  it('A-T23: el pulmón más alto, bajo el tercio medial de la clavícula, queda ≈ 2,5 cm sobre ella (≤ 5), y en ningún sitio más', () => {
    // Gray: «about 2,5 cm», a veces 4–5 y a veces apenas por encima; el modelo pone el techo a 25 mm del borde de la clavícula y
    // la curva de la pleura cervical lo redondea: ≥ 20 mm
    const hi = LUNG_APEX.params.apexAboveClavicleMm.range![1];
    const top = lungTop((m) => m[1] > 0 && Math.abs(m[0]) <= medialThird && Math.abs(wallArc(m, t)) >= uSc);
    expect(top - clavicleTop).toBeGreaterThanOrEqual(20);
    expect(top - clavicleTop).toBeLessThanOrEqual(hi);
    expect(lungTop(() => true) - clavicleTop).toBeLessThanOrEqual(hi);
  });

  it('A-T23: en la línea media del cuello, la tráquea: ni pulmón bajo la piel ni en la imagen sobre la escotadura yugular', () => {
    // bajo la piel de delante de la articulación esternoclavicular (hasta 35 mm de hondo); más adentro el tronco no tiene
    // mediastino (`heart-simplified`): las columnas radiales del vértice convergen ahí
    const notch = scene.ribCage.sternum.zTop;
    for (const y of [95, 85, 75])
      for (const x of [-5, 0, 5]) for (let z = notch + 8; z < 240; z += 4) expect(lung(scene, [x, y, z]), `(${x}, ${y}, ${z})`).toBe(false);
    // la sonda en la línea media sobre la escotadura no ve pulmón
    const m = probeCenterContent(scene, longitudinalPose(Math.PI / 2, notch + 15));
    expect(m.content).not.toBe('lung');
  });

  it('A-T23: en la axila y detrás, el pulmón junto a la pared llega a la 1.ª costilla de su línea y no la pasa (medio espacio, 8 mm)', () => {
    for (const side of [-1, 1] as const)
      for (const l of ['anteriorAxillary', 'midaxillary', 'posteriorAxillary', 'scapular', 'paravertebral'] as const) {
        const phi = line(l, side);
        const top = lungBorderTopZ(phi);
        const half = ribOf(scene, 1, side).halfWidth;
        expect(top, `${l} ${side}`).toBeLessThanOrEqual(ribZ(scene, 1, phi) + half + 8);
        expect(top, `${l} ${side}`).toBeGreaterThanOrEqual(ribZ(scene, 1, phi) - half);
      }
  });

  it('A-T24: la clavícula, subcutánea, mide 15,6 ± 0,9 cm de largo y 14 ± 1 mm de grosor en la clasificación', () => {
    const c = scene.ribCage.clavicle;
    for (const side of [-1, 1] as const) {
      const phi = line('midclavicular', side);
      const zc = c.z0 + c.rise * ((skinArcOf(phi) - c.u0) / (c.u1 - c.u0));
      // por la normal de la piel: el hueso empieza a 2–6 mm (subcutánea) y su grosor es el de su sección (la métrica de la pared
      // lo alarga hasta 1,1 veces)
      let first = -1;
      let last = -1;
      for (let d = 0.25; d < 40; d += 0.25)
        if (Tissue[scene.classify(probeHitPoint(phi, d, t, zc), BASELINE_INSTANT).tissue] === 'Bone') {
          if (first < 0) first = d;
          last = d;
        }
      expect(first, `${side}`).toBeGreaterThanOrEqual(2);
      expect(first, `${side}`).toBeLessThanOrEqual(6);
      expect(last - first + 0.25, `${side}`).toBeGreaterThanOrEqual(12);
      expect(last - first + 0.25, `${side}`).toBeLessThanOrEqual(16 * 1.1);
      // y la sonda sobre ella ve su sombra
      expect(probeCenterContent(scene, longitudinalPose(phi, zc)).content).toBe('bone');
    }
    // el largo, a lo largo de la piel por su eje: del extremo esternal al acromial
    const atU = (u: number) => c.z0 + c.rise * Math.min(1, Math.max(0, (u - c.u0) / (c.u1 - c.u0)));
    let span = 0;
    for (let u = 0; u < 300; u += 0.5) {
      // el punto de la piel de arco u por delante (derecha) y su eje a `depth` por la normal
      let lo = Math.PI / 2;
      let hi = Math.PI;
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (skinArcOf(mid) < u) lo = mid;
        else hi = mid;
      }
      const p = probeHitPoint(0.5 * (lo + hi), c.depth, t, atU(u));
      if (Tissue[scene.classify(p, BASELINE_INSTANT).tissue] === 'Bone') span += 0.5;
    }
    expect(span).toBeGreaterThanOrEqual(147);
    expect(span).toBeLessThanOrEqual(165 + 2 * c.radius);
  });

  /** Profundidad (mm) de la pleura de la cúpula por la fosa supraclavicular, con el haz 20° hacia los pies. */
  const fossaDepth = (sc: AnatomyScene, side: -1 | 1): number | null => {
    const right = Math.PI - Math.acos(70 / sc.torso.a);
    const phi = side < 0 ? right : Math.PI - right;
    const top = sc.ribCage.sternum.zTop + C.medialTopAboveNotchMm.value;
    const m = probeCenterContent(sc, { ...longitudinalPose(phi, top + 12.5), rock: -0.35 });
    return m.content === 'lung' ? m.pleuraMm : null;
  };
  // Yadav: piel → «corner pocket» (cm) ≈ 0,068·IMC + 0,085, DE 0,8; el IMC de cada hábito de la base (§2.3–2.5)
  const yadav = (bmi: number) => [(0.068 * bmi + 0.085 - 1.6) * 10, (0.068 * bmi + 0.085 + 1.6) * 10] as const;
  const BMI = { average: 22.9, thin: 18.5, obese: 33.5 } as const;
  const fossaCases: Array<[ChestHabitus, boolean]> = [
    [{ build: 'average', sex: 'male' }, true],
    [{ build: 'average', sex: 'female' }, true],
    [{ build: 'thin', sex: 'male' }, true],
    [{ build: 'obese', sex: 'male' }, true],
    // con el tronco de 113 mm (decisión 28) se cumple; con el de 105 medía 40,4 frente a ≤ 39,6
    [{ build: 'obese', sex: 'female' }, true],
  ];
  for (const [chest, met] of fossaCases) {
    const title = `A-T24: por la fosa supraclavicular la cúpula pleural, a la profundidad de Yadav ± 2 DE (${chest.build}, ${chest.sex})`;
    const body = () => {
      const p = defaultPatient();
      const sc = chest.build === 'average' && chest.sex === 'male' ? scene : new AnatomyScene({ ...p, habitus: { ...p.habitus, chest } });
      const [lo, hi] = yadav(BMI[chest.build]);
      for (const side of [-1, 1] as const) {
        const d = fossaDepth(sc, side);
        expect(d, `${side}`).not.toBeNull();
        expect(d!, `${side}`).toBeGreaterThanOrEqual(Math.max(lo, 1));
        expect(d!, `${side}`).toBeLessThanOrEqual(hi);
      }
    };
    if (met) it(title, body);
    else notYetMet(title, body);
  }
});
