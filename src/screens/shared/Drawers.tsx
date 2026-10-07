import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONFIG } from '../../config';
import { DetailDrawer } from '../../components/DetailDrawer';
import { Icon } from '../../components/Icon';
import { PRIORITY, RESIDENT_STAGE, SEVERITY, StatusPill, TASK_STATUS, UNIT_STATUS } from '../../components/StatusPill';
import { TimelineBar, type TimelineBarItem } from '../../components/TimelineBar';
import { Field, useToast } from '../../components/ui';
import { addDays, dueLabel, formatDate, formatDateTime, maxDate, minDate, TODAY } from '../../domain/dates';
import { formatCurrency } from '../../domain/impact';
import { woNumber } from '../../domain/lifecycle';
import type { FieldChange, Task, TaskStatus, UnitStatus } from '../../domain/types';
import { forecastPlan, unitPlan } from '../../domain/workplan';
import { useWhoLabel } from '../../shell/format';
import { useAlerts, useLookups, useStore } from '../../store/AppStore';

export function taskTone(t: Task): TimelineBarItem['tone'] {
  if (t.status === 'done') return 'done';
  if (t.status === 'blocked') return 'blocked';
  if (t.due < TODAY) return 'late';
  return t.status === 'in_progress' ? 'active' : 'todo';
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Unit drawer ──────────────────────────────────────────────────────────── */

export function UnitDrawer({ unitId, onClose }: { unitId?: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const l = useLookups();
  const { all } = useAlerts();
  const toast = useToast();
  const who = useWhoLabel();
  const unit = unitId ? l.unitById.get(unitId) : undefined;

  const plan = useMemo(() => (unit ? unitPlan(state.data.tasks, unit.id) : []), [state.data.tasks, unit]);
  const forecast = useMemo(() => (plan.length ? forecastPlan(plan, TODAY) : undefined), [plan]);
  if (!unit) return <DetailDrawer open={false} onClose={onClose} title="">{null}</DetailDrawer>;

  const property = l.propertyById.get(unit.propertyId);
  const resident = unit.residentId ? l.residentById.get(unit.residentId) : undefined;
  const incoming = unit.incomingProspectId ? l.prospectById.get(unit.incomingProspectId) : undefined;
  const service = state.data.tasks.filter((t) => t.unitId === unit.id && t.type === 'service' && t.status !== 'done');
  const relatedIds = new Set([unit.id, resident?.id, incoming?.id, ...plan.map((t) => t.id), ...service.map((t) => t.id)]);
  const alerts = all.filter((a) => relatedIds.has(a.record.id));
  const staleAlert = all.find((a) => a.id === `turn-plan-stale:${unit.id}` && a.fix);
  const history = state.audit.filter((e) => e.target && relatedIds.has(e.target.id)).slice(0, 6);
  const mismatch = unit.crmAvailableDate && unit.availableDate && unit.crmAvailableDate !== unit.availableDate;
  const late = forecast && unit.availableDate && forecast.readyDate > unit.availableDate && unit.status !== 'ready' && unit.status !== 'occupied';

  const setStatus = (status: UnitStatus) => {
    dispatch({
      type: 'updateRecord', collection: 'units', id: unit.id, patch: { status }, action: `Changed status to ${UNIT_STATUS[status].label}`,
      target: { collection: 'units', id: unit.id, label: `Unit ${unit.number}` }, propertyId: unit.propertyId,
      changes: [{ field: 'status', label: 'Status', from: unit.status, to: status }],
    });
    toast(`Unit ${unit.number} is now ${UNIT_STATUS[status].label.toLowerCase()}`);
  };

  const windowStart = plan.length ? addDays(minDate(...plan.map((t) => t.start)), -1) : TODAY;
  const windowEnd = addDays(maxDate(forecast?.readyDate, unit.availableDate, ...plan.map((t) => t.due), addDays(windowStart, 10)), 1);

  return (
    <DetailDrawer
      open onClose={onClose}
      title={`Unit ${unit.number}`}
      subtitle={<><StatusPill {...UNIT_STATUS[unit.status]} /><span>{property?.name}</span></>}
      footer={
        <>
          <label htmlFor="unit-status" className="mr-auto flex items-center gap-2 text-sm muted">
            Status
            <select id="unit-status" className="input w-auto py-1" value={unit.status} onChange={(e) => setStatus(e.target.value as UnitStatus)}>
              {Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          {plan.length > 0 && <Link to={`/work?view=timeline&unit=${unit.id}`} className="btn-secondary btn-sm">Open on work board</Link>}
          {!plan.length && unit.status !== 'occupied' && unit.status !== 'ready' && (
            <button type="button" className="btn-primary btn-sm" onClick={() => { dispatch({ type: 'createPlan', unitId: unit.id }); toast(`Make-ready plan created for Unit ${unit.number}`); }}>Create make-ready plan</button>
          )}
        </>
      }
    >
      <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label="Floorplan">{unit.floorplan} · {unit.beds === 0 ? 'Studio' : `${unit.beds} bd`} / {unit.baths} ba</Field>
        <Field label="Size">{unit.sqft.toLocaleString()} sq ft</Field>
        <Field label="Market rent">{formatCurrency(unit.rent)}</Field>
        <Field label="Move-out">{formatDate(unit.moveOutDate)}</Field>
        <Field label="Available (PMS)">{formatDate(unit.availableDate)}</Field>
        <Field label="Listed (CRM)">
          <span className={mismatch ? 'font-medium text-red-700 dark:text-red-400' : undefined}>{formatDate(unit.crmAvailableDate)}{mismatch && ' · mismatch'}</span>
        </Field>
      </dl>

      {alerts.length > 0 && (
        <Section title={`Open issues (${alerts.length})`}>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-md border border-slate-200 p-2.5 dark:border-slate-800">
                <div className="flex items-center gap-2"><StatusPill {...SEVERITY[a.severity]} /><span className="text-xs muted">{a.route === 'approval' ? 'Needs approval' : a.route === 'exception' ? 'Needs a person' : 'Automatic'}</span></div>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{a.title}</p>
                <p className="text-xs muted">{a.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {plan.length > 0 && forecast && (
        <Section title={`Make-ready · ${forecast.done} of ${forecast.total} done`}
          action={<span className={late ? 'text-xs font-medium text-red-700 dark:text-red-400' : 'text-xs muted'}>Projected ready {formatDate(forecast.readyDate)}{late ? ' · late' : ''}</span>}>
          <TimelineBar
            legend={false} dayWidth={22} today={TODAY} start={windowStart} end={windowEnd}
            rows={plan.map((t) => ({
              id: t.id, label: t.title, sublabel: who(t) ?? 'Unassigned',
              bars: [{ id: t.id, start: t.start, end: t.due, label: TASK_STATUS[t.status].label, tone: taskTone(t), title: `${t.title}: ${formatDate(t.start)}–${formatDate(t.due)}` }],
              markers: unit.availableDate ? [{ date: addDays(unit.availableDate, -1), label: `Available ${formatDate(unit.availableDate)}`, tone: 'target' as const }] : [],
            }))}
          />
          {staleAlert && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/50">
              <Icon name="clock" className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="flex-1 text-slate-800 dark:text-slate-200">{staleAlert.reason}</span>
              <button type="button" className="btn-primary btn-sm" onClick={() => { dispatch({ type: 'applyFix', alert: staleAlert }); toast('Turn rescheduled — crews and vendors notified'); }}>
                <Icon name="sparkles" className="h-3.5 w-3.5" />{staleAlert.fix?.label}
              </button>
            </div>
          )}
          <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {plan.map((t) => {
              const confirmAlert = all.find((a) => a.id === `vendor-unconfirmed:${t.id}`);
              const setStatus = (status: TaskStatus, label: string, extra: Record<string, unknown> = {}) => {
                dispatch({ type: 'updateRecord', collection: 'tasks', id: t.id, patch: { status, ...extra }, action: label,
                  target: { collection: 'tasks', id: t.id, label: `${t.title} · Unit ${unit.number}` }, propertyId: t.propertyId,
                  changes: [{ field: 'status', label: 'Status', from: t.status, to: status }] });
                toast(`${t.title}: ${label.toLowerCase()}`);
              };
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.title}
                      {t.vendorId && t.status === 'todo' && <span className={t.vendorConfirmed === false ? 'ml-1.5 text-[11px] font-medium text-accent-strong' : 'ml-1.5 text-[11px] text-emerald-700 dark:text-emerald-400'}>{t.vendorConfirmed === false ? 'Not confirmed' : 'Confirmed'}</span>}
                    </p>
                    <p className="text-xs muted">{who(t) ?? 'Unassigned'} · {t.status === 'done' ? `done ${formatDate(t.completedDate)}` : `${formatDate(t.start)}–${formatDate(t.due)}`}{t.blockedReason && t.status === 'blocked' ? ` · ${t.blockedReason}` : ''}</p>
                  </div>
                  <StatusPill {...TASK_STATUS[t.status]} />
                  {confirmAlert && <button type="button" className="btn-secondary btn-sm" onClick={() => { dispatch({ type: 'applyFix', alert: confirmAlert }); toast(`${CONFIG.brand.assistantName} texted the vendor — visit confirmed`); }}>Confirm vendor</button>}
                  {t.status === 'todo' && <button type="button" className="btn-secondary btn-sm" onClick={() => setStatus('in_progress', 'Started')}>Start</button>}
                  {t.status === 'blocked' && <button type="button" className="btn-secondary btn-sm" onClick={() => setStatus('in_progress', 'Unblocked', { blockedReason: undefined })}>Unblock</button>}
                  {t.status !== 'done' && <button type="button" className="btn-secondary btn-sm" onClick={() => setStatus('done', 'Completed', { completedDate: TODAY, blockedReason: undefined })}><Icon name="check" className="h-3.5 w-3.5" />Done</button>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(resident || incoming) && (
        <Section title={incoming ? 'Incoming resident' : 'Resident'}>
          {resident && !incoming && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Name">{resident.name}</Field>
              <Field label="Phone">{resident.phone}</Field>
              <Field label="Lease ends">{formatDate(resident.leaseEnd)}</Field>
              <Field label="Renewal">{RESIDENT_STAGE[resident.stage]}</Field>
              <Field label="Balance"><span className={resident.balance > 0 ? 'font-medium text-red-700 dark:text-red-400' : undefined}>{formatCurrency(resident.balance)}</span></Field>
              <Field label="Email">{resident.email}</Field>
            </dl>
          )}
          {incoming && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Name">{incoming.name}</Field>
              <Field label="Move-in">{formatDate(incoming.leaseStart)}</Field>
              <Field label="Phone">{incoming.phone}</Field>
              <Field label="Source">{incoming.source}</Field>
            </dl>
          )}
        </Section>
      )}

      {service.length > 0 && (
        <Section title="Open service requests">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {service.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/work?task=${t.id}`} className="text-sm font-medium text-slate-900 hover:underline dark:text-slate-100">{t.title}</Link>
                <span className="flex items-center gap-2"><StatusPill {...TASK_STATUS[t.status]} /><span className="text-xs muted">{dueLabel(t.due)}</span></span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent activity">
        {history.length ? (
          <ul className="space-y-1.5 text-sm">
            {history.map((e) => (
              <li key={e.id} className="flex gap-2"><span className="w-28 shrink-0 text-xs muted">{formatDateTime(e.at)}</span><span className="text-slate-700 dark:text-slate-300">{e.actor}: {e.action}</span></li>
            ))}
          </ul>
        ) : <p className="text-sm muted">No changes yet.</p>}
      </Section>
    </DetailDrawer>
  );
}

/* ── Task drawer ──────────────────────────────────────────────────────────── */

export function TaskDrawer({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const l = useLookups();
  const { all } = useAlerts();
  const toast = useToast();
  const who = useWhoLabel();
  const task = taskId ? l.taskById.get(taskId) : undefined;
  const [form, setForm] = useState({ status: 'todo' as TaskStatus, owner: '', due: '', blockedReason: '', earliestStart: '', notes: '' });

  useEffect(() => {
    if (task) {
      setForm({
        status: task.status, owner: task.assigneeId ? `s:${task.assigneeId}` : task.vendorId ? `v:${task.vendorId}` : '',
        due: task.due, blockedReason: task.blockedReason ?? '', earliestStart: task.earliestStart ?? '', notes: task.notes ?? '',
      });
    }
  }, [task]);

  if (!task) return null;
  const unit = task.unitId ? l.unitById.get(task.unitId) : undefined;
  const alerts = all.filter((a) => a.record.id === task.id);
  const planLen = unit ? unitPlan(state.data.tasks, unit.id).length : 0;
  const staff = state.data.staff.filter((s) => s.propertyId === task.propertyId && s.role !== 'Leasing agent');
  const label = unit ? `${task.title} · Unit ${unit.number}` : task.title;

  const save = () => {
    const patch: Record<string, unknown> = {
      status: form.status,
      assigneeId: form.owner.startsWith('s:') ? form.owner.slice(2) : undefined,
      vendorId: form.owner.startsWith('v:') ? form.owner.slice(2) : undefined,
      due: form.due || task.due,
      blockedReason: form.status === 'blocked' ? form.blockedReason || 'No reason given' : undefined,
      earliestStart: form.status === 'blocked' ? form.earliestStart || undefined : task.earliestStart,
      notes: form.notes || undefined,
      completedDate: form.status === 'done' ? task.completedDate ?? TODAY : undefined,
    };
    const changes: FieldChange[] = [];
    if (form.status !== task.status) changes.push({ field: 'status', label: 'Status', from: task.status, to: form.status });
    const prevOwner = task.assigneeId ?? task.vendorId ?? null;
    const nextOwner = (patch.assigneeId ?? patch.vendorId ?? null) as string | null;
    if (prevOwner !== nextOwner) changes.push({ field: 'assigneeId', label: 'Assigned to', from: prevOwner, to: nextOwner });
    if (patch.due !== task.due) changes.push({ field: 'due', label: 'Due', from: task.due, to: patch.due as string });
    if (form.status === 'blocked' && form.blockedReason !== (task.blockedReason ?? '')) changes.push({ field: 'blockedReason', label: 'Blocked reason', from: task.blockedReason ?? null, to: form.blockedReason });
    if (!changes.length && (form.notes || '') === (task.notes ?? '')) { onClose(); return; }
    dispatch({
      type: 'updateRecord', collection: 'tasks', id: task.id, patch, action: changes.length ? `Updated ${task.title.toLowerCase()}` : 'Added a note',
      target: { collection: 'tasks', id: task.id, label }, propertyId: task.propertyId, changes,
    });
    toast('Saved');
    onClose();
  };

  return (
    <DetailDrawer open onClose={onClose} title={task.title}
      subtitle={<><span className="font-mono text-xs">{woNumber(task)}</span><StatusPill {...TASK_STATUS[task.status]} />{task.priority !== 'normal' && <StatusPill {...PRIORITY[task.priority]} dot={false} />}<span className={task.due < TODAY && task.status !== 'done' ? 'font-medium text-red-700 dark:text-red-400' : ''}>{task.status === 'done' ? `Done ${formatDate(task.completedDate)}` : dueLabel(task.due)}</span></>}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save changes</button></>}
    >
      <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Unit">{unit ? <Link className="text-accent-strong hover:underline" to={`/units?unit=${unit.id}`}>Unit {unit.number}</Link> : '—'}</Field>
        <Field label="Property">{l.propertyById.get(task.propertyId)?.name}</Field>
        <Field label="Type">{task.type === 'service' ? 'Service request' : `Make-ready · step ${task.sequence} of ${planLen}`}</Field>
        <Field label="Assigned to">{who(task) ?? <span className="text-amber-700 dark:text-amber-400">Unassigned</span>}</Field>
        <Field label="Planned">{formatDate(task.start)} – {formatDate(task.due)} ({task.durationDays} day{task.durationDays === 1 ? '' : 's'})</Field>
        <Field label="Created">{formatDate(task.createdDate)} · {{ elise: `by ${CONFIG.brand.assistantName}`, portal: 'resident portal', staff: 'by staff', make_ready: 'make-ready plan' }[task.source ?? 'staff']}</Field>
        {task.category && <Field label="Category">{task.category}</Field>}
      </dl>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/50">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div><p className="font-medium text-slate-900 dark:text-slate-100">{a.title}</p><p className="text-xs text-slate-600 dark:text-slate-400">{a.suggestedAction}</p></div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="t-status" className="label">Status</label>
          <select id="t-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
            {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="t-owner" className="label">Assigned to</label>
          <select id="t-owner" className="input" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
            <option value="">Unassigned</option>
            <optgroup label="Staff">{staff.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name} · {s.role}</option>)}</optgroup>
            <optgroup label="Vendors">{state.data.vendors.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.name}</option>)}</optgroup>
          </select>
        </div>
        <div>
          <label htmlFor="t-due" className="label">Due</label>
          <input id="t-due" type="date" className="input" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
        </div>
        {form.status === 'blocked' && (
          <div>
            <label htmlFor="t-unblock" className="label">Can continue on</label>
            <input id="t-unblock" type="date" className="input" value={form.earliestStart} onChange={(e) => setForm({ ...form, earliestStart: e.target.value })} />
          </div>
        )}
        {form.status === 'blocked' && (
          <div className="sm:col-span-2">
            <label htmlFor="t-reason" className="label">Blocked because</label>
            <input id="t-reason" className="input" value={form.blockedReason} onChange={(e) => setForm({ ...form, blockedReason: e.target.value })} placeholder="e.g. Waiting on part" />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="t-notes" className="label">Notes</label>
          <textarea id="t-notes" rows={3} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {task.photoCount ? <p className="mt-1 text-xs muted">{task.photoCount} photo{task.photoCount === 1 ? '' : 's'} attached from the field app</p> : null}
        </div>
      </div>
    </DetailDrawer>
  );
}
