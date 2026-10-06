/**
 * The value model.
 *
 * A value is one of:
 *   number   - real, already rounded to 15 significant digits (mantissa spec)
 *   Cpx      - complex
 *   Frac     - exact rational
 *   Matrix   - rectangular grid of values
 *   Symbolic - pi / e / i / Ans / infinity, kept for faithful redisplay
 *   CalcError- an error propagates as a value so a bad argument cannot be
 *              silently used further along an expression
 */

import {
  type Cpx,
  cx,
  cIsReal,
  cAdd as cxAdd,
  cSub as cxSub,
  cMul as cxMul,
  cDiv as cxDiv,
  cNeg as cxNeg,
  cIntPow,
  cPow,
  cAbs,
  cArg,
  cConj,
} from './complex.js';
import {
  type Frac as F,
  fAdd,
  fSub,
  fMul,
  fDiv,
  fNeg,
  fIntPow,
  fToNumber,
} from './fraction.js';
import type { CalcError } from './errors.js';

export type AngleUnit = 'Rad' | 'Deg' | 'Gra';

export type SymbolicTag = 'pi' | 'e' | 'i' | 'ans' | 'inf';

export interface Symbolic {
  readonly kind: 'symbolic';
  readonly tag: SymbolicTag;
  /** Present for `ans` so `Ans+Ans` keeps showing `2Ans`. */
  readonly carry?: number | Cpx;
}

export interface Matrix {
  readonly kind: 'matrix';
  readonly rows: number;
  readonly cols: number;
  readonly cells: readonly Value[];
}

export type Value = number | Cpx | F | Matrix | Symbolic | CalcError;

export const MANTISSA_DIGITS = 15;

/** Round to the calculator's 15-digit internal mantissa. */
export function sig(x: number, digits = MANTISSA_DIGITS): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const r = Number(x.toPrecision(digits));
  return Object.is(r, -0) ? 0 : r;
}

export function isRealNum(v: Value): v is number {
  return typeof v === 'number';
}

export function isComplex(v: Value): v is Cpx {
  return typeof v === 'object' && v !== null && 'im' in v && 're' in v;
}

export function isFrac(v: Value): v is F {
  return typeof v === 'object' && v !== null && 'n' in v && 'd' in v;
}

export function isMatrix(v: Value): v is Matrix {
  return typeof v === 'object' && v !== null && 'kind' in v && (v as Matrix).kind === 'matrix';
}

export function isSymbolic(v: Value): v is Symbolic {
  return typeof v === 'object' && v !== null && 'kind' in v && (v as Symbolic).kind === 'symbolic';
}

const ERROR_KINDS = new Set<string>([
  'Math Error',
  'Syntax Error',
  'Arg Error',
  'Range Error',
  'NDim Error',
  'Singular Mat',
  'Memory Error',
  'Cap Error',
  'Time-over',
  'No Variable',
  'Equation Error',
  'Non-real Ans',
  'Degree Error',
]);

/**
 * Discriminates an error value.
 *
 * `kind` alone is not enough of a test: `Symbolic` and `Matrix` also carry a
 * `kind` string, so the value of that string has to be checked.
 */
export function isErr(v: Value): v is CalcError {
  return (
    typeof v === 'object' &&
    v !== null &&
    'kind' in v &&
    typeof (v as CalcError).kind === 'string' &&
    ERROR_KINDS.has((v as CalcError).kind)
  );
}

export const PI: Symbolic = { kind: 'symbolic', tag: 'pi' };
export const E: Symbolic = { kind: 'symbolic', tag: 'e' };
export const I: Symbolic = { kind: 'symbolic', tag: 'i' };
export const INF: Symbolic = { kind: 'symbolic', tag: 'inf' };

export function sym(tag: SymbolicTag, carry?: number | Cpx): Symbolic {
  return carry === undefined ? { kind: 'symbolic', tag } : { kind: 'symbolic', tag, carry };
}

export function isPi(v: Value): boolean {
  return isSymbolic(v) && v.tag === 'pi';
}

/** Collapse symbolic wrappers into their numeric stand-in. */
export function unwrap(v: Value): number | Cpx {
  if (isSymbolic(v)) {
    if (v.carry !== undefined) return v.carry;
    switch (v.tag) {
      case 'pi':
        return Math.PI;
      case 'e':
        return Math.E;
      case 'i':
        return cx(0, 1);
      case 'inf':
        return Number.POSITIVE_INFINITY;
      default:
        return Number.NaN;
    }
  }
  return v as number | Cpx;
}

