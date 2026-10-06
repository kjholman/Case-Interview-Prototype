import { useState } from 'react';
import type { Alert } from '../domain/types';
import { Icon } from './Icon';
import { SEVERITY, StatusPill } from './StatusPill';
import { cx } from './ui';

/**
 * ExceptionCard — one item that needs a person: what happened, why it matters, what to do,
 * and one-click actions.
 *
 * @prop alert          The alert (title, reason, impact, suggestedAction, severity, fix?).
 * @prop ownerName      Who owns it, if assigned.
 * @prop staffOptions   People it can be reassigned to.
 * @prop onApprove      Approve the suggested action (applies the fix if there is one).
 * @prop onSnooze       Snooze for N days.
 * @prop onReassign     Reassign to a staff id.
 * @prop onOpen         Optional "View record" link.
 * @prop snoozedUntil   Shows a snoozed note instead of actions.
 */
export interface ExceptionCardProps {
  alert: Alert;
  ownerName?: string;
  staffOptions: { value: string; label: string }[];
  onApprove: () => void;
  onSnooze: (days: number) => void;
  onReassign: (staffId: string) => void;
  onOpen?: () => void;
  snoozedUntil?: string;
}

export function ExceptionCard({ alert, ownerName, staffOptions, onApprove, onSnooze, onReassign, onOpen, snoozedUntil }: ExceptionCardProps) {
  const [mode, setMode] = useState<'idle' | 'snooze' | 'reassign'>('idle');
  const sev = SEVERITY[alert.severity];
  return (
    <article className={cx('card overflow-hidden', alert.severity === 'critical' && 'border-red-300 dark:border-red-900')}>
      <div className="flex gap-3 p-4">
        <div className={cx('w-1 shrink-0 rounded-full', { critical: 'bg-red-700', high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-slate-300 dark:bg-slate-600' }[alert.severity])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={sev.tone} label={sev.label} />
            <span className="text-xs muted">{alert.ruleLabel}</span>
            {ownerName && <span className="inline-flex items-center gap-1 text-xs muted"><Icon name="user" className="h-3 w-3" />{ownerName}</span>}
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">{alert.title}</h3>
          <dl className="mt-2 grid gap-1.5 text-sm sm:grid-cols-[88px_1fr]">
            <dt className="text-xs font-medium muted sm:pt-0.5">Why</dt>
            <dd className="text-slate-700 dark:text-slate-300">{alert.reason}</dd>
            <dt className="text-xs font-medium muted sm:pt-0.5">Impact</dt>
            <dd className="text-slate-700 dark:text-slate-300">{alert.impact}</dd>
            <dt className="text-xs font-medium muted sm:pt-0.5">Suggested</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">{alert.fix?.label ?? alert.suggestedAction}</dd>
          </dl>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
        {snoozedUntil ? (
          <span className="text-xs muted">Snoozed until {snoozedUntil}</span>
        ) : mode === 'snooze' ? (
          <>
            <span className="text-xs muted">Snooze for</span>
            {[1, 3, 7].map((d) => <button key={d} type="button" className="btn-secondary btn-sm" onClick={() => { onSnooze(d); setMode('idle'); }}>{d === 7 ? '1 week' : `${d} day${d > 1 ? 's' : ''}`}</button>)}
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode('idle')}>Cancel</button>
          </>
        ) : mode === 'reassign' ? (
          <>
            <label className="text-xs muted" htmlFor={`re-${alert.id}`}>Reassign to</label>
            <select id={`re-${alert.id}`} className="input w-auto py-1 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) { onReassign(e.target.value); setMode('idle'); } }}>
              <option value="" disabled>Choose a person…</option>
              {staffOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode('idle')}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary btn-sm" onClick={onApprove}>
              <Icon name="check" className="h-3.5 w-3.5" />{alert.fix ? 'Approve' : 'Mark handled'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setMode('snooze')}><Icon name="clock" className="h-3.5 w-3.5" />Snooze</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setMode('reassign')}><Icon name="user" className="h-3.5 w-3.5" />Reassign</button>
            {onOpen && <button type="button" className="btn-ghost btn-sm ml-auto" onClick={onOpen}>View {alert.record.collection === 'units' ? 'unit' : alert.record.collection === 'tasks' ? 'work' : 'record'}<Icon name="chevronRight" className="h-3.5 w-3.5" /></button>}
          </>
        )}
      </div>
    </article>
  );
}
