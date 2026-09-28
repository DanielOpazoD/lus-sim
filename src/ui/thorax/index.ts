import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { AnatomyScene } from '../../anatomy/scene';
import { thoraxLinePhi } from '../../anatomy/thoraxLines';
import type { Simulator } from '../../app/simulator';
import { clamp } from '../../core/vec3';
import type { ProbePose } from '../../probe/probe';
import {
  footprintMesh,
  housingMarkerPoint,
  nudgePose,
  patientToView,
  probeViewAxes,
  ribMesh,
  SCAN_LIMITS,
  sectorMesh,
  skinMesh,
  viewToPatient,
  type MeshData,
} from './geometry';
import { bindThoraxInput } from './input';

export interface ThoraxNavigatorOptions {
  getSim: () => Simulator;
  setPose: (pose: ProbePose) => void;
  onError: (error: unknown) => void;
}

/** Vista optativa de adquisición: contexto propio, sin reloj, sin lecturas GPU y sin modificar anatomía.
 * sync() se llama desde el bucle existente; un paciente quieto no provoca redibujos continuos del visor.
 */
export function createThoraxNavigator(host: HTMLElement, options: ThoraxNavigatorOptions): { sync(): void; dispose(): void } {
  const root = document.createElement('div');
  root.className = 'thorax-root';
  const toolbar = document.createElement('div');
  toolbar.className = 'thorax-toolbar';
  const views = document.createElement('div');
  views.className = 'thorax-views';
  const viewport = document.createElement('div');
  viewport.className = 'thorax-viewport';
  const canvas = document.createElement('canvas');
  canvas.className = 'thorax-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Tórax y posición de la sonda. Los controles bajo el modelo permiten moverla sin arrastrar.');
  viewport.append(canvas);
  const caption = document.createElement('p');
  caption.className = 'thorax-caption';
  const tools = document.createElement('div');
  tools.className = 'thorax-tools';
  const fine = document.createElement('details');
  fine.className = 'thorax-fine';
  const summary = document.createElement('summary');
  summary.textContent = 'Mover sin arrastrar';
  fine.append(summary);
  const steps = document.createElement('div');
  steps.className = 'thorax-steps';
  fine.append(steps);
  const help = document.createElement('p');
  help.className = 'thorax-help';
  help.textContent = 'Arrastra la sonda. Para girar el tórax, arrastra el fondo o usa Alt. Modelo esquemático en supino.';
  root.append(toolbar, views, viewport, caption, tools, fine, help);

  // Si falla WebGL no se deja un panel parcial; la raíz conserva su alternativa de navegación.
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  host.append(root);
  renderer.setClearColor(0x0c151e, 1);
  const scene = new Scene();
  const camera = new OrthographicCamera(-0.25, 0.25, 0.3, -0.3, 0.01, 3);
  const anatomy = new Group();
  const ribs = new Group();
  const probe = new Group();
  scene.add(anatomy, ribs, probe, new HemisphereLight(0xe1edf0, 0x324252, 2));
  const key = new DirectionalLight(0xffefe1, 2.5);
  key.position.set(-0.7, 1, 0.8);
  scene.add(key);
  const skinMaterial = new MeshStandardMaterial({ color: 0x718994, roughness: 0.94, metalness: 0, side: DoubleSide });
  const ribMaterial = new MeshStandardMaterial({ color: 0xe0dfcf, roughness: 0.95, side: DoubleSide });
  const probeMaterial = new MeshStandardMaterial({ color: 0xe8edf0, roughness: 0.48 });
  const faceMaterial = new MeshBasicMaterial({ color: 0x162633, side: DoubleSide });
  const markerMaterial = new MeshBasicMaterial({ color: 0x3fb6a8 });
  const planeMaterial = new MeshBasicMaterial({
    color: 0x3fb6a8,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
  const footprint = new Mesh(new BufferGeometry(), faceMaterial);
  const sector = new Mesh(new BufferGeometry(), planeMaterial);
  const marker = new Mesh(new SphereGeometry(0.0045, 12, 8), markerMaterial);
  marker.renderOrder = 4;
  sector.renderOrder = 3;
  sector.visible = false;
  scene.add(footprint, sector, marker);
  const raycaster = new Raycaster();
  let skin: Mesh<BufferGeometry, MeshStandardMaterial>;
  let referenceScene: AnatomyScene | null = null;
  let mode: 'move' | 'orient' = 'move';
  let azimuth = Math.PI / 2;
  let elevation = 0.1;
  let width = 0;
  let height = 0;
  let sizedWidth = 0;
  let sizedHeight = 0;
  let dpr = 0;
  let dirty = true;
  let disposed = false;
  let lost = false;
  let lastState = '';
  let unavailable = false;
  const poseButtons: HTMLButtonElement[] = [];
  const abort = new AbortController();
  const button = (parent: HTMLElement, text: string, action: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', action, { signal: abort.signal });
    parent.append(b);
    return b;
  };
  const moveButton = button(toolbar, 'Mover', () => setMode('move'));
  moveButton.dataset.mode = 'move';
  const orientButton = button(toolbar, 'Orientar', () => setMode('orient'));
  orientButton.dataset.mode = 'orient';
  function setMode(next: 'move' | 'orient'): void {
    mode = next;
    moveButton.setAttribute('aria-pressed', String(mode === 'move'));
    orientButton.setAttribute('aria-pressed', String(mode === 'orient'));
    canvas.dataset.mode = mode;
    help.textContent =
      mode === 'move'
        ? 'Arrastra la sonda. Para girar el tórax, arrastra el fondo o usa Alt. Modelo esquemático en supino.'
        : 'Arrastra para bascular e inclinar; la rueda gira el marcador. En pantalla táctil, usa Girar − / Girar +.';
  }
  setMode('move');
  function updateCamera(): void {
    const radius = 0.9 * Math.cos(elevation);
    camera.position.set(radius * Math.cos(azimuth), 0.04 + 0.9 * Math.sin(elevation), radius * Math.sin(azimuth));
    camera.lookAt(0, 0.04, 0);
    camera.updateMatrixWorld();
    dirty = true;
  }
  const chooseView = (angle: number) => {
    azimuth = angle;
    elevation = 0.1;
    updateCamera();
  };
  button(views, 'Anterior', () => chooseView(Math.PI / 2));
  button(views, 'Lateral', () => chooseView(Math.cos(options.getSim().displayedAcquisition.pose.phi) < 0 ? Math.PI : 0));
  button(views, 'Posterior', () => chooseView(-Math.PI / 2));
  const ribButton = button(tools, 'Costillas', () => {
    ribs.visible = !ribs.visible;
    skinMaterial.transparent = ribs.visible;
    skinMaterial.opacity = ribs.visible ? 0.23 : 1;
    skinMaterial.depthWrite = !ribs.visible;
    skinMaterial.needsUpdate = true;
    ribButton.setAttribute('aria-pressed', String(ribs.visible));
    dirty = true;
  });
  ribs.visible = false;
  ribButton.setAttribute('aria-pressed', 'false');
  ribButton.title = 'Guía costal del modelo en reposo, sin deformación por la sonda';
  const planeButton = button(tools, 'Plano', () => {
    sector.visible = !sector.visible;
    planeButton.setAttribute('aria-pressed', String(sector.visible));
    dirty = true;
  });
  planeButton.setAttribute('aria-pressed', 'false');
  const nudge = (around: number, cranial: number, yaw = 0) => {
    const sim = options.getSim();
    if (!sim.frozen) options.setPose(nudgePose(sim.pose, sim.scene.torso, around, cranial, yaw));
  };
  for (const [label, around, cranial, yaw] of [
    ['Craneal', 0, 5, 0],
    ['Caudal', 0, -5, 0],
    ['Hacia la derecha', 5, 0, 0],
    ['Hacia la izquierda', -5, 0, 0],
    ['Girar −', 0, 0, -Math.PI / 36],
    ['Girar +', 0, 0, Math.PI / 36],
  ] as const)
    poseButtons.push(button(steps, label, () => nudge(around, cranial, yaw)));
  const fineNote = document.createElement('p');
  fineNote.textContent = 'Basculación, inclinación y contacto: Ajustes → Sonda.';
  fine.append(fineNote);

  function replaceGeometry(geometry: BufferGeometry, data: MeshData): void {
    geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  function clearGeometry(group: Group): void {
    group.traverse((object) => {
      if (object instanceof Mesh && object.geometry instanceof BufferGeometry) object.geometry.dispose();
    });
    group.clear();
  }
  function buildAnatomy(model: AnatomyScene): void {
    clearGeometry(anatomy);
    clearGeometry(ribs);
    clearGeometry(probe);
    referenceScene = model;
    const geometry = new BufferGeometry();
    replaceGeometry(geometry, skinMesh(model.torso));
    skin = new Mesh(geometry, skinMaterial);
    anatomy.add(skin);
    // Terminación visual fuera del dominio explorable: hombros/cuello esquemáticos, no consultados por el motor.
    const shoulders = new Mesh(new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), skinMaterial);
    shoulders.scale.set(model.torso.a / 1000, 0.065, model.torso.b / 1000);
    shoulders.position.y = SCAN_LIMITS.zMax / 1000;
    const neck = new Mesh(new CylinderGeometry(0.043, 0.049, 0.045, 24), skinMaterial);
    neck.position.y = shoulders.position.y + 0.063;
    anatomy.add(shoulders, neck);
    for (let i = 0; i < model.ribs.length; i++) {
      const g = new BufferGeometry();
      replaceGeometry(g, ribMesh(model, i));
      ribs.add(new Mesh(g, ribMaterial));
    }
    const tr = options.getSim().transducer;
    const body = new Mesh(new BoxGeometry(tr.footprintMm * 0.00065, 0.055, tr.elevationMm * 0.0015), probeMaterial);
    body.position.y = 0.034;
    const handle = new Mesh(new CylinderGeometry(0.009, 0.013, 0.03, 16), probeMaterial);
    handle.position.y = 0.075;
    probe.add(body, handle);
    anatomy.updateMatrixWorld(true);
    dirty = true;
  }

  const unbindInput = bindThoraxInput(canvas, {
    getPose: () => options.getSim().pose,
    getTorso: () => options.getSim().scene.torso,
    setPose: (p) => {
      unavailable = false;
      options.setPose(p);
    },
    frozen: () => options.getSim().frozen,
    mode: () => mode,
    pick: (x, y) => {
      if (!skin) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      raycaster.setFromCamera(new Vector2(((x - rect.left) / rect.width) * 2 - 1, 1 - ((y - rect.top) / rect.height) * 2), camera);
      const hit = raycaster.intersectObject(skin, false)[0];
      return hit ? viewToPatient(hit.point.toArray()) : null;
    },
    orbit: (dx, dy) => {
      azimuth -= dx * 0.008;
      elevation = clamp(elevation + dy * 0.006, -0.65, 0.65);
      updateCamera();
    },
    unavailable: () => {
      unavailable = true;
      dirty = true;
    },
  });
  const resize = () => {
    width = viewport.clientWidth;
    height = viewport.clientHeight;
    dirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      lost = true;
      host.dataset.ready = 'lost';
      caption.textContent = 'Navegador 3D temporalmente no disponible. La imagen ecográfica continúa.';
      options.onError(new Error('Se perdió el contexto WebGL del navegador del tórax'));
    },
    { signal: abort.signal },
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      dirty = true;
      sizedWidth = 0;
      sizedHeight = 0;
      dpr = 0;
      lastState = '';
      resize();
    },
    { signal: abort.signal },
  );
  updateCamera();
  resize();

  return {
    sync(): void {
      if (disposed || lost || document.hidden || width <= 0 || height <= 0) return;
      try {
        const sim = options.getSim();
        if (sim.scene !== referenceScene) buildAnatomy(sim.scene);
        const acquisition = sim.displayedAcquisition;
        const { frame, pose } = acquisition;
        const depth = sim.displayed.bmode.depthMm;
        const state = [
          pose.phi,
          pose.z,
          pose.lift,
          pose.yaw,
          pose.rock,
          pose.tilt,
          ...frame.face,
          ...frame.axial,
          ...frame.lateral,
          depth,
          sim.frozen,
          sim.frozen ? acquisition.sample.t : 0,
        ].join('|');
        if (state !== lastState) {
          lastState = state;
          const axes = probeViewAxes(frame);
          probe.matrixAutoUpdate = false;
          probe.matrix.copy(new Matrix4().makeBasis(new Vector3(...axes.x), new Vector3(...axes.y), new Vector3(...axes.z)));
          probe.matrix.setPosition(new Vector3(...patientToView(frame.face)));
          probe.matrixWorldNeedsUpdate = true;
          replaceGeometry(footprint.geometry, footprintMesh(frame, sim.transducer));
          replaceGeometry(sector.geometry, sectorMesh(frame, sim.transducer, depth));
          marker.position.set(...patientToView(housingMarkerPoint(frame, sim.transducer)));
          for (const b of poseButtons) b.disabled = sim.frozen;
          dirty = true;
        }
        const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
        if (nextDpr !== dpr) {
          dpr = nextDpr;
          renderer.setPixelRatio(dpr);
          dirty = true;
        }
        if (!dirty) return;
        if (width !== sizedWidth || height !== sizedHeight) {
          const aspect = width / height;
          const halfHeight = Math.max(0.29, 0.21 / aspect);
          camera.left = -halfHeight * aspect;
          camera.right = halfHeight * aspect;
          camera.top = halfHeight;
          camera.bottom = -halfHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
          sizedWidth = width;
          sizedHeight = height;
        }
        const side = Math.cos(pose.phi) < 0 ? -1 : 1;
        const lateral = Math.abs(pose.phi - Math.PI / 2);
        const anterior = Math.abs(thoraxLinePhi('anteriorAxillary', sim.scene.torso) - Math.PI / 2);
        const posterior = Math.abs(thoraxLinePhi('posteriorAxillary', sim.scene.torso) - Math.PI / 2);
        const region = lateral < anterior ? 'anterior' : lateral <= posterior ? 'lateral' : 'posterolateral';
        caption.textContent = unavailable
          ? 'Esta zona posterior no es accesible en la posición supina del modelo.'
          : `${side < 0 ? 'Derecho' : 'Izquierdo'} · ${region}${sim.frozen ? ` · cuadro congelado ${acquisition.sample.t.toFixed(1)} s` : ''}${ribs.visible ? ' · costillas en reposo' : ''}`;
        renderer.render(scene, camera);
        host.dataset.ready = 'true';
        dirty = false;
      } catch (error) {
        options.onError(error);
        lost = true;
        host.dataset.ready = 'error';
        caption.textContent = 'Navegador 3D no disponible. Usa los puntos de partida y Ajustes → Sonda.';
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unbindInput();
      observer.disconnect();
      abort.abort();
      clearGeometry(anatomy);
      clearGeometry(ribs);
      clearGeometry(probe);
      footprint.geometry.dispose();
      sector.geometry.dispose();
      marker.geometry.dispose();
      for (const material of [skinMaterial, ribMaterial, probeMaterial, faceMaterial, markerMaterial, planeMaterial]) material.dispose();
      renderer.dispose();
      root.remove();
    },
  };
}
