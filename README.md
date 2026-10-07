# EliseAI-style Turn Board — prototype kit

A working prototype of an **EliseAI-style turn board** for multifamily operators: every unit in turnover,
step by step from move-out inspection to final walk, with the date it will really be ready, and Elise
doing the coordination work (confirming vendors, re-planning turns when a step slips, assigning work,
creating missing make-ready plans) according to the automation level.

Under the board is a full property-operations kit (units, work orders, residents, leasing, conversations,
rules engine, automation policy) so it can be re-aimed at another case. See **[ADAPT.md](ADAPT.md)**.

- **No backend, no database.** All data comes from `src/domain/seed.ts`: a deterministic generator
  with a fixed "today" (**Tue, Oct 6, 2026**) and a fixed seed, so the demo looks the same every time.
- **Simulated sign-in.** The login page accepts any email and password. Nothing is checked or sent anywhere.
  Choosing "Maintenance technician" lands on the field app.
- **Changes persist in this browser** (localStorage). Use **Reset demo data** to start over.

## The turn board

| Part | What it does |
| --- | --- |
| **Board** (home) | One row per turning unit (on notice, vacant, pre-leased not ready, recently ready). A cell per step (Inspect, Repairs, Paint, Floors, Clean, Final walk) colored Done / In progress / Scheduled / Late / Blocked / No one assigned, with a **?** when the vendor hasn't confirmed. Status per unit: **Late, Blocked, At risk, No plan, On track, Not started, Ready**, with the reason in plain language. Days vacant, target (move-in if pre-leased), projected ready with days late or slack, next step. |
| **Headline numbers** | Units turning, late or blocked (and pre-leased move-ins that will be missed), at risk, average turn time vs a 7-day target, vacancy cost per day. |
| **Elise on turns** | What Elise did today: turns rescheduled, vendor visits confirmed, steps assigned, and what's waiting for approval. |
| **Unit drawer** | Timeline of the turn, each step with **Start / Done / Unblock / Confirm vendor**, and **Reschedule** when the plan is out of date. |
| **Rules behind it** | Make-ready will miss the date · Turn schedule out of date (auto re-plan) · Vendor visit not confirmed · Unassigned step · Blocked step · Past-due step · No make-ready plan · Ready early · PMS/CRM date mismatch. |
| **Automation level** | Level 1: every fix waits in Approvals. Level 2: re-plans, vendor confirmations, assignments and new plans run automatically. Level 3: everything runs except high-risk changes on urgent turns. |

Other screens: **Schedule** (kanban + timeline), **Exceptions**, **Approvals**, **Units**, **Field app**
(tech completes steps with checklist and photos), **Conversations** (Elise and the inbound simulator),
**Impact** (value of faster turns), **Activity log**, **Settings**. Overview, Residents and Leasing are
built but hidden (`enabled: false` in `src/config.ts`). Leasing and collections rules are off by default
(`defaultDisabledRules`); switch them on in Settings.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: rules engine, projection helper, impact calculator, seed
npm run build      # type-check + one self-contained file: dist/index.html
```

Requires Node 18+.

### The single-file build

`npm run build` uses `vite-plugin-singlefile` to inline all JavaScript and CSS into **`dist/index.html`**
(about 390 KB, 115 KB gzipped). Open it straight from disk by double-clicking it, or email or share it.
It needs no server and no network. Routing uses URL hashes (`#/units`) so it works from `file://`.

### Deploy (Render or any Node host)

`npm start` builds the app and serves it on `$PORT` (default 4173):

| Render setting | Value |
| --- | --- |
| Service type | Web Service |
| Build command | `npm install` |
| Start command | `npm start` |

Or deploy it as a **Static Site** instead: build command `npm install && npm run build`,
publish directory `dist`.

### Reset demo data

Any of these restores the original dataset and settings (you stay signed in):

- User menu (top right) → **Reset demo data**
- **Settings** → Demo data → **Reset demo data**
- Clear the site's localStorage, or bump `storageVersion` in `src/config.ts`

