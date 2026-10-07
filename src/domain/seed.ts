/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MOCK DATA — deterministic. Same seed + same "today" ⇒ identical dataset.
 *
 *  Structure:
 *    1. Static reference data (properties, floorplans, staff, vendors, names)
 *    2. Units — mostly random by weight, plus PLANTED scenarios per property so
 *       every screen and rule has something interesting to show
 *    3. Make-ready plans for non-occupied units, service requests for occupied units
 *    4. Residents, prospects, conversations
 *
 *  To adapt: edit the static data, the SCENARIOS list, or add a new generator
 *  at the bottom of createSeedData().
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CONFIG } from '../config';
import { addDays, daysBetween, maxDate } from './dates';
import { TOUR_SLOTS, triage } from './elise';
import { createRng, type Rng } from './random';
import { forecastPlan, unitPlan } from './workplan';
import type {
  AuditEvent, Conversation, ConversationTopic, Channel, Dataset, ISODate, LedgerEntry, Message, Priority,
  Property, Prospect, ProspectStage, Resident, StaffMember, Task, TaskType, Unit, UnitStatus, Vendor,
} from './types';

/* ── 1. Static reference data ─────────────────────────────────────────────── */

interface PropertySpec extends Omit<Property, 'unitCount'> {
  floors: number;
  perFloor: number;
  rentFactor: number;
  staff: { name: string; role: StaffMember['role'] }[];
}

const PROPERTY_SPECS: PropertySpec[] = [
  {
    id: 'p-linden', name: 'The Linden at Riverside', city: 'Austin', state: 'TX', managerName: 'Priya Shah',
    floors: 4, perFloor: 21, rentFactor: 1.0,
    staff: [
      { name: 'Priya Shah', role: 'Property manager' }, { name: 'Jordan Lee', role: 'Leasing agent' },
      { name: 'Tom Reyes', role: 'Maintenance technician' }, { name: 'Dana Brooks', role: 'Maintenance technician' },
      { name: 'Luis Ortega', role: 'Porter' },
    ],
  },
  {
    id: 'p-harbor', name: 'Harbor Point Apartments', city: 'Tampa', state: 'FL', managerName: 'Marcus Webb',
    floors: 3, perFloor: 24, rentFactor: 0.94,
    staff: [
      { name: 'Marcus Webb', role: 'Property manager' }, { name: 'Aisha Khan', role: 'Leasing agent' },
      { name: 'Ray Dalton', role: 'Maintenance technician' }, { name: 'Kim Nguyen', role: 'Maintenance technician' },
      { name: 'Sam Patel', role: 'Porter' },
    ],
  },
  {
    id: 'p-cedar', name: 'Cedar Row Townhomes', city: 'Denver', state: 'CO', managerName: 'Elena Torres',
    floors: 2, perFloor: 24, rentFactor: 1.12,
    staff: [
      { name: 'Elena Torres', role: 'Property manager' }, { name: 'Chris Walker', role: 'Leasing agent' },
      { name: 'Mateo Silva', role: 'Maintenance technician' }, { name: 'Grace Owens', role: 'Maintenance technician' },
      { name: 'Nia Brown', role: 'Porter' },
    ],
  },
];

const FLOORPLANS = [
  { code: 'S1', beds: 0, baths: 1, sqft: 520, base: 1180, weight: 1 },
  { code: 'A1', beds: 1, baths: 1, sqft: 690, base: 1390, weight: 3 },
  { code: 'A2', beds: 1, baths: 1, sqft: 760, base: 1475, weight: 2 },
  { code: 'B1', beds: 2, baths: 2, sqft: 1040, base: 1820, weight: 3 },
  { code: 'B2', beds: 2, baths: 2, sqft: 1125, base: 1940, weight: 1.5 },
  { code: 'C1', beds: 3, baths: 2, sqft: 1310, base: 2350, weight: 0.8 },
] as const;

export const VENDORS: Vendor[] = [
  { id: 'v-brightcoat', name: 'BrightCoat Painting', trade: 'paint' },
  { id: 'v-summit', name: 'Summit Flooring', trade: 'flooring' },
  { id: 'v-sparkle', name: 'Sparkle Turn Cleaning', trade: 'clean' },
  { id: 'v-profix', name: 'ProFix Appliance', trade: 'repair' },
  { id: 'v-coolair', name: 'CoolAir HVAC', trade: 'service' },
];

const FIRST = ['Maya', 'Ethan', 'Sofia', 'Noah', 'Olivia', 'Liam', 'Ava', 'Lucas', 'Isabella', 'Mason', 'Mia', 'James', 'Amelia', 'Benjamin',
  'Harper', 'Elijah', 'Evelyn', 'Daniel', 'Abigail', 'Henry', 'Emily', 'Jackson', 'Ella', 'Sebastian', 'Camila', 'Aiden', 'Aria', 'Matthew',
  'Scarlett', 'Samuel', 'Chloe', 'David', 'Layla', 'Joseph', 'Zoe', 'Carter', 'Nora', 'Owen', 'Lily', 'Wyatt', 'Hannah', 'John', 'Riley',
  'Julian', 'Leah', 'Isaac', 'Grace', 'Gabriel', 'Victoria', 'Anthony', 'Naomi', 'Dylan', 'Priya', 'Omar', 'Mei', 'Kofi', 'Yara', 'Ravi',
  'Fatima', 'Hiro', 'Ana', 'Malik', 'Ingrid', 'Tariq', 'Lucia', 'Andre'];
