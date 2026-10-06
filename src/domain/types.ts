/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DOMAIN MODEL — every type in one place. Extend here first, then seed.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { IntegrationId } from '../config';

/** Calendar date, 'YYYY-MM-DD'. Plain strings sort correctly and survive JSON. */
export type ISODate = string;
/** Date and time, 'YYYY-MM-DDTHH:mm'. */
export type ISODateTime = string;

/* ── Portfolio and places ─────────────────────────────────────────────────── */

export interface Portfolio {
  id: string;
  name: string;
  propertyIds: string[];
}

export interface Property {
  id: string;
  name: string;
  city: string;
  state: string;
  unitCount: number;
  managerName: string;
}

export type UnitStatus = 'occupied' | 'notice' | 'vacant' | 'ready' | 'leased';

export interface Unit {
  id: string;
  propertyId: string;
  number: string;
  floorplan: string;
  beds: number;
  baths: number;
  sqft: number;
  /** Monthly market rent in dollars. */
  rent: number;
  status: UnitStatus;
  /** Current or most recent resident. */
  residentId?: string;
  /** Incoming resident (prospect who signed) for leased units. */
  incomingProspectId?: string;
  moveOutDate?: ISODate;
  /** Date the unit is available to move in — source of truth in the PMS. */
  availableDate?: ISODate;
  /** Date the CRM / listing site advertises. Differs from availableDate → "date mismatch". */
  crmAvailableDate?: ISODate;
}

/* ── People ───────────────────────────────────────────────────────────────── */

export type ResidentStage = 'current' | 'renewal_offered' | 'renewed' | 'notice_given';

export interface Resident {
  id: string;
  propertyId: string;
  unitId: string;
  name: string;
  phone: string;
  email: string;
  stage: ResidentStage;
  leaseStart: ISODate;
  leaseEnd: ISODate;
  /** Outstanding balance in dollars (0 = current). */
  balance: number;
  /** Date the oldest unpaid charge was due (only when balance > 0). */
  balanceDueDate?: ISODate;
  lastReminderDate?: ISODate;
  renewalOfferDate?: ISODate;
}

export type ProspectStage = 'inquiry' | 'tour_scheduled' | 'toured' | 'applied' | 'approved' | 'leased' | 'lost';

export interface Prospect {
  id: string;
  propertyId: string;
  name: string;
  phone: string;
  email: string;
  stage: ProspectStage;
  source: string;
  beds: number;
  desiredMoveIn: ISODate;
  interestedUnitId?: string;
  tourDate?: ISODate;
  followUpDate?: ISODate;
  lastContactDate: ISODate;
  /** Tour time label, e.g. "10:00 AM". */
  tourTime?: string;
  /** Who booked the tour. */
  tourBookedBy?: 'elise' | 'staff';
  /** Lease dates once signed. */
  leaseStart?: ISODate;
  leaseEnd?: ISODate;
}

export type StaffRole = 'Property manager' | 'Leasing agent' | 'Maintenance technician' | 'Porter';

export interface StaffMember {
  id: string;
  propertyId: string;
  name: string;
  role: StaffRole;
}

export interface Vendor {
  id: string;
  name: string;
  trade: TaskType;
}

/* ── Work ─────────────────────────────────────────────────────────────────── */

export type TaskType = 'inspection' | 'repair' | 'paint' | 'flooring' | 'clean' | 'final_walk' | 'service';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface Task {
  id: string;
  propertyId: string;
  unitId?: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  priority: Priority;
  /** Staff member id. Either assigneeId or vendorId (or neither = unassigned). */
  assigneeId?: string;
  vendorId?: string;
  /** Make-ready plan ordering within a unit (1, 2, 3 …). Absent for service requests. */
  sequence?: number;
  /** Cannot start before this date (e.g. part arrives, resident moves out). */
  earliestStart?: ISODate;
  start: ISODate;
  due: ISODate;
  durationDays: number;
  completedDate?: ISODate;
  blockedReason?: string;
  createdDate: ISODate;
  /** Notes captured in the field app. */
  notes?: string;
  photoCount?: number;
  /** Service requests: trade category (Plumbing, HVAC …). */
  category?: string;
  /** How the work order was created. */
  source?: 'elise' | 'staff' | 'portal' | 'make_ready';
}

