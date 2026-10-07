/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  RULES ENGINE — pure functions that turn data into Alerts (exceptions).
 *
 *  Add a rule: append an object to RULES. Each rule:
 *    - declares which systems it needs (`requires`) — it is skipped if one is disconnected
 *    - returns zero or more alerts from `evaluate(ctx)`
 *    - optionally attaches a `fix` (a concrete field change). Fixes are what the
 *      automation level can apply automatically or send for approval.
 *  A fix MUST make its own rule stop firing, otherwise automation would loop
 *  (tests/rules.test.ts checks this for every rule).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CONFIG, type IntegrationId } from '../config';
import { addDays, daysBetween, dueLabel, formatDate } from './dates';
import { formatCurrency } from './impact';
import type { Alert, Dataset, ISODate, Prospect, Resident, Severity, StaffMember, Task, Unit } from './types';
import { STANDARD_MAKE_READY, staleSteps } from './lifecycle';
import { forecastPlan, unitPlan } from './workplan';

/* ── Context and indexes ──────────────────────────────────────────────────── */

export interface RuleContext {
  data: Dataset;
  today: ISODate;
  unitById: Map<string, Unit>;
  staffById: Map<string, StaffMember>;
  residentById: Map<string, Resident>;
  prospectById: Map<string, Prospect>;
  tasksByUnit: Map<string, Task[]>;
}

export function buildContext(data: Dataset, today: ISODate = CONFIG.today): RuleContext {
  const tasksByUnit = new Map<string, Task[]>();
  for (const t of data.tasks) {
    if (!t.unitId) continue;
    tasksByUnit.set(t.unitId, [...(tasksByUnit.get(t.unitId) ?? []), t]);
  }
  return {
    data,
    today,
    unitById: new Map(data.units.map((u) => [u.id, u])),
    staffById: new Map(data.staff.map((s) => [s.id, s])),
    residentById: new Map(data.residents.map((r) => [r.id, r])),
    prospectById: new Map(data.prospects.map((p) => [p.id, p])),
    tasksByUnit,
  };
}

export type AlertDraft = Omit<Alert, 'id' | 'ruleId' | 'ruleLabel' | 'requires'>;

export interface Rule {
  id: string;
  label: string;
  description: string;
  requires: IntegrationId[];
  evaluate(ctx: RuleContext): AlertDraft[];
}

/* ── Helpers used by several rules ────────────────────────────────────────── */

const dailyRent = (u: Unit) => (u.rent * 12) / 365;
export const unitLabel = (u: Unit) => `Unit ${u.number}`;
export const taskLabel = (t: Task, ctx: RuleContext) => {
  const u = t.unitId ? ctx.unitById.get(t.unitId) : undefined;
  return u ? `${t.title} · Unit ${u.number}` : t.title;
};
const whoLabel = (t: Task, ctx: RuleContext) =>
  t.assigneeId ? ctx.staffById.get(t.assigneeId)?.name ?? 'assignee' : t.vendorId ? ctx.data.vendors.find((v) => v.id === t.vendorId)?.name ?? 'vendor' : 'Unassigned';
const techOptions = (propertyId: string, ctx: RuleContext) =>
  ctx.data.staff.filter((s) => s.propertyId === propertyId && (s.role === 'Maintenance technician' || s.role === 'Porter')).map((s) => ({ value: s.id, label: s.name }));

/** Least-loaded technician at a property (open tasks count). */
export function leastLoadedTech(propertyId: string, ctx: RuleContext): StaffMember | undefined {
  const techs = ctx.data.staff.filter((s) => s.propertyId === propertyId && s.role === 'Maintenance technician');
  const load = (id: string) => ctx.data.tasks.filter((t) => t.assigneeId === id && t.status !== 'done').length;
  return [...techs].sort((a, b) => load(a.id) - load(b.id) || a.name.localeCompare(b.name))[0];
}

/* ── The rules ────────────────────────────────────────────────────────────── */

