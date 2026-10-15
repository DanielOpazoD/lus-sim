import { bAdd, bMultiply, bPdivTrivial, bSturmChain } from 'flo-poly';

/** Coeficientes descendentes; el valor del polinomio es p·2^exponent. */
export interface ExactPolynomial {
  readonly p: bigint[];
  readonly exponent: number;
}

export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new Error('exactPolynomial: denominador cero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function dyadic(x: number): { n: bigint; exponent: number } {
  if (!Number.isFinite(x)) throw new Error('exactPolynomial: entrada no finita');
  if (x === 0) return { n: 0n, exponent: 0 };
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, x);
  const bits = data.getBigUint64(0);
  const power = Number((bits >> 52n) & 0x7ffn);
  let n = (bits & ((1n << 52n) - 1n)) | (power === 0 ? 0n : 1n << 52n);
  let exponent = power === 0 ? -1074 : power - 1023 - 52;
  while ((n & 1n) === 0n) {
    n >>= 1n;
    exponent++;
  }
  if (x < 0) n = -n;
  return { n, exponent };
}

export function exactPolynomial(coefficients: readonly number[]): ExactPolynomial {
  const terms = coefficients.map(dyadic);
  const exponent = Math.min(0, ...terms.filter((v) => v.n !== 0n).map((v) => v.exponent));
  const p = terms.map((v) => (v.n === 0n ? 0n : v.n << BigInt(v.exponent - exponent)));
  while (p[0] === 0n) p.shift();
  return { p, exponent };
}

export function addExact(a: ExactPolynomial, b: ExactPolynomial): ExactPolynomial {
  const exponent = Math.min(a.exponent, b.exponent);
  const shift = (p: ExactPolynomial) => p.p.map((n) => n << BigInt(p.exponent - exponent));
  return { p: bAdd(shift(a), shift(b)), exponent };
}

export function subtractExact(a: ExactPolynomial, b: ExactPolynomial): ExactPolynomial {
  return addExact(a, { p: b.p.map((n) => -n), exponent: b.exponent });
}

export function multiplyExact(a: ExactPolynomial, b: ExactPolynomial): ExactPolynomial {
  return { p: bMultiply(a.p, b.p), exponent: a.exponent + b.exponent };
}

export function rationalFromNumber(x: number): Rational {
  const { n, exponent } = dyadic(x);
  return exponent >= 0 ? { n: n << BigInt(exponent), d: 1n } : rational(n, 1n << BigInt(-exponent));
}

export function subtractRational(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function divideRational(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d, a.d * b.n);
}

export function compareRational(a: Rational, b: Rational): number {
  const difference = a.n * b.d - b.n * a.d;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function midpoint(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d + b.n * a.d, 2n * a.d * b.d);
}

export function rationalToNumber(a: Rational): number {
  if (a.d === 0n) throw new Error('exactPolynomial: denominador cero');
  const n = a.n < 0n ? -a.n : a.n;
  const d = a.d < 0n ? -a.d : a.d;
  if (n === 0n) return 0;
  const sign = (a.n < 0n ? -1 : 1) * (a.d < 0n ? -1 : 1);
  let exponent = n.toString(2).length - d.toString(2).length;
  if (exponent >= 0 ? n < d << BigInt(exponent) : n << BigInt(-exponent) < d) exponent--;
  if (exponent > 1023) return sign * Infinity;
  if (exponent < -1075) return sign * 0;
  const scale = Math.max(-1074, exponent - 52);
  const numerator = scale < 0 ? n << BigInt(-scale) : n;
  const denominator = scale > 0 ? d << BigInt(scale) : d;
  let mantissa = numerator / denominator;
  const remainder = 2n * (numerator % denominator);
  if (remainder > denominator || (remainder === denominator && (mantissa & 1n) !== 0n)) mantissa++;
  return sign * Number(mantissa) * 2 ** scale;
}

function signAt(p: readonly bigint[], x: Rational): number {
  if (p.length === 0) return 0;
  let value = p[0];
  let denominator = x.d;
  for (let i = 1; i < p.length; i++) {
    value = value * x.n + p[i] * denominator;
    denominator *= x.d;
  }
  return value < 0n ? -1 : value > 0n ? 1 : 0;
}

function primitive(p: bigint[]): bigint[] {
  const divisor = p.reduce((a, b) => gcd(a, b), 0n);
  return divisor === 0n ? [] : p.map((n) => n / divisor);
}

function variations(chain: readonly bigint[][], x: Rational): number {
  let previous = 0;
  let count = 0;
  for (const p of chain) {
    const sign = signAt(p, x);
    if (sign === 0) continue;
    if (previous !== 0 && previous !== sign) count++;
    previous = sign;
  }
  return count;
}

/** Primer p≤0: Sturm aísla también raíces pares y cruces arbitrariamente próximos, sin muestreo. */
export function firstNonpositive(polynomial: ExactPolynomial, lo: Rational, hi: Rational, tolerance: number): number | null {
  if (!(tolerance > 0 && Number.isFinite(tolerance))) throw new Error('exactPolynomial: tolerancia inválida');
  if (compareRational(lo, hi) > 0) throw new Error('exactPolynomial: intervalo invertido');
  let p = primitive(polynomial.p);
  if (signAt(p, lo) <= 0) return rationalToNumber(lo);
  if (p.length < 2 || compareRational(lo, hi) === 0) return null;
  let chain = bSturmChain(p);
  // Una cadena con factor común se anula entera en una raíz múltiple: quitarlo antes de contar en extremos.
  const common = chain[chain.length - 1];
  if (common.length > 1) {
    p = primitive(bPdivTrivial(p, common).q);
    chain = bSturmChain(p);
  }
  let leftVariations = variations(chain, lo);
  if (leftVariations === variations(chain, hi)) return null;
  const width = rationalFromNumber(tolerance);
  while (compareRational(subtractRational(hi, lo), width) > 0) {
    const mid = midpoint(lo, hi);
    const middleVariations = variations(chain, mid);
    if (leftVariations > middleVariations) hi = mid;
    else {
      lo = mid;
      leftVariations = middleVariations;
    }
  }
  return rationalToNumber(midpoint(lo, hi));
}
