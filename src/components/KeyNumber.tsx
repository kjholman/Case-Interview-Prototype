import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { cx } from './ui';

/**
 * KeyNumber — one headline metric.
 *
 * @prop label  What the number is ("Units ready").
 * @prop value  The number, already formatted ("94.1%", "12").
 * @prop hint   Short context under the value ("3 need approval").
 * @prop tone   'default' | 'good' | 'warn' | 'bad' — colors the hint, not the number.
 * @prop icon   Optional icon name.
 * @prop to     Optional route; the whole tile becomes a link.
 */
export interface KeyNumberProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  icon?: IconName;
  to?: string;
}

const HINT = {
  default: 'text-slate-500 dark:text-slate-400',
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-700 dark:text-red-400',
};

export function KeyNumber({ label, value, hint, tone = 'default', icon, to }: KeyNumberProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
        {icon && <Icon name={icon} className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</div>
      {hint && <div className={cx('mt-0.5 text-xs', HINT[tone])}>{hint}</div>}
    </>
  );
  const cls = 'card block p-3.5';
  return to ? (
    <Link to={to} className={cx(cls, 'transition-colors hover:border-accent/60')}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
