/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LIFECYCLE — the property-management workflows, as pure functions on the dataset.
 *  Each returns a NEW dataset; the store logs the change and re-runs the rules.
 *
 *    createMakeReadyPlan  unit turning over → standard plan scheduled with projectSchedule
 *    signLease            prospect + unit → lease signed, unit leased, incoming resident
 *    giveNotice           resident gives notice → unit on notice + make-ready plan
 *    renewLease           resident accepts renewal → lease extended
 *    recordPayment        payment posted to the ledger → balance updated
 *    syncUnitStatuses     vacant unit whose make-ready is done → Ready
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { addDays, maxDate } from './dates';
import { projectSchedule } from './projection';
import type { Dataset, ISODate, LedgerEntry, Task, TaskType } from './types';
import { forecastPlan, unitPlan } from './workplan';

/** Standard make-ready template used when a plan is created in the app. */
export const STANDARD_MAKE_READY: { type: TaskType; title: string; days: number; who: 'tech' | 'vendor' }[] = [
  { type: 'inspection', title: 'Move-out inspection', days: 1, who: 'tech' },
  { type: 'repair', title: 'Repairs', days: 2, who: 'tech' },
  { type: 'paint', title: 'Paint', days: 2, who: 'vendor' },
  { type: 'clean', title: 'Clean', days: 1, who: 'vendor' },
  { type: 'final_walk', title: 'Final walk', days: 1, who: 'tech' },
];

/** Work-order number shown to people, e.g. "WO-1042". */
export const woNumber = (t: Pick<Task, 'id'>) => `WO-${t.id.replace(/^t-/, '')}`;

/** Next free task id (t-NNNN). */
export function nextTaskId(data: Dataset, offset = 0): string {
  const max = data.tasks.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, '')) || 0), 1000);
  return `t-${max + 1 + offset}`;
}

/** Least-loaded technician at a property, by open tasks. */
export function leastLoadedTechId(data: Dataset, propertyId: string): string | undefined {
  const techs = data.staff.filter((s) => s.propertyId === propertyId && s.role === 'Maintenance technician');
  const load = (id: string) => data.tasks.filter((t) => t.assigneeId === id && t.status !== 'done').length;
  return [...techs].sort((a, b) => load(a.id) - load(b.id) || a.name.localeCompare(b.name))[0]?.id;
}

/** Creates the standard make-ready plan for a unit, starting the day after move-out (or today). */
export function createMakeReadyPlan(data: Dataset, unitId: string, today: ISODate): Dataset {
  const unit = data.units.find((u) => u.id === unitId);
  if (!unit || unitPlan(data.tasks, unitId).length) return data;
  const start = maxDate(today, unit.moveOutDate ? addDays(unit.moveOutDate, 1) : today);
  const projection = projectSchedule(STANDARD_MAKE_READY.map((s, i) => ({ id: String(i), durationDays: s.days })), start);
  const vendorFor = (type: TaskType) => data.vendors.find((v) => v.trade === type)?.id;
  const tech = leastLoadedTechId(data, unit.propertyId);
  const tasks: Task[] = STANDARD_MAKE_READY.map((s, i) => {
    const p = projection.steps[i];
    return {
      id: nextTaskId(data, i), propertyId: unit.propertyId, unitId, type: s.type, title: s.title,
      status: p.start <= today && today <= p.end ? 'in_progress' : 'todo',
      priority: unit.status === 'leased' ? 'high' : 'normal',
      sequence: i + 1, start: p.start, due: p.end, durationDays: s.days, createdDate: today, source: 'make_ready',
      ...(s.who === 'vendor' && vendorFor(s.type) ? { vendorId: vendorFor(s.type) } : tech ? { assigneeId: tech } : {}),
    };
  });
  return { ...data, tasks: [...data.tasks, ...tasks] };
}

/** Signs a lease: prospect → leased, unit → leased with the move-in as its available date. */
export function signLease(data: Dataset, prospectId: string, unitId: string, moveIn: ISODate, months = 12): Dataset {
  return {
    ...data,
    prospects: data.prospects.map((p) => (p.id === prospectId
      ? { ...p, stage: 'leased', interestedUnitId: unitId, leaseStart: moveIn, leaseEnd: addDays(moveIn, Math.round(months * 30.4) - 1) }
      : p)),
    units: data.units.map((u) => (u.id === unitId
      ? { ...u, status: 'leased', incomingProspectId: prospectId, availableDate: moveIn, crmAvailableDate: moveIn }
      : u)),
  };
}

