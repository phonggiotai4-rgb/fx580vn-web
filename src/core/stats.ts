/**
 * Data lists for the statistics and table modes.
 *
 * A list is a flat array of finite reals plus the column names the LCD shows
 * (`x` / `y` in STAT mode, `START` / `STEP` in TABLE mode).
 */

import { err, ok, type Result } from './errors.js';

export const MAX_LIST_ITEMS = 90;

export type ListId = 'x' | 'y';

export interface DataList {
  readonly values: readonly number[];
}

export type ListStore = Map<ListId, DataList>;

export function emptyStore(): ListStore {
  return new Map<ListId, DataList>([
    ['x', { values: [] }],
    ['y', { values: [] }],
  ]);
}

export function listOf(store: ListStore, id: ListId): number[] {
  return store.get(id)?.values.slice() ?? [];
}

/** Appends, enforcing the same entry cap as the firmware. */
export function appendValue(store: ListStore, id: ListId, value: number): Result<DataList> {
  const current = store.get(id)?.values ?? [];
  if (current.length >= MAX_LIST_ITEMS) return err('Cap Error');
  if (!Number.isFinite(value)) return err('Math Error');
  const next = [...current, value];
  store.set(id, { values: next });
  return ok({ values: next });
}

/** Replaces the entry at `index`, or appends when `index` is past the end. */
export function setValue(
  store: ListStore,
  id: ListId,
  index: number,
  value: number,
): Result<DataList> {
  if (!Number.isFinite(value)) return err('Math Error');
  const current = store.get(id)?.values.slice() ?? [];
  if (index < 0) return err('Arg Error');
  if (index < current.length) {
    current[index] = value;
  } else {
    if (current.length >= MAX_LIST_ITEMS) return err('Cap Error');
    while (current.length < index) current.push(0);
    current.push(value);
  }
  const next = { values: current };
  store.set(id, next);
  return ok(next);
}

export function deleteAt(store: ListStore, id: ListId, index: number): Result<DataList> {
  const current = store.get(id)?.values.slice() ?? [];
  if (index < 0 || index >= current.length) return err('Arg Error');
  current.splice(index, 1);
  const next = { values: current };
  store.set(id, next);
  return ok(next);
}

export function clearList(store: ListStore, id: ListId): DataList {
  const next: DataList = { values: [] };
  store.set(id, next);
  return next;
}

export function clearAll(store: ListStore): void {
  store.set('x', { values: [] });
  store.set('y', { values: [] });
}

// -------------------------------------------------------------- statistics

export interface OneVarStats {
  readonly n: number;
  readonly mean: number;
  readonly sigmaX: number;
  readonly sigmaXn: number;
}

export function oneVarStats(values: readonly number[]): Result<OneVarStats> {
  const n = values.length;
  if (n === 0) return err('Math Error', 'empty list');
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sumSq = values.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  const sigmaX = n > 1 ? Math.sqrt(sumSq / (n - 1)) : 0;
  const sigmaXn = n > 1 ? Math.sqrt(sumSq / n) : 0;
  return ok({ n, mean, sigmaX, sigmaXn });
}

export interface TwoVarStats {
  readonly n: number;
  readonly meanX: number;
  readonly meanY: number;
  readonly sigmaX: number;
  readonly sigmaY: number;
  readonly sigmaXY: number;
  /** Linear regression slope and intercept. */
  readonly a: number;
  readonly b: number;
  /** Least-squares correlation coefficient. */
  readonly r: number;
}

export function twoVarStats(
  xs: readonly number[],
  ys: readonly number[],
): Result<TwoVarStats> {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return err('Math Error', 'empty list');
  if (n < 2) return err('Math Error', 'need 2 points');

  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const meanX = sx / n;
  const meanY = sy / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const sigmaX = Math.sqrt(sxx / (n - 1));
  const sigmaY = Math.sqrt(syy / (n - 1));
  const sigmaXY = Math.sqrt(sxy / (n - 1));
  const a = sxx === 0 ? 0 : sxy / sxx;
  const b = meanY - a * meanX;
  const denominator = Math.sqrt(sxx * syy);
  const r = denominator === 0 ? 0 : sxy / denominator;

  return ok({ n, meanX, meanY, sigmaX, sigmaY, sigmaXY, a, b, r });
}

/** Generates the `START + (n-1)*STEP` sequence used by TABLE mode. */
export function tableValues(start: number, step: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(start + i * step);
  return out;
}
