import { BufferGeometry, Float32BufferAttribute, Group, Mesh, type MeshStandardMaterial, type Object3D, type Raycaster } from 'three';
import { compressionSample } from '../../anatomy/compression';
import { RespiratoryDeformation } from '../../anatomy/deformation';
import type { AnatomyScene } from '../../anatomy/scene';
import { dist, type Vec3 } from '../../core/vec3';
import { probeContact } from '../../probe/contact';
import type { ProbeFrame, Transducer } from '../../probe/probe';
import type { AcquisitionState } from '../../ultrasound/cine';
import {
  loftMesh,
  patientToView,
  SCAN_LIMITS,
  tubeMesh,
  viewToPatient,
  type MeshData,
  type TubeNode,
  type VisualProfile,
} from './geometry';

/** Altura de referencia de la cabeza (mm): el tope de la piel explorable hasta la decisión 47. La cabeza no sube con él. */
const HEAD_BASE_MM = 200;

/**
 * Los brazos levantados, con las manos detrás de la cabeza (lus-sim, decisión 48): la postura de la exploración lateral en supino,
 * con los brazos fuera del camino de la sonda (Koenig y cols. 2020, sin más detalle). El hombro en abducción de ≈ 163° (del hombro
 * al codo, 16,7° de la vertical), el codo doblado y la mano tras el occipucio son elecciones de autoría. Un lado: −1 derecho, 1 izquierdo. Nodos de AUTORÍA visual en mm
 * del paciente; la raíz queda dentro del tronco y lo que asoma empieza sobre `zMax`: el brazo nunca tapa la piel explorable, la
 * axila incluida.
 */
export function raisedArmNodes(a: number, side: -1 | 1): TubeNode[] {
  return [
    [side * (a - 35), -12, 250, 22],
    [side * (a + 2), -14, 278, 44],
    [side * (a + 30), -18, 360, 42],
    [side * (a + 62), -30, 470, 37],
    [side * (a + 70), -45, 505, 34],
    [side * 130, -80, 520, 31],
    [side * 60, -100, 500, 26],
    [side * 18, -95, 488, 22],
    [side * 4, -95, 484, 8],
  ];
}

/** Medidas de AUTORÍA visual del maniquí, no antropometría ni nuevos parámetros del paciente. */
export function humanTorsoMeshes(scene: AnatomyScene): { skin: MeshData; context: MeshData[] } {
  const { a, b } = scene.torso;
  const { zMin, zMax } = SCAN_LIMITS;
  const H = HEAD_BASE_MM;
  // La piel explorable conserva exactamente la elipse del motor, con altura suficiente para mostrar contacto.
  const skin = loftMesh(
    [
      [zMin, a, b, 0, 0],
      [zMax, a, b, 0, 0],
    ],
    48,
    64,
    false,
  );
  // decisión 48: sin el hombro de los brazos a los lados, la elipse sigue un poco sobre zMax (la sonda en el borde se apoya en
  // piel) y baja por el trapecio al cuello; la cabeza, donde estaba
  const upper: VisualProfile[] = [
    [zMax, a, b, 0, 0],
    [zMax + 14, a, b, 0, 0],
    [H + 62, a * 0.86, b * 0.86, 0, -3],
    [H + 82, 55, 46, 0, -8],
    [H + 112, 43, 39, 0, -8],
    [H + 132, 48, 47, 0, 4],
    [H + 151, 58, 65, 0, 6],
    [H + 192, 70, 79, 0, -3],
    [H + 234, 73, 80, 0, -8],
    [H + 276, 59, 68, 0, -10],
    [H + 308, 39, 46, 0, -12],
    [H + 324, 3, 4, 0, -12],
  ];
  const lower: VisualProfile[] = [
    [zMin - 105, a * 0.86, b * 0.9, 0, -1],
    [zMin - 80, a * 0.88, b * 0.94, 0, -1],
    [zMin - 40, a * 0.94, b * 0.97, 0, 0],
    [zMin - 12, a, b, 0, 0],
    [zMin, a, b, 0, 0],
  ];
  const arms = ([-1, 1] as const).map((side) => tubeMesh(raisedArmNodes(a, side), 5, 20));
  const head = loftMesh(upper, 3, 64, [false, true]);
  // Relieve facial mínimo del maniquí: nariz/mentón orientan el frente sin textura ni identidad humana.
  // Solo contexto por encima de zMax: no mueve piel explorada ni representa una estructura acústica.
  for (let i = 0; i < head.positions.length; i += 3) {
    const z = head.positions[i + 1] * 1000 - H;
    const x = head.positions[i] * 1000;
    if (head.positions[i + 2] > 0 && z > 132)
      head.positions[i + 2] +=
        (0.018 * Math.exp(-(((z - 203) / 18) ** 2)) + 0.005 * Math.exp(-(((z - 145) / 13) ** 2))) * Math.exp(-((x / 17) ** 2));
  }
  return { skin, context: [head, loftMesh(lower, 3, 64, [true, false]), ...arms] };
}

/** Geometría con propietario; atributos estables durante el movimiento. */
function mesh(data: MeshData, material: MeshStandardMaterial): Mesh<BufferGeometry, MeshStandardMaterial> {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  g.setIndex(data.indices);
  g.computeVertexNormals();
  return new Mesh(g, material);
}

/** Solo representa el contacto del cuadro mostrado; nunca escribe en sim.anatomy ni crea otro reloj. */
export class HumanTorso {
  readonly root = new Group();
  readonly skin: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly occluders: Mesh<BufferGeometry, MeshStandardMaterial>[];
  readonly deformation: RespiratoryDeformation;
  private readonly surfaces: Array<{ mesh: Mesh<BufferGeometry, MeshStandardMaterial>; base: Float32Array; changed: number[] }>;
  private readonly seams: Array<Array<{ geometry: BufferGeometry; vertex: number }>>;
  private poseKey = '';
  private expectedFrame: ProbeFrame | null = null;
  private acquisition: AcquisitionState | null = null;
  updates = 0;
  warpedVertices = 0;

