import type { Simulator } from '../app/simulator';
import { HeartFailureModel, measureHere, measureProtocol, type SiteMeasurement } from '../app/heartFailure';
import {
  PROTOCOLS,
  evaluateProtocol,
  protocolById,
  protocolSites,
  siteKey,
  siteReadable,
  type Protocol,
  type ProtocolId,
  type ProtocolResult,
  type Site,
  type SiteObservation,
} from '../lus/protocols';
import type { FillingControl, Phenotype } from '../physiology/hemodynamics';
import { button, note, row, slider } from './controls';

/**
 * Panel de insuficiencia cardiaca (lus-sim, decisión 52; `docs/HEART_FAILURE.md` §7), cargado al abrirlo (chunk diferido): el
 * mando hemodinámico, la cinética del agua y el mapa del protocolo con lo medido sobre la señal. Nada de lo que muestra se
 * elige por el caso: el mando cambia el agua y la aireación del paciente; las cifras son las del detector de líneas B sobre la
 * imagen formada, en el sitio que el alumno adquirió («Medir aquí») o en la pose ideal de cada sitio («Verdad del modelo»,
 * modo docente, que mueve la sonda y la devuelve).
 */
type ControlKind = FillingControl['kind'];

const CONTROL_LABEL: Record<ControlKind, string> = {
  pcwp: 'PCWP (enclavamiento)',
  lap: 'PAI (aurícula izquierda)',
  lvedp: 'PD2VI (diastólica final del VI)',
  evlwi: 'EVLWI (agua extravascular)',
};
const PHENOTYPE_LABEL: Record<Phenotype, string> = { hfpef: 'FE preservada', hfref: 'FE reducida', healthy: 'Sin IC' };
const LINE_ORDER = ['parasternal', 'midclavicular', 'anteriorAxillary', 'midaxillary', 'posteriorAxillary'] as const;
const LINE_SHORT: Record<(typeof LINE_ORDER)[number], string> = {
  parasternal: 'PE',
  midclavicular: 'MC',
  anteriorAxillary: 'AA',
  midaxillary: 'AM',
  posteriorAxillary: 'AP',
};

const CSS = `
.hf-dialog { position: fixed; z-index: 40; inset: 64px auto auto 16px; margin: 0; width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 80px);
  padding: 0; border: 1px solid var(--border); border-radius: 10px; color: var(--text); background: var(--panel);
  box-shadow: 0 24px 80px #0008; }
.hf-dialog[open] { display: flex; flex-direction: column; }
.hf-body { overflow-y: auto; padding: 0 20px 16px; display: grid; gap: 14px; scrollbar-width: thin; }
.hf-body h3 { margin: 12px 0 0; font-size: 14px; font-weight: 600; }
.hf-body select { width: 100%; background: var(--panel-2); color: var(--text); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px 8px; font: inherit; }
.hf-status { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.hf-warn { color: var(--accent-2); font-size: 12px; line-height: 1.4; }
.hf-map { width: 100%; height: auto; display: block; }
.hf-map text { font: 11px var(--mono); fill: var(--text); text-anchor: middle; dominant-baseline: central; }
.hf-map .hf-axis { fill: var(--muted); font-size: 10px; }
.hf-totals { display: grid; grid-template-columns: auto 1fr 1fr; gap: 4px 12px; font-size: 13px; }
.hf-totals .hf-head { color: var(--muted); font-size: 12px; }
.hf-flags { margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
`;

/** Color de una celda del mapa por su valor (0–10): del fondo al acento; sin medir, gris. */
function cellColor(v: number | null): string {
  if (v === null) return 'var(--panel-3)';
  const t = Math.min(1, v / 10);
  return `color-mix(in srgb, var(--accent) ${Math.round(15 + 85 * t)}%, var(--panel-2))`;
}

export class HeartFailurePanel {
  readonly dialog: HTMLDialogElement;
  private readonly model: HeartFailureModel;
  private kind: ControlKind = 'pcwp';
  private value = 12;
  private phenotype: Phenotype = 'hfpef';
  private rap = 6;
  private protocol: Protocol = protocolById('zones8count');
  private student = new Map<string, SiteObservation>();
  private truth: Map<string, SiteObservation> | null = null;
  private lastT: number | null = null;
  private readonly status: HTMLElement;
  private readonly mapHost: HTMLElement;
  private readonly totals: HTMLElement;
  private readonly flags: HTMLUListElement;
  private readonly hint: HTMLElement;
  private readonly valueSlider: { sync(): void };

