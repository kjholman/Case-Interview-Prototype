/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ELISE — how the AI handles an inbound message, end to end:
 *
 *    1. Identify the contact (resident, prospect, or a brand-new lead → create a guest card)
 *    2. Triage the message → topic, trade category, priority, emergency?
 *    3. Act in the systems of record:
 *         maintenance → create a work order (unassigned; automation may assign it)
 *         tour        → book the tour at Level 2+, otherwise offer times for staff to confirm
 *         emergency / concessions / payment plans / notices → escalate to staff
 *    4. The store then drafts the reply (assistant.ts) and sends it if the automation level allows.
 *
 *  Keyword triage keeps the demo deterministic. Swap triage() for a model call in a real build.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { addBusinessDays, addDays, formatWeekday } from './dates';
import { nextTaskId, woNumber } from './lifecycle';
import type { AutomationLevel, Channel, Conversation, ConversationTopic, Dataset, ISODate, ISODateTime, Priority, Prospect, Task } from './types';

/* ── Triage ───────────────────────────────────────────────────────────────── */

export interface Triage {
  topic: ConversationTopic;
  /** Trade for maintenance requests. */
  category?: string;
  priority: Priority;
  emergency: boolean;
  /** Short work-order or conversation title. */
  title: string;
  /** Why staff must handle it (concession, payment plan, notice …). */
  escalation?: string;
}

const CATEGORIES: { category: string; words: string[]; priority: Priority }[] = [
  { category: 'HVAC', words: ['ac', 'a/c', 'air conditioning', 'air conditioner', 'not cooling', 'heat', 'heater', 'heating', 'furnace', 'thermostat', 'hvac'], priority: 'high' },
  { category: 'Plumbing', words: ['leak', 'leaking', 'clog', 'clogged', 'toilet', 'faucet', 'sink', 'drain', 'shower', 'water heater', 'hot water', 'pipe'], priority: 'high' },
  { category: 'Electrical', words: ['outlet', 'power', 'breaker', 'light', 'lights', 'spark', 'sparking', 'electrical', 'switch'], priority: 'normal' },
  { category: 'Appliance', words: ['fridge', 'refrigerator', 'dishwasher', 'oven', 'stove', 'washer', 'dryer', 'microwave', 'disposal'], priority: 'normal' },
  { category: 'Doors & locks', words: ['lock', 'locked', 'door', 'key fob', 'fob'], priority: 'normal' },
  { category: 'Pest control', words: ['pest', 'roach', 'roaches', 'mice', 'mouse', 'ants', 'bugs', 'bed bugs'], priority: 'normal' },
  { category: 'Smoke & CO', words: ['smoke detector', 'smoke alarm', 'detector', 'chirping', 'beeping'], priority: 'high' },
];
const EMERGENCY = ['flood', 'flooding', 'fire', 'smoke coming', 'gas', 'sparking', 'no heat', 'no water', 'burst', 'sewage', 'carbon monoxide', 'ceiling is leaking', 'water everywhere'];
const TOPICS: { topic: ConversationTopic; words: string[] }[] = [
  { topic: 'move_out', words: ['move out', 'moving out', 'notice to vacate', 'give notice', 'giving notice', 'break my lease', 'break the lease'] },
  { topic: 'renewal', words: ['renew', 'renewal', 'extend my lease', 'lease is ending', 'lease ends'] },
  { topic: 'payment', words: ['pay ', 'payment', 'balance', 'late fee', 'owe', 'rent is late', 'payment plan'] },
  { topic: 'tour', words: ['tour', 'visit', 'showing', 'come see', 'see the', 'see a', 'check out the', 'look at'] },
  { topic: 'pricing', words: ['price', 'pricing', 'how much', 'rent for', 'cost', 'specials', 'availability', 'available'] },
  { topic: 'application', words: ['application', 'apply', 'approved', 'screening'] },
];

