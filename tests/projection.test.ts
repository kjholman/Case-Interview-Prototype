import { describe, expect, it } from 'vitest';
import { projectSchedule } from '../src/domain/projection';

describe('projectSchedule', () => {
  it('chains ordered steps back to back', () => {
    const p = projectSchedule(
      [
        { id: 'a', durationDays: 1 },
        { id: 'b', durationDays: 2 },
        { id: 'c', durationDays: 1 },
      ],
      '2026-10-06',
    );
    expect(p.steps).toEqual([
      { id: 'a', start: '2026-10-06', end: '2026-10-06', waitDays: 0 },
      { id: 'b', start: '2026-10-07', end: '2026-10-08', waitDays: 0 },
      { id: 'c', start: '2026-10-09', end: '2026-10-09', waitDays: 0 },
    ]);
    expect(p.end).toBe('2026-10-09');
    expect(p.readyDate).toBe('2026-10-10');
  });

  it('respects earliest-start constraints and reports the wait', () => {
    const p = projectSchedule(
      [
        { id: 'inspect', durationDays: 1 },
        { id: 'paint', durationDays: 2, earliestStart: '2026-10-10' },
        { id: 'clean', durationDays: 1 },
      ],
      '2026-10-06',
    );
    expect(p.steps[1]).toMatchObject({ start: '2026-10-10', end: '2026-10-11', waitDays: 3 });
    expect(p.steps[2].start).toBe('2026-10-12');
    expect(p.readyDate).toBe('2026-10-13');
  });

  it('ignores earliest-start dates that are already in the past', () => {
    const p = projectSchedule([{ id: 'a', durationDays: 2, earliestStart: '2026-09-01' }], '2026-10-06');
    expect(p.steps[0]).toMatchObject({ start: '2026-10-06', end: '2026-10-07', waitDays: 0 });
  });

  it('supports explicit dependencies (parallel work)', () => {
    const p = projectSchedule(
      [
        { id: 'a', durationDays: 3 },
        { id: 'b', durationDays: 1, dependsOn: [] },
        { id: 'c', durationDays: 1, dependsOn: ['a', 'b'] },
      ],
      '2026-10-06',
    );
    expect(p.steps.find((s) => s.id === 'b')).toMatchObject({ start: '2026-10-06', end: '2026-10-06' });
    expect(p.steps.find((s) => s.id === 'c')).toMatchObject({ start: '2026-10-09' });
    expect(p.end).toBe('2026-10-09');
  });

  it('treats zero-duration steps as milestones', () => {
    const p = projectSchedule(
      [
        { id: 'work', durationDays: 2 },
        { id: 'sign-off', durationDays: 0 },
      ],
      '2026-10-06',
    );
    expect(p.steps[1]).toMatchObject({ start: '2026-10-08', end: '2026-10-08' });
    expect(p.readyDate).toBe('2026-10-08');
  });

  it('can skip weekends', () => {
    // 2026-10-09 is a Friday.
    const p = projectSchedule(
      [
        { id: 'a', durationDays: 2 },
        { id: 'b', durationDays: 1 },
      ],
      '2026-10-09',
      { skipWeekends: true },
    );
    expect(p.steps[0]).toMatchObject({ start: '2026-10-09', end: '2026-10-12' });
    expect(p.steps[1]).toMatchObject({ start: '2026-10-13', end: '2026-10-13' });
  });

  it('returns the start date when there is nothing left to do', () => {
    const p = projectSchedule([], '2026-10-06');
    expect(p).toEqual({ steps: [], end: '2026-10-06', readyDate: '2026-10-06' });
  });

  it('throws on a dependency that does not exist yet', () => {
    expect(() => projectSchedule([{ id: 'a', durationDays: 1, dependsOn: ['zzz'] }], '2026-10-06')).toThrow(/unknown/);
  });
});
