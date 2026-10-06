/**
 * Number formatting for the 12-character LCD.
 *
 * Mirrors the display spec of the fx-580VN X:
 *   - at most 10 significant digits are shown on a single line
 *   - values are normalised to an exponent when |exp| >= 10 or < -9
 *   - a trailing `.0` is shown for a whole result (except in Fix mode)
 */

import type { Value } from './value.js';
import { isFrac, isMatrix, isSymbolic } from './value.js';

export const DISPLAY_DIGITS = 10;

/** Per-mode display normalisation, mirroring the MODE > Display menu. */
export type NormalizeMode = 'Fix' | 'Eng' | 'Sci' | 'Float';

export interface DisplaySetting {
  readonly digits: number; // 0..9 for Fix/Eng/Sci, 0..9 for Float too
  readonly mode: NormalizeMode;
  readonly negativeSign: '-' | '(';
}

/**
 * Factory default, matching the MODE > Display > Norm setting the unit ships
 * with: ten significant digits, no fixed decimal places.
 */
export const DEFAULT_DISPLAY: DisplaySetting = {
  digits: 10,
  mode: 'Float',
  negativeSign: '-',
};

interface DecimalParts {
  readonly negative: boolean;
  readonly digits: string; // digits only, no dot
  readonly pointPos: number; // index in `digits` where the dot goes
}

function decompose(x: number, sigDigits: number): DecimalParts {
  const s = Math.abs(x).toExponential(Math.max(0, sigDigits - 1));
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!m) {
    return { negative: x < 0, digits: String(Math.abs(x)), pointPos: 1 };
  }
  const mantissa = `${m[1]}${m[2] ?? ''}`;
  const exp = Number(m[3]);
  return { negative: x < 0, digits: mantissa, pointPos: exp + 1 };
}

/**
 * Normalise a real for display.
 *
 * Returns the character string the LCD shows, including a leading `-` when the
 * setting asks for parentheses instead.
 */
export function formatReal(
  x: number,
  setting: DisplaySetting = DEFAULT_DISPLAY,
): string {
  if (Number.isNaN(x)) return 'ERROR';
  if (x === Number.POSITIVE_INFINITY) return '∞';
  if (x === Number.NEGATIVE_INFINITY) return '-∞';

  const negative = x < 0 || Object.is(x, -0);
  const abs = Math.abs(x);
  const neg = negative && abs !== 0 ? (setting.negativeSign === '(' ? '(' : '-') : '';

  if (abs === 0) return neg + formatZero(setting);

  switch (setting.mode) {
    case 'Sci':
      return neg + formatScientific(abs, setting.digits);
    case 'Eng':
      return neg + formatEngineering(abs, setting.digits);
    case 'Fix':
      return neg + formatFixed(abs, setting.digits);
    default:
      return neg + formatNormalised(abs, setting.digits);
  }
}

function formatZero(setting: DisplaySetting): string {
  if (setting.mode === 'Fix') return `0.${'0'.repeat(setting.digits)}`;
  if (setting.mode === 'Sci' || setting.mode === 'Eng') {
    return `0.${'0'.repeat(setting.digits)}×10⁰`;
  }
  return '0';
}

/**
 * Fixed notation.
 *
 * Trailing zeros are kept: Fix 4 shows `7.0000`, which is the whole point of
 * choosing Fix over Norm.
 */
function formatFixed(abs: number, digits: number): string {
  if (abs >= 1e10) return formatNormalised(abs, DISPLAY_DIGITS);
  return abs.toFixed(digits);
}

function formatScientific(abs: number, digits: number): string {
  const parts = decompose(abs, digits + 1);
  const mantissa = parts.digits.slice(0, digits + 1);
  const dot = mantissa.length > 1 ? `.${mantissa.slice(1)}` : '';
  return `${mantissa[0]}${dot}×10${superscriptExp(parts.pointPos - 1)}`;
}

