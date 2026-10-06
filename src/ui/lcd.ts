/**
 * Dot-matrix LCD renderer.
 *
 * Draws the 12-character, 2-row segment display onto a canvas. Each glyph is
 * described by a bitmap that matches the real unit's stroke shapes, which is
 * what makes the result look like an LCD rather than a web font.
 */

export interface LcdCell {
  /** Text to draw. */
  readonly text: string;
  /** Column where this cell starts on the LCD. */
  readonly column: number;
}

/** Bitmap definitions, one string per row of pixels, `1` = lit. */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '01100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '^': ['00100', '01110', '10101', '00100', '00100', '00100', '00000'],
  '×': ['00000', '10001', '01010', '00100', '01010', '10001', '00000'],
  '÷': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '▐': ['11111', '10001', '10001', '10001', '10001', '10001', '11111'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '▸': ['01000', '01100', '01110', '01111', '01110', '01100', '01000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
};

export interface GlyphOverrides {
  /** Characters that need a drawn shape but have no bitmap. */
  readonly custom?: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void>;
}

/** Fallback shapes for letters and symbols that have no 5x7 bitmap. */
const VECTOR_GLYPHS: Record<
  string,
  (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void
> = {
  A: (c, x, y, s) =>
    glyphPolygon(c, x, y, s, [[1, 6], [3, 0], [3, 12], [1, 6]], [[1, 6], [3, 6]]),
  B: (c, x, y, s) => {
    c.fillRect(x, y, s, s * 2);
    c.clearRect(x + s * 0.8, y + s * 0.5, s * 0.6, s * 1);
    c.clearRect(x + s * 0.8, y + s * 1.4, s * 0.6, s * 0.5);
  },
  C: (c, x, y, s) => glyphArc(c, x, y, s),
  D: (c, x, y, s) => {
    c.fillRect(x, y, s, s * 2);
    c.clearRect(x + s, y + s * 0.4, s * 0.8, s * 1.2);
  },
  E: (c, x, y, s) => {
    c.fillRect(x, y, s, s * 2);
    c.clearRect(x + s, y + s * 0.5, s, s * 1);
  },
  F: (c, x, y, s) => {
    c.fillRect(x, y, s, s);
    c.fillRect(x, y, s * 0.8, s * 2);
  },
  G: (c, x, y, s) => {
    c.fillRect(x, y, s, s * 2);
    c.clearRect(x + s, y + s * 0.5, s, s * 0.9);
    c.fillRect(x + s * 1.2, y + s * 0.5, s * 0.8, s * 0.5);
  },
  H: (c, x, y, s) => {
    c.fillRect(x, y, s, s * 2);
    c.fillRect(x + s * 1.6, y, s, s * 2);
    c.clearRect(x + s, y + s * 0.8, s * 0.6, s * 0.5);
  },
  I: (c, x, y, s) => c.fillRect(x + s * 0.5, y, s * 0.6, s * 2),
  J: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.7, s * 1.3);
    c.fillRect(x, y + s * 1.3, s * 1.6, s * 0.7);
  },
  K: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.7, s * 2);
    c.fillRect(x + s * 0.7, y, s * 0.7, s * 0.8);
    c.fillRect(x + s * 0.7, y + s * 1.2, s * 0.7, s * 0.8);
  },
  L: (c, x, y, s) => c.fillRect(x, y, s * 0.7, s * 2),
  M: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.6, s * 2);
    c.fillRect(x + s * 1.4, y, s * 0.6, s * 2);
    c.fillRect(x + s * 0.6, y, s * 0.3, s * 0.9);
    c.fillRect(x + s * 1.1, y, s * 0.3, s * 0.9);
  },
  N: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.6, s * 2);
    c.fillRect(x + s * 1.4, y, s * 0.6, s * 2);
    c.fillRect(x + s * 0.6, y, s * 0.35, s);
    c.fillRect(x + s * 1.05, y + s, s * 0.35, s);
  },
  O: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.6, s * 2);
    c.fillRect(x + s * 1.4, y, s * 0.6, s * 2);
    c.fillRect(x + s * 0.6, y, s * 0.8, s * 0.5);
    c.fillRect(x + s * 0.6, y + s * 1.5, s * 0.8, s * 0.5);
  },
  P: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.7, s * 2);
    c.fillRect(x + s * 0.7, y, s * 1.3, s * 0.5);
    c.fillRect(x + s * 0.7, y + s, s * 1.3, s * 0.5);
  },
  Q: (c, x, y, s) => {
    VECTOR_GLYPHS.O?.(c, x, y, s);
    c.fillRect(x + s, y + s * 1.1, s * 0.5, s * 0.5);
  },
  R: (c, x, y, s) => {
    VECTOR_GLYPHS.P?.(c, x, y, s);
    c.fillRect(x + s * 0.7, y + s, s * 0.5, s);
  },
  S: (c, x, y, s) => {
    c.fillRect(x + s * 0.6, y, s * 1.4, s * 0.5);
    c.fillRect(x, y + s * 0.5, s * 0.6, s * 0.6);
    c.fillRect(x + s * 0.6, y + s * 1.1, s * 1.4, s * 0.5);
    c.fillRect(x + s * 1.4, y + s * 1.6, s * 0.6, s * 0.4);
    c.fillRect(x, y + s * 1.5, s * 0.6, s * 0.5);
  },
  T: (c, x, y, s) => {
    c.fillRect(x, y, s * 2, s * 0.5);
    c.fillRect(x + s * 0.7, y, s * 0.6, s * 2);
  },
  U: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.6, s * 2);
    c.fillRect(x + s * 1.4, y, s * 0.6, s * 2);
    c.fillRect(x + s * 0.6, y + s * 1.5, s * 0.8, s * 0.5);
  },
  V: (c, x, y, s) => {
    c.fillRect(x + s * 0.2, y, s * 0.4, s);
    c.fillRect(x + s * 1.4, y, s * 0.4, s);
    c.fillRect(x + s * 0.6, y + s, s * 0.8, s * 0.5);
  },
  W: (c, x, y, s) => {
    c.fillRect(x, y, s * 0.4, s * 2);
    c.fillRect(x + s * 1.6, y, s * 0.4, s * 2);
    c.fillRect(x + s * 0.4, y, s * 0.4, s * 0.9);
    c.fillRect(x + s * 1.2, y, s * 0.4, s * 0.9);
    c.fillRect(x + s * 0.8, y + s * 0.9, s * 0.4, s * 0.5);
  },
  X: (c, x, y, s) => {
    c.fillRect(x + s * 0.2, y, s * 0.4, s);
    c.fillRect(x + s * 1.4, y, s * 0.4, s);
    c.fillRect(x + s * 0.6, y + s, s * 0.8, s * 0.4);
    c.fillRect(x + s * 0.8, y + s * 1.4, s * 0.4, s * 0.6);
  },
  Y: (c, x, y, s) => {
    c.fillRect(x + s * 0.2, y, s * 0.4, s * 0.9);
    c.fillRect(x + s * 1.4, y, s * 0.4, s * 0.9);
    c.fillRect(x + s * 0.7, y + s * 0.9, s * 0.6, s * 1.1);
  },
  Z: (c, x, y, s) => {
    c.fillRect(x, y, s * 2, s * 0.5);
    c.fillRect(x + s * 1.4, y + s * 0.5, s * 0.5, s);
    c.fillRect(x + s * 0.2, y + s * 1.5, s * 1.8, s * 0.5);
  },
};

