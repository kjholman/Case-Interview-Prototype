/**
 * App store — one React context + reducer. No backend: state lives in memory and is
 * mirrored to localStorage so a page reload keeps your demo changes. "Reset demo data"
 * regenerates everything from the deterministic seed.
 *
 * After every data or settings change the store runs `reconcile()`, which evaluates the
 * rules and applies fixes the current automation level allows, logging each as "automatic".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { CONFIG, type IntegrationId } from '../config';
import { applyFix, automationActor, patchRecord, routeAlert, type Route } from '../domain/automation';
import { assistantMode, draftAssistantReply } from '../domain/assistant';
import { addDays, nowDateTime, TODAY } from '../domain/dates';
import { processInbound, type Inbound } from '../domain/elise';
import { createMakeReadyPlan, giveNotice, recordPayment, renewLease, signLease, syncUnitStatuses } from '../domain/lifecycle';
import { buildContext, evaluateRules } from '../domain/rules';
import { createSeedAudit, createSeedData } from '../domain/seed';
import type {
  Alert, AuditEvent, AutomationLevel, CollectionName, Conversation, Dataset, FieldChange, Fix, ISODate, Message, RecordRef,
} from '../domain/types';

/* ── State ────────────────────────────────────────────────────────────────── */

export interface Settings {
  automationLevel: AutomationLevel;
  integrations: Record<IntegrationId, boolean>;
  disabledRules: string[];
  productName: string;
}

export interface AlertState {
  snoozedUntil?: ISODate;
  resolved?: boolean;
  ownerName?: string;
}

export interface Session {
  name: string;
  email: string;
  role: string;
}

export interface AppState {
  version: number;
  data: Dataset;
  audit: AuditEvent[];
  settings: Settings;
  alertState: Record<string, AlertState>;
  /** Alert id → rejection reason. Rejected fixes are never re-proposed or auto-applied. */
  rejected: Record<string, string>;
  /** 'all' or a property id. */
  propertyId: string;
  session: Session | null;
  /** Bumped whenever automation applies changes, so the UI can announce it. */
  lastAutoRun: { seq: number; count: number };
  /** Result of the last simulated inbound message, for the UI to announce and open. */
  lastInbound: { seq: number; conversationId?: string; summary: string[]; sent: boolean; held: boolean };
}

const STATE_KEY = `opsconsole:v${CONFIG.storageVersion}:state`;
const SESSION_KEY = 'opsconsole:session';

const defaultSettings = (): Settings => ({
  automationLevel: 1,
  integrations: { pms: true, crm: true, workOrders: true },
  disabledRules: [...CONFIG.defaultDisabledRules],
  productName: CONFIG.productName,
});

export function createInitialState(session: Session | null = null): AppState {
  const data = createSeedData();
  return reconcile({
    version: CONFIG.storageVersion,
    data,
    audit: createSeedAudit(data),
    settings: defaultSettings(),
    alertState: {},
    rejected: {},
    propertyId: 'all',
    session,
    lastAutoRun: { seq: 0, count: 0 },
    lastInbound: { seq: 0, summary: [], sent: false, held: false },
  });
}

function loadState(): AppState {
  let session: Session | null = null;
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    /* storage unavailable */
  }
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === CONFIG.storageVersion && parsed.data?.units) {
        return { ...parsed, settings: { ...defaultSettings(), ...parsed.settings }, session, lastAutoRun: { seq: 0, count: 0 }, lastInbound: { seq: 0, summary: [], sent: false, held: false } };
      }
    }
  } catch {
    /* corrupt or unavailable → fall back to seed */
  }
  return createInitialState(session);
}

function saveState(state: AppState) {
  try {
    const { session, lastAutoRun, lastInbound, ...persisted } = state;
    void lastAutoRun;
    void lastInbound;
    localStorage.setItem(STATE_KEY, JSON.stringify(persisted));
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode or quota — the demo still works in memory */
  }
}

/* ── Automation reconcile ─────────────────────────────────────────────────── */

let auditSeq = 0;
const auditId = () => `a-${Date.now().toString(36)}-${(++auditSeq).toString(36)}`;

export function computeAlerts(state: Pick<AppState, 'data' | 'settings'>): Alert[] {
  return evaluateRules(state.data, { connected: state.settings.integrations, disabledRules: state.settings.disabledRules });
}

