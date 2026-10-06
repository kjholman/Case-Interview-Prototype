/**
 * "What would the AI assistant say?" — builds a reply from CURRENT data so the preview changes
 * when the data changes (fix a date mismatch → the hold disappears; unblock a task → the ETA changes).
 * Pure function; templated text, no model calls.
 */
import { CONFIG, type IntegrationId } from '../config';
import { addDays, dueLabel, formatDate, formatWeekday, relativeDay } from './dates';
import { formatCurrency } from './impact';
import type { AutomationLevel, Conversation, Dataset, ISODate, Task, Unit } from './types';
import { forecastPlan, unitPlan } from './workplan';

export interface AssistantSource {
  label: string;
  system: 'PMS' | 'CRM' | 'Work orders';
}

export interface AssistantDraft {
  text: string;
  sources: AssistantSource[];
  /** Reasons the assistant should NOT send on its own. */
  holds: string[];
}

export interface AssistantMode {
  autoSend: boolean;
  label: string;
  tone: 'neutral' | 'success' | 'warning';
  description: string;
}

const SENSITIVE = new Set(['renewal', 'payment', 'complaint', 'move_in', 'application']);

export function assistantMode(level: AutomationLevel, conv: Conversation, draft: AssistantDraft): AssistantMode {
  if (conv.escalated || draft.holds.length) {
    return { autoSend: false, label: 'Held for staff', tone: 'warning', description: `${CONFIG.brand.assistantName} will not send this on its own. A staff member should review and reply.` };
  }
  if (conv.handledBy === 'staff') {
    return { autoSend: false, label: 'Staff is handling', tone: 'neutral', description: `A staff member took over this conversation. ${CONFIG.brand.assistantName} only drafts.` };
  }
  if (level === 1) return { autoSend: false, label: 'Draft · staff sends', tone: 'neutral', description: `Level 1: ${CONFIG.brand.assistantName} drafts; a person sends.` };
  if (level === 2 && SENSITIVE.has(conv.topic)) {
    return { autoSend: false, label: 'Draft · staff sends', tone: 'neutral', description: `Level 2: ${conv.topic.replace('_', '-')} conversations are not routine, so a person sends.` };
  }
  return { autoSend: true, label: 'Sends automatically', tone: 'success', description: `Level ${level}: ${CONFIG.brand.assistantName} sends this reply without waiting.` };
}

const first = (name: string) => name.split(' ')[0];
const bedsLabel = (b: number) => (b === 0 ? 'studio' : `${b}-bedroom`);

