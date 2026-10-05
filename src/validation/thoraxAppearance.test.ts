import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { AnatomyScene } from '../anatomy/scene';
import { thoraxLinePhi, type ThoraxLine } from '../anatomy/thoraxLines';
import { clavicleTopZ, COVERAGE } from '../app/coverage';
import { torsoDepth, torsoSkinPoint } from '../anatomy/primitives';
import { dist, dot, sub, type Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';
import { PhysiologyEngine } from '../physiology/engine';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, defaultPose, pointOnLine } from '../probe/probe';
import { HumanTorso, humanTorsoMeshes, raisedArmNodes } from '../ui/thorax/humanTorso';
import { ConvexProbe, convexHousingMesh, convexLensMesh, convexMarkerLocal, cablePath } from '../ui/thorax/convexProbe';
import { patientToView, probeViewAxes, SCAN_LIMITS, tubeMesh, viewToPatient, type MeshData } from '../ui/thorax/geometry';

const scene = new AnatomyScene(defaultPatient());
const tr = CONVEX_C35;
const sample = new PhysiologyEngine(defaultPatient()).sample;
function acquisition(changes = {}) {
  const pose = { ...defaultPose(), ...changes };
  return {
    pose,
    frame: probeContact(pose, tr, scene.torso).frame,
    sample,
    respiratoryPattern: 'quiet' as const,
    position: 'supine' as const,
  };
}
function checkMesh(data: MeshData): void {
  expect(data.positions.every(Number.isFinite)).toBe(true);
  expect(Math.max(...data.indices)).toBeLessThan(data.positions.length / 3);
  expect(Math.min(...data.indices)).toBeGreaterThanOrEqual(0);
  let minArea = Infinity;
  const p = (i: number) => new Vector3(...data.positions.slice(i * 3, i * 3 + 3));
  for (let i = 0; i < data.indices.length; i += 3) {
    const a = p(data.indices[i]);
    const b = p(data.indices[i + 1]);
    const c = p(data.indices[i + 2]);
    minArea = Math.min(minArea, b.sub(a).cross(c.sub(a)).length());
  }
  // Umbral numérico de no degeneración, no objetivo de fidelidad humana.
  expect(minArea).toBeGreaterThan(1e-12);
}

