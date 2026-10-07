import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { applyFix } from '../src/domain/automation';
import { addDays } from '../src/domain/dates';
import { reschedulePlan, staleSteps } from '../src/domain/lifecycle';
import { evaluateRules } from '../src/domain/rules';
import { createSeedData } from '../src/domain/seed';
import { computeTurns, stepState } from '../src/domain/turns';
import { unitPlan } from '../src/domain/workplan';

const TODAY = CONFIG.today;

describe('turn board', () => {
  const data = createSeedData();
  const turns = computeTurns(data, TODAY);

  it('includes every unit on notice, vacant, or pre-leased and not ready', () => {
    const ids = new Set(turns.map((t) => t.unit.id));
    for (const u of data.units) if (u.status === 'notice' || u.status === 'vacant') expect(ids.has(u.id), u.number).toBe(true);
    expect(turns.some((t) => t.unit.status === 'occupied')).toBe(false);
  });

  it('marks a pre-leased unit that will miss move-in as late, with the reason', () => {
    const late = turns.filter((t) => t.preleased && t.status === 'late');
    expect(late.length).toBeGreaterThanOrEqual(3); // planted once per property
    expect(late[0].daysLate).toBeGreaterThan(0);
    expect(late[0].reasons[0]).toMatch(/after move-in/);
  });

  it('has every status represented', () => {
    const s = new Set(turns.map((t) => t.status));
    for (const x of ['late', 'blocked', 'at_risk', 'on_track', 'ready', 'no_plan']) expect(s.has(x as never), x).toBe(true);
  });

  it('describes step states', () => {
    const t = data.tasks.find((x) => x.status === 'blocked')!;
    expect(stepState(t, TODAY)).toBe('blocked');
    expect(stepState({ ...t, status: 'todo', assigneeId: undefined, vendorId: undefined, due: addDays(TODAY, 3) }, TODAY)).toBe('unassigned');
  });
});

describe('auto-reschedule', () => {
  it('finds stale plans in the seed and moves later steps after the slipped one', () => {
    const data = createSeedData();
    const alert = evaluateRules(data).find((a) => a.ruleId === 'turn-plan-stale')!;
    expect(alert.fix?.action).toBe('reschedulePlan');
    const before = unitPlan(data.tasks, alert.record.id);
    expect(staleSteps(before, TODAY).length).toBeGreaterThan(0);
    const next = applyFix(data, alert.fix!);
    const after = unitPlan(next.tasks, alert.record.id);
    expect(staleSteps(after, TODAY)).toHaveLength(0);
    for (const t of after.filter((x) => x.status === 'todo')) expect(t.start >= TODAY).toBe(true);
    // Started work is never moved.
    for (const t of before.filter((x) => x.status !== 'todo')) expect(after.find((x) => x.id === t.id)).toEqual(t);
  });

  it('asks vendors to re-confirm a moved visit', () => {
    const data = createSeedData();
    const unitId = evaluateRules(data).find((a) => a.ruleId === 'turn-plan-stale')!.record.id;
    const next = reschedulePlan(data, unitId, TODAY);
    const movedVendor = unitPlan(next.tasks, unitId).find((t) => t.vendorId && t.status === 'todo');
    if (movedVendor) expect(movedVendor.vendorConfirmed).toBe(false);
  });

  it('is a no-op when nothing slipped', () => {
    const data = createSeedData();
    const ok = data.units.find((u) => { const p = unitPlan(data.tasks, u.id); return p.length && !staleSteps(p, TODAY).length; })!;
    expect(reschedulePlan(data, ok.id, TODAY)).toBe(data);
  });
});
