/**
 * Calculator controller.
 *
 * Owns everything the LCD shows and every state transition the keys cause.
 * It has no DOM dependency: `render()` returns the two display lines and
 * `handle()` returns the command that was performed, so the whole UI state
 * machine is testable in Node.
 */

import { type CalcState, defaultState, toFractionValue } from '../core/evaluator.js';
import { type DisplaySetting, type NormalizeMode, formatReal } from '../core/format.js';
import {
  compute,
  display,
  displayLines,
  type DisplayContext,
} from '../core/pipeline.js';
import {
  type Value,
  isComplex,
  isErr,
  isFrac,
  isMatrix,
  toNumber,
} from '../core/value.js';
import { KEY_INDEX, type KeySpec } from './layout.js';
import { MENUS, type MenuItem } from './menus.js';
import { type CalcMode, DEFAULT_SETUP, MODE_ORDER, type Setup } from './mode.js';
import { solve } from '../core/solver.js';
import {
  type ListId,
  type ListStore,
  appendValue,
  clearAll,
  emptyStore,
  listOf,
  setValue,
  twoVarStats,
  oneVarStats,
  type OneVarStats,
  type TwoVarStats,
} from '../core/stats.js';

/** How many previous entries the replay buffer keeps, as on the real unit. */
export const REPLAY_DEPTH = 4;

export interface View {
  /** Row 1: the expression being typed. */
  readonly entry: string;
  /** Row 2: the answer or menu title. */
  readonly result: string;
  /** Indicator text drawn at the right of row 1. */
  readonly indicator: string;
  readonly mode: CalcMode;
  readonly shift: boolean;
  readonly alpha: boolean;
}

interface MenuState {
  readonly title: string;
  readonly items: readonly MenuItem[];
  index: number;
}

export class CalculatorController {
  private expr = '';
  private cursor = 0;
  private entryClosed = true;
  private shiftOn = false;
  private alphaOn = false;
  private replay: string[] = [];
  private replayIndex = -1;
  private menu: MenuState | null = null;
  private statEdit: { id: ListId; index: number } | null = null;

  private state: CalcState = defaultState();
  private setup: Setup = DEFAULT_SETUP;
  private mode: CalcMode = 'Run';
  private lists: ListStore = emptyStore();

  // ------------------------------------------------------------- public API

  view(): View {
    return {
      entry: this.expr,
      result: this.menu ? '' : this.answerText,
      indicator: this.indicator(),
      mode: this.mode,
      shift: this.shiftOn,
      alpha: this.alphaOn,
    };
  }

  /** The two rows the LCD should show right now. */
  displayRows(): string[] {
    if (this.menu) {
      const item = this.menu.items[this.menu.index];
      const prefix = this.menu.index === 0 ? '▸' : ' ';
      return ['', `${prefix}${item?.label ?? ''}`];
    }
    if (this.statEdit) {
      const values = listOf(this.lists, this.statEdit.id);
      const col = this.statEdit.id === 'x' ? 'x' : 'y';
      return [
        `${col}${this.statEdit.index + 1}=`,
        formatReal(values[this.statEdit.index] ?? 0, this.displaySetting()),
      ];
    }
    const v = this.view();
    return [v.indicator + v.entry, v.result];
  }

  private get answerText(): string {
    return this.lastAnswerText;
  }

  private lastAnswerText = '0';

  /** Feeds a key press through the whole stack and reports what changed. */
  press(keyId: string): void {
    const spec = KEY_INDEX.get(keyId);
    if (!spec) return;
    this.handle(spec);
  }

