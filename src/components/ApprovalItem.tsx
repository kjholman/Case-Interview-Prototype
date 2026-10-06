import { useState } from 'react';
import type { Alert, FieldChange, FieldValue, Fix } from '../domain/types';
import { Icon } from './Icon';
import { SEVERITY, StatusPill } from './StatusPill';

/**
 * ApprovalItem — a change the system wants to make, shown as before → after,
 * with Accept, Edit (change the proposed values, then accept) and Reject (with an optional reason).
 *
 * @prop alert        The alert whose `fix` is being proposed.
 * @prop formatValue  Turns a raw value into display text (ids → names, dates → "Oct 6").
 * @prop onAccept     Called with the (possibly edited) fix and whether it was edited.
 * @prop onReject     Called with the reason.
 */
export interface ApprovalItemProps {
  alert: Alert & { fix: Fix };
  formatValue: (change: FieldChange, value: FieldValue) => string;
  onAccept: (fix: Fix, edited: boolean) => void;
  onReject: (reason: string) => void;
}

const isDate = (v: FieldValue) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function ApprovalItem({ alert, formatValue, onAccept, onReject }: ApprovalItemProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [draft, setDraft] = useState<FieldValue[]>(alert.fix.changes.map((c) => c.to));
  const [reason, setReason] = useState('');
  const sev = SEVERITY[alert.severity];

  const accept = () => {
    const edited = draft.some((v, i) => v !== alert.fix.changes[i].to);
    onAccept({ ...alert.fix, changes: alert.fix.changes.map((c, i) => ({ ...c, to: draft[i] })) }, edited);
  };

  return (
    <article className="card">
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={alert.fix.risk === 'high' ? 'warning' : 'neutral'} label={alert.fix.risk === 'high' ? 'Higher risk' : 'Low risk'} />
          <span className="text-xs muted">{sev.label} severity · {alert.ruleLabel}</span>
        </div>
        <h3 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">{alert.fix.label} <span className="font-normal muted">· {alert.fix.target.label}</span></h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{alert.reason}</p>

        <table className="mt-3 w-full table-fixed text-sm">
          <colgroup><col className="w-[34%]" /><col className="w-[28%]" /><col className="w-6" /><col /></colgroup>
          <thead className="sr-only"><tr><th>Field</th><th>Current</th><th></th><th>Proposed</th></tr></thead>
          <tbody>
            {alert.fix.changes.map((c, i) => (
              <tr key={c.field} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3 text-xs muted">{c.label}</td>
                <td className="py-1.5 pr-2 text-slate-500 line-through decoration-slate-400 dark:text-slate-400">{formatValue(c, c.from)}</td>
                <td className="py-1.5 pr-2 text-slate-400"><Icon name="chevronRight" className="h-3.5 w-3.5" /></td>
                <td className="py-1.5 font-medium text-slate-900 dark:text-white">
                  {mode === 'edit' && !c.readOnly ? (
                    c.options ? (
                      <select aria-label={`New ${c.label}`} className="input py-1" value={String(draft[i] ?? '')} onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))}>
                        {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input aria-label={`New ${c.label}`} className="input py-1"
                        type={isDate(c.to) ? 'date' : typeof c.to === 'number' ? 'number' : 'text'}
                        value={String(draft[i] ?? '')}
                        onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? (typeof c.to === 'number' ? Number(e.target.value) : e.target.value) : v)))} />
                    )
                  ) : formatValue(c, draft[i])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {mode === 'reject' && (
          <div className="mt-3">
            <label className="label" htmlFor={`rej-${alert.id}`}>Reason (optional, saved to the activity log)</label>
            <input id={`rej-${alert.id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Already handled by phone" autoFocus />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
        {mode === 'reject' ? (
          <>
            <button type="button" className="btn-danger btn-sm" onClick={() => onReject(reason)}>Reject change</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode('view')}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary btn-sm" onClick={accept}><Icon name="check" className="h-3.5 w-3.5" />{mode === 'edit' ? 'Save and accept' : 'Accept'}</button>
            {mode === 'edit' ? (
              <button type="button" className="btn-ghost btn-sm" onClick={() => { setDraft(alert.fix.changes.map((c) => c.to)); setMode('view'); }}>Cancel edit</button>
            ) : (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setMode('edit')}><Icon name="edit" className="h-3.5 w-3.5" />Edit</button>
            )}
            <button type="button" className="btn-ghost btn-sm text-red-700 dark:text-red-400" onClick={() => setMode('reject')}>Reject</button>
          </>
        )}
      </div>
    </article>
  );
}
