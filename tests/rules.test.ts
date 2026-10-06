import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { applyFix, routeAlert } from '../src/domain/automation';
import { addDays } from '../src/domain/dates';
import { evaluateRules, RULES } from '../src/domain/rules';
import { createSeedData } from '../src/domain/seed';
import type { Alert, Dataset, Task, Unit } from '../src/domain/types';

const TODAY = CONFIG.today;
const d = (n: number) => addDays(TODAY, n);

/** Minimal dataset builder so each test states only what matters. */
function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    portfolio: { id: 'pf', name: 'Test', propertyIds: ['p1'] },
    properties: [{ id: 'p1', name: 'Test Property', city: 'X', state: 'TX', unitCount: 1, managerName: 'M' }],
    units: [],
    residents: [],
    prospects: [],
    staff: [
      { id: 's1', propertyId: 'p1', name: 'Busy Tech', role: 'Maintenance technician' },
      { id: 's2', propertyId: 'p1', name: 'Free Tech', role: 'Maintenance technician' },
    ],
    vendors: [],
    tasks: [],
    conversations: [],
    ledger: [],
    ...over,
  };
}
const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'u1', propertyId: 'p1', number: '101', floorplan: 'A1', beds: 1, baths: 1, sqft: 700, rent: 1500, status: 'occupied', ...over,
});
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', propertyId: 'p1', unitId: 'u1', type: 'service', title: 'Fix sink', status: 'todo', priority: 'normal',
  assigneeId: 's1', start: d(-3), due: d(-1), durationDays: 1, createdDate: d(-3), ...over,
});
const rulesOf = (alerts: Alert[]) => alerts.map((a) => a.ruleId);

describe('rules engine', () => {
  it('flags past-due assigned work with a plain-language title', () => {
    const alerts = evaluateRules(dataset({ units: [unit()], tasks: [task({ due: d(-3) })] }));
    const a = alerts.find((x) => x.ruleId === 'task-past-due')!;
    expect(a.title).toBe('Fix sink · Unit 101 is 3 days late');
    expect(a.severity).toBe('high');
    expect(a.id).toBe('task-past-due:t1');
  });

  it('does not flag work that is done or not yet due', () => {
    const alerts = evaluateRules(dataset({ units: [unit()], tasks: [task({ status: 'done' }), task({ id: 't2', due: d(2) })] }));
    expect(rulesOf(alerts)).not.toContain('task-past-due');
  });

  it('flags blocked work with its reason', () => {
    const alerts = evaluateRules(dataset({ units: [unit()], tasks: [task({ status: 'blocked', due: d(3), blockedReason: 'Waiting on part' })] }));
    expect(alerts.find((a) => a.ruleId === 'task-blocked')?.reason).toBe('Waiting on part');
  });

  it('proposes assigning unassigned work to the least-loaded technician', () => {
    const tasks = [
      task({ id: 'busy1', due: d(5) }),
      task({ id: 'busy2', due: d(5) }),
      task({ id: 'open', assigneeId: undefined, due: d(4) }),
    ];
    const a = evaluateRules(dataset({ units: [unit()], tasks })).find((x) => x.ruleId === 'task-unassigned')!;
    expect(a.fix?.risk).toBe('low');
    expect(a.fix?.changes[0]).toMatchObject({ field: 'assigneeId', to: 's2' });
  });

  it('detects a date mismatch between PMS and CRM', () => {
    const u = unit({ status: 'vacant', availableDate: d(5), crmAvailableDate: d(2) });
    const a = evaluateRules(dataset({ units: [u] })).find((x) => x.ruleId === 'date-mismatch')!;
    expect(a.severity).toBe('high'); // listing promises an earlier date than reality
    expect(a.fix?.changes[0]).toMatchObject({ field: 'crmAvailableDate', to: d(5) });
  });

  it('detects units that are ready early', () => {
    const u = unit({ status: 'ready', availableDate: d(4), crmAvailableDate: d(4) });
    const a = evaluateRules(dataset({ units: [u] })).find((x) => x.ruleId === 'ready-early')!;
    expect(a.title).toBe('Unit 101 is ready 4 days early');
  });

  it('projects make-ready work and flags a leased unit that will miss move-in as critical', () => {
    const u = unit({ status: 'leased', availableDate: d(2), crmAvailableDate: d(2), moveOutDate: d(-3) });
    const tasks = [
      task({ id: 'm1', type: 'inspection', title: 'Inspection', sequence: 1, status: 'done', start: d(-2), due: d(-2), completedDate: d(-2) }),
      task({ id: 'm2', type: 'paint', title: 'Paint', sequence: 2, status: 'blocked', start: d(0), due: d(1), durationDays: 2, earliestStart: d(3), blockedReason: 'Vendor out' }),
      task({ id: 'm3', type: 'clean', title: 'Clean', sequence: 3, status: 'todo', start: d(2), due: d(2) }),
    ];
    const a = evaluateRules(dataset({ units: [u], tasks })).find((x) => x.ruleId === 'makeready-late')!;
    expect(a.severity).toBe('critical');
    expect(a.reason).toContain('Paint is blocked');
    expect(a.fix).toBeUndefined(); // a person must decide
  });

  it('skips rules whose systems are disconnected', () => {
    const u = unit({ status: 'vacant', availableDate: d(5), crmAvailableDate: d(2) });
    const alerts = evaluateRules(dataset({ units: [u] }), { connected: { crm: false } });
    expect(rulesOf(alerts)).not.toContain('date-mismatch');
  });

  it('skips disabled rules', () => {
    const alerts = evaluateRules(dataset({ units: [unit()], tasks: [task()] }), { disabledRules: ['task-past-due'] });
    expect(rulesOf(alerts)).not.toContain('task-past-due');
  });

  it('sorts by severity, most severe first', () => {
    const alerts = evaluateRules(createSeedData());
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < alerts.length; i++) expect(order[alerts[i].severity]).toBeGreaterThanOrEqual(order[alerts[i - 1].severity]);
  });

  it('every fix resolves its own alert (otherwise automation would loop)', () => {
    let data = createSeedData();
    const withFix = evaluateRules(data).filter((a) => a.fix);
    expect(withFix.length).toBeGreaterThan(10);
    for (const a of withFix) data = applyFix(data, a.fix!);
    const remaining = new Set(evaluateRules(data).map((a) => a.id));
    for (const a of withFix) expect(remaining.has(a.id), a.id).toBe(false);
  });
});

