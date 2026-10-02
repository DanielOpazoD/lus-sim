import { MModeAcquisition } from '../app/mModeAcquisition';
import type { Simulator } from '../app/simulator';
import './mMode.css';

/** B + M desde la envolvente existente. Sin lectura de píxeles ni un segundo reloj en producción. */
export class MModeView {
  private readonly acquisition = new MModeAcquisition();
  private readonly toggle = document.createElement('button');
  private readonly pane = document.createElement('section');
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly place: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private readonly line: HTMLInputElement;
  private readonly angle: HTMLOutputElement;
  private readonly duration: HTMLSelectElement;
  private readonly status: HTMLElement;
  private enabled = false;
  private placing = false;
  private fraction = 0;
  private lost = false;
  private painted = '';
  private renderer: Simulator['renderer'] | null = null;
  private readonly normalLabel: string;

  constructor(
    private readonly host: HTMLElement,
    private readonly getSim: () => Simulator,
  ) {
    const center = host.parentElement!;
    const freeze = center.querySelector<HTMLButtonElement>('#freeze')!;
    this.normalLabel = host.getAttribute('aria-label') ?? 'Área de adquisición';
    this.toggle.id = 'mmode-toggle';
    this.toggle.className = 'secondary mmode-toggle';
    this.toggle.textContent = 'B + M';
    this.toggle.setAttribute('aria-label', 'Modo B + M');
    this.toggle.setAttribute('aria-controls', 'mmode-pane');
    this.toggle.setAttribute('aria-pressed', 'false');
    this.toggle.title = 'Mostrar una línea ecográfica a lo largo del tiempo';
    freeze.after(this.toggle);
    this.pane.id = 'mmode-pane';
    this.pane.className = 'mmode-pane';
    this.pane.hidden = true;
    this.pane.setAttribute('aria-labelledby', 'mmode-title');
    this.pane.innerHTML = `
      <div class="mmode-controls">
        <h2 id="mmode-title">Modo M</h2>
        <button id="mmode-place" aria-pressed="false">Colocar línea</button>
        <label>Barrido <select id="mmode-duration"><option value="4">4 s</option><option value="8">8 s</option></select></label>
        <button id="mmode-reset" class="secondary">Nueva franja</button>
      </div>
      <canvas id="mmode-canvas" role="img" aria-label="Modo M: tiempo horizontal y profundidad vertical" aria-describedby="mmode-note"></canvas>
      <p id="mmode-status" class="note" role="status"></p>
      <details class="mmode-fine">
        <summary>Ajuste fino de la línea</summary>
        <label for="mmode-line">Ángulo de línea M</label>
        <output id="mmode-angle" for="mmode-line">0°</output>
        <input id="mmode-line" type="range" min="-100" max="100" step="1" value="0" />
        <p id="mmode-note" class="note">Muestreo a la cadencia del modo B, sin persistencia temporal.
          Mover la sonda, cambiar la línea o el equipo inicia otra franja. Los huecos no se interpolan.</p>
      </details>`;
    host.after(this.pane);
    this.canvas = this.pane.querySelector<HTMLCanvasElement>('#mmode-canvas')!;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Modo M: contexto 2D no disponible');
    this.ctx = ctx;
    this.place = this.pane.querySelector<HTMLButtonElement>('#mmode-place')!;
    this.reset = this.pane.querySelector<HTMLButtonElement>('#mmode-reset')!;
    this.line = this.pane.querySelector<HTMLInputElement>('#mmode-line')!;
    this.angle = this.pane.querySelector<HTMLOutputElement>('#mmode-angle')!;
    this.duration = this.pane.querySelector<HTMLSelectElement>('#mmode-duration')!;
    this.status = this.pane.querySelector<HTMLElement>('#mmode-status')!;
    this.toggle.addEventListener('click', () => {
      if (this.locked()) return;
      this.enabled = !this.enabled;
      this.setPlacing(false);
      this.clear();
      this.toggle.setAttribute('aria-pressed', String(this.enabled));
      this.pane.hidden = !this.enabled;
      center.classList.toggle('mmode-active', this.enabled);
    });
    this.place.addEventListener('click', () => {
      if (!this.locked()) this.setPlacing(!this.placing);
    });
    this.reset.addEventListener('click', () => {
      if (!this.locked()) this.clear();
    });
    this.line.addEventListener('input', () => {
      if (!this.locked()) this.setFraction(Number(this.line.value) / 100);
    });
    // Captura solo el gesto expresamente armado. Los demás gestos siguen moviendo la sonda.
    host.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.placing || this.locked() || event.button !== 0 || !event.isPrimary) return;
        if ((event.target as Element).closest('input,button,select')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const sim = this.getSim();
        const box = host.getBoundingClientRect();
        const beam = sim.renderer.pixelToBeam(
          ((event.clientX - box.left) / box.width) * sim.renderer.canvas.width,
          ((event.clientY - box.top) / box.height) * sim.renderer.canvas.height,
          sim.transducer,
          sim.displayed.bmode.depthMm,
        );
        if (!beam) return;
        this.setFraction(beam.theta / sim.transducer.halfSector);
        this.setPlacing(false);
        this.place.focus({ preventScroll: true });
      },
      true,
    );
    host.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && this.placing) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.setPlacing(false);
          this.place.focus({ preventScroll: true });
        }
      },
      true,
    );
  }

  private locked(): boolean {
    return this.getSim().frozen || this.lost;
  }

  private setPlacing(value: boolean): void {
    this.placing = value;
    this.place.setAttribute('aria-pressed', String(value));
    this.place.textContent = value ? 'Cancelar selección' : 'Colocar línea';
    this.host.classList.toggle('mmode-selecting', value);
    this.host.setAttribute('aria-label', value ? 'Selecciona una línea dentro del sector. Escape cancela.' : this.normalLabel);
    if (value) this.host.focus({ preventScroll: true });
    // el estado dice la acción en el acto, no en el cuadro siguiente: con SwiftShader cargado un cuadro tarda segundos
    // (decisión 29: la e2e del modo M móvil esperaba 15 s el texto y el cuadro no llegaba)
    if (this.enabled) this.syncStatus();
  }

  /** El texto del estado del modo M con lo de ahora (lo pinta también cada cuadro, `draw`). */
  private syncStatus(): void {
    const sim = this.getSim();
    const ring = sim.renderer.mStrip;
    const t = sim.displayedAcquisition.sample.t;
    const lost = this.lost;
    const valid = !lost && ring.count > 1 && t >= ring.time(0) && t <= ring.time(ring.count - 1);
    let message = 'Mantén la sonda quieta para registrar la franja.';
    if (lost) message = 'GPU no disponible. La recuperación iniciará otra franja.';
    else if (this.placing) message = 'Toca el sector para colocar la línea; Escape cancela.';
    else if (sim.frozen) message = valid ? 'Imagen congelada. Revisa B y M con el cine.' : 'Sin datos M para este cuadro del cine.';
    else if (valid) message = 'M a la cadencia de B. Congela para revisar con el cine.';
    if (this.status.textContent !== message) this.status.textContent = message;
  }

  private clear(): void {
    this.acquisition.reset();
    this.getSim().renderer.mStrip.clear();
    this.painted = '';
  }

  private setFraction(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError('Modo M: posición de línea no finita');
    this.fraction = Math.round(Math.max(-1, Math.min(1, value)) * 100) / 100;
    this.line.value = String(this.fraction * 100);
    this.clear();
  }

  /** Se llama inmediatamente antes de renderizar B: la propia GPU registra su línea. */
  prepare(sim: Simulator): number | undefined {
    return this.acquisition.prepare(sim, this.enabled, this.fraction * sim.transducer.halfSector);
  }

  /** Tras dibujar B y su overlay, en el MISMO cuadro. La franja nunca queda sobre el lienzo B. */
  draw(overlay: HTMLCanvasElement, lost: boolean): void {
    this.lost = lost;
    const sim = this.getSim();
    const locked = this.locked();
    const controls = [this.toggle, this.place, this.reset, this.line];
    if (locked && controls.some((control) => control === document.activeElement)) {
      document.getElementById('freeze')?.focus({ preventScroll: true });
    }
    for (const control of controls) control.disabled = locked;
    if (locked && this.placing) this.setPlacing(false);
    if (!this.enabled) return;
    const r = sim.renderer;
    const ring = r.mStrip;
    const t = sim.displayedAcquisition.sample.t;
    const valid = !lost && ring.count > 1 && t >= ring.time(0) && t <= ring.time(ring.count - 1);
    const theta = this.fraction * sim.transducer.halfSector;
    const degrees = `${((theta * 180) / Math.PI).toFixed(1)}°`;
    this.angle.value = degrees;
    this.line.setAttribute('aria-valuetext', degrees);
    if (!lost && (!sim.frozen || valid)) {
      const ctx = overlay.getContext('2d')!;
      const start = r.beamToPixel(theta, 0, sim.transducer);
      const end = r.beamToPixel(theta, sim.displayed.bmode.depthMm, sim.transducer);
      ctx.save();
      ctx.strokeStyle = '#ffc857';
      ctx.lineWidth = 1.5 * (overlay.width / this.host.clientWidth);
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
    }
    this.syncStatus();
    this.pane.dataset.columns = String(ring.count);
    this.pane.dataset.time = String(t);
    this.pane.dataset.available = String(valid);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const H = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    const seconds = Number(this.duration.value);
    const key = [ring.version, t, W, H, seconds, valid, lost].join(':');
    if (key === this.painted && this.renderer === r) return;
    this.renderer = r;
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const left = Math.round(42 * dpr);
    const top = Math.round(8 * dpr);
    const pw = Math.max(1, Math.min(r.canvas.width, W - left - Math.round(12 * dpr)));
    const ph = Math.max(1, Math.min(r.canvas.height, H - top - Math.round(24 * dpr)));
    if (valid) {
      try {
        r.drawMStrip(t, seconds, pw, ph);
        ctx.drawImage(r.canvas, 0, r.canvas.height - ph, pw, ph, left, top, pw, ph);
      } finally {
        r.represent();
      }
    }
    ctx.strokeStyle = '#818d9e';
    ctx.lineWidth = dpr;
    ctx.strokeRect(left, top, pw, ph);
    ctx.fillStyle = '#9aa5b5';
    ctx.font = `${11 * dpr}px system-ui`;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 2; i++) {
      const depth = ((sim.displayed.bmode.depthMm / 10) * i) / 2;
      ctx.fillText(`${depth.toFixed(1)}`, left - 6 * dpr, top + (ph * i) / 2 + (i === 2 ? 0 : 10 * dpr));
    }
    ctx.textAlign = 'left';
    ctx.fillText('cm', 4 * dpr, H - 5 * dpr);
    ctx.fillText(`−${seconds} s`, left, H - 5 * dpr);
    ctx.textAlign = 'right';
    ctx.fillText(`t ${t.toFixed(2)} s`, left + pw, H - 5 * dpr);
    this.painted = key;
  }
}
