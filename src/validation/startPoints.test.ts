import { describe, expect, it } from 'vitest';
import { POSTERIOR_START_POSES, START_POINTS, START_POINT_POSES, type StartPoint } from '../app/startPoints';
import { blueHandPoints, skinArcOf } from '../app/blueHands';
import { HANDS } from '../anatomy/hands';
import { AnatomyScene } from '../anatomy/scene';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { defaultPatient } from '../physiology/patientState';
import { contactCoupling } from '../probe/contact';
import { CONVEX_C35, clampPose, lineAngle, pointOnLine, type ProbePose } from '../probe/probe';
import { chestView, intercostalZ, ribShadows, ribZ, scanView } from './support/chestView';

/**
 * Puntos de partida del tórax (decisión 12; el arnés de `startPoints.test.ts` de VExUS, que comprobaba que cada
 * ventana corta lo que promete su texto sin afinar la sonda). Con la sonda apoyada con su contacto y en fin de
 * espiración (`chestView`), cada punto BLUE deja bajo la sonda la pleura parietal y el pulmón que la toca, y los que
 * prometen costillas las tienen en el plano con su sombra y la pleura entre ellas (el signo del murciélago; desde la
 * parrilla del paso C1, decisión 16, también el punto superior, entre la 2.ª y la 3.ª costillas). Las
 * poses son las de su evidencia (`START_POINT_POSES`, `BLUE_UPPER_POSE`) y ninguna la recorta `clampPose`.
 * lus-sim (decisión 33): y los tres paravertebrales derechos de la espalda (`POSTERIOR_START_POSES`), con el paciente sentado.
 */
const scene = new AnatomyScene(defaultPatient());
const poseOf = (sp: StartPoint): ProbePose => ({ phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 });
const byId = (id: StartPoint['id']) => START_POINTS.find((s) => s.id === id)!;
const POSTERIOR = ['posteriorUpper', 'posteriorMiddle', 'posteriorBasal'] as const;
const isPosterior = (id: StartPoint['id']) => (POSTERIOR as readonly string[]).includes(id.replace(/Left$/, ''));
const RIGHT = ['blueUpper', 'blueLower', 'phrenic', 'plaps', ...POSTERIOR] as const;

function view(id: StartPoint['id']) {
  const v = chestView(scene, poseOf(byId(id)));
  const scans = scanView(v, 4);
  const coupled = scans.filter((s) => contactCoupling(v.contact, s.theta) > 0.95);
  return { v, scans, coupled, shadows: ribShadows(scans) };
}