  constructor(
    private readonly sim: () => Simulator,
    private readonly frozen: () => boolean,
  ) {
    this.model = new HeartFailureModel(sim);
    if (!document.getElementById('hf-style')) {
      const st = document.createElement('style');
      st.id = 'hf-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'hf-dialog';
    this.dialog.setAttribute('aria-label', 'Insuficiencia cardiaca: mando hemodinámico y protocolos');
    const head = document.createElement('div');
    head.className = 'settings-heading';
    const h = document.createElement('h2');
    h.textContent = 'Insuficiencia cardiaca';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'secondary';
    close.textContent = 'Cerrar';
    close.addEventListener('click', () => this.dialog.close());
    head.append(h, close);
    const body = document.createElement('div');
    body.className = 'hf-body';
    this.dialog.append(head, body);
    document.body.appendChild(this.dialog);

    // — mando —
    const h1 = document.createElement('h3');
    h1.textContent = 'Mando hemodinámico';
    body.appendChild(h1);
    const kindSel = this.select(
      body,
      'Variable de mando',
      (Object.keys(CONTROL_LABEL) as ControlKind[]).map((k) => [k, CONTROL_LABEL[k]]),
      () => this.kind,
      (k) => {
        this.kind = k;
        this.value = k === 'evlwi' ? 7.4 : 12;
        this.valueSlider.sync();
      },
    );
    void kindSel;
    this.valueSlider = slider(
      body,
      {
        label: 'Valor',
        min: 0,
        max: () => (this.kind === 'evlwi' ? 30 : 40),
        step: 0.5,
        get: () => this.value,
        set: (v) => (this.value = v),
        format: (v) => `${v.toFixed(1).replace('.', ',')} ${this.kind === 'evlwi' ? 'mL/kg' : 'mmHg'}`,
      },
      () => undefined,
    );
    this.select(
      body,
      'Fenotipo',
      (Object.keys(PHENOTYPE_LABEL) as Phenotype[]).map((k) => [k, PHENOTYPE_LABEL[k]]),
      () => this.phenotype,
      (p) => (this.phenotype = p),
    );
    slider(
      body,
      { label: 'PAD', min: 0, max: 25, step: 1, get: () => this.rap, set: (v) => (this.rap = v), format: (v) => `${v} mmHg` },
      () => undefined,
    );
    const warn = document.createElement('div');
    warn.className = 'hf-warn';
    warn.textContent =
      'PAI, PD2VI y PCWP se tratan como una sola presión de llenado izquierda (supuesto del modelo). Las líneas B no cambian en ' +
      'el instante en que se mueve la presión: el agua sigue su cinética.';
    body.appendChild(warn);
    const r1 = row(body);
    button(r1, 'Aplicar', () => this.apply(false));
    button(r1, 'Aplicar en equilibrio', () => this.apply(true));
    const r2 = row(body);
    button(r2, 'Esperar 10 min', () => this.wait(10));
    button(r2, 'Esperar 1 h', () => this.wait(60));
    button(r2, 'Pulmón normal', () => {
      this.model.reset();
      this.truth = null;
      this.render();
    });
    this.status = note(body);
    this.status.classList.add('hf-status');

    // — protocolo —
    const h2 = document.createElement('h3');
    h2.textContent = 'Protocolo';
    body.appendChild(h2);
    this.select(
      body,
      'Protocolo',
      PROTOCOLS.map((p) => [p.id, p.label]),
      () => this.protocol.id,
      (id: ProtocolId) => {
        this.protocol = protocolById(id);
        this.render();
      },
    );
    this.hint = note(body);
    const r3 = row(body);
    button(r3, 'Medir aquí', () => this.measureStudent());
    button(r3, 'Verdad del modelo', () => this.measureTruth());
    button(r3, 'Borrar medidas', () => {
      this.student.clear();
      this.truth = null;
      this.render();
    });
    this.mapHost = document.createElement('div');
    body.appendChild(this.mapHost);
    this.totals = document.createElement('div');
    this.totals.className = 'hf-totals';
    body.appendChild(this.totals);
    this.flags = document.createElement('ul');
    this.flags.className = 'hf-flags';
    body.appendChild(this.flags);
    const conv = document.createElement('div');
    conv.className = 'hf-warn';
    conv.textContent =
      'Cada cifra sale del detector de líneas B sobre la imagen. La conversión entre protocolos es una predicción del modelo: no ' +
      'hay una conversión validada entre 4, 8 y 28 zonas.';
    body.appendChild(conv);

    // el agua avanza con el reloj del simulador
    window.setInterval(() => this.tick(), 1000);
    this.render();
  }

  open(): void {
    if (!this.dialog.open) this.dialog.show();
    this.render();
  }

  private select<T extends string>(
    parent: HTMLElement,
    label: string,
    options: Array<[T, string]>,
    get: () => T,
    set: (v: T) => void,
  ): HTMLSelectElement {
    const wrap = document.createElement('label');
    wrap.className = 'control';
    wrap.textContent = label;
    const s = document.createElement('select');
    for (const [v, t] of options) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      s.appendChild(o);
    }
    s.value = get();
    s.addEventListener('change', () => set(s.value as T));
    wrap.appendChild(s);
    parent.appendChild(wrap);
    return s;
  }

