import { describe, expect, it } from 'vitest';
import {
  addExact,
  subtractExact,
  multiplyExact,
  exactPolynomial,
  firstNonpositive,
  rationalFromNumber,
  rationalToNumber,
  divideRational,
} from '../core/exactPolynomial';

const p = exactPolynomial;
const first = (polynomial: ReturnType<typeof p>, lo = 0, hi = 4) =>
  firstNonpositive(polynomial, rationalFromNumber(lo), rationalFromNumber(hi), 1e-8);

describe('primer cero por Sturm y coeficientes diádicos exactos', () => {
  it('convierte racionales a float64 sin perder extremos finitos ni subnormales', () => {
    for (const value of [
      Number.MIN_VALUE,
      Number.MIN_VALUE * 10,
      2 ** -1022,
      1e-250,
      1e-100,
      Number.EPSILON,
      1 / 3,
      Math.PI,
      512,
      1e100,
      2 ** 1023,
      Number.MAX_VALUE,
    ]) {
      for (const sign of [-1, 1]) expect(rationalToNumber(rationalFromNumber(sign * value))).toBe(sign * value);
    }
    expect(rationalToNumber(rationalFromNumber(0))).toBe(0);
    expect(rationalToNumber({ n: 7n << 1200n, d: 3n << 1200n })).toBe(7 / 3);
    expect(rationalToNumber({ n: 1n, d: -3n })).toBe(-1 / 3);
    expect(() => rationalToNumber({ n: 1n, d: 0n })).toThrow();
  });

  it('conserva signos de constantes y el inicio interior', () => {
    expect(first(p([]))).toBe(0);
    expect(first(p([0]))).toBe(0);
    expect(first(p([-1]))).toBe(0);
    expect(first(p([1]))).toBeNull();
    expect(first(p([1, -1]))).toBe(0);
  });

  it('incluye ambos extremos y no confunde un mínimo positivo con tangencia', () => {
    expect(first(p([1, 0, 0]))).toBe(0);
    expect(first(p([1, -8, 16]))).toBeCloseTo(4, 7);
    const tangent = p([1, -2, 1]);
    expect(first(tangent)).toBeCloseTo(1, 7);
    expect(first(addExact(tangent, p([Number.MIN_VALUE])))).toBeNull();
  });

  it('quita multiplicidades antes de contar en un extremo que anula toda la cadena', () => {
    const q = multiplyExact(p([1, -1]), p([1, -2]));
    const squared = multiplyExact(q, q);
    expect(first(squared, 0, 1)).toBeCloseTo(1, 7);
    expect(first(squared, 0, 4)).toBeCloseTo(1, 7);
    expect(first(squared, 1.5, 4)).toBeCloseTo(2, 7);
    expect(first(squared, 2.5, 4)).toBeNull();
  });

  it('no omite la primera de varias entradas extremadamente próximas', () => {
    const tinyChord = subtractExact(p([1, -2, 1]), p([1e-20]));
    expect(first(tinyChord)).toBeCloseTo(1 - 1e-10, 7);
    const roots = [0.5, 0.500000000001, 0.75, 1, 1.25, 2];
    let q = p([1]);
    for (const r of roots) q = multiplyExact(q, p([1, -r]));
    expect(first(q)).toBeCloseTo(0.5, 7);
  });

  it('admite límites racionales no diádicos sin redondear la pertenencia al intervalo', () => {
    const oneThird = divideRational(rationalFromNumber(1), rationalFromNumber(3));
    expect(firstNonpositive(p([-3, 1]), rationalFromNumber(0), oneThird, 1e-8)).toBeCloseTo(1 / 3, 7);
    expect(firstNonpositive(p([3, -1]), oneThird, rationalFromNumber(1), 1e-8)).toBe(1 / 3);
  });

  it('rechaza entradas indefinidas, no las convierte en ausencia de raíz', () => {
    expect(() => p([NaN])).toThrow();
    expect(() => first(p([1]), 4, 0)).toThrow();
    expect(() => firstNonpositive(p([1]), rationalFromNumber(0), rationalFromNumber(1), 0)).toThrow();
    expect(() => divideRational(rationalFromNumber(1), rationalFromNumber(0))).toThrow();
  });
});
