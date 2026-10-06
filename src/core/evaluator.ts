/**
 * AST evaluator.
 *
 * Owns no state except through the `CalcState` handle it is given, which is
 * what makes the whole calculator replayable and testable: feed it a state
 * snapshot and an expression string and you get the answer.
 */

import type { AngleUnit, Value } from './value.js';
import {
  type Matrix,
  PI,
  add,
  asCpx,
  cpxParts,
  div,
  isComplex,
  isErr,
  isFrac,
  isMatrix,
  mul,
  neg,
  pow,
  sig,
  sub,
  toNumber,
  unwrap,
} from './value.js';
import { err, ok, type Result } from './errors.js';
import type { Node } from './parser.js';
import {
  factorial,
  fromRadians,
  toRadians,
  asinCpx,
  acosCpx,
  atanCpx,
  cosCpx,
  sinCpx,
  tanCpx,
  cExp,
  cLog,
  cLog10,
  cSinh,
  cCosh,
  cTanh,
  cSqrt,
  integerPart,
  fractionalPart,
  combinations,
  permutations,
  gcd as gcdFn,
  lcm as lcmFn,
} from './functions.js';
import { approxFrac, fSqrt, fToNumber, fracFromNumber } from './fraction.js';
import { cAbs, cArg, cConj, cPow } from './complex.js';

export interface CalcState {
  angle: AngleUnit;
  variables: Map<string, Value>;
  matrices: Map<string, Matrix>;
  ans: Value;
  /** Base-N mode: 2, 8, 10 or 16. */
  base: number;
  baseMode: boolean;
  fixDigits: number;
  fractionMode: boolean;
  complexMode: boolean;
  randomSeed?: number;
}

export function defaultState(): CalcState {
  return {
    angle: 'Deg',
    variables: new Map(),
    matrices: new Map(),
    ans: 0,
    base: 10,
    baseMode: false,
    fixDigits: 10,
    fractionMode: false,
    complexMode: false,
  };
}

class Evaluator {
  private stepBudget = 200_000;

  constructor(private readonly state: CalcState) {}

  eval(node: Node): Result<Value> {
    if (--this.stepBudget < 0) return err('Time-over');
    switch (node.type) {
      case 'num': {
        const v = Number(node.text);
        if (!Number.isFinite(v)) return err('Syntax Error', 'bad number');
        return ok(this.applyFractionGuard(v));
      }
      case 'const':
        return ok(PI);
      case 'ans':
        return ok(this.state.ans);
      case 'random':
        return ok(this.random());
      case 'var':
        return this.evalVar(node.name);
      case 'assign':
        return this.evalAssign(node);
      case 'unary':
        return this.evalUnary(node);
      case 'percent':
        return this.evalPercent(node);
      case 'binary':
        return this.evalBinary(node);
      case 'call':
        return this.evalCall(node);
      case 'seq': {
        let last: Value = 0;
        for (const item of node.items) {
          const r = this.eval(item);
          if (!r.ok) return r;
          last = r.value;
        }
        return ok(last);
      }
    }
  }

  private random(): number {
    return Math.random();
  }

  /**
   * Looks up a variable.
   *
   * Names match case-insensitively: the keyboard can only produce uppercase
   * letters (ALPHA), while equations and the solver are written with lowercase
   * `x`, and both have to reach the same slot.
   */
  private evalVar(name: string): Result<Value> {
    if (name === 'M') {
      const m = this.state.variables.get('M');
      return ok(m === undefined ? 0 : m);
    }
    const direct = this.state.variables.get(name);
    if (direct !== undefined) return ok(direct);
    for (const [key, value] of this.state.variables) {
      if (key.toLowerCase() === name.toLowerCase()) return ok(value);
    }
    return err('No Variable', name);
  }

  private evalAssign(node: Extract<Node, { type: 'assign' }>): Result<Value> {
    const value = this.eval(node.value);
    if (!value.ok) return value;
    if (isMatrix(value.value)) {
      this.state.matrices.set(node.target, value.value);
      return ok(value.value);
    }
    this.state.variables.set(node.target, value.value);
    if (isNumericScalar(value.value)) this.state.ans = value.value;
    return ok(value.value);
  }