  private handle(spec: KeySpec): void {
    const command = spec.binding.command;

    if (command === 'shift') {
      this.shiftOn = !this.shiftOn;
      this.alphaOn = false;
      return;
    }
    if (command === 'alpha') {
      this.alphaOn = !this.alphaOn;
      this.shiftOn = false;
      return;
    }
    if (command === 'menu' && this.alphaOn) {
      this.openCatalog();
      this.resetModifiers();
      return;
    }
    if (command === 'mode' && this.shiftOn) {
      this.openMenu('setup');
      this.resetModifiers();
      return;
    }

    if (this.menu) {
      this.menuKey(spec);
      return;
    }

    // Navigation and editing work the same whether or not modifiers are held.
    switch (command) {
      case 'up':
        this.moveCursor(-1);
        this.resetModifiers();
        return;
      case 'down':
        this.moveCursor(1);
        this.resetModifiers();
        return;
      case 'left':
        this.moveCursor(-1);
        this.resetModifiers();
        return;
      case 'right':
        this.moveCursor(1);
        this.resetModifiers();
        return;
      case 'exit':
      case 'backspace':
        this.deleteBackward();
        this.resetModifiers();
        return;
      case 'del':
        this.deleteForward();
        this.resetModifiers();
        return;
      case 'ac':
        this.clearAllInput();
        this.resetModifiers();
        return;
      case 'clear-entry':
        this.expr = '';
        this.cursor = 0;
        this.resetModifiers();
        return;
      case 'menu':
        this.openMenu('mode');
        this.resetModifiers();
        return;
      case 'mode':
        this.cycleMode();
        this.resetModifiers();
        return;
      case 'on':
        this.hardReset();
        this.resetModifiers();
        return;
      case 'equals':
        this.evaluateEntry();
        this.resetModifiers();
        return;
      case 'x-frac':
        this.applyFraction();
        this.resetModifiers();
        return;
      case 'replay-left':
        this.moveReplay(-1);
        this.resetModifiers();
        return;
      case 'replay-right':
        this.moveReplay(1);
        this.resetModifiers();
        return;
      case 'solve':
        this.runSolve();
        this.resetModifiers();
        return;
      case 'sto':
        this.startStore();
        this.resetModifiers();
        return;
      default:
        break;
    }

    const insert = this.textFor(spec);
    if (insert !== undefined) {
      this.insertText(insert);
    }
    this.resetModifiers();
  }

  /** Text a key contributes given the current SHIFT / ALPHA state. */
  private textFor(spec: KeySpec): string | undefined {
    const { binding } = spec;
    if (this.alphaOn) return binding.alpha;
    if (this.shiftOn) return binding.shifted ?? binding.shiftedCommand === undefined ? binding.shifted : undefined;
    return binding.insert;
  }

  private resetModifiers(): void {
    this.shiftOn = false;
    this.alphaOn = false;
  }

  // --------------------------------------------------------------- entry

  private insertText(text: string): void {
    this.ensureEntryOpen();
    this.expr = this.expr.slice(0, this.cursor) + text + this.expr.slice(this.cursor);
    this.cursor += text.length;
    this.refresh();
  }

  private ensureEntryOpen(): void {
    if (this.entryClosed) {
      this.expr = '';
      this.cursor = 0;
      this.entryClosed = false;
    }
  }

  private deleteBackward(): void {
    if (this.expr.length === 0) return;
    this.entryClosed = false;
    if (this.cursor === 0) {
      this.expr = this.expr.slice(1);
      return;
    }
    this.expr = this.expr.slice(0, this.cursor - 1) + this.expr.slice(this.cursor);
    this.cursor--;
    this.refresh();
  }

  /** Forward delete at the cursor; does nothing once the cursor is at the end. */
  private deleteForward(): void {
    if (this.cursor >= this.expr.length) return;
    this.entryClosed = false;
    this.expr = this.expr.slice(0, this.cursor) + this.expr.slice(this.cursor + 1);
    this.refresh();
  }

  private moveCursor(direction: number): void {
    if (this.expr.length === 0) return;
    this.entryClosed = false;
    this.cursor = Math.max(0, Math.min(this.expr.length, this.cursor + direction));
  }

  private clearAllInput(): void {
    this.expr = '';
    this.cursor = 0;
    this.entryClosed = true;
    this.menu = null;
    this.statEdit = null;
    this.lastAnswerText = '0';
    this.replay = [];
    this.replayIndex = -1;
  }

  private hardReset(): void {
    this.clearAllInput();
    this.state = defaultState();
    this.setup = DEFAULT_SETUP;
    this.mode = 'Run';
    this.lists = emptyStore();
  }

  // ------------------------------------------------------------ evaluation

  private evaluateEntry(): void {
    const input = this.expr.trim();
    if (input.length === 0) {
      // A bare `=` repeats the last answer.
      this.expr = this.lastAnswerText;
      this.entryClosed = true;
      this.refresh();
      return;
    }

    const value = this.evaluateWithMode(input);
    this.lastAnswerText = this.renderValue(value);
    this.replay = [input, ...this.replay].slice(0, REPLAY_DEPTH);
    this.replayIndex = -1;
    this.expr = this.lastAnswerText;
    this.cursor = this.expr.length;
    this.entryClosed = true;
    this.refresh();
  }

