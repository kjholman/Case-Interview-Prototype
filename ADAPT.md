# Adapting the kit to a case (15–20 minutes)

The aim isn't to build a new app. It's to **rename, re-seed and re-rule** this one, so the screens tell
the story of the case's problem. Work top-down; stop when the story is clear.

Run `npm run dev` in one terminal and keep the browser open. Vite reloads on every save.
If old data sticks around after you edit the seed, click **Reset demo data** (user menu), or bump
`storageVersion` in `src/config.ts`.

---

## The 15-minute path

### 1. Frame it (2 min): `src/config.ts`

- `productName`: e.g. "Turn Scheduler", "Renewal Desk".
- `screens.<id>.label` / `.description`: rename screens in the case's language
  (e.g. Exceptions → "At-risk move-ins").
- `screens.<id>.enabled = false`: hide what you don't need. Hidden screens disappear from the nav and routing.
- `homeScreen`: which screen opens after sign-in.
- Optional: `accent` for a different color; `today` and `seed` for a different (still stable) dataset.

### 2. Model it (3 min): `src/domain/types.ts`

Add only the fields the case needs. Examples:
`Resident.renewalRiskScore`, `Prospect.noShowCount`, `Task.vendorConfirmed`, `Unit.lockboxCode`.
Prefer **optional** fields (`field?: type`) so the rest of the app keeps compiling.

### 3. Seed it (4 min): `src/domain/seed.ts`

- **Reference data at the top**: property names and sizes (`PROPERTY_SPECS`), floorplans, staff,
  vendors, service request templates, the make-ready step template (`MAKE_READY_STEPS`).
- **`SCENARIOS`**: the planted "interesting cases" applied to one unit per property. Add a scenario
  name to the union and the list, then a branch in the unit loop
  (`} else if (scenario === 'my_case') { … }`) to set the dates and statuses that tell the story.
- **Distribution weights**: `rng.weighted([['occupied', 82], …])` for unit status,
  prospect stages and so on.
- **Conversations**: `buildConversations()` holds short scripted threads. Copy one `make(...)` call
  and edit the lines. Put the case's key moment in a thread.
- Keep it deterministic: use `rng.*`, never `Math.random()` or `new Date()`.

### 4. Rule it (4 min): `src/domain/rules.ts`

Every exception and approval comes from a rule. Copy an existing rule object in `RULES` and edit it
(import any date helpers you use, e.g. `addDays`, from `./dates`):

```ts
{
  id: 'tour-unconfirmed',
  label: 'Tour not confirmed',
  description: 'Tour is tomorrow and the prospect has not confirmed.',
  requires: ['crm'],                       // paused if the CRM is "disconnected" in Settings
  evaluate(ctx) {
    return ctx.data.prospects
      .filter((p) => p.stage === 'tour_scheduled' && p.tourDate === addDays(ctx.today, 1) && !p.followUpDate)
      .map((p) => ({
        propertyId: p.propertyId,
        severity: 'medium',
        record: { collection: 'prospects', id: p.id, label: p.name },
        title: `${p.name} hasn't confirmed tomorrow's tour`,
        reason: `Tour ${formatDate(p.tourDate)}; no confirmation.`,
        impact: 'Unconfirmed tours no-show far more often.',
        suggestedAction: 'Send a confirmation text.',
        fix: {                                  // optional: makes it automatable
          label: 'Send confirmation text',
          risk: 'low',                         // low → automatic at Level 2
          target: { collection: 'prospects', id: p.id, label: p.name },
          changes: [{ field: 'followUpDate', label: 'Confirmation sent', from: null, to: ctx.today }],
        },
      }));
  },
},
```

Rules of thumb:
- **No `fix`** → always lands in **Exceptions** (a person must decide).
- **`fix.risk: 'low'`** → Approvals at Level 1, **automatic** at Levels 2–3.
- **`fix.risk: 'high'`** → Approvals at Levels 1–2. At Level 3 it's automatic, or an exception if severity is high or critical.
- **A fix must make its rule stop firing.** `npm test` checks this for every rule, so automation can't loop.
- Use plain language in `title` and `reason`: "3 days late", "Needs approval".

