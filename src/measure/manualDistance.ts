import type { Transducer } from '../probe/probe';
import { beamToPixel } from '../ultrasound/sectorGeometry';

/** Coordenadas de la imagen adquirida, no puntos inferidos de la anatomía latente. */
export interface BeamPoint {
  theta: number;
  r: number;
}

export function validPoint(point: BeamPoint, tr: Transducer, depthMm: number): boolean {
  return (
    Number.isFinite(point.theta) &&
    Number.isFinite(point.r) &&
    Number.isFinite(depthMm) &&
    depthMm > 0 &&
    point.r >= 0 &&
    point.r <= depthMm &&
    Math.abs(point.theta) <= tr.halfSector
  );
}

/** Usa la geometría del sector a escala 1 px/mm; no mide píxeles CSS ni el arco entre los puntos. */
export function distanceMm(a: BeamPoint, b: BeamPoint, tr: Transducer): number {
  const layout = { apexX: 0, apexY: 0, scale: 1, width: 1, height: 1 };
  const p = beamToPixel(layout, tr, a.theta, a.r);
  const q = beamToPixel(layout, tr, b.theta, b.r);
  const distance = Math.hypot(p.x - q.x, p.y - q.y);
  if (!Number.isFinite(distance)) throw new RangeError('Calibre: distancia no finita');
  return distance;
}

/** Una sola medición, ligada al objeto del cuadro y a su renderer; memoria acotada, sin store paralelo. */
export class FrameCaliper {
  private owner: object | null = null;
  private frame: object | null = null;
  private points: [BeamPoint | null, BeamPoint | null] = [null, null];

  bind(owner: object | null, frame: object | null): boolean {
    if (owner === this.owner && frame === this.frame) return false;
    this.owner = owner;
    this.frame = frame;
    this.clear();
    return true;
  }

  clear(): void {
    this.points = [null, null];
  }

  set(index: 0 | 1, point: BeamPoint, tr: Transducer, depthMm: number): void {
    if (!this.owner || !this.frame || !validPoint(point, tr, depthMm)) throw new RangeError('Calibre: punto sin cuadro o fuera del sector');
    this.points[index] = { ...point };
  }

  get endpoints(): [BeamPoint | null, BeamPoint | null] {
    return this.points.map((point) => (point ? { ...point } : null)) as [BeamPoint | null, BeamPoint | null];
  }

  snapshot(tr: Transducer): { a: BeamPoint; b: BeamPoint; distanceMm: number } | null {
    const [a, b] = this.endpoints;
    return a && b ? { a, b, distanceMm: distanceMm(a, b, tr) } : null;
  }
}
