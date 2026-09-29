import {
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { AnatomyScene } from '../../anatomy/scene';
import { thoraxLinePhi } from '../../anatomy/thoraxLines';
import type { Simulator } from '../../app/simulator';
import { clamp } from '../../core/vec3';
import type { ProbePose, Transducer } from '../../probe/probe';
import { nudgePose, patientToView, probeViewAxes, ribMesh, sectorMesh, type MeshData } from './geometry';
import { bindThoraxInput } from './input';
import { HumanTorso } from './humanTorso';
import { ConvexProbe } from './convexProbe';

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
  let human: HumanTorso | null = null;
  let instrument: ConvexProbe | null = null;
  let referenceTransducer: Transducer | null = null;
  let poseState = '';
  let planeState = '';
  let renders = 0;
  scene.add(anatomy, ribs, new HemisphereLight(0xe1edf0, 0x324252, 2));
  const key = new DirectionalLight(0xffefe1, 2.5);
  key.position.set(-0.7, 1, 0.8);
  scene.add(key);
  const skinMaterial = new MeshStandardMaterial({ color: 0xb4a795, roughness: 0.83, metalness: 0 });
  const ribMaterial = new MeshStandardMaterial({ color: 0xe0dfcf, roughness: 0.95, side: DoubleSide });
  const contextMaterial = skinMaterial.clone();
  const planeMaterial = new MeshBasicMaterial({
    color: 0x3fb6a8,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
  const sector = new Mesh(new BufferGeometry(), planeMaterial);
  sector.renderOrder = 3;
  sector.visible = false;
  scene.add(sector);
  const raycaster = new Raycaster();
  let referenceScene: AnatomyScene | null = null;
  let mode: 'move' | 'orient' = 'move';
  let azimuth = Math.PI / 2 + 0.55;
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
    camera.position.set(radius * Math.cos(azimuth), 0.13 + 0.9 * Math.sin(elevation), radius * Math.sin(azimuth));
    camera.lookAt(0, 0.13, 0);
    camera.updateMatrixWorld();
    dirty = true;
  }
  const chooseView = (angle: number) => {
    azimuth = angle;
    elevation = 0.1;
    updateCamera();
  };
  button(views, 'Anterior', () => chooseView(Math.PI / 2));
  const lateralButton = button(views, 'Lateral', () =>
    chooseView(Math.cos(options.getSim().displayedAcquisition.pose.phi) < 0 ? Math.PI : 0),
  );
  button(views, 'Posterior', () => chooseView(-Math.PI / 2));
  const centerButton = button(viewport, 'Centrar modelo', () => chooseView(Math.PI / 2 + 0.55));
  centerButton.className = 'thorax-center';
  const ribButton = button(tools, 'Costillas', () => {
    if (!ribs.children.length) buildRibs(options.getSim().scene);
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
  function buildRibs(model: AnatomyScene): void {
    for (let i = 0; i < model.ribs.length; i++) {
      const g = new BufferGeometry();
      replaceGeometry(g, ribMesh(model, i));
      ribs.add(new Mesh(g, ribMaterial));
    }
  }
  function buildAnatomy(model: AnatomyScene): void {
    human?.dispose();
    anatomy.clear();
    clearGeometry(ribs);
    referenceScene = model;
    human = new HumanTorso(model, skinMaterial, contextMaterial);
    anatomy.add(human.root);
    if (ribs.visible) buildRibs(model);
    lastState = '';
    poseState = '';
    planeState = '';
    dirty = true;
  }
  function buildProbe(tr: Transducer): void {
    if (instrument) {
      scene.remove(instrument.root, instrument.cable);
      instrument.dispose();
    }
    instrument = new ConvexProbe(tr);
    referenceTransducer = tr;
    scene.add(instrument.root, instrument.cable);
    poseState = '';
    planeState = '';
    lastState = '';
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
    pick: (x, y, dragging) => {
      if (!human || !instrument) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(new Vector2(((x - rect.left) / rect.width) * 2 - 1, 1 - ((y - rect.top) / rect.height) * 2), camera);
      return human.pick(raycaster, instrument.root.children, dragging);
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
      unbindInput.cancel();
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
      if (disposed || lost || document.hidden || width <= 0 || height <= 0 || !canvas.getClientRects().length) return;
      try {
        const sim = options.getSim();
        if (sim.scene !== referenceScene) buildAnatomy(sim.scene);
        if (sim.transducer !== referenceTransducer) buildProbe(sim.transducer);
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
          if (sim.frozen) unbindInput.cancel();
          lastState = state;
          const nextPose = [
            pose.phi,
            pose.z,
            pose.lift,
            pose.yaw,
            pose.rock,
            pose.tilt,
            ...frame.face,
            ...frame.axial,
            ...frame.lateral,
          ].join('|');
          if (nextPose !== poseState) {
            poseState = nextPose;
            const axes = probeViewAxes(frame);
            const probe = instrument!.root;
            probe.matrixAutoUpdate = false;
            probe.matrix.makeBasis(new Vector3(...axes.x), new Vector3(...axes.y), new Vector3(...axes.z));
            probe.matrix.setPosition(new Vector3(...patientToView(frame.face)));
            probe.matrixWorldNeedsUpdate = true;
            human!.update(acquisition, sim.transducer);
            instrument!.updateCable(frame);
          }
          const nextPlane = `${nextPose}|${depth}`;
          if (nextPlane !== planeState) {
            planeState = nextPlane;
            replaceGeometry(sector.geometry, sectorMesh(frame, sim.transducer, depth));
          }
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
          const halfHeight = Math.max(0.44, 0.305 / aspect);
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
          ? 'Zona no explorable: cuello, brazos o espalda fuera del alcance del modelo.'
          : `${side < 0 ? 'Derecho' : 'Izquierdo'} · ${region}${sim.frozen ? ` · cuadro congelado ${acquisition.sample.t.toFixed(1)} s` : ''}${ribs.visible ? ' · costillas en reposo' : ''}`;
        lateralButton.title = `Ver lateral ${side < 0 ? 'derecha' : 'izquierda'} del paciente`;
        renderer.render(scene, camera);
        renders++;
        // Observación de pruebas; no comandos ni un segundo estado editable.
        if (new URLSearchParams(location.search).has('e2e')) {
          Object.assign(host.dataset, {
            triangles: String(renderer.info.render.triangles),
            calls: String(renderer.info.render.calls),
            geometries: String(renderer.info.memory.geometries),
            renders: String(renders),
            bodyUpdates: String(human!.updates),
            cableUpdates: String(instrument!.updates),
            warpedVertices: String(human!.warpedVertices),
            frameFace: frame.face.join(','),
          });
        }
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
      human?.dispose();
      anatomy.clear();
      clearGeometry(ribs);
      instrument?.dispose();
      sector.geometry.dispose();
      for (const material of [skinMaterial, contextMaterial, ribMaterial, planeMaterial]) material.dispose();
      renderer.dispose();
      root.remove();
    },
  };
}
