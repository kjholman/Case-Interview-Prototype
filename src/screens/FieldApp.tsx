import { useMemo, useState } from 'react';
import { CONFIG } from '../config';
import { ChecklistForm } from '../components/ChecklistForm';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PRIORITY, StatusPill, TASK_STATUS } from '../components/StatusPill';
import { PageHeader, Segmented, Select, cx, useToast } from '../components/ui';
import { CHECKLISTS } from '../domain/checklists';
import { dueLabel, formatWeekday, TODAY } from '../domain/dates';
import { woNumber } from '../domain/lifecycle';
import type { Task } from '../domain/types';
import { useLookups, useScopedData, useStore } from '../store/AppStore';

/** Phone-sized view for on-site staff. Shown inside a device frame on wide screens, full-width on phones. */
export function FieldApp() {
  const { state, dispatch } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const toast = useToast();
  const cfg = CONFIG.screens.field;
  const crew = data.staff.filter((s) => s.role === 'Maintenance technician' || s.role === 'Porter');
  const [personId, setPersonId] = useState(crew[0]?.id ?? '');
  const person = l.staffById.get(personId) ?? crew[0];
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [openId, setOpenId] = useState<string>();
  const [problem, setProblem] = useState<string | null>(null);

  const mine = useMemo(() => state.data.tasks.filter((t) => t.assigneeId === person?.id), [state.data.tasks, person]);
  const todo = mine.filter((t) => t.status !== 'done').sort((a, b) => Number(a.status === 'blocked') - Number(b.status === 'blocked') || a.due.localeCompare(b.due));
  const doneToday = mine.filter((t) => t.status === 'done' && t.completedDate === TODAY);
  const open = openId ? l.taskById.get(openId) : undefined;
  const unitOf = (t: Task) => (t.unitId ? l.unitById.get(t.unitId) : undefined);
  const label = (t: Task) => (unitOf(t) ? `${t.title} · Unit ${unitOf(t)!.number}` : t.title);

  const submit = (t: Task, r: { checked: string[]; notes: string; photos: number; complete: boolean }) => {
    dispatch({
      type: 'updateRecord', collection: 'tasks', id: t.id,
      patch: { status: r.complete ? 'done' : 'in_progress', completedDate: r.complete ? TODAY : undefined, notes: r.notes || t.notes, photoCount: r.photos || t.photoCount, blockedReason: undefined },
      action: r.complete ? `Completed in field app (${r.checked.length} checks, ${r.photos} photo${r.photos === 1 ? '' : 's'})` : 'Saved progress in field app',
      target: { collection: 'tasks', id: t.id, label: label(t) }, propertyId: t.propertyId,
      changes: t.status !== (r.complete ? 'done' : 'in_progress') ? [{ field: 'status', label: 'Status', from: t.status, to: r.complete ? 'done' : 'in_progress' }] : undefined,
    });
    toast(r.complete ? 'Marked complete — the office can see it now' : 'Progress saved');
    setOpenId(undefined);
  };

  const reportProblem = (t: Task, reason: string) => {
    dispatch({
      type: 'updateRecord', collection: 'tasks', id: t.id, patch: { status: 'blocked', blockedReason: reason || 'Problem reported from the field' },
      action: 'Reported a problem from the field', target: { collection: 'tasks', id: t.id, label: label(t) }, propertyId: t.propertyId,
      changes: [{ field: 'status', label: 'Status', from: t.status, to: 'blocked' }, { field: 'blockedReason', label: 'Blocked reason', from: t.blockedReason ?? null, to: reason }],
    });
    toast('Problem reported — the office was notified', { tone: 'warning' });
    setProblem(null);
    setOpenId(undefined);
  };

  return (
    <>
      <div className="hidden sm:block">
        <PageHeader title={cfg.label} description={cfg.description}
          actions={<Select label="Viewing as" value={person?.id ?? ''} onChange={(v) => { setPersonId(v); setOpenId(undefined); }} className="w-60"
            options={crew.map((s) => ({ value: s.id, label: `${s.name} · ${s.role}` }))} />} />
      </div>

      {/* Device frame on sm+, plain on phones */}
      <div className="mx-auto sm:w-[390px] sm:rounded-[2.25rem] sm:border-[10px] sm:border-slate-800 sm:shadow-2xl dark:sm:border-slate-700">
        <div className="-mx-4 -my-5 flex min-h-[calc(100vh-56px)] flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 sm:mx-0 sm:my-0 sm:h-[760px] sm:min-h-0 sm:rounded-[1.6rem]">
          {/* App bar */}
          <div className="bg-accent px-4 pb-4 pt-5 text-white dark:text-slate-950">
            {open ? (
              <button type="button" onClick={() => { setOpenId(undefined); setProblem(null); }} className="mb-2 inline-flex items-center gap-1 text-sm font-medium opacity-90">
                <Icon name="chevronLeft" className="h-4 w-4" />My work
              </button>
            ) : (
              <p className="text-xs font-medium uppercase tracking-wide opacity-80">{formatWeekday(TODAY)}</p>
            )}
            <h1 className="text-xl font-semibold">{open ? open.title : `Hi, ${person?.name.split(' ')[0] ?? 'there'}`}</h1>
            <p className="text-sm opacity-90">
              {open ? `${unitOf(open) ? `Unit ${unitOf(open)!.number} · ` : ''}${l.propertyById.get(open.propertyId)?.name}` : `${todo.length} open · ${doneToday.length} done today`}
            </p>
            <div className="mt-3 sm:hidden">
              {!open && (
                <select aria-label="Viewing as" value={person?.id ?? ''} onChange={(e) => setPersonId(e.target.value)}
                  className="w-full rounded-md border-0 bg-white/20 px-2 py-1.5 text-sm text-white dark:text-slate-950 [&>option]:text-slate-900">
                  {crew.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto p-4">
            {!person ? <EmptyState title="No field staff at this property" icon="users" /> : open ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill {...TASK_STATUS[open.status]} />
                  {open.priority !== 'normal' && <StatusPill {...PRIORITY[open.priority]} dot={false} />}
                  <span className={cx('text-xs', open.due < TODAY ? 'font-medium text-red-700 dark:text-red-400' : 'muted')}>{dueLabel(open.due)}</span>
                </div>
                {open.status === 'blocked' && open.blockedReason && (
                  <p className="rounded-md bg-red-50 p-2.5 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-300">Blocked: {open.blockedReason}</p>
                )}
                <ChecklistForm key={open.id} items={CHECKLISTS[open.type]} initialNotes={open.notes} onSubmit={(r) => submit(open, r)} />
                {problem === null ? (
                  <button type="button" className="btn-ghost w-full text-red-700 dark:text-red-400" onClick={() => setProblem('')}>
                    <Icon name="alert" />Report a problem
                  </button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-red-200 p-3 dark:border-red-900">
                    <label htmlFor="problem" className="label">What's stopping the work?</label>
                    <input id="problem" className="input" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. Need a replacement part" autoFocus />
                    <div className="flex gap-2">
                      <button type="button" className="btn-danger flex-1" onClick={() => reportProblem(open, problem)}>Mark blocked</button>
                      <button type="button" className="btn-ghost" onClick={() => setProblem(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Segmented label="Work list" value={tab} onChange={setTab}
                  options={[{ value: 'todo', label: 'To do', count: todo.length }, { value: 'done', label: 'Done today', count: doneToday.length }]} />
                <ul className="mt-3 space-y-2">
                  {(tab === 'todo' ? todo : doneToday).map((t) => {
                    const late = t.status !== 'done' && t.due < TODAY;
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => setOpenId(t.id)} className="card flex w-full items-center gap-3 p-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
                          <span className={cx('h-10 w-1 shrink-0 rounded-full', t.status === 'blocked' ? 'bg-red-600' : late ? 'bg-amber-400' : t.status === 'done' ? 'bg-emerald-500' : 'bg-sky-500')} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{t.title}</span>
                            <span className="block truncate text-xs muted">{woNumber(t)} · {unitOf(t) ? `Unit ${unitOf(t)!.number}` : 'Common area'} · {t.type === 'service' ? t.category ?? 'Service request' : 'Make-ready'}</span>
                            <span className={cx('mt-0.5 block text-xs', t.status === 'blocked' ? 'text-red-700 dark:text-red-400' : late ? 'font-medium text-red-700 dark:text-red-400' : 'muted')}>
                              {t.status === 'blocked' ? 'Blocked' : t.status === 'done' ? 'Done' : dueLabel(t.due)}
                            </span>
                          </span>
                          <Icon name="chevronRight" className="h-5 w-5 text-slate-400" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {(tab === 'todo' ? todo : doneToday).length === 0 && <EmptyState title={tab === 'todo' ? 'All caught up' : 'Nothing finished yet today'} />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
