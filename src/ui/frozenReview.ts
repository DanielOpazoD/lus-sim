import type { Simulator } from '../app/simulator';
import { FrameCaliper, validPoint, type BeamPoint } from '../measure/manualDistance';
import { drawOverlay } from './displays';

/** Herramientas manuales del cuadro B mostrado. No modifica señal, equipo, sonda ni reloj. */
export class FrozenReview {
  private readonly caliper = new FrameCaliper();
  private readonly tools = document.createElement('div');
  private readonly layer = document.createElement('canvas');
  private readonly measure: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly aButton: HTMLButtonElement;
  private readonly bButton: HTMLButtonElement;
  private readonly png: HTMLButtonElement;
  private readonly json: HTMLButtonElement;
  private readonly value: HTMLOutputElement;
  private readonly help: HTMLElement;
  private active = false;
  private target: 0 | 1 = 0;
  private cursor: BeamPoint = { theta: 0, r: 0 };
  private lost = false;
  private busy = false;
  private painted = '';
  private notice = 'Distancia manual sobre B. Sin interpretación diagnóstica.';

  constructor(
    private readonly host: HTMLElement,
    bar: HTMLElement,
    private readonly getSim: () => Simulator,
    private readonly onError: (error: unknown) => void,
  ) {
    this.tools.id = 'review-tools';
    this.tools.setAttribute('role', 'group');
    this.tools.setAttribute('aria-label', 'Revisión del cuadro congelado');
    this.tools.innerHTML = `
      <button id="review-measure" aria-pressed="false">Medir distancia</button>
      <button id="review-a" aria-label="Ajustar punto A" hidden>A</button>
      <button id="review-b" aria-label="Ajustar punto B" hidden>B</button>
      <button id="review-clear" class="secondary" hidden>Borrar</button>
      <output id="review-value" aria-live="polite">Sin medición</output>
      <button id="review-png" class="secondary">Guardar PNG</button>
      <button id="review-json" class="secondary">Datos JSON</button>
      <p id="review-help" class="note" role="status"></p>`;
    bar.append(this.tools);
    const button = (id: string) => this.tools.querySelector<HTMLButtonElement>(`#${id}`)!;
    this.measure = button('review-measure');
    this.clearButton = button('review-clear');
    this.aButton = button('review-a');
    this.bButton = button('review-b');
    this.png = button('review-png');
    this.json = button('review-json');
    this.value = this.tools.querySelector<HTMLOutputElement>('#review-value')!;
    this.help = this.tools.querySelector<HTMLElement>('#review-help')!;
    this.layer.id = 'caliper-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    host.append(this.layer);
    this.measure.addEventListener('click', () => {
      if (!this.available()) return;
      if (this.active) this.finish();
      else this.edit(0);
    });
    this.aButton.addEventListener('click', () => this.edit(0));
    this.bButton.addEventListener('click', () => this.edit(1));
    this.clearButton.addEventListener('click', () => {
      this.caliper.clear();
      this.finish();
      this.notice = 'Medición borrada.';
      this.measure.focus({ preventScroll: true });
      this.sync(this.lost);
    });
    this.png.addEventListener('click', () => void this.export('png'));
    this.json.addEventListener('click', () => void this.export('json'));
    host.addEventListener('pointerdown', (event) => this.pointer(event), true);
    host.addEventListener('keydown', (event) => this.keyboard(event), true);
  }

  private available(): boolean {
    const s = this.getSim();
    return s.frozen && !this.lost && s.renderer.cineShownFrame !== null;
  }

  private finish(): void {
    this.active = false;
    this.host.classList.remove('review-measuring');
    this.host.removeAttribute('aria-describedby');
  }

  private edit(index: 0 | 1): void {
    this.sync(this.lost);
    if (!this.available()) return;
    this.target = index;
    this.cursor = this.caliper.endpoints[index] ?? { theta: 0, r: this.getSim().displayed.bmode.depthMm / 3 };
    this.active = true;
    this.host.classList.add('review-measuring');
    this.host.setAttribute('aria-describedby', 'review-help');
    this.host.focus({ preventScroll: true });
    this.sync(this.lost);
  }

  private commit(point: BeamPoint): void {
    const s = this.getSim();
    this.caliper.set(this.target, point, s.transducer, s.displayed.bmode.depthMm);
    if (this.target === 0 && !this.caliper.endpoints[1]) {
      this.target = 1;
      this.cursor = { ...point };
    } else {
      this.finish();
      this.notice = 'Distancia en el plano de la imagen. A/B permiten ajustar los extremos.';
      this.measure.focus({ preventScroll: true });
    }
    this.sync(this.lost);
  }

