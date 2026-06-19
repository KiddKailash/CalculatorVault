import { evaluateExpression, tokenizeExpression } from '../app/_vault/_calculator';

describe('tokenizeExpression', () => {
  it('tokenizes simple number', () => {
    expect(tokenizeExpression('42')).toEqual([{ type: 'number', value: '42' }]);
  });

  it('tokenizes decimal', () => {
    expect(tokenizeExpression('3.14')).toEqual([{ type: 'number', value: '3.14' }]);
  });

  it('tokenizes simple expression', () => {
    expect(tokenizeExpression('1+2')).toEqual([
      { type: 'number', value: '1' },
      { type: 'operator', value: '+' },
      { type: 'number', value: '2' },
    ]);
  });

  it('treats leading minus as part of number', () => {
    expect(tokenizeExpression('-5')).toEqual([{ type: 'number', value: '-5' }]);
  });

  it('treats minus after operator as part of number', () => {
    expect(tokenizeExpression('3×-5')).toEqual([
      { type: 'number', value: '3' },
      { type: 'operator', value: '×' },
      { type: 'number', value: '-5' },
    ]);
  });

  it('ignores unknown characters', () => {
    expect(tokenizeExpression('1+abc2')).toEqual([
      { type: 'number', value: '1' },
      { type: 'operator', value: '+' },
      { type: 'number', value: '2' },
    ]);
  });

  it('returns empty for empty', () => {
    expect(tokenizeExpression('')).toEqual([]);
  });
});

describe('evaluateExpression', () => {
  it('returns 0 for empty', () => {
    expect(evaluateExpression('')).toBe(0);
    expect(evaluateExpression('0')).toBe(0);
  });

  it('evaluates addition', () => {
    expect(evaluateExpression('1+2')).toBe(3);
  });

  it('evaluates subtraction', () => {
    expect(evaluateExpression('10-3')).toBe(7);
  });

  it('evaluates multiplication', () => {
    expect(evaluateExpression('4×5')).toBe(20);
  });

  it('evaluates division', () => {
    expect(evaluateExpression('20÷4')).toBe(5);
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2+3×4')).toBe(14);
    expect(evaluateExpression('2×3+4')).toBe(10);
  });

  it('left-to-right for same precedence', () => {
    expect(evaluateExpression('10-3-2')).toBe(5);
    expect(evaluateExpression('20÷5÷2')).toBe(2);
  });

  it('handles decimals', () => {
    expect(evaluateExpression('0.1+0.2')).toBeCloseTo(0.3);
  });

  it('handles negative numbers', () => {
    expect(evaluateExpression('-5+10')).toBe(5);
    expect(evaluateExpression('3×-2')).toBe(-6);
  });

  it('returns NaN on division by zero', () => {
    expect(Number.isNaN(evaluateExpression('5÷0'))).toBe(true);
  });

  it('matches password-style equations exactly (string-stable)', () => {
    expect(evaluateExpression('1+2×3')).toBe(7);
    expect(evaluateExpression('1+2+3')).toBe(6);
  });
});
