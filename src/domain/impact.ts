/**
 * Impact calculator — a pure, editable model. Each input is declared once (label, unit, default),
 * and compute() returns line items with the formula written out so the panel can show its work.
 * To model a different case, change IMPACT_INPUTS and the lines in computeImpact().
 */

export interface ImpactInputDef {
  key: keyof ImpactInputs;
  label: string;
  unit: '$' | '%' | 'days' | 'hours' | 'units' | '';
  step: number;
  min: number;
  help?: string;
}

export interface ImpactInputs {
  units: number;
  /** Share of units that turn over per year, in percent (e.g. 45 = 45%). */
  turnoverPct: number;
  /** Average monthly rent in dollars. */
  avgRent: number;
  /** Vacant days saved per turn (faster make-ready, fewer no-shows, earlier leases …). */
  daysSavedPerTurn: number;
  /** Staff hours saved per week across the portfolio. */
  hoursSavedPerWeek: number;
  /** Loaded hourly cost of that staff time. */
  hourlyCost: number;
}

export const IMPACT_INPUTS: ImpactInputDef[] = [
  { key: 'units', label: 'Units', unit: 'units', step: 1, min: 0 },
  { key: 'turnoverPct', label: 'Annual turnover', unit: '%', step: 1, min: 0, help: 'Share of units that turn each year.' },
  { key: 'avgRent', label: 'Average monthly rent', unit: '$', step: 25, min: 0 },
  { key: 'daysSavedPerTurn', label: 'Vacant days saved per turn', unit: 'days', step: 0.5, min: 0 },
  { key: 'hoursSavedPerWeek', label: 'Staff hours saved per week', unit: 'hours', step: 1, min: 0 },
  { key: 'hourlyCost', label: 'Staff cost per hour', unit: '$', step: 1, min: 0 },
];

export const DEFAULT_IMPACT_INPUTS: ImpactInputs = {
  units: 204,
  turnoverPct: 45,
  avgRent: 1650,
  daysSavedPerTurn: 3,
  hoursSavedPerWeek: 20,
  hourlyCost: 32,
};

export interface ImpactLine {
  id: string;
  label: string;
  /** Formula with the actual numbers substituted, e.g. "204 units × 45%". */
  formula: string;
  value: number;
  format: 'number' | 'currency' | 'days';
  /** Part of the annual total. */
  counts?: boolean;
}

export interface ImpactResult {
  lines: ImpactLine[];
  annualTotal: number;
  perUnitPerYear: number;
  monthlyTotal: number;
}

const n0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function computeImpact(i: ImpactInputs): ImpactResult {
  const turns = i.units * (i.turnoverPct / 100);
  const vacantDays = turns * i.daysSavedPerTurn;
  const dailyRent = (i.avgRent * 12) / 365;
  const revenue = vacantDays * dailyRent;
  const labor = i.hoursSavedPerWeek * 52 * i.hourlyCost;
  const annualTotal = revenue + labor;

  return {
    lines: [
      { id: 'turns', label: 'Turns per year', formula: `${n0(i.units)} units × ${n0(i.turnoverPct)}%`, value: turns, format: 'number' },
      { id: 'vacantDays', label: 'Vacant days recovered', formula: `${n0(turns)} turns × ${n0(i.daysSavedPerTurn)} days`, value: vacantDays, format: 'days' },
      { id: 'dailyRent', label: 'Rent per vacant day', formula: `${usd(i.avgRent)} × 12 ÷ 365`, value: dailyRent, format: 'currency' },
      { id: 'revenue', label: 'Rent recovered', formula: `${n0(vacantDays)} days × ${usd(round2(dailyRent))}`, value: revenue, format: 'currency', counts: true },
      { id: 'labor', label: 'Staff time value', formula: `${n0(i.hoursSavedPerWeek)} hrs × 52 weeks × ${usd(i.hourlyCost)}`, value: labor, format: 'currency', counts: true },
    ],
    annualTotal,
    perUnitPerYear: i.units > 0 ? annualTotal / i.units : 0,
    monthlyTotal: annualTotal / 12,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatCurrency(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits });
}