  private control(): FillingControl {
    return this.kind === 'evlwi' ? { kind: 'evlwi', mlKg: this.value } : { kind: this.kind, mmHg: this.value };
  }

  private apply(equilibrate: boolean): void {
    this.model.setInput({ control: this.control(), phenotype: this.phenotype, rapMmHg: this.rap }, equilibrate);
    this.truth = null;
    this.render();
  }

  private wait(minutes: number): void {
    this.model.wait(minutes);
    this.truth = null;
    this.render();
  }

  private tick(): void {
    const t = this.sim().sample.t;
    if (this.lastT !== null && t > this.lastT && this.sim().patient.lung) this.model.step(t - this.lastT);
    this.lastT = t;
    if (this.dialog.open) this.renderStatus();
  }

  private measureStudent(): void {
    if (this.frozen()) {
      this.hint.textContent = 'La imagen está congelada: reanúdala para medir.';
      return;
    }
    const m: SiteMeasurement | null = measureHere(this.sim(), this.protocol);
    if (!m) {
      this.hint.textContent = 'La sonda no está sobre ningún sitio de este protocolo (a ≤ 15 mm de su centro).';
      return;
    }
    this.student.set(siteKey(m.site), m.observation);
    this.hint.textContent = siteReadable(m.observation)
      ? `Medido en ${this.siteName(m.site)}: ${m.observation.count} líneas B${m.observation.confluent ? ' (confluentes)' : ''}.`
      : `En ${this.siteName(m.site)} la ganancia satura la pared como la pleura: no se puede contar. Baja la ganancia y mide de nuevo.`;
    this.render();
  }

  private measureTruth(): void {
    if (this.frozen()) {
      this.hint.textContent = 'La imagen está congelada: reanúdala para medir.';
      return;
    }
    this.hint.textContent = 'Midiendo cada sitio en su pose ideal…';
    window.setTimeout(() => {
      const m = measureProtocol(this.sim(), this.protocol, { frames: 2 });
      this.truth = new Map(m.sites.map((s) => [siteKey(s.site), s.observation]));
      this.hint.textContent = 'Verdad del modelo: la misma física y el mismo detector en la pose ideal de cada sitio.';
      this.render();
    }, 20);
  }

  private siteName(s: Site): string {
    return `${s.side === 'right' ? 'derecho' : 'izquierdo'}, ${LINE_SHORT[s.line]} EIC ${s.ics}`;
  }

  private renderStatus(): void {
    const e = this.model.evlwi();
    const lung = this.sim().patient.lung;
    this.status.textContent = lung
      ? `EVLWI ${e.now.toFixed(1).replace('.', ',')} mL/kg (equilibrio ${e.steady.toFixed(1).replace('.', ',')}) · ` +
        `${this.model.minutesSinceChange.toFixed(0)} min desde el cambio`
      : 'Pulmón normal (sin mando aplicado)';
  }

