import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { applyFix } from '../src/domain/automation';
import { addDays } from '../src/domain/dates';
import { processInbound, triage } from '../src/domain/elise';
import { createMakeReadyPlan, giveNotice, recordPayment, renewLease, signLease, STANDARD_MAKE_READY, syncUnitStatuses } from '../src/domain/lifecycle';
import { evaluateRules } from '../src/domain/rules';
import { createSeedData } from '../src/domain/seed';
import { unitPlan } from '../src/domain/workplan';

const TODAY = CONFIG.today;
const NOW = `${TODAY}T10:00`;

describe('triage', () => {
  it('routes maintenance by trade and priority', () => {
    expect(triage("My AC isn't cooling", 'resident')).toMatchObject({ topic: 'maintenance', category: 'HVAC', priority: 'high', emergency: false });
    expect(triage("The dishwasher won't drain", 'resident')).toMatchObject({ topic: 'maintenance', category: 'Appliance', priority: 'normal' });
  });
  it('flags emergencies as urgent and escalates', () => {
    const t = triage('Water is leaking from the ceiling — water everywhere!', 'resident');
    expect(t).toMatchObject({ topic: 'maintenance', emergency: true, priority: 'urgent' });
    expect(t.escalation).toMatch(/Emergency/);
  });
  it('does not open work orders for prospects', () => {
    expect(triage('Does the unit have AC?', 'prospect').topic).not.toBe('maintenance');
  });
  it('recognizes leasing and account topics', () => {
    expect(triage('Can I tour a 2 bedroom this week?', 'prospect').topic).toBe('tour');
    expect(triage('How much is rent for a 1 bedroom?', 'prospect').topic).toBe('pricing');
    expect(triage('Can I split my balance into two payments?', 'resident')).toMatchObject({ topic: 'payment', escalation: expect.stringMatching(/Payment arrangement/) });
    expect(triage("I'd like to renew, any flexibility on the increase?", 'resident').escalation).toMatch(/concession/);
    expect(triage("I'm moving out in December", 'resident').topic).toBe('move_out');
  });
});

describe('processInbound', () => {
  const data = createSeedData();
  const resident = data.residents.find((r) => r.stage === 'current')!;

  it('creates a work order linked to the conversation', () => {
    const res = processInbound(data, { contact: { kind: 'resident', id: resident.id }, channel: 'sms', text: 'My toilet is clogged' }, 1, TODAY, NOW);
    const conv = res.data.conversations.find((c) => c.id === res.conversationId)!;
    const task = res.data.tasks.find((t) => t.id === conv.relatedTaskId)!;
    expect(task).toMatchObject({ type: 'service', category: 'Plumbing', source: 'elise', unitId: resident.unitId, status: 'todo' });
    expect(task.assigneeId).toBeUndefined(); // automation (Level 2+) assigns it
    expect(conv.messages.at(-1)).toMatchObject({ from: 'contact', body: 'My toilet is clogged' });
    expect(res.actions[0].action).toMatch(/^Created work order WO-\d+/);
  });

  it('creates a guest card for a new lead and books the tour at Level 2', () => {
    const res = processInbound(data, { contact: { kind: 'new_lead', name: 'Test Lead', beds: 2, propertyId: data.properties[0].id }, channel: 'chat', text: 'Can I tour a 2 bedroom?' }, 2, TODAY, NOW);
    const p = res.data.prospects.find((x) => x.name === 'Test Lead')!;
    expect(p).toMatchObject({ stage: 'tour_scheduled', tourBookedBy: 'elise', source: 'Website chat' });
    expect(p.tourDate! > TODAY).toBe(true);
  });

  it('only offers tour times at Level 1', () => {
    const res = processInbound(data, { contact: { kind: 'new_lead', name: 'L1 Lead', beds: 1, propertyId: data.properties[0].id }, channel: 'sms', text: 'Can I tour this week?' }, 1, TODAY, NOW);
    expect(res.data.prospects.find((x) => x.name === 'L1 Lead')!.stage).toBe('inquiry');
  });
});