/** Draws the outline and knocks out horizontal slots to form letter counters. */
function glyphPolygon(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  outline: readonly (readonly [number, number])[],
  holes: readonly (readonly [number, number])[],
): void {
  const scale = s / 2;
  const toX = ([px]: readonly [number, number]) => x + (px - 1) * scale;
  const toY = ([, py]: readonly [number, number]) => y + (py - 6) * scale;

  c.save();
  c.beginPath();
  const first = outline[0];
  if (first) c.moveTo(toX(first), toY(first));
  for (const point of outline.slice(1)) c.lineTo(toX(point), toY(point));
  c.closePath();
  c.fill();
  for (const hole of holes) {
    c.beginPath();
    c.rect(toX(hole) + s * 0.35, toY(hole) + s * 0.35, s * 1.3, s * 0.3);
    c.fill();
  }
  c.restore();
}

function glyphArc(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.save();
  c.lineWidth = s * 0.6;
  c.strokeStyle = c.fillStyle as string;
  c.beginPath();
  c.arc(x + s, y + s, s * 0.85, Math.PI * 0.35, Math.PI * 1.65);
  c.stroke();
  c.restore();
}

export interface LcdOptions {
  /** Lit pixel colour. */
  readonly onColor?: string;
  /** Unlit pixel colour; keep it close to `onColor` for an LCD feel. */
  readonly offColor?: string;
  /** Device pixel ratio multiplier. */
  readonly pixelRatio?: number;
}