  private render(): void {
    this.renderStatus();
    const p = this.protocol;
    const sites = protocolSites(p);
    const studentR = evaluateProtocol(p, this.student);
    const truthR = this.truth ? evaluateProtocol(p, this.truth) : null;
    this.mapHost.replaceChildren(this.map(sites));
    const fmt = (r: ProtocolResult | null) =>
      r === null
        ? '—'
        : `${r.total}${p.value === 'positive' ? ' zonas +' : ''}${r.complete ? '' : ' (incompleto)'}${r.band ? ` · ${r.band}` : ''}`;
    this.totals.replaceChildren();
    for (const [a, b, c] of [
      ['', 'Medido (alumno)', 'Modelo (pose ideal)'],
      ['Total', fmt(studentR), fmt(truthR)],
      [
        'Zonas + der./izq.',
        `${studentR.positive.right} / ${studentR.positive.left}`,
        truthR ? `${truthR.positive.right} / ${truthR.positive.left}` : '—',
      ],
    ]) {
      for (const [i, t] of [a, b, c].entries()) {
        const d = document.createElement('div');
        d.textContent = t;
        if (a === '' || i === 0) d.className = 'hf-head';
        this.totals.appendChild(d);
      }
    }
    this.flags.replaceChildren();
    const flagged = new Set([...studentR.flags.map((f) => `Alumno: ${f}`), ...(truthR?.flags ?? []).map((f) => `Modelo: ${f}`)]);
    for (const f of flagged) {
      const li = document.createElement('li');
      const src = p.flags.find((x) => f.endsWith(x.label))?.source;
      li.textContent = src ? `${f} [${src}]` : f;
      this.flags.appendChild(li);
    }
    const li = document.createElement('li');
    li.textContent = `${p.description} Fuentes: ${p.sources.join(', ')}.`;
    this.flags.appendChild(li);
  }

  /** El mapa del protocolo: cada lado con sus líneas (columnas) y espacios intercostales (filas); en cada sitio, alumno | modelo. */
  private map(sites: Site[]): SVGSVGElement {
    const NS = 'http://www.w3.org/2000/svg';
    const icsList = [...new Set(sites.map((s) => s.ics))].sort((a, b) => a - b);
    const cw = 44;
    const ch = 30;
    const sideW = LINE_ORDER.length * cw;
    const W = 2 * sideW + 60;
    const H = 30 + icsList.length * ch + 10;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'hf-map');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Mapa del protocolo ${this.protocol.label}: líneas B por sitio, alumno y modelo`);
    const text = (x: number, y: number, t: string, cls?: string) => {
      const e = document.createElementNS(NS, 'text');
      e.setAttribute('x', String(x));
      e.setAttribute('y', String(y));
      if (cls) e.setAttribute('class', cls);
      e.textContent = t;
      svg.appendChild(e);
    };
    // el lado derecho del paciente a la izquierda de la pantalla (como al mirarlo de frente); de la línea media hacia fuera
    const x0 = (side: Site['side'], li: number) => (side === 'right' ? sideW - (li + 1) * cw : sideW + 60 + li * cw);
    for (const side of ['right', 'left'] as const) {
      text(side === 'right' ? sideW / 2 : sideW + 60 + sideW / 2, 8, side === 'right' ? 'Derecho' : 'Izquierdo', 'hf-axis');
      LINE_ORDER.forEach((l, li) => text(x0(side, li) + cw / 2, 22, LINE_SHORT[l], 'hf-axis'));
    }
    icsList.forEach((n, k) => text(sideW + 30, 30 + k * ch + ch / 2, `EIC ${n}`, 'hf-axis'));
    for (const s of sites) {
      const li = LINE_ORDER.indexOf(s.line);
      const k = icsList.indexOf(s.ics);
      const x = x0(s.side, li);
      const y = 30 + k * ch;
      const st = this.student.get(siteKey(s));
      const tr = this.truth?.get(siteKey(s));
      const half = (dx: number, o: SiteObservation | undefined) => {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', String(x + 2 + dx));
        r.setAttribute('y', String(y + 2));
        r.setAttribute('width', String(cw / 2 - 3));
        r.setAttribute('height', String(ch - 4));
        r.setAttribute('rx', '3');
        const v = o && siteReadable(o) ? Math.min(10, o.count) : null;
        r.setAttribute('fill', cellColor(v));
        svg.appendChild(r);
        text(x + 2 + dx + (cw / 2 - 3) / 2, y + ch / 2, !o ? '·' : v === null ? '?' : `${v}${o.confluent ? '*' : ''}`);
      };
      half(0, st);
      half(cw / 2 - 1, tr);
    }
    return svg;
  }
}

let panel: HeartFailurePanel | null = null;

/** Abre (o crea) el panel de insuficiencia cardiaca. */
export function openHeartFailurePanel(sim: () => Simulator, frozen: () => boolean): HeartFailurePanel {
  panel ??= new HeartFailurePanel(sim, frozen);
  panel.open();
  return panel;
}
