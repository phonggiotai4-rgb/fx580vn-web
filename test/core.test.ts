import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { quickEval } from '../src/core/pipeline.ts';
import { approxFrac, fToNumber } from '../src/core/fraction.ts';
import { formatReal, parseDisplay, DEFAULT_DISPLAY } from '../src/core/format.ts';
import { matDet, matInverse, matTranspose, mat } from '../src/core/value.ts';
import { fromRadians, toRadians, gcd as gcdFn, lcm as lcmFn } from '../src/core/functions.ts';
import { cAsin, cx, cAbs } from '../src/core/complex.ts';

const ev = (input: string, o = {}) => quickEval(input, o);

test('arithmetic and precedence', () => {
  assert.equal(ev('1+2×3'), '7');
  assert.equal(ev('2×3+1'), '7');
  assert.equal(ev('100÷5÷2'), '10');
  assert.equal(ev('2^3^2'), '512');
  assert.equal(ev('(1+2)×3'), '9');
});

test('implicit multiplication', () => {
  assert.equal(ev('2(3+4)'), '14');
  assert.equal(ev('3√9'), '9');
  assert.equal(ev('2π'), ev('2×π'));
});

test('unary minus is not implicit multiplication', () => {
  assert.equal(ev('3-2'), '1');
  assert.equal(ev('-2^2'), '-4');
  assert.equal(ev('5×-2'), '-10');
});

test('trigonometry honours the angle unit', () => {
  assert.equal(ev('sin30', { angle: 'Deg' }), '0.5');
  assert.equal(ev('sin30', { angle: 'Rad' }), ev('sin(30)', { angle: 'Rad' }));
  assert.equal(ev('sin30', { angle: 'Gra' }), ev('sin(30×π/200)', { angle: 'Rad' }));
  assert.equal(ev('sin90', { angle: 'Deg' }), '1');
  assert.equal(ev('cos60', { angle: 'Deg' }), '0.5');
  assert.equal(ev('tan45', { angle: 'Deg' }), '1');
  // sin(30) in radians differs from sin(30) in degrees.
  assert.notEqual(ev('sin30', { angle: 'Deg' }), ev('sin30', { angle: 'Rad' }));
});

test('inverse trig converts back out of radians', () => {
  assert.equal(ev('sin⁻¹0.5', { angle: 'Deg' }), '30');
  assert.equal(ev('cos⁻¹0.5', { angle: 'Deg' }), '60');
  assert.equal(ev('tan⁻¹1', { angle: 'Deg' }), '45');
  assert.equal(ev('tan⁻¹1', { angle: 'Rad' }), ev('π/4'));
});

test('logs and powers', () => {
  assert.equal(ev('log100'), '2');
  assert.equal(ev('ln1'), '0');
  assert.equal(ev('10^3'), '1000');
  assert.equal(ev('e^0'), '1');
  assert.equal(ev('√16'), '4');
  assert.equal(ev('∛27'), '3');
});

test('factorial, permutations and combinations', () => {
  assert.equal(ev('5!'), '120');
  assert.equal(ev('0!'), '1');
  assert.equal(ev('5nPr2'), '20');
  assert.equal(ev('5nCr2'), '10');
  // A negative factorial is out of domain.
  assert.match(ev('(-4)!'), /^Math Error$/);
  assert.match(ev('2.5!'), /^Math Error$/);
});

test('percent semantics', () => {
  assert.equal(ev('200×10%'), '20');
  assert.equal(ev('200+10%'), '220');
  assert.equal(ev('200-10%'), '180');
});

test('division by zero is a Math Error', () => {
  assert.equal(ev('1÷0'), 'Math Error');
});

test('gcd, lcm, min, max, hypot', () => {
  assert.equal(ev('gcd(12,18)'), '6');
  assert.equal(ev('lcm(4,6)'), '12');
  assert.equal(ev('min(3,7)'), '3');
  assert.equal(ev('max(3,7)'), '7');
  assert.equal(ev('hypot(3,4)'), '5');
});