const LAST = ['Anderson', 'Bennett', 'Carter', 'Diaz', 'Ellis', 'Foster', 'Garcia', 'Hughes', 'Ibrahim', 'Jensen', 'Kowalski', 'Lopez',
  'Mitchell', 'Nakamura', 'Okafor', 'Park', 'Quinn', 'Ramirez', 'Sullivan', 'Thompson', 'Underwood', 'Vasquez', 'Washington', 'Xu',
  'Young', 'Zimmerman', 'Alvarez', 'Brooks', 'Chen', 'Dubois', 'Evans', 'Fischer', 'Gupta', 'Hernandez', 'Ito', 'Johnson', 'Kim', 'Lee',
  'Morales', 'Nguyen', 'Olsen', 'Patel', 'Reyes', 'Singh', 'Torres', 'Walsh', 'Abbott', 'Baker', 'Cruz', 'Delgado', 'Fernandez', 'Grant'];

const SERVICE_TEMPLATES: { title: string; priority: Priority; vendor?: boolean; blockedReason?: string }[] = [
  { title: 'AC not cooling', priority: 'high', vendor: true, blockedReason: 'Waiting on compressor capacitor (part ordered)' },
  { title: 'No hot water', priority: 'urgent', blockedReason: 'Water heater replacement needs manager approval' },
  { title: 'Leaking kitchen faucet', priority: 'normal' },
  { title: 'Garbage disposal jammed', priority: 'normal' },
  { title: 'Bedroom outlet not working', priority: 'high' },
  { title: 'Dishwasher not draining', priority: 'normal', blockedReason: 'Waiting on dishwasher pump (ETA 3 days)' },
  { title: 'Smoke detector chirping', priority: 'high' },
  { title: 'Front door lock sticking', priority: 'normal' },
  { title: 'Bathroom fan noisy', priority: 'low' },
  { title: 'Pest treatment requested', priority: 'normal' },
  { title: 'Toilet running constantly', priority: 'normal' },
  { title: 'Window screen torn', priority: 'low' },
  { title: 'Refrigerator not cold', priority: 'urgent', vendor: true },
  { title: 'Ceiling stain in hallway', priority: 'high', blockedReason: 'Need access to unit above' },
  { title: 'Closet door off track', priority: 'low' },
];

const SLA_DAYS: Record<Priority, number> = { urgent: 1, high: 2, normal: 4, low: 7 };

/** Make-ready plan template: ordered steps, who usually does them, and duration range. */
const MAKE_READY_STEPS: { type: TaskType; title: string; dur: [number, number]; who: 'tech' | 'vendor' | 'clean'; chance?: number }[] = [
  { type: 'inspection', title: 'Move-out inspection', dur: [1, 1], who: 'tech' },
  { type: 'repair', title: 'Repairs', dur: [1, 2], who: 'tech' },
  { type: 'paint', title: 'Paint', dur: [1, 2], who: 'vendor' },
  { type: 'flooring', title: 'Carpet and flooring', dur: [1, 1], who: 'vendor', chance: 0.5 },
  { type: 'clean', title: 'Clean', dur: [1, 1], who: 'clean' },
  { type: 'final_walk', title: 'Final walk', dur: [1, 1], who: 'tech' },
];

/* ── Planted scenarios (one of each per property) ─────────────────────────── */

type Scenario =
  | 'leased_late'       // leased unit, paint blocked → make-ready finishes after move-in (critical)
  | 'vacant_slipped'    // vacant unit, repairs past due → plan running late
  | 'ready_early'       // ready unit with a future available date
  | 'notice_unassigned' // notice unit, plan has unassigned steps
  | 'mismatch'          // CRM advertises a different date than the PMS
  | 'vacant_noplan';    // vacant unit with no make-ready plan at all

const SCENARIOS: Scenario[] = ['leased_late', 'vacant_slipped', 'ready_early', 'notice_unassigned', 'mismatch', 'vacant_noplan'];

/* ── Generator ────────────────────────────────────────────────────────────── */

