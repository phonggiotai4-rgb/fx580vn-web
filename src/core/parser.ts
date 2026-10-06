/**
 * Recursive-descent parser producing an AST.
 *
 * Two calculator-specific rules are handled here rather than in the evaluator:
 *
 *   1. Implicit multiplication. `2π`, `3sin(30)`, `(1+2)(3+4)` and `2√(9)` all
 *      mean what they look like, so an operand that follows another operand
 *      without an operator gets an implicit `*`.
 *   2. Postfix binds tighter than any operator, including exponentiation:
 *      `2³²` is (2³)², not 2⁹.
 */

import { err, ok, type Result } from './errors.js';
import type { Token } from './tokenizer.js';

export type Node =
  | { type: 'num'; text: string }
  | { type: 'const'; name: string }
  | { type: 'var'; name: string }
  | { type: 'ans' }
  | { type: 'random' }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'unary'; op: '-' | '+'; operand: Node }
  | { type: 'percent'; operand: Node }
  | { type: 'assign'; target: string; value: Node }
  | { type: 'seq'; items: Node[] };

/**
 * Functions that take their left operand from what came before them, so they
 * bind like an infix operator: `5nPr2`, `200×5%`, `3hypot(4)`.
 */
export const INFIX_FUNCTIONS = new Set([
  'nPr',
  'nCr',
  'gcd',
  'lcm',
  'min',
  'max',
  'hypot',
  'digitAt',
]);