describe('Maniquí procedural: geometría real, contacto e historial', () => {
  it('determinista, sin degeneración y dentro del presupuesto de complejidad', () => {
    const data = humanTorsoMeshes(scene);
    expect(humanTorsoMeshes(scene)).toEqual(data);
    for (const m of [data.skin, ...data.context]) checkMesh(m);
    const probe = new ConvexProbe(tr);
    let triangles = 0;
    probe.root.traverse((m) => {
      if ('geometry' in m) triangles += (m as typeof probe.lens).geometry.index!.count / 3;
    });
    triangles += probe.cable.geometry.index!.count / 3;
    expect([data.skin, ...data.context].reduce((n, m) => n + m.indices.length / 3, triangles)).toBeLessThanOrEqual(18_000);
    probe.dispose();
  });
  it('piel funcional coincide con el motor; frente y laterales no tienen otra piel decorativa encima', () => {
    const data = humanTorsoMeshes(scene);
    for (let i = 0; i < data.skin.positions.length; i += 3) {
      const p = viewToPatient(data.skin.positions.slice(i, i + 3) as Vec3);
      expect(Math.abs(torsoDepth(p, scene.torso))).toBeLessThan(1e-8);
    }
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    human.root.updateMatrixWorld(true);
    // Exterior -> torso a z=0: la piel es el primer objeto. Los brazos se mantienen despejados.
    for (const phi of [0, Math.PI / 2, Math.PI]) {
      const p = patientToView(torsoSkinPoint(phi, 0, scene.torso));
      const dir = new Vector3(p[0], 0, p[2]).normalize();
      const ray = new Raycaster(new Vector3(...p).addScaledVector(dir, 0.1), dir.negate());
      expect(ray.intersectObjects([human.skin, ...human.occluders], false)[0].object).toBe(human.skin);
    }
    human.dispose();
    mat.dispose();
  });
  it('normales finitas y unitarias; la cabeza ocluye, no se selecciona a través de ella', () => {
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    for (const m of [human.skin, ...human.occluders]) {
      const n = m.geometry.getAttribute('normal');
      for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    }
    human.root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0.39, 0.5), new Vector3(0, 0, -1));
    expect(ray.intersectObjects([human.skin, ...human.occluders], false)[0].object).toBe(human.occluders[0]);
    human.dispose();
    mat.dispose();
  });
  it('las uniones con hombros y abdomen comparten posiciones y normales, incluso con contacto en el borde', () => {
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    for (const pose of [
      { z: 0, lift: 25 },
      { z: SCAN_LIMITS.zMax, lift: -3 },
      { z: SCAN_LIMITS.zMin, lift: -3 },
    ]) {
      human.update(acquisition(pose), tr);
      const pos = human.skin.geometry.getAttribute('position');
      const n = human.skin.geometry.getAttribute('normal');
      for (const [index, first] of [
        [0, false],
        [1, true],
      ] as const) {
        const g = human.occluders[index].geometry;
        const cp = g.getAttribute('position');
        const cn = g.getAttribute('normal');
        const row = first ? 0 : pos.count - 64;
        const contextRow = first ? cp.count - 64 - 1 : 0; // solo el extremo externo tiene centro de tapa
        for (let j = 0; j < 64; j++) {
          const a = row + j;
          const b = contextRow + j;
          expect([cp.getX(b), cp.getY(b), cp.getZ(b)]).toEqual([pos.getX(a), pos.getY(a), pos.getZ(a)]);
          expect([cn.getX(b), cn.getY(b), cn.getZ(b)]).toEqual([n.getX(a), n.getY(a), n.getZ(a)]);
        }
      }
    }
    human.dispose();
    mat.dispose();
  });
  it('contacto histórico, inversa y restauración del vecindario sin regenerar buffers', () => {
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    const geometry = human.skin.geometry;
    const buffer = geometry.getAttribute('position').array;
    const old = acquisition({ lift: -3, rock: 0.2 });
    human.update(old, tr);
    const first = Float32Array.from(buffer);
    const count = human.updates;
    expect(human.warpedVertices).toBeGreaterThan(0);
    expect(human.warpedVertices).toBeLessThan(geometry.getAttribute('position').count / 4);
    human.update(old, tr);
    expect(human.updates).toBe(count);
    for (let i = 0; i < buffer.length; i += 129) {
      const q = viewToPatient([buffer[i], buffer[i + 1], buffer[i + 2]]);
      expect(Math.abs(torsoDepth(human.materialPoint(q), scene.torso))).toBeLessThan(0.001);
    }
    human.update(acquisition({ phi: 0.15 * Math.PI, lift: 20 }), tr);
    human.update(old, tr);
    expect(buffer).toEqual(first);
    expect(human.skin.geometry).toBe(geometry);
    expect(geometry.getAttribute('position').array).toBe(buffer);
    human.dispose();
    mat.dispose();
  });
  it('no acepta una pose histórica combinada con el marco de otro cuadro', () => {
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    const old = acquisition();
    old.frame = acquisition({ phi: 0 }).frame;
    expect(() => human.update(old, tr)).toThrow('contacto distinto');
    human.dispose();
    mat.dispose();
  });
  it('el marco se valida también con pose en caché, sin reemplazar el último contacto válido', () => {
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    const valid = acquisition();
    human.update(valid, tr);
    const updates = human.updates;
    const invalid = { ...valid, frame: { ...valid.frame, axial: [0, 0, 0] as Vec3 } };
    expect(() => human.update(invalid, tr)).toThrow('contacto distinto');
    human.update(valid, tr);
    expect(human.updates).toBe(updates);
    human.dispose();
    mat.dispose();
  });
  it('el selector usado por la UI respeta la primera oclusión y permite agarrar la carcasa sin teletransportar', () => {
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    const probe = new ConvexProbe(tr);
    human.root.updateMatrixWorld(true);
    probe.root.position.set(0, 0.1, 0.3);
    probe.root.updateMatrixWorld(true);
    const headRay = new Raycaster(new Vector3(0, 0.39, 0.5), new Vector3(0, 0, -1));
    expect(human.pick(headRay, probe.root.children)).toBe('blocked');
    const probeRay = new Raycaster(new Vector3(0, 0.16, 0.5), new Vector3(0, 0, -1));
    expect(human.pick(probeRay, probe.root.children)).toBe('probe');
    const point = human.pick(probeRay, probe.root.children, true);
    expect(Array.isArray(point)).toBe(true);
    expect(Math.abs(torsoDepth(point as Vec3, scene.torso))).toBeLessThan(0.001);
    human.dispose();
    probe.dispose();
    mat.dispose();
  });
  it('los brazos levantados (decisión 48): ni la pared lateral, ni la axila, ni la fosa supraclavicular quedan tapadas', () => {
    const mat = new MeshStandardMaterial();
    const human = new HumanTorso(scene, mat, mat);
    human.root.updateMatrixWorld(true);
    const objects = [human.skin, ...human.occluders];
    // la cámara del navegador (`ui/thorax/index.ts`): acimut az y elevación el, ortográfica; se mira el punto de piel desde fuera
    const first = (phi: number, z: number, az: number, el: number) => {
      const dir = new Vector3(-Math.cos(el) * Math.cos(az), -Math.sin(el), -Math.cos(el) * Math.sin(az));
      const p = new Vector3(...patientToView(torsoSkinPoint(phi, z, scene.torso)));
      return new Raycaster(p.addScaledVector(dir, -1.5), dir).intersectObjects(objects, false)[0].object.name;
    };
    const top = SCAN_LIMITS.zMax - 1;
    for (const side of [-1, 1] as const) {
      // la vista lateral, de frente a la axila: cada línea axilar entera, del flanco a la axila y por encima de la 1.ª costilla
      // (antes, con los brazos a los lados, el brazo tapaba la axilar media desde z −63 hacia arriba)
      const lateral = side < 0 ? Math.PI : 0;
      for (const line of ['anteriorAxillary', 'midaxillary', 'posteriorAxillary'] as ThoraxLine[])
        for (const el of [-0.3, 0.1, 0.4])
          for (let z = -150; z <= top; z += 5)
            expect(first(thoraxLinePhi(line, scene.torso, side), z, lateral, el), `${side} ${line} z ${z} el ${el}`).toBe(
              'functional-skin',
            );
      // la fosa supraclavicular, de la clavícula al tope, en la vista anterior y la de «Centrar modelo»
      const x = COVERAGE.params.supraclavicularXMm.value;
      const phi = side < 0 ? Math.PI - Math.acos(x / scene.torso.a) : Math.acos(x / scene.torso.a);
      for (const az of [Math.PI / 2, Math.PI / 2 + 0.55])
        for (let z = clavicleTopZ(scene); z <= top; z += 3) expect(first(phi, z, az, 0.1), `${side} fosa z ${z}`).toBe('functional-skin');
    }
    human.dispose();
    mat.dispose();
  });
  it('los brazos levantados: abducción de 150–180°, la mano detrás de la cabeza y nada fuera del tronco bajo zMax', () => {
    for (const side of [-1, 1] as const) {
      const n = raisedArmNodes(scene.torso.a, side);
      // del hombro (el segundo nodo) al codo (el quinto): el ángulo con la vertical es 180° menos la abducción
      const [sx, , sz] = n[1];
      const [ex, , ez] = n[4];
      const abduction = 180 - (Math.atan2(Math.abs(ex - sx), ez - sz) * 180) / Math.PI;
      expect(abduction).toBeGreaterThan(150);
      expect(abduction).toBeLessThan(180);
      // el codo, por fuera del hombro; la mano, detrás de la cabeza (por detrás del plano coronal) y cerca de la línea media
      expect(Math.abs(ex)).toBeGreaterThan(Math.abs(sx));
      const hand = n[n.length - 2];
      expect(hand[1]).toBeLessThan(-80);
      expect(Math.abs(hand[0])).toBeLessThan(30);
      expect(hand[2]).toBeGreaterThan(SCAN_LIMITS.zMax + 200);
    }
    const data = humanTorsoMeshes(scene);
    for (const arm of data.context.slice(2)) {
      checkMesh(arm);
      for (let i = 0; i < arm.positions.length; i += 3) {
        const p = viewToPatient(arm.positions.slice(i, i + 3) as Vec3);
        // bajo el tope de la piel explorable, el brazo solo existe dentro del tronco (su raíz): nunca sobre la piel
        if (p[2] < SCAN_LIMITS.zMax) expect(torsoDepth(p, scene.torso)).toBeLessThan(0);
      }
    }
  });
  it('el tubo de los brazos tiene sus caras hacia fuera (el material es de una sola cara)', () => {
    const tube = tubeMesh(
      [
        [0, 0, 0, 10],
        [0, 0, 100, 10],
        [50, 0, 150, 10],
      ],
      4,
      12,
    );
    checkMesh(tube);
    const v = (i: number) => new Vector3(...tube.positions.slice(i * 3, i * 3 + 3));
    // en el tramo recto (eje z del paciente, y de la vista), la normal de cada cara apunta lejos del eje
    for (let k = 0; k < 4 * 12 * 6; k += 3) {
      const [a, b, c] = [v(tube.indices[k]), v(tube.indices[k + 1]), v(tube.indices[k + 2])];
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      const centroid = a.clone().add(b).add(c).divideScalar(3);
      expect(normal.dot(new Vector3(centroid.x, 0, centroid.z))).toBeGreaterThan(0);
    }
  });
  it('veinte reconstrucciones liberan una vez cada geometría propia', () => {
    const mat = new MeshStandardMaterial();
    for (let i = 0; i < 20; i++) {
      const human = new HumanTorso(scene, mat, mat);
      const probe = new ConvexProbe(tr);
      let resources = 0;
      let disposed = 0;
      for (const group of [human.root, probe.root])
        group.traverse((m) => {
          if ('geometry' in m) {
            resources++;
            (m as typeof probe.lens).geometry.addEventListener('dispose', () => disposed++);
          }
        });
      probe.cable.geometry.addEventListener('dispose', () => disposed++);
      resources++;
      human.dispose();
      probe.dispose();
      expect(disposed).toBe(resources);
    }
    mat.dispose();
  });
});

