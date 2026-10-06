/**
 * MENU tree.
 *
 * A menu is a list of items; each item either runs a command or opens another
 * menu. Keeping the tree as data (rather than a switch in the key handler) is
 * what lets the same navigation code drive MODE, SETUP and the MATH menus.
 */

import type { Command } from './layout.js';

export interface MenuItem {
  readonly label: string;
  readonly command?: MenuCommand;
  /** Sub-menu title shown while this item is selected. */
  readonly submenu?: string;
}

export type MenuCommand =
  | Command
  | { kind: 'mode'; value: string }
  | { kind: 'toggle'; key: string }
  | { kind: 'math'; value: string }
  | { kind: 'complex'; value: string }
  | { kind: 'base'; value: number }
  | { kind: 'list-op'; value: string }
  | { kind: 'stat'; value: string }
  | { kind: 'solve-for'; value: string };

export type MenuTree = Readonly<Record<string, readonly MenuItem[]>>;

export const MENUS: MenuTree = {
  mode: [
    { label: '1:Run', command: { kind: 'mode', value: 'Run' } },
    { label: '2:Equation', command: { kind: 'mode', value: 'Equation' } },
    { label: '3:Function', command: { kind: 'mode', value: 'Function' } },
    { label: '4:Table', command: { kind: 'mode', value: 'Table' } },
    { label: '5:Graph', command: { kind: 'mode', value: 'Graph' } },
    { label: '6:Matrix', command: { kind: 'mode', value: 'Matrix' } },
    { label: '7:Stat', command: { kind: 'mode', value: 'Stat' } },
    { label: '8:BASE-N', command: { kind: 'mode', value: 'BaseN' } },
    { label: '9:Complex', command: { kind: 'mode', value: 'Complex' } },
    { label: '0:Base-N', command: { kind: 'mode', value: 'BaseN' } },
    { label: 'A:Result', command: { kind: 'toggle', key: 'showResult' } },
  ],

  setup: [
    { label: '1:Angle Unit', submenu: 'Angle Unit' },
    { label: '2:Display', submenu: 'Display' },
    { label: '3:Calculation', submenu: 'Calculation' },
  ],

  'Angle Unit': [
    { label: '1:Degree', command: { kind: 'toggle', key: 'angle:Deg' } },
    { label: '2:Radian', command: { kind: 'toggle', key: 'angle:Rad' } },
    { label: '3:Gradian', command: { kind: 'toggle', key: 'angle:Gra' } },
  ],

  Display: [
    { label: '1:Fix', command: { kind: 'toggle', key: 'display:Fix' } },
    { label: '2:Sci', command: { kind: 'toggle', key: 'display:Sci' } },
    { label: '3:Eng', command: { kind: 'toggle', key: 'display:Eng' } },
    { label: '4:Norm', command: { kind: 'toggle', key: 'display:Float' } },
    { label: '5:Negative Sign', submenu: 'Negative Sign' },
  ],

  'Negative Sign': [
    { label: '1: (-) Sign', command: { kind: 'toggle', key: 'sign:-' } },
    { label: '2: ( ) Sign', command: { kind: 'toggle', key: 'sign:(' } },
  ],

  Calculation: [
    { label: '1:Fraction Input', command: { kind: 'toggle', key: 'fractionInput' } },
    { label: '2:Range Error', command: { kind: 'toggle', key: 'rangeError' } },
  ],

  'Math/MATH': [
    { label: '1:Bracket', command: { kind: 'math', value: 'Bracket' } },
    { label: '2:Min', command: { kind: 'math', value: 'min' } },
    { label: '3:Max', command: { kind: 'math', value: 'max' } },
    { label: '4:LCM', command: { kind: 'math', value: 'lcm' } },
    { label: '5:GCD', command: { kind: 'math', value: 'gcd' } },
  ],

  'Math/√': [
    { label: '1:√', command: { kind: 'math', value: 'sqrt' } },
    { label: '2:³√', command: { kind: 'math', value: 'cbrt' } },
    { label: '3:x³', command: { kind: 'math', value: 'cube' } },
    { label: '4:x⁻¹', command: { kind: 'math', value: 'reciprocal' } },
    { label: '5:x!', command: { kind: 'math', value: 'factorial' } },
    { label: '6:Abs', command: { kind: 'math', value: 'abs' } },
  ],

  'Math/x²': [
    { label: '1:²√', command: { kind: 'math', value: 'sqrt' } },
    { label: '2:³√', command: { kind: 'math', value: 'cbrt' } },
    { label: '3:ˣ√', command: { kind: 'math', value: 'xroot' } },
  ],

  'Math/%': [
    { label: '1:%', command: { kind: 'math', value: 'percent' } },
  ],

  'Complex/CPLX': [
    { label: '1:Re', command: { kind: 'complex', value: 'Re' } },
    { label: '2:Im', command: { kind: 'complex', value: 'Im' } },
    { label: '3:Conjugate', command: { kind: 'complex', value: 'Conjg' } },
    { label: '4:Argument', command: { kind: 'complex', value: 'Arg' } },
  ],

  'Stat/List': [
    { label: '1:Edit', command: { kind: 'list-op', value: 'edit' } },
    { label: '2:Sort(A)', command: { kind: 'list-op', value: 'asc' } },
    { label: '3:Sort(D)', command: { kind: 'list-op', value: 'desc' } },
    { label: '4:Dim', command: { kind: 'list-op', value: 'dim' } },
  ],

  'Stat/CALC': [
    { label: '1:Min', command: { kind: 'stat', value: 'min' } },
    { label: '2:Max', command: { kind: 'stat', value: 'max' } },
    { label: '3:Mean', command: { kind: 'stat', value: 'mean' } },
    { label: '4:SUM', command: { kind: 'stat', value: 'sum' } },
    { label: '5:σx', command: { kind: 'stat', value: 'sigmaX' } },
    { label: '6:σx²', command: { kind: 'stat', value: 'sigmaX2' } },
  ],

  'Table/Start': [
    { label: '1:Start', command: { kind: 'list-op', value: 'start' } },
    { label: '2:End', command: { kind: 'list-op', value: 'end' } },
    { label: '3:Step', command: { kind: 'list-op', value: 'step' } },
  ],

  'Base-N/Base': [
    { label: '1:bin', command: { kind: 'base', value: 2 } },
    { label: '2:oct', command: { kind: 'base', value: 8 } },
    { label: '3:dec', command: { kind: 'base', value: 10 } },
    { label: '4:hex', command: { kind: 'base', value: 16 } },
  ],

  'Base-N/Logic': [
    { label: '1:AND', command: { kind: 'math', value: 'and' } },
    { label: '2:OR', command: { kind: 'math', value: 'or' } },
    { label: '3:XOR', command: { kind: 'math', value: 'xor' } },
    { label: '4:NOT', command: { kind: 'math', value: 'Not' } },
  ],
};

/** Items that belong to the MATH key, keyed by the key that owns them. */
export const MATH_SUBMENU: Readonly<Record<string, string>> = {
  frac: 'Math/%',
  divide: 'Math/MATH',
  multiply: 'Math/√',
  pow: 'Math/x²',
  percent: 'Math/%',
  solve: 'Math/MATH',
  sto: 'Math/MATH',
};
