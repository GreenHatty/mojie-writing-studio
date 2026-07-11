import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  calculateCompoundGrowth,
  calculateTravel,
  evaluateExpression,
  probabilityAtLeastOne
} from './calculator';

describe('evaluateExpression', () => {
  it('supports precedence, parentheses and powers without eval', () => {
    expect(evaluateExpression('2 + 3 * (4 - 1) ^ 2')).toBe(29);
  });

  it('rejects invalid tokens and division by zero', () => {
    expect(() => evaluateExpression('process.exit()')).toThrow(/无效/u);
    expect(() => evaluateExpression('10 / 0')).toThrow(/零/u);
  });
});

describe('story calculators', () => {
  it('calculates travel time and supports rest overhead', () => {
    expect(calculateTravel({ distance: 120, speed: 30, restPercent: 25 })).toEqual({
      movingHours: 4,
      totalHours: 5
    });
  });

  it('calculates age at a story date', () => {
    expect(calculateAge('2000-07-12', '2026-07-11')).toBe(25);
    expect(calculateAge('2000-07-11', '2026-07-11')).toBe(26);
  });

  it('calculates compound growth and repeated probability', () => {
    expect(calculateCompoundGrowth(100, 0.1, 2)).toBeCloseTo(121);
    expect(probabilityAtLeastOne(0.01, 100)).toBeCloseTo(0.633967, 5);
  });
});