class Parser {
  private pos = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (t.type !== 'eof') this.pos++;
    return t;
  }

  private at(type: Token['type'], text?: string): boolean {
    const t = this.peek();
    return t.type === type && (text === undefined || t.text === text);
  }

  private eat(type: Token['type'], text?: string): Token | null {
    if (this.at(type, text)) return this.next();
    return null;
  }

  parseProgram(): Result<Node> {
    const r = this.parseExpression();
    if (!r.ok) return r;
    if (!this.at('eof')) {
      return err('Syntax Error', `unexpected "${this.peek().text}"`);
    }
    return r;
  }

  /** Handles `=` assignment and comma-separated sequences. */
  private parseExpression(): Result<Node> {
    const first = this.parseAssignment();
    if (!first.ok) return first;
    if (!this.at('comma')) return first;
    const items: Node[] = [first.value];
    while (this.eat('comma')) {
      const next = this.parseAssignment();
      if (!next.ok) return next;
      items.push(next.value);
    }
    return ok({ type: 'seq', items });
  }

  private parseAssignment(): Result<Node> {
    // Look ahead for `var =` so `X=5` assigns rather than comparing.
    const t = this.peek();
    if (t.type === 'var' && this.peek(1).type === 'assign') {
      const target = this.next().text;
      this.next(); // '='
      const value = this.parseAssignment();
      if (!value.ok) return value;
      return ok({ type: 'assign', target, value: value.value });
    }
    return this.parseSum();
  }

  private parseSum(): Result<Node> {
    const first = this.parseProduct();
    if (!first.ok) return first;
    let acc: Node = first.value;
    for (;;) {
      const t = this.peek();
      if (t.type !== 'op' || (t.text !== '+' && t.text !== '-')) break;
      this.next();
      const right = this.parseProduct();
      if (!right.ok) return right;
      acc = { type: 'binary', op: t.text, left: acc, right: right.value };
    }
    return ok(acc);
  }

  private parseProduct(): Result<Node> {
    const first = this.parseUnary();
    if (!first.ok) return first;
    let acc: Node = first.value;
    for (;;) {
      const t = this.peek();
      if (t.type !== 'op' || (t.text !== '*' && t.text !== '/')) break;
      this.next();
      const right = this.parseUnary();
      if (!right.ok) return right;
      acc = { type: 'binary', op: t.text, left: acc, right: right.value };
    }
    return ok(acc);
  }

  private parseUnary(): Result<Node> {
    const t = this.peek();
    if (t.type === 'op' && (t.text === '-' || t.text === '+')) {
      this.next();
      const operand = this.parseUnary();
      if (!operand.ok) return operand;
      return ok({ type: 'unary', op: t.text as '-' | '+', operand: operand.value });
    }
    return this.parsePower();
  }

  private parsePower(): Result<Node> {
    const base = this.parsePostfix();
    if (!base.ok) return base;
    if (this.at('op', '^')) {
      this.next();
      // Right-associative, and the exponent may itself be signed.
      const exponent = this.parseUnary();
      if (!exponent.ok) return exponent;
      return ok({ type: 'binary', op: '^', left: base.value, right: exponent.value });
    }
    return base;
  }

  private parsePostfix(): Result<Node> {
    const first = this.parsePrimary();
    if (!first.ok) return first;
    let acc: Node = first.value;

    for (;;) {
      const t = this.peek();

      if (t.type === 'func' && t.text === 'n!') {
        this.next();
        acc = { type: 'call', name: 'n!', args: [acc] };
        continue;
      }

      // A bare `!` after a value is the factorial postfix.
      if (t.type === 'op' && t.text === '!') {
        this.next();
        acc = { type: 'call', name: 'n!', args: [acc] };
        continue;
      }

      if (t.type === 'op' && t.text === '%') {
        this.next();
        acc = { type: 'percent', operand: acc };
        continue;
      }

      // Infix two-argument functions: `5nPr2`, `(12)gcd(18)`. The right operand
      // is a single primary so `3hypot(4,5)` cannot silently swallow the comma.
      if (t.type === 'func' && INFIX_FUNCTIONS.has(t.text)) {
        this.next();
        const rhs = this.parsePrimary();
        if (!rhs.ok) return rhs;
        acc = { type: 'call', name: t.text, args: [acc, rhs.value] };
        continue;
      }

      // Implicit multiplication: a value directly followed by another operand.
      if (this.startsOperand() && this.implicitMultiplyValid(acc)) {
        const rhs = this.parsePrimary();
        if (!rhs.ok) return rhs;
        acc = { type: 'binary', op: '*', left: acc, right: rhs.value };
        continue;
      }
      break;
    }
    return ok(acc);
  }

  /**
   * `3-2` must not become `3×(-2)`. Implicit multiplication only applies
   * where an operator could genuinely be omitted.
   */
  private implicitMultiplyValid(left: Node): boolean {
    switch (left.type) {
      case 'unary':
        return false;
      case 'binary':
        return left.op !== '-';
      case 'percent':
        return true;
      default:
        return true;
    }
  }

  private startsOperand(): boolean {
    const t = this.peek();
    // `func` counts so `2√9` and `3sin30` read as products. The infix
    // functions are checked earlier, so this only reaches prefix functions.
    return (
      t.type === 'num' ||
      t.type === 'const' ||
      t.type === 'var' ||
      t.type === 'lparen' ||
      t.type === 'func'
    );
  }

  private parsePrimary(): Result<Node> {
    const t = this.next();

    switch (t.type) {
      case 'num': {
        const value = Number(t.text);
        if (!Number.isFinite(value)) return err('Syntax Error', 'bad number');
        return ok({ type: 'num', text: t.text });
      }
      case 'const':
        return ok({ type: 'const', name: t.text });
      case 'var':
        if (t.text === 'Ans') return ok({ type: 'ans' });
        return ok({ type: 'var', name: t.text });
      case 'lparen': {
        const inner = this.parseExpression();
        if (!inner.ok) return inner;
        if (!this.eat('rparen')) return err('Syntax Error', 'missing )');
        return inner;
      }
      case 'func':
        return this.parseFunctionCall(t.text);
      default:
        return err('Syntax Error', `unexpected "${t.text}"`);
    }
  }

  private parseFunctionCall(name: string): Result<Node> {
    if (name === 'Ran' && this.at('func', 'Ran#')) {
      this.next();
      return ok({ type: 'random' });
    }

    // Parenthesised argument list: commas separate arguments, not expressions.
    if (this.eat('lparen')) {
      const args: Node[] = [];
      if (!this.at('rparen')) {
        for (;;) {
          const arg = this.parseAssignment();
          if (!arg.ok) return arg;
          args.push(arg.value);
          if (!this.eat('comma')) break;
        }
      }
      if (!this.eat('rparen')) return err('Syntax Error', 'missing )');
      if (args.length > 2) return err('Arg Error', name);
      return ok({ type: 'call', name, args });
    }

    const args: Node[] = [];
    for (;;) {
      const arg = this.parseArgument();
      if (!arg.ok) return arg;
      args.push(arg.value);
      if (!this.eat('comma')) break;
      // Two-argument functions stop after the second operand.
      if (INFIX_FUNCTIONS.has(name)) break;
    }
    return ok({ type: 'call', name, args });
  }

  /**
   * Argument of a function. Parentheses are optional; without them the
   * argument is a postfix expression so `√9+1` reads as `√(9)+1`.
   */
  private parseArgument(): Result<Node> {
    return this.parsePostfixNoPercent();
  }

  private parsePostfixNoPercent(): Result<Node> {
    const first = this.parsePower();
    if (!first.ok) return first;
    let acc: Node = first.value;
    for (;;) {
      if (this.at('func', 'n!')) {
        this.next();
        acc = { type: 'call', name: 'n!', args: [acc] };
        continue;
      }
      if (this.at('op', '!')) {
        this.next();
        acc = { type: 'call', name: 'n!', args: [acc] };
        continue;
      }
      if (this.at('func') && INFIX_FUNCTIONS.has(this.peek().text)) {
        this.next();
        const rhs = this.parsePrimary();
        if (!rhs.ok) return rhs;
        acc = { type: 'call', name: this.tokens[this.pos - 1]!.text, args: [acc, rhs.value] };
        continue;
      }
      break;
    }
    return ok(acc);
  }
}

export function parse(tokens: readonly Token[]): Result<Node> {
  return new Parser(tokens).parseProgram();
}
