/**
 * DOM shell: builds the calculator body, wires the keyboard, and paints the
 * LCD from the controller. All state lives in the controller; this file only
 * translates between DOM events and `press()`.
 */

import './style.css';
import { CalculatorController } from './ui/controller.js';
import { KEY_ROWS, PHYSICAL_EXTRA, PHYSICAL_MAP, type KeySpec } from './ui/layout.js';
import {
  LCD_COLUMNS,
  drawDisplay,
  lcdHeight,
  lcdLineWidth,
} from './ui/lcd.js';

const PIXEL_RATIO = 3;
const ON_COLOR = '#1b2a1e';
const OFF_COLOR = '#cfe0cb';

function buildShell(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'calc';

  const body = document.createElement('div');
  body.className = 'calc-body';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = '<span class="brand-model">fx-580VN X</span><span class="brand-sub">web</span>';
  body.appendChild(brand);

  const screen = document.createElement('div');
  screen.className = 'screen';
  const canvas = document.createElement('canvas');
  canvas.className = 'lcd';
  canvas.width = lcdLineWidth(LCD_COLUMNS, PIXEL_RATIO);
  canvas.height = lcdHeight(PIXEL_RATIO);
  screen.appendChild(canvas);
  body.appendChild(screen);

  const keypad = document.createElement('div');
  keypad.className = 'keypad';
  body.appendChild(keypad);

  root.appendChild(body);
  root.appendChild(buildHints());
  return root;
}

function buildHints(): HTMLElement {
  const hints = document.createElement('div');
  hints.className = 'hints';
  hints.innerHTML = [
    '<p><b>Phím vật lý:</b> số và toán tử gõ trực tiếp, <kbd>Enter</kbd> = <kbd>=</kbd>, <kbd>Backspace</kbd> = <kbd>DEL</kbd>, <kbd>Esc</kbd> = <kbd>AC</kbd>.</p>',
    '<p><b>Shift / Alpha:</b> dùng phím <kbd>Shift</kbd> và <kbd>Alt</kbd> hoặc bấm nút <kbd>SHIFT</kbd> / <kbd>ALPHA</kbd> trên bàn phím ảo.</p>',
    '<p><b>Mũ:</b> <kbd>^</kbd> hoặc phím <kbd>x²</kbd>. Phép nhân và chia có thể bỏ dấu: <code>2π</code>, <code>2(3+4)</code>, <code>3√9</code>.</p>',
  ].join('');
  return hints;
}

function buildKey(spec: KeySpec, onPress: (id: string) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `key key-${spec.role}`;
  if (spec.width && spec.width !== 'normal') button.classList.add(`key-${spec.width}`);
  button.dataset.key = spec.id;

  if (spec.above) {
    const above = document.createElement('span');
    above.className = 'key-above';
    above.textContent = spec.above;
    button.appendChild(above);
  }
  if (spec.alphaAbove) {
    const alpha = document.createElement('span');
    alpha.className = 'key-alpha';
    alpha.textContent = spec.alphaAbove;
    button.appendChild(alpha);
  }

  const label = document.createElement('span');
  label.className = 'key-label';
  label.textContent = spec.label;
  button.appendChild(label);

  // Pointer events keep the calculator usable on touch screens.
  button.addEventListener('click', () => onPress(spec.id));
  return button;
}

function main(): void {
  const controller = new CalculatorController();
  const root = buildShell();
  document.body.appendChild(root);

  const canvas = root.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing LCD canvas');
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('canvas 2d context unavailable');
  // Bound to a const so the null check above narrows for every closure below.
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const keypad = root.querySelector('.keypad');
  const press = (id: string): void => {
    controller.press(id);
    paint();
  };

  if (keypad) {
    for (const row of KEY_ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'key-row';
      for (const spec of row) rowEl.appendChild(buildKey(spec, press));
      keypad.appendChild(rowEl);
    }
  }

  function paint(): void {
    drawDisplay(ctx, controller.displayRows(), {
      onColor: ON_COLOR,
      offColor: OFF_COLOR,
      pixelRatio: PIXEL_RATIO,
    });
    const v = controller.view();
    root.dataset.mode = v.mode;
    root.dataset.shift = String(v.shift);
    root.dataset.alpha = String(v.alpha);
  }

  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey) return;

    if (event.key === 'Shift') {
      event.preventDefault();
      press('shift');
      return;
    }
    if (event.altKey) {
      event.preventDefault();
      press('alpha');
      return;
    }

    const direct = PHYSICAL_EXTRA.get(event.key.toLowerCase());
    if (direct) {
      event.preventDefault();
      press(direct);
      return;
    }
    const mapped = PHYSICAL_MAP.get(event.key.toLowerCase());
    if (mapped) {
      event.preventDefault();
      press(mapped);
      return;
    }
    // Multi-character labels (sin, log, EXP...) map by first character.
    for (const [label, id] of PHYSICAL_MAP) {
      if (label.length > 1 && event.key.toLowerCase().startsWith(label)) {
        event.preventDefault();
        press(id);
        return;
      }
    }
  });

  paint();
}

main();