  private evalUnary(node: Extract<Node, { type: 'unary' }>): Result<Value> {
    const operand = this.eval(node.operand);
    if (!operand.ok) return operand;
    if (node.op === '+') return operand;
    return this.mapValue(operand.value, neg);
  }

  /**
   * `200×5%` means 10, but `200×5%` written as a bare operand means 0.05 in the
   * percent-of-base sense. The calculator treats `%` as a postfix that divides
   * by 100 and then, inside `+`/`-`, scales against the left operand.
   */
  private evalPercent(node: Extract<Node, { type: 'percent' }>): Result<Value> {
    const operand = this.eval(node.operand);
    if (!operand.ok) return operand;
    const v = operand.value;
    if (isMatrix(v)) return this.mapValue(v, scalePercent);
    return ok(scalePercent(v));
  }

  private evalBinary(node: Extract<Node, { type: 'binary' }>): Result<Value> {
    const left = this.eval(node.left);
    if (!left.ok) return left;
    const right = this.eval(node.right);
    if (!right.ok) return right;

    const r = right.value;

    // Percent-of-base: `A + B%` scales B against A.
    if (node.op === '+' || node.op === '-') {
      if (node.right.type === 'percent' && !isMatrix(r)) {
        const base = toNumber(left.value);
        const scaled = sig(base * toNumber(r));
        return ok(node.op === '+' ? add(left.value, scaled) : sub(left.value, scaled));
      }
    }

    if (this.state.baseMode && !isMatrix(left.value) && !isMatrix(r)) {
      return ok(this.baseOp(node.op, left.value, r));
    }

    switch (node.op) {
      case '+':
        return this.finish(add(left.value, r));
      case '-':
        return this.finish(sub(left.value, r));
      case '*':
        return this.finish(mul(left.value, r));
      case '/':
        return this.finish(div(left.value, r));
      case '^':
        return this.finish(pow(left.value, r));
      default:
        return err('Syntax Error', node.op);
    }
  }

  private baseOp(op: string, a: Value, b: Value): Value {
    const x = toNumber(a);
    const y = toNumber(b);
    switch (op) {
      case '+':
        return this.baseResult(Math.trunc(x) + Math.trunc(y));
      case '-':
        return this.baseResult(Math.trunc(x) - Math.trunc(y));
      case '*':
        return this.baseResult(Math.trunc(x) * Math.trunc(y));
      case '/': {
        const yi = Math.trunc(y);
        if (yi === 0) return { kind: 'Math Error' };
        return this.baseResult(Math.trunc(Math.trunc(x) / yi));
      }
      case '^': {
        const e = Math.trunc(y);
        if (e < 0) return { kind: 'Math Error' };
        return this.baseResult(Math.trunc(x) ** e);
      }
      default:
        return { kind: 'Syntax Error' };
    }
  }

  /**
   * Re-encode an integer in the current Base-N width, using two's complement
   * for negatives exactly like the calculator does.
   */
  private baseResult(n: number): Value {
    const bits = bitWidth(this.state.base);
    let v = Math.trunc(n);
    const limit = 2 ** (bits - 1);
    v = ((v + limit) % (2 ** bits) + 2 ** bits) % (2 ** bits) - limit;
    return v;
  }

  /** Applies `fn` to a value, or element-wise across a matrix. */
  private mapValue(v: Value, fn: (x: Value) => Value): Result<Value> {
    if (isMatrix(v)) {
      const cells: Value[] = [];
      for (const c of v.cells) {
        const r = this.mapValue(c, fn);
        if (!r.ok) return r;
        cells.push(r.value);
      }
      return ok(matFrom(v.rows, v.cols, cells));
    }
    try {
      return this.finish(fn(v));
    } catch (e) {
      return err('Math Error', e instanceof Error ? e.message : undefined);
    }
  }