describe('Sonda convexa: lente física y carcasa independiente', () => {
  it('lente y carcasa válidas; la cara activa no se reduce al ancho nominal', () => {
    checkMesh(convexLensMesh(tr));
    checkMesh(convexHousingMesh(tr));
    const x = convexLensMesh(tr).positions.filter((_, i) => i % 3 === 0);
    expect(1000 * (Math.max(...x) - Math.min(...x))).toBeCloseTo(2 * tr.curvatureRadius * Math.sin(tr.halfSector), 8);
    const hx = convexHousingMesh(tr).positions.filter((_, i) => i % 3 === 0);
    expect(Math.max(...hx)).toBeGreaterThan(Math.max(...x));
  });
  it('lente local transformada coincide con pointOnLine en ambos lados y al inclinar', () => {
    const lens = convexLensMesh(tr, 24);
    for (const phi of [0.15 * Math.PI, 0.7 * Math.PI, 1.15 * Math.PI]) {
      const { frame } = acquisition({ phi, yaw: 0.4, rock: -0.3, tilt: 0.2, lift: -3 });
      const axes = probeViewAxes(frame);
      const origin = patientToView(frame.face);
      for (let i = 0; i <= 24; i++) {
        const v: Vec3 = [lens.positions[6 * i], lens.positions[6 * i + 1], 0];
        const world = viewToPatient([0, 1, 2].map((k) => origin[k] + axes.x[k] * v[0] + axes.y[k] * v[1]) as Vec3);
        expect(dist(world, pointOnLine(frame, tr, -tr.halfSector + (2 * tr.halfSector * i) / 24, 0))).toBeLessThan(1e-8);
      }
      expect(convexMarkerLocal(tr)[0]).toBeGreaterThan(0);
    }
  });
  it('cable conectado, tangente proximal hacia fuera y determinismo sin cámara', () => {
    for (const rock of [-0.7, 0, 0.7]) {
      const { frame } = acquisition({ rock });
      const path = cablePath(frame, tr);
      expect(cablePath(frame, tr)).toEqual(path);
      expect(dot(sub(path[1], path[0]), frame.axial)).toBeLessThan(0);
      const probe = new ConvexProbe(tr);
      const g = probe.cable.geometry;
      const a = g.getAttribute('position').array;
      probe.updateCable(frame);
      expect(a.every(Number.isFinite)).toBe(true);
      const first = Float32Array.from(a);
      probe.updateCable(frame);
      expect(a).toEqual(first);
      expect(probe.cable.geometry).toBe(g);
      probe.dispose();
    }
  });
});