const DEFAULT_OPTIONS: Required<LcdOptions> = {
  onColor: '#1a2b1f',
  offColor: '#d7e4d3',
  pixelRatio: 2,
};

export const LCD_COLUMNS = 12;
export const LCD_ROWS = 2;
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPH_GAP = 1;
const LINE_GAP = 2;

/** Width in device pixels needed for one line of `columns` characters. */
export function lcdLineWidth(columns = LCD_COLUMNS, pixelRatio = DEFAULT_OPTIONS.pixelRatio): number {
  return (columns * (GLYPH_WIDTH + GLYPH_GAP) - GLYPH_GAP) * pixelRatio;
}

export function lcdLineHeight(pixelRatio = DEFAULT_OPTIONS.pixelRatio): number {
  return (GLYPH_HEIGHT + LINE_GAP) * pixelRatio;
}

export function lcdHeight(pixelRatio = DEFAULT_OPTIONS.pixelRatio): number {
  return lcdLineHeight(pixelRatio) * LCD_ROWS;
}

/** Number of characters that fit on one row of the display. */
export function fitToWidth(text: string, columns = LCD_COLUMNS): string {
  const chars = [...text];
  return chars.length <= columns ? text : chars.slice(chars.length - columns).join('');
}

/**
 * Renders the whole two-row display.
 *
 * Rows are right-aligned like the real unit, so a long answer lines up under
 * the right edge instead of shifting as it grows.
 */
export function drawDisplay(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  options: LcdOptions = {},
): void {
  const { onColor, offColor, pixelRatio } = { ...DEFAULT_OPTIONS, ...options };
  const dot = pixelRatio;
  const cell = (GLYPH_WIDTH + GLYPH_GAP) * dot;
  const lineHeight = (GLYPH_HEIGHT + LINE_GAP) * dot;
  const totalWidth = lcdLineWidth(LCD_COLUMNS, dot);
  const totalHeight = lcdHeight(dot);

  ctx.fillStyle = offColor;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  for (let row = 0; row < LCD_ROWS; row++) {
    const raw = rows[row] ?? '';
    const text = fitToWidth(raw);
    const width = [...text].length * cell - GLYPH_GAP * dot;
    const startX = totalWidth - width;
    const y = row * lineHeight;

    let index = 0;
    for (const ch of text) {
      drawGlyph(ctx, ch, startX + index * cell, y, dot, onColor, offColor);
      index++;
    }
  }
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  dot: number,
  onColor: string,
  offColor: string,
): void {
  const bitmap = GLYPHS[ch];
  if (bitmap) {
    for (let row = 0; row < bitmap.length; row++) {
      for (let col = 0; col < bitmap[row]!.length; col++) {
        ctx.fillStyle = bitmap[row]![col] === '1' ? onColor : offColor;
        ctx.fillRect(x + col * dot, y + row * dot, dot, dot);
      }
    }
    return;
  }

  // Vectors: draw the lit shape only, over a cleared cell.
  const s = dot * 5;
  const cellHeight = dot * 7;
  ctx.clearRect(x, y, s, cellHeight);
  const vector = VECTOR_GLYPHS[ch.toUpperCase()];
  if (vector) {
    ctx.save();
    ctx.fillStyle = onColor;
    vector(ctx, x, y + cellHeight / 2 - s, s);
    ctx.restore();
    return;
  }
  // Unknown glyph: mark it so a missing shape is obvious rather than blank.
  ctx.fillStyle = onColor;
  ctx.fillRect(x + dot, y + dot, s - 2 * dot, cellHeight - 2 * dot);
}