describe('lifecycle', () => {
  it('creates the standard make-ready plan with projected dates and resolves the no-plan alert', () => {
    const data = createSeedData();
    const unit = data.units.find((u) => u.status === 'vacant' && !unitPlan(data.tasks, u.id).length)!;
    const alert = evaluateRules(data).find((a) => a.id === `no-make-ready-plan:${unit.id}`)!;
    expect(alert.fix?.action).toBe('createMakeReadyPlan');
    const next = applyFix(data, alert.fix!);
    const plan = unitPlan(next.tasks, unit.id);
    expect(plan).toHaveLength(STANDARD_MAKE_READY.length);
    for (let i = 1; i < plan.length; i++) expect(plan[i].start > plan[i - 1].due).toBe(true);
    expect(evaluateRules(next).some((a) => a.id === alert.id)).toBe(false);
  });

  it('does not create a second plan', () => {
    const data = createSeedData();
    const unit = data.units.find((u) => unitPlan(data.tasks, u.id).length)!;
    expect(createMakeReadyPlan(data, unit.id, TODAY)).toBe(data);
  });

  it('signs a lease', () => {
    const data = createSeedData();
    const p = data.prospects.find((x) => x.stage === 'approved' || x.stage === 'applied')!;
    const unit = data.units.find((u) => u.status === 'ready' && u.propertyId === p.propertyId)!;
    const next = signLease(data, p.id, unit.id, addDays(TODAY, 5));
    expect(next.units.find((u) => u.id === unit.id)).toMatchObject({ status: 'leased', incomingProspectId: p.id, availableDate: addDays(TODAY, 5) });
    expect(next.prospects.find((x) => x.id === p.id)).toMatchObject({ stage: 'leased', leaseStart: addDays(TODAY, 5) });
  });

  it('records notice: unit on notice with a plan after move-out', () => {
    const data = createSeedData();
    const r = data.residents.find((x) => x.stage === 'current')!;
    const moveOut = addDays(TODAY, 30);
    const next = giveNotice(data, r.id, moveOut, TODAY);
    expect(next.units.find((u) => u.id === r.unitId)).toMatchObject({ status: 'notice', moveOutDate: moveOut });
    const plan = unitPlan(next.tasks, r.unitId);
    expect(plan[0].start).toBe(addDays(moveOut, 1));
  });

  it('renews a lease for 12 months', () => {
    const data = createSeedData();
    const r = data.residents.find((x) => x.stage === 'renewal_offered')!;
    const after = renewLease(data, r.id).residents.find((x) => x.id === r.id)!;
    expect(after.stage).toBe('renewed');
    expect(after.leaseEnd > addDays(r.leaseEnd, 360)).toBe(true);
  });

  it('posts payments to the ledger and keeps the balance in step', () => {
    const data = createSeedData();
    const r = data.residents.find((x) => x.balance > 500)!;
    const sum = (d: typeof data, id: string) => d.ledger.filter((e) => e.residentId === id).reduce((s, e) => s + e.amount, 0);
    expect(sum(data, r.id)).toBeCloseTo(r.balance, 2);
    const next = recordPayment(data, r.id, 200, TODAY);
    const after = next.residents.find((x) => x.id === r.id)!;
    expect(after.balance).toBeCloseTo(r.balance - 200, 2);
    expect(sum(next, r.id)).toBeCloseTo(after.balance, 2);
  });

  it('marks a vacant unit Ready when its make-ready plan is done', () => {
    const data = createSeedData();
    const unit = data.units.find((u) => u.status === 'vacant' && unitPlan(data.tasks, u.id).length)!;
    const done = { ...data, tasks: data.tasks.map((t) => (t.unitId === unit.id && t.sequence ? { ...t, status: 'done' as const } : t)) };
    expect(syncUnitStatuses(done).units.find((u) => u.id === unit.id)!.status).toBe('ready');
  });
});