describe('Puntos de partida del tórax (decisión 12)', () => {
  it('los cuatro de la regla de las manos y los tres paravertebrales en cada hemitórax, el izquierdo simétrico del derecho (decisión 42)', () => {
    expect(START_POINTS.map((s) => s.id)).toEqual([...RIGHT, ...RIGHT.map((id) => `${id}Left`)]);
    const P = START_POINT_POSES.params;
    expect([byId('blueUpper').phi, byId('blueUpper').z]).toEqual([P.blueUpperPhi.value, P.blueUpperZ.value]);
    expect([byId('blueLower').phi, byId('blueLower').z]).toEqual([P.blueLowerPhi.value, P.blueLowerZ.value]);
    expect([byId('phrenic').phi, byId('phrenic').z]).toEqual([thoraxLinePhi('midaxillary', scene.torso), P.phrenicZ.value]);
    // el PLAPS es la continuación horizontal del BLUE inferior, más atrás
    expect(byId('plaps').z).toBe(byId('blueLower').z);
    expect(byId('plaps').phi).toBe(P.plapsPhi.value);
    for (const id of RIGHT) {
      const r = byId(id);
      const l = byId(`${id}Left`);
      expect([r.side, l.side], id).toEqual(['right', 'left']);
      expect(l.phi, id).toBeCloseTo(Math.PI - r.phi, 12);
      expect([l.z, l.label, l.position], id).toEqual([r.z, r.label, r.position]);
    }
    for (const sp of START_POINTS) {
      expect(sp.yaw, sp.id).toBe(0);
      // (decisión 33) en la posición del punto: los de la espalda, sentado; en supino, `clampPose` los deja en el borde
      expect(sp.position, sp.id).toBe(isPosterior(sp.id) ? 'sitting' : undefined);
      expect(clampPose(poseOf(sp), sp.position), sp.id).toEqual(poseOf(sp));
      if (sp.position) expect(clampPose(poseOf(sp)).phi, sp.id).toBeCloseTo(sp.side === 'right' ? 1.2 * Math.PI : -0.2 * Math.PI, 12);
      // en su hemitórax: el derecho, φ > π/2; el izquierdo, φ < π/2
      if (sp.side === 'right') expect(sp.phi, sp.id).toBeGreaterThan(Math.PI / 2);
      else expect(sp.phi, sp.id).toBeLessThan(Math.PI / 2);
    }
  });

  it('la regla de las manos (decisión 42): cada punto donde lo ponen las manos del avatar, y en qué espacio intercostal cae', () => {
    const H = HANDS.params;
    const P = START_POINT_POSES.params;
    const hand = (f: number, p: number, b: number) => ({ fingerLengthMm: f, palmLengthMm: p, handBreadthMm: b });
    const build = (h: ReturnType<typeof hand>, side: -1 | 1 = -1) =>
      blueHandPoints(scene.torso, scene.ribCage.clavicle, h, P.plapsPhi.value, side);
    const nominal = hand(H.middleFingerLengthMm.value, H.palmLengthMm.value, H.handBreadthMm.value);
    const q = build(nominal);
    // los valores declarados son los de la construcción, redondeados: a ≤ 0,1 mm en z y a ≤ 0,5 mm por la piel
    const arcErr = (phi: number, ref: number) => Math.abs(skinArcOf(phi, scene.torso) - skinArcOf(ref, scene.torso));
    expect(Math.abs(P.blueUpperZ.value - q.upper.z)).toBeLessThan(0.1);
    expect(Math.abs(P.blueLowerZ.value - q.lower.z)).toBeLessThan(0.1);
    expect(Math.abs(P.phrenicZ.value - q.phrenicZ)).toBeLessThan(0.1);
    expect(arcErr(P.blueUpperPhi.value, q.upper.phi)).toBeLessThan(0.5);
    expect(arcErr(P.blueLowerPhi.value, q.lower.phi)).toBeLessThan(0.5);
    // las distancias por la piel: un dedo medio y un dedo más media palma
    expect(skinArcOf(q.upper.phi, scene.torso)).toBeCloseTo(H.middleFingerLengthMm.value, 6);
    expect(skinArcOf(q.lower.phi, scene.torso)).toBeCloseTo(H.middleFingerLengthMm.value + 0.5 * H.palmLengthMm.value, 6);
    // los rangos declarados: las manos a ± 1 DE, en todas sus combinaciones
    const all = H.middleFingerLengthMm.range!.flatMap((f) =>
      H.palmLengthMm.range!.flatMap((p) => H.handBreadthMm.range!.map((b) => build(hand(f, p, b)))),
    );
    const span = (g: (x: (typeof all)[number]) => number): [number, number] => [Math.min(...all.map(g)), Math.max(...all.map(g))];
    const near = (r: readonly number[] | undefined, e: [number, number], tol: number) => {
      expect(Math.abs(r![0] - e[0])).toBeLessThan(tol);
      expect(Math.abs(r![1] - e[1])).toBeLessThan(tol);
    };
    near(
      P.blueUpperZ.range,
      span((x) => x.upper.z),
      0.1,
    );
    near(
      P.blueLowerZ.range,
      span((x) => x.lower.z),
      0.1,
    );
    near(
      P.phrenicZ.range,
      span((x) => x.phrenicZ),
      0.1,
    );
    near(
      P.blueUpperPhi.range,
      span((x) => x.upper.phi),
      1e-3,
    );
    near(
      P.blueLowerPhi.range,
      span((x) => x.lower.phi),
      1e-3,
    );
    // dónde caen en la parrilla del modelo (ninguna fuente lo mide: anatomy.md §4): el superior en el EIC1, el inferior en el
    // EIC4 y la línea frénica en el EIC7 de la axilar media
    const between = (z: number, n: number, phi: number) => z < ribZ(scene, n, phi) && z > ribZ(scene, n + 1, phi);
    expect(between(q.upper.z, 1, q.upper.phi)).toBe(true);
    expect(between(q.lower.z, 4, q.lower.phi)).toBe(true);
    expect(between(q.phrenicZ, 7, q.phrenic.phi)).toBe(true);
    // la línea frénica, por encima del borde del pulmón en espiración en la axilar media (A-T13: −34 mm)
    expect(q.phrenicZ).toBeGreaterThan(-34);
    // el izquierdo, el simétrico
    const l = build(nominal, 1);
    expect(l.upper.phi).toBeCloseTo(Math.PI - q.upper.phi, 9);
    expect(l.lower.z).toBe(q.lower.z);
  });

  it('cada punto deja la pleura parietal bajo casi todas las líneas apoyadas, a la profundidad de la pared', () => {
    for (const sp of START_POINTS.filter((s) => !isPosterior(s.id) && !s.id.startsWith('phrenic'))) {
      const { scans, coupled } = view(sp.id);
      const tag = `${sp.id}: ${coupled.length} de ${scans.length} líneas apoyadas`;
      // la mitad del sector como mínimo apoya en el tórax curvo (en la medioclavicular el borde craneal no)
      expect(coupled.length, tag).toBeGreaterThan(0.5 * scans.length);
      const withPleura = coupled.filter((s) => s.pleuraMm !== null);
      expect(withPleura.length, tag).toBe(coupled.length);
      // la pleura, bajo la pared torácica por región (decisión 17: 12,8–18 mm por la normal de la piel en estas zonas; antes
      // la heredada, 28 mm en la métrica radial), con la sonda hundida
      for (const s of withPleura) {
        expect(s.pleuraMm!, tag).toBeGreaterThan(8);
        expect(s.pleuraMm!, tag).toBeLessThan(26);
      }
    }
  });

  it('los puntos cortan costillas con su sombra y la pleura entre ellas (signo del murciélago)', () => {
    for (const id of ['blueUpper', 'blueLower', 'plaps', 'posteriorUpper', 'posteriorMiddle'].flatMap((x) => [
      x,
      `${x}Left`,
    ]) as StartPoint['id'][]) {
      const { scans, shadows } = view(id);
      const tag = `${id}: ${shadows.length} sombras, ${JSON.stringify(shadows.map((s) => s.ribTopMm.toFixed(1)))}`;
      expect(shadows.length, tag).toBeGreaterThanOrEqual(2);
      // entre dos sombras, líneas con la pleura y sin hueso encima (el espacio intercostal)
      const [a, b] = shadows;
      const between = scans.filter((s) => s.theta > a.theta1 && s.theta < b.theta0);
      expect(between.length, tag).toBeGreaterThan(0);
      for (const s of between) {
        expect(s.ribMm, tag).toBeNull();
        expect(s.pleuraMm, tag).not.toBeNull();
      }
      // la línea costal por encima de la pleura (el murciélago: las costillas, la pleura más honda entre ellas): cada
      // sombra frente a la pleura de las líneas libres que la rodean (decisión 17: la pared cambia de grosor a lo largo del
      // corte, y con ella la profundidad de la pleura y de las costillas)
      const i0 = (sh: (typeof shadows)[number]) => scans.findIndex((s) => s.theta === sh.theta0);
      const i1 = (sh: (typeof shadows)[number]) => scans.findIndex((s) => s.theta === sh.theta1);
      for (const sh of shadows) {
        const near = [scans[i0(sh) - 1], scans[i1(sh) + 1]].filter((s) => s && s.ribMm === null && s.pleuraMm !== null);
        for (const s of near) expect(sh.ribTopMm, tag).toBeLessThan(s.pleuraMm!);
      }
    }
  });

  it('el punto frénico (decisión 42): el pulmón en el lado craneal y su borde, sobre el diafragma, en el caudal', () => {
    for (const id of ['phrenic', 'phrenicLeft'] as const) {
      const sp = byId(id);
      const { scans, coupled } = view(id);
      const v = chestView(scene, poseOf(sp));
      const missing = scans.map((s, i) => (s.pleuraMm === null ? i : -1)).filter((i) => i >= 0);
      const tag = `${id}: sin pleura ${JSON.stringify(missing)} de ${scans.length}`;
      expect(coupled.length, tag).toBe(scans.length);
      // las líneas sin pleura (bajo el borde del pulmón), un solo tramo en el borde caudal del sector (θ < 0, hacia los pies)
      expect(missing.length, tag).toBeGreaterThan(0);
      expect(missing.length, tag).toBeLessThan(0.5 * scans.length);
      expect(missing, tag).toEqual(Array.from({ length: missing.length }, (_, i) => i));
      expect(pointOnLine(v.contact.frame, v.tr, scans[0].theta, 20)[2], tag).toBeLessThan(sp.z);
    }
  });

  it('los de la espalda (decisión 33): en la paravertebral derecha, en el centro de su EIC y con la pleura bajo la pared posterior', () => {
    const P = POSTERIOR_START_POSES.params;
    const pv = thoraxLinePhi('paravertebral', scene.torso, -1);
    const ics: Record<(typeof POSTERIOR)[number], [number, number]> = {
      posteriorUpper: [P.upperZ.value, 3],
      posteriorMiddle: [P.middleZ.value, 8],
      posteriorBasal: [P.basalZ.value, 10],
    };
    for (const id of POSTERIOR.flatMap((x) => [x, `${x}Left` as const])) {
      const sp = byId(id);
      const [z, n] = ics[id.replace(/Left$/, '') as (typeof POSTERIOR)[number]];
      const left = id.endsWith('Left');
      expect(sp.phi, id).toBeCloseTo(left ? Math.PI - pv : pv, 12);
      expect(sp.z, id).toBe(z);
      // el centro del EIC de la parrilla (redondeado a 0,1 mm) y, el rango declarado, entre los centros de sus costillas
      expect(Math.abs(z - intercostalZ(scene, n, sp.phi)), id).toBeLessThan(0.1);
      const range = Object.values(P).find((q) => q.value === z)!.range!;
      expect(range[1], id).toBeCloseTo(ribZ(scene, n, sp.phi), 1);
      expect(range[0], id).toBeCloseTo(ribZ(scene, n + 1, sp.phi), 1);
      // la pleura bajo la pared posterior (decisión 29: 28–32 mm de la piel a la costilla, más la costilla y la fascia), con la
      // sonda hundida; todas las líneas apoyan en la espalda plana
      const { scans, coupled } = view(id);
      expect(coupled.length, id).toBe(scans.length);
      const withPleura = coupled.filter((s) => s.pleuraMm !== null);
      for (const s of withPleura) {
        expect(s.pleuraMm!, id).toBeGreaterThan(24);
        expect(s.pleuraMm!, id).toBeLessThan(38);
      }
      if (!id.startsWith('posteriorBasal')) expect(withPleura.length, id).toBe(coupled.length);
      else {
        // el basal, «por encima de la cortina»: la pleura en la parte craneal del plano y, en la caudal (θ < 0, hacia los
        // pies), el borde del pulmón en espiración; las líneas sin pleura, un solo tramo en el borde caudal del sector
        const v = chestView(scene, poseOf(sp));
        const missing = scans.map((s, i) => (s.pleuraMm === null ? i : -1)).filter((i) => i >= 0);
        expect(missing.length, id).toBeGreaterThan(0);
        expect(missing.length, id).toBeLessThan(0.5 * scans.length);
        expect(missing, id).toEqual(Array.from({ length: missing.length }, (_, i) => i));
        expect(pointOnLine(v.contact.frame, v.tr, scans[0].theta, 28)[2], id).toBeLessThan(sp.z);
      }
    }
  });

  it('las líneas de la pleura de cada punto son las del sector (el contacto se mide en los ángulos de las líneas)', () => {
    const { scans } = view('blueUpper');
    expect(scans.map((s) => s.theta)).toEqual(Array.from({ length: scans.length }, (_, i) => lineAngle(i * 4, CONVEX_C35)));
  });
});