export const RULES: Rule[] = [
  {
    id: 'makeready-late',
    label: 'Make-ready will miss the available date',
    description: 'Projects the remaining make-ready steps from today and compares the finish with the available or move-in date.',
    requires: ['pms', 'workOrders'],
    evaluate(ctx) {
      const out: AlertDraft[] = [];
      for (const u of ctx.data.units) {
        if (!u.availableDate || u.status === 'occupied' || u.status === 'ready') continue;
        const plan = unitPlan(ctx.tasksByUnit.get(u.id) ?? [], u.id);
        if (!plan.length) continue;
        const f = forecastPlan(plan, ctx.today);
        if (f.readyDate <= u.availableDate) continue;
        const late = daysBetween(u.availableDate, f.readyDate);
        const blocked = plan.find((t) => t.status === 'blocked');
        const overdue = plan.find((t) => t.status !== 'done' && t.due < ctx.today);
        const cause = blocked ? `${blocked.title} is blocked (${blocked.blockedReason})` : overdue ? `${overdue.title} is ${dueLabel(overdue.due, ctx.today)}` : 'remaining work does not fit';
        const ref = { collection: 'units' as const, id: u.id, label: unitLabel(u) };
        if (u.status === 'leased') {
          const incoming = u.incomingProspectId ? ctx.prospectById.get(u.incomingProspectId) : undefined;
          out.push({
            propertyId: u.propertyId, severity: 'critical', record: ref,
            title: `${unitLabel(u)} won't be ready for move-in`,
            reason: `Projected ready ${formatDate(f.readyDate)}, move-in ${formatDate(u.availableDate)} (${late} day${late === 1 ? '' : 's'} short). ${cause[0].toUpperCase()}${cause.slice(1)}.`,
            impact: `${incoming?.name ?? 'The incoming resident'} cannot move in on time. Likely concession or hotel cost and a poor first impression.`,
            suggestedAction: blocked ? `Expedite or replace the vendor for ${blocked.title.toLowerCase()}, then confirm the date with the resident.` : 'Add a technician to the remaining steps and confirm the date with the resident.',
          });
        } else {
          out.push({
            propertyId: u.propertyId, severity: u.status === 'vacant' ? 'high' : 'medium', record: ref,
            title: `${unitLabel(u)} make-ready is ${late} day${late === 1 ? '' : 's'} behind`,
            reason: `Projected ready ${formatDate(f.readyDate)}, but listed as available ${formatDate(u.availableDate)}. ${cause[0].toUpperCase()}${cause.slice(1)}.`,
            impact: `About ${formatCurrency(dailyRent(u) * late)} of vacancy, and prospects may book a date we can't meet.`,
            suggestedAction: `Move the available date to ${formatDate(f.readyDate)} in both systems, or add labor.`,
            fix: {
              label: `Move available date to ${formatDate(f.readyDate)}`,
              risk: 'high',
              target: ref,
              changes: [
                { field: 'availableDate', label: 'Available date (PMS)', from: u.availableDate, to: f.readyDate },
                { field: 'crmAvailableDate', label: 'Listed date (CRM)', from: u.crmAvailableDate ?? null, to: f.readyDate },
              ],
            },
          });
        }
      }
      return out;
    },
  },
  {
    id: 'task-past-due',
    label: 'Past due work',
    description: 'Open, assigned work past its due date.',
    requires: ['workOrders'],
    evaluate(ctx) {
      return ctx.data.tasks
        .filter((t) => (t.status === 'todo' || t.status === 'in_progress') && t.due < ctx.today && (t.assigneeId || t.vendorId))
        .map((t) => {
          const late = daysBetween(t.due, ctx.today);
          const severity: Severity = t.priority === 'urgent' ? 'critical' : late >= 3 || t.priority === 'high' ? 'high' : 'medium';
          return {
            propertyId: t.propertyId, severity,
            record: { collection: 'tasks' as const, id: t.id, label: taskLabel(t, ctx) },
            title: `${taskLabel(t, ctx)} is ${dueLabel(t.due, ctx.today)}`,
            reason: `Due ${formatDate(t.due)}, still ${t.status === 'todo' ? 'not started' : 'in progress'}. Assigned to ${whoLabel(t, ctx)}.`,
            impact: t.type === 'service' ? `Resident is waiting${t.priority === 'urgent' ? ' on an urgent issue' : ''}; repeat calls and lower satisfaction.` : 'Pushes every later make-ready step and the ready date.',
            suggestedAction: `Get a new time from ${whoLabel(t, ctx)} or reassign.`,
          };
        });
    },
  },
  {
    id: 'task-blocked',
    label: 'Blocked work',
    description: 'Work marked blocked, with the reason.',
    requires: ['workOrders'],
    evaluate(ctx) {
      return ctx.data.tasks
        .filter((t) => t.status === 'blocked')
        .map((t) => {
          const u = t.unitId ? ctx.unitById.get(t.unitId) : undefined;
          const soon = u?.availableDate && daysBetween(ctx.today, u.availableDate) <= 5;
          return {
            propertyId: t.propertyId,
            severity: (t.priority === 'urgent' || (soon && u?.status !== 'occupied') ? 'high' : 'medium') as Severity,
            record: { collection: 'tasks' as const, id: t.id, label: taskLabel(t, ctx) },
            title: `${taskLabel(t, ctx)} is blocked`,
            reason: t.blockedReason ?? 'No reason given.',
            impact: t.earliestStart ? `Can't continue before ${formatDate(t.earliestStart)}.` : 'No date for when it can continue.',
            suggestedAction: t.earliestStart ? `Confirm the ${formatDate(t.earliestStart)} date or find another way to unblock.` : 'Find out what is needed to unblock it.',
          };
        });
    },
  },
  {
    id: 'task-unassigned',
    label: 'Unassigned work',
    description: 'Open work with no staff member or vendor.',
    requires: ['workOrders'],
    evaluate(ctx) {
      const out: AlertDraft[] = [];
      for (const t of ctx.data.tasks) {
        if (t.status === 'done' || t.assigneeId || t.vendorId) continue;
        const tech = leastLoadedTech(t.propertyId, ctx);
        const ref = { collection: 'tasks' as const, id: t.id, label: taskLabel(t, ctx) };
        out.push({
          propertyId: t.propertyId,
          severity: t.priority === 'urgent' || daysBetween(ctx.today, t.due) <= 1 ? 'high' : 'medium',
          record: ref,
          title: `${taskLabel(t, ctx)} has no one assigned`,
          reason: `${dueLabel(t.due, ctx.today)} and nobody owns it.`,
          impact: 'Nobody will show up; the due date will slip.',
          suggestedAction: tech ? `Assign to ${tech.name} (lightest workload).` : 'Assign someone.',
          fix: tech && {
            label: `Assign to ${tech.name}`,
            risk: 'low',
            target: ref,
            changes: [{ field: 'assigneeId', label: 'Assigned to', from: null, to: tech.id, options: techOptions(t.propertyId, ctx) }],
          },
        });
      }
      return out;
    },
  },
  {
    id: 'date-mismatch',
    label: 'Date mismatch between systems',
    description: 'The CRM listing shows a different available date than the PMS.',
    requires: ['pms', 'crm'],
    evaluate(ctx) {
      return ctx.data.units
        .filter((u) => u.availableDate && u.crmAvailableDate && u.availableDate !== u.crmAvailableDate)
        .map((u) => {
          const early = u.crmAvailableDate! < u.availableDate!;
          const ref = { collection: 'units' as const, id: u.id, label: unitLabel(u) };
          return {
            propertyId: u.propertyId, severity: (early ? 'high' : 'medium') as Severity, record: ref,
            title: `${unitLabel(u)} dates don't match`,
            reason: `PMS says available ${formatDate(u.availableDate)}; the listing says ${formatDate(u.crmAvailableDate)}.`,
            impact: early ? 'Prospects can book a move-in before the unit is ready.' : `Listing hides ${daysBetween(u.availableDate!, u.crmAvailableDate!)} days of availability (~${formatCurrency(dailyRent(u) * daysBetween(u.availableDate!, u.crmAvailableDate!))}).`,
            suggestedAction: 'Update the listing to match the PMS.',
            fix: {
              label: `Set listing date to ${formatDate(u.availableDate)}`,
              risk: 'low',
              target: ref,
              changes: [{ field: 'crmAvailableDate', label: 'Listed date (CRM)', from: u.crmAvailableDate!, to: u.availableDate! }],
            },
          };
        });
    },
  },
  {
    id: 'ready-early',
    label: 'Ready early',
    description: 'Unit is ready before its available date — it could be leased sooner.',
    requires: ['pms'],
    evaluate(ctx) {
      return ctx.data.units
        .filter((u) => u.status === 'ready' && u.availableDate && u.availableDate > ctx.today)
        .map((u) => {
          const days = daysBetween(ctx.today, u.availableDate!);
          const ref = { collection: 'units' as const, id: u.id, label: unitLabel(u) };
          return {
            propertyId: u.propertyId, severity: 'low' as Severity, record: ref,
            title: `${unitLabel(u)} is ready ${days} day${days === 1 ? '' : 's'} early`,
            reason: `All make-ready work is done, but it is listed as available ${formatDate(u.availableDate)}.`,
            impact: `Up to ${days} extra days to lease (~${formatCurrency(dailyRent(u) * days)}).`,
            suggestedAction: 'Make it available today in both systems.',
            fix: {
              label: 'Make available today',
              risk: 'high',
              target: ref,
              changes: [
                { field: 'availableDate', label: 'Available date (PMS)', from: u.availableDate!, to: ctx.today },
                { field: 'crmAvailableDate', label: 'Listed date (CRM)', from: u.crmAvailableDate ?? null, to: ctx.today },
              ],
            },
          };
        });
    },
  },
  {
    id: 'no-make-ready-plan',
    label: 'No make-ready plan',
    description: 'A unit that is turning over has no make-ready tasks.',
    requires: ['pms', 'workOrders'],
    evaluate(ctx) {
      return ctx.data.units
        .filter((u) => (u.status === 'vacant' || u.status === 'notice' || u.status === 'leased') && !unitPlan(ctx.tasksByUnit.get(u.id) ?? [], u.id).length)
        .map((u) => {
          const ref = { collection: 'units' as const, id: u.id, label: unitLabel(u) };
          const start = u.moveOutDate && addDays(u.moveOutDate, 1) > ctx.today ? addDays(u.moveOutDate, 1) : ctx.today;
          const days = STANDARD_MAKE_READY.reduce((s, x) => s + x.days, 0);
          return {
            propertyId: u.propertyId, severity: (u.status === 'notice' ? 'medium' : 'high') as Severity, record: ref,
            title: `${unitLabel(u)} has no make-ready plan`,
            reason: `${u.status === 'notice' ? 'Moving out' : 'Moved out'} ${formatDate(u.moveOutDate)}, available ${formatDate(u.availableDate)}, but no work is scheduled.`,
            impact: 'The available date is a guess until work is scheduled.',
            suggestedAction: 'Create the standard make-ready plan and assign it.',
            fix: {
              label: 'Create standard make-ready plan',
              risk: 'low' as const,
              target: ref,
              action: 'createMakeReadyPlan' as const,
              changes: [{
                field: 'makeReadyPlan', label: 'Make-ready plan', from: 'None', readOnly: true,
                to: `${STANDARD_MAKE_READY.length} steps, ${formatDate(start)}–${formatDate(addDays(start, days - 1))}`,
              }],
            },
          };
        });
    },
  },
  {
    id: 'turn-plan-stale',
    label: 'Turn schedule out of date',
    description: 'A step slipped or is blocked, so later steps can no longer happen on their planned dates.',
    requires: ['workOrders'],
    evaluate(ctx) {
      const out: AlertDraft[] = [];
      for (const u of ctx.data.units) {
        const plan = unitPlan(ctx.tasksByUnit.get(u.id) ?? [], u.id);
        if (!plan.length) continue;
        const stale = staleSteps(plan, ctx.today);
        if (!stale.length) continue;
        const f = forecastPlan(plan, ctx.today);
        const cause = plan.find((t) => t.status === 'blocked') ?? plan.find((t) => t.status !== 'done' && t.due < ctx.today);
        const ref = { collection: 'units' as const, id: u.id, label: unitLabel(u) };
        out.push({
          propertyId: u.propertyId, severity: 'medium', record: ref,
          title: `${unitLabel(u)} turn schedule needs updating`,
          reason: `${cause ? `${cause.title} ${cause.status === 'blocked' ? 'is blocked' : 'ran late'}, so ` : ''}${stale.length} later step${stale.length === 1 ? ' is' : 's are'} scheduled earlier than ${stale.length === 1 ? 'it' : 'they'} can happen.`,
          impact: 'Crews and vendors show up to a unit that isn\'t ready for them; the board shows a date nobody can hit.',
          suggestedAction: `Move the remaining steps; projected ready ${formatDate(f.readyDate)}.`,
          fix: {
            label: `Reschedule ${stale.length} step${stale.length === 1 ? '' : 's'} and notify crews`,
            risk: 'low',
            target: ref,
            action: 'reschedulePlan',
            changes: stale.map((s) => ({
              field: s.task.id, label: s.task.title, readOnly: true,
              from: `${formatDate(s.task.start)}–${formatDate(s.task.due)}`, to: `${formatDate(s.start)}–${formatDate(s.end)}`,
            })),
          },
        });
      }
      return out;
    },
  },
  {
    id: 'vendor-unconfirmed',
    label: 'Vendor visit not confirmed',
    description: 'A vendor is scheduled in the next 3 days and has not confirmed.',
    requires: ['workOrders'],
    evaluate(ctx) {
      return ctx.data.tasks
        .filter((t) => t.status === 'todo' && t.vendorId && t.vendorConfirmed === false && daysBetween(ctx.today, t.start) <= 3)
        .map((t) => {
          const vendor = ctx.data.vendors.find((v) => v.id === t.vendorId)?.name ?? 'Vendor';
          const ref = { collection: 'tasks' as const, id: t.id, label: taskLabel(t, ctx) };
          return {
            propertyId: t.propertyId, severity: (daysBetween(ctx.today, t.start) <= 1 ? 'high' : 'medium') as Severity, record: ref,
            title: `${vendor} hasn't confirmed ${taskLabel(t, ctx)}`,
            reason: `Scheduled ${formatDate(t.start)}${t.durationDays > 1 ? `–${formatDate(t.due)}` : ''}; no confirmation yet.`,
            impact: 'An unconfirmed vendor is the most common reason a turn slips a day.',
            suggestedAction: `Text ${vendor} to confirm, and find a backup if they can't make it.`,
            fix: {
              label: `Text ${vendor} to confirm ${formatDate(t.start)}`,
              risk: 'low',
              target: ref,
              changes: [{ field: 'vendorConfirmed', label: 'Vendor confirmed', from: false, to: true, readOnly: true }],
            },
          };
        });
    },
  },
  {
    id: 'tour-no-show',
    label: 'Tour no-show',
    description: 'A scheduled tour date passed and nobody followed up.',
    requires: ['crm'],
    evaluate(ctx) {
      return ctx.data.prospects
        .filter((p) => p.stage === 'tour_scheduled' && p.tourDate && p.tourDate < ctx.today && !(p.followUpDate && p.followUpDate >= p.tourDate))
        .map((p) => {
          const ref = { collection: 'prospects' as const, id: p.id, label: p.name };
          return {
            propertyId: p.propertyId, severity: 'medium' as Severity, record: ref,
            title: `${p.name} missed their tour`,
            reason: `Tour was ${formatDate(p.tourDate)}; no follow-up sent.`,
            impact: 'No-shows that get a same-day follow-up rebook far more often.',
            suggestedAction: 'Send a reschedule message with two time options.',
            fix: {
              label: 'Send reschedule message',
              risk: 'low',
              target: ref,
              changes: [{ field: 'followUpDate', label: 'Follow-up sent', from: p.followUpDate ?? null, to: ctx.today }],
            },
          };
        });
    },
  },
  {
    id: 'renewal-not-offered',
    label: 'Renewal not offered',
    description: 'Lease ends within 60 days and no renewal offer has gone out.',
    requires: ['pms'],
    evaluate(ctx) {
      return ctx.data.residents
        .filter((r) => r.stage === 'current' && daysBetween(ctx.today, r.leaseEnd) <= 60 && daysBetween(ctx.today, r.leaseEnd) >= 0)
        .map((r) => {
          const days = daysBetween(ctx.today, r.leaseEnd);
          const u = ctx.unitById.get(r.unitId);
          const ref = { collection: 'residents' as const, id: r.id, label: r.name };
          return {
            propertyId: r.propertyId, severity: (days <= 35 ? 'high' : 'medium') as Severity, record: ref,
            title: `${r.name}'s lease ends in ${days} days — no renewal offer`,
            reason: `${u ? unitLabel(u) + ', ' : ''}lease ends ${formatDate(r.leaseEnd)}.`,
            impact: u ? `If they leave: about ${formatCurrency(dailyRent(u) * 30 + 1500)} in vacancy and turn cost.` : 'Risk of an avoidable move-out.',
            suggestedAction: 'Send the standard renewal offer.',
            fix: {
              label: 'Send renewal offer',
              risk: 'high',
              target: ref,
              changes: [
                { field: 'stage', label: 'Renewal stage', from: 'current', to: 'renewal_offered',
                  options: [{ value: 'current', label: 'No offer' }, { value: 'renewal_offered', label: 'Offer sent' }] },
                { field: 'renewalOfferDate', label: 'Offer date', from: r.renewalOfferDate ?? null, to: ctx.today },
              ],
            },
          };
        });
    },
  },
  {
    id: 'delinquent-no-reminder',
    label: 'Balance with no recent reminder',
    description: 'Resident owes money and has not been reminded in 5 days.',
    requires: ['pms'],
    evaluate(ctx) {
      return ctx.data.residents
        .filter((r) => r.balance > 0 && (!r.lastReminderDate || daysBetween(r.lastReminderDate, ctx.today) > 5))
        .map((r) => {
          const big = r.balance > 1500;
          const ref = { collection: 'residents' as const, id: r.id, label: r.name };
          const late = r.balanceDueDate ? daysBetween(r.balanceDueDate, ctx.today) : 0;
          return {
            propertyId: r.propertyId, severity: (big ? 'high' : 'medium') as Severity, record: ref,
            title: `${r.name} owes ${formatCurrency(r.balance)}`,
            reason: `${late > 0 ? `${late} days past due. ` : ''}${r.lastReminderDate ? `Last reminder ${formatDate(r.lastReminderDate)}.` : 'No reminder sent yet.'}`,
            impact: big ? 'Large balances get harder to collect every week.' : 'Small balances usually clear after one reminder.',
            suggestedAction: big ? 'Send a reminder with payment plan options.' : 'Send a friendly payment reminder.',
            fix: {
              label: big ? 'Send reminder with payment plan options' : 'Send payment reminder',
              risk: big ? 'high' : 'low',
              target: ref,
              changes: [{ field: 'lastReminderDate', label: 'Reminder sent', from: r.lastReminderDate ?? null, to: ctx.today }],
            },
          };
        });
    },
  },
  {
    id: 'conversation-escalated',
    label: 'Escalated conversation',
    description: `${CONFIG.brand.assistantName} handed a conversation to staff.`,
    requires: ['crm'],
    evaluate(ctx) {
      return ctx.data.conversations
        .filter((c) => c.escalated && c.status !== 'resolved')
        .map((c) => ({
          propertyId: c.propertyId, severity: (c.topic === 'move_in' || c.topic === 'maintenance' ? 'high' : 'medium') as Severity,
          record: { collection: 'conversations' as const, id: c.id, label: `${c.contact.name} · ${c.subject}` },
          title: `${c.contact.name} needs a staff reply`,
          reason: c.escalationReason ?? `Escalated by ${CONFIG.brand.assistantName}.`,
          impact: `Waiting since ${c.messages[c.messages.length - 1]?.at.slice(11) ?? '—'} on ${c.channel.toUpperCase()}.`,
          suggestedAction: 'Open the conversation and reply as staff.',
        }));
    },
  },
];

/* ── Engine ───────────────────────────────────────────────────────────────── */

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface EvaluateOptions {
  today?: ISODate;
  /** Which systems are connected. Rules requiring a disconnected system are skipped. */
  connected?: Partial<Record<IntegrationId, boolean>>;
  disabledRules?: string[];
  rules?: Rule[];
}

export function evaluateRules(data: Dataset, opts: EvaluateOptions = {}): Alert[] {
  const ctx = buildContext(data, opts.today ?? CONFIG.today);
  const rules = opts.rules ?? RULES;
  const alerts: Alert[] = [];
  for (const rule of rules) {
    if (opts.disabledRules?.includes(rule.id)) continue;
    if (rule.requires.some((r) => opts.connected?.[r] === false)) continue;
    for (const draft of rule.evaluate(ctx)) {
      alerts.push({ ...draft, id: `${rule.id}:${draft.record.id}`, ruleId: rule.id, ruleLabel: rule.label, requires: rule.requires });
    }
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title));
}

/** Expected unblock helper reused by screens. */
export const daysUntil = (d: ISODate, today: ISODate = CONFIG.today) => daysBetween(today, d);