/** Resident gives notice: unit goes on notice and gets a make-ready plan after move-out. */
export function giveNotice(data: Dataset, residentId: string, moveOut: ISODate, today: ISODate): Dataset {
  const r = data.residents.find((x) => x.id === residentId);
  if (!r) return data;
  const available = addDays(moveOut, 10);
  const next: Dataset = {
    ...data,
    residents: data.residents.map((x) => (x.id === residentId ? { ...x, stage: 'notice_given', leaseEnd: moveOut } : x)),
    units: data.units.map((u) => (u.id === r.unitId ? { ...u, status: 'notice', moveOutDate: moveOut, availableDate: available, crmAvailableDate: available } : u)),
  };
  return createMakeReadyPlan(next, r.unitId, today);
}

/** Resident accepts the renewal: lease extended from the current end date. */
export function renewLease(data: Dataset, residentId: string, months = 12): Dataset {
  return {
    ...data,
    residents: data.residents.map((r) => (r.id === residentId
      ? { ...r, stage: 'renewed', leaseStart: addDays(r.leaseEnd, 1), leaseEnd: addDays(r.leaseEnd, Math.round(months * 30.4)) }
      : r)),
  };
}

/** Posts a payment to the resident ledger and updates the balance. */
export function recordPayment(data: Dataset, residentId: string, amount: number, date: ISODate, method = 'Online payment'): Dataset {
  const r = data.residents.find((x) => x.id === residentId);
  if (!r || amount <= 0) return data;
  const entry: LedgerEntry = {
    id: `l-${residentId}-${data.ledger.length + 1}`, residentId, propertyId: r.propertyId, date, type: 'payment',
    description: method, amount: -Math.round(amount * 100) / 100,
  };
  const balance = Math.max(0, Math.round((r.balance - amount) * 100) / 100);
  return {
    ...data,
    ledger: [...data.ledger, entry],
    residents: data.residents.map((x) => (x.id === residentId ? { ...x, balance, balanceDueDate: balance > 0 ? x.balanceDueDate : undefined } : x)),
  };
}

/** Vacant units whose make-ready plan is complete become Ready. */
export function syncUnitStatuses(data: Dataset): Dataset {
  let changed = false;
  const units = data.units.map((u) => {
    if (u.status !== 'vacant') return u;
    const plan = unitPlan(data.tasks, u.id);
    if (plan.length && plan.every((t) => t.status === 'done')) {
      changed = true;
      return { ...u, status: 'ready' as const };
    }
    return u;
  });
  return changed ? { ...data, units } : data;
}

/**
 * Re-plans a turn after a slip: every step that hasn't started moves to the date the projection
 * says it can actually happen (after late or blocked work ahead of it). Started work is untouched.
 */
export function reschedulePlan(data: Dataset, unitId: string, today: ISODate): Dataset {
  const plan = unitPlan(data.tasks, unitId);
  const f = forecastPlan(plan, today);
  const moved = new Map<string, { start: ISODate; due: ISODate }>();
  for (const s of f.projection.steps) {
    const t = plan.find((x) => x.id === s.id);
    if (t && t.status === 'todo' && (t.start !== s.start || t.due !== s.end)) moved.set(t.id, { start: s.start, due: s.end });
  }
  if (!moved.size) return data;
  // A vendor visit that moves needs re-confirming.
  return {
    ...data,
    tasks: data.tasks.map((t) => (moved.has(t.id) ? { ...t, ...moved.get(t.id)!, ...(t.vendorId ? { vendorConfirmed: false } : {}) } : t)),
  };
}

/** Steps of a plan whose planned dates no longer match what can actually happen. */
export function staleSteps(plan: Task[], today: ISODate) {
  const f = forecastPlan(plan, today);
  return f.projection.steps
    .map((s) => ({ s, t: plan.find((x) => x.id === s.id)! }))
    .filter(({ s, t }) => t.status === 'todo' && (s.start !== t.start || s.end !== t.due))
    .map(({ s, t }) => ({ task: t, start: s.start, end: s.end }));
}