## What's in it

| Screen | What it shows |
| --- | --- |
| **Overview** | Six key numbers, units by status, the most urgent exceptions, move-ins and move-outs in the next 14 days, and a breakdown by property |
| **Units** | Sortable, filterable table with status pills, PMS vs CRM date mismatches and make-ready progress. A row opens a detail drawer (change status, create a make-ready plan) |
| **Residents** | The PMS resident ledger: lease dates, renewal status, balance and charges/payments. **Record payment**, **Send renewal offer**, **Mark renewal signed**, **Record notice to vacate** |
| **Leasing** | Lead pipeline from inquiry → tour → application → approval → **lease signed**. Book tours, approve applications, sign a lease on an available unit |
| **Work board** | Make-ready and service tasks as a **kanban** (drag, or the keyboard "Move to" control) and as a **timeline** with today, target-date and projected-ready markers |
| **Exceptions** | Only items that need a person: reason, impact and suggested action, with **Approve / Mark handled**, **Snooze** and **Reassign** |
| **Approvals** | System-suggested changes shown as before → after, with **Accept**, **Edit** and **Reject**. Every decision goes to the activity log |
| **Conversations** | SMS, email, voice and chat threads, plus **"What Elise would say"**, a reply built from current data with its sources and any reasons to hold it. **Simulate inbound message** plays a resident, prospect or new lead |
| **Field app** | A phone-sized checklist for on-site staff: checkboxes, photo slots (the real camera on phones), notes, complete or report a problem |
| **Impact** | Annual impact calculator with every formula written out using the live numbers |
| **Activity log** | Who changed what and when, and whether it was approved, automatic, rejected, manual or snoozed |
| **Settings** | **Automation level** (1–3) with a live preview, connected systems (PMS, CRM, work orders), rules on/off, product name, theme and reset |

### How it works like a PMS + EliseAI

| Workflow | What happens |
| --- | --- |
| **Inbound message → Elise** | Elise identifies the contact (or creates a guest card for a new lead) and sorts the request: maintenance by trade (HVAC, Plumbing, Appliance …) and priority, tour, pricing, payment, renewal or move-out. Then she acts in the systems of record and replies or drafts. |
| **Maintenance request** | Creates a work order (`WO-####`) on the resident's unit. At Level 2+ automation assigns the least-busy technician and Elise confirms the ETA. At Level 1 the assignment waits in Approvals and the reply is held. |
| **Emergency** (leak, flood, gas, no heat …) | Urgent work order, conversation escalated, safety instructions drafted for staff to send. |
| **Tour request** | Level 2+: Elise books the next tour slot and confirms. Level 1: she offers times for staff to confirm. |
| **Concession, payment plan, notice, legal** | Escalated to staff with the reason; Elise drafts a holding reply. |
| **Sign lease** (Leasing) | Lead → Lease signed; unit → Leased with the move-in date; the make-ready check now compares against that move-in. |
| **Notice to vacate** (Residents) | Unit → On notice, available 10 days after move-out, and the standard make-ready plan is scheduled with the projection helper. |
| **Make-ready complete** | When the last step is done (board, drawer or field app), a vacant unit turns **Ready** automatically. |
| **Payment** | Posted to the ledger; balance updated; delinquency alerts clear. |
| **Every change** | Logged in the Activity log with who did it (person, Elise or automation) and which system it was written to (PMS, CRM, work orders). |

### The automation level changes behavior

| Level | Approval queue | Exceptions inbox | Assistant |
| --- | --- | --- | --- |
| **1. Suggest, person approves** | Every suggested fix | Items with no fix | Drafts; staff send |
| **2. Automatic for low-risk items** | High-risk fixes only. Low-risk fixes apply on their own and are logged as *Automatic* | Items with no fix | Sends routine replies |
| **3. Automatic, exceptions only** | Empty | Items with no fix, plus high-risk fixes on high or critical items | Sends unless escalated or held |