  /** Evaluates taking the current mode into account. */
  private evaluateWithMode(input: string): Value {
    if (this.mode === 'Equation') {
      // In Equation mode `=` is implicit: `2X+6` means `2X+6=0`, which is how
      // the unit treats the entry when the solver key is used.
      const equation = input.includes('=') ? input : `${input}=0`;
      const result = solve(equation, 'x', this.state, { initialGuess: 0 });
      if (!result.ok) return { kind: 'Math Error' };
      return result.value;
    }
    if (this.statEdit) {
      const value = Number(this.expr);
      const r = setValue(this.lists, this.statEdit.id, this.statEdit.index, value);
      if (r.ok) {
        this.statEdit = { id: this.statEdit.id, index: this.statEdit.index + 1 };
      }
      return r.ok ? 0 : { kind: r.error.kind };
    }
    const value = compute(input, this.state);
    if (!isErr(value)) this.state.ans = value;
    return value;
  }

  private renderValue(value: Value): string {
    return display(value, this.displayContext());
  }

  private displayContext(): DisplayContext {
    return {
      setting: this.displaySetting(),
      fractionMode: this.state.fractionMode,
    };
  }

  private displaySetting(): DisplaySetting {
    return {
      digits: this.setup.digits,
      mode: this.setup.displayMode,
      negativeSign: this.setup.negativeSign,
    };
  }

  private refresh(): void {
    // The entry row shows a live preview of the result, like the unit does.
    if (this.expr.length === 0 || this.entryClosed) return;
    const value = this.preview();
    if (value === undefined) return;
    this.lastAnswerText = this.renderValue(value);
  }

