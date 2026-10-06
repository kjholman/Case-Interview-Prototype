import { describe, expect, it } from 'vitest';
import { computeImpact, DEFAULT_IMPACT_INPUTS } from '../src/domain/impact';

describe('computeImpact', () => {
  it('computes each line and the annual total', () => {
    const r = computeImpact({ units: 200, turnoverPct: 50, avgRent: 1825, daysSavedPerTurn: 2, hoursSavedPerWeek: 10, hourlyCost: 30 });
    const line = (id: string) => r.lines.find((l) => l.id === id)!.value;
    expect(line('turns')).toBe(100);
    expect(line('vacantDays')).toBe(200);
    expect(line('dailyRent')).toBeCloseTo(60, 5); // 1825 × 12 ÷ 365
    expect(line('revenue')).toBeCloseTo(12_000, 5);
    expect(line('labor')).toBe(15_600); // 10 × 52 × 30
    expect(r.annualTotal).toBeCloseTo(27_600, 5);
    expect(r.monthlyTotal).toBeCloseTo(2_300, 5);
    expect(r.perUnitPerYear).toBeCloseTo(138, 5);
  });

  it('only counts flagged lines toward the total', () => {
    const r = computeImpact(DEFAULT_IMPACT_INPUTS);
    const counted = r.lines.filter((l) => l.counts).reduce((s, l) => s + l.value, 0);
    expect(r.annualTotal).toBeCloseTo(counted, 6);
  });

  it('shows the formula with the actual inputs', () => {
    const r = computeImpact({ ...DEFAULT_IMPACT_INPUTS, units: 204, turnoverPct: 45 });
    expect(r.lines[0].formula).toBe('204 units × 45%');
  });

  it('handles zero units without dividing by zero', () => {
    const r = computeImpact({ ...DEFAULT_IMPACT_INPUTS, units: 0, hoursSavedPerWeek: 0 });
    expect(r.annualTotal).toBe(0);
    expect(r.perUnitPerYear).toBe(0);
  });
});