  /** Applies `fn` to the numeric payload of a value, complex included. */
  private mapNumeric(
    v: Value,
    fn: (x: number | import('./complex.js').Cpx) => number | import('./complex.js').Cpx,
  ): Result<Value> {
    return this.mapValue(v, x => {
      const u = unwrap(x);
      return fn(u) as Value;
    });
  }

  /** Apply mode simplifications to a computed result. */
  private finish(v: Value): Result<Value> {
    if (isErr(v)) return ok(v);
    if (isComplex(v)) {
      // Complex results arrive from trigonometry with a residue like 6e-17 in
      // the part that should be exactly zero; snap it so `√(-4)` prints `2i`.
      const re = Math.abs(v.re) < 1e-12 ? 0 : v.re;
      const im = Math.abs(v.im) < 1e-12 ? 0 : v.im;
      const cleaned: import('./complex.js').Cpx = { re: sig(re), im: sig(im) };
      if (!this.state.complexMode && cleaned.im === 0) return ok(cleaned.re);
      if (cleaned.im === 0 && cleaned.re === 0 && !this.state.complexMode) return ok(0);
      return ok(cleaned);
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return err('Math Error', 'overflow or NaN');
      return ok(sig(v));
    }
    if (isFrac(v)) {
      // In fraction mode a result is returned exactly; otherwise it converts.
      return this.state.fractionMode ? ok(v) : ok(fToNumber(v));
    }
    return ok(v);
  }

  private applyFractionGuard(v: number): number {
    return this.state.fractionMode ? v : sig(v);
  }

  private realArg(name: string, args: Node[]): Result<number> {
    const r = this.eval(args[0]!);
    if (!r.ok) return r;
    if (isMatrix(r.value)) return err('Math Error', `${name} of matrix`);
    const u = unwrap(r.value);
    return ok(typeof u === 'number' ? u : u.re);
  }

