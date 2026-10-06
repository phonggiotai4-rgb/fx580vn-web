/**
 * Exact rational arithmetic on BigInt pairs.
 *
 * Used by `d/c` mode and the `Fraction` MATH-menu commands. Denominators are
 * normalised on every operation so equality is a plain structural check.
 */

export interface Frac {
  readonly n: bigint;
  readonly d: bigint;
}

export function bcgcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function frac(n: bigint, d: bigint = 1n): Frac {
  if (d === 0n) throw new RangeError('zero denominator');
  let nn = n;
  let dd = d;
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = bcgcd(nn, dd) || 1n;
  return { n: nn / g, d: dd / g };
}

export function fracFromNumber(x: number): Frac {
  if (!Number.isFinite(x)) throw new RangeError('not finite');
  if (Number.isInteger(x)) return frac(BigInt(x));
  // Exact binary/decimal value of the double, then reduce.
  const s = x.toPrecision(15);
  return fracFromDecimalString(s);
}

export function fracFromDecimalString(s: string): Frac {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.trim());
  if (!m) throw new RangeError(`bad decimal: ${s}`);
  const [, signStr, intPart = '', fracPart = '', expStr] = m;
  const sign = signStr === '-' ? -1n : 1n;
  const digits = `${intPart || '0'}${fracPart || ''}` || '0';
  const exp = expStr ? Number(expStr) - fracPart.length : 0;
  let n = BigInt(digits) * sign;
  let d = 1n;
  if (exp > 0) n *= 10n ** BigInt(exp);
  else if (exp < 0) d = 10n ** BigInt(-exp);
  return frac(n, d);
}

/**
 * Simplest fraction within `eps` relative tolerance, via continued fractions.
 * This is what the `d/c` key does for a decimal result.
 */
export function approxFrac(x: number, maxDen = 1_000_000_000_000n, eps = 1e-11): Frac {
  if (!Number.isFinite(x)) throw new RangeError('not finite');
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return frac(BigInt(x));
  if (x > Number.MAX_SAFE_INTEGER || x < -Number.MAX_SAFE_INTEGER) {
    return fracFromDecimalString(x.toPrecision(15));
  }

  const sign = x < 0 ? -1n : 1n;
  const v = Math.abs(x);

  let hPrev = 0n;
  let hCurr = 1n;
  let kPrev = 1n;
  let kCurr = 0n;
  let remainder = v;
  let best: Frac | null = null;

  for (let i = 0; i < 64 && remainder > 0; i++) {
    const partial = BigInt(Math.floor(remainder));
    const hNext = partial * hCurr + hPrev;
    const kNext = partial * kCurr + kPrev;
    if (kNext > maxDen) break;
    hPrev = hCurr;
    hCurr = hNext;
    kPrev = kCurr;
    kCurr = kNext;

    const approx = Number(hCurr) / Number(kCurr);
    if (Math.abs(approx - v) <= eps * Math.max(1, v)) {
      best = frac(sign * hCurr, kCurr);
      break;
    }
    const fracPart = remainder - Math.floor(remainder);
    if (fracPart < 1e-12) {
      best = frac(sign * hCurr, kCurr);
      break;
    }
    remainder = 1 / fracPart;
  }

  if (best === null) {
    // Fell back to the decimal expansion when no simple form was close enough.
    best = fracFromDecimalString(x.toPrecision(15));
  }
  return best;
}

export function fAdd(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function fSub(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function fMul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

export function fDiv(a: Frac, b: Frac): Frac {
  if (b.n === 0n) throw new RangeError('zero denominator');
  return frac(a.n * b.d, a.d * b.n);
}

export function fNeg(a: Frac): Frac {
  return { n: -a.n, d: a.d };
}

export function fIntPow(a: Frac, e: number): Frac {
  const neg = e < 0;
  const k = BigInt(Math.abs(e));
  let rn = 1n;
  let rd = 1n;
  for (let i = 0n; i < k; i++) {
    rn *= a.n;
    rd *= a.d;
  }
  const out = frac(rn, rd);
  return neg ? fDiv(frac(1n), out) : out;
}

export function fToNumber(a: Frac): number {
  return Number(a.n) / Number(a.d);
}

export function fIsInteger(a: Frac): boolean {
  return a.d === 1n;
}

/** Exact integer square root, or null when `a` is not a perfect square. */
export function fSqrt(a: Frac): Frac | null {
  if (a.n < 0n) return null;
  const sn = bigintSqrt(a.n);
  const sd = bigintSqrt(a.d);
  if (sn === null || sd === null) return null;
  if (sn * sn !== a.n || sd * sd !== a.d) return null;
  return frac(sn, sd);
}

export function bigintSqrt(v: bigint): bigint | null {
  if (v < 0n) return null;
  if (v < 2n) return v;
  let x = 1n << BigInt(Math.ceil(Number(v.toString(2).length) / 2) + 1);
  for (;;) {
    const y = (x + v / x) / 2n;
    if (y >= x) return x;
    x = y;
  }
}

/** True when the double is an exact integer that survives a round trip. */
export function isSafeInteger(x: number): boolean {
  return Number.isInteger(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER;
}