  private pointer(event: PointerEvent): void {
    if (!this.active || !this.available() || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const s = this.getSim();
    const r = s.renderer;
    const box = this.host.getBoundingClientRect();
    const point = r.pixelToBeam(
      ((event.clientX - box.left) / box.width) * r.canvas.width,
      ((event.clientY - box.top) / box.height) * r.canvas.height,
      s.transducer,
      s.displayed.bmode.depthMm,
    );
    if (point) this.commit(point);
  }

  private keyboard(event: KeyboardEvent): void {
    if (!this.active || !this.available() || event.target !== this.host || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation(); // Las flechas editan el calibre, no recorren simultáneamente el cine.
    if (event.key === 'Escape') {
      this.finish();
      this.measure.focus({ preventScroll: true });
    } else if (event.key === 'Enter') {
      this.commit(this.cursor);
    } else {
      const s = this.getSim();
      const r = s.renderer;
      const point = r.beamToPixel(this.cursor.theta, this.cursor.r, s.transducer);
      const step = event.shiftKey ? 10 : 1; // Píxeles CSS; no precisión acústica declarada.
      const x =
        point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) * (r.canvas.width / this.host.clientWidth);
      const y =
        point.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) * (r.canvas.height / this.host.clientHeight);
      const next = r.pixelToBeam(x, y, s.transducer, s.displayed.bmode.depthMm);
      if (next && validPoint(next, s.transducer, s.displayed.bmode.depthMm)) this.cursor = next;
    }
    this.sync(this.lost);
  }

  sync(lost: boolean): void {
    this.lost = lost;
    const s = this.getSim();
    const allowed = this.available();
    const hadPoints = this.caliper.endpoints.some(Boolean);
    if (this.caliper.bind(allowed ? s.renderer : null, allowed ? s.renderer.cineShownFrame : null)) {
      this.finish();
      this.painted = '';
      this.notice = hadPoints
        ? 'Medición borrada al cambiar de cuadro o reanudar.'
        : 'Distancia manual sobre B. Sin interpretación diagnóstica.';
    }
    for (const button of [this.measure, this.aButton, this.bButton, this.clearButton, this.png, this.json])
      button.disabled = !allowed || this.busy;
    this.layer.hidden = !allowed;
    const [a, b] = this.caliper.endpoints;
    const editing = this.active || !!a || !!b;
    this.aButton.hidden = this.bButton.hidden = this.clearButton.hidden = !editing;
    this.aButton.disabled ||= !a;
    this.bButton.disabled ||= !b;
    this.measure.setAttribute('aria-pressed', String(this.active));
    const label = this.active ? 'Terminar medición' : 'Medir distancia';
    if (this.measure.textContent !== label) this.measure.textContent = label;
    const result = this.caliper.snapshot(s.transducer);
    const value = result ? `${result.distanceMm.toFixed(1).replace('.', ',')} mm` : 'Sin medición';
    if (this.value.value !== value) this.value.value = value;
    this.value.dataset.mm = result ? String(result.distanceMm) : '';
    const message = lost
      ? 'GPU no disponible. La medición se descarta; no se exporta una imagen perdida.'
      : this.active
        ? `Coloca ${this.target === 0 ? 'A' : 'B'}: toca la imagen o usa flechas y Enter. Mayús acelera; Escape termina.`
        : this.notice;
    if (this.help.textContent !== message) this.help.textContent = message;
    const canvas = s.renderer.canvas;
    const key = JSON.stringify([canvas.width, canvas.height, a, b, this.active, this.cursor, allowed]);
    if (key === this.painted) return;
    this.layer.width = canvas.width;
    this.layer.height = canvas.height;
    const ctx = this.layer.getContext('2d');
    if (!ctx) throw new Error('Calibre: contexto 2D no disponible');
    if (allowed) this.paint(ctx);
    this.painted = key;
  }

