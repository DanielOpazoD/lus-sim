/**
 * Textos del HUD de la imagen (esquinas) como función pura de una vista de solo lectura del simulador: se prueba
 * sin DOM y `main.ts` solo los pinta.
 *
 * lus-sim (decisión 13): solo el modo B; sin las líneas del color, del PW ni del modo M, ni el chip de contexto de
 * VExUS (que solo decía el modo Doppler).
 */
import { formatDepthMm } from '../format';

export interface HudInput {
  patientLabel: string;
  frozen: boolean;
  heartRateBpm: number;
  atrialFibrillation: boolean;
  transducerMHz: number;
  depthMm: number;
  gainDb: number;
  dynamicRangeDb: number;
  /** Composición espacial formándose (decisión 58 de VExUS: `compoundActive`): «CX». */
  compound: boolean;
  /** Armónica tisular (decisión 77 de VExUS): «THI» delante de la frecuencia de la imagen. */
  harmonic: boolean;
}

export interface HudText {
  topLeft: string[];
  topRight: string[];
  bottomRight: string[];
}

const mhz = (v: number) => v.toFixed(1).replace('.', ',');

export function hudText(v: HudInput): HudText {
  return {
    topLeft: [v.patientLabel + (v.frozen ? ' · congelada' : '')],
    topRight: [
      `FC ${Math.round(v.heartRateBpm)} lpm · ${v.atrialFibrillation ? 'FA' : 'Sinusal'}`,
      `${formatDepthMm(v.depthMm)} · ${v.harmonic ? 'THI ' : ''}${mhz(v.transducerMHz)} MHz · G ${v.gainDb} dB · RD ${v.dynamicRangeDb}` +
        (v.compound ? ' · CX' : ''),
    ],
    bottomRight: [],
  };
}

/** FC mostrada como un monitor: media móvil (en FA el RR latido a latido salta). */
export class HeartRateDisplay {
  private value = 0;
  update(rrSeconds: number, dtSeconds: number): number {
    const hr = 60 / rrSeconds;
    this.value = this.value ? this.value + (hr - this.value) * Math.min(1, dtSeconds * 1.5) : hr;
    return this.value;
  }
}

/** Conserva los nodos: el bucle solo modifica los textos que realmente cambian. */
export function renderLines(host: HTMLElement, lines: readonly string[]): void {
  while (host.children.length > lines.length) host.lastElementChild?.remove();
  for (let i = 0; i < lines.length; i++) {
    let span = host.children[i];
    if (!span) {
      span = document.createElement('span');
      host.appendChild(span);
    }
    if (span.textContent !== lines[i]) span.textContent = lines[i];
  }
}
