import type { BModeSettings } from '../ultrasound/renderer';
import type { EquipmentSettings } from './simulator';

/**
 * Estado del ecógrafo como modelo de dominio (Fase 1): inmutable, cambiado solo por comandos y
 * siempre normalizado con las invariantes físicas del equipo. Antes la UI, el teclado y el clic
 * sobre la imagen mutaban `sim.bmode/color/pw` directamente y cada uno aplicaba (o no) sus
 * propios límites: al reducir la profundidad la puerta PW o la caja de color quedaban fuera de
 * la imagen, y la PRF podía superar lo que permite la profundidad.
 *
 * lus-sim (decisión 12): solo el modo B (profundidad, ganancia, TGC, foco, rango dinámico, persistencia,
 * composición y armónica). Sin el color, el PW ni el modo M de VExUS (el modo M pulmonar llega en la fase 2) ni sus
 * comandos, límites y la invariante del tríplex.
 */
export type EquipmentCommand =
  | { type: 'bmode'; patch: Partial<BModeSettings> }
  | { type: 'stepDepth'; deltaMm: number }
  | { type: 'stepGain'; deltaDb: number }
  | { type: 'tgc'; band: number; db: number }
  /** Composición espacial (decisión 58): el conmutador del equipo. */
  | { type: 'compound'; enabled: boolean }
  /** Armónica tisular (decisión 77): el conmutador del equipo; solo cambia el modo B. */
  | { type: 'harmonic'; enabled: boolean };

/** Contexto físico que fija los límites: semiángulo del sector y velocidad de reconstrucción. */
export interface EquipmentContext {
  halfSectorRad: number;
  cMmS: number;
}

/** Límites del equipo (deslizadores, atajos y normalización comparten estos valores). */
export const EQUIPMENT_LIMITS = {
  depthMm: { min: 60, max: 240, step: 5 },
  gainDb: { min: -20, max: 20, step: 1 },
  // lus-sim (decisión 17): el foco baja hasta la pleura de la pared torácica más delgada (10 mm en la variante delgada)
  focusMm: { min: 8, max: 240 },
  dynamicRangeDb: { min: 40, max: 80 },
  persistence: { min: 0, max: 0.8 },
  tgcDb: { min: -15, max: 15 },
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Aplica todas las invariantes. Idempotente: normalizar dos veces no cambia nada. */
export function normalizeEquipment(e: EquipmentSettings, _ctx: EquipmentContext): EquipmentSettings {
  const L = EQUIPMENT_LIMITS;
  const depth = clamp(e.bmode.depthMm, L.depthMm.min, L.depthMm.max);
  const bmode: BModeSettings = {
    ...e.bmode,
    depthMm: depth,
    focusMm: clamp(e.bmode.focusMm, L.focusMm.min, depth),
    gainDb: clamp(e.bmode.gainDb, L.gainDb.min, L.gainDb.max),
    dynamicRangeDb: clamp(e.bmode.dynamicRangeDb, L.dynamicRangeDb.min, L.dynamicRangeDb.max),
    persistence: clamp(e.bmode.persistence, L.persistence.min, L.persistence.max),
    tgcDb: e.bmode.tgcDb.map((v) => clamp(v, L.tgcDb.min, L.tgcDb.max)),
  };
  return { bmode };
}

/** Reductor puro: estado + comando → estado normalizado. */
export function reduceEquipment(e: EquipmentSettings, cmd: EquipmentCommand, ctx: EquipmentContext): EquipmentSettings {
  let next: EquipmentSettings;
  switch (cmd.type) {
    case 'bmode':
      next = { ...e, bmode: { ...e.bmode, ...cmd.patch } };
      break;
    case 'stepDepth':
      next = { ...e, bmode: { ...e.bmode, depthMm: e.bmode.depthMm + cmd.deltaMm } };
      break;
    case 'stepGain':
      next = { ...e, bmode: { ...e.bmode, gainDb: e.bmode.gainDb + cmd.deltaDb } };
      break;
    case 'compound':
      next = { ...e, bmode: { ...e.bmode, compound: cmd.enabled } };
      break;
    case 'harmonic':
      next = { ...e, bmode: { ...e.bmode, harmonic: cmd.enabled } };
      break;
    case 'tgc': {
      const tgcDb = [...e.bmode.tgcDb];
      if (cmd.band >= 0 && cmd.band < tgcDb.length) tgcDb[cmd.band] = cmd.db;
      next = { ...e, bmode: { ...e.bmode, tgcDb } };
      break;
    }
  }
  return normalizeEquipment(next, ctx);
}

type Listener = (next: EquipmentSettings, prev: EquipmentSettings) => void;

/**
 * Dueño del estado del equipo: sobrevive a los cambios de caso (el simulador nuevo recibe el
 * mismo estado) y avisa a las vistas en cada cambio, sin sondeo.
 */
export class EquipmentController {
  private listeners = new Set<Listener>();

  constructor(
    private current: EquipmentSettings,
    private readonly ctx: EquipmentContext,
  ) {
    this.current = normalizeEquipment(current, ctx);
  }

  get state(): EquipmentSettings {
    return this.current;
  }

  dispatch(cmd: EquipmentCommand): void {
    const prev = this.current;
    this.current = reduceEquipment(prev, cmd, this.ctx);
    for (const l of this.listeners) l(this.current, prev);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