describe('seed data', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(createSeedData())).toBe(JSON.stringify(createSeedData()));
  });

  it('has 3 properties and 150–250 units', () => {
    const data = createSeedData();
    expect(data.properties).toHaveLength(3);
    expect(data.units.length).toBeGreaterThanOrEqual(150);
    expect(data.units.length).toBeLessThanOrEqual(250);
  });

  it('gives every property at least one alert from every rule that has data to work with', () => {
    const data = createSeedData();
    const alerts = evaluateRules(data);
    for (const p of data.properties) {
      const ids = new Set(alerts.filter((a) => a.propertyId === p.id).map((a) => a.ruleId));
      for (const r of ['makeready-late', 'task-past-due', 'task-blocked', 'task-unassigned', 'date-mismatch', 'ready-early', 'no-make-ready-plan', 'tour-no-show', 'renewal-not-offered', 'delinquent-no-reminder', 'conversation-escalated']) {
        expect(ids.has(r), `${p.name} missing ${r}`).toBe(true);
      }
    }
    expect(RULES.length).toBe(11);
  });
});

describe('automation routing', () => {
  const base: Alert = {
    id: 'x', ruleId: 'r', ruleLabel: 'R', propertyId: 'p1', severity: 'medium', title: '', reason: '', impact: '', suggestedAction: '',
    record: { collection: 'units', id: 'u1', label: 'Unit 101' }, requires: [],
  };
  const fix = (risk: 'low' | 'high') => ({ label: '', risk, target: base.record, changes: [] });

  it('sends alerts without a fix to exceptions at every level', () => {
    for (const lvl of [1, 2, 3] as const) expect(routeAlert(base, lvl)).toBe('exception');
  });
  it('level 1: every fix needs approval', () => {
    expect(routeAlert({ ...base, fix: fix('low') }, 1)).toBe('approval');
    expect(routeAlert({ ...base, fix: fix('high') }, 1)).toBe('approval');
  });
  it('level 2: low-risk automatic, high-risk approval', () => {
    expect(routeAlert({ ...base, fix: fix('low') }, 2)).toBe('auto');
    expect(routeAlert({ ...base, fix: fix('high') }, 2)).toBe('approval');
  });
  it('level 3: automatic except high-risk fixes on severe alerts', () => {
    expect(routeAlert({ ...base, fix: fix('high') }, 3)).toBe('auto');
    expect(routeAlert({ ...base, severity: 'high', fix: fix('high') }, 3)).toBe('exception');
  });
});
