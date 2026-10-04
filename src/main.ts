import { registerDevtools } from './app/devtools';
import { buildDiagnostics, buildLabel, diagnosticsFileName, gpuInfo } from './app/diagnostics';
import { BmodeFrameRate } from './app/frameRate';
import { ErrorBudget } from './app/errorBudget';
import { errorLog, errorMessage } from './app/errorLog';
import { SimulationSession } from './app/session';
import type { Simulator } from './app/simulator';
import { Store } from './app/store';
import { NonFiniteStateError } from './physiology/engine';
import type { PatientPosition } from './probe/probe';
import { Banner } from './ui/controllers/banner';
import { bindCine } from './ui/controllers/cine';
import { bindGpuLifecycle } from './ui/controllers/gpuLifecycle';
import { HeartRateDisplay, hudText, hudTopLeft, renderLines } from './ui/controllers/hud';
import { setPressed } from './ui/controls';
import { bindPopover } from './ui/disclosure';
import { drawOverlay } from './ui/displays';
import { bindKeyboardShortcuts } from './ui/keyboardShortcuts';
import { MModeView } from './ui/mMode';
import { ControlPanel } from './ui/panel';
import { ProbeInput } from './ui/probeInput';
import { createReview } from './ui/review';
import { compoundActive } from './ultrasound/compound';

/**
 * Raíz de composición (Fase 1): crea la sesión de simulación, el estado de UI y las vistas, y
 * los conecta. La lógica vive en módulos con una sola responsabilidad: `SimulationSession`
 * (simulador vivo + equipo), `ui/controllers/*` (HUD, cine), `ErrorBudget` y la revisión manual diferida.
 * Todo el tiempo procede del reloj de la simulación.
 *
 * Modo B con el preajuste pulmonar y la sonda en BLUE superior, cine y una línea M opcional
 * adquirida de la misma envolvente. El navegador 3D comparte la adquisición efectiva y se carga
 * después de la primera imagen. Sin casos, Doppler, audio ni medición diagnóstica.
 * La e2e (`?e2e`) ve la misma aplicación y sus ganchos (`window.__lusTest`).
 */
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta el elemento #${id}`);
  return el as T;
};

const app = $<HTMLElement>('app');
const glCanvas = $<HTMLCanvasElement>('gl');
const overlay = $<HTMLCanvasElement>('overlay');
const hud = { tl: $<HTMLElement>('hud-tl'), tr: $<HTMLElement>('hud-tr'), br: $<HTMLElement>('hud-br') };
const PATIENT_LABEL = 'Paciente sintético';
const status = $<HTMLElement>('status');
const liveChip = $<HTMLElement>('live-chip');
const sectorWrap = $<HTMLElement>('sector-wrap');
$<HTMLElement>('build-info').textContent = buildLabel(__APP_VERSION__, __GIT_COMMIT__);

// Ningún fallo es silencioso: excepciones no capturadas, promesas rechazadas y oyentes del store que lanzan
// terminan en el registro de errores. lus-sim (decisión 13): sin la pestaña Docente que lo mostraba en VExUS, cada
// entrada va también a la consola con su origen (la primera vez y luego a 2, 4, 8… repeticiones: un error por cuadro
// no la inunda), y la e2e la vigila
errorLog.installGlobalHandlers(window);
errorLog.subscribe((e) => {
  if ((e.count & (e.count - 1)) === 0) console.error(`[${e.source}] ${e.message}${e.count > 1 ? ` (×${e.count})` : ''}`);
});
const store = new Store({ frozen: false }, (e) => errorLog.report('ui', e));

function fatal(message: string): never {
  document.body.replaceChildren();
  const d = document.createElement('div');
  d.className = 'error';
  d.setAttribute('role', 'alert');
  d.textContent = `No se pudo iniciar el simulador: ${message}`;
  document.body.appendChild(d);
  throw new Error(message);
}

let session: SimulationSession;
try {
  session = new SimulationSession(glCanvas);
} catch (e) {
  errorLog.report('gpu', e);
  fatal(errorMessage(e));
}
const sim = (): Simulator => session.sim;
const dispatch = session.equipment.dispatch.bind(session.equipment);
const banner = new Banner(sectorWrap);
const mMode = new MModeView(sectorWrap, sim);
const review = createReview(sectorWrap, $('cine-bar'), sim, (error) => errorLog.report('ui', error));

// El navegador es opcional para la formación de imagen y no bloquea el primer modo B.
let navigator3D: { sync(): void; dispose(): void } | null = null;
let navigatorRequested = false;
function navigatorFailed(error: unknown): void {
  errorLog.report('ui', error);
  navigator3D?.dispose();
  navigator3D = null;
  const host = $('thorax-navigator');
  host.dataset.ready = 'error';
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.textContent = 'El navegador 3D no está disponible. Puedes mover la sonda desde la imagen y los ajustes.';
  host.replaceChildren(message);
}
function requestNavigator(): void {
  if (navigatorRequested) return;
  navigatorRequested = true;
  requestAnimationFrame(() => {
    void import('./ui/thorax/index')
      .then(({ createThoraxNavigator }) => {
        const host = $('thorax-navigator');
        navigator3D = createThoraxNavigator(host, {
          getSim: sim,
          setPose: setPoseManual,
          onError: (error) => errorLog.report('ui', error),
        });
        navigator3D.sync();
      })
      .catch(navigatorFailed);
  });
}

