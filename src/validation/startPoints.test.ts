import { describe, expect, it } from 'vitest';
import { START_POINTS, START_POINT_POSES, type StartPoint } from '../app/startPoints';
import { AnatomyScene } from '../anatomy/scene';
import { defaultPatient } from '../physiology/patientState';
import { contactCoupling } from '../probe/contact';
import { BLUE_UPPER_POSE, CONVEX_C35, clampPose, defaultPose, lineAngle, type ProbePose } from '../probe/probe';
import { chestView, ribShadows, scanView } from './support/chestView';

/**
 * Puntos de partida del tórax (decisión 12; el arnés de `startPoints.test.ts` de VExUS, que comprobaba que cada
 * ventana corta lo que promete su texto sin afinar la sonda). Con la sonda apoyada con su contacto y en fin de
 * espiración (`chestView`), cada punto BLUE deja bajo la sonda la pleura parietal y el pulmón que la toca, y los que
 * prometen costillas las tienen en el plano con su sombra y la pleura entre ellas (el signo del murciélago; en el
 * punto superior no lo hay hasta que el paso C traiga las costillas 2.ª–4.ª, limitación `ribs-5-10-only`). Las
 * poses son las de su evidencia (`START_POINT_POSES`, `BLUE_UPPER_POSE`) y ninguna la recorta `clampPose`.
 */
const scene = new AnatomyScene(defaultPatient());
const poseOf = (sp: StartPoint): ProbePose => ({ phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 });
const byId = (id: StartPoint['id']) => START_POINTS.find((s) => s.id === id)!;

function view(id: StartPoint['id']) {
  const v = chestView(scene, poseOf(byId(id)));
  const scans = scanView(v, 4);
  const coupled = scans.filter((s) => contactCoupling(v.contact, s.theta) > 0.95);
  return { v, scans, coupled, shadows: ribShadows(scans) };
}

describe('Puntos de partida del tórax (decisión 12)', () => {
  it('son los tres del protocolo BLUE derecho, con sus poses declaradas, marcador craneal y dentro de clampPose', () => {
    expect(START_POINTS.map((s) => s.id)).toEqual(['blueUpper', 'blueLower', 'plaps']);
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
      expect(clampPose(poseOf(sp)), sp.id).toEqual(poseOf(sp));
      // de la medioclavicular (3π/4) hacia atrás, en el hemitórax derecho (φ > π/2)
      expect(sp.phi, sp.id).toBeGreaterThanOrEqual(0.75 * Math.PI);
    }
  });

  it('cada punto deja la pleura parietal bajo casi todas las líneas apoyadas, a la profundidad de la pared', () => {
    for (const sp of START_POINTS) {
      const { scans, coupled } = view(sp.id);
      const tag = `${sp.id}: ${coupled.length} de ${scans.length} líneas apoyadas`;
      // la mitad del sector como mínimo apoya en el tórax curvo (en la medioclavicular el borde craneal no)
      expect(coupled.length, tag).toBeGreaterThan(0.5 * scans.length);
      const withPleura = coupled.filter((s) => s.pleuraMm !== null);
      expect(withPleura.length, tag).toBe(coupled.length);
      // la pleura, bajo la pared heredada (piel, grasa y músculo de 28 mm en la métrica radial, sonda hundida)
      for (const s of withPleura) {
        expect(s.pleuraMm!, tag).toBeGreaterThan(15);
        expect(s.pleuraMm!, tag).toBeLessThan(40);
      }
    }
  });

  it('el punto BLUE inferior y el PLAPS cortan costillas con su sombra y la pleura entre ellas (signo del murciélago)', () => {
    for (const id of ['blueLower', 'plaps'] as const) {
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
      // la línea costal por encima de la pleura (el murciélago: las costillas, la pleura más honda entre ellas)
      const pleura = between.map((s) => s.pleuraMm!).reduce((x, y) => x + y, 0) / between.length;
      for (const sh of shadows) expect(sh.ribTopMm, tag).toBeLessThan(pleura);
    }
  });

  it('las líneas de la pleura de cada punto son las del sector (el contacto se mide en los ángulos de las líneas)', () => {
    const { scans } = view('blueUpper');
    expect(scans.map((s) => s.theta)).toEqual(Array.from({ length: scans.length }, (_, i) => lineAngle(i * 4, CONVEX_C35)));
  });
});