/** Complex-only view, promoting a real to `re + 0i`. */
export function asCpx(v: number | Cpx): Cpx {
  return typeof v === 'number' ? cx(v, 0) : v;
}

/**
 * The rational form of `v`, but only when `v` is already a rational.
 *
 * Plain reals deliberately return `null` so `200+20` stays a number instead of
 * becoming a BigInt fraction that prints as `220▐1`.
 */
function anyFractal(v: Value): F | null {
  return isFrac(v) ? v : null;
}

export function add(a: Value, b: Value): Value {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (isMatrix(a) || isMatrix(b)) return matAdd(a, b);
  const fa = anyFractal(a);
  const fb = anyFractal(b);
  if (fa && fb) return fAdd(fa, fb);
  if (fa) return sig(fToNumber(fAdd(fa, asFrac(b))));
  if (fb) return sig(fToNumber(fAdd(asFrac(a), fb)));
  const ua = unwrap(a);
  const ub = unwrap(b);
  if (typeof ua === 'number' && typeof ub === 'number') return sig(ua + ub);
  return cxAdd(asCpx(ua), asCpx(ub));
}

export function sub(a: Value, b: Value): Value {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (isMatrix(a) || isMatrix(b)) return matAdd(a, neg(b));
  const fa = anyFractal(a);
  const fb = anyFractal(b);
  if (fa && fb) return fSub(fa, fb);
  if (fa) return sig(fToNumber(fSub(fa, asFrac(b))));
  if (fb) return sig(fToNumber(fSub(asFrac(a), fb)));
  const ua = unwrap(a);
  const ub = unwrap(b);
  if (typeof ua === 'number' && typeof ub === 'number') return sig(ua - ub);
  return cxSub(asCpx(ua), asCpx(ub));
}

export function mul(a: Value, b: Value): Value {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (isMatrix(a) || isMatrix(b)) return matMul(a, b);
  const fa = anyFractal(a);
  const fb = anyFractal(b);
  if (fa && fb) return fMul(fa, fb);
  if (fa) return sig(fToNumber(fMul(fa, asFrac(b))));
  if (fb) return sig(fToNumber(fMul(asFrac(a), fb)));
  const ua = unwrap(a);
  const ub = unwrap(b);
  if (typeof ua === 'number' && typeof ub === 'number') return sig(ua * ub);
  return cxMul(asCpx(ua), asCpx(ub));
}

export function div(a: Value, b: Value): Value {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (isMatrix(a) || isMatrix(b)) return matDiv(a, b);
  const fb = anyFractal(b);
  if (fb && fb.n === 0n) return { kind: 'Math Error', detail: 'division by zero' };
  const fa = anyFractal(a);
  if (fa && fb) {
    try {
      return fDiv(fa, fb);
    } catch {
      return { kind: 'Math Error', detail: 'division by zero' };
    }
  }
  if (fa) {
    try {
      return sig(fToNumber(fDiv(fa, asFrac(b))));
    } catch {
      return { kind: 'Math Error', detail: 'division by zero' };
    }
  }
  if (fb) {
    try {
      return sig(fToNumber(fDiv(asFrac(a), fb)));
    } catch {
      return { kind: 'Math Error', detail: 'division by zero' };
    }
  }
  const ua = unwrap(a);
  const ub = unwrap(b);
  if (typeof ub === 'number' && ub === 0) return { kind: 'Math Error' };
  if (typeof ua === 'number' && typeof ub === 'number') return sig(ua / ub);
  try {
    return cxDiv(asCpx(ua), asCpx(ub));
  } catch {
    return { kind: 'Math Error' };
  }
}

export function neg(a: Value): Value {
  if (isErr(a)) return a;
  if (isMatrix(a)) {
    return { kind: 'matrix', rows: a.rows, cols: a.cols, cells: a.cells.map(neg) };
  }
  if (isFrac(a)) return fNeg(a);
  const u = unwrap(a);
  if (typeof u === 'number') return sig(-u);
  return cxNeg(u);
}

export function pow(a: Value, b: Value): Value {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (isFrac(a) && isFrac(b) && fIsIntPowable(b)) return fIntPow(a, Number(b.n) / Number(b.d));
  const ua = unwrap(a);
  const ub = unwrap(b);
  if (typeof ua === 'number' && typeof ub === 'number') {
    if (ua < 0 && !Number.isInteger(ub)) {
      // Negative base with a fractional exponent follows the calculator and
      // yields a Math Error for real results.
      return { kind: 'Math Error', detail: 'negative base' };
    }
    return sig(ua ** ub);
  }
  if (typeof ub === 'number' && Number.isInteger(ub)) {
    try {
      return cIntPow(asCpx(ua), ub);
    } catch {
      return { kind: 'Math Error' };
    }
  }
  return cPow(asCpx(ua), typeof ub === 'number' ? ub : ub.re);
}