  private evalCall(node: Extract<Node, { type: 'call' }>): Result<Value> {
    const { name, args } = node;
    const a = name;

    // ---- functions needing a real scalar
    switch (a) {
      case 'n!': {
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        const f = factorial(r.value);
        if (!f.ok) return f;
        // In fraction mode `(-4)!` must display as `-1▐24`, not a decimal.
        if (this.state.fractionMode) {
          try {
            return ok(approxFrac(f.value));
          } catch {
            return this.finish(f.value);
          }
        }
        return this.finish(f.value);
      }
      case 'x²': {
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        return this.finish(sig(r.value * r.value));
      }
      case 'x³': {
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        return this.finish(sig(r.value ** 3));
      }
      case 'x⁻¹': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        return this.finish(div(1, r.value));
      }
      case 'Abs': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        return this.mapNumeric(r.value, x => (isComplex(x) ? cAbs(x) : Math.abs(x)));
      }
      case 'min':
      case 'max':
      case 'hypot': {
        const parts: number[] = [];
        for (const arg of args) {
          const r = this.realArg(a, [arg]);
          if (!r.ok) return r;
          parts.push(r.value);
        }
        if (parts.length < 2) return err('Arg Error', a);
        if (a === 'hypot') return this.finish(sig(Math.hypot(...parts)));
        return this.finish(a === 'min' ? Math.min(...parts) : Math.max(...parts));
      }
      case 'gcd':
      case 'lcm': {
        const r0 = this.realArg(a, [args[0]!]);
        if (!r0.ok) return r0;
        const r1 = this.realArg(a, [args[1]!]);
        if (!r1.ok) return r1;
        const g = a === 'gcd' ? gcdFn(r0.value, r1.value) : lcmFn(r0.value, r1.value);
        if (!g.ok) return g;
        return this.finish(g.value);
      }
      case 'nPr':
      case 'nCr': {
        const r0 = this.realArg(a, [args[0]!]);
        if (!r0.ok) return r0;
        const r1 = this.realArg(a, [args[1]!]);
        if (!r1.ok) return r1;
        const p = a === 'nPr' ? permutations(r0.value, r1.value) : combinations(r0.value, r1.value);
        if (!p.ok) return p;
        return this.finish(p.value);
      }
      case 'Int': {
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        return this.finish(sig(integerPart(r.value, this.state.angle, true)));
      }
      case 'Frac': {
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        return this.finish(sig(fractionalPart(r.value, this.state.angle, true)));
      }
      case '°': {
        // Degrees -> current angle unit: display stays decimal.
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        return this.finish(sig(r.value));
      }
      case '°⁻': {
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        return this.finish(sig(toRadians(r.value, 'Deg')));
      }
      case 'exp':
        return this.finish(Math.floor(1e6 * this.random()));
      case 'digitSum':
      case 'digitProduct': {
        const r = this.realArg(a, args);
        if (!r.ok) return r;
        const digits = Math.abs(Math.trunc(r.value))
          .toString()
          .split('')
          .map(Number);
        const acc = digits.reduce((acc2, d) => (a === 'digitSum' ? acc2 + d : acc2 * d), a === 'digitSum' ? 0 : 1);
        return this.finish(sig(acc));
      }
      case 'digitAt': {
        const r0 = this.realArg(a, [args[0]!]);
        if (!r0.ok) return r0;
        const r1 = this.realArg(a, [args[1]!]);
        if (!r1.ok) return r1;
        const s = Math.abs(Math.trunc(r0.value)).toString();
        const idx = Math.trunc(r1.value);
        const fromLeft = idx > 0;
        const pos = fromLeft ? idx : s.length + idx + 1;
        const ch = s[pos - 1];
        return this.finish(ch === undefined ? 0 : Number(ch));
      }
      case 'Not': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        const n = Math.trunc(toNumber(r.value));
        return this.finish(~n);
      }
      case 'Ran':
        return this.finish(this.random());
    }

    // ---- functions with a complex argument
    switch (a) {
      case 'sin':
        return this.cpxFn(a, args, z => sinCpx(z, this.state.angle));
      case 'cos':
        return this.cpxFn(a, args, z => cosCpx(z, this.state.angle));
      case 'tan':
        return this.cpxFn(a, args, z => tanCpx(z, this.state.angle));
      case 'sinh':
        return this.cpxFn(a, args, z => cSinh(z));
      case 'cosh':
        return this.cpxFn(a, args, z => cCosh(z));
      case 'tanh':
        return this.cpxFn(a, args, z => cTanh(z));
      case 'asin':
      case INVERSE_SIN:
        return this.cpxFn(a, args, z => asinCpx(z, this.state.angle));
      case 'acos':
      case INVERSE_COS:
        return this.cpxFn(a, args, z => acosCpx(z, this.state.angle));
      case 'atan':
      case INVERSE_TAN:
        return this.cpxFn(a, args, z => atanCpx(z, this.state.angle));
      case 'log':
      case 'log₁₀': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        const u = unwrap(r.value);
        if (typeof u === 'number' && u <= 0 && !this.state.complexMode) {
          return err('Math Error', 'log of non-positive');
        }
        return this.finish(cLog10(asCpx(u)));
      }
      case 'ln': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        const u = unwrap(r.value);
        if (typeof u === 'number' && u <= 0 && !this.state.complexMode) {
          return err('Math Error', 'ln of non-positive');
        }
        return this.finish(cLog(asCpx(u)));
      }
      case '10^':
        return this.cpxFn(a, args, z => cExp(cLog10(z)));
      case 'e^':
        return this.cpxFn(a, args, z => cExp(z));
      case '√':
        return this.cpxFn(a, args, z => cSqrt(z));
      case '∛':
        // Cube root via the principal branch: z^(1/3), not z^3.
        return this.cpxFn(a, args, z => cPow(z, 1 / 3));
      case 'x⁻¹': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        return this.finish(div(1, r.value));
      }
      case 'Re': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        return this.finish(sig(cpxParts(r.value).re));
      }
      case 'Im': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        return this.finish(sig(cpxParts(r.value).im));
      }
      case 'Conjg':
        return this.cpxFn(a, args, z => cConj(z));
      case 'Arg': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        const z = asCpx(unwrap(r.value));
        if (z.re === 0 && z.im === 0) return err('Math Error', 'Arg of 0');
        return this.finish(sig(fromRadians(cArg(z), this.state.angle)));
      }
    }

    switch (a) {
      case 'd/c': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        return this.finish(toFractionValue(r.value));
      }
      case 'frac': {
        const r = this.eval(args[0]!);
        if (!r.ok) return r;
        return this.finish(fToNumber(fracFromNumber(toNumber(r.value))));
      }
      default:
        return err('Syntax Error', `unknown function ${a}`);
    }
  }

  private cpxFn(
    name: string,
    args: Node[],
    fn: (z: import('./complex.js').Cpx) => import('./complex.js').Cpx,
  ): Result<Value> {
    const r = this.eval(args[0]!);
    if (!r.ok) return r;

    if (isMatrix(r.value)) {
      const cells: Value[] = [];
      for (const c of r.value.cells) {
        const out = fn(asCpx(unwrap(c)));
        cells.push(out.im === 0 ? sig(out.re) : out);
      }
      return ok(matFrom(r.value.rows, r.value.cols, cells));
    }

    const u = unwrap(r.value);
    if (typeof u === 'number' && u < 0 && !this.state.complexMode) {
      // Preserve the calculator's Math Error rather than producing a complex
      // result the current mode cannot display.
      if (NEGATIVE_DOMAIN_FNS.has(name)) {
        return err('Math Error', `${name} of negative`);
      }
    }
    const out = fn(asCpx(u));
    return this.finish(out);
  }

  finishRef(v: Value): Value {
    const r = this.finish(v);
    return r.ok ? r.value : { kind: 'Math Error' };
  }
}

