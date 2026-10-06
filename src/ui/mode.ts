/**
 * Calculator modes and the SETUP options that live outside them.
 */

import type { AngleUnit } from '../core/value.js';
import type { NormalizeMode } from '../core/format.js';

export type CalcMode =
  | 'Run'
  | 'Equation'
  | 'Function'
  | 'Table'
  | 'Graph'
  | 'Matrix'
  | 'Stat'
  | 'BaseN'
  | 'Complex';

export const MODE_ORDER: readonly CalcMode[] = [
  'Run',
  'Equation',
  'Function',
  'Table',
  'Graph',
  'Matrix',
  'Stat',
  'BaseN',
  'Complex',
];

export function isNumericMode(mode: CalcMode): boolean {
  return mode === 'Run' || mode === 'Equation' || mode === 'BaseN' || mode === 'Complex';
}

export interface Setup {
  readonly angle: AngleUnit;
  readonly displayMode: NormalizeMode;
  readonly digits: number;
  readonly negativeSign: '-' | '(';
  readonly fractionInput: boolean;
  readonly rangeError: boolean;
  readonly autoPowerRestore: boolean;
}

export const DEFAULT_SETUP: Setup = {
  angle: 'Deg',
  displayMode: 'Float',
  digits: 10,
  negativeSign: '-',
  fractionInput: false,
  rangeError: true,
  autoPowerRestore: false,
};
