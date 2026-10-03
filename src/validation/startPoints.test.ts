import { describe, expect, it } from 'vitest';
import { POSTERIOR_START_POSES, START_POINTS, START_POINT_POSES, type StartPoint } from '../app/startPoints';
import { AnatomyScene } from '../anatomy/scene';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { defaultPatient } from '../physiology/patientState';
import { contactCoupling } from '../probe/contact';
import { BLUE_UPPER_POSE, CONVEX_C35, clampPose, defaultPose, lineAngle, pointOnLine, type ProbePose } from '../probe/probe';
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
const isPosterior = (id: StartPoint['id']) => (POSTERIOR as readonly string[]).includes(id);

function view(id: StartPoint['id']) {
  const v = chestView(scene, poseOf(byId(id)));
  const scans = scanView(v, 4);
  const coupled = scans.filter((s) => contactCoupling(v.contact, s.theta) > 0.95);
  return { v, scans, coupled, shadows: ribShadows(scans) };
}

describe('Puntos de partida del tórax (decisión 12)', () => {
  it('son los tres del protocolo BLUE derecho y los tres paravertebrales, con sus poses declaradas, marcador craneal y dentro de clampPose', () => {
    expect(START_POINTS.map((s) => s.id)).toEqual(['blueUpper', 'blueLower', 'plaps', ...POSTERIOR]);
    const P = START_POINT_POSES.params;
    expect(poseOf(byId('blueUpper'))).toEqual(defaultPose());
    expect(byId('blueUpper').phi).toBe(BLUE_UPPER_POSE.params.phi.value);
    expect(byId('blueLower').phi).toBe(P.blueLowerPhi.value);
    expect(byId('blueLower').z).toBe(P.blueLowerZ.value);
    // el PLAPS es la continuación horizontal del BLUE inferior, más atrás
    expect(byId('plaps').z).toBe(byId('blueLower').z);
    expect(byId('plaps').phi).toBe(P.plapsPhi.value);
    expect(byId('plaps').phi).toBeGreaterThan(byId('blueLower').phi);
    for (const sp of START_POINTS) {
      expect(sp.yaw, sp.id).toBe(0);
      // (decisión 33) en la posición del punto: los de la espalda, sentado; en supino, `clampPose` los deja en el borde
      expect(sp.position, sp.id).toBe(isPosterior(sp.id) ? 'sitting' : undefined);
      expect(clampPose(poseOf(sp), sp.position), sp.id).toEqual(poseOf(sp));
      if (sp.position) expect(clampPose(poseOf(sp)).phi, sp.id).toBeCloseTo(1.2 * Math.PI, 12);
      // de la medioclavicular (decisión 16, `thoraxLines.ts`) hacia atrás, en el hemitórax derecho (φ > π/2)
      expect(sp.phi, sp.id).toBeGreaterThanOrEqual(thoraxLinePhi('midclavicular', scene.torso) - 1e-12);
    }
  });

  it('el BLUE inferior, en el centro del EIC4 de la axilar anterior, y su rango entre los centros del EIC5 y del EIC3 (decisión 39)', () => {
    // la anatomía no se mueve para acomodar un detector: entre las decisiones 28 y 39 estuvo 1,8 mm por encima del centro
    const P = START_POINT_POSES.params;
    const phi = P.blueLowerPhi.value;
    expect(Math.abs(P.blueLowerZ.value - intercostalZ(scene, 4, phi))).toBeLessThan(0.1);
    expect(P.blueLowerZ.range![0]).toBeCloseTo(intercostalZ(scene, 5, phi), 1);
    expect(P.blueLowerZ.range![1]).toBeCloseTo(intercostalZ(scene, 3, phi), 1);
  });

  it('cada punto deja la pleura parietal bajo casi todas las líneas apoyadas, a la profundidad de la pared', () => {
    for (const sp of START_POINTS.filter((s) => !isPosterior(s.id))) {
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
    for (const id of ['blueUpper', 'blueLower', 'plaps', 'posteriorUpper', 'posteriorMiddle'] as const) {
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

  it('los de la espalda (decisión 33): en la paravertebral derecha, en el centro de su EIC y con la pleura bajo la pared posterior', () => {
    const P = POSTERIOR_START_POSES.params;
    const pv = thoraxLinePhi('paravertebral', scene.torso, -1);
    const ics: Record<(typeof POSTERIOR)[number], [number, number]> = {
      posteriorUpper: [P.upperZ.value, 3],
      posteriorMiddle: [P.middleZ.value, 8],
      posteriorBasal: [P.basalZ.value, 10],
    };
    for (const id of POSTERIOR) {
      const sp = byId(id);
      const [z, n] = ics[id];
      expect(sp.phi, id).toBeCloseTo(pv, 12);
      expect(sp.z, id).toBe(z);
      // el centro del EIC de la parrilla (redondeado a 0,1 mm) y, el rango declarado, entre los centros de sus costillas
      expect(Math.abs(z - intercostalZ(scene, n, pv)), id).toBeLessThan(0.1);
      const range = Object.values(P).find((q) => q.value === z)!.range!;
      expect(range[1], id).toBeCloseTo(ribZ(scene, n, pv), 1);
      expect(range[0], id).toBeCloseTo(ribZ(scene, n + 1, pv), 1);
      // la pleura bajo la pared posterior (decisión 29: 28–32 mm de la piel a la costilla, más la costilla y la fascia), con la
      // sonda hundida; todas las líneas apoyan en la espalda plana
      const { scans, coupled } = view(id);
      expect(coupled.length, id).toBe(scans.length);
      const withPleura = coupled.filter((s) => s.pleuraMm !== null);
      for (const s of withPleura) {
        expect(s.pleuraMm!, id).toBeGreaterThan(24);
        expect(s.pleuraMm!, id).toBeLessThan(38);
      }
      if (id !== 'posteriorBasal') expect(withPleura.length, id).toBe(coupled.length);
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
