import { useId, useMemo, useState } from 'react';
import { computeImpact, DEFAULT_IMPACT_INPUTS, formatCurrency, IMPACT_INPUTS, type ImpactInputs, type ImpactLine } from '../domain/impact';
import { cx } from './ui';

/**
 * ImpactCalculator — inputs on the left, the formula and annual result on the right.
 * Every line shows its formula with the real numbers, so the panel can check the math live.
 * The model (inputs and lines) lives in domain/impact.ts.
 *
 * @prop initial    Starting values (merged over defaults), e.g. from the current portfolio.
 * @prop onChange   Optional; called with inputs whenever they change.
 */
export interface ImpactCalculatorProps {
  initial?: Partial<ImpactInputs>;
  onChange?: (inputs: ImpactInputs) => void;
}

const fmt = (l: ImpactLine) =>
  l.format === 'currency' ? formatCurrency(l.value, l.value < 1000 ? 2 : 0) : `${l.value.toLocaleString('en-US', { maximumFractionDigits: 1 })}${l.format === 'days' ? ' days' : ''}`;

export function ImpactCalculator({ initial, onChange }: ImpactCalculatorProps) {
  const [inputs, setInputs] = useState<ImpactInputs>({ ...DEFAULT_IMPACT_INPUTS, ...initial });
  const result = useMemo(() => computeImpact(inputs), [inputs]);
  const uid = useId();

  const set = (key: keyof ImpactInputs, v: number) => {
    const next = { ...inputs, [key]: Number.isFinite(v) ? v : 0 };
    setInputs(next);
    onChange?.(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      <section className="card p-4" aria-labelledby={`${uid}-in`}>
        <h2 id={`${uid}-in`} className="mb-3 text-sm text-slate-900 dark:text-white">Inputs</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          {IMPACT_INPUTS.map((def) => (
            <div key={def.key}>
              <label htmlFor={`${uid}-${def.key}`} className="label">{def.label}</label>
              <div className="relative">
                {def.unit === '$' && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm muted">$</span>}
                <input
                  id={`${uid}-${def.key}`} type="number" inputMode="decimal" min={def.min} step={def.step}
                  className={cx('input tabular-nums', def.unit === '$' && 'pl-6', def.unit && def.unit !== '$' && 'pr-14')}
                  value={inputs[def.key]} onChange={(e) => set(def.key, parseFloat(e.target.value))}
                />
                {def.unit && def.unit !== '$' && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs muted">{def.unit}</span>}
              </div>
              {def.help && <p className="mt-0.5 text-[11px] muted">{def.help}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="card flex flex-col" aria-labelledby={`${uid}-out`} aria-live="polite">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 id={`${uid}-out`} className="text-sm text-slate-900 dark:text-white">Annual impact</h2>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">{formatCurrency(result.annualTotal)}</p>
          <p className="mt-0.5 text-sm muted">
            {formatCurrency(result.monthlyTotal)} per month · {formatCurrency(result.perUnitPerYear)} per unit per year
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <caption className="sr-only">How the number is calculated</caption>
            <thead>
              <tr className="text-left text-xs muted">
                <th className="pb-2 pr-3 font-medium">Step</th>
                <th className="pb-2 pr-3 font-medium">Formula</th>
                <th className="pb-2 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 text-slate-900 dark:text-slate-100">{l.label}{l.counts && <span className="ml-1 text-accent" title="Counts toward the total">●</span>}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-600 dark:text-slate-400">{l.formula}</td>
                  <td className="py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{fmt(l)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-600">
                <td className="py-2 pr-3 text-slate-900 dark:text-white">Total per year</td>
                <td className="py-2 pr-3 font-mono text-xs font-normal text-slate-600 dark:text-slate-400">
                  {result.lines.filter((l) => l.counts).map((l) => l.label.toLowerCase()).join(' + ')}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-900 dark:text-white">{formatCurrency(result.annualTotal)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs muted"><span className="text-accent">●</span> counts toward the total. Change the inputs to test assumptions live.</p>
        </div>
      </section>
    </div>
  );
}
