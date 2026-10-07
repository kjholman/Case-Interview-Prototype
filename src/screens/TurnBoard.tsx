import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CONFIG } from '../config';
import { DataTable, type Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { KeyNumber } from '../components/KeyNumber';
import { StatusPill } from '../components/StatusPill';
import { ChipToggle, PageHeader, SearchInput, cx } from '../components/ui';
import { AUTOMATION_LEVELS } from '../domain/automation';
import { addDays, daysBetween, formatDate, TODAY } from '../domain/dates';
import { formatCurrency } from '../domain/impact';
import type { Task } from '../domain/types';
import { computeTurns, nextStepLabel, STATUS_ORDER, stepState, TURN_STAGES, TURN_STATUS, type StepState, type TurnRow, type TurnStatus } from '../domain/turns';
import { useWhoLabel } from '../shell/format';
import { useAlerts, useLookups, useScopedData, useStore } from '../store/AppStore';
import { TaskDrawer, UnitDrawer } from './shared/Drawers';

/** Target turn time (move-out → ready) used for the headline number. */
const TARGET_TURN_DAYS = 7;

const CELL: Record<StepState, string> = {
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  active: 'bg-sky-500 text-white dark:bg-sky-600',
  todo: 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300',
  late: 'bg-amber-400 text-amber-950',
  blocked: 'bg-red-700 text-white dark:bg-red-600',
  unassigned: 'border border-dashed border-amber-500 text-amber-800 dark:text-amber-300',
};

function StepCell({ task, onOpen, who }: { task?: Task; onOpen: (id: string) => void; who: (t: Task) => string | undefined }) {
  if (!task) return <span className="block text-center text-xs text-slate-300 dark:text-slate-600" aria-label="Not in this turn">—</span>;
  const state = stepState(task, TODAY);
  const text = state === 'done' ? '✓' : state === 'blocked' ? 'Blocked' : state === 'late' ? `${daysBetween(task.due, TODAY)}d late`
    : state === 'unassigned' ? 'No one' : state === 'active' ? 'Today' : formatDate(task.start);
  const unconfirmed = task.vendorId && task.vendorConfirmed === false && task.status === 'todo';
  const title = `${task.title} · ${who(task) ?? 'Unassigned'} · ${formatDate(task.start)}–${formatDate(task.due)} · ${state === 'done' ? `done ${formatDate(task.completedDate)}` : state}${unconfirmed ? ' · vendor not confirmed' : ''}${task.blockedReason ? ` · ${task.blockedReason}` : ''}`;
  return (
    <button type="button" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onOpen(task.id); }}
      className={cx('relative flex h-7 w-full min-w-[64px] items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums hover:ring-2 hover:ring-accent/50', CELL[state])}>
      {text}
      {unconfirmed && <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] text-white" aria-hidden>?</span>}
    </button>
  );
}