export function createSeedData(seed: number = CONFIG.seed, today: ISODate = CONFIG.today): Dataset {
  const rng = createRng(seed);
  const d = (n: number) => addDays(today, n);
  const usedNames = new Set<string>();
  const personName = () => {
    for (;;) {
      const n = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
  };
  // 555-0100…0199 is reserved for fictional use.
  const phone = () => `(${rng.pick(['512', '813', '720'])}) 555-01${rng.int(0, 9)}${rng.int(0, 9)}`;
  const email = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;

  const properties: Property[] = [];
  const staff: StaffMember[] = [];
  const units: Unit[] = [];
  const residents: Resident[] = [];
  const prospects: Prospect[] = [];
  const tasks: Task[] = [];
  const conversations: Conversation[] = [];
  let taskSeq = 1000;
  const nextTaskId = () => `t-${++taskSeq}`;

  for (const spec of PROPERTY_SPECS) {
    const { floors, perFloor, rentFactor, staff: staffSpec, ...base } = spec;
    properties.push({ ...base, unitCount: floors * perFloor });
    const propStaff = staffSpec.map((s, i) => ({ id: `${spec.id}-s${i + 1}`, propertyId: spec.id, ...s }));
    staff.push(...propStaff);
    const techs = propStaff.filter((s) => s.role === 'Maintenance technician');
    const porter = propStaff.find((s) => s.role === 'Porter')!;

    /* 2. Units */
    const propUnits: Unit[] = [];
    for (let f = 1; f <= floors; f++) {
      for (let i = 1; i <= perFloor; i++) {
        const fp = rng.weighted(FLOORPLANS.map((p) => [p, p.weight] as const));
        const rent = Math.round((fp.base * rentFactor * (1 + (f - 1) * 0.012 + rng.next() * 0.06 - 0.02)) / 5) * 5;
        const status = rng.weighted<UnitStatus>([['occupied', 82], ['notice', 7], ['vacant', 5], ['ready', 3], ['leased', 3]]);
        propUnits.push({
          id: `${spec.id}-u${f}${String(i).padStart(2, '0')}`,
          propertyId: spec.id,
          number: `${f}${String(i).padStart(2, '0')}`,
          floorplan: fp.code, beds: fp.beds, baths: fp.baths, sqft: fp.sqft, rent, status,
        });
      }
    }
    // Plant scenarios on deterministic, spread-out units.
    const scenarioOf = new Map<string, Scenario>();
    rng.shuffle(propUnits).slice(0, SCENARIOS.length).forEach((u, i) => scenarioOf.set(u.id, SCENARIOS[i]));

    const assignFor = (who: 'tech' | 'vendor' | 'clean', type: TaskType) => {
      if (who === 'vendor') return { vendorId: VENDORS.find((v) => v.trade === type)!.id };
      if (who === 'clean') return rng.chance(0.5) ? { vendorId: 'v-sparkle' } : { assigneeId: porter.id };
      return { assigneeId: rng.pick(techs).id };
    };

    /** Builds a make-ready plan; returns tasks. `opts` steer planted scenarios. */
    /** `stale`: a slipped step does NOT push later steps — the plan is out of date (Elise re-plans it). */
    const buildPlan = (u: Unit, opts: { slipAt?: TaskType; blockAt?: TaskType; unassign?: TaskType[]; allDone?: boolean; stale?: boolean } = {}) => {
      const plan: Task[] = [];
      let cursor = addDays(u.moveOutDate!, 1);
      let slipped = false;
      let seq = 0;
      for (const step of MAKE_READY_STEPS) {
        if (step.chance !== undefined && !rng.chance(step.chance) && step.type !== opts.blockAt && step.type !== opts.slipAt) continue;
        const dur = rng.int(step.dur[0], step.dur[1]);
        const start = cursor;
        const end = addDays(start, dur - 1);
        const task: Task = {
          id: nextTaskId(), propertyId: spec.id, unitId: u.id, type: step.type,
          title: step.title, status: 'todo', priority: u.status === 'leased' ? 'high' : 'normal',
          sequence: ++seq, start, due: end, durationDays: dur,
          createdDate: maxDate(addDays(u.moveOutDate!, -10), addDays(today, -40)),
          ...assignFor(step.who, step.type),
        };
        const randomSlip = !opts.allDone && opts.slipAt === undefined && opts.blockAt === undefined && rng.chance(0.08);
        const isDone = opts.allDone || (!slipped && end < today && step.type !== opts.slipAt && step.type !== opts.blockAt && !randomSlip);
        if (isDone) {
          task.status = 'done';
          task.completedDate = end;
          cursor = addDays(end, 1);
        } else if (step.type === opts.blockAt) {
          task.status = 'blocked';
          task.blockedReason = step.type === 'paint'
            ? 'Vendor rescheduled — paint crew unavailable until ' + d(3).slice(5).replace('-', '/')
            : 'Waiting on replacement part';
          task.earliestStart = d(3);
          task.start = maxDate(start, today);
          task.due = addDays(task.start, dur - 1);
          slipped = true;
          cursor = addDays(d(3), dur);
        } else if (!slipped && end < today) {
          // Slipped: started on time but still not finished → past due.
          task.status = 'in_progress';
          slipped = true;
          cursor = opts.stale ? addDays(end, 1) : d(1);
        } else {
          if (slipped && !opts.stale) {
            task.start = maxDate(cursor, d(1));
            task.due = addDays(task.start, dur - 1);
          }
          task.status = !slipped && task.start <= today && today <= task.due ? 'in_progress' : 'todo';
          cursor = addDays(task.due, 1);
        }
        const unassign = opts.unassign?.includes(step.type) || (task.status !== 'done' && rng.chance(0.02));
        if (unassign && task.status !== 'done') {
          delete task.assigneeId;
          delete task.vendorId;
        }
        plan.push(task);
      }
      return plan;
    };

    for (const u of propUnits) {
      const scenario = scenarioOf.get(u.id);
      if (scenario === 'leased_late') {
        Object.assign(u, { status: 'leased', moveOutDate: d(-5), availableDate: d(2) });
        tasks.push(...buildPlan(u, { blockAt: 'paint' }));
      } else if (scenario === 'vacant_slipped') {
        Object.assign(u, { status: 'vacant', moveOutDate: d(-7), availableDate: d(1) });
        tasks.push(...buildPlan(u, { slipAt: 'repair', stale: true }));
      } else if (scenario === 'ready_early') {
        Object.assign(u, { status: 'ready', moveOutDate: d(-12), availableDate: d(7) });
        tasks.push(...buildPlan(u, { allDone: true }));
      } else if (scenario === 'notice_unassigned') {
        Object.assign(u, { status: 'notice', moveOutDate: d(4), availableDate: d(13) });
        tasks.push(...buildPlan(u, { unassign: ['repair', 'clean'] }));
      } else if (scenario === 'mismatch') {
        Object.assign(u, { status: 'vacant', moveOutDate: d(-3), availableDate: d(6) });
        tasks.push(...buildPlan(u, {}));
        u.crmAvailableDate = d(2);
      } else if (scenario === 'vacant_noplan') {
        Object.assign(u, { status: 'vacant', moveOutDate: d(-2), availableDate: d(9) });
      } else if (u.status === 'notice') {
        u.moveOutDate = d(rng.int(3, 28));
        u.availableDate = addDays(u.moveOutDate, rng.int(8, 12));
        tasks.push(...buildPlan(u));
      } else if (u.status === 'vacant' || u.status === 'leased') {
        u.moveOutDate = d(-rng.int(1, 12));
        u.availableDate = addDays(u.moveOutDate, rng.int(9, 14));
        tasks.push(...buildPlan(u));
      } else if (u.status === 'ready') {
        u.moveOutDate = d(-rng.int(14, 40));
        u.availableDate = addDays(u.moveOutDate, rng.int(8, 12));
        if (u.availableDate > today && rng.chance(0.5)) u.availableDate = today;
        tasks.push(...buildPlan(u, { allDone: true }));
      }
      if (u.availableDate && u.crmAvailableDate === undefined) {
        u.crmAvailableDate = scenario === undefined && u.status !== 'occupied' && rng.chance(0.1)
          ? addDays(u.availableDate, rng.pick([-4, -3, -2, 2, 3]))
          : u.availableDate;
      }
    }
    units.push(...propUnits);

    /* 4a. Residents (occupied + notice units). Plant one renewal risk and one delinquency per property. */
    let plantedRenewal = false;
    let plantedDelinquent = false;
    for (const u of propUnits.filter((x) => x.status === 'occupied' || x.status === 'notice')) {
      const name = personName();
      let leaseEnd = u.status === 'notice' ? u.moveOutDate! : d(rng.int(8, 370));
      let stage: Resident['stage'] = u.status === 'notice' ? 'notice_given' : 'current';
      const days = daysBetween(today, leaseEnd);
      if (stage === 'current' && days <= 60) stage = rng.weighted([['current', 45], ['renewal_offered', 40], ['renewed', 15]]);
      if (stage === 'current' && !plantedRenewal) {
        leaseEnd = d(34);
        plantedRenewal = true;
      }
      let balance = rng.chance(0.09) ? Math.round(rng.int(150, 2400) / 5) * 5 : 0;
      if (!plantedDelinquent && u.status === 'occupied' && stage === 'current' && days > 90) {
        balance = 1875;
        plantedDelinquent = true;
      }
      const r: Resident = {
        id: `r-${u.id}`, propertyId: spec.id, unitId: u.id, name, phone: phone(), email: email(name), stage,
        leaseStart: addDays(leaseEnd, -365), leaseEnd, balance,
      };
      if (stage === 'renewal_offered') r.renewalOfferDate = d(-rng.int(3, 20));
      if (balance > 0) {
        r.balanceDueDate = balance > 1800 ? '2026-09-01' : '2026-10-01';
        if (balance !== 1875 && rng.chance(0.5)) r.lastReminderDate = d(-rng.int(1, 3));
      }
      residents.push(r);
      u.residentId = r.id;
    }

    /* 3b. Service requests on occupied units. Plant: urgent past-due, unassigned, blocked. */
    const occupied = rng.shuffle(propUnits.filter((u) => u.status === 'occupied'));
    const serviceCount = Math.round(occupied.length * 0.15);
    for (let i = 0; i < serviceCount; i++) {
      const u = occupied[i];
      const tpl = SERVICE_TEMPLATES[(i * 7 + PROPERTY_SPECS.indexOf(spec) * 3) % SERVICE_TEMPLATES.length];
      const created = d(-rng.int(0, 9));
      const due = addDays(created, SLA_DAYS[tpl.priority]);
      const t: Task = {
        id: nextTaskId(), propertyId: spec.id, unitId: u.id, type: 'service', title: tpl.title, status: 'todo',
        priority: tpl.priority, start: created, due, durationDays: 1, createdDate: created,
        ...(tpl.vendor ? { vendorId: 'v-coolair' } : { assigneeId: rng.pick(techs).id }),
      };
      const planted = i < 3 ? (['late', 'unassigned', 'blocked'] as const)[i] : undefined;
      if (planted === 'late') {
        Object.assign(t, { title: tpl.title, priority: 'urgent', start: d(-4), createdDate: d(-4), due: d(-3), status: 'in_progress' });
      } else if (planted === 'unassigned') {
        Object.assign(t, { start: today, createdDate: today, due: d(1), priority: 'high' });
        delete t.assigneeId;
        delete t.vendorId;
      } else if (planted === 'blocked' || (tpl.blockedReason && rng.chance(0.25))) {
        Object.assign(t, { status: 'blocked', blockedReason: tpl.blockedReason ?? 'Waiting on resident to confirm access', earliestStart: d(rng.int(1, 4)) });
      } else if (due < today) {
        if (rng.chance(0.8)) Object.assign(t, { status: 'done', completedDate: addDays(due, -rng.int(0, 1)) });
        else t.status = 'in_progress';
      } else if (created < today) {
        t.status = rng.chance(0.6) ? 'in_progress' : 'todo';
      }
      tasks.push(t);
    }

    /* 4b. Prospects. Leased units get their incoming resident; plant a tour no-show. */
    const available = propUnits.filter((u) => u.status === 'vacant' || u.status === 'ready' || u.status === 'notice');
    for (const u of propUnits.filter((x) => x.status === 'leased')) {
      const name = personName();
      const p: Prospect = {
        id: `pr-${u.id}`, propertyId: spec.id, name, phone: phone(), email: email(name), stage: 'leased',
        source: rng.pick(['Website', 'Listing site', 'Referral']), beds: u.beds, desiredMoveIn: u.availableDate!,
        interestedUnitId: u.id, lastContactDate: d(-rng.int(1, 5)), leaseStart: u.availableDate!, leaseEnd: addDays(u.availableDate!, 364),
      };
      prospects.push(p);
      u.incomingProspectId = p.id;
    }
    const prospectCount = 13 + rng.int(0, 4);
    for (let i = 0; i < prospectCount; i++) {
      const name = personName();
      const stage: ProspectStage = i === 0 ? 'tour_scheduled' : rng.weighted([
        ['inquiry', 4], ['tour_scheduled', 3], ['toured', 3], ['applied', 2], ['approved', 1], ['lost', 1.2],
      ]);
      const unit = available.length ? rng.pick(available) : undefined;
      const p: Prospect = {
        id: `pr-${spec.id}-${i + 1}`, propertyId: spec.id, name, phone: phone(), email: email(name), stage,
        source: rng.pick(['Website', 'Listing site', 'Referral', 'Walk-in', 'Social ad']),
        beds: unit?.beds ?? rng.int(1, 2), desiredMoveIn: d(rng.int(7, 60)), interestedUnitId: unit?.id,
        lastContactDate: d(-rng.int(0, 6)),
      };
      if (stage === 'tour_scheduled') p.tourDate = i === 0 ? d(-1) : d(rng.int(-2, 6));
      if (stage === 'toured') p.tourDate = d(-rng.int(1, 8));
      prospects.push(p);
    }
  }

  /* 4c. Conversations */
  conversations.push(...buildConversations(rng, today, { units, residents, prospects, tasks, staff }));

  /* 5. Details added with a separate random stream so the dataset above stays stable. */
  const rng2 = createRng(seed + 1);
  const linked = new Set(conversations.map((c) => c.relatedTaskId).filter(Boolean));
  for (const t of tasks) {
    if (t.sequence !== undefined) t.source = 'make_ready';
    else {
      t.category = triage(t.title, 'resident').category ?? 'General';
      t.source = linked.has(t.id) ? 'elise' : rng2.weighted([['elise', 55], ['portal', 30], ['staff', 15]]);
    }
  }
  // One blocked-but-still-on-time turn per property: a step waits on a part, with slack to absorb it.
  for (const p of properties) {
    for (const u of units.filter((x) => x.propertyId === p.id && (x.status === 'vacant' || x.status === 'notice') && x.availableDate)) {
      const plan = unitPlan(tasks, u.id);
      const step = plan.find((t) => t.status === 'todo' && t.type === 'repair' && t.start > today);
      if (!step || forecastPlan(plan, today).readyDate > addDays(u.availableDate!, -3)) continue;
      Object.assign(step, { status: 'blocked', blockedReason: 'Waiting on replacement countertop (ETA confirmed)', earliestStart: step.start });
      break;
    }
  }

  // Vendor visits: started ones are confirmed; about half of upcoming ones still need confirming.
  for (const t of tasks) {
    if (!t.vendorId || t.status === 'done') continue;
    t.vendorConfirmed = t.start <= today || t.status !== 'todo' ? true : rng2.chance(0.5);
  }
  for (const p of properties) {
    const upcoming = tasks.find((t) => t.propertyId === p.id && t.vendorId && t.status === 'todo' && t.start > today && t.start <= addDays(today, 3));
    if (upcoming) upcoming.vendorConfirmed = false;
  }
  for (const p of prospects) {
    if (p.tourDate) {
      p.tourTime = rng2.pick(TOUR_SLOTS);
      p.tourBookedBy = rng2.chance(0.75) ? 'elise' : 'staff';
    }
  }
  const ledger = buildLedger(residents, units, today);

  return {
    portfolio: { id: 'pf-1', name: CONFIG.organizationName, propertyIds: properties.map((p) => p.id) },
    properties, units, residents, prospects, staff, vendors: VENDORS, tasks, conversations, ledger,
  };
}

/** Two months of rent charges and payments per resident, summing to their current balance. */
function buildLedger(residents: Resident[], units: Unit[], today: ISODate): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const month = today.slice(0, 8); // 'YYYY-MM-'
  const prev = addDays(`${month}01`, -1).slice(0, 8);
  for (const r of residents) {
    const rent = units.find((u) => u.id === r.unitId)?.rent ?? 0;
    let n = 0;
    const add = (date: ISODate, type: LedgerEntry['type'], description: string, amount: number) =>
      out.push({ id: `l-${r.id}-${++n}`, residentId: r.id, propertyId: r.propertyId, date, type, description, amount });
    if (r.balance > rent) add(`${prev}01`, 'balance_forward', 'Balance forward', r.balance - rent);
    add(`${prev}01`, 'rent', 'Rent', rent);
    add(`${prev}03`, 'payment', 'Online payment', -rent);
    add(`${month}01`, 'rent', 'Rent', rent);
    const paid = r.balance >= rent ? 0 : rent - r.balance;
    if (paid > 0) add(`${month}0${paid === rent ? 2 : 3}`, 'payment', paid === rent ? 'Online payment' : 'Partial payment', -paid);
  }
  return out;
}

