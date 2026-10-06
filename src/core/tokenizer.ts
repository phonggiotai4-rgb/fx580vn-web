/**
 * Tokeniser.
 *
 * Input arrives as a display string (the same characters the LCD shows) so the
 * expression line and the parser can never disagree about what was typed.
 */

import { err, ok, type Result } from './errors.js';

export type TokenType =
  | 'num'
  | 'const'
  | 'var'
  | 'func'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'assign'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
  readonly pos: number;
}

/** Functions recognised without parentheses, e.g. `sin30` or `sin⁻¹`. */
export const UNARY_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'sinh',
  'cosh',
  'tanh',
  'asin',
  'acos',
  'atan',
  'sin⁻¹',
  'cos⁻¹',
  'tan⁻¹',
  'log',
  'ln',
  'log₁₀',
  '10^',
  'e^',
  'Abs',
  'frac',
  'd/c',
  '°⁻',
  '°',
  '√',
  '∛',
  'x²',
  'x³',
  'x⁻¹',
  'nPr',
  'nCr',
  'n!',
  'Not',
  'Ran',
  'Ran#',
  'Int',
  'Frac',
  'gcd',
  'lcm',
  'min',
  'max',
  'exp',
  'sinh⁻¹',
  'cosh⁻¹',
  'tanh⁻¹',
  'Re',
  'Im',
  'Conjg',
  'Arg',
  'lc',
  'uc',
  'hypot',
  'digitAt',
  'digitSum',
  'digitProduct',
]);

export const CONSTANTS = new Set(['π']);

const OPERATOR_CHARS = new Set(['+', '-', '*', '/', '^', '×', '÷', '!', '%']);

const SUPERSCRIPT_DIGITS = new Set([
  '\u2070',
  '\u00b9',
  '\u00b2',
  '\u00b3',
  '\u2074',
  '\u2075',
  '\u2076',
  '\u2077',
  '\u2078',
  '\u2079',
  '\u207b',
]);

const SUPERSCRIPT_VALUES: Record<string, string> = {
  '\u2070': '0',
  '\u00b9': '1',
  '\u00b2': '2',
  '\u00b3': '3',
  '\u2074': '4',
  '\u2075': '5',
  '\u2076': '6',
  '\u2077': '7',
  '\u2078': '8',
  '\u2079': '9',
  '\u207b': '-',
};

function decodeSuperscripts(text: string): string {
  return text
    .split('')
    .map(ch => SUPERSCRIPT_VALUES[ch] ?? ch)
    .join('');
}

/**
 * Split a display string into tokens.
 *
 * Multi-character symbols must be tried longest-first so `×10ⁿ` and `log₁₀`
 * are not shredded into single characters.
 */
export function tokenize(input: string): Result<Token[]> {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i]!;

    if (ch === ' ') {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.]/.test(input[j]!)) j++;
      let text = input.slice(i, j);
      if ((text.match(/\./g) ?? []).length > 1) {
        return err('Syntax Error', 'multiple decimal points');
      }
      if (text === '.') {
        return err('Syntax Error', 'lone decimal point');
      }
      // Absorb a superscript run so a redisplayed `1.234×10⁵` reparses as a
      // single exponential literal rather than a product of two numbers.
      const supStart = j;
      while (j < n && SUPERSCRIPT_DIGITS.has(input[j]!)) j++;
      if (j > supStart) {
        text += `e${decodeSuperscripts(input.slice(supStart, j))}`;
      }
      tokens.push({ type: 'num', text, pos: i });
      i = j;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'assign', text: ch, pos: i });
      i++;
      continue;
    }

    if (OPERATOR_CHARS.has(ch) || ch === '×') {
      const op = ch === '×' ? '*' : ch === '÷' ? '/' : ch;
      tokens.push({ type: 'op', text: op, pos: i });
      i++;
      continue;
    }

    // Named symbol: functions, constants and variables.
    const named = matchNamed(input, i);
    if (named) {
      const type: TokenType = CONSTANTS.has(named.text)
        ? 'const'
        : UNARY_FUNCTIONS.has(named.text)
          ? 'func'
          : 'var';
      tokens.push({ type, text: named.text, pos: i });
      i += named.length;
      continue;
    }

    return err('Syntax Error', `unexpected "${ch}"`);
  }

  tokens.push({ type: 'eof', text: '', pos: n });
  return ok(tokens);
}

/**
 * Longest match over the known symbol names, so `sin⁻¹` wins over `sin`.
 */
function matchNamed(input: string, start: number): { text: string; length: number } | null {
  const candidates: string[] = [
    'sinh⁻¹',
    'cosh⁻¹',
    'tanh⁻¹',
    'sin⁻¹',
    'cos⁻¹',
    'tan⁻¹',
    'log₁₀',
    'digitAt',
    'digitSum',
    'digitProduct',
    'hypot',
    'Ran#',
    'sinh',
    'cosh',
    'tanh',
    'nPr',
    'nCr',
    'n!',
    'Abs',
    'Int',
    'Frac',
    'Conjg',
    'Re',
    'Im',
    'Arg',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'log',
    'ln',
    '10^',
    'e^',
    'd/c',
    'frac',
    '°⁻',
    '°',
    '√',
    '∛',
    'x²',
    'x³',
    'x⁻¹',
    'Not',
    'Ran',
    'gcd',
    'lcm',
    'min',
    'max',
    'exp',
    'lc',
    'uc',
    'π',
    'η',
  ];

  let best: { text: string; length: number } | null = null;
  for (const c of candidates) {
    if (input.startsWith(c, start) && (best === null || c.length > best.length)) {
      best = { text: c, length: c.length };
    }
  }
  if (best) return best;

  // Single-letter variable, including the Greek variable η used by the solver.
  const ch = input[start]!;
  if (/[A-ZxyθΣ]/.test(ch)) return { text: ch, length: 1 };
  return null;
}