function formatEngineering(abs: number, digits: number): string {
  const parts = decompose(abs, digits + 1);
  const exponent = parts.pointPos - 1;
  let lead = exponent % 3;
  if (lead < 0) lead += 3;
  const shifted = parts.pointPos - lead;
  let mantissa = '';
  for (let i = 0; i < shifted; i++) mantissa += parts.digits[i] ?? '0';
  const rest = parts.digits.slice(shifted, shifted + 10);
  const padded = (rest + '0'.repeat(10)).slice(0, Math.max(0, digits - 1 - lead));
  const dot = padded.length > 0 ? `.${padded}` : '';
  return `${mantissa}${dot}×10${superscriptExp(lead)}`;
}

/**
 * Casio's automatic normalisation: switch to exponential when the exponent is
 * outside [-9, 9], otherwise print in place.
 */
function formatNormalised(abs: number, sigDigits: number): string {
  const parts = decompose(abs, sigDigits);
  const exponent = parts.pointPos - 1;

  if (exponent >= 10 || exponent <= -10) {
    const mantissa = parts.digits.slice(0, sigDigits);
    const dot = mantissa.length > 1 ? `.${mantissa.slice(1)}` : '';
    return `${mantissa[0]}${dot}×10${superscriptExp(exponent)}`;
  }
  if (exponent >= 0) {
    const intPart = parts.digits.slice(0, parts.pointPos);
    const rest = trimTrailingZeros(parts.digits.slice(parts.pointPos));
    if (rest.length === 0) return intPart;
    return `${intPart}.${rest}`;
  }
  return `0.${'0'.repeat(-parts.pointPos)}${trimTrailingZeros(parts.digits)}`;
}

/** Norm mode shows the shortest form; the `.0` padding is a Fix-mode habit. */
function trimTrailingZeros(digits: string): string {
  return digits.replace(/0+$/, '');
}

const SUPERSCRIPTS: Record<string, string> = {
  '0': '\u2070',
  '1': '\u00b9',
  '2': '\u00b2',
  '3': '\u00b3',
  '4': '\u2074',
  '5': '\u2075',
  '6': '\u2076',
  '7': '\u2077',
  '8': '\u2078',
  '9': '\u2079',
  '-': '\u207b',
};

export function superscriptExp(e: number): string {
  const s = String(e);
  return s
    .split('')
    .map(ch => SUPERSCRIPTS[ch] ?? ch)
    .join('');
}

/** Decimal value of a string that may carry a `×10ⁿ` suffix. */
export function parseDisplay(s: string): number {
  const m = /^(-?[\d.]+)(?:×10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+))?$/.exec(s);
  if (!m) return Number.NaN;
  const base = Number(m[1]);
  if (!m[2]) return base;
  const expText = m[2].replace(/\u2070/g, '0')
    .replace(/\u00b9/g, '1')
    .replace(/\u00b2/g, '2')
    .replace(/\u00b3/g, '3')
    .replace(/\u2074/g, '4')
    .replace(/\u2075/g, '5')
    .replace(/\u2076/g, '6')
    .replace(/\u2077/g, '7')
    .replace(/\u2078/g, '8')
    .replace(/\u2079/g, '9')
    .replace(/\u207b/g, '-');
  return base * 10 ** Number(expText);
}

export function formatFraction(n: bigint, d: bigint): string {
  const sign = n < 0n ? '-' : '';
  const an = n < 0n ? -n : n;
  return `${sign}${an.toString()}▐${d.toString()}`;
}

/** Full display string for any value, including matrices. */
export function formatValue(v: Value, setting: DisplaySetting = DEFAULT_DISPLAY): string {
  if (typeof v === 'number') return formatReal(v, setting);
  if (isFrac(v)) return formatFraction(v.n, v.d);
  if (isSymbolic(v)) {
    switch (v.tag) {
      case 'pi':
        return 'π';
      case 'e':
        return 'e';
      case 'i':
        return 'i';
      case 'inf':
        return '∞';
      default:
        return 'Ans';
    }
  }
  if (isMatrix(v)) {
    return `Matrix[${v.rows}×${v.cols}]`;
  }
  if ('re' in v && 'im' in v) {
    const re = v.im < 0 || Object.is(v.im, -0) ? '' : '+';
    const imPart = Math.abs(v.im) === 1 ? 'i' : `${formatReal(Math.abs(v.im), setting)}i`;
    if (v.re === 0) return v.im < 0 ? `-${imPart}` : imPart;
    return `${formatReal(v.re, setting)}${re}${imPart}`;
  }
  return v.kind;
}