  constructor(
    readonly scene: AnatomyScene,
    skinMaterial: MeshStandardMaterial,
    contextMaterial: MeshStandardMaterial,
  ) {
    const data = humanTorsoMeshes(scene);
    this.skin = mesh(data.skin, skinMaterial);
    this.skin.name = 'functional-skin';
    this.occluders = data.context.map((d) => mesh(d, contextMaterial));
    this.occluders.forEach((m, i) => {
      m.name = ['head-shoulders', 'abdomen-end', 'right-arm', 'left-arm'][i];
    });
    this.root.add(this.skin, ...this.occluders);
    // Las uniones comparten posición y normal, pero no material: Costillas no vuelve transparente la cabeza.
    const shared = new Map<string, Array<{ geometry: BufferGeometry; vertex: number }>>();
    for (const m of [this.skin, ...this.occluders.slice(0, 2)]) {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        if (Math.min(Math.abs(p.getY(i) - SCAN_LIMITS.zMin / 1000), Math.abs(p.getY(i) - SCAN_LIMITS.zMax / 1000)) > 1e-7) continue;
        const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(7)).join('|');
        const group = shared.get(key) ?? [];
        group.push({ geometry: m.geometry, vertex: i });
        shared.set(key, group);
      }
    }
    this.seams = [...shared.values()].filter((group) => group.length > 1);
    this.smoothSeams();
    this.deformation = new RespiratoryDeformation(scene);
    // También los bordes de contexto: así la compresión en zMin/zMax no abre una costura.
    this.surfaces = [this.skin, ...this.occluders].map((m) => ({
      mesh: m,
      base: Float32Array.from(m.geometry.getAttribute('position').array),
      changed: [],
    }));
  }

  update(acquisition: AcquisitionState, transducer: Transducer): void {
    const p = acquisition.pose;
    const key = [p.phi, p.z, p.lift, p.yaw, p.rock, p.tilt, transducer.curvatureRadius, transducer.halfSector, transducer.elevationMm].join(
      '|',
    );
    const contact = key === this.poseKey ? null : probeContact(acquisition.pose, transducer, this.scene.torso);
    const expected = contact?.frame ?? this.expectedFrame;
    // el marco mostrado es el de la pose trasladado lo que movió la sonda la mano del operador (decisión 39): se deshace
    const d = acquisition.operatorMm ?? [0, 0, 0];
    const f = acquisition.frame;
    const shown = {
      face: [f.face[0] - d[0], f.face[1] - d[1], f.face[2] - d[2]] as Vec3,
      axial: f.axial,
      lateral: f.lateral,
      elevation: f.elevation,
    };
    if (!expected || (['face', 'axial', 'lateral', 'elevation'] as const).some((axis) => dist(expected[axis], shown[axis]) > 1e-5))
      throw new Error('Navegador: contacto distinto al cuadro mostrado');
    this.acquisition = acquisition;
    if (!contact) return;
    this.poseKey = key;
    this.expectedFrame = expected;
    this.deformation.compression = contact;
    this.warpedVertices = 0;
    for (const surface of this.surfaces) {
      const attr = surface.mesh.geometry.getAttribute('position');
      const array = attr.array as Float32Array;
      for (const i of surface.changed) array.set(surface.base.subarray(i, i + 3), i);
      surface.changed.length = 0;
      for (let i = 0; i < surface.base.length; i += 3) {
        const p = viewToPatient([surface.base[i], surface.base[i + 1], surface.base[i + 2]]);
        // Si s(q)=0, q ya es la raíz única de la recompresión monótona. No se hacen 60 iteraciones allí.
        if (compressionSample(p, contact).shift === 0) continue;
        const q = this.deformation.toWorld(p, acquisition.sample.resp);
        array.set(patientToView(q), i);
        surface.changed.push(i);
        this.warpedVertices++;
      }
      attr.needsUpdate = true;
      surface.mesh.geometry.computeVertexNormals();
      surface.mesh.geometry.computeBoundingSphere();
    }
    this.smoothSeams();
    this.updates++;
  }

  private smoothSeams(): void {
    for (const group of this.seams) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const { geometry, vertex } of group) {
        const n = geometry.getAttribute('normal');
        x += n.getX(vertex);
        y += n.getY(vertex);
        z += n.getZ(vertex);
      }
      const length = Math.hypot(x, y, z);
      for (const { geometry, vertex } of group) {
        const n = geometry.getAttribute('normal');
        n.setXYZ(vertex, x / length, y / length, z / length);
        n.needsUpdate = true;
      }
    }
  }

  materialPoint(world: Vec3): Vec3 {
    return this.acquisition ? this.deformation.toMaterial(world, this.acquisition.sample.resp) : world;
  }

  /** Primer impacto visible: ni cabeza/brazos ni la carcasa permiten seleccionar piel a través de ellos. */
  pick(raycaster: Raycaster, probe: Object3D[], dragging = false): Vec3 | 'probe' | 'blocked' | null {
    const hit = raycaster.intersectObjects([this.skin, ...this.occluders, ...(dragging ? [] : probe)], false)[0];
    if (!hit) return null;
    if (hit.object === this.skin) return this.materialPoint(viewToPatient(hit.point.toArray()));
    return this.occluders.includes(hit.object as typeof this.skin) ? 'blocked' : 'probe';
  }

  dispose(): void {
    for (const surface of this.surfaces) surface.mesh.geometry.dispose();
    this.root.clear();
  }
}
