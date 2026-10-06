import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CONFIG } from '../config';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { KanbanBoard } from '../components/KanbanBoard';
import { PRIORITY, StatusPill, TASK_STATUS, UNIT_STATUS } from '../components/StatusPill';
import { TimelineBar, type TimelineRow } from '../components/TimelineBar';
import { ChipToggle, PageHeader, SearchInput, Segmented, Select, cx, useToast } from '../components/ui';
import { addDays, daysBetween, dueLabel, formatDate, TODAY } from '../domain/dates';
import { woNumber } from '../domain/lifecycle';
import type { Task, TaskStatus } from '../domain/types';
import { forecastPlan, unitPlan } from '../domain/workplan';
import { useWhoLabel } from '../shell/format';
import { useLookups, useScopedData, useStore } from '../store/AppStore';
import { TaskDrawer, taskTone } from './shared/Drawers';

type View = 'board' | 'timeline';

export function WorkBoard() {
  const { state, dispatch } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const who = useWhoLabel();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) ?? 'board';
  const openTask = params.get('task') ?? undefined;
  const focusUnit = params.get('unit') ?? undefined;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'makeready' | 'service'>('all');
  const [owner, setOwner] = useState('all');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const cfg = CONFIG.screens.work;

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const unitNum = (t: Task) => (t.unitId ? l.unitById.get(t.unitId)?.number : undefined);
  const tasks = useMemo(() => data.tasks.filter((t) => {
    if (kind === 'makeready' && t.type === 'service') return false;
    if (kind === 'service' && t.type !== 'service') return false;
    if (owner === 'none' && (t.assigneeId || t.vendorId)) return false;
    if (owner !== 'all' && owner !== 'none' && t.assigneeId !== owner && t.vendorId !== owner) return false;
    if (onlyProblems && !(t.status === 'blocked' || (t.status !== 'done' && (t.due < TODAY || (!t.assigneeId && !t.vendorId))))) return false;
    if (t.status === 'done' && daysBetween(t.completedDate ?? t.due, TODAY) > 7) return false; // board shows the last week of done work
    if (q) {
      const s = q.toLowerCase();
      return t.title.toLowerCase().includes(s) || woNumber(t).toLowerCase().includes(s) || unitNum(t)?.includes(s) || who(t)?.toLowerCase().includes(s);
    }
    return true;
  }), [data.tasks, kind, owner, onlyProblems, q, who]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (id: string, to: string) => {
    const t = l.taskById.get(id);
    if (!t || t.status === to) return;
    const status = to as TaskStatus;
    dispatch({
      type: 'updateRecord', collection: 'tasks', id,
      patch: { status, completedDate: status === 'done' ? TODAY : undefined, blockedReason: status === 'blocked' ? t.blockedReason ?? 'Marked blocked on the board' : undefined },
      action: `Moved to ${TASK_STATUS[status].label}`,
      target: { collection: 'tasks', id, label: unitNum(t) ? `${t.title} · Unit ${unitNum(t)}` : t.title }, propertyId: t.propertyId,
      changes: [{ field: 'status', label: 'Status', from: t.status, to: status }],
    });
    toast(`${t.title} moved to ${TASK_STATUS[status].label.toLowerCase()}`);
    if (status === 'blocked') setParam('task', id);
  };

  const owners = [
    { value: 'all', label: 'Everyone' },
    { value: 'none', label: 'Unassigned' },
    ...data.staff.filter((s) => s.role !== 'Leasing agent').map((s) => ({ value: s.id, label: s.name })),
    ...state.data.vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  if (!state.settings.integrations.workOrders) {
    return (
      <>
        <PageHeader title={cfg.label} description={cfg.description} />
        <div className="card"><EmptyState icon="plug" title="Work-order tool not connected" body="Tasks come from the work-order tool. Reconnect it in Settings." action={<a className="btn-primary" href="#/settings">Open settings</a>} /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description}
        actions={<Segmented label="View" value={view} onChange={(v) => setParam('view', v === 'board' ? undefined : v)}
          options={[{ value: 'board', label: 'Board', icon: 'columns' }, { value: 'timeline', label: 'Timeline', icon: 'timeline' }]} />} />

      <div className="card mb-3 flex flex-col gap-3 p-3 md:flex-row md:flex-wrap md:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Task, unit or person" label="Search work" className="md:w-56" />
        <Select label="Type" hideLabel value={kind} onChange={(v) => setKind(v as typeof kind)} className="md:w-48"
          options={[{ value: 'all', label: 'All work' }, { value: 'makeready', label: 'Make-ready' }, { value: 'service', label: 'Service requests' }]} />
        <Select label="Assigned to" hideLabel value={owner} onChange={setOwner} className="md:w-52" options={owners} />
        <ChipToggle pressed={onlyProblems} onClick={() => setOnlyProblems((v) => !v)}><Icon name="alert" className="h-3 w-3" />Late, blocked or unassigned</ChipToggle>
      </div>

      {view === 'board' ? (
        <KanbanBoard
          columns={[
            { id: 'todo', title: 'To do', tone: 'neutral' },
            { id: 'in_progress', title: 'In progress', tone: 'info' },
            { id: 'blocked', title: 'Blocked', tone: 'danger' },
            { id: 'done', title: 'Done (last 7 days)', tone: 'success' },
          ]}
          items={[...tasks].sort((a, b) => a.due.localeCompare(b.due))}
          getId={(t) => t.id}
          getColumn={(t) => t.status}
          onMove={move}
          onOpen={(t) => setParam('task', t.id)}
          renderCard={(t) => {
            const late = t.status !== 'done' && t.due < TODAY;
            const owner = who(t);
            return (
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">{t.title}</p>
                  {(t.priority === 'urgent' || t.priority === 'high') && <StatusPill {...PRIORITY[t.priority]} dot={false} />}
                </div>
                <p className="text-xs muted">
                  <span className="font-mono">{woNumber(t)}</span> · {unitNum(t) ? `Unit ${unitNum(t)}` : 'Common area'}{state.propertyId === 'all' && ` · ${l.propertyById.get(t.propertyId)?.name.split(' ')[0]}`} · {t.type === 'service' ? t.category ?? 'Service' : `Make-ready ${t.sequence}`}
                  {t.source === 'elise' && <StatusPill tone="accent" label={CONFIG.brand.assistantName} dot={false} className="ml-1 px-1.5 py-0 text-[10px]" />}
                </p>
                {t.status === 'blocked' && t.blockedReason && <p className="rounded bg-red-50 px-1.5 py-1 text-xs text-red-800 dark:bg-red-950/60 dark:text-red-300">{t.blockedReason}</p>}
                <div className="flex items-center justify-between gap-2 text-xs">
                  {owner ? <span className="truncate text-slate-600 dark:text-slate-400">{owner}</span> : <StatusPill tone="warning" label="Unassigned" />}
                  <span className={cx('shrink-0 tabular-nums', late ? 'font-medium text-red-700 dark:text-red-400' : 'muted')}>
                    {t.status === 'done' ? `Done ${formatDate(t.completedDate)}` : dueLabel(t.due)}
                  </span>
                </div>
              </div>
            );
          }}
        />
      ) : (
        <TimelineView tasks={tasks} focusUnit={focusUnit} onOpenTask={(id) => setParam('task', id)} />
      )}

      <TaskDrawer taskId={openTask} onClose={() => setParam('task')} />
    </>
  );
}

function TimelineView({ tasks, focusUnit, onOpenTask }: { tasks: Task[]; focusUnit?: string; onOpenTask: (id: string) => void }) {
  const l = useLookups();
  const { state } = useStore();
  const [range, setRange] = useState<'3w' | '6w'>('3w');
  const start = addDays(TODAY, -10);
  const end = addDays(TODAY, range === '3w' ? 18 : 35);

  const rows: TimelineRow[] = useMemo(() => {
    const unitIds = [...new Set(tasks.filter((t) => t.sequence !== undefined && t.unitId).map((t) => t.unitId!))];
    return unitIds
      .map((id) => l.unitById.get(id)!)
      .filter((u) => u && u.status !== 'occupied' && (u.status !== 'ready' || (u.availableDate ?? '') >= TODAY))
      .map((u) => {
        const plan = unitPlan(state.data.tasks, u.id);
        const f = forecastPlan(plan, TODAY);
        const late = !!u.availableDate && f.readyDate > u.availableDate && u.status !== 'ready';
        // Show the projected position of any remaining step that moved from its plan (e.g. blocked).
        const projected = f.projection.steps
          .filter((p) => { const t = plan.find((x) => x.id === p.id)!; return p.start !== t.start || p.end !== t.due; })
          .map((p) => ({ id: `${p.id}-proj`, start: p.start, end: p.end, label: 'Projected', tone: 'projected' as const, title: `Projected ${formatDate(p.start)}–${formatDate(p.end)}` }));
        return {
          id: u.id,
          sortKey: `${late ? 0 : 1}${u.availableDate ?? '9999'}`,
          label: <span className="inline-flex items-center gap-1.5">Unit {u.number}<StatusPill {...UNIT_STATUS[u.status]} dot={false} className="px-1.5 py-0 text-[10px]" /></span>,
          sublabel: `${state.propertyId === 'all' ? `${l.propertyById.get(u.propertyId)?.name.split(' ').slice(0, 2).join(' ')} · ` : ''}Ready ${formatDate(f.readyDate)}${late ? ' · late' : ''}`,
          bars: [
            ...plan.map((t) => ({ id: t.id, start: t.start, end: t.due, label: t.title, tone: taskTone(t), title: `${t.title} · ${TASK_STATUS[t.status].label} · ${formatDate(t.start)}–${formatDate(t.due)}` })),
            ...projected,
          ],
          markers: [
            ...(u.availableDate ? [{ date: addDays(u.availableDate, -1), label: `${u.status === 'leased' ? 'Move-in' : 'Available'} ${formatDate(u.availableDate)}`, tone: 'target' as const }] : []),
            ...(late ? [{ date: addDays(f.readyDate, -1), label: `Projected ready ${formatDate(f.readyDate)}`, tone: 'danger' as const }] : []),
          ],
        };
      })
      .filter((r) => r.id === focusUnit || r.bars.some((b) => b.end >= start && b.start <= end) || r.markers.some((m) => m.date >= start && m.date <= end))
      .sort((a, b) => (focusUnit ? (a.id === focusUnit ? -1 : b.id === focusUnit ? 1 : 0) : 0) || a.sortKey.localeCompare(b.sortKey));
  }, [tasks, l, state.data.tasks, state.propertyId, focusUnit, start, end]);

  if (!rows.length) return <div className="card"><EmptyState icon="timeline" title="No make-ready work matches" body="The timeline shows make-ready plans. Service requests are on the board view." /></div>;

  return (
    <div className="card p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm muted">{rows.length} unit{rows.length === 1 ? '' : 's'} turning · late units first · click a bar to edit</p>
        <Segmented label="Range" value={range} onChange={setRange} options={[{ value: '3w', label: '4 weeks' }, { value: '6w', label: '6 weeks' }]} />
      </div>
      <TimelineBar rows={rows} start={start} end={end} today={TODAY} onBarClick={(id) => !id.endsWith('-proj') && onOpenTask(id)} />
    </div>
  );
}