export function TurnBoard() {
  const { state } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const who = useWhoLabel();
  const { approvals } = useAlerts();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<Set<TurnStatus>>(new Set());
  const [preleasedOnly, setPreleasedOnly] = useState(false);
  const cfg = CONFIG.screens.turns;
  const name = CONFIG.brand.assistantName;
  const setParam = (k: string, v?: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  // Turns are computed on the whole dataset (plans span the portfolio), then scoped to the selected property.
  const all = useMemo(() => {
    const ids = new Set(data.units.map((u) => u.id));
    return computeTurns(state.data, TODAY).filter((r) => ids.has(r.unit.id));
  }, [state.data, data.units]);

  const rows = all.filter((r) =>
    (!statuses.size || statuses.has(r.status)) && (!preleasedOnly || r.preleased) &&
    (!q || r.unit.number.includes(q) || r.incoming?.name.toLowerCase().includes(q.toLowerCase())));

  /* Headline numbers */
  const active = all.filter((r) => r.status !== 'ready');
  const late = all.filter((r) => r.status === 'late' || r.status === 'blocked');
  const atRisk = all.filter((r) => r.status === 'at_risk' || r.status === 'no_plan');
  const turnTimes = all.filter((r) => r.turnDays !== undefined && r.unit.moveOutDate && r.unit.moveOutDate < TODAY).map((r) => r.turnDays!);
  const avgTurn = turnTimes.length ? turnTimes.reduce((s, x) => s + x, 0) / turnTimes.length : 0;
  const vacantNotReady = all.filter((r) => r.status !== 'ready' && r.daysVacant > 0);
  const vacancyPerDay = vacantNotReady.reduce((s, r) => s + (r.unit.rent * 12) / 365, 0);
  const readySoon = active.filter((r) => r.projectedReady && r.projectedReady <= addDays(TODAY, 7)).length;
  const preleasedLate = all.filter((r) => r.preleased && r.daysLate > 0);

  /* What Elise did today on turns */
  const turnRuleIds = ['turn-plan-stale', 'vendor-unconfirmed', 'task-unassigned', 'no-make-ready-plan'];
  const todays = state.audit.filter((e) => e.at.startsWith(TODAY) && (e.mode === 'automatic' || e.mode === 'approved') && (state.propertyId === 'all' || e.propertyId === state.propertyId));
  const rescheduled = todays.filter((e) => e.action.startsWith('Reschedule')).length;
  const confirmed = todays.filter((e) => e.action.startsWith('Text ')).length;
  const assigned = todays.filter((e) => e.action.startsWith('Assign')).length;
  const waiting = approvals.filter((a) => turnRuleIds.includes(a.ruleId)).length;
  const level = AUTOMATION_LEVELS[state.settings.automationLevel - 1];

  const counts = (s: TurnStatus) => all.filter((r) => r.status === s).length;
  const toggle = (s: TurnStatus) => setStatuses((x) => { const n = new Set(x); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  const columns: Column<TurnRow>[] = [
    { id: 'unit', header: 'Unit', sortValue: (r) => r.unit.propertyId + r.unit.number.padStart(5, '0'),
      cell: (r) => (
        <div className="min-w-[120px]">
          <span className="font-semibold text-slate-900 dark:text-white">{r.unit.number}</span>
          <span className="ml-1.5 text-xs muted">{r.unit.floorplan} · {r.unit.beds === 0 ? 'Studio' : `${r.unit.beds} bd`}</span>
          {state.propertyId === 'all' && <span className="block text-[11px] muted">{l.propertyById.get(r.unit.propertyId)?.name}</span>}
          {r.preleased && <span className="mt-0.5 block text-[11px] font-medium text-sky-700 dark:text-sky-400">Pre-leased{r.incoming ? ` · ${r.incoming.name}` : ''}</span>}
        </div>
      ) },
    { id: 'status', header: 'Status', sortValue: (r) => STATUS_ORDER[r.status] * 100 - r.daysLate,
      cell: (r) => (
        <div className="min-w-[150px] max-w-[220px]" title={r.reasons.join('\n')}>
          <StatusPill tone={TURN_STATUS[r.status].tone} label={TURN_STATUS[r.status].label} />
          {r.reasons[0] && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400">{r.reasons[0]}</p>}
        </div>
      ) },
    ...TURN_STAGES.map((s): Column<TurnRow> => ({
      id: s.type, header: s.short, className: 'px-1.5',
      cell: (r) => <StepCell task={r.steps[s.type]} who={who} onOpen={(id) => setParam('task', id)} />,
    })),
    { id: 'vacant', header: 'Vacant', align: 'right', sortValue: (r) => r.daysVacant, hideBelow: 'md',
      cell: (r) => (r.unit.status === 'notice' ? <span className="text-xs muted">Out {formatDate(r.unit.moveOutDate)}</span> : <span className="tabular-nums">{r.daysVacant}d</span>) },
    { id: 'target', header: 'Target', sortValue: (r) => r.target, hideBelow: 'sm',
      cell: (r) => <div className="whitespace-nowrap tabular-nums">{formatDate(r.target)}<span className="block text-[11px] muted">{r.preleased ? 'Move-in' : 'Available'}</span></div> },
    { id: 'projected', header: 'Projected ready', sortValue: (r) => r.projectedReady,
      cell: (r) => (
        <div className="whitespace-nowrap tabular-nums">
          <span className={cx(r.daysLate > 0 ? 'font-semibold text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-100')}>{r.status === 'no_plan' ? '—' : formatDate(r.projectedReady)}</span>
          {r.status !== 'ready' && r.status !== 'no_plan' && (
            <span className={cx('block text-[11px]', r.daysLate > 0 ? 'text-red-700 dark:text-red-400' : r.daysLate >= -1 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
              {r.daysLate > 0 ? `${r.daysLate}d late` : r.daysLate === 0 ? 'No slack' : `${-r.daysLate}d slack`}
            </span>
          )}
        </div>
      ) },
    { id: 'next', header: 'Next step', hideBelow: 'lg',
      cell: (r) => <span className="block min-w-[180px] text-xs text-slate-700 dark:text-slate-300">{r.next ? nextStepLabel(r.next, who(r.next)) : r.status === 'no_plan' ? 'Create the make-ready plan' : 'Ready to lease'}</span> },
  ];

  if (!state.settings.integrations.workOrders) {
    return (
      <>
        <PageHeader title={cfg.label} description={cfg.description} />
        <div className="card"><EmptyState icon="plug" title="Work-order tool not connected" body="Turn steps come from the work-order tool. Reconnect it in Settings." action={<a className="btn-primary" href="#/settings">Open settings</a>} /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description}
        actions={<Link to="/work?view=timeline" className="btn-secondary"><Icon name="timeline" />Timeline view</Link>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KeyNumber label="Units turning" value={active.length} hint={`${all.filter((r) => r.preleased && r.status !== 'ready').length} pre-leased · ${readySoon} ready within 7 days`} icon="building" />
        <KeyNumber label="Late or blocked" value={late.length} hint={preleasedLate.length ? `${preleasedLate.length} pre-leased will miss move-in` : `${atRisk.length} at risk`} tone={late.length ? 'bad' : 'good'} icon="alert" />
        <KeyNumber label="At risk" value={atRisk.length} hint={`Slipping step, no slack, unconfirmed vendor${counts('no_plan') ? ` · ${counts('no_plan')} with no plan` : ''}`} tone={atRisk.length ? 'warn' : 'good'} icon="clock" />
        <KeyNumber label="Average turn time" value={`${avgTurn.toFixed(1)} days`} hint={`Target ${TARGET_TURN_DAYS} days, move-out to ready`} tone={avgTurn > TARGET_TURN_DAYS ? 'warn' : 'good'} icon="calendar" to="/impact" />
        <KeyNumber label="Vacancy cost" value={`${formatCurrency(vacancyPerDay)}/day`} hint={`${vacantNotReady.length} vacant units not ready`} tone={vacantNotReady.length ? 'warn' : 'good'} icon="dollar" />
      </div>

      <section className="dark relative mt-4 overflow-hidden rounded-lg bg-[#0B0A12] px-4 py-3 text-white">
        <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-40 w-72 rounded-full bg-[#7638FA]/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2 font-semibold"><Icon name="sparkles" className="h-4 w-4 text-[#AFC1F6]" />{name} on turns today</span>
          <span><span className="font-semibold tabular-nums">{rescheduled}</span> <span className="text-slate-400">turns rescheduled</span></span>
          <span><span className="font-semibold tabular-nums">{confirmed}</span> <span className="text-slate-400">vendor visits confirmed</span></span>
          <span><span className="font-semibold tabular-nums">{assigned}</span> <span className="text-slate-400">steps assigned</span></span>
          <span className="ml-auto text-xs text-slate-300">
            Level {level.level} · {level.name}
            {waiting > 0 && <> · <Link to="/approvals" className="font-semibold text-[#AFC1F6] underline-offset-2 hover:underline">{waiting} waiting for approval</Link></>}
          </span>
        </div>
      </section>

      <div className="card mb-3 mt-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Unit or incoming resident" label="Search turns" className="lg:w-60" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {(Object.keys(TURN_STATUS) as TurnStatus[]).map((s) => (
            <ChipToggle key={s} pressed={statuses.has(s)} onClick={() => toggle(s)}>{TURN_STATUS[s].label}<span className="tabular-nums opacity-70">{counts(s)}</span></ChipToggle>
          ))}
          <ChipToggle pressed={preleasedOnly} onClick={() => setPreleasedOnly((v) => !v)}>Pre-leased</ChipToggle>
        </div>
      </div>

      <div className="card overflow-hidden">
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.unit.id} caption="Turn board"
          onRowClick={(r) => setParam('unit', r.unit.id)} selectedId={params.get('unit') ?? undefined}
          initialSort={{ id: 'status', dir: 'asc' }} maxHeight="calc(100vh - 330px)"
          empty={<EmptyState icon="checkCircle" title="No turns match" body="Clear a filter to see more units." />} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-3 py-2 text-[11px] muted dark:border-slate-800">
          <span>{rows.length} of {all.length} turns</span>
          {([['done', 'Done'], ['active', 'In progress'], ['todo', 'Scheduled'], ['late', 'Late'], ['blocked', 'Blocked'], ['unassigned', 'No one assigned']] as [StepState, string][]).map(([s, label]) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={cx('inline-block h-3 w-5 rounded-sm', CELL[s])} />{label}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] text-white">?</span>Vendor not confirmed</span>
          <span className="ml-auto">Click a row for the unit, a step to edit it.</span>
        </div>
      </div>

      <UnitDrawer unitId={params.get('unit') ?? undefined} onClose={() => setParam('unit')} />
      <TaskDrawer taskId={params.get('task') ?? undefined} onClose={() => setParam('task')} />
    </>
  );
}