function fIsIntPowable(f: F): boolean {
  return f.d === 1n && f.n <= 1000n && f.n >= -1000n;
}

export function asFrac(v: Value): F {
  return toFrac(v);
}

/** Value -> exact rational (only valid for finite values). */
export function toFrac(v: Value): F {
  if (isFrac(v)) return v;
  const u = unwrap(v);
  if (typeof u !== 'number') throw new RangeError('not real');
  return fracFromNumberLoose(u);
}

function fracFromNumberLoose(x: number): F {
  if (Number.isInteger(x)) return { n: BigInt(x), d: 1n };
  const digits = x.toPrecision(15);
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(digits);
  if (!m) throw new RangeError('bad decimal');
  const sign = m[1] === '-' ? -1n : 1n;
  const fracPart = m[3] ?? '';
  const exp = (m[4] ? Number(m[4]) : 0) - fracPart.length;
  let n = BigInt(`${m[2] || '0'}${fracPart}`) * sign;
  let d = 1n;
  if (exp > 0) n *= 10n ** BigInt(exp);
  else if (exp < 0) d = 10n ** BigInt(-exp);
  const g = gcdBig(n, d) || 1n;
  return { n: n / g, d: d / g };
}

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

// ---------------------------------------------------------------- matrices

export function mat(rows: number, cols: number, cells: readonly Value[]): Matrix {
  return { kind: 'matrix', rows, cols, cells };
}

function matAdd(a: Value, b: Value): Value {
  if (!isMatrix(a) || !isMatrix(b)) {
    // Scalar op matrix, applied element-wise.
    const m = (isMatrix(a) ? a : b) as Matrix;
    const s = isMatrix(a) ? b : a;
    return mat(
      m.rows,
      m.cols,
      m.cells.map(c => (isMatrix(a) ? add(c, s) : add(s, c))),
    );
  }
  if (a.rows !== b.rows || a.cols !== b.cols) return { kind: 'NDim Error' };
  return mat(a.rows, a.cols, a.cells.map((c, i) => add(c, b.cells[i]!)));
}

function matMul(a: Value, b: Value): Value {
  const ma = isMatrix(a) ? a : null;
  const mb = isMatrix(b) ? b : null;
  if (!ma && !mb) return mul(a, b);
  if (!ma) return scaleMatrix(b as Value, a);
  if (!mb) return scaleMatrix(a, b);
  if (ma.cols !== mb.rows) return { kind: 'NDim Error' };
  const out: Value[] = [];
  for (let r = 0; r < ma.rows; r++) {
    for (let c = 0; c < mb.cols; c++) {
      let acc: Value = 0;
      for (let k = 0; k < ma.cols; k++) {
        acc = add(acc, mul(ma.cells[r * ma.cols + k]!, mb.cells[k * mb.cols + c]!));
      }
      out.push(acc);
    }
  }
  return mat(ma.rows, mb.cols, out);
}

function scaleMatrix(m: Value, s: Value): Value {
  const mm = m as Matrix;
  return mat(mm.rows, mm.cols, mm.cells.map(c => mul(c, s)));
}

function matDiv(a: Value, b: Value): Value {
  if (!isMatrix(b)) return div(a, b);
  const inv = matInverse(b);
  if (isErr(inv)) return inv;
  return matMul(a, inv);
}

export function matAt(m: Matrix, r: number, c: number): Value {
  return m.cells[r * m.cols + c]!;
}

export function matTranspose(m: Matrix): Matrix {
  const cells: Value[] = [];
  for (let c = 0; c < m.cols; c++) for (let r = 0; r < m.rows; r++) cells.push(matAt(m, r, c));
  return mat(m.cols, m.rows, cells);
}