/* ── Communication ────────────────────────────────────────────────────────── */

export type Channel = 'sms' | 'email' | 'voice' | 'chat';
export type ConversationTopic =
  | 'tour' | 'pricing' | 'application' | 'move_in' | 'maintenance'
  | 'renewal' | 'payment' | 'move_out' | 'complaint' | 'general';

export interface Message {
  id: string;
  at: ISODateTime;
  from: 'contact' | 'ai' | 'staff';
  authorName: string;
  body: string;
}

export interface Conversation {
  id: string;
  propertyId: string;
  channel: Channel;
  topic: ConversationTopic;
  subject: string;
  contact: { kind: 'prospect' | 'resident'; id: string; name: string };
  /** Who is handling it right now. */
  handledBy: 'ai' | 'staff';
  staffName?: string;
  escalated: boolean;
  escalationReason?: string;
  status: 'open' | 'waiting' | 'resolved';
  relatedTaskId?: string;
  messages: Message[];
}

/* ── Exceptions, approvals, audit ─────────────────────────────────────────── */

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type CollectionName = 'units' | 'tasks' | 'residents' | 'prospects' | 'conversations';
export type FieldValue = string | number | boolean | null;

export interface RecordRef {
  collection: CollectionName;
  id: string;
  /** Human label, e.g. "Unit 214" or "Paint — Unit 214". */
  label: string;
}

export interface FieldChange {
  field: string;
  /** Plain-language name of the field, e.g. "Listed available date". */
  label: string;
  from: FieldValue;
  to: FieldValue;
  /** Optional choices when a person edits the proposed value. */
  options?: { value: string; label: string }[];
  /** Shown but not editable in the Approval queue (e.g. a generated plan). */
  readOnly?: boolean;
}

/** A concrete change the system proposes to fix an alert. */
export interface Fix {
  label: string;
  /** low → can run automatically at Level 2. high → needs approval until Level 3. */
  risk: 'low' | 'high';
  target: RecordRef;
  changes: FieldChange[];
  /** Fixes that do more than set fields. Handled in automation.applyFix. */
  action?: 'createMakeReadyPlan';
}

/** Alert / Exception produced by a rule. Ids are stable: `${ruleId}:${recordId}`. */
export interface Alert {
  id: string;
  ruleId: string;
  ruleLabel: string;
  propertyId: string;
  severity: Severity;
  title: string;
  reason: string;
  impact: string;
  suggestedAction: string;
  record: RecordRef;
  fix?: Fix;
  /** Requires these systems to be connected. */
  requires: IntegrationId[];
}

export type AuditMode = 'approved' | 'automatic' | 'rejected' | 'manual' | 'snoozed';

export interface AuditEvent {
  id: string;
  at: ISODateTime;
  actor: string;
  action: string;
  mode: AuditMode;
  target?: RecordRef;
  propertyId?: string;
  changes?: FieldChange[];
  note?: string;
}

/* ── Resident ledger (PMS) ────────────────────────────────────────────────── */

export type LedgerType = 'rent' | 'fee' | 'payment' | 'credit' | 'balance_forward';

export interface LedgerEntry {
  id: string;
  residentId: string;
  propertyId: string;
  date: ISODate;
  type: LedgerType;
  description: string;
  /** Positive = charge, negative = payment or credit. */
  amount: number;
}

/* ── The whole dataset ────────────────────────────────────────────────────── */

export interface Dataset {
  portfolio: Portfolio;
  properties: Property[];
  units: Unit[];
  residents: Resident[];
  prospects: Prospect[];
  staff: StaffMember[];
  vendors: Vendor[];
  tasks: Task[];
  conversations: Conversation[];
  ledger: LedgerEntry[];
}

export type AutomationLevel = 1 | 2 | 3;
