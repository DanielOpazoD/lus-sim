import { describe, expect, it } from 'vitest';
import { distanceMm, FrameCaliper, validPoint } from '../measure/manualDistance';
import { CONVEX_C35 } from '../probe/probe';
import { beamToPixel, pixelToBeam, sectorLayout } from '../ultrasound/sectorGeometry';

const tr = CONVEX_C35;
const a = { theta: 0, r: 20 };
const b = { theta: 0, r: 50 };

describe('Distancia manual sobre el cuadro adquirido', () => {
  it('distancia axial en mm, simetría y coincidencia', () => {
    expect(distanceMm(a, b, tr)).toBeCloseTo(30, 12);
    expect(distanceMm(b, a, tr)).toBeCloseTo(30, 12);
    expect(distanceMm(a, a, tr)).toBe(0);
  });

  it('entre líneas mide la cuerda, incluye el radio convexo y no confunde radio con profundidad', () => {
    const angle = 0.3;
    const expected = 2 * (tr.curvatureRadius + 40) * Math.sin(angle);
    expect(distanceMm({ theta: -angle, r: 40 }, { theta: angle, r: 40 }, tr)).toBeCloseTo(expected, 12);
    expect(expected).not.toBeCloseTo(2 * 40 * angle, 1);
  });

  it.each([
    [320, 240, 1],
    [390, 400, 2],
    [1280, 800, 1],
    [800, 1280, 2],
  ])('conserva unidades en %i × %i y DPR %i', (width, height, dpr) => {
    const layout = sectorLayout(width * dpr, height * dpr, tr, 120, 12 * dpr);
    const p = beamToPixel(layout, tr, -0.2, 24);
    const q = beamToPixel(layout, tr, 0.3, 68);
    const first = pixelToBeam(layout, tr, 120, p.x, p.y)!;
    const second = pixelToBeam(layout, tr, 120, q.x, q.y)!;
    expect(distanceMm(first, second, tr)).toBeCloseTo(Math.hypot(p.x - q.x, p.y - q.y) / layout.scale, 10);
  });

  it.each([
    { theta: NaN, r: 20 },
    { theta: Infinity, r: 20 },
    { theta: 0, r: NaN },
    { theta: 0, r: Infinity },
    { theta: 0, r: -0.01 },
    { theta: 0, r: 121 },
    { theta: tr.halfSector + 0.01, r: 20 },
  ])('rechaza puntos no adquiridos: %j', (point) => {
    const caliper = new FrameCaliper();
    caliper.bind({}, {});
    expect(validPoint(point, tr, 120)).toBe(false);
    expect(() => caliper.set(0, point, tr, 120)).toThrow(RangeError);
    expect(caliper.snapshot(tr)).toBeNull();
  });

  it('no permite medir sin cuadro, no exporta un extremo aislado y sus copias no mutan', () => {
    const caliper = new FrameCaliper();
    expect(() => caliper.set(0, a, tr, 120)).toThrow(RangeError);
    caliper.bind({}, {});
    const input = { ...a };
    caliper.set(0, input, tr, 120);
    input.r = 70;
    expect(caliper.snapshot(tr)).toBeNull();
    caliper.set(1, b, tr, 120);
    const snapshot = caliper.snapshot(tr)!;
    expect(snapshot.distanceMm).toBeCloseTo(30, 12);
    snapshot.a.r = 99;
    caliper.endpoints[1]!.r = 100;
    expect(caliper.snapshot(tr)!.distanceMm).toBeCloseTo(30, 12);
  });

  it('redimensionar no cambia el cuadro; otro cuadro, renderer, paciente o vivo borran la medición', () => {
    const caliper = new FrameCaliper();
    const owner = {};
    const frame = { t: 1 };
    caliper.bind(owner, frame);
    caliper.set(0, a, tr, 120);
    caliper.set(1, b, tr, 120);
    expect(caliper.bind(owner, frame)).toBe(false);
    expect(caliper.snapshot(tr)!.distanceMm).toBeCloseTo(30, 12);
    expect(caliper.bind(owner, { t: 1 })).toBe(true);
    expect(caliper.snapshot(tr)).toBeNull();
    caliper.set(0, a, tr, 120);
    expect(caliper.bind({}, frame)).toBe(true);
    expect(caliper.endpoints).toEqual([null, null]);
    caliper.set(0, a, tr, 120);
    expect(caliper.bind(null, null)).toBe(true);
    expect(caliper.endpoints).toEqual([null, null]);
  });
});