/* ── Conversations ────────────────────────────────────────────────────────── */

interface ConvCtx {
  units: Unit[];
  residents: Resident[];
  prospects: Prospect[];
  tasks: Task[];
  staff: StaffMember[];
}

function buildConversations(rng: Rng, today: ISODate, ctx: ConvCtx): Conversation[] {
  const out: Conversation[] = [];
  const AI = CONFIG.brand.assistantName;
  let n = 0;
  const unitOf = (id?: string) => ctx.units.find((u) => u.id === id);
  const first = (name: string) => name.split(' ')[0];

  const make = (
    propertyId: string,
    contact: Conversation['contact'],
    channel: Channel,
    topic: ConversationTopic,
    subject: string,
    lines: [Message['from'], string][],
    extra: Partial<Conversation> = {},
  ) => {
    const day = extra.status === 'resolved' ? addDays(today, -rng.int(1, 3)) : rng.chance(0.7) ? today : addDays(today, -1);
    let minutes = rng.int(8 * 60, 14 * 60);
    const leasing = ctx.staff.find((s) => s.propertyId === propertyId && s.role === 'Leasing agent')!;
    const messages: Message[] = lines.map(([from, body], i) => {
      // Elise answers within a minute; staff and contacts take longer.
      minutes += from === 'ai' ? rng.int(0, 1) : from === 'staff' ? rng.int(6, 40) : rng.int(2, 25);
      return {
        id: `m-${n}-${i}`,
        at: `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
        from,
        authorName: from === 'contact' ? contact.name : from === 'ai' ? AI : extra.staffName ?? leasing.name,
        body,
      };
    });
    out.push({
      id: `c-${++n}`, propertyId, channel, topic, subject, contact, messages,
      handledBy: 'ai', escalated: false, status: 'open', ...extra,
    });
  };

  for (const propertyId of [...new Set(ctx.units.map((u) => u.propertyId))]) {
    const pUnits = ctx.units.filter((u) => u.propertyId === propertyId);
    const pRes = ctx.residents.filter((r) => r.propertyId === propertyId);
    const pPros = ctx.prospects.filter((p) => p.propertyId === propertyId);
    const leasing = ctx.staff.find((s) => s.propertyId === propertyId && s.role === 'Leasing agent')!;

    // Incoming resident whose make-ready is late → escalated move-in question.
    const leasedLate = pPros.find((p) => p.stage === 'leased' && unitOf(p.interestedUnitId)?.availableDate === addDays(today, 2));
    if (leasedLate) {
      const u = unitOf(leasedLate.interestedUnitId)!;
      make(propertyId, { kind: 'prospect', id: leasedLate.id, name: leasedLate.name }, 'email', 'move_in', `Move-in on unit ${u.number}`, [
        ['contact', `Hi, just confirming I can pick up keys for unit ${u.number} on my move-in date. My movers are booked for the morning.`],
        ['ai', `Hi ${first(leasedLate.name)}, thanks for confirming. I'm checking the unit's readiness with the maintenance team and will follow up shortly.`],
        ['contact', 'Thanks. Is everything still on track? I have to be out of my current place that day.'],
      ], { escalated: true, escalationReason: 'Move-in date at risk: make-ready is behind schedule', status: 'waiting' });
    }

    // Resident with a past-due service request → upset follow-up via voice.
    const lateTask = ctx.tasks.find((t) => t.propertyId === propertyId && t.type === 'service' && t.status === 'in_progress' && t.due < today);
    const lateRes = lateTask && pRes.find((r) => r.unitId === lateTask.unitId);
    if (lateTask && lateRes) {
      make(propertyId, { kind: 'resident', id: lateRes.id, name: lateRes.name }, 'voice', 'maintenance', `${lateTask.title} — follow-up call`, [
        ['contact', `[Call transcript] This is ${lateRes.name} in ${unitOf(lateRes.unitId)?.number}. I reported "${lateTask.title.toLowerCase()}" a few days ago and nobody has come back. This is the second time I'm calling.`],
        ['ai', `I'm sorry about the wait, ${first(lateRes.name)}. I can see your request is open and assigned. I'm flagging this for the property team now so someone can give you a firm time.`],
        ['contact', 'Please do. I need a real answer today.'],
      ], { escalated: true, escalationReason: 'Second follow-up on a past-due urgent request', relatedTaskId: lateTask.id });
    }

    // Other open service requests → routine SMS handled by AI.
    const openSvc = ctx.tasks.filter((t) => t.propertyId === propertyId && t.type === 'service' && t.status !== 'done' && t.id !== lateTask?.id).slice(0, 2);
    for (const t of openSvc) {
      const r = pRes.find((x) => x.unitId === t.unitId);
      if (!r) continue;
      make(propertyId, { kind: 'resident', id: r.id, name: r.name }, 'sms', 'maintenance', t.title, [
        ['contact', `Hi, ${t.title.toLowerCase()} in my apartment. Can someone take a look?`],
        ['ai', `Thanks ${first(r.name)}, I've created a work order for "${t.title}". Is it OK for a technician to enter if you're not home?`],
        ['contact', 'Yes that is fine. Any idea when?'],
      ], { relatedTaskId: t.id });
    }

    // Renewal question with a concession request → escalated.
    const renewal = pRes.find((r) => r.stage === 'renewal_offered') ?? pRes.find((r) => r.stage === 'current');
    if (renewal) {
      make(propertyId, { kind: 'resident', id: renewal.id, name: renewal.name }, 'email', 'renewal', 'Renewal offer question', [
        ['contact', 'I got the renewal offer. The increase is more than I expected — is there any flexibility if I sign a 15-month lease?'],
        ['ai', `Thanks for reaching out, ${first(renewal.name)}. Longer terms are sometimes priced differently. I'm passing this to the property manager so they can review options with you.`],
      ], { escalated: true, escalationReason: 'Rent concession request needs manager approval' });
    }

    // Payment plan request.
    const delinquent = pRes.find((r) => r.balance > 0);
    if (delinquent) {
      make(propertyId, { kind: 'resident', id: delinquent.id, name: delinquent.name }, 'sms', 'payment', 'Balance and payment plan', [
        ['ai', `Hi ${first(delinquent.name)}, this is a reminder that your account shows a balance of $${delinquent.balance.toLocaleString()}. You can pay in the resident portal.`],
        ['contact', 'I lost hours at work this month. Can I split it into two payments?'],
      ], { escalated: delinquent.balance > 1000, escalationReason: delinquent.balance > 1000 ? 'Payment plan request over $1,000' : undefined, status: 'open' });
    }

    // Prospect tour + pricing (AI-handled, routine).
    const inquiry = pPros.filter((p) => p.stage === 'inquiry' || p.stage === 'tour_scheduled' || p.stage === 'toured').slice(0, 3);
    if (inquiry[0]) {
      const p = inquiry[0];
      make(propertyId, { kind: 'prospect', id: p.id, name: p.name }, 'sms', 'tour', 'Tour request', [
        ['contact', `Hi! Do you have any ${p.beds === 0 ? 'studios' : `${p.beds} bedrooms`} available? I'd like to see one this week.`],
        ['ai', `Hi ${first(p.name)}! Yes — we have a few options. I can book a tour Thursday at 10:00 AM or 2:30 PM. Which works better?`],
        ['contact', 'Thursday 2:30 works.'],
      ], { status: 'resolved' });
    }
    if (inquiry[1]) {
      const p = inquiry[1];
      make(propertyId, { kind: 'prospect', id: p.id, name: p.name }, 'chat', 'pricing', 'Pricing and move-in', [
        ['contact', `What's the rent on your ${p.beds === 0 ? 'studios' : `${p.beds} bed`} units, and what's the earliest I could move in?`],
      ]);
    }
    if (inquiry[2]) {
      const p = inquiry[2];
      make(propertyId, { kind: 'prospect', id: p.id, name: p.name }, 'email', 'general', 'Pet policy', [
        ['contact', 'Do you allow dogs? I have a 50 lb lab mix.'],
        ['ai', `Hi ${first(p.name)}, yes — we welcome dogs up to 75 lb, two pets per home. There's a $350 pet fee and $35 monthly pet rent. Would you like to schedule a tour?`],
        ['contact', 'Great, thank you!'],
      ], { status: 'resolved' });
    }

    // No-show follow-up waiting.
    const noShow = pPros.find((p) => p.stage === 'tour_scheduled' && p.tourDate && p.tourDate < today);
    if (noShow) {
      make(propertyId, { kind: 'prospect', id: noShow.id, name: noShow.name }, 'sms', 'tour', 'Missed tour', [
        ['ai', `Hi ${first(noShow.name)}, we had you down for a tour yesterday. Would you like to pick a new time?`],
      ], { status: 'waiting' });
    }

    // Move-out instructions for a notice resident (resolved).
    const notice = pRes.find((r) => r.stage === 'notice_given');
    if (notice) {
      make(propertyId, { kind: 'resident', id: notice.id, name: notice.name }, 'email', 'move_out', 'Move-out checklist', [
        ['contact', 'What do I need to do before I move out?'],
        ['ai', `Hi ${first(notice.name)}, here's the checklist: return all keys and fobs, remove all belongings, and leave the unit broom-clean. Your move-out inspection is scheduled for the day after your lease ends. Your deposit will be processed within 30 days.`],
      ], { status: 'resolved' });
    }

    // Noise complaint handled by staff.
    const complainer = pRes[pRes.length - 3];
    if (complainer) {
      make(propertyId, { kind: 'resident', id: complainer.id, name: complainer.name }, 'chat', 'complaint', 'Noise from upstairs', [
        ['contact', 'The unit above me has been loud past midnight three nights in a row.'],
        ['ai', "I'm sorry to hear that. I've logged a noise complaint and shared it with the property team."],
        ['staff', `Hi ${first(complainer.name)}, this is ${leasing.name}. We've reached out to the neighbor and will follow up with you tomorrow.`],
      ], { handledBy: 'staff', staffName: leasing.name, escalated: false, status: 'waiting' });
    }

    // Lease break question → voice, escalated.
    const breaker = pRes[Math.floor(pRes.length / 2)];
    if (breaker && propertyId !== 'p-cedar') {
      make(propertyId, { kind: 'resident', id: breaker.id, name: breaker.name }, 'voice', 'general', 'Early lease termination', [
        ['contact', `[Call transcript] Hi, I got a job offer out of state and need to leave about four months before my lease ends. What are my options?`],
        ['ai', 'Congratulations on the new job. Early termination options depend on your lease terms. I am connecting you with the property manager to go over them.'],
      ], { escalated: true, escalationReason: 'Lease-break terms need staff review' });
    }

    // Amenity question resolved by AI.
    const amen = pRes[2];
    if (amen) {
      make(propertyId, { kind: 'resident', id: amen.id, name: amen.name }, 'chat', 'general', 'Package room access', [
        ['contact', 'How do I get into the package room after hours?'],
        ['ai', 'Use your resident fob on the side door — the package room is open 24/7. If your fob does not work, reply here and I will let the office know.'],
        ['contact', 'Got it, thanks.'],
      ], { status: 'resolved' });
    }
    void pUnits;
  }
  return out;
}

