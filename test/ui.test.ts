import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { CalculatorController, createController } from '../src/ui/controller.ts';
import { KEY_ROWS, PHYSICAL_MAP } from '../src/ui/layout.ts';
import { solve } from '../src/core/solver.ts';
import { defaultState } from '../src/core/evaluator.ts';
import { quickEval } from '../src/core/pipeline.ts';
import { oneVarStats, twoVarStats, tableValues, emptyStore, appendValue } from '../src/core/stats.ts';
import { MENUS } from '../src/ui/menus.ts';

/** Row `index` of the LCD, or an empty string if the row is not present. */
function lcdRow(c: CalculatorController, index: number): string {
  return c.displayRows()[index] ?? '';
}

function lcdRows(c: CalculatorController): string[] {
  return c.displayRows();
}

/**
 * Types an expression by pressing the key for each character.
 *
 * Longest-label-first matching means `sin` resolves to the sin key rather than
 * to `s`. ASCII punctuation is folded onto the glyphs printed on the caps so
 * tests can be written with ordinary characters.
 */
function typeExpression(c: CalculatorController, text: string): void {
  let rest = foldPunctuation(text);
  while (rest.length > 0) {
    const match = longestKeyFor(rest);
    if (!match) throw new Error(`no key for prefix ${JSON.stringify(rest)}`);
    c.press(match.id);
    rest = rest.slice(match.length);
  }
}

/** ASCII spellings mapped onto the symbols printed on the keys. */
const PUNCTUATION: ReadonlyMap<string, string> = new Map([
  ['-', '\u2212'],
  ['*', '\u00d7'],
  ['/', '\u00f7'],
]);

function foldPunctuation(text: string): string {
  return [...text].map(ch => PUNCTUATION.get(ch) ?? ch).join('');
}

function longestKeyFor(text: string): { id: string; length: number } | null {
  const lower = text.toLowerCase();
  const label = [...PHYSICAL_MAP.keys()]
    .filter(l => lower.startsWith(l))
    .sort((a, b) => b.length - a.length)[0];
  if (label === undefined) return null;
  const id = PHYSICAL_MAP.get(label);
  return id === undefined ? null : { id, length: label.length };
}

const evalIn = (text: string) => {
  const c = createController();
  typeExpression(c, text);
  c.press('equals');
  return c.currentAnswer();
};

test('keyboard layout is internally consistent', () => {
  const ids = new Set<string>();
  for (const row of KEY_ROWS) {
    for (const key of row) {
      assert.equal(ids.has(key.id), false, `duplicate key id ${key.id}`);
      ids.add(key.id);
      assert.equal(typeof key.label, 'string');
      assert.ok(key.label.length > 0, `${key.id} has no label`);
    }
  }
  assert.equal(ids.has('equals'), true);
  assert.equal(ids.has('shift'), true);
});

test('menus reference existing titles', () => {
  for (const [title, items] of Object.entries(MENUS)) {
    for (const item of items) {
      if (item.submenu) {
        assert.ok(MENUS[item.submenu], `${title} -> ${item.submenu} missing`);
      }
    }
  }
});

test('typing digits and pressing equals', () => {
  assert.equal(evalIn('123'), '123');
  assert.equal(evalIn('12+34'), '46');
  assert.equal(evalIn('9÷2'), '4.5');
});

test('multiplication key inserts the display multiply sign', () => {
  const c = createController();
  typeExpression(c, '6');
  c.press('multiply');
  typeExpression(c, '7');
  c.press('equals');
  assert.equal(c.currentAnswer(), '42');
});

test('preview updates the result row before equals', () => {
  const c = createController();
  typeExpression(c, '2');
  c.press('plus');
  typeExpression(c, '3');
  assert.equal(c.currentAnswer(), '5');
});

test('entryClosed starts a fresh expression after equals', () => {
  const c = createController();
  typeExpression(c, '5');
  c.press('equals');
  assert.equal(c.currentAnswer(), '5');
  typeExpression(c, '6');
  c.press('plus');
  // A new entry must not append to the previous answer.
  assert.equal(c.view().entry, '6+');
});

test('backspace removes the last character', () => {
  const c = createController();
  typeExpression(c, '123');
  c.press('backspace');
  assert.equal(c.view().entry, '12');
});

test('AC clears the entry and the answer', () => {
  const c = createController();
  typeExpression(c, '7');
  c.press('equals');
  c.press('ac');
  assert.equal(c.view().entry, '');
  assert.equal(c.currentAnswer(), '0');
});

test('shift toggles and produces the shifted function', () => {
  const c = createController();
  c.press('shift');
  assert.equal(c.view().shift, true);
  c.press('sin');
  // SHIFT + sin is the inverse, which the parser reads as sin⁻¹.
  assert.match(c.view().entry, /sin⁻¹/);
  // The modifier clears after the key that used it.
  assert.equal(c.view().shift, false);
});

test('alpha produces a variable letter', () => {
  const c = createController();
  c.press('alpha');
  c.press('7');
  assert.equal(c.view().entry, 'A');
});

test('replay walks back through previous entries', () => {
  const c = createController();
  typeExpression(c, '2+3');
  c.press('equals');
  assert.equal(c.currentAnswer(), '5');

  c.press('replay');
  assert.equal(c.view().entry, '2+3');
  // Only one entry is in the buffer, so stepping back again holds it.
  c.press('replay');
  assert.equal(c.view().entry, '2+3');
  // Stepping forward past the newest entry restores the displayed answer.
  c.press('replay-right');
  assert.equal(c.view().entry, '5');
});

