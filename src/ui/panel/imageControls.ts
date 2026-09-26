import { EQUIPMENT_LIMITS } from '../../app/equipment';
import { COMPOUND } from '../../ultrasound/compound';
import { button, controlId, note, row, slider } from '../controls';
import type { PanelContext } from './context';

/**
 * Mandos básicos de la imagen 2D (profundidad, ganancia, foco), a mano mientras se busca la ventana.
 *
 * lus-sim (decisión 13): el foco llega hasta la profundidad máxima del equipo (`EQUIPMENT_LIMITS.focusMm`) y las
 * explicaciones no nombran el color ni el PW, que lus-sim no tiene.
 */
export function buildImageBasics(ctx: PanelContext, sec: HTMLElement): void {
  const s = ctx.sim;
  const ch = () => undefined;
  ctx.track(
    slider(
      sec,
      {
        label: 'Profundidad',
        ...EQUIPMENT_LIMITS.depthMm,
        get: () => s().bmode.depthMm,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { depthMm: v } }),
        format: (v) => `${(v / 10).toFixed(0)} cm`,
      },
      ch,
    ),
  );
  ctx.track(
    slider(
      sec,
      {
        label: 'Ganancia',
        ...EQUIPMENT_LIMITS.gainDb,
        get: () => s().bmode.gainDb,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { gainDb: v } }),
        format: (v) => `${v} dB`,
      },
      ch,
    ),
  );
  ctx.track(
    slider(
      sec,
      {
        label: 'Foco',
        min: EQUIPMENT_LIMITS.focusMm.min,
        max: EQUIPMENT_LIMITS.focusMm.max,
        step: 5,
        get: () => s().bmode.focusMm,
        set: (v) => ctx.dispatch({ type: 'bmode', patch: { focusMm: v } }),
        format: (v) => `${(v / 10).toFixed(1)} cm`,
      },
      ch,
    ),
  );
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
        get: () => s().bmode.dynamicRangeDb,
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
        get: () => s().bmode.persistence,
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
      () => s().bmode.compound,
    ),
  );
  // Armónica tisular (decisión 77 de VExUS): el conmutador
  ctx.track(
    button(
      row(sec),
      'Armónica (THI)',
      () => ctx.dispatch({ type: 'harmonic', enabled: !s().bmode.harmonic }),
      () => s().bmode.harmonic,
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
    ctx.track({ sync: () => (inp.value = String(s().bmode.tgcDb[i])) });
  }
  sec.appendChild(bank);
}
