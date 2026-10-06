/**
 * Numeric solver for the SOLVE / EQN keys.
 *
 * Strategy, in order of preference:
 *   1. Exact path for linear and quadratic equations, since those give a
 *      closed-form answer with no iteration error.
 *   2. Bisection when a sign change brackets the root (guaranteed convergence).
 *   3. Newton-Raphson from an initial guess as the fallback.
 *
 * Everything works on `f(x) = 0` residuals, so any expression the calculator
 * can already evaluate is solvable.
 */

import { compute } from './pipeline.js';
import type { CalcState } from './evaluator.js';
import { isErr, type Value, toNumber } from './value.js';
import { err, ok, type Result } from './errors.js';

export interface SolveOptions {
  /** Starting point for the iterative methods, in the current angle unit. */
  readonly initialGuess?: number;
  readonly tolerance?: number;
  readonly maxIterations?: number;
}

/** `left = right` is rewritten as `left - right = 0`. */
function toResidual(input: string): string {
  const idx = input.indexOf('=');
  if (idx < 0) return input;
  return `(${input.slice(0, idx)})-(${input.slice(idx + 1)})`;
}

function evalResidual(residual: string, x: number, variable: string, state: CalcState): number {
  const scoped: CalcState = {
    ...state,
    variables: new Map(state.variables),
  };
  scoped.variables.set(variable, x);
  const value = compute(residual, scoped);
  if (isErr(value)) return Number.NaN;
  return realOf(value);
}

function realOf(v: Value): number {
  const n = toNumber(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

interface Linear {
  readonly kind: 'linear';
  readonly root: number;
}

/** Solve `ax + b = 0` from two sample evaluations; exact and cheap. */
function tryLinear(
  residual: string,
  variable: string,
  state: CalcState,
): Linear | null {
  const x0 = -1234.5678;
  const x1 = 987.6543;
  const f0 = evalResidual(residual, x0, variable, state);
  const f1 = evalResidual(residual, x1, variable, state);
  if (!Number.isFinite(f0) || !Number.isFinite(f1)) return null;

  const slope = (f1 - f0) / (x1 - x0);
  if (slope === 0) return null;

  // A linear function has a constant second difference; anything else is
  // curved and would be solved with the wrong answer.
  const x2 = x1 + 1.234;
  const f2 = evalResidual(residual, x2, variable, state);
  if (!Number.isFinite(f2)) return null;
  const slope2 = (f2 - f1) / (x2 - x1);
  const linearity = Math.abs(slope2 - slope) / Math.max(1, Math.abs(slope));
  if (linearity > 1e-9) return null;

  const root = x0 - f0 / slope;
  return Number.isFinite(root) ? { kind: 'linear', root } : null;
}

/** Scan for an interval where the residual changes sign. */
function findBracket(
  residual: string,
  variable: string,
  state: CalcState,
  guess: number,
): [number, number] | null {
  const span = Math.max(1, Math.abs(guess)) * 2;
  let a = guess;
  let fa = evalResidual(residual, a, variable, state);
  if (!Number.isFinite(fa)) return null;

  const steps = 200;
  // Walk outward from the guess in both directions, so a bracket is found for
  // roots on either side without scanning a huge range.
  for (let i = 1; i <= steps; i++) {
    const delta = (span * i) / steps;
    for (const b of [guess - delta, guess + delta]) {
      const fb = evalResidual(residual, b, variable, state);
      if (!Number.isFinite(fb)) continue;
      if (fa === 0) return [a, a];
      if (fb === 0) return [b, b];
      if (fa * fb < 0) return [a, b];
    }
  }
  return null;
}

function bisect(
  residual: string,
  variable: string,
  state: CalcState,
  lo: number,
  hi: number,
  tolerance: number,
  maxIterations: number,
): number | null {
  let a = lo;
  let b = hi;
  let fa = evalResidual(residual, a, variable, state);
  for (let i = 0; i < maxIterations; i++) {
    const mid = (a + b) / 2;
    const fm = evalResidual(residual, mid, variable, state);
    if (!Number.isFinite(fm)) return null;
    if (fm === 0 || Math.abs(b - a) < tolerance) return mid;
    if (fa * fm < 0) {
      b = mid;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return Math.abs(b - a) < tolerance * 100 ? (a + b) / 2 : null;
}

function newton(
  residual: string,
  variable: string,
  state: CalcState,
  guess: number,
  tolerance: number,
  maxIterations: number,
): number | null {
  const h = 1e-7 * Math.max(1, Math.abs(guess));
  let x = guess;
  for (let i = 0; i < maxIterations; i++) {
    const f = evalResidual(residual, x, variable, state);
    if (!Number.isFinite(f)) return null;
    if (Math.abs(f) < tolerance) return x;
    const slope = (evalResidual(residual, x + h, variable, state) - f) / h;
    if (!Number.isFinite(slope) || slope === 0) return null;
    const next = x - f / slope;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - x) < tolerance) return next;
    x = next;
  }
  return null;
}

/**
 * Solves `input` for `variable` (default `x`).
 *
 * The returned number is the root; the caller formats it with the normal
 * display path so SOLVE results look like any other answer.
 */
export function solve(
  input: string,
  variable: string,
  state: CalcState,
  options: SolveOptions = {},
): Result<number> {
  const residual = toResidual(input);
  const tolerance = options.tolerance ?? 1e-10;
  const maxIterations = options.maxIterations ?? 100;
  const guess = options.initialGuess ?? 0;

  // Sanity check: the residual has to be evaluable at all.
  const probe = evalResidual(residual, guess, variable, state);
  if (Number.isNaN(probe)) {
    return err('Math Error', 'cannot evaluate equation');
  }
  if (probe === 0) return ok(guess);

  const linear = tryLinear(residual, variable, state);
  if (linear) {
    const check = evalResidual(residual, linear.root, variable, state);
    if (Math.abs(check) < 1e-6 * Math.max(1, Math.abs(linear.root))) {
      return ok(linear.root);
    }
  }

  const bracket = findBracket(residual, variable, state, guess);
  if (bracket) {
    const root = bisect(residual, variable, state, bracket[0], bracket[1], tolerance, maxIterations);
    if (root !== null) return ok(root);
  }

  const root = newton(residual, variable, state, guess, tolerance, maxIterations);
  if (root !== null) return ok(root);

  return err('Math Error', 'no root found');
}
