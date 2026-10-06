/**
 * Projection helper — reusable for any "ordered steps with durations" problem
 * (make-ready, onboarding, renewal outreach cadence, collections steps …).
 *
 * Convention:
 *  - A step occupies `durationDays` days starting on `start`; `end` is its LAST working day.
 *  - The next step starts the day after the previous one ends (or after all of `dependsOn`).
 *  - A step never starts before `earliestStart` (a part arriving, a move-out, a vendor slot).
 *  - durationDays = 0 is a milestone: it starts and ends on the same day without consuming time.
 *  - With `skipWeekends`, steps start and run on Mon–Fri only.
 */
import { addBusinessDays, addDays, daysBetween, maxDate } from './dates';
import type { ISODate } from './types';

export interface ProjectionStep {
  id: string;
  durationDays: number;
  earliestStart?: ISODate;
  /** Ids of steps that must finish first. Omit to depend on the previous step in the list. */
  dependsOn?: string[];
}

export interface ProjectedStep {
  id: string;
  start: ISODate;
  end: ISODate;
  /** Days the step was pushed later by earliestStart (waiting time). */
  waitDays: number;
}

export interface Projection {
  steps: ProjectedStep[];
  /** Last day of work across all steps (= startDate when there are no steps). */
  end: ISODate;
  /** First day after all work is done — e.g. "unit ready on". */
  readyDate: ISODate;
}

export interface ProjectionOptions {
  skipWeekends?: boolean;
}

export function projectSchedule(steps: ProjectionStep[], startDate: ISODate, opts: ProjectionOptions = {}): Projection {
  const add = (d: ISODate, n: number) => (opts.skipWeekends ? addBusinessDays(d, n) : addDays(d, n));
  const roll = (d: ISODate) => (opts.skipWeekends ? addBusinessDays(d, 0) : d);

  // nextFree = first day a successor may start (end + 1, or the same day for a milestone).
  const nextFree = new Map<string, ISODate>();
  const out: ProjectedStep[] = [];
  let prevId: string | undefined;
  let readyDate = startDate;

  for (const step of steps) {
    const deps = step.dependsOn ?? (prevId ? [prevId] : []);
    let ready = startDate;
    for (const id of deps) {
      const free = nextFree.get(id);
      if (!free) throw new Error(`projectSchedule: step "${step.id}" depends on unknown or later step "${id}"`);
      ready = maxDate(ready, free);
    }
    const unconstrained = roll(ready);
    const start = roll(maxDate(ready, step.earliestStart));
    const isMilestone = step.durationDays <= 0;
    const end = isMilestone ? start : add(start, step.durationDays - 1);
    const free = isMilestone ? start : add(end, 1);

    out.push({ id: step.id, start, end, waitDays: daysBetween(unconstrained, start) });
    nextFree.set(step.id, free);
    readyDate = maxDate(readyDate, free);
    prevId = step.id;
  }

  const end = out.length ? out.reduce((m, s) => (s.end > m ? s.end : m), out[0].end) : startDate;
  return { steps: out, end, readyDate };
}
