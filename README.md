# Operations Console — prototype kit

A generic, realistic **property operations console** for multifamily housing, built to be adapted to a
specific operational problem in 15–20 minutes. It ships with seeded mock data, a small rules engine,
an automation-level policy, and ten screens that share one app shell.

It does not solve one problem on purpose. It gives you a working, polished baseline: you change the
data, the rules and the screen titles to fit the problem, and hide what you don't need.
See **[ADAPT.md](ADAPT.md)** for the step-by-step guide and five worked examples.

- **No backend, no database.** All data comes from `src/domain/seed.ts`: a deterministic generator
  with a fixed "today" (**Tue, Oct 6, 2026**) and a fixed seed, so the demo looks the same every time.
- **Simulated sign-in.** The login page accepts any email and password. Nothing is checked or sent anywhere.
  Choosing "Maintenance technician" lands on the field app.
- **Changes persist in this browser** (localStorage). Use **Reset demo data** to start over.

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

### Reset demo data

Any of these restores the original dataset and settings (you stay signed in):

- User menu (top right) → **Reset demo data**
- **Settings** → Demo data → **Reset demo data**
- Clear the site's localStorage, or bump `storageVersion` in `src/config.ts`

## What's in it

| Screen | What it shows |
| --- | --- |
| **Overview** | Six key numbers, units by status, the most urgent exceptions, move-ins and move-outs in the next 14 days, and a breakdown by property |
| **Units** | Sortable, filterable table with status pills, PMS vs CRM date mismatches and make-ready progress. A row opens a detail drawer |
| **Work board** | Make-ready and service tasks as a **kanban** (drag, or the keyboard "Move to" control) and as a **timeline** with today, target-date and projected-ready markers |
| **Exceptions** | Only items that need a person: reason, impact and suggested action, with **Approve / Mark handled**, **Snooze** and **Reassign** |
| **Approvals** | System-suggested changes shown as before → after, with **Accept**, **Edit** and **Reject**. Every decision goes to the activity log |
| **Conversations** | SMS, email, voice and chat threads, plus **"What the assistant would say"**, a reply built from current data with its sources and any reasons to hold it |
| **Field app** | A phone-sized checklist for on-site staff: checkboxes, photo slots (the real camera on phones), notes, complete or report a problem |
| **Impact** | Annual impact calculator with every formula written out using the live numbers |
| **Activity log** | Who changed what and when, and whether it was approved, automatic, rejected, manual or snoozed |
| **Settings** | **Automation level** (1–3) with a live preview, connected systems (PMS, CRM, work orders), rules on/off, product name, theme and reset |

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

All names, companies and phone numbers (555-01xx) are fictional.

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
    assistant.ts            ← "what the assistant would say" from current data
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

- One accent color (indigo by default; change it in `config.ts`). Status colors differ in lightness
  as well as hue, so they read in grayscale.
- Light and dark themes (follows the system; toggle in the top bar or Settings).
- Responsive down to 360 px: the sidebar becomes a menu, tables scroll inside their card, the kanban
  scrolls sideways and the field app goes full screen.
- Keyboard: skip link, visible focus rings, sortable headers are buttons, table rows open with Enter,
  drawers trap focus and close with Esc, tabs and the level control use arrow keys.

## Not included (by design)

Real authentication, a server or database, real integrations, or AI model calls. Assistant replies
are templates filled from current data, so the demo is deterministic and works offline.