  private paint(ctx: CanvasRenderingContext2D): void {
    const s = this.getSim();
    const r = s.renderer;
    const ratio = r.canvas.width / this.host.clientWidth;
    const points = this.caliper.endpoints;
    ctx.save();
    ctx.strokeStyle = '#ffc857';
    ctx.fillStyle = '#ffc857';
    ctx.lineWidth = 1.5 * ratio;
    ctx.font = `${12 * ratio}px system-ui`;
    const projected = points.map((point) => (point ? r.beamToPixel(point.theta, point.r, s.transducer) : null));
    if (projected[0] && projected[1]) {
      ctx.beginPath();
      ctx.moveTo(projected[0].x, projected[0].y);
      ctx.lineTo(projected[1].x, projected[1].y);
      ctx.stroke();
    }
    const cross = (point: { x: number; y: number }, label: string) => {
      const d = 6 * ratio;
      ctx.beginPath();
      ctx.moveTo(point.x - d, point.y);
      ctx.lineTo(point.x + d, point.y);
      ctx.moveTo(point.x, point.y - d);
      ctx.lineTo(point.x, point.y + d);
      ctx.stroke();
      ctx.fillText(label, point.x + d, point.y - d);
    };
    projected.forEach((point, i) => {
      if (point) cross(point, i === 0 ? 'A' : 'B');
    });
    if (this.active) {
      ctx.setLineDash([3 * ratio, 3 * ratio]);
      cross(r.beamToPixel(this.cursor.theta, this.cursor.r, s.transducer), this.target === 0 ? 'A?' : 'B?');
    }
    ctx.restore();
  }

  private async export(format: 'png' | 'json'): Promise<void> {
    if (!this.available() || this.busy) return;
    this.sync(this.lost);
    const s = this.getSim();
    const r = s.renderer;
    this.busy = true;
    try {
      // Copia ANTES de cualquier espera: cambiar el cine durante toBlob no cambia esta captura.
      const metadata = structuredClone({
        schema: 'lus-sim.review/v1',
        synthetic: true,
        view: 'B',
        containsRawSignal: false,
        build: { version: __APP_VERSION__, commit: __GIT_COMMIT__ },
        acquisition: s.displayedAcquisition,
        bmode: s.displayed.bmode,
        transducer: s.transducer,
        image: { widthPx: r.canvas.width, heightPx: r.canvas.height },
        measurement: this.caliper.snapshot(s.transducer),
        warning: 'Uso educativo. Distancia geométrica manual en B; no es una medida clínica ni un diagnóstico. M no se exporta.',
      });
      const name = `lus-b-${metadata.build.commit.slice(0, 7)}-${metadata.acquisition.sample.t.toFixed(3).replace('.', '-')}`;
      let blob: Blob;
      if (format === 'json') {
        blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
      } else {
        r.represent(); // El framebuffer WebGL puede haberse descartado desde el último RAF congelado.
        const image = document.createElement('canvas');
        const W = r.canvas.width;
        const H = r.canvas.height;
        const header = 100;
        image.width = W;
        image.height = H + header;
        const ctx = image.getContext('2d');
        if (!ctx) throw new Error('Captura: contexto 2D no disponible');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H + header);
        ctx.drawImage(r.canvas, 0, header);
        const scale = document.createElement('canvas');
        scale.width = W;
        scale.height = H;
        drawOverlay(scale, s);
        ctx.drawImage(scale, 0, header);
        ctx.save();
        ctx.translate(0, header);
        // Exporta extremos confirmados, no el cursor pendiente de confirmar.
        const active = this.active;
        try {
          this.active = false;
          this.paint(ctx);
        } finally {
          this.active = active;
        }
        ctx.restore();
        ctx.fillStyle = '#d8dde5';
        ctx.font = '13px sans-serif';
        const b = metadata.bmode;
        const lines = [
          'lus-sim · B · Paciente sintético · Uso educativo',
          `t ${metadata.acquisition.sample.t.toFixed(3)} s · ${metadata.build.commit.slice(0, 7)}`,
          `${b.depthMm / 10} cm · G ${b.gainDb} dB · RD ${b.dynamicRangeDb} dB · F ${b.focusMm} mm`,
          metadata.measurement
            ? `Distancia manual: ${metadata.measurement.distanceMm.toFixed(1)} mm · Sin diagnóstico`
            : 'Sin medición · No es un dispositivo médico',
        ];
        lines.forEach((line, i) => ctx.fillText(line, 10, 19 + i * 23, W - 20));
        blob = await new Promise<Blob>((resolve, reject) => {
          image.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('Captura PNG: el navegador no produjo un archivo'))),
            'image/png',
          );
        });
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      this.notice = `Exportado ${format.toUpperCase()} del cuadro t ${metadata.acquisition.sample.t.toFixed(3)} s.`;
    } catch (error) {
      this.onError(error);
      this.notice = 'No se pudo exportar la captura. Reintenta sin cambiar de cuadro.';
    } finally {
      this.busy = false;
      this.sync(this.lost);
    }
  }
}
