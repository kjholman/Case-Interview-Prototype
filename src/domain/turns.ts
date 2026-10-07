/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TURNS — the turn board model. One row per unit in turnover (on notice, vacant,
 *  pre-leased and not ready, or recently made ready), with each make-ready step,
 *  the projected ready date and a plain-language status.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { daysBetween, formatDate, formatWeekday } from './dates';
import { staleSteps, woNumber } from './lifecycle';
import type { Dataset, ISODate, Prospect, Task, TaskType, Unit } from './types';
import { forecastPlan, unitPlan, type PlanForecast } from './workplan';

/** Board columns, in order. A unit's plan may skip some (e.g. no flooring). */
export const TURN_STAGES: { type: TaskType; label: string; short: string }[] = [
  { type: 'inspection', label: 'Move-out inspection', short: 'Inspect' },
  { type: 'repair', label: 'Repairs', short: 'Repairs' },
  { type: 'paint', label: 'Paint', short: 'Paint' },
  { type: 'flooring', label: 'Carpet and flooring', short: 'Floors' },
  { type: 'clean', label: 'Clean', short: 'Clean' },
  { type: 'final_walk', label: 'Final walk', short: 'Final walk' },
];

export type TurnStatus = 'not_started' | 'on_track' | 'at_risk' | 'late' | 'blocked' | 'ready' | 'no_plan';

export const TURN_STATUS: Record<TurnStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'critical' }> = {
  late: { label: 'Late', tone: 'critical' },
  blocked: { label: 'Blocked', tone: 'danger' },
  at_risk: { label: 'At risk', tone: 'warning' },
  no_plan: { label: 'No plan', tone: 'danger' },
  on_track: { label: 'On track', tone: 'info' },
  not_started: { label: 'Not started', tone: 'neutral' },
  ready: { label: 'Ready', tone: 'success' },
};

export type StepState = 'done' | 'active' | 'todo' | 'late' | 'blocked' | 'unassigned';

export interface TurnRow {
  unit: Unit;
  plan: Task[];
  forecast?: PlanForecast;
  status: TurnStatus;
  /** Why it has this status, in plain language. */
  reasons: string[];
  /** Move-in date if pre-leased, otherwise the available date. */
  target?: ISODate;
  preleased: boolean;
  incoming?: Prospect;
  projectedReady?: ISODate;
  /** Positive = days after target; negative = days of slack. */
  daysLate: number;
  daysVacant: number;
  /** Total days from move-out to (projected) ready. */
  turnDays?: number;
  steps: Partial<Record<TaskType, Task>>;
  next?: Task;
  /** Steps whose dates are out of date (the plan needs re-scheduling). */
  staleCount: number;
}

export function stepState(t: Task, today: ISODate): StepState {
  if (t.status === 'done') return 'done';
  if (t.status === 'blocked') return 'blocked';
  if (t.due < today) return 'late';
  if (!t.assigneeId && !t.vendorId) return 'unassigned';
  return t.status === 'in_progress' ? 'active' : 'todo';
}

export function isTurning(u: Unit, data: Dataset, today: ISODate): boolean {
  if (u.status === 'notice' || u.status === 'vacant') return true;
  const plan = unitPlan(data.tasks, u.id);
  if (u.status === 'leased') return !plan.length || plan.some((t) => t.status !== 'done') || (u.availableDate ?? '') >= today;
  if (u.status === 'ready') return !!u.moveOutDate && daysBetween(u.moveOutDate, today) <= 30;
  return false;
}

export function computeTurns(data: Dataset, today: ISODate): TurnRow[] {
  const prospects = new Map(data.prospects.map((p) => [p.id, p]));
  return data.units.filter((u) => isTurning(u, data, today)).map((u) => {
    const plan = unitPlan(data.tasks, u.id);
    const forecast = plan.length ? forecastPlan(plan, today) : undefined;
    const steps: TurnRow['steps'] = {};
    for (const t of plan) steps[t.type] = t;
    const done = plan.length > 0 && plan.every((t) => t.status === 'done');
    const preleased = u.status === 'leased';
    const target = u.availableDate;
    const projectedReady = forecast?.readyDate;
    const daysLate = target && projectedReady && !done ? daysBetween(target, projectedReady) : 0;
    const daysVacant = u.moveOutDate && u.moveOutDate < today && u.status !== 'notice' ? daysBetween(u.moveOutDate, today) : 0;
    const lastDone = plan.filter((t) => t.completedDate).map((t) => t.completedDate!).sort().at(-1);
    const end = done ? lastDone : projectedReady;
    const turnDays = u.moveOutDate && end ? daysBetween(u.moveOutDate, end) : undefined;
    const next = plan.find((t) => t.status !== 'done');
    const stale = plan.length ? staleSteps(plan, today).length : 0;

    const reasons: string[] = [];
    let status: TurnStatus;
    if (u.status === 'ready' || done) status = 'ready';
    else if (!plan.length) { status = 'no_plan'; reasons.push('No make-ready plan scheduled'); }
    else {
      const blocked = plan.find((t) => t.status === 'blocked');
      const lateStep = plan.find((t) => t.status !== 'done' && t.status !== 'blocked' && t.due < today);
      const unassigned = plan.find((t) => t.status !== 'done' && !t.assigneeId && !t.vendorId);
      const unconfirmed = plan.find((t) => t.status === 'todo' && t.vendorId && t.vendorConfirmed === false && daysBetween(today, t.start) <= 3);
      if (daysLate > 0) reasons.push(`Projected ready ${formatDate(projectedReady)}, ${daysLate} day${daysLate === 1 ? '' : 's'} after ${preleased ? 'move-in' : 'target'}`);
      if (blocked) reasons.push(`${blocked.title} blocked: ${blocked.blockedReason ?? 'no reason given'}`);
      if (lateStep) reasons.push(`${lateStep.title} is ${daysBetween(lateStep.due, today)} day${daysBetween(lateStep.due, today) === 1 ? '' : 's'} late`);
      if (unassigned) reasons.push(`${unassigned.title} has no one assigned`);
      if (unconfirmed) reasons.push(`Vendor hasn't confirmed ${unconfirmed.title.toLowerCase()} on ${formatWeekday(unconfirmed.start)}`);
      if (stale) reasons.push(`${stale} step${stale === 1 ? '' : 's'} need rescheduling`);
      if (daysLate > 0) status = 'late';
      else if (blocked) status = 'blocked';
      else if (lateStep || unassigned || unconfirmed || stale || daysLate >= -1) status = 'at_risk';
      else if (u.status === 'notice' && plan.every((t) => t.status === 'todo')) status = 'not_started';
      else status = 'on_track';
    }
    return {
      unit: u, plan, forecast, status, reasons, target, preleased,
      incoming: u.incomingProspectId ? prospects.get(u.incomingProspectId) : undefined,
      projectedReady: done ? lastDone : projectedReady, daysLate, daysVacant, turnDays, steps, next, staleCount: stale,
    };
  });
}

export const STATUS_ORDER: Record<TurnStatus, number> = { late: 0, blocked: 1, no_plan: 2, at_risk: 3, on_track: 4, not_started: 5, ready: 6 };

/** "Paint · BrightCoat Painting · Thu, Oct 8" */
export function nextStepLabel(t: Task, who: string | undefined): string {
  return `${t.title} · ${who ?? 'Unassigned'} · ${t.status === 'in_progress' ? 'in progress' : formatWeekday(t.start)}`;
}

export { woNumber };