/** Applies every fix the automation level allows. Re-evaluates between passes so overlapping fixes settle. */
export function reconcile(state: AppState): AppState {
  const level = state.settings.automationLevel;
  // System-of-record rules first: e.g. a vacant unit whose make-ready is done becomes Ready.
  let data = syncUnitStatuses(state.data);
  const syncEvents: AuditEvent[] = data.units
    .filter((u, i) => u.status !== state.data.units[i]?.status)
    .map((u) => ({
      id: auditId(), at: nowDateTime(), actor: 'PMS', action: `Unit ${u.number} marked Ready — make-ready complete`, mode: 'automatic' as const,
      target: { collection: 'units' as const, id: u.id, label: `Unit ${u.number}` }, propertyId: u.propertyId,
      changes: [{ field: 'status', label: 'Status', from: 'vacant', to: 'ready' }],
    }));
  const events: AuditEvent[] = [];
  for (let pass = 0; pass < 5; pass++) {
    const touched = new Set<string>();
    let changed = false;
    for (const a of computeAlerts({ data, settings: state.settings })) {
      if (!a.fix || routeAlert(a, level) !== 'auto' || state.rejected[a.id]) continue;
      const key = `${a.fix.target.collection}:${a.fix.target.id}`;
      if (touched.has(key)) continue; // one fix per record per pass; re-evaluate next pass
      touched.add(key);
      data = applyFix(data, a.fix);
      changed = true;
      events.push({
        id: auditId(), at: nowDateTime(), actor: automationActor(level), action: a.fix.label, mode: 'automatic',
        target: a.fix.target, propertyId: a.propertyId, changes: a.fix.changes, note: a.title,
      });
    }
    if (!changed) break;
  }
  if (!events.length && !syncEvents.length) return state;
  return {
    ...state,
    data,
    audit: [...events.reverse(), ...syncEvents, ...state.audit],
    lastAutoRun: events.length ? { seq: state.lastAutoRun.seq + 1, count: events.length } : state.lastAutoRun,
  };
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

export type Action =
  | { type: 'login'; session: Session }
  | { type: 'logout' }
  | { type: 'setProperty'; propertyId: string }
  | { type: 'setLevel'; level: AutomationLevel }
  | { type: 'setIntegration'; id: IntegrationId; on: boolean }
  | { type: 'toggleRule'; ruleId: string }
  | { type: 'setProductName'; name: string }
  | { type: 'applyFix'; alert: Alert; fix?: Fix; edited?: boolean }
  | { type: 'reject'; alert: Alert; reason: string }
  | { type: 'resolveAlert'; alert: Alert; note?: string }
  | { type: 'snooze'; alert: Alert; days: number }
  | { type: 'reassign'; alert: Alert; staffId: string }
  | { type: 'updateRecord'; collection: CollectionName; id: string; patch: Record<string, unknown>; action: string; target: RecordRef; propertyId?: string; changes?: FieldChange[] }
  | { type: 'addMessage'; conversationId: string; message: Omit<Message, 'id' | 'at'> }
  | { type: 'updateConversation'; id: string; patch: Partial<Conversation>; action: string }
  | { type: 'inbound'; inbound: Inbound }
  | { type: 'signLease'; prospectId: string; unitId: string; moveIn: ISODate }
  | { type: 'giveNotice'; residentId: string; moveOut: ISODate }
  | { type: 'renewLease'; residentId: string }
  | { type: 'recordPayment'; residentId: string; amount: number; method: string }
  | { type: 'createPlan'; unitId: string }
  | { type: 'reset' };

function reducer(state: AppState, action: Action): AppState {
  const actor = state.session?.name ?? 'Demo user';
  const log = (e: Omit<AuditEvent, 'id' | 'at' | 'actor'> & { actor?: string }): AuditEvent[] => [
    { id: auditId(), at: nowDateTime(), actor, ...e },
    ...state.audit,
  ];

  switch (action.type) {
    case 'login':
      return { ...state, session: action.session };
    case 'logout':
      return { ...state, session: null };
    case 'setProperty':
      return { ...state, propertyId: action.propertyId };
    case 'setProductName':
      return { ...state, settings: { ...state.settings, productName: action.name } };
    case 'inbound': {
      const level = state.settings.automationLevel;
      const now = nowDateTime();
      const res = processInbound(state.data, action.inbound, level, TODAY, now);
      const eliseName = CONFIG.brand.assistantName;
      const eliseEvents: AuditEvent[] = res.actions.map((a) => ({
        id: auditId(), at: now, actor: eliseName, action: a.action, mode: 'automatic',
        target: a.target, propertyId: res.data.conversations.find((c) => c.id === res.conversationId)?.propertyId,
      }));
      // Automation may act on what Elise created (e.g. assign the new work order at Level 2).
      let next = reconcile({ ...state, data: res.data, audit: [...eliseEvents.reverse(), ...state.audit] });
      // Draft the reply from the updated data; send it if this level allows.
      const conv = next.data.conversations.find((c) => c.id === res.conversationId)!;
      const draft = draftAssistantReply(conv, next.data, { today: TODAY, connected: next.settings.integrations });
      const mode = assistantMode(level, conv, draft);
      let sent = false;
      if (mode.autoSend && draft.text) {
        sent = true;
        const msg: Message = { id: `m-${conv.id}-${conv.messages.length + 1}`, at: now, from: 'ai', authorName: eliseName, body: draft.text };
        next = {
          ...next,
          data: patchRecord(next.data, 'conversations', conv.id, { messages: [...conv.messages, msg], status: 'waiting' }),
          audit: [{ id: auditId(), at: now, actor: eliseName, action: `Replied by ${conv.channel.toUpperCase()}`, mode: 'automatic',
            target: { collection: 'conversations', id: conv.id, label: `${conv.contact.name} · ${conv.subject}` }, propertyId: conv.propertyId }, ...next.audit],
        };
      }
      return {
        ...next,
        lastInbound: {
          seq: state.lastInbound.seq + 1, conversationId: res.conversationId, sent, held: !mode.autoSend,
          summary: [...res.actions.map((a) => a.action), sent ? `Replied by ${conv.channel.toUpperCase()}` : `Reply drafted — ${mode.label.toLowerCase()}`],
        },
      };
    }
    case 'signLease': {
      const p = state.data.prospects.find((x) => x.id === action.prospectId);
      const u = state.data.units.find((x) => x.id === action.unitId);
      if (!p || !u) return state;
      return reconcile({
        ...state,
        data: signLease(state.data, p.id, u.id, action.moveIn),
        audit: log({ action: `Signed lease: ${p.name} → Unit ${u.number}, move-in ${action.moveIn}`, mode: 'manual', propertyId: u.propertyId,
          target: { collection: 'units', id: u.id, label: `Unit ${u.number}` },
          changes: [{ field: 'status', label: 'Unit status', from: u.status, to: 'leased' }, { field: 'availableDate', label: 'Move-in', from: u.availableDate ?? null, to: action.moveIn }] }),
      });
    }
    case 'giveNotice': {
      const r = state.data.residents.find((x) => x.id === action.residentId);
      if (!r) return state;
      return reconcile({
        ...state,
        data: giveNotice(state.data, r.id, action.moveOut, TODAY),
        audit: log({ action: `Recorded notice to vacate — move-out ${action.moveOut}; make-ready plan created`, mode: 'manual', propertyId: r.propertyId,
          target: { collection: 'residents', id: r.id, label: r.name },
          changes: [{ field: 'stage', label: 'Lease status', from: r.stage, to: 'notice_given' }] }),
      });
    }
    case 'renewLease': {
      const r = state.data.residents.find((x) => x.id === action.residentId);
      if (!r) return state;
      const next = renewLease(state.data, r.id);
      const after = next.residents.find((x) => x.id === r.id)!;
      return reconcile({
        ...state, data: next,
        audit: log({ action: 'Renewal signed — lease extended 12 months', mode: 'manual', propertyId: r.propertyId,
          target: { collection: 'residents', id: r.id, label: r.name },
          changes: [{ field: 'leaseEnd', label: 'Lease ends', from: r.leaseEnd, to: after.leaseEnd }] }),
      });
    }
    case 'recordPayment': {
      const r = state.data.residents.find((x) => x.id === action.residentId);
      if (!r || action.amount <= 0) return state;
      const next = recordPayment(state.data, r.id, action.amount, TODAY, action.method);
      const after = next.residents.find((x) => x.id === r.id)!;
      return reconcile({
        ...state, data: next,
        audit: log({ action: `Posted ${action.method.toLowerCase()} of $${action.amount.toLocaleString()}`, mode: 'manual', propertyId: r.propertyId,
          target: { collection: 'residents', id: r.id, label: r.name },
          changes: [{ field: 'balance', label: 'Balance', from: r.balance, to: after.balance }] }),
      });
    }
    case 'createPlan': {
      const u = state.data.units.find((x) => x.id === action.unitId);
      if (!u) return state;
      return reconcile({
        ...state, data: createMakeReadyPlan(state.data, u.id, TODAY),
        audit: log({ action: 'Created standard make-ready plan', mode: 'manual', propertyId: u.propertyId, target: { collection: 'units', id: u.id, label: `Unit ${u.number}` } }),
      });
    }
    case 'reset':
      return { ...createInitialState(state.session), propertyId: state.propertyId, lastAutoRun: { seq: state.lastAutoRun.seq, count: 0 }, lastInbound: state.lastInbound };

    case 'setLevel':
      return reconcile({
        ...state,
        settings: { ...state.settings, automationLevel: action.level },
        audit: log({ action: `Changed automation level from ${state.settings.automationLevel} to ${action.level}`, mode: 'manual' }),
      });
    case 'setIntegration':
      return reconcile({
        ...state,
        settings: { ...state.settings, integrations: { ...state.settings.integrations, [action.id]: action.on } },
        audit: log({ action: `${action.on ? 'Connected' : 'Disconnected'} ${CONFIG.integrations[action.id].label}`, mode: 'manual' }),
      });
    case 'toggleRule': {
      const off = state.settings.disabledRules.includes(action.ruleId);
      return reconcile({
        ...state,
        settings: {
          ...state.settings,
          disabledRules: off ? state.settings.disabledRules.filter((r) => r !== action.ruleId) : [...state.settings.disabledRules, action.ruleId],
        },
      });
    }

    case 'applyFix': {
      const fix = action.fix ?? action.alert.fix;
      if (!fix) return state;
      return reconcile({
        ...state,
        data: applyFix(state.data, fix),
        audit: log({ action: fix.label + (action.edited ? ' (edited)' : ''), mode: 'approved', target: fix.target, propertyId: action.alert.propertyId, changes: fix.changes, note: action.alert.title }),
      });
    }
    case 'reject':
      return {
        ...state,
        rejected: { ...state.rejected, [action.alert.id]: action.reason || 'No reason given' },
        audit: log({ action: `Rejected: ${action.alert.fix?.label ?? action.alert.title}`, mode: 'rejected', target: action.alert.record, propertyId: action.alert.propertyId, note: action.reason || undefined }),
      };
    case 'resolveAlert':
      return {
        ...state,
        alertState: { ...state.alertState, [action.alert.id]: { ...state.alertState[action.alert.id], resolved: true } },
        audit: log({ action: `Marked handled: ${action.alert.title}`, mode: 'manual', target: action.alert.record, propertyId: action.alert.propertyId, note: action.note ?? action.alert.suggestedAction }),
      };
    case 'snooze': {
      const until = addDays(TODAY, action.days);
      return {
        ...state,
        alertState: { ...state.alertState, [action.alert.id]: { ...state.alertState[action.alert.id], snoozedUntil: until } },
        audit: log({ action: `Snoozed ${action.days} day${action.days === 1 ? '' : 's'}: ${action.alert.title}`, mode: 'snoozed', target: action.alert.record, propertyId: action.alert.propertyId }),
      };
    }
    case 'reassign': {
      const person = state.data.staff.find((s) => s.id === action.staffId);
      if (!person) return state;
      const isTask = action.alert.record.collection === 'tasks';
      const before = isTask ? state.data.tasks.find((t) => t.id === action.alert.record.id) : undefined;
      return reconcile({
        ...state,
        // Reassigning a task changes who does the work; anything else changes who owns the exception.
        data: isTask ? patchRecord(state.data, 'tasks', action.alert.record.id, { assigneeId: person.id, vendorId: undefined }) : state.data,
        alertState: { ...state.alertState, [action.alert.id]: { ...state.alertState[action.alert.id], ownerName: person.name } },
        audit: log({
          action: isTask ? `Reassigned to ${person.name}` : `Assigned exception to ${person.name}`,
          mode: 'manual', target: action.alert.record, propertyId: action.alert.propertyId,
          changes: isTask ? [{ field: 'assigneeId', label: 'Assigned to', from: before?.assigneeId ?? before?.vendorId ?? null, to: person.id }] : undefined,
        }),
      });
    }
    case 'updateRecord':
      return reconcile({
        ...state,
        data: patchRecord(state.data, action.collection, action.id, action.patch),
        audit: log({ action: action.action, mode: 'manual', target: action.target, propertyId: action.propertyId, changes: action.changes }),
      });
    case 'addMessage': {
      const conv = state.data.conversations.find((c) => c.id === action.conversationId);
      if (!conv) return state;
      const msg: Message = { ...action.message, id: `m-${Date.now().toString(36)}`, at: nowDateTime() };
      return {
        ...state,
        data: patchRecord(state.data, 'conversations', conv.id, { messages: [...conv.messages, msg], status: 'waiting' }),
        audit: log({
          actor: action.message.from === 'ai' ? CONFIG.brand.assistantName : actor,
          action: `${action.message.from === 'ai' ? `${CONFIG.brand.assistantName} sent` : 'Sent'} ${conv.channel.toUpperCase()} reply`,
          mode: action.message.from === 'ai' && state.settings.automationLevel > 1 ? 'automatic' : 'manual',
          target: { collection: 'conversations', id: conv.id, label: `${conv.contact.name} · ${conv.subject}` },
          propertyId: conv.propertyId,
        }),
      };
    }
    case 'updateConversation': {
      const conv = state.data.conversations.find((c) => c.id === action.id);
      if (!conv) return state;
      return reconcile({
        ...state,
        data: patchRecord(state.data, 'conversations', action.id, action.patch),
        audit: log({ action: action.action, mode: 'manual', target: { collection: 'conversations', id: conv.id, label: `${conv.contact.name} · ${conv.subject}` }, propertyId: conv.propertyId }),
      });
    }
  }
}

/* ── Context ──────────────────────────────────────────────────────────────── */

interface Store {
  state: AppState;
  dispatch: (a: Action) => void;
}

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  useEffect(() => saveState(state), [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <AppStoreProvider>');
  return s;
}

/* ── Derived data hooks ───────────────────────────────────────────────────── */

/** Lookup maps for ids → records. */
export function useLookups() {
  const { state } = useStore();
  return useMemo(() => {
    const ctx = buildContext(state.data);
    return {
      ...ctx,
      propertyById: new Map(state.data.properties.map((p) => [p.id, p])),
      vendorById: new Map(state.data.vendors.map((v) => [v.id, v])),
      conversationById: new Map(state.data.conversations.map((c) => [c.id, c])),
      taskById: new Map(state.data.tasks.map((t) => [t.id, t])),
    };
  }, [state.data]);
}

export type Lookups = ReturnType<typeof useLookups>;

/** True when a record belongs to the selected property (or "All properties" is selected). */
export function useInScope() {
  const { state } = useStore();
  return useCallback((r: { propertyId?: string }) => state.propertyId === 'all' || r.propertyId === state.propertyId, [state.propertyId]);
}

/** Scoped dataset for the selected property. */
export function useScopedData() {
  const { state } = useStore();
  const inScope = useInScope();
  return useMemo(() => {
    const d = state.data;
    return {
      ...d,
      properties: d.properties.filter((p) => inScope({ propertyId: p.id })),
      units: d.units.filter(inScope),
      residents: d.residents.filter(inScope),
      prospects: d.prospects.filter(inScope),
      staff: d.staff.filter(inScope),
      tasks: d.tasks.filter(inScope),
      conversations: d.conversations.filter(inScope),
    };
  }, [state.data, inScope]);
}

export interface RoutedAlert extends Alert {
  route: Route;
  state: AlertState;
}

/** All current alerts for the selected property, routed by the automation level. */
export function useAlerts() {
  const { state } = useStore();
  const inScope = useInScope();
  const all = useMemo(() => computeAlerts(state), [state.data, state.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const routed: RoutedAlert[] = all
      .filter(inScope)
      .map((a) => ({ ...a, route: routeAlert(a, state.settings.automationLevel), state: state.alertState[a.id] ?? {} }));
    const isSnoozed = (a: RoutedAlert) => !!a.state.snoozedUntil && a.state.snoozedUntil > TODAY;
    return {
      all: routed,
      exceptions: routed.filter((a) => a.route === 'exception' && !a.state.resolved && !isSnoozed(a)),
      snoozed: routed.filter((a) => a.route === 'exception' && !a.state.resolved && isSnoozed(a)),
      approvals: routed.filter((a) => a.route === 'approval' && !state.rejected[a.id] && !a.state.resolved),
      /** Unfiltered by property, for previews such as the Settings automation preview. */
      portfolio: all,
    };
  }, [all, inScope, state.settings.automationLevel, state.alertState, state.rejected]);
}

export function useActor() {
  const { state } = useStore();
  return state.session?.name ?? 'Demo user';
}
