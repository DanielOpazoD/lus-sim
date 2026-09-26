import { registerDevtools } from './app/devtools';
import { buildDiagnostics, buildLabel, diagnosticsFileName, gpuInfo } from './app/diagnostics';
import { ErrorBudget } from './app/errorBudget';
import { errorLog, errorMessage } from './app/errorLog';
import { ProbeAnimator } from './app/probeAnimation';
import { SimulationSession } from './app/session';
import type { Simulator } from './app/simulator';
import { Store } from './app/store';
import { NonFiniteStateError } from './physiology/engine';
import { Banner } from './ui/controllers/banner';
import { bindGpuLifecycle } from './ui/controllers/gpuLifecycle';
import { HeartRateDisplay, hudText, renderLines } from './ui/controllers/hud';
import { setPressed } from './ui/controls';
import { bindPopover } from './ui/disclosure';
import { drawOverlay } from './ui/displays';
import { bindKeyboardShortcuts } from './ui/keyboardShortcuts';
import { ControlPanel } from './ui/panel';
import { ProbeInput } from './ui/probeInput';
import { StartPointCards } from './ui/startPointCards';
import { compoundActive } from './ultrasound/compound';

/**
 * Raíz de composición (Fase 1): crea la sesión de simulación, el estado de UI y las vistas, y
 * los conecta. La lógica vive en módulos con una sola responsabilidad: `SimulationSession`
 * (simulador vivo + equipo), `ui/controllers/*` (HUD, pérdida de GPU, avisos) y `ErrorBudget` (bucle que se
 * degrada, no muere). Todo el tiempo procede del reloj de la simulación.
 *
 * lus-sim (decisión 13): solo el modo B, con el preajuste pulmonar y la sonda en el punto BLUE superior; sin
 * casos, Doppler, audio, modo M, medición, docente ni navegador 3D de VExUS. La e2e (`?e2e`) ve la misma aplicación
 * y sus ganchos (`window.__lusTest`).
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
const status = $<HTMLElement>('status');
const liveChip = $<HTMLElement>('live-chip');
const sectorWrap = $<HTMLElement>('sector-wrap');
$<HTMLElement>('build-info').textContent = buildLabel(__APP_VERSION__, __GIT_COMMIT__);

// Ningún fallo es silencioso: excepciones no capturadas, promesas rechazadas y oyentes del store que lanzan
// terminan en el registro de errores
errorLog.installGlobalHandlers(window);
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

// --- Vistas ------------------------------------------------------------------
const panel = new ControlPanel($('panel'), sim, store, dispatch, () => {
  const error = session.resetPatient();
  if (error) banner.show(`No se pudo reiniciar el paciente: ${errorMessage(error)}`, 6000);
});
session.equipment.subscribe(() => panel.sync());
const probeAnimator = new ProbeAnimator(
  () => sim().pose,
  (p) => sim().setPose(p),
);
function setPoseManual(p: Parameters<Simulator['setPose']>[0]): void {
  probeAnimator.cancel(); // cualquier gesto manual cancela la animación
  sim().setPose(p);
}
// Carril izquierdo: los puntos de partida (la sonda se desliza hasta ellos) y la ayuda de la sonda
const windows = new StartPointCards($('start-points'), {
  onPick: (sp) => probeAnimator.goTo(sp),
  getPose: () => sim().pose,
  getTorso: () => sim().scene.torso,
  animating: () => probeAnimator.active,
});
bindPopover($<HTMLButtonElement>('nav-help'), $('nav-help-pop'));
let lastFps = 0;
$<HTMLButtonElement>('diagnostics').addEventListener('click', () => {
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
    gpuMs: s.renderer.gpuTimings(),
    equipment: s.equipment,
    errors: errorLog.recent(50),
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
  a.download = diagnosticsFileName(d);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
// con la imagen congelada la sonda no se mueve
const input = new ProbeInput(
  sectorWrap,
  () => sim().pose,
  setPoseManual,
  () => !store.get().frozen,
);
registerDevtools(sim, dispatch);
session.onSimulatorChanged(() => panel.sync());

// --- Controles de la barra ----------------------------------------------------
const freezeBtn = $<HTMLButtonElement>('freeze');
freezeBtn.addEventListener('click', () => store.set({ frozen: !store.get().frozen }));
bindKeyboardShortcuts(store, dispatch);
const gpu = bindGpuLifecycle(glCanvas, sim, banner);

// --- Estado de UI → sesión -------------------------------------------------------
store.subscribe((st, prev) => {
  if (st.frozen !== prev.frozen) {
    sim().frozen = st.frozen;
    app.classList.toggle('frozen', st.frozen);
    setPressed(freezeBtn, st.frozen);
    liveChip.textContent = st.frozen ? 'FREEZE' : 'LIVE';
    liveChip.className = `chip ${st.frozen ? 'freeze' : 'live'}`;
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

// --- Bucle principal ---------------------------------------------------------
let last = performance.now();
let frames = 0;
let frameTime = 0;
let lastStatus = 0;
const errorBudget = new ErrorBudget();
let loopDegraded = false;
const heartRate = new HeartRateDisplay();

function frame(now: number, dt: number): void {
  const s = sim();
  fitCanvases();
  input.tick(dt);
  probeAnimator.tick(dt);
  s.advance(dt);
  if (!gpu.lost) s.render();
  drawOverlay(overlay, s);
  const t = s.physiology.clock.t;
  const shown = s.displayed.bmode;
  const h = hudText({
    patientLabel: 'Paciente sintético',
    frozen: s.frozen,
    heartRateBpm: heartRate.update(s.sample.rr, dt),
    atrialFibrillation: s.patient.rhythm === 'atrial-fibrillation',
    transducerMHz: s.transducer.f0B / 1e6,
    depthMm: shown.depthMm,
    gainDb: shown.gainDb,
    dynamicRangeDb: shown.dynamicRangeDb,
    compound: compoundActive(shown, { enabled: false }), // sin color: la composición se forma si está encendida
    harmonic: shown.harmonic,
    respVolume: s.sample.resp.volume,
  });
  renderLines(hud.tl, h.topLeft);
  renderLines(hud.tr, h.topRight);
  renderLines(hud.br, h.bottomRight);
  frames++;
  frameTime += dt;
  if (now - lastStatus > 250) {
    lastStatus = now;
    lastFps = frames / Math.max(1e-3, frameTime);
    status.textContent = `${lastFps.toFixed(0)} fps · t ${t.toFixed(1)} s`;
    frames = 0;
    frameTime = 0;
    panel.sync(); // la pose y el acoplamiento cambian con el ratón; el equipo avisa por su cuenta
    windows.sync();
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