export function matDet(m: Matrix): Value {
  if (m.rows !== m.cols) return { kind: 'NDim Error' };
  const n = m.rows;
  const a = m.cells.map(c => unwrap(c));
  const grid = a.map(v => (typeof v === 'number' ? v : v.re));
  const imag = a.map(v => (typeof v === 'number' ? 0 : v.im));

  // Straightforward LU-style elimination with full pivoting on the modulus.
  let detR = 1;
  let detI = 0;
  let singular = false;
  for (let k = 0; k < n; k++) {
    let best = k;
    let bestMod = Math.hypot(grid[k * n + k]!, imag[k * n + k]!);
    for (let r = k + 1; r < n; r++) {
      const mod = Math.hypot(grid[r * n + k]!, imag[r * n + k]!);
      if (mod > bestMod) {
        bestMod = mod;
        best = r;
      }
    }
    if (bestMod === 0 || !Number.isFinite(bestMod)) {
      singular = true;
      break;
    }
    if (best !== k) {
      for (let c = 0; c < n; c++) {
        const t1 = grid[k * n + c]!;
        grid[k * n + c] = grid[best * n + c]!;
        grid[best * n + c] = t1;
        const t2 = imag[k * n + c]!;
        imag[k * n + c] = imag[best * n + c]!;
        imag[best * n + c] = t2;
      }
      detR = -detR;
      detI = -detI;
    }
    const pivotR = grid[k * n + k]!;
    const pivotI = imag[k * n + k]!;
    for (let r = k + 1; r < n; r++) {
      const numR = grid[r * n + k]!;
      const numI = imag[r * n + k]!;
      const den = pivotR * pivotR + pivotI * pivotI;
      if (den === 0) {
        singular = true;
        break;
      }
      const fR = (numR * pivotR + numI * pivotI) / den;
      const fI = (numI * pivotR - numR * pivotI) / den;
      for (let c = k; c < n; c++) {
        grid[r * n + c] = grid[r * n + c]! - (fR * grid[k * n + c]! - fI * imag[k * n + c]!);
        imag[r * n + c] = imag[r * n + c]! - (fR * imag[k * n + c]! + fI * grid[k * n + c]!);
      }
    }
  }
  if (singular) return { kind: 'Singular Mat' };
  for (let k = 0; k < n; k++) {
    detR *= grid[k * n + k]!;
    detI *= imag[k * n + k]!;
  }
  if (detI === 0) return sig(detR);
  return cx(detR, detI);
}

export function matInverse(m: Matrix): Value {
  if (m.rows !== m.cols) return { kind: 'NDim Error' };
  const n = m.rows;
  if (n === 0) return { kind: 'NDim Error' };
  // Gauss-Jordan on the augmented matrix [M | I].
  const size = 2 * n;
  const g: number[][] = [];
  for (let r = 0; r < n; r++) {
    const row: number[] = new Array<number>(size).fill(0);
    for (let c = 0; c < n; c++) {
      const u = unwrap(m.cells[r * n + c]!);
      row[c] = typeof u === 'number' ? u : 0;
    }
    row[n + r] = 1;
    g.push(row);
  }
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(g[r]![k]!) > Math.abs(g[pivot]![k]!)) pivot = r;
    if (Math.abs(g[pivot]![k]!) < 1e-14) return { kind: 'Singular Mat' };
    const t = g[k]!;
    g[k] = g[pivot]!;
    g[pivot] = t;
    const p = g[k]![k]!;
    for (let c = 0; c < size; c++) g[k]![c] = g[k]![c]! / p;
    for (let r = 0; r < n; r++) {
      if (r === k) continue;
      const f = g[r]![k]!;
      if (f === 0) continue;
      for (let c = 0; c < size; c++) g[r]![c] = g[r]![c]! - f * g[k]![c]!;
    }
  }
  const cells: Value[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.push(sig(g[r]![n + c]!));
  return mat(n, n, cells);
}

// --------------------------------------------------------------- comparison

export type CompareResult = -1 | 0 | 1 | null;

export function compare(a: Value, b: Value): CompareResult {
  if (isErr(a) || isErr(b) || isMatrix(a) || isMatrix(b) || isFrac(a) || isFrac(b)) return null;
  const ua = unwrap(a);
  const ub = unwrap(b);
  const na = typeof ua === 'number' ? ua : ua.re;
  const nb = typeof ub === 'number' ? ub : ub.re;
  if (isComplex(ua) || isComplex(ub)) return null;
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

/** Collapse to a real number when possible; used for display and stats. */
export function toNumber(v: Value): number {
  const u = unwrap(v);
  return typeof u === 'number' ? u : u.re;
}

export function cpxParts(v: Value): { re: number; im: number } {
  const u = unwrap(v);
  return typeof u === 'number' ? { re: u, im: 0 } : { re: u.re, im: u.im };
}

export { cAbs, cArg, cConj, cIsReal };
