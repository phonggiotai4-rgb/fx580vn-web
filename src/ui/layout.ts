/**
 * Keyboard layout.
 *
 * Mirrors the physical fx-580VN X arrangement, including which function each
 * SHIFT and ALPHA press produces. Each key declares its own bindings so the
 * DOM renderer and the key handler read from a single source of truth.
 */

export type KeyRole = 'digit' | 'operator' | 'function' | 'control' | 'variable' | 'action';

export interface KeyBinding {
  /** Text inserted by a plain press. */
  readonly insert?: string;
  /** Text inserted by SHIFT + key. */
  readonly shifted?: string;
  /** Text inserted by ALPHA + key (a variable or Greek letter). */
  readonly alpha?: string;
  /** Command dispatched instead of inserting text. */
  readonly command?: Command;
  readonly shiftedCommand?: Command;
}

export type Command =
  | 'equals'
  | 'clear'
  | 'backspace'
  | 'shift'
  | 'alpha'
  | 'replay-left'
  | 'replay-right'
  | 'menu'
  | 'setup'
  | 'mode'
  | 'on'
  | 'ac'
  | 'del'
  | 'clear-entry'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'exit'
  | 'solve'
  | 'table'
  | 'stat-list'
  | 'x-frac'
  | 'ans'
  | 'sto'
  | 'comma'
  | 'toggle-sign'
  | 'zoom-in'
  | 'zoom-out';

export interface KeySpec {
  readonly id: string;
  readonly label: string;
  /** Text above the key, printed in SHIFT colour. */
  readonly above?: string;
  /** Text above the key, printed in ALPHA colour. */
  readonly alphaAbove?: string;
  readonly width?: 'normal' | 'wide' | 'narrow';
  readonly role: KeyRole;
  readonly binding: KeyBinding;
}

/**
 * Row order top to bottom. The physical unit has five key rows plus the
 * navigation cluster and the dedicated power keys.
 */
