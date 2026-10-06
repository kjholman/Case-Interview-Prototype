import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONFIG } from '../config';
import { EmptyState } from '../components/EmptyState';
import { ExceptionCard } from '../components/ExceptionCard';
import { SEVERITY } from '../components/StatusPill';
import { ChipToggle, PageHeader, Select, useToast } from '../components/ui';
import { AUTOMATION_LEVELS } from '../domain/automation';
import { formatDate } from '../domain/dates';
import { RULES } from '../domain/rules';
import type { Severity } from '../domain/types';
import { recordLink } from '../shell/links';
import { useAlerts, useLookups, useStore, type RoutedAlert } from '../store/AppStore';

export function Exceptions() {
  const { state, dispatch } = useStore();
  const { exceptions, snoozed, approvals } = useAlerts();
  const l = useLookups();
  const toast = useToast();
  const navigate = useNavigate();
  const [sev, setSev] = useState<Set<Severity>>(new Set());
  const [rule, setRule] = useState('all');
  const [showSnoozed, setShowSnoozed] = useState(false);
  const cfg = CONFIG.screens.exceptions;
  const level = AUTOMATION_LEVELS[state.settings.automationLevel - 1];

  const list = (showSnoozed ? snoozed : exceptions).filter((a) => (!sev.size || sev.has(a.severity)) && (rule === 'all' || a.ruleId === rule));
  const bySev = (s: Severity) => exceptions.filter((a) => a.severity === s).length;

  const approve = (a: RoutedAlert) => {
    if (a.fix) {
      dispatch({ type: 'applyFix', alert: a });
      toast(`Approved: ${a.fix.label}`);
    } else {
      dispatch({ type: 'resolveAlert', alert: a });
      toast('Marked handled');
    }
  };

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description} />

      <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
        <span className="font-semibold text-slate-900 dark:text-white">Automation Level {level.level} · {level.name}.</span>{' '}
        {state.settings.automationLevel === 1 && <>Every suggested fix waits in <Link className="font-medium text-accent-strong underline-offset-2 hover:underline" to="/approvals">Approvals ({approvals.length})</Link>. Only items with no automatic fix are here.</>}
        {state.settings.automationLevel === 2 && <>Low-risk fixes already ran on their own (<Link className="font-medium text-accent-strong underline-offset-2 hover:underline" to="/activity">see activity</Link>). Items with no automatic fix are here; higher-risk fixes wait in <Link className="font-medium text-accent-strong underline-offset-2 hover:underline" to="/approvals">Approvals ({approvals.length})</Link>.</>}
        {state.settings.automationLevel === 3 && <>Fixes run automatically. Only items with no fix, and higher-risk changes on urgent items, come here.</>}
      </div>

      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
          {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
            <ChipToggle key={s} pressed={sev.has(s)} onClick={() => setSev((x) => { const n = new Set(x); if (n.has(s)) n.delete(s); else n.add(s); return n; })}>
              {SEVERITY[s].label}<span className="tabular-nums opacity-70">{bySev(s)}</span>
            </ChipToggle>
          ))}
        </div>
        <Select label="Rule" hideLabel value={rule} onChange={setRule} className="md:w-64"
          options={[{ value: 'all', label: 'All rules' }, ...RULES.map((r) => ({ value: r.id, label: r.label }))]} />
        <ChipToggle pressed={showSnoozed} onClick={() => setShowSnoozed((v) => !v)}>Snoozed<span className="tabular-nums opacity-70">{snoozed.length}</span></ChipToggle>
        <span className="text-sm muted md:ml-auto">{list.length} {showSnoozed ? 'snoozed' : 'open'}</span>
      </div>

      {list.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {list.map((a) => (
            <ExceptionCard
              key={a.id} alert={a} ownerName={a.state.ownerName}
              snoozedUntil={showSnoozed && a.state.snoozedUntil ? formatDate(a.state.snoozedUntil) : undefined}
              staffOptions={state.data.staff.filter((s) => s.propertyId === a.propertyId).map((s) => ({ value: s.id, label: `${s.name} · ${s.role}` }))}
              onApprove={() => approve(a)}
              onSnooze={(days) => { dispatch({ type: 'snooze', alert: a, days }); toast(`Snoozed for ${days === 7 ? 'a week' : `${days} day${days > 1 ? 's' : ''}`}`); }}
              onReassign={(id) => { dispatch({ type: 'reassign', alert: a, staffId: id }); toast(`Reassigned to ${l.staffById.get(id)?.name}`); }}
              onOpen={recordLink(a.record, l) ? () => navigate(recordLink(a.record, l)!) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState title={showSnoozed ? 'Nothing snoozed' : 'No exceptions'} body={showSnoozed ? undefined : 'Nothing needs a person right now. New items appear as data changes.'} />
        </div>
      )}
    </>
  );
}