export function draftAssistantReply(
  conv: Conversation,
  data: Dataset,
  opts: { today: ISODate; connected: Record<IntegrationId, boolean> },
): AssistantDraft {
  const { today, connected } = opts;
  const sources: AssistantSource[] = [];
  const holds: string[] = [];
  const unitById = new Map(data.units.map((u) => [u.id, u]));
  const property = data.properties.find((p) => p.id === conv.propertyId);
  const name = first(conv.contact.name);

  if (!connected.pms) holds.push('Property management system is disconnected — unit and account data may be stale.');
  if (conv.escalated && conv.escalationReason) holds.push(`Escalated: ${conv.escalationReason}.`);

  const pmName = property?.managerName ?? 'the property manager';

  /* ── Prospects ── */
  if (conv.contact.kind === 'prospect') {
    const p = data.prospects.find((x) => x.id === conv.contact.id);
    if (!p) return { text: '', sources, holds: ['Prospect record not found.'] };

    if (conv.topic === 'move_in') {
      const u = p.interestedUnitId ? unitById.get(p.interestedUnitId) : undefined;
      if (!u?.availableDate) return { text: `Hi ${name}, I'll confirm your move-in details shortly.`, sources, holds };
      const f = forecastPlan(unitPlan(data.tasks, u.id), today);
      sources.push({ label: `Unit ${u.number} move-in ${formatDate(u.availableDate)}`, system: 'PMS' });
      sources.push({ label: `Make-ready ${f.done}/${f.total} steps done, projected ready ${formatDate(f.readyDate)}`, system: 'Work orders' });
      if (f.readyDate > u.availableDate) {
        holds.push(`Make-ready is projected to finish ${formatDate(f.readyDate)}, after move-in on ${formatDate(u.availableDate)}. Don't confirm key pickup.`);
        return {
          text: `Hi ${name}, thank you for checking in. Our team is finishing the final work on unit ${u.number}. ${pmName} will call you today to confirm your key pickup time and go over options if anything changes.`,
          sources, holds,
        };
      }
      return { text: `Hi ${name}, good news — unit ${u.number} is on track for your move-in on ${formatWeekday(u.availableDate)}. Key pickup is at the leasing office from 9:00 AM. Bring a photo ID and proof of renters insurance.`, sources, holds };
    }

    // Tour / pricing / general: quote matching availability from the PMS, cross-check the listing.
    const options = data.units
      .filter((u) => u.propertyId === conv.propertyId && u.beds === p.beds && (u.status === 'vacant' || u.status === 'ready' || u.status === 'notice') && u.availableDate)
      .sort((a, b) => (a.availableDate! < b.availableDate! ? -1 : 1))
      .slice(0, 2);
    for (const u of options) {
      sources.push({ label: `Unit ${u.number}: ${formatCurrency(u.rent)}/mo, available ${formatDate(u.availableDate)}`, system: 'PMS' });
      if (u.crmAvailableDate && u.crmAvailableDate !== u.availableDate) {
        sources.push({ label: `Unit ${u.number} listed ${formatDate(u.crmAvailableDate)}`, system: 'CRM' });
        holds.push(`Unit ${u.number}: PMS says ${formatDate(u.availableDate)}, the listing says ${formatDate(u.crmAvailableDate)}. Fix the mismatch before quoting a date.`);
      }
    }
    const list = options.map((u) => `unit ${u.number} (${u.sqft.toLocaleString()} sq ft) at ${formatCurrency(u.rent)}/month, available ${u.availableDate! <= today ? 'now' : formatDate(u.availableDate)}`);
    const noShow = p.stage === 'tour_scheduled' && p.tourDate && p.tourDate < today;
    const intro = noShow
      ? `Hi ${name}, sorry we missed you on ${formatWeekday(p.tourDate)}! `
      : `Hi ${name}! `;
    if (!options.length) {
      holds.push(`No ${bedsLabel(p.beds)} homes are available right now.`);
      return { text: `${intro}We don't have a ${bedsLabel(p.beds)} home open right now, but I can add you to the waitlist and text you the moment one frees up.`, sources, holds };
    }
    const body = list.length === 1 ? `We have ${list[0]}.` : `We have two ${bedsLabel(p.beds)} homes: ${list[0]}, and ${list[1]}.`;
    return { text: `${intro}${body} I can book a tour ${formatWeekday(addDays(today, 2))} at 10:00 AM or 2:30 PM — which works better?`, sources, holds };
  }

  /* ── Residents ── */
  const r = data.residents.find((x) => x.id === conv.contact.id);
  if (!r) return { text: '', sources, holds: ['Resident record not found.'] };
  const unit: Unit | undefined = unitById.get(r.unitId);

  switch (conv.topic) {
    case 'maintenance': {
      const task: Task | undefined = data.tasks.find((t) => t.id === conv.relatedTaskId) ??
        data.tasks.find((t) => t.unitId === r.unitId && t.type === 'service' && t.status !== 'done');
      if (!task) return { text: `Hi ${name}, I don't see an open request for your home. Could you describe the issue so I can create one?`, sources, holds };
      if (!connected.workOrders) holds.push('Work-order tool is disconnected — status may be stale.');
      const who = task.assigneeId ? data.staff.find((s) => s.id === task.assigneeId)?.name : task.vendorId ? data.vendors.find((v) => v.id === task.vendorId)?.name : undefined;
      sources.push({ label: `${task.title}: ${task.status.replace('_', ' ')}, due ${formatDate(task.due)}${who ? `, ${who}` : ''}`, system: 'Work orders' });
      if (task.status === 'done') return { text: `Hi ${name}, our records show "${task.title}" was completed ${relativeDay(task.completedDate ?? task.due, today).toLowerCase()}. Is everything working now?`, sources, holds };
      if (task.status === 'blocked') {
        return { text: `Hi ${name}, an update on "${task.title}": we're ${task.blockedReason?.toLowerCase() ?? 'waiting on a part'}. ${task.earliestStart ? `We expect to finish by ${formatWeekday(task.earliestStart)}.` : 'We will update you as soon as we have a date.'} Sorry for the wait.`, sources, holds };
      }
      if (!who) holds.push('No technician is assigned yet — assign someone before promising a time.');
      if (task.due < today) {
        holds.push(`Work order is ${dueLabel(task.due, today)}. A staff member should give a firm time.`);
        return { text: `Hi ${name}, I'm sorry "${task.title.toLowerCase()}" is taking longer than it should. I've asked ${pmName}'s team to confirm a firm time today, and I'll text you as soon as it's set.`, sources, holds };
      }
      const when = task.due <= today ? 'today' : formatWeekday(task.due);
      return { text: `Hi ${name}, ${who ?? 'a technician'} is scheduled to take care of "${task.title.toLowerCase()}" ${when === 'today' ? 'today' : `by ${when}`}. They will knock first and leave a note when finished.`, sources, holds };
    }
    case 'renewal': {
      sources.push({ label: `Lease ends ${formatDate(r.leaseEnd)} · stage: ${r.stage.replace('_', ' ')}`, system: 'PMS' });
      if (unit) sources.push({ label: `Unit ${unit.number} market rent ${formatCurrency(unit.rent)}`, system: 'PMS' });
      if (!holds.some((h) => h.startsWith('Escalated'))) holds.push('Pricing changes need manager approval.');
      return { text: `Hi ${name}, thanks for letting us know. Your current lease ends ${formatDate(r.leaseEnd)}. I've shared your question about a longer term with ${pmName}, who can review pricing options and will reply within one business day.`, sources, holds };
    }
    case 'payment': {
      sources.push({ label: `Balance ${formatCurrency(r.balance)}${r.balanceDueDate ? `, due since ${formatDate(r.balanceDueDate)}` : ''}`, system: 'PMS' });
      if (r.balance === 0) return { text: `Hi ${name}, good news — your account is fully paid. Thank you!`, sources, holds };
      if (r.balance > 1000) holds.push('Payment plans over $1,000 need manager approval.');
      return { text: `Hi ${name}, your current balance is ${formatCurrency(r.balance)}. ${r.balance > 1000 ? `I've asked ${pmName} about splitting it into two payments and they will follow up today.` : 'You can split it into two payments: half by Friday and the rest by the 20th. Want me to set that up?'}`, sources, holds };
    }
    case 'move_out': {
      sources.push({ label: `Move-out ${formatDate(unit?.moveOutDate ?? r.leaseEnd)}`, system: 'PMS' });
      return { text: `Hi ${name}, your move-out date is ${formatWeekday(unit?.moveOutDate ?? r.leaseEnd)}. Please return all keys and fobs to the office and leave the home broom-clean. We'll email your deposit statement within 30 days.`, sources, holds };
    }
    case 'complaint':
      holds.push('Complaints are handled by staff.');
      return { text: `Hi ${name}, thank you for letting us know. The property team is following up and will update you by tomorrow.`, sources, holds };
    default:
      return { text: `Hi ${name}, thanks for reaching out. I've passed this to the ${property?.name ?? 'property'} team and someone will follow up shortly.`, sources, holds };
  }
}