  private preview(): Value | undefined {
    const t = this.expr.trim();
    if (t.length === 0) return undefined;
    // A trailing operator means the user is still typing.
    if (/[+\-×÷^%]$/.test(t)) return undefined;
    if (/^[a-z/π(]$/.test(t)) return undefined;
    const value = compute(t, this.state);
    if (isErr(value)) return undefined;
    return value;
  }

  private indicator(): string {
    const parts: string[] = [];
    if (this.shiftOn) parts.push('S');
    if (this.alphaOn) parts.push('A');
    if (this.state.fractionMode) parts.push('▐');
    if (this.state.baseMode) parts.push(`${this.state.base}`);
    if (this.setup.angle !== 'Rad') parts.push(this.setup.angle);
    return parts.join(' ');
  }

  // -------------------------------------------------------------- actions

  private applyFraction(): void {
    const input = this.expr.trim();
    const source = input.length > 0 ? compute(input, this.state) : this.state.ans;
    const asFraction = toFractionValue(source);
    this.lastAnswerText = this.renderValue(asFraction);
    this.expr = this.lastAnswerText;
    this.cursor = this.expr.length;
    this.entryClosed = true;
    this.refresh();
  }

  private startStore(): void {
    // `STO` stores the current entry in the next variable slot; the ALPHA
    // letters A..Z are addressed by pressing ALPHA then the letter.
    const match = /^([A-Za-z])\s*=\s*(.+)$/.exec(this.expr.trim());
    if (!match) {
      this.lastAnswerText = 'Syntax Error';
      this.expr = '';
      this.entryClosed = true;
      return;
    }
    const [, name, rhs] = match as unknown as [string, string, string];
    const value = compute(rhs, this.state);
    if (isErr(value)) {
      this.lastAnswerText = value.kind;
    } else {
      if (isMatrix(value)) this.state.matrices.set(name, value);
      else this.state.variables.set(name, value);
      this.lastAnswerText = this.renderValue(value);
    }
    this.expr = '';
    this.cursor = 0;
    this.entryClosed = true;
  }

  private runSolve(): void {
    const input = this.expr.trim();
    if (input.length === 0) {
      this.lastAnswerText = 'Math Error';
      return;
    }
    const result = solve(input, 'x', this.state, { initialGuess: 0 });
    this.lastAnswerText = result.ok ? this.renderValue(result.value) : 'Math Error';
    this.expr = this.lastAnswerText;
    this.cursor = this.expr.length;
    this.entryClosed = true;
  }

  // ----------------------------------------------------------------- mode

  private cycleMode(): void {
    const index = MODE_ORDER.indexOf(this.mode);
    this.mode = MODE_ORDER[(index + 1) % MODE_ORDER.length]!;
    this.applyMode();
  }

  private applyMode(): void {
    this.state.angle = this.setup.angle;
    this.state.baseMode = this.mode === 'BaseN';
    this.state.complexMode = this.mode === 'Complex';
    this.state.fractionMode = this.setup.fractionInput;
    if (this.state.baseMode && this.state.base === 10) this.state.base = 2;
    if (this.mode !== 'BaseN' && this.state.base !== 10) this.state.base = 10;
    if (this.mode === 'Stat') {
      this.openMenu('Stat/CALC');
    }
  }

  /** Applies the mode-derived parts of `state`; used on construction too. */
  syncMode(): void {
    this.applyMode();
  }

  // ---------------------------------------------------------------- menus

  private openMenu(title: string): void {
    const items = MENUS[title];
    if (!items) return;
    this.menu = { title, items, index: 0 };
  }

  private openCatalog(): void {
    // CATALOG lists functions by name; selecting one inserts it.
    this.openMenu('Math/√');
  }

  private menuKey(spec: KeySpec): void {
    const menu = this.menu;
    if (!menu) return;

    const command = spec.binding.command;
    if (command === 'exit' || command === 'ac' || command === 'menu') {
      this.menu = null;
      return;
    }
    // MODE leaves the menu and keeps cycling, so the mode sequence is never
    // swallowed by a sub-menu that opened on entering STAT.
    if (command === 'mode') {
      this.menu = null;
      this.cycleMode();
      return;
    }
    if (command === 'up') {
      menu.index = (menu.index - 1 + menu.items.length) % menu.items.length;
      return;
    }
    if (command === 'down') {
      menu.index = (menu.index + 1) % menu.items.length;
      return;
    }

    const item = menu.items[menu.index];
    if (!item) return;

    if (item.submenu) {
      this.openMenu(item.submenu);
      return;
    }
    if (!item.command) {
      this.menu = null;
      return;
    }
    this.runMenuCommand(item.command);
  }

  private runMenuCommand(command: NonNullable<MenuItem['command']>): void {
    if (typeof command === 'string') {
      this.menu = null;
      switch (command) {
        case 'equals':
          this.evaluateEntry();
          return;
        case 'clear-entry':
          this.expr = '';
          this.cursor = 0;
          this.refresh();
          return;
        default:
          return;
      }
    }

    switch (command.kind) {
      case 'mode': {
        this.mode = MODE_ORDER.find(m => m.toLowerCase() === command.value.toLowerCase()) ?? this.mode;
        this.menu = null;
        this.applyMode();
        return;
      }
      case 'toggle': {
        this.applyToggle(command.key);
        this.menu = null;
        return;
      }
      case 'base': {
        this.state.base = command.value;
        this.state.baseMode = true;
        this.mode = 'BaseN';
        this.menu = null;
        return;
      }
      case 'math': {
        this.menu = null;
        this.applyMath(command.value);
        return;
      }
      case 'complex': {
        this.menu = null;
        this.insertText(command.value);
        return;
      }
      case 'list-op': {
        this.menu = null;
        this.applyListOp(command.value);
        return;
      }
      case 'stat': {
        this.menu = null;
        this.applyStat(command.value);
        return;
      }
      default:
        this.menu = null;
        return;
    }
  }

  private applyToggle(key: string): void {
    const [name, value] = key.split(':');
    switch (name) {
      case 'angle':
        this.setup = { ...this.setup, angle: (value ?? 'Deg') as Setup['angle'] };
        break;
      case 'display':
        this.setup = { ...this.setup, displayMode: (value ?? 'Float') as NormalizeMode };
        break;
      case 'sign':
        this.setup = { ...this.setup, negativeSign: value === '(' ? '(' : '-' };
        break;
      case 'fractionInput':
        this.setup = { ...this.setup, fractionInput: !this.setup.fractionInput };
        break;
      case 'rangeError':
        this.setup = { ...this.setup, rangeError: !this.setup.rangeError };
        break;
      default:
        return;
    }
    this.applyMode();
  }

  private applyMath(value: string): void {
    switch (value) {
      case 'sqrt':
        this.insertText('√');
        return;
      case 'cbrt':
        this.insertText('∛');
        return;
      case 'cube':
        this.insertText('x³');
        return;
      case 'reciprocal':
        this.insertText('x⁻¹');
        return;
      case 'factorial':
        this.insertText('!');
        return;
      case 'abs':
        this.insertText('Abs');
        return;
      case 'xroot':
        this.insertText('^(1÷2)');
        return;
      case 'min':
        this.insertText('min');
        return;
      case 'max':
        this.insertText('max');
        return;
      case 'gcd':
        this.insertText('gcd');
        return;
      case 'lcm':
        this.insertText('lcm');
        return;
      case 'percent':
        this.insertText('%');
        return;
      default:
        return;
    }
  }

  private applyListOp(value: string): void {
    switch (value) {
      case 'edit':
        this.statEdit = { id: 'x', index: 0 };
        return;
      case 'asc':
        this.sortList('asc');
        return;
      case 'desc':
        this.sortList('desc');
        return;
      case 'dim':
        this.lastAnswerText = String(listOf(this.lists, 'x').length);
        return;
      default:
        return;
    }
  }

  private sortList(order: 'asc' | 'desc'): void {
    const values = listOf(this.lists, 'x');
    values.sort((a, b) => (order === 'asc' ? a - b : b - a));
    const r = setValue(this.lists, 'x', 0, values[0] ?? 0);
    if (r.ok) {
      this.lists.set('x', { values });
      this.lastAnswerText = '0';
    }
  }

  private applyStat(value: string): void {
    const xs = listOf(this.lists, 'x');
    const ys = listOf(this.lists, 'y');
    const stats =
      xs.length >= 2 && ys.length >= 2 ? twoVarStats(xs, ys) : oneVarStats(xs);
    if (!stats.ok) {
      this.lastAnswerText = stats.error.kind;
      return;
    }
    const v = this.statsValue(stats.value, value);
    this.lastAnswerText = v === undefined ? 'Syntax Error' : this.renderValue(v);
  }

  private statsValue(
    stats: OneVarStats | TwoVarStats,
    key: string,
  ): number | undefined {
    const two = (stats as TwoVarStats).meanY !== undefined;
    switch (key) {
      case 'min':
        return Math.min(...listOf(this.lists, 'x'));
      case 'max':
        return Math.max(...listOf(this.lists, 'x'));
      case 'mean':
        return two ? (stats as TwoVarStats).meanY : (stats as OneVarStats).mean;
      case 'sum':
        return listOf(this.lists, 'x').reduce((a, b) => a + b, 0);
      case 'sigmaX':
        return two ? (stats as TwoVarStats).sigmaY : (stats as OneVarStats).sigmaX;
      case 'sigmaX2':
        return two
          ? (stats as TwoVarStats).sigmaY ** 2
          : (stats as OneVarStats).sigmaX ** 2;
      case 'a':
        return (stats as TwoVarStats).a;
      case 'b':
        return (stats as TwoVarStats).b;
      case 'r':
        return (stats as TwoVarStats).r;
      default:
        return undefined;
    }
  }

  // --------------------------------------------------------------- replay

  private moveReplay(direction: number): void {
    if (this.replay.length === 0) return;
    // Replay is only available while an entry sits closed; once the user has
    // started typing again, the arrows go back to moving the cursor.
    if (!this.entryClosed && this.replayIndex < 0) return;

    if (direction < 0) {
      this.replayIndex = Math.min(this.replayIndex + 1, this.replay.length - 1);
    } else {
      this.replayIndex = this.replayIndex - 1;
    }

    if (this.replayIndex < 0) {
      this.expr = this.lastAnswerText;
      this.cursor = this.expr.length;
      this.entryClosed = true;
      return;
    }

    const entry = this.replay[this.replayIndex]!;
    this.expr = entry;
    this.cursor = entry.length;
    this.entryClosed = false;
    this.refresh();
  }

  // --------------------------------------------------------- test helpers

  /** Feeds a whole expression and returns the display, bypassing the UI. */
  runExpression(input: string): string {
    for (const ch of input) {
      const digit = KEY_INDEX.get(ch);
      if (digit) this.press(digit.id);
    }
    this.press('equals');
    return this.lastAnswerText;
  }

  currentAnswer(): string {
    return this.lastAnswerText;
  }

  clearLists(): void {
    clearAll(this.lists);
    this.statEdit = null;
  }

  addStatValue(id: ListId, value: number): void {
    appendValue(this.lists, id, value);
  }

  asValue(text: string): Value | number | string | boolean | undefined {
    const v = compute(text, this.state);
    if (isComplex(v)) return v;
    if (isFrac(v)) return v;
    return toNumber(v);
  }

  displayLinesFor(value: Value): string[] {
    return displayLines(value, this.displayContext());
  }
}

export function createController(): CalculatorController {
  const controller = new CalculatorController();
  controller.syncMode();
  return controller;
}
