/**
 * Scientific function library.
 *
 * Angle conversion lives here so every consumer shares one definition of what
 * "Deg" means: angles are always held internally in radians and converted at
 * the function boundary, exactly like the real firmware.
 */

import type { AngleUnit } from './value.js';
import {
  type Cpx,
  cx,
  cExp,
  cLog,
  cLog10,
  cSin,
  cCos,
  cTan,
  cSinh,
  cCosh,
  cTanh,
  cAsin,
  cAcos,
  cAtan,
  cIntPow,
  cSqrt,
} from './complex.js';
import { err, ok, type Result } from './errors.js';
import { asCpx } from './value.js';

export function toRadians(x: number, unit: AngleUnit): number {
  switch (unit) {
    case 'Deg':
      return (x * Math.PI) / 180;
    case 'Gra':
      return (x * Math.PI) / 200;
    default:
      return x;
  }
}

export function fromRadians(x: number, unit: AngleUnit): number {
  switch (unit) {
    case 'Deg':
      return (x * 180) / Math.PI;
    case 'Gra':
      return (x * 200) / Math.PI;
    default:
      return x;
  }
}

/** True when `x` is an integer that survives the mantissa, for postfix factorial. */
export function isCountable(x: number): boolean {
  return Number.isInteger(x) && x >= 0 && x <= 69;
}

export function factorial(x: number): Result<number> {
  if (!Number.isFinite(x)) return err('Range Error');
  if (x < 0) {
    // Deliberately an error rather than a gamma extension: the reciprocal
    // gamma value carries a sign convention that is easy to get wrong and
    // cannot be verified against the real firmware from here.
    return err('Math Error', 'factorial of negative');
  }
  if (!Number.isInteger(x)) return err('Math Error', 'factorial of non-integer');
  if (x > 170) return err('Math Error', 'factorial overflow');
  let acc = 1;
  for (let i = 2; i <= x; i++) acc *= i;
  return ok(acc);
}

export function permutations(n: number, r: number): Result<number> {
  if (!Number.isInteger(n) || !Number.isInteger(r)) return err('Math Error');
  if (n < 0 || r < 0) return err('Math Error');
  if (r > n) return err('Math Error');
  const f = factorial(n);
  if (!f.ok) return f;
  const g = factorial(n - r);
  if (!g.ok) return g;
  return ok(f.value / g.value);
}

export function combinations(n: number, r: number): Result<number> {
  if (!Number.isInteger(n) || !Number.isInteger(r)) return err('Math Error');
  if (n < 0 || r < 0) return err('Math Error');
  if (r > n) return err('Math Error');
  const f = factorial(n);
  if (!f.ok) return f;
  const g = factorial(r);
  if (!g.ok) return g;
  const h = factorial(n - r);
  if (!h.ok) return h;
  return ok(f.value / (g.value * h.value));
}

/**
 * Greatest common divisor, matching the calculator: both operands are reduced
 * to their absolute integer values first.
 */
export function gcd(a: number, b: number): Result<number> {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return err('Math Error');
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return ok(x);
}

export function lcm(a: number, b: number): Result<number> {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return err('Math Error');
  const g = gcd(a, b);
  if (!g.ok) return g;
  if (g.value === 0) return ok(0);
  return ok(Math.abs(Math.trunc(a) * Math.trunc(b)) / g.value);
}

export function integerPart(x: number, unit: AngleUnit, signed: boolean): number {
  switch (unit) {
    case 'Deg': {
      if (signed) return Math.trunc(x);
      const m = x % 360;
      return Math.trunc(((m + 540) % 360) - 180);
    }
    case 'Gra': {
      if (signed) return Math.trunc(x);
      const m = x % 400;
      return Math.trunc(((m + 600) % 400) - 200);
    }
    default:
      return Math.trunc(x);
  }
}

/**
 * Fractional part.
 *
 * With `signed` the sign of the input is preserved; without it the fraction is
 * always returned in the range that `floor` would produce, which is what the
 * Int/Frac pair does in Deg and Gra.
 */
export function fractionalPart(x: number, unit: AngleUnit, signed: boolean): number {
  void unit;
  return signed ? x - Math.trunc(x) : x - Math.floor(x);
}

/** Round half away from zero, which is what Casio's Fix mode does. */
export function roundHalfAway(x: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.sign(x) * Math.round(Math.abs(x) * f + Number.EPSILON * Math.abs(x) * f) / f;
}

// -------------------------------------------------------------- transcendentals

export function sinCpx(z: Cpx, unit: AngleUnit): Cpx {
  if (z.im === 0 && unit !== 'Rad') return cSin(cx(toRadians(z.re, unit), 0));
  return cSin(z);
}

export function cosCpx(z: Cpx, unit: AngleUnit): Cpx {
  if (z.im === 0 && unit !== 'Rad') return cCos(cx(toRadians(z.re, unit), 0));
  return cCos(z);
}

export function tanCpx(z: Cpx, unit: AngleUnit): Cpx {
  if (z.im === 0 && unit !== 'Rad') return cTan(cx(toRadians(z.re, unit), 0));
  return cTan(z);
}

/** Real asin/acos/atan honour the angle unit on the way out only. */
export function asinCpx(z: Cpx, unit: AngleUnit): Cpx {
  const r = cAsin(z);
  if (r.im === 0) return cx(fromRadians(r.re, unit));
  return r;
}

export function acosCpx(z: Cpx, unit: AngleUnit): Cpx {
  const r = cAcos(z);
  if (r.im === 0) return cx(fromRadians(r.re, unit));
  return r;
}

export function atanCpx(z: Cpx, unit: AngleUnit): Cpx {
  const r = cAtan(z);
  if (r.im === 0) return cx(fromRadians(r.re, unit));
  return r;
}

export {
  cExp,
  cLog,
  cLog10,
  cSinh,
  cCosh,
  cTanh,
  cIntPow,
  cSqrt,
  asCpx,
};
