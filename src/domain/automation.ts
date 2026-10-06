/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AUTOMATION POLICY — what happens to each alert at each automation level.
 *
 *    Level 1  Suggest; a person approves      → every fix goes to the Approval queue
 *    Level 2  Auto for low-risk items         → low-risk fixes apply automatically,
 *                                               high-risk fixes go to the Approval queue
 *    Level 3  Auto, exceptions only           → fixes apply automatically, except high-risk
 *                                               fixes on high/critical alerts, which become exceptions
 *  Alerts without a fix always need a person → Exceptions inbox.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CONFIG } from '../config';
import { createMakeReadyPlan } from './lifecycle';
import type { Alert, AutomationLevel, CollectionName, Dataset, Fix, ISODate } from './types';

export type Route = 'auto' | 'approval' | 'exception';

export const AUTOMATION_LEVELS: { level: AutomationLevel; name: string; summary: string; detail: string }[] = [
  { level: 1, name: 'Suggest, person approves', summary: 'Nothing changes without a person.',
    detail: `The system suggests fixes. Every change waits in the Approval queue. ${CONFIG.brand.assistantName} drafts replies; staff send them.` },
  { level: 2, name: 'Automatic for low-risk items', summary: 'Routine fixes run on their own.',
    detail: `Low-risk fixes (syncing dates, assigning unowned work, routine reminders) apply automatically and are logged. Anything high-risk still waits for approval. ${CONFIG.brand.assistantName} sends routine replies.` },
  { level: 3, name: 'Automatic, exceptions only', summary: 'People only see exceptions.',
    detail: `All fixes apply automatically except high-risk changes on urgent items, which go to the Exceptions inbox. The Approval queue stays empty. ${CONFIG.brand.assistantName} replies unless a conversation is escalated.` },
];

export function routeAlert(alert: Alert, level: AutomationLevel): Route {
  if (!alert.fix) return 'exception';
  if (level === 1) return 'approval';
  if (level === 2) return alert.fix.risk === 'low' ? 'auto' : 'approval';
  return alert.fix.risk === 'high' && (alert.severity === 'high' || alert.severity === 'critical') ? 'exception' : 'auto';
}

export function automationActor(level: AutomationLevel) {
  return `Automation (Level ${level})`;
}

/** Applies a fix's field changes to its target record, returning a new dataset (immutable). */
export function applyFix(data: Dataset, fix: Fix, today: ISODate = CONFIG.today): Dataset {
  if (fix.action === 'createMakeReadyPlan') return createMakeReadyPlan(data, fix.target.id, today);
  const patch: Record<string, unknown> = {};
  for (const c of fix.changes) patch[c.field] = c.to === null ? undefined : c.to;
  return patchRecord(data, fix.target.collection, fix.target.id, patch);
}

export function patchRecord(data: Dataset, collection: CollectionName, id: string, patch: Record<string, unknown>): Dataset {
  const list = data[collection] as unknown as { id: string }[];
  return { ...data, [collection]: list.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export interface RouteSummary {
  auto: Alert[];
  approval: Alert[];
  exception: Alert[];
}

export function summarizeRoutes(alerts: Alert[], level: AutomationLevel): RouteSummary {
  const out: RouteSummary = { auto: [], approval: [], exception: [] };
  for (const a of alerts) out[routeAlert(a, level)].push(a);
  return out;
}
