/**
 * Complex arithmetic on a plain `{ re, im }` pair.
 *
 * Kept separate from the value model so it can be unit tested on its own and so
 * transcendental functions stay readable.
 */

export interface Cpx {
  readonly re: number;
  readonly im: number;
}

export const C_ZERO: Cpx = { re: 0, im: 0 };
export const C_ONE: Cpx = { re: 1, im: 0 };
export const C_I: Cpx = { re: 0, im: 1 };

export function cx(re: number, im = 0): Cpx {
  return { re, im };
}

export function cIsReal(z: Cpx): boolean {
  return z.im === 0;
}

export function cAbs(z: Cpx): number {
  return Math.hypot(z.re, z.im);
}

export function cArg(z: Cpx): number {
  return Math.atan2(z.im, z.re);
}

export function cAdd(a: Cpx, b: Cpx): Cpx {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a: Cpx, b: Cpx): Cpx {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function cNeg(a: Cpx): Cpx {
  return { re: -a.re, im: -a.im };
}

export function cConj(a: Cpx): Cpx {
  return { re: a.re, im: -a.im };
}

export function cMul(a: Cpx, b: Cpx): Cpx {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function cDiv(a: Cpx, b: Cpx): Cpx {
  const den = b.re * b.re + b.im * b.im;
  if (den === 0) throw new RangeError('division by zero');
  return {
    re: (a.re * b.re + a.im * b.im) / den,
    im: (a.im * b.re - a.re * b.im) / den,
  };
}

/** a raised to an integer power via binary exponentiation. */
export function cIntPow(a: Cpx, n: number): Cpx {
  if (!Number.isInteger(n)) throw new RangeError('non-integer exponent');
  let negative = false;
  let e = n;
  if (e < 0) {
    e = -e;
    negative = true;
  }
  let result = C_ONE;
  let base = a;
  while (e > 0) {
    if (e & 1) result = cMul(result, base);
    base = cMul(base, base);
    e >>= 1;
  }
  return negative ? cDiv(C_ONE, result) : result;
}

/** Principal branch of a^b for real b, matching the calculator's convention. */
export function cPow(a: Cpx, b: number): Cpx {
  const r = cAbs(a);
  const th = cArg(a);
  const magnitude = r **b;
  const phase = b * th;
  return { re: magnitude * Math.cos(phase), im: magnitude * Math.sin(phase) };
}

export function cSqrt(a: Cpx): Cpx {
  return cPow(a, 0.5);
}

export function cExp(a: Cpx): Cpx {
  const e = Math.exp(a.re);
  return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) };
}

export function cLog(a: Cpx): Cpx {
  return { re: Math.log(cAbs(a)), im: cArg(a) };
}

/** Base-10 complex log, used by `log` on non-real input. */
export function cLog10(a: Cpx): Cpx {
  const l = cLog(a);
  return { re: l.re / Math.LN10, im: l.im / Math.LN10 };
}

export function cSin(a: Cpx): Cpx {
  return {
    re: Math.sin(a.re) * Math.cosh(a.im),
    im: Math.cos(a.re) * Math.sinh(a.im),
  };
}

export function cCos(a: Cpx): Cpx {
  return {
    re: Math.cos(a.re) * Math.cosh(a.im),
    im: -Math.sin(a.re) * Math.sinh(a.im),
  };
}

export function cTan(a: Cpx): Cpx {
  return cDiv(cSin(a), cCos(a));
}

export function cSinh(a: Cpx): Cpx {
  return {
    re: Math.sinh(a.re) * Math.cos(a.im),
    im: Math.cosh(a.re) * Math.sin(a.im),
  };
}

export function cCosh(a: Cpx): Cpx {
  return {
    re: Math.cosh(a.re) * Math.cos(a.im),
    im: Math.sinh(a.re) * Math.sin(a.im),
  };
}

export function cTanh(a: Cpx): Cpx {
  return cDiv(cSinh(a), cCosh(a));
}

/**
 * Complex arcsine via the standard log formula.
 *
 *   asin z = -i * ln( i*z + sqrt(1 - z^2) )
 *
 * The principal branch is chosen by flipping to whichever of the two roots
 * keeps the imaginary part non-negative, so `asin(i)` comes back as
 * `i·asinh(1)` rather than `-i·asinh(1)`.
 */
export function cAsin(z: Cpx): Cpx {
  const discriminant = cSub(C_ONE, cMul(z, z));
  // The `1 - z²` square root has two roots; try the one giving im >= 0.
  let best: Cpx | null = null;
  for (const root of [cSqrt(discriminant), cNeg(cSqrt(discriminant))]) {
    const candidate = cAsinFromRoot(z, root);
    if (best === null || candidate.im > best.im) best = candidate;
  }
  return best ?? cx(0, 0);
}

function cAsinFromRoot(z: Cpx, root: Cpx): Cpx {
  const l = cLog(cAdd(cMul(C_I, z), root));
  return cNeg(cMul(C_I, l));
}

export function cAcos(z: Cpx): Cpx {
  return cSub({ re: Math.PI / 2, im: 0 }, cAsin(z));
}

export function cAtan(a: Cpx): Cpx {
  const num = cAdd(C_I, a);
  const den = cSub(C_I, a);
  const l = cLog(cDiv(num, den));
  return { re: -l.im / 2, im: l.re / 2 };
}

/** Principal square root of a possibly negative real. */
export function realOrComplexSqrt(x: number): Cpx | number {
  return x >= 0 ? Math.sqrt(x) : cx(0, Math.sqrt(-x));
}
