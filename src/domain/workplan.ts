/**
 * Make-ready plan helpers built on the generic projection helper.
 * A unit's "plan" is its tasks that have a `sequence` number.
 */
import { daysBetween, maxDate } from './dates';
import { projectSchedule, type Projection } from './projection';
import type { ISODate, Task } from './types';

export function unitPlan(tasks: Task[], unitId: string): Task[] {
  return tasks.filter((t) => t.unitId === unitId && t.sequence !== undefined).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export interface PlanForecast {
  total: number;
  done: number;
  /** Projection of the remaining (not done) steps starting today. */
  projection: Projection;
  /** Day the unit is expected to be ready (first day after the last remaining step). */
  readyDate: ISODate;
  remaining: Task[];
}

/** Remaining duration for a step that is already in progress. */
export function remainingDays(t: Task, today: ISODate): number {
  if (t.status === 'in_progress') return Math.max(1, Math.min(t.durationDays, daysBetween(today, t.due) + 1));
  return t.durationDays;
}

export function forecastPlan(plan: Task[], today: ISODate): PlanForecast {
  const remaining = plan.filter((t) => t.status !== 'done');
  const projection = projectSchedule(
    remaining.map((t) => ({
      id: t.id,
      durationDays: remainingDays(t, today),
      // Future work waits for its planned start (e.g. move-out); blocked work waits for its unblock date.
      earliestStart: maxDate(t.earliestStart, t.status === 'todo' ? t.start : undefined, today),
    })),
    today,
  );
  const lastDone = plan.filter((t) => t.status === 'done').reduce<ISODate | undefined>((m, t) => maxDate(m, t.completedDate ?? t.due), undefined);
  return {
    total: plan.length,
    done: plan.length - remaining.length,
    projection,
    readyDate: remaining.length ? projection.readyDate : lastDone ?? today,
    remaining,
  };
}