test('solver finds linear and quadratic roots', () => {
  const state = defaultState();
  const linear = solve('2x+6=0', 'x', state, { initialGuess: 0 });
  assert.equal(linear.ok && Math.round(linear.value * 1e6) / 1e6, -3);

  const quadratic = solve('x^2-4=0', 'x', state, { initialGuess: 1 });
  assert.equal(quadratic.ok, true);
  assert.equal(quadratic.ok && Math.abs(quadratic.value - 2) < 1e-6, true);

  const unsolvable = solve('x^2+1=0', 'x', state, { initialGuess: 1 });
  assert.equal(unsolvable.ok, false);
});

/**
 * Types an equation, taking `x` from ALPHA + log.
 *
 * There is no lowercase `x` key: the unit puts the solver variable behind
 * ALPHA, so the same path is used here.
 */
function typeEquation(c: CalculatorController, text: string): void {
  // `=` is the equals key, which would evaluate mid-entry. Equation mode treats
  // a trailing `=0` as implicit, so typing stops there.
  const body = text.split('=')[0] ?? '';
  let rest = foldPunctuation(body);
  while (rest.length > 0) {
    if (rest[0] === 'x' || rest[0] === 'X') {
      // There is no lowercase `x` cap; the solver variable sits behind ALPHA.
      c.press('alpha');
      c.press('log');
      rest = rest.slice(1);
      continue;
    }
    const match = longestKeyFor(rest);
    if (!match) throw new Error(`no key for prefix ${JSON.stringify(rest)}`);
    c.press(match.id);
    rest = rest.slice(match.length);
  }
}

test('equation mode solves on equals', () => {
  const c = createController();
  c.press('mode'); // Equation
  assert.equal(c.view().mode, 'Equation');
  typeEquation(c, '2x+6=0');
  c.press('equals');
  assert.equal(c.currentAnswer(), '-3');
});

test('solve key solves the current expression', () => {
  const c = createController();
  typeEquation(c, '3x-9=0');
  c.press('solve');
  assert.equal(c.currentAnswer(), '3');
});

test('statistics over a list', () => {
  const one = oneVarStats([1, 2, 3, 4, 5]);
  assert.equal(one.ok && one.value.mean, 3);
  const two = twoVarStats([1, 2, 3, 4], [2, 4, 6, 8]);
  assert.equal(two.ok && two.value.b, 0);
  assert.equal(two.ok && two.value.r, 1);
  assert.equal(two.ok && two.value.a, 2);
});

test('statistics menu reads list values', () => {
  const c = createController();
  c.clearLists();
  for (const v of [1, 2, 3, 4, 5]) c.addStatValue('x', v);
  // MODE cycles until Stat, which opens the CALC sub-menu automatically.
  for (let i = 0; i < 6; i++) c.press('mode');
  assert.equal(c.view().mode, 'Stat');
  assert.equal(lcdRow(c, 1), '▸1:Min');
  c.press('down');
  c.press('down');
  c.press('equals');
  assert.equal(c.currentAnswer(), '3');
});

test('list store respects the entry cap', () => {
  const store = emptyStore();
  for (let i = 0; i < 90; i++) appendValue(store, 'x', i);
  const overflow = appendValue(store, 'x', 91);
  assert.equal(overflow.ok, false);
  assert.equal(store.get('x')?.values.length, 90);
});

test('table values follow start and step', () => {
  assert.deepEqual(tableValues(1, 0.5, 4), [1, 1.5, 2, 2.5]);
});

test('menu navigation wraps and exits', () => {
  const c = createController();
  c.press('menu');
  assert.match(lcdRow(c, 1), /▸1:Run/);
  // Up from the first item wraps to the last one.
  c.press('up');
  assert.match(lcdRow(c, 1), /A:Result/);
  c.press('down');
  assert.match(lcdRow(c, 1), /▸1:Run/);
  c.press('exit');
  // Leaving the menu restores the normal entry/result rows.
  assert.deepEqual(lcdRows(c), ['Deg', '0']);
});

test('setup changes the angle unit', () => {
  const c = createController();
  c.press('shift');
  c.press('mode'); // opens SETUP
  assert.match(lcdRow(c, 1), /1:Angle Unit/);
  c.press('equals');
  assert.match(lcdRow(c, 1), /1:Degree/);
  c.press('down');
  c.press('down'); // Gradian
  c.press('equals');
  typeExpression(c, 'sin30');
  c.press('equals');
  // 30 gradian is 27 degrees, so the answer differs from the degree result.
  assert.notEqual(c.currentAnswer(), '0.5');
  assert.match(c.view().indicator, /Gra/);
});

test('matrix mode is reachable and reports its mode', () => {
  const c = createController();
  for (let i = 0; i < 5; i++) c.press('mode');
  assert.equal(c.view().mode, 'Matrix');
});

test('hard reset restores defaults', () => {
  const c = createController();
  for (let i = 0; i < 3; i++) c.press('mode');
  assert.equal(c.view().mode, 'Table');
  c.press('on');
  assert.equal(c.view().mode, 'Run');
  assert.equal(c.view().entry, '');
  assert.equal(c.currentAnswer(), '0');
});

test('engine output matches what the controller displays', () => {
  // Guards against the UI formatting diverging from the core pipeline.
  assert.equal(evalIn('1+2×3'), quickEval('1+2×3'));
  assert.equal(evalIn('sin30'), quickEval('sin30', { angle: 'Deg' }));
});
