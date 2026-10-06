import { useId } from 'react';
import { AUTOMATION_LEVELS } from '../domain/automation';
import type { AutomationLevel } from '../domain/types';
import { cx } from './ui';

/**
 * AutomationLevelControl — three-way radio group for how much the system does on its own.
 * Arrow keys move between levels (native radio behavior).
 *
 * @prop value     Current level (1, 2 or 3).
 * @prop onChange  Called with the new level.
 * @prop preview   Optional counts per level: how many items would apply automatically,
 *                 wait for approval, or land in exceptions — shown live under each option.
 * @prop compact   Single-row segmented version for headers.
 */
export interface AutomationLevelControlProps {
  value: AutomationLevel;
  onChange: (level: AutomationLevel) => void;
  preview?: Record<AutomationLevel, { auto: number; approval: number; exception: number }>;
  compact?: boolean;
}

export function AutomationLevelControl({ value, onChange, preview, compact }: AutomationLevelControlProps) {
  const name = useId();
  if (compact) {
    return (
      <div role="radiogroup" aria-label="Automation level" className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
        {AUTOMATION_LEVELS.map((l) => (
          <label key={l.level} title={l.name} className={cx('cursor-pointer rounded px-2 py-0.5 text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
            value === l.level ? 'bg-accent text-white dark:text-slate-950' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}>
            <input type="radio" className="sr-only" name={name} checked={value === l.level} onChange={() => onChange(l.level)} />
            L{l.level}
          </label>
        ))}
      </div>
    );
  }
  return (
    <fieldset>
      <legend className="sr-only">Automation level</legend>
      <div className="grid gap-3 md:grid-cols-3">
        {AUTOMATION_LEVELS.map((l) => {
          const active = value === l.level;
          const p = preview?.[l.level];
          return (
            <label key={l.level} className={cx('card relative flex cursor-pointer flex-col gap-2 p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
              active ? 'border-accent ring-1 ring-accent' : 'hover:border-slate-300 dark:hover:border-slate-700')}>
              <input type="radio" name={name} className="sr-only" checked={active} onChange={() => onChange(l.level)} />
              <div className="flex items-center gap-2">
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  active ? 'bg-accent text-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>{l.level}</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{l.name}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{l.summary}</p>
              <p className="text-xs muted">{l.detail}</p>
              {p && (
                <dl className="mt-auto grid grid-cols-3 gap-1 border-t border-slate-100 pt-2 text-center dark:border-slate-800">
                  {([['auto', 'Automatic'], ['approval', 'Approval'], ['exception', 'Exceptions']] as const).map(([k, label]) => (
                    <div key={k}>
                      <dd className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{p[k]}</dd>
                      <dt className="text-[11px] muted">{label}</dt>
                    </div>
                  ))}
                </dl>
              )}
              {active && <span className="absolute right-3 top-3 text-xs font-medium text-accent-strong">Current</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