export const KEY_ROWS: readonly (readonly KeySpec[])[] = [
  [
    key('on', 'ON', 'ON', { command: 'on' }, { width: 'narrow', role: 'action' }),
    key('shift', 'SHIFT', 'shift', { command: 'shift' }, { width: 'wide', role: 'control' }),
    key('alpha', 'ALPHA', 'alpha', { command: 'alpha' }, { width: 'wide', role: 'control' }),
    key('mode', 'MODE', 'setup', { command: 'mode' }, { above: 'SETUP', role: 'control' }),
    key('menu', 'MENU', 'menu', { command: 'menu' }, { above: 'CATALOG', role: 'control' }),
    key('up', '▲', '▲', { command: 'up' }, { role: 'control' }),
    key('down', '▼', '▼', { command: 'down' }, { role: 'control' }),
  ],
  [
    key('7', '7', '7', { insert: '7', alpha: 'A' }, { alphaAbove: 'A' }),
    key('8', '8', '8', { insert: '8', alpha: 'B' }, { alphaAbove: 'B' }),
    key('9', '9', '9', { insert: '9', alpha: 'C' }, { alphaAbove: 'C' }),
    key('del', 'DEL', 'INS', { command: 'del' }, { above: 'INS', role: 'action' }),
    key('ac', 'AC', 'AC', { command: 'ac' }, { role: 'action' }),
    key('left', '◀', '◀', { command: 'left' }, { role: 'control' }),
    key('right', '▶', '▶', { command: 'right' }, { role: 'control' }),
  ],
  [
    key('4', '4', '4', { insert: '4', alpha: 'D' }, { alphaAbove: 'D' }),
    key('5', '5', '5', { insert: '5', alpha: 'E' }, { alphaAbove: 'E' }),
    key('6', '6', '6', { insert: '6', alpha: 'F' }, { alphaAbove: 'F' }),
    key('sin', 'sin', 'sin⁻¹', { insert: 'sin', shifted: 'sin⁻¹', alpha: 'S' }, {
      alphaAbove: 'S',
      role: 'function',
    }),
    key('cos', 'cos', 'cos⁻¹', { insert: 'cos', shifted: 'cos⁻¹', alpha: 'C' }, {
      alphaAbove: 'C',
      role: 'function',
    }),
    key('tan', 'tan', 'tan⁻¹', { insert: 'tan', shifted: 'tan⁻¹', alpha: 'T' }, {
      alphaAbove: 'T',
      role: 'function',
    }),
    key('exit', 'EXIT', 'EXIT', { command: 'exit' }, { role: 'action' }),
  ],
  [
    key('1', '1', '1', { insert: '1', alpha: 'M' }, { alphaAbove: 'M' }),
    key('2', '2', '2', { insert: '2', alpha: 'N' }, { alphaAbove: 'N' }),
    key('3', '3', '3', { insert: '3', alpha: 'L' }, { alphaAbove: 'L' }),
    key('pow', '^', 'x²', { insert: '^', shifted: 'x²', alpha: 'G' }, { alphaAbove: 'G', role: 'function' }),
    key('log', 'log', '10ˣ', { insert: 'log', shifted: '10^', alpha: 'X' }, {
      alphaAbove: 'X',
      role: 'function',
    }),
    key('ln', 'ln', 'eˣ', { insert: 'ln', shifted: 'e^', alpha: 'Y' }, {
      alphaAbove: 'Y',
      role: 'function',
    }),
    key('sto', 'STO', '→', { command: 'sto' }, { above: 'RCL', role: 'action' }),
  ],
  [
    key('0', '0', '0', { insert: '0', alpha: 'X', shifted: 'Ran#' }, { alphaAbove: 'R' , role: 'variable'}),
    key('dot', '.', '.', { insert: '.' }, { width: 'narrow' }),
    key('exp', 'EXP', 'π', { insert: 'Ran', shifted: 'π', alpha: 'e' }, {
      above: 'π',
      alphaAbove: 'e',
      role: 'function',
    }),
    key('minus', '(−)', 'A', { insert: '(-)', shifted: '(', alpha: 'W' }, {
      above: '(',
      alphaAbove: 'W',
      role: 'variable',
    }),
    key('equals', '=', 'Ans', { command: 'equals', shifted: 'Ans' }, {
      above: 'Ans',
      role: 'action',
    }),
    key('replay', '▶▶', '◀◀', { command: 'replay-left' }, {
      above: 'EDIT',
      width: 'wide',
      role: 'control',
    }),
  ],
  [
    key('solve', 'SOLVE', 'SOLVE', { command: 'solve' }, { above: 'ROOT', role: 'action' }),
    key('frac', 'a b/c', 'd/c', { command: 'x-frac' }, { above: 'd/c', role: 'action' }),
    key('sqrt', '√', '∛', { insert: '√', shifted: '∛' }, { role: 'function' }),
    key('percent', '%', '%', { insert: '%' }, { role: 'operator' }),
    key('divide', '÷', 'nCr', { insert: '÷', shifted: 'nCr' }, { above: 'nCr', role: 'operator' }),
    key('multiply', '×', 'nPr', { insert: '×', shifted: 'nPr' }, { above: 'nPr', role: 'operator' }),
    key('minus-op', '−', '(-)', { insert: '-' }, { above: '(−)', role: 'operator' }),
    key('plus', '+', '(+)', { insert: '+' }, { above: '(+)', role: 'operator' }),
  ],
];

function key(
  id: string,
  label: string,
  above: string,
  binding: KeyBinding,
  extra: Partial<KeySpec> = {},
): KeySpec {
  return { id, label, above, binding, role: 'digit', ...extra };
}

/**
 * Keys that exist logically but have no printed cap.
 *
 * The physical unit has no backspace key — it uses DEL together with the
 * cursor keys — but a browser keyboard always sends Backspace, so it is
 * modelled here rather than in the DOM layer.
 */
export const HIDDEN_KEYS: readonly KeySpec[] = [
  key('backspace', '⌫', '⌫', { command: 'backspace' }, { role: 'action' }),
  key('replay-right', '◀◀', '◀◀', { command: 'replay-right' }, { role: 'control' }),
];

/** All keys indexed by id, for keyboard-event dispatch. */
export const KEY_INDEX: ReadonlyMap<string, KeySpec> = new Map(
  [...KEY_ROWS.flat(), ...HIDDEN_KEYS].map(k => [k.id, k]),
);

/**
 * Maps a printed key label to its key id.
 *
 * Only keys that insert text or run a command are listed, so multi-character
 * labels (`sin`, `log`) resolve by prefix in the DOM layer.
 */
export const PHYSICAL_MAP: ReadonlyMap<string, string> = new Map(
  [...KEY_ROWS.flat(), ...HIDDEN_KEYS]
    .filter(k => k.binding.insert || k.binding.command)
    .map(k => [k.label.toLowerCase(), k.id]),
);

export const PHYSICAL_EXTRA: ReadonlyMap<string, string> = new Map([
  ['enter', 'equals'],
  ['backspace', 'backspace'],
  ['escape', 'ac'],
  ['delete', 'del'],
  ['arrowleft', 'left'],
  ['arrowright', 'right'],
  ['arrowup', 'up'],
  ['arrowdown', 'down'],
  ['shift', 'shift'],
]);