The routing policy itself is in `src/domain/automation.ts` (`routeAlert`) if the case needs different level semantics.

### 5. Show it (3 min): screens

Most screens adapt through data and rules alone. Typical small edits:

| To change… | Edit |
| --- | --- |
| Overview key numbers | `src/screens/Overview.tsx`: the `<KeyNumber …>` grid (label, value, hint, link) |
| Units table columns | `src/screens/Units.tsx`: the `columns` array (`header`, `cell`, `sortValue`) |
| Kanban columns or timeline rows | `src/screens/WorkBoard.tsx`: `columns` prop and `TimelineView` row builder |
| Status names and colors | `src/components/StatusPill.tsx`: `UNIT_STATUS`, `TASK_STATUS`, `RESIDENT_STAGE`… |
| Assistant reply wording and holds | `src/domain/assistant.ts`: one `case` per conversation topic |
| Field checklist items | `src/domain/checklists.ts` |
| Impact formula | `src/domain/impact.ts`: `IMPACT_INPUTS`, `DEFAULT_IMPACT_INPUTS`, the `lines` in `computeImpact` |

To **add a screen**: create `src/screens/MyScreen.tsx`, add `'myscreen'` to `ScreenId` and
`CONFIG.screens` in `config.ts`, and register it in `src/screens/registry.tsx`.
Building blocks in `src/components/` cover most needs. Each file's header lists its props.

### 6. Check (1 min)

`npm test` and `npm run build`, then open `dist/index.html`. Click **Reset demo data**, set the
automation level to 1, and walk through the story.

---

## Where things live

| You want to change | File |
| --- | --- |
| Product name, today, seed, colors, screen names, hide screens | `src/config.ts` |
| Data model | `src/domain/types.ts` |
| Mock data and planted scenarios | `src/domain/seed.ts` |
| What counts as an exception, and the suggested fix | `src/domain/rules.ts` |
| What each automation level does | `src/domain/automation.ts` |
| "Ordered steps → end date" | `src/domain/projection.ts` (generic), `src/domain/workplan.ts` (make-ready) |
| Impact math | `src/domain/impact.ts` |
| Assistant reply logic | `src/domain/assistant.ts` |
| Navigation icons and routes | `src/screens/registry.tsx` |
| State, actions, audit logging | `src/store/AppStore.tsx` |

### The projection helper (reuse it everywhere)

```ts
import { projectSchedule } from './domain/projection';

projectSchedule(
  [
    { id: 'inspect', durationDays: 1 },
    { id: 'paint', durationDays: 2, earliestStart: '2026-10-09' },   // vendor slot
    { id: 'clean', durationDays: 1 },
    { id: 'keys',  durationDays: 0 },                                 // milestone
  ],
  '2026-10-06',
  { skipWeekends: false },
);
// → steps with start/end, waitDays per step, overall `end` and `readyDate`
```

Steps run in order by default. Use `dependsOn: ['a', 'b']` for parallel work. It works for any
sequence: make-ready, onboarding, a collections cadence, a renewal outreach sequence, vendor bids.

---

## Five worked examples

Each lists **what changes, by file** and **which screens carry the story**. Times assume the steps above.

### 1. Unit turnover and make-ready scheduling

*"Units sit vacant too long between residents; make-ready is coordinated by phone and spreadsheets."*
This is the kit's default story, so the changes are mostly emphasis.

- **config.ts**: rename `work` → "Turn board", `exceptions` → "At-risk turns". Set `homeScreen: 'work'`.
  Hide `conversations` if the case doesn't mention residents or prospects.
- **types.ts**: add `Task.vendorConfirmed?: boolean` and `Unit.targetReadyDays?: number`.
- **seed.ts**: tune `MAKE_READY_STEPS` durations to the case's numbers. Add a scenario
  `'vendor_unconfirmed'` (paint step, `vendorConfirmed: false`, starting in 2 days).