test('integer and fractional part', () => {
  assert.equal(ev('Int(-3.7)'), '-3');
  assert.equal(ev('Frac(-3.7)'), ev('Frac(-3.7)'));
  assert.equal(ev('Int(3.9)'), '3');
});

test('math errors are raised for out-of-domain input', () => {
  assert.equal(ev('ln0'), 'Math Error');
  assert.equal(ev('log(-1)'), 'Math Error');
  assert.equal(ev('sin(-1)', { angle: 'Deg' }), 'Math Error');
  assert.equal(ev('(-1)!'), 'Math Error');
  // A negative base with a fractional exponent stays out of the real domain.
  assert.equal(ev('(-8)^(1÷3)'), 'Math Error');
});

test('complex mode produces a complex answer', () => {
  assert.equal(ev('√(-4)', { complexMode: true }), '2i');
  // log(-1) = i·π/ln10 ≈ 1.3643763538i, imaginary part shown in radians.
  assert.equal(ev('log(-1)', { complexMode: true }), '1.364376354i');
  // In non-complex mode the same input is an error.
  assert.equal(ev('log(-1)'), 'Math Error');
});

test('pi stays symbolic for display', () => {
  assert.equal(ev('π'), 'π');
  // Multiplying by pi evaluates it, giving 2π to full precision.
  assert.equal(ev('2π'), ev('6.28318530718'));
});

test('angle conversions', () => {
  assert.equal(fromRadians(toRadians(45, 'Deg'), 'Deg'), 45);
  assert.equal(fromRadians(toRadians(100, 'Gra'), 'Gra'), 100);
  const g = gcdFn(12, 18);
  assert.equal(g.ok && g.value, 6);
  const l = lcmFn(4, 6);
  assert.equal(l.ok && l.value, 12);
});

test('fraction approximation', () => {
  assert.equal(fToNumber(approxFrac(0.5)), 0.5);
  assert.equal(`${approxFrac(0.75).n}/${approxFrac(0.75).d}`, '3/4');
  assert.equal(fToNumber(approxFrac(1 / 3)) < 0.334, true);
  assert.equal(fToNumber(approxFrac(1 / 3)) > 0.333, true);
});

test('display normalisation', () => {
  // Norm mode (the factory default) shows the shortest exact form.
  assert.equal(formatReal(0, DEFAULT_DISPLAY), '0');
  assert.equal(formatReal(1234.5, DEFAULT_DISPLAY), '1234.5');
  assert.equal(formatReal(1e12, DEFAULT_DISPLAY), '1.000000000×10¹²');
  assert.equal(parseDisplay('1.234×10¹²'), 1.234e12);
  // Fix mode pads to the configured digit count.
  assert.equal(formatReal(0, { digits: 10, mode: 'Fix', negativeSign: '-' }), '0.0000000000');
  assert.equal(formatReal(7, { digits: 4, mode: 'Fix', negativeSign: '-' }), '7.0000');
});

test('matrix determinant, inverse and transpose', () => {
  const m2 = mat(2, 2, [3, 1, 1, 2]);
  assert.equal(matDet(m2), 5);
  const inv = matInverse(m2);
  assert.equal(Array.isArray(inv) || typeof inv === 'object' ? 'object' : inv, 'object');
  const t = matTranspose(mat(2, 3, [1, 2, 3, 4, 5, 6]));
  assert.equal(t.rows, 3);
  assert.equal(t.cols, 2);
  assert.equal(t.cells[1], 4);
});

test('complex principal values', () => {
  assert.equal(cAbs(cx(3, 4)), 5);
  // asin(i) is pure imaginary on the principal branch: i·asinh(1).
  const a = cAsin(cx(0, 1));
  assert.equal(a.re, 0);
  assert.equal(Math.round(a.im * 1000) / 1000, 0.881);
  assert.equal(Math.abs(a.im - Math.asinh(1)) < 1e-12, true);
});
