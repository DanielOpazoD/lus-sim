import { describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { clavicleSd, ribSd, scapulaSd } from '../anatomy/organs/ribcage';
import { torsoDepth, torsoSkinPoint } from '../anatomy/primitives';
import { cross, dist, dot, sub, type Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, defaultPose, pointOnLine, probeFrame } from '../probe/probe';
import {
  clavicleMesh,
  footprintMesh,
  housingMarkerPoint,
  markerPoint,
  nudgePose,
  patientToView,
  probeViewAxes,
  ribMesh,
  scanArc,
  scapulaMesh,
  SCAN_LIMITS,
  sectorMesh,
  skinMesh,
  surfacePose,
  viewToPatient,
} from '../ui/thorax/geometry';

const scene = new AnatomyScene(defaultPatient());
const tr = CONVEX_C35;
const vertices = (positions: number[]) => {
  const out: Vec3[] = [];
  for (let i = 0; i < positions.length; i += 3) out.push(viewToPatient(positions.slice(i, i + 3) as Vec3));
  return out;
};

describe('Navegador del tórax: coordenadas y dominio real de adquisición', () => {
  it('conserva lateralidad, orientación craneal y mm↔m sin modificar distancias', () => {
    expect(patientToView([-160, 105, 200])).toEqual([-0.16, 0.2, 0.105]);
    const p: Vec3 = [-132.45, 91.28, -123.1];
    expect(dist(viewToPatient(patientToView(p)), p)).toBeLessThan(1e-10);
    expect(dist(patientToView(p), patientToView([0, 0, 0]))).toBeCloseTo(dist(p, [0, 0, 0]) / 1000, 12);
  });

  it('ida y vuelta de la piel por todo el arco, incluidas sus dos fronteras', () => {
    const base = { ...defaultPose(), yaw: 0.4, rock: -0.2, tilt: 0.1, lift: -1 };
    for (let i = 0; i <= 40; i++) {
      const phi = SCAN_LIMITS.phiMin + ((SCAN_LIMITS.phiMax - SCAN_LIMITS.phiMin) * i) / 40;
      for (const z of [SCAN_LIMITS.zMin, -80, 0, 83.7, SCAN_LIMITS.zMax]) {
        const expected = torsoSkinPoint(phi, z, scene.torso);
        const result = surfacePose(expected, scene.torso, base)!;
        expect(result, `phi=${phi}, z=${z}`).not.toBeNull();
        expect(dist(torsoSkinPoint(result.phi, result.z, scene.torso), expected)).toBeLessThan(1e-6);
        expect(result.yaw).toBeCloseTo(base.yaw, 12);
        expect([result.rock, result.tilt, result.lift]).toEqual([base.rock, base.tilt, base.lift]);
      }
    }
  });

  it('cruza π sin saltar de hemitórax y llega al PLAPS derecho', () => {
    let pose = { ...defaultPose(), phi: Math.PI - 0.02 };
    for (const phi of [Math.PI - 0.01, Math.PI, Math.PI + 0.01, 1.15 * Math.PI]) {
      pose = surfacePose(torsoSkinPoint(phi, 50, scene.torso), scene.torso, pose)!;
      expect(pose.phi).toBeCloseTo(phi, 12);
      expect(Math.cos(pose.phi)).toBeLessThan(0);
    }
  });

  it('rechaza espalda media, extremos verticales no disponibles y puntos no finitos', () => {
    const base = defaultPose();
    expect(surfacePose(torsoSkinPoint(1.5 * Math.PI, 50, scene.torso), scene.torso, base)).toBeNull();
    expect(surfacePose(torsoSkinPoint(0, SCAN_LIMITS.zMax + 1, scene.torso), scene.torso, base)).toBeNull();
    expect(surfacePose(torsoSkinPoint(0, -201, scene.torso), scene.torso, base)).toBeNull();
    expect(surfacePose([NaN, 0, 0], scene.torso, base)).toBeNull();
  });

  it('sentado (decisión 33) la sonda llega a toda la espalda, con la línea media posterior como corte, y la altura no cambia', () => {
    expect(scanArc('supine')).toEqual({ phiMin: SCAN_LIMITS.phiMin, phiMax: SCAN_LIMITS.phiMax });
    expect(scanArc('sitting')).toEqual({ phiMin: -Math.PI / 2, phiMax: 1.5 * Math.PI });
    let pose = { ...defaultPose(), phi: 1.15 * Math.PI };
    // del PLAPS derecho por la espalda derecha hasta la línea media posterior
    for (const phi of [1.2 * Math.PI, 1.3776 * Math.PI, 1.49 * Math.PI]) {
      if (phi > SCAN_LIMITS.phiMax + 1e-9)
        expect(surfacePose(torsoSkinPoint(phi, 50, scene.torso), scene.torso, pose), `supino ${phi}`).toBeNull();
      pose = surfacePose(torsoSkinPoint(phi, 50, scene.torso), scene.torso, pose, 'sitting')!;
      expect(pose.phi).toBeCloseTo(phi, 12);
      expect(pose.z).toBeCloseTo(50, 9);
    }
    // al otro lado del corte, la espalda izquierda (φ cerca de −π/2), hasta el PLAPS izquierdo
    for (const phi of [-0.49 * Math.PI, -0.3 * Math.PI, -0.15 * Math.PI]) {
      pose = surfacePose(torsoSkinPoint(phi, 50, scene.torso), scene.torso, pose, 'sitting')!;
      expect(pose.phi).toBeCloseTo(phi, 12);
    }
    expect(surfacePose(torsoSkinPoint(0, SCAN_LIMITS.zMax + 1, scene.torso), scene.torso, pose, 'sitting')).toBeNull();
    // el paso de los botones cruza la línea media posterior sentado; en supino se queda en el borde
    const back = { ...defaultPose(), phi: 1.49 * Math.PI };
    expect(nudgePose(back, scene.torso, 20, 0, 0, 'sitting').phi).toBeCloseTo(1.49 * Math.PI + 20 / scene.torso.a - 2 * Math.PI, 2);
    expect(nudgePose(back, scene.torso, 20).phi).toBe(SCAN_LIMITS.phiMax);
  });

  it('la malla de selección pertenece a la misma piel que el modelo acústico', () => {
    const mesh = skinMesh(scene.torso);
    for (const p of vertices(mesh.positions)) expect(Math.abs(torsoDepth(p, scene.torso))).toBeLessThan(1e-8);
    expect(Math.max(...mesh.indices)).toBeLessThan(mesh.positions.length / 3);
  });

  it('el control alternativo respeta límites y usa mm de arco en vez de una velocidad angular fija', () => {
    const front = { ...defaultPose(), phi: Math.PI / 2 };
    const lateral = { ...front, phi: Math.PI };
    expect(nudgePose(front, scene.torso, 5).phi - front.phi).toBeCloseTo(5 / scene.torso.a, 12);
    expect(nudgePose(lateral, scene.torso, 5).phi - lateral.phi).toBeCloseTo(5 / scene.torso.b, 12);
    const edge = nudgePose({ ...front, phi: SCAN_LIMITS.phiMax, z: SCAN_LIMITS.zMax }, scene.torso, 5, 5);
    expect([edge.phi, edge.z]).toEqual([SCAN_LIMITS.phiMax, SCAN_LIMITS.zMax]);
    expect(nudgePose(front, scene.torso, 0, 0, Math.PI / 6).yaw).toBeCloseTo(Math.PI / 6, 12);
  });
});

describe('Navegador del tórax: transductor, marcador y costillas compartidos', () => {
  it('el indicador de carcasa queda fuera de la piel, en el lado del marcador, al comprimir e inclinar', () => {
    for (const phi of [0, 0.3 * Math.PI, 0.7 * Math.PI, 1.15 * Math.PI]) {
      for (const rock of [-0.7, 0, 0.7])
        for (const tilt of [-0.7, 0, 0.7]) {
          const frame = probeContact({ ...defaultPose(), phi, lift: -6, rock, tilt }, tr, scene.torso).frame;
          const p = housingMarkerPoint(frame, tr);
          expect(torsoDepth(p, scene.torso)).toBeGreaterThan(4.5);
          expect(dot(sub(p, frame.face), frame.lateral)).toBeGreaterThan(0);
        }
    }
  });

  it('base visual dextrógira, ortonormal y con el eje x hacia el marcador en ambos hemitórax', () => {
    for (const phi of [0, 0.3 * Math.PI, 0.7 * Math.PI, 1.15 * Math.PI]) {
      const frame = probeContact({ ...defaultPose(), phi, yaw: 0.5, rock: 0.2, tilt: -0.3 }, tr, scene.torso).frame;
      const axes = probeViewAxes(frame);
      expect(dot(cross(axes.x, axes.y), axes.z)).toBeCloseTo(1, 12);
      expect(dot(axes.x, axes.y)).toBeCloseTo(0, 12);
      expect(dot(axes.z, axes.y)).toBeCloseTo(0, 12);
      expect(dot(axes.x, sub(patientToView(markerPoint(frame, tr)), patientToView(frame.face)))).toBeGreaterThan(0);
    }
  });

  it('huella y sector nacen del marco efectivo comprimido, con marcador en el borde +theta del modo B', () => {
    const pose = { ...defaultPose(), lift: -3, rock: 0.1 };
    const nominal = probeFrame(pose, scene.torso, tr);
    const effective = probeContact(pose, tr, scene.torso).frame;
    expect(dist(nominal.face, effective.face)).toBeGreaterThan(1);
    const sector = vertices(sectorMesh(effective, tr, 120).positions);
    expect(dist(sector[40], effective.face)).toBeLessThan(1e-8);
    expect(dist(sector[41], pointOnLine(effective, tr, 0, 120))).toBeLessThan(1e-8);
    expect(dist(sector[80], markerPoint(effective, tr))).toBeLessThan(1e-8);
    const face = vertices(footprintMesh(effective, tr).positions);
    const center = face[24].map((v, i) => (v + face[25][i]) / 2) as Vec3;
    expect(dist(center, effective.face)).toBeLessThan(1e-8);
    expect(dist(face[24], face[25])).toBeCloseTo(tr.elevationMm, 8);
  });

  it('la superficie costal visual coincide con la clasificación de las 24 costillas en reposo', () => {
    // Superficie de cada anillo, no solo una línea central decorativa. Tolerancia de teselación/inversa, en mm.
    for (let index = 0; index < scene.ribs.length; index++) {
      const mesh = ribMesh(scene, index, 16);
      const points = vertices(mesh.positions);
      for (const p of points.slice(8, -8))
        expect(Math.abs(ribSd(p, index, scene.torso, scene.ribCage)), `costilla ${index}: ${p.join(', ')}`).toBeLessThan(0.02);
      expect(Math.max(...mesh.indices)).toBeLessThan(points.length);
    }
  });

  it('las clavículas y las escápulas visuales (decisión 33) son las de la clasificación en reposo', () => {
    const sc = scene.ribCage.scapula;
    for (const side of [-1, 1] as const) {
      const clavicle = clavicleMesh(scene, side);
      const cp = vertices(clavicle.positions);
      for (const p of cp) {
        expect(Math.sign(p[0]), `clavícula ${side}`).toBe(side);
        expect(Math.abs(clavicleSd(p, scene.torso, scene.ribCage)), `clavícula ${side}: ${p.join(', ')}`).toBeLessThan(0.02);
      }
      expect(Math.max(...clavicle.indices)).toBeLessThan(cp.length);
      // la lámina: cada vértice en su mitad, dentro (en el contorno, sobre él; lejos del contorno, a media lámina de las dos caras)
      const scapula = scapulaMesh(scene, side);
      const sp = vertices(scapula.positions);
      let mid = 0;
      for (const p of sp) {
        expect(Math.sign(p[0]), `escápula ${side}`).toBe(side);
        expect(p[1], `escápula ${side}`).toBeLessThan(0);
        const d = scapulaSd(p, scene.torso, scene.ribCage);
        expect(d, `escápula ${side}: ${p.join(', ')}`).toBeLessThan(0.02);
        expect(d, `escápula ${side}: ${p.join(', ')}`).toBeGreaterThan(-0.5 * sc.thickness - 0.02);
        if (Math.abs(d + 0.5 * sc.thickness) < 0.02) mid++;
      }
      expect(mid, `escápula ${side}`).toBeGreaterThan(0.5 * sp.length);
      expect(Math.max(...scapula.indices)).toBeLessThan(sp.length);
    }
  });
});