function matFrom(rows: number, cols: number, cells: Value[]): Matrix {
  return { kind: 'matrix', rows, cols, cells };
}

function isNumericScalar(v: Value): boolean {
  return typeof v === 'number' || isComplex(v) || isFrac(v);
}

/**
 * Display spellings of the inverse trig keys. Kept as constants because the
 * glyphs are superscript-minus-one and easy to corrupt by accident.
 */
const INVERSE_SIN = 'sin\u207b\u00b9';
const INVERSE_COS = 'cos\u207b\u00b9';
const INVERSE_TAN = 'tan\u207b\u00b9';

/** Functions that report a Math Error on a negative real outside CMPLX mode. */
const NEGATIVE_DOMAIN_FNS = new Set([
  'sin',
  'cos',
  'tan',
  'sinh',
  'cosh',
  'tanh',
  'asin',
  'acos',
  'atan',
  INVERSE_SIN,
  INVERSE_COS,
  INVERSE_TAN,
  'log',
  'ln',
  '∛',
]);

function scalePercent(v: Value): Value {
  if (isMatrix(v)) return matFrom(v.rows, v.cols, v.cells.map(scalePercent));
  if (isFrac(v)) return div(v, 100);
  const u = unwrap(v);
  if (typeof u === 'number') return sig(u / 100);
  return { re: u.re / 100, im: u.im / 100 };
}

function bitWidth(base: number): number {
  switch (base) {
    case 2:
      return 16;
    case 8:
      return 12;
    case 16:
      return 16;
    default:
      return 16;
  }
}

/** `d/c` conversion: exact when the value is an exact rational. */
export function toFractionValue(v: Value): Value {
  if (isFrac(v)) return v;
  if (isMatrix(v)) return matFrom(v.rows, v.cols, v.cells.map(toFractionValue));
  const u = unwrap(v);
  if (typeof u !== 'number') return v;
  try {
    const f = fSqrt(approxFrac(u));
    return f ?? approxFrac(u);
  } catch {
    return v;
  }
}

export function evaluate(node: Node, state: CalcState): Result<Value> {
  return new Evaluator(state).eval(node);
}
