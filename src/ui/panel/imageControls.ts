import { EQUIPMENT_LIMITS } from '../../app/equipment';
import { COMPOUND } from '../../ultrasound/compound';
import { button, controlId, note, row, slider, type SliderSpec } from '../controls';
import { formatDepthMm } from '../format';
import type { PanelContext } from './context';

/**
 * Mandos básicos de la imagen 2D (profundidad, ganancia, foco), a mano mientras se busca la ventana.
 *
 * Valores de la adquisición mostrada; el foco solo llega hasta la profundidad actual. Un ajuste abierto
 * cada vez, con controles nativos y unidades iguales a las del HUD.
 */
export function buildImageBasics(ctx: PanelContext, sec: HTMLElement): void {
  const s = ctx.sim;
  const controls: Array<[string, SliderSpec]> = [
    [
      'depth',
      {
        label: 'Profundidad',
        ...EQUIPMENT_LIMITS.depthMm,
        get: () => s().displayed.bmode.depthMm,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { depthMm: v } }),
        format: formatDepthMm,
      },
    ],
    [
      'gain',
      {
        label: 'Ganancia',
        ...EQUIPMENT_LIMITS.gainDb,
        get: () => s().displayed.bmode.gainDb,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { gainDb: v } }),
        format: (v) => `${v} dB`,
      },
    ],
    [
      'focus',
      {
        label: 'Foco',
        min: EQUIPMENT_LIMITS.focusMm.min,
        max: () => s().displayed.bmode.depthMm,
        step: 1,
        get: () => s().displayed.bmode.focusMm,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { focusMm: v } }),
        format: formatDepthMm,
      },
    ],
  ];
  const closers: Array<() => void> = [];
  for (const [id, spec] of controls) {
    const host = document.createElement('div');
    host.className = 'quick-control';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = `quick-${id}`;
    toggle.className = 'quick-toggle';
    toggle.dataset['acquisitionCommand'] = 'true';
    const label = document.createElement('span');
    label.textContent = spec.label;
    const value = document.createElement('strong');
    toggle.append(label, value);
    const pop = document.createElement('div');
    pop.id = `quick-${id}-panel`;
    pop.className = 'quick-popover';
    pop.hidden = true;
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', `Ajustar ${spec.label.toLowerCase()}`);
    toggle.setAttribute('aria-controls', pop.id);
    toggle.setAttribute('aria-expanded', 'false');
    ctx.track(slider(pop, spec, () => undefined));
    if (id === 'depth') note(pop, 'Cambiar la profundidad inicia un nuevo cine.');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'quick-close';
    close.textContent = 'Listo';
    close.setAttribute('aria-label', `Cerrar ${spec.label.toLowerCase()}`);
    pop.append(close);
    const setOpen = (open: boolean, focus = false) => {
      pop.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (focus) (open ? pop.querySelector('input') : toggle)?.focus();
    };
    closers.push(() => setOpen(false));
    toggle.addEventListener('click', () => {
      const open = pop.hidden;
      for (const dismiss of closers) dismiss();
      setOpen(open, true);
    });
    close.addEventListener('click', () => setOpen(false, true));
    document.addEventListener('pointerdown', (e) => {
      if (!host.contains(e.target as Node)) setOpen(false);
    });
    host.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !host.contains(e.relatedTarget as Node)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || pop.hidden) return;
      setOpen(false, true);
      e.stopPropagation();
    });
    ctx.track({
      sync: () => {
        const text = spec.format?.(spec.get()) ?? String(spec.get());
        if (value.textContent !== text) value.textContent = text;
        if (ctx.store.get().frozen) setOpen(false);
      },
    });
    host.append(toggle, pop);
    sec.append(host);
  }
}

/** Explicación de los mandos avanzados (el ⓘ de su sección). */
export const IMAGE_ADVANCED_INFO =
  `Composición espacial: tres miradas intercaladas (0° y ±${COMPOUND.steerDeg}°) promediadas; el moteado pierde contraste ` +
  'con el mismo grano y las sombras se acortan. Armónica (THI): emite a 1,75 MHz y forma la imagen con el armónico de ' +
  '3,5 MHz que genera el propio tejido; menos neblina junto a las paredes y menos reverberación y transitorio en el campo ' +
  'cercano, a cambio de algo más de ruido en profundidad. El preajuste pulmonar las apaga, con la persistencia: el ' +
  'promediado oculta un deslizamiento sutil. TGC, de superficial a profundo: amplifica ecos y ruido por igual; no ' +
  'recupera lo que la atenuación extinguió.';

/** Mandos avanzados de la imagen 2D: rango dinámico, persistencia, composición espacial, armónica y TGC de 8 bandas. */
export function buildImageAdvanced(ctx: PanelContext, sec: HTMLElement): void {
  const s = ctx.sim;
  const ch = () => undefined;
  ctx.track(
    slider(
      sec,
      {
        label: 'Rango dinámico',
        min: EQUIPMENT_LIMITS.dynamicRangeDb.min,
        max: EQUIPMENT_LIMITS.dynamicRangeDb.max,
        step: 2,
        get: () => s().displayed.bmode.dynamicRangeDb,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { dynamicRangeDb: v } }),
        format: (v) => `${v} dB`,
      },
      ch,
    ),
  );
  ctx.track(
    slider(
      sec,
      {
        label: 'Persistencia',
        min: EQUIPMENT_LIMITS.persistence.min,
        max: EQUIPMENT_LIMITS.persistence.max,
        step: 0.05,
        get: () => s().displayed.bmode.persistence,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { persistence: v } }),
        format: (v) => v.toFixed(2),
      },
      ch,
    ),
  );
  // Composición espacial (decisión 58 de VExUS): el conmutador
  ctx.track(
    button(
      row(sec),
      'Composición espacial',
      () => ctx.dispatch({ type: 'compound', enabled: !s().bmode.compound }),
      () => s().displayed.bmode.compound,
    ),
  );
  // Armónica tisular (decisión 77 de VExUS): el conmutador
  ctx.track(
    button(
      row(sec),
      'Armónica (THI)',
      () => ctx.dispatch({ type: 'harmonic', enabled: !s().bmode.harmonic }),
      () => s().displayed.bmode.harmonic,
    ),
  );
  note(sec, 'TGC · superficial → profundo');
  const bank = document.createElement('div');
  bank.className = 'tgc';
  // cada banda con su número debajo (`<label for>`); el nombre accesible dice cuál es y a qué profundidad
  for (let i = 0; i < 8; i++) {
    const band = document.createElement('div');
    band.className = 'tgc-band';
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.id = controlId(`tgc-${i + 1}`);
    inp.min = String(EQUIPMENT_LIMITS.tgcDb.min);
    inp.max = String(EQUIPMENT_LIMITS.tgcDb.max);
    inp.step = '1';
    inp.title = `TGC banda ${i + 1} (${i < 4 ? 'superficial' : 'profunda'})`;
    inp.setAttribute('aria-label', inp.title);
    inp.addEventListener('input', () => ctx.dispatch({ type: 'tgc', band: i, db: Number(inp.value) }));
    const l = document.createElement('label');
    l.htmlFor = inp.id;
    l.textContent = String(i + 1);
    band.append(inp, l);
    bank.appendChild(band);
    ctx.track({
      sync: () => {
        const value = String(s().displayed.bmode.tgcDb[i]);
        inp.value = value;
        inp.setAttribute('aria-valuetext', `${value} dB`);
      },
    });
  }
  sec.appendChild(bank);
}
