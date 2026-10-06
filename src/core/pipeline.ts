/**
 * End-to-end pipeline: expression string -> tokens -> AST -> value -> text.
 *
 * This is the only entry point the UI needs, and it is deliberately a pure
 * function of `(input, state)` so tests can drive the whole calculator without
 * a DOM.
 */

import { tokenize } from './tokenizer.js';
import { parse } from './parser.js';
import { type CalcState, defaultState, evaluate } from './evaluator.js';
import {
  type DisplaySetting,
  type NormalizeMode,
  formatFraction,
  formatReal,
} from './format.js';
import { toFractionValue } from './evaluator.js';
import { type CalcError, calcError } from './errors.js';
import {
  type Value,
  isComplex,
  isErr,
  isFrac,
  isMatrix,
  isSymbolic,
  toNumber,
} from './value.js';


/**
 * Evaluates an expression, folding parse and evaluation failures into an error
 * *value*.
 *
 * This is the contract the UI relies on: `compute` always succeeds, and the
 * caller only has to look at the returned value to know what the LCD shows.
 */
export function compute(input: string, state: CalcState): Value {
  const t = tokenize(input);
  if (!t.ok) return calcError(t.error.kind, t.error.detail);
  if (t.value.length === 1) return calcError('Syntax Error', 'empty');
  const tree = parse(t.value);
  if (!tree.ok) return calcError(tree.error.kind, tree.error.detail);
  const result = evaluate(tree.value, state);
  if (!result.ok) return calcError(result.error.kind, result.error.detail);
  return result.value;
}

/** Runs `input` and updates `state` (Ans, variables) the way a real `=` does. */
export function evaluateAndCommit(input: string, state: CalcState): Value {
  const v = compute(input, state);
  if (!isErr(v)) state.ans = v;
  return v;
}

export interface DisplayContext {
  readonly setting: DisplaySetting;
  readonly fractionMode: boolean;
}

/**
 * Renders a value as one or more LCD lines.
 *
 * A matrix occupies several lines, so the UI-facing API returns an array and
 * single results are simply a one-element array.
 */
export function displayLines(value: Value, ctx: DisplayContext): string[] {
  if (isMatrix(value)) return formatMatrix(value, ctx);
  return [display(value, ctx)];
}

/** Renders a scalar value exactly as the LCD would show it. */
export function display(value: Value, ctx: DisplayContext): string {
  if (isErr(value)) return value.kind;
  if (isMatrix(value)) return `Matrix[${value.rows}×${value.cols}]`;
  if (isSymbolic(value)) {
    switch (value.tag) {
      case 'pi':
        return 'π';
      case 'e':
        return 'e';
      case 'i':
        return 'i';
      case 'inf':
        return '∞';
      default:
        return value.carry !== undefined
          ? formatReal(toNumber(value.carry), ctx.setting)
          : 'Ans';
    }
  }
  if (isFrac(value)) return formatFraction(value.n, value.d);
  if (typeof value === 'number') return formatReal(value, ctx.setting);
  if (isComplex(value)) return formatComplex(value.re, value.im, ctx.setting);
  // The union is fully covered above; this satisfies the exhaustiveness check.
  return String((value as CalcError).kind);
}

function formatComplex(re: number, im: number, setting: DisplaySetting): string {
  const parts: string[] = [];
  if (re !== 0) parts.push(formatReal(re, setting));
  const imText = Math.abs(im) === 1 ? 'i' : `${formatReal(Math.abs(im), setting)}i`;
  if (im === 0) return parts.join('') || '0';
  if (re === 0) return `${im < 0 ? '-' : ''}${imText}`;
  parts.push(im < 0 ? `-${imText}` : `+${imText}`);
  return parts.join('');
}

function formatMatrix(m: import('./value.js').Matrix, ctx: DisplayContext): string[] {
  return m.cells.map(c => display(c, ctx));
}

/**
 * Evaluates and formats in one step.
 *
 * The error text is returned as the display string rather than as a failure,
 * so tests and the UI read the same way the LCD does.
 */
export function quickEval(
  input: string,
  overrides: Partial<CalcState> = {},
  displayMode: NormalizeMode = 'Float',
): string {
  const state: CalcState = { ...defaultState(), ...overrides };
  const value = compute(input, state);
  const setting: DisplaySetting = {
    digits: state.fixDigits,
    mode: displayMode,
    negativeSign: '-',
  };
  return display(value, { setting, fractionMode: state.fractionMode });
}

/** Applies `d/c` to the current answer. */
export function toFractionDisplay(value: Value, ctx: DisplayContext): string {
  return display(toFractionValue(value), ctx);
}