// --- Vistas ------------------------------------------------------------------
/**
 * Todo gesto de la sonda pasa por aquí: con la imagen congelada no mueve nada (lus-sim, decisión 13: en VExUS los deslizadores de
 * la sonda y las tarjetas la movían bajo una imagen congelada, lo halló la revisión).
 */
function setPoseManual(p: Parameters<Simulator['setPose']>[0]): void {
  if (store.get().frozen) return;
  sim().setPose(p);
}
/**
 * lus-sim (decisión 33): sentar o tumbar al paciente. La sonda se vuelve a acotar con la posición nueva (en supino, la que estaba
 * en la espalda queda en el borde de la cama, 1,2π o −0,2π).
 */
function setPatientPosition(position: PatientPosition): void {
  if (store.get().frozen) return;
  const s = sim();
  if ((s.patient.position ?? 'supine') === position) return;
  s.patient.position = position;
  s.setPose(s.pose);
}
const panel = new ControlPanel($('panel'), sim, store, dispatch, {
  setPose: setPoseManual,
  setPosition: setPatientPosition,
  onResetPatient: () => {
    const error = session.resetPatient();
    if (error) banner.show(`No se pudo reiniciar el paciente: ${errorMessage(error)}`, 6000);
  },
});
session.equipment.subscribe(() => panel.sync());
// Carril izquierdo: la ayuda de la sonda (decisión 47: sin las tarjetas de los puntos BLUE)
bindPopover($<HTMLButtonElement>('nav-help'), $('nav-help-pop'));
let lastFps = 0;
$<HTMLButtonElement>('tech-report').addEventListener('click', () => {
  void downloadTechReport().catch((e: unknown) => errorLog.report('ui', e));
});
/** El informe técnico; la cobertura de exploración (decisión 26) se carga al pedirlo, fuera de la entrada inicial. */
async function downloadTechReport(): Promise<void> {
  const { explorationCoverage } = await import('./app/coverage');
  const s = sim();
  const d = buildDiagnostics({
    version: __APP_VERSION__,
    commit: __GIT_COMMIT__,
    buildTime: __BUILD_TIME__,
    userAgent: navigator.userAgent,
    gpu: gpuInfo(s.renderer.gl),
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    caseId: s.patient.id,
    simTimeS: s.physiology.clock.t,
    fps: lastFps,
    bmodeFps: bmodeRate.summary(),
    gpuMs: s.renderer.gpuTimings(),
    equipment: s.equipment,
    errors: errorLog.recent(50),
    coverage: (({ met, total, byRegion }) => ({ met, total, byRegion }))(explorationCoverage(s.scene)),
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
  a.download = diagnosticsFileName(d);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// con la imagen congelada la sonda no se mueve: la rueda y ← → recorren el cine (decisión 80 de VExUS)
const input = new ProbeInput(
  sectorWrap,
  () => sim().pose,
  setPoseManual,
  () => !store.get().frozen,
);
registerDevtools(sim, dispatch);
/**
 * El cine y la imagen congelada eran del simulador o del renderizador anterior: tras reiniciar el paciente o recuperar
 * la GPU, una imagen congelada ya no existe (se vería negra, con la regla y el HUD de otro cuadro). Se vuelve a la
 * imagen en vivo y se dice (lo halló la revisión).
 */
function afterReplaced(what: string): void {
  if (store.get().frozen) {
    store.set({ frozen: false });
    banner.show(`${what}: la imagen congelada se perdió y vuelve la imagen en vivo`, 5000);
  }
  cine.sync();
  panel.sync();
}
session.onSimulatorChanged(() => afterReplaced('Paciente reiniciado'));

// --- Controles de la barra ----------------------------------------------------
const freezeBtn = $<HTMLButtonElement>('freeze');
freezeBtn.addEventListener('click', () => store.set({ frozen: !store.get().frozen }));
bindKeyboardShortcuts(store, dispatch);
// el cine era del renderizador viejo (decisión 80 de VExUS)
const gpu = bindGpuLifecycle(glCanvas, sim, banner, () => afterReplaced('GPU recuperada'));
const cine = bindCine({
  bar: $('cine-bar'),
  slider: $<HTMLInputElement>('cine'),
  label: $('cine-time'),
  freezeButton: freezeBtn,
  host: sectorWrap,
  getSim: sim,
  store,
});

// --- Estado de UI → sesión -------------------------------------------------------
store.subscribe((st, prev) => {
  if (st.frozen !== prev.frozen) {
    sim().frozen = st.frozen;
    app.classList.toggle('frozen', st.frozen);
    setPressed(freezeBtn, st.frozen);
    liveChip.textContent = st.frozen ? 'Congelada' : 'En vivo';
    liveChip.className = `chip ${st.frozen ? 'freeze' : 'live'}`;
    $('freeze-label').textContent = st.frozen ? 'Reanudar' : 'Congelar';
    freezeBtn.title = st.frozen ? 'Reanudar la adquisición (Espacio)' : 'Congelar la imagen (Espacio)';
    renderLines(hud.tl, hudTopLeft(PATIENT_LABEL, st.frozen));
    panel.sync();
  }
});

// --- Tamaño de lienzos -------------------------------------------------------
function fitCanvases(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(320, Math.floor(sectorWrap.clientWidth * dpr));
  const h = Math.max(240, Math.floor(sectorWrap.clientHeight * dpr));
  if (glCanvas.width !== w || glCanvas.height !== h) {
    glCanvas.width = w;
    glCanvas.height = h;
    overlay.width = w;
    overlay.height = h;
  }
}
window.addEventListener('resize', fitCanvases);
new ResizeObserver(fitCanvases).observe(sectorWrap);

// --- Bucle principal ---------------------------------------------------------
let last = performance.now();
let frames = 0;
let fpsWindowStarted = last;
// los FPS del modo B del informe técnico (decisión 40): solo los cuadros que se dibujan de verdad
const bmodeRate = new BmodeFrameRate();
// con la pestaña oculta el navegador no da cuadros: al volver, el hueco no es un cuadro de varios segundos
document.addEventListener('visibilitychange', () => {
  if (document.hidden) bmodeRate.reset();
});
let lastStatus = 0;
const errorBudget = new ErrorBudget();
let loopDegraded = false;
const heartRate = new HeartRateDisplay();
let lastDisplayedAcquisition: Simulator['displayedAcquisition'] | null = null;

function frame(now: number, dt: number): void {
  const s = sim();
  input.tick(dt);
  s.advance(dt);
  if (!gpu.lost) {
    s.render({ mline: mMode.prepare(s) });
    // un cuadro del modo B solo si se dibujó (con la imagen congelada `render` no dibuja)
    if (s.frozen) bmodeRate.reset();
    else bmodeRate.frame(now);
    cine.tick();
    requestNavigator();
  }
  if (gpu.lost) bmodeRate.reset();
  try {
    navigator3D?.sync();
  } catch (error) {
    navigatorFailed(error);
  }
  drawOverlay(overlay, s);
  mMode.draw(overlay, gpu.lost);
  review.sync(gpu.lost);
  const t = s.physiology.clock.t;
  const shown = s.displayed.bmode;
  const acquired = s.displayedAcquisition;
  if (s.frozen && acquired !== lastDisplayedAcquisition) panel.sync();
  lastDisplayedAcquisition = acquired;
  const h = hudText({
    patientLabel: PATIENT_LABEL,
    frozen: s.frozen,
    heartRateBpm: s.frozen ? 60 / acquired.sample.rr : heartRate.update(acquired.sample.rr, dt),
    atrialFibrillation: s.patient.rhythm === 'atrial-fibrillation',
    transducerMHz: s.transducer.f0B / 1e6,
    depthMm: shown.depthMm,
    gainDb: shown.gainDb,
    dynamicRangeDb: shown.dynamicRangeDb,
    compound: compoundActive(shown, { enabled: false }), // sin color: la composición se forma si está encendida
    harmonic: shown.harmonic,
  });
  renderLines(hud.tl, h.topLeft);
  renderLines(hud.tr, h.topRight);
  renderLines(hud.br, h.bottomRight);
  frames++;
  if (now - lastStatus > 250) {
    lastStatus = now;
    // Telemetría en tiempo real: limitar dt para el motor no debe esconder pausas de la interfaz.
    lastFps = (frames * 1000) / Math.max(1, now - fpsWindowStarted);
    // con la imagen congelada no se forman cuadros: el bucle sigue (HUD, cine), pero sus fps no son los de la imagen
    status.textContent = `${s.frozen ? 'congelada' : `${lastFps.toFixed(0)} fps`} · t ${t.toFixed(1)} s`;
    frames = 0;
    fpsWindowStarted = now;
    panel.sync(); // la pose y el acoplamiento cambian con el ratón; el equipo avisa por su cuenta
  }
}

function loop(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  try {
    frame(now, dt);
    if (loopDegraded) {
      loopDegraded = false; // se recuperó: el aviso de error persistente ya no aplica
      if (!gpu.lost) banner.hide();
    }
  } catch (e) {
    errorLog.report(e instanceof NonFiniteStateError ? 'fisiología' : 'bucle', e);
    if (errorBudget.fail(now)) {
      // Error persistente: avisar y reintentar a 1 Hz en vez de detener la aplicación para siempre
      loopDegraded = true;
      banner.show(`Error persistente en el bucle (se reintenta cada segundo): ${errorMessage(e)}`);
      setTimeout(() => requestAnimationFrame(loop), 1000);
      return;
    }
  }
  requestAnimationFrame(loop);
}
fitCanvases();
requestAnimationFrame(loop);