- **rules.ts**: keep `makeready-late`, `task-blocked`, `task-unassigned`, `ready-early`,
  `no-make-ready-plan`. Add `vendor-unconfirmed` with a low-risk fix that sets `vendorConfirmed: true`
  ("Send confirmation to vendor"). Disable or delete the leasing, renewal and delinquency rules.
- **impact.ts**: defaults `turnoverPct` = the case's value, `daysSavedPerTurn` = 2–4; set
  `hoursSavedPerWeek` to the coordinator time saved.
- **Screens**: Work board **timeline** (bars, today line, move-in markers, projected ready in red),
  Exceptions (a leased unit missing move-in), Field app (tech completes Paint → the timeline updates),
  Impact. Use the automation level to show vendor confirmations going automatic at Level 2.

### 2. Leasing funnel and tour no-shows

*"Prospects book tours and don't show; leasing agents spend hours chasing them."*

- **config.ts**: rename `units` → "Availability", `work` → hide (`enabled: false`) or rename to
  "Agent tasks", `conversations` → "Leads". Set `homeScreen: 'conversations'`.
- **types.ts**: add `Prospect.tourConfirmed?: boolean`, `Prospect.noShowCount?: number`, `Prospect.nextTourDate?: ISODate`.
- **seed.ts**: raise the prospect count (`prospectCount`) to about 40 per property. Weight
  `tour_scheduled` higher. Give about 25% past `tourDate`s with no follow-up. Add 2–3 tour threads in
  `buildConversations()` (confirm, reschedule, no reply).
- **rules.ts**: keep `tour-no-show`. Add `tour-unconfirmed` (tour tomorrow, not confirmed; low-risk
  fix "Send confirmation") and `lead-gone-cold` (no contact in 5 days; low-risk fix "Send check-in").
  Keep `date-mismatch`, since it blocks the assistant from quoting dates.
- **assistant.ts**: the `tour` branch already offers times. Add a reschedule variant when
  `noShowCount > 0`.
- **Overview**: swap two key numbers for "Tours today", "No-show rate" and "Leads waiting on a reply".
- **Screens**: Conversations (AI preview with sources; a held reply because of a date mismatch, then fix
  it in Approvals and watch the hold disappear), Approvals (confirmations at Level 1, gone at Level 2),
  Impact (`daysSavedPerTurn` = faster lease-up; `hoursSavedPerWeek` = agent follow-up time).

### 3. Renewal risk outreach

*"Residents leave at renewal without anyone talking to them; offers go out late."*

- **config.ts**: rename `exceptions` → "At-risk renewals", `approvals` → "Offers to approve".
  Hide `field` and `work`.
- **types.ts**: add `Resident.renewalRisk?: 'low' | 'medium' | 'high'`,
  `Resident.riskReasons?: string[]` (e.g. "3 maintenance requests in 60 days", "late twice"),
  `Resident.offerRent?: number`.
- **seed.ts**: set `leaseEnd` for about 30% of residents within 90 days. Compute `renewalRisk` from
  their service requests and balances, or set it with the RNG. Add 2 renewal threads
  (concession ask, "thinking about moving").
- **rules.ts**: extend `renewal-not-offered` (window 90 days; severity from `renewalRisk`). Its fix sets
  `stage` and `offerRent`, and the **Edit** in Approvals lets the panel change the rent live. Add
  `high-risk-no-contact` (high risk, no conversation in 14 days; no fix → Exceptions:
  "Call before the offer").
- **projection.ts**: model the outreach cadence as steps (offer day −90, reminder −60, call −45,
  final −30), and show its timeline in `TimelineView` (rows = residents).
- **Units**: add columns "Lease ends" and "Risk" (`StatusPill`).
- **Screens**: Approvals (offers with editable rent; high risk until Level 3), Exceptions,
  Conversations, Impact (`turnoverPct` down by X points = turns avoided; relabel the inputs
  in `IMPACT_INPUTS`).

### 4. Delinquency follow-up

