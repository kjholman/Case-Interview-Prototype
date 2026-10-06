import { Link } from 'react-router-dom';
import { CONFIG } from '../config';
import { ApprovalItem } from '../components/ApprovalItem';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { StatusPill } from '../components/StatusPill';
import { Card, PageHeader, useToast } from '../components/ui';
import { AUTOMATION_LEVELS } from '../domain/automation';
import { formatDateTime } from '../domain/dates';
import type { Alert, Fix } from '../domain/types';
import { useFormatValue } from '../shell/format';
import { useAlerts, useStore } from '../store/AppStore';

export function Approvals() {
  const { state, dispatch } = useStore();
  const { approvals } = useAlerts();
  const formatValue = useFormatValue();
  const toast = useToast();
  const cfg = CONFIG.screens.approvals;
  const level = AUTOMATION_LEVELS[state.settings.automationLevel - 1];
  const lowRisk = approvals.filter((a) => a.fix?.risk === 'low');
  const decided = state.audit
    .filter((e) => (e.mode === 'approved' || e.mode === 'rejected' || e.mode === 'automatic') && e.target && (state.propertyId === 'all' || e.propertyId === state.propertyId))
    .slice(0, 10);

  const approveAllLow = () => {
    for (const a of lowRisk) dispatch({ type: 'applyFix', alert: a });
    toast(`Approved ${lowRisk.length} low-risk change${lowRisk.length === 1 ? '' : 's'}`);
  };

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description}
        actions={lowRisk.length > 0 && <button type="button" className="btn-secondary" onClick={approveAllLow}><Icon name="check" />Approve all low-risk ({lowRisk.length})</button>} />

      <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
        <span className="font-semibold text-slate-900 dark:text-white">Automation Level {level.level} · {level.name}.</span>{' '}
        {state.settings.automationLevel === 1 && 'Every change the system suggests waits here.'}
        {state.settings.automationLevel === 2 && 'Low-risk changes apply on their own; higher-risk ones wait here.'}
        {state.settings.automationLevel === 3 && 'Changes apply automatically, so this queue stays empty. Urgent high-risk items go to Exceptions.'}
        {' '}<Link to="/settings" className="font-medium text-accent-strong underline-offset-2 hover:underline">Change level</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div>
          {approvals.length ? (
            <div className="grid gap-3 2xl:grid-cols-2">
              {approvals.map((a) => (
                <ApprovalItem key={a.id} alert={a as Alert & { fix: Fix }} formatValue={formatValue}
                  onAccept={(fix, edited) => { dispatch({ type: 'applyFix', alert: a, fix, edited }); toast(`Accepted${edited ? ' with edits' : ''}: ${fix.label}`); }}
                  onReject={(reason) => { dispatch({ type: 'reject', alert: a, reason }); toast('Rejected — logged to activity', { tone: 'info' }); }} />
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState title="Nothing waiting for approval"
                body={state.settings.automationLevel === 3 ? 'At Level 3 changes apply automatically. Review them in the activity log.' : 'New suggestions appear here when the data changes.'}
                action={<Link to="/activity" className="btn-secondary">Open activity log</Link>} />
            </div>
          )}
        </div>

        <Card title="Recent decisions" bodyClassName="p-0" actions={<Link to="/activity" className="text-xs font-medium text-accent-strong hover:underline">All activity</Link>}>
          {decided.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {decided.map((e) => (
                <li key={e.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill tone={e.mode === 'approved' ? 'success' : e.mode === 'rejected' ? 'danger' : 'accent'} label={e.mode === 'automatic' ? 'Automatic' : e.mode === 'approved' ? 'Approved' : 'Rejected'} />
                    <span className="text-[11px] muted">{formatDateTime(e.at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">{e.action}</p>
                  <p className="text-xs muted">{e.target?.label} · {e.actor}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No decisions yet" icon="history" />}
        </Card>
      </div>
    </>
  );
}
