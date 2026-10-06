/**
 * Error model.
 *
 * Every core operation returns a `Result<T>` rather than throwing, so the UI
 * layer never needs try/catch and a single bad keystroke cannot corrupt state.
 */

export type ErrorKind =
  | 'Math Error'
  | 'Syntax Error'
  | 'Arg Error'
  | 'Range Error'
  | 'NDim Error'
  | 'Singular Mat'
  | 'Memory Error'
  | 'Cap Error'
  | 'Time-over'
  | 'No Variable'
  | 'Equation Error'
  | 'Non-real Ans'
  | 'Degree Error';

export interface CalcError {
  readonly kind: ErrorKind;
  // `undefined` is allowed explicitly so an error can be built from another
  // error's optional detail under `exactOptionalPropertyTypes`.
  readonly detail?: string | undefined;
}

/** Builds an error value, omitting `detail` entirely when it is absent. */
export function calcError(kind: ErrorKind, detail?: string): CalcError {
  return detail === undefined ? { kind } : { kind, detail };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: CalcError };

export function err<T>(kind: ErrorKind, detail?: string): Result<T> {
  return detail === undefined
    ? { ok: false, error: { kind } }
    : { ok: false, error: { kind, detail } };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Wrap a thrown JS error (out of range, bad input) into a CalcError. */
export function fromThrowable<T>(fn: () => T, kind: ErrorKind = 'Math Error'): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    if (e instanceof RangeError) return err(kind);
    if (e instanceof Error) return err(kind, e.message);
    return err(kind);
  }
}

export function isErrorMessage(value: unknown): value is CalcError {
  return typeof value === 'object' && value !== null && 'kind' in value;
}