/** A few historical audit events so the Activity log isn't empty on first load. */
export function createSeedAudit(data: Dataset, today: ISODate = CONFIG.today): AuditEvent[] {
  const y = addDays(today, -1);
  const unit = data.units.find((u) => u.status === 'ready')!;
  const task = data.tasks.find((t) => t.status === 'done' && t.type === 'service')!;
  const res = data.residents.find((r) => r.stage === 'renewal_offered')!;
  const pm = data.staff.find((s) => s.role === 'Property manager')!;
  return [
    { id: 'a-seed-1', at: `${y}T09:12`, actor: 'Automation (Level 1)', action: 'Synced listing date from PMS', mode: 'automatic', propertyId: unit.propertyId,
      target: { collection: 'units', id: unit.id, label: `Unit ${unit.number}` } },
    { id: 'a-seed-2', at: `${y}T10:40`, actor: pm.name, action: 'Approved renewal offer', mode: 'approved', propertyId: res.propertyId,
      target: { collection: 'residents', id: res.id, label: res.name },
      changes: [{ field: 'stage', label: 'Stage', from: 'current', to: 'renewal_offered' }] },
    { id: 'a-seed-3', at: `${y}T15:05`, actor: 'Tom Reyes', action: 'Completed work order', mode: 'manual', propertyId: task.propertyId,
      target: { collection: 'tasks', id: task.id, label: task.title } },
    { id: 'a-seed-4', at: `${today}T08:02`, actor: 'Automation (Level 1)', action: 'Nightly sync finished — 3 systems, 0 errors', mode: 'automatic' },
  ];
}