*"Collections are inconsistent; some balances get three reminders, others none."*

- **config.ts**: rename `exceptions` → "Accounts to review", `work` → hide,
  `units` → "Accounts" (or keep units and add a balance column).
- **types.ts**: add `Resident.paymentPlan?: { installments: number; nextDue: ISODate }`,
  `Resident.promiseToPayDate?: ISODate`, `Resident.reminderCount?: number`.
- **seed.ts**: raise the delinquency chance from 0.09 to about 0.2. Spread `balanceDueDate`
  across the 1st of the last 3 months. Add threads for payment plan requests and broken promises.
- **rules.ts**: keep `delinquent-no-reminder` (low risk under $1,500 → automatic at Level 2).
  Add `promise-broken` (promise date passed, balance unchanged; no fix → Exceptions) and
  `plan-request` (an escalated payment conversation; high-risk fix "Offer 2-payment plan").
- **projection.ts**: the collections cadence (reminder day 3, call day 7, notice day 10, review day 15),
  with a projected "case closed by" date per account.
- **assistant.ts**: the `payment` branch already quotes the balance and holds over $1,000. Adjust
  the thresholds to the case.
- **Overview**: "Total delinquent", "Accounts 30+ days", "Promises due today".
- **Screens**: Exceptions, Approvals (payment plans), Conversations (held reply, then manager approves),
  Activity log (shows every reminder is consistent and logged), Impact (relabel "Rent recovered" as
  "Bad debt avoided").

### 5. Maintenance request triage

*"Service requests come in by text, voice and email; urgent ones wait behind routine ones."*

- **config.ts**: rename `work` → "Service board", `field` → "Tech app", `exceptions` → "Needs dispatch".
  Set `homeScreen: 'work'`.
- **types.ts**: add `Task.category?: 'HVAC' | 'Plumbing' | 'Electrical' | 'Appliance' | 'Other'`,
  `Task.source?: Channel`, `Task.triagedBy?: 'ai' | 'staff'`, `Task.firstResponseAt?: ISODateTime`.
- **seed.ts**: raise `serviceCount` from 15% to about 30% of occupied units. Add more
  `SERVICE_TEMPLATES` with priorities. Link more requests to conversations (`relatedTaskId`).
- **rules.ts**: keep `task-past-due`, `task-blocked`, `task-unassigned` (the auto-assign fix is the
  "dispatch" story). Add `urgent-not-started` (urgent and not in progress within 4 hours; no fix → page
  the on-call tech) and `sla-at-risk` (projected finish after due; the fix moves it to another tech).
- **WorkBoard.tsx**: set the default filter to `kind = 'service'`. Change the timeline rows to
  **technicians** (rows = staff, bars = their tasks) to show load. Use `projectSchedule` per tech to
  compute when the queue clears.
- **checklists.ts**: per-category service checklists.
- **assistant.ts**: the `maintenance` branch already reports status, ETA, blocked reason and holds when late.
- **Screens**: Conversations (request comes in → AI creates or updates the work order), Work board,
  Field app (tech completes with photos), Exceptions, Overview ("Urgent open", "Median time to
  first response"), Impact (`hoursSavedPerWeek` = dispatcher time).

---

## Demo script that works for any case (3 minutes)

1. **Overview**: "Here's the portfolio this morning. Nine units will miss their date."
2. **Exceptions**: open the critical one and say why it's flagged. "View unit" opens the drawer
   with the timeline.
3. **Approvals at Level 1**: accept one, edit one, reject one, then show the Activity log.
4. **Settings → Level 2**: a toast shows "Automation applied 23 changes", Approvals drops, and Activity shows *Automatic* rows.
5. **Conversations**: open an escalated thread. The assistant's draft is built from current data, and *Why it's held* names the problem (late make-ready, past-due work order, dates that disagree). Fix the data (unblock the task, or approve the date sync) and the draft and holds update.
6. **Field app**: complete a checklist. The work board and Overview update.
7. **Impact**: change one assumption live and show the formula.