When you switch levels you'll see a toast ("Automation applied 23 changes"), the nav badges change,
and new *Automatic* rows appear in the activity log. Disconnecting a system in Settings pauses the
rules that need it, and the screens that depend on it show a "not connected" state.

### Mock data

3 properties (Austin, Tampa, Denver), **204 units**, about 170 residents, 50 prospects, 280 tasks
(make-ready plans and service requests), 41 conversations and 5 vendors. Each property has planted
scenarios, so every rule and screen has something to show: a leased unit whose make-ready will miss
move-in, a past-due repair, a unit that's ready early, unassigned steps, a CRM/PMS date mismatch,
a unit with no plan, a tour no-show, a renewal not yet offered, an unreminded balance and escalated
conversations.

All residents, staff, properties, operators and phone numbers (555-01xx) are fictional.

## Project layout

```
src/
  config.ts                 ← product name, demo date, seed, accent color, screen labels and on/off
  domain/                   ← pure TypeScript, no React
    types.ts                ← the whole domain model
    seed.ts                 ← deterministic mock data + planted scenarios
    rules.ts                ← rules engine: data → alerts (exceptions), each with an optional fix
    automation.ts           ← what each automation level does with each alert
    projection.ts           ← generic "ordered steps with durations → end date" helper
    workplan.ts             ← make-ready forecast built on the projection helper
    impact.ts               ← impact calculator model (inputs + formula lines)
    assistant.ts            ← "what Elise would say" from current data
    elise.ts                ← inbound triage + actions (work orders, tours, escalations)
    lifecycle.ts            ← PMS workflows: make-ready plan, sign lease, notice, renewal, payment, Ready
    checklists.ts           ← field checklists per task type
    dates.ts, random.ts     ← fixed-today date helpers, seeded RNG
  store/AppStore.tsx        ← state, actions, localStorage, automation reconcile, derived hooks
  components/               ← the reusable building blocks (props documented at the top of each file)
  screens/                  ← one file per screen + registry.tsx (route, icon, component)
  shell/                    ← app shell, login, theme, value formatting, record links
tests/                      ← Vitest specs
```

### Reusable building blocks

Each file in `src/components/` starts with a doc comment listing its props.

`DataTable` · `StatusPill` (+ shared status maps) · `KeyNumber` · `DetailDrawer` · `TimelineBar` ·
`KanbanBoard` · `ExceptionCard` · `ApprovalItem` · `ChatThread` · `AIResponsePreview` ·
`ChecklistForm` · `ImpactCalculator` · `AutomationLevelControl` · `EmptyState`,
plus small primitives in `ui.tsx` (`PageHeader`, `Card`, `Switch`, `Segmented`, `Select`,
`SearchInput`, `ChipToggle`, `Modal`, toasts).

## Design notes

- **EliseAI branding**: purple accent `#7638FA` (light periwinkle `#AFC1F6` in highlights), a near-black
  sidebar and sign-in panel, the Inter typeface (bundled, so it works offline), an "EliseAI" text wordmark,
  and the AI named "Elise" in conversations. All of it is set in `config.ts` (`brand`, `accent`) and
  `src/shell/BrandMark.tsx`. There is no official logo file: drop one into `src/assets/` and render it in
  `BrandMark` if you have it. A "concept prototype — not an official EliseAI product" note shows on the
  sign-in page and in the sidebar.
- Status colors differ in lightness
  as well as hue, so they read in grayscale.
- Light and dark themes (follows the system; toggle in the top bar or Settings).
- Responsive down to 360 px: the sidebar becomes a menu, tables scroll inside their card, the kanban
  scrolls sideways and the field app goes full screen.
- Keyboard: skip link, visible focus rings, sortable headers are buttons, table rows open with Enter,
  drawers trap focus and close with Esc, tabs and the level control use arrow keys.

## Not included (by design)

Real authentication, a server or database, real integrations, or AI model calls. Assistant replies
are templates filled from current data, so the demo is deterministic and works offline.