const has = (text: string, w: string) => (w.length <= 3 ? new RegExp(`\\b${w.replace('/', '\\/')}\\b`).test(text) : text.includes(w));

function titleFrom(text: string): string {
  const first = text.split(/[.!?\n]/).find((s) => s.trim().length > 3) ?? text;
  const cleaned = first.trim()
    .replace(/^(hi|hello|hey)[,!\s]+(there[,\s]+)?/i, '')
    .replace(/^(my|our|the)\s+/i, '');
  const t = cleaned.length > 52 ? `${cleaned.slice(0, 50).trim()}…` : cleaned;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function triage(rawText: string, contactKind: 'resident' | 'prospect'): Triage {
  const text = ` ${rawText.toLowerCase()} `;
  const emergency = EMERGENCY.some((w) => text.includes(w));
  // Most specific keyword wins: "dishwasher won't drain" → Appliance, "water heater" → Plumbing.
  let cat: (typeof CATEGORIES)[number] | undefined;
  let best = 0;
  for (const c of CATEGORIES) for (const w of c.words) if (w.length > best && has(text, w)) { cat = c; best = w.length; }

  // Maintenance only makes sense for residents.
  if (contactKind === 'resident' && (cat || emergency)) {
    return {
      topic: 'maintenance', category: cat?.category ?? 'General', emergency,
      priority: emergency ? 'urgent' : cat?.priority ?? 'normal',
      title: titleFrom(rawText),
      escalation: emergency ? 'Emergency maintenance — on-call technician needed now' : undefined,
    };
  }
  const topic = TOPICS.find((t) => t.words.some((w) => text.includes(w)))?.topic ?? 'general';
  let escalation: string | undefined;
  if (topic === 'move_out') escalation = 'Notice to vacate or lease break needs staff to process';
  if (topic === 'renewal' && /(lower|discount|concession|flexib|cheaper|too high|increase)/.test(text)) escalation = 'Rent concession request needs manager approval';
  if (topic === 'payment' && /(plan|split|two payments|extension|more time)/.test(text)) escalation = 'Payment arrangement needs manager approval';
  if (/(lawyer|attorney|legal|discriminat|fair housing|complain)/.test(text)) escalation = 'Sensitive request — staff should respond';
  return {
    topic: escalation?.startsWith('Sensitive') ? 'complaint' : topic,
    priority: 'normal', emergency: false, title: titleFrom(rawText), escalation,
  };
}

/* ── Inbound processing ───────────────────────────────────────────────────── */

export type InboundContact =
  | { kind: 'resident'; id: string }
  | { kind: 'prospect'; id: string }
  | { kind: 'new_lead'; name: string; phone?: string; email?: string; beds: number; propertyId: string };

export interface Inbound {
  contact: InboundContact;
  channel: Channel;
  text: string;
}

export interface InboundResult {
  data: Dataset;
  conversationId: string;
  triage: Triage;
  /** What Elise did, in plain language, for the activity log and the toast. */
  actions: { action: string; target: { collection: 'tasks' | 'prospects' | 'conversations'; id: string; label: string } }[];
}

const SLA_DAYS: Record<Priority, number> = { urgent: 0, high: 1, normal: 3, low: 7 };
export const TOUR_SLOTS = ['10:00 AM', '11:30 AM', '2:30 PM', '4:00 PM'];

export function processInbound(data: Dataset, inbound: Inbound, level: AutomationLevel, today: ISODate, now: ISODateTime): InboundResult {
  let next = data;
  const actions: InboundResult['actions'] = [];

  // 1. Contact
  let contact: Conversation['contact'];
  let propertyId: string;
  if (inbound.contact.kind === 'new_lead') {
    const c = inbound.contact;
    const id = `pr-new-${data.prospects.length + 1}`;
    const p: Prospect = {
      id, propertyId: c.propertyId, name: c.name.trim() || 'New lead', phone: c.phone ?? '', email: c.email ?? '', stage: 'inquiry',
      source: { sms: 'Text message', email: 'Email', voice: 'Phone call', chat: 'Website chat' }[inbound.channel],
      beds: c.beds, desiredMoveIn: addDays(today, 30), lastContactDate: today,
    };
    next = { ...next, prospects: [...next.prospects, p] };
    contact = { kind: 'prospect', id, name: p.name };
    propertyId = c.propertyId;
    actions.push({ action: 'Created guest card for new lead', target: { collection: 'prospects', id, label: p.name } });
  } else if (inbound.contact.kind === 'resident') {
    const rid = inbound.contact.id;
    const r = data.residents.find((x) => x.id === rid);
    if (!r) throw new Error('Unknown resident');
    contact = { kind: 'resident', id: r.id, name: r.name };
    propertyId = r.propertyId;
  } else {
    const pid = inbound.contact.id;
    const p = data.prospects.find((x) => x.id === pid);
    if (!p) throw new Error('Unknown prospect');
    contact = { kind: 'prospect', id: p.id, name: p.name };
    propertyId = p.propertyId;
    next = { ...next, prospects: next.prospects.map((x) => (x.id === p.id ? { ...x, lastContactDate: today } : x)) };
  }

  // 2. Triage
  const t = triage(inbound.text, contact.kind);

  // 3. Conversation: continue an open thread on the same channel, or start one.
  const existing = next.conversations.find((c) => c.contact.id === contact.id && c.channel === inbound.channel && c.status !== 'resolved');
  const convId = existing?.id ?? `c-new-${next.conversations.length + 1}`;
  const message = { id: `m-${convId}-${(existing?.messages.length ?? 0) + 1}`, at: now, from: 'contact' as const, authorName: contact.name, body: inbound.text };
  let conv: Conversation = existing
    ? { ...existing, messages: [...existing.messages, message], status: 'open', topic: t.topic }
    : { id: convId, propertyId, channel: inbound.channel, topic: t.topic, subject: t.title, contact, handledBy: 'ai', escalated: false, status: 'open', messages: [message] };

  // 4. Act
  if (t.topic === 'maintenance' && contact.kind === 'resident') {
    const r = next.residents.find((x) => x.id === contact.id)!;
    const task: Task = {
      id: nextTaskId(next), propertyId, unitId: r.unitId, type: 'service', title: t.title, status: 'todo', priority: t.priority,
      start: today, due: addBusinessDays(today, SLA_DAYS[t.priority]), durationDays: 1, createdDate: today,
      category: t.category, source: 'elise',
    };
    next = { ...next, tasks: [...next.tasks, task] };
    conv = { ...conv, relatedTaskId: task.id, subject: existing ? conv.subject : t.title };
    actions.push({ action: `Created work order ${woNumber(task)} (${t.category}, ${t.priority})`, target: { collection: 'tasks', id: task.id, label: `${woNumber(task)} · ${t.title}` } });
  }
  if (t.topic === 'tour' && contact.kind === 'prospect' && level >= 2) {
    const date = addBusinessDays(addDays(today, 1), 0);
    const time = TOUR_SLOTS[0];
    next = { ...next, prospects: next.prospects.map((p) => (p.id === contact.id ? { ...p, stage: 'tour_scheduled', tourDate: date, tourTime: time, tourBookedBy: 'elise', followUpDate: undefined } : p)) };
    actions.push({ action: `Booked tour ${formatWeekday(date)}, ${time}`, target: { collection: 'prospects', id: contact.id, label: contact.name } });
  }
  if (t.escalation) {
    conv = { ...conv, escalated: true, escalationReason: t.escalation };
    actions.push({ action: `Escalated to staff: ${t.escalation}`, target: { collection: 'conversations', id: convId, label: `${contact.name} · ${conv.subject}` } });
  }

  next = {
    ...next,
    conversations: existing ? next.conversations.map((c) => (c.id === convId ? conv : c)) : [conv, ...next.conversations],
  };
  return { data: next, conversationId: convId, triage: t, actions };
}
