/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CONFIG — the first file to edit when adapting the kit to a new case.
 *  Product name, fixed demo date, seed, accent color, and which screens show.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ScreenId =
  | 'turns'
  | 'moveout'
  | 'overview'
  | 'units'
  | 'residents'
  | 'leasing'
  | 'work'
  | 'exceptions'
  | 'approvals'
  | 'conversations'
  | 'field'
  | 'impact'
  | 'activity'
  | 'settings';

export interface ScreenConfig {
  /** Shown in the left navigation and as the page title. */
  label: string;
  /** One-line description under the page title. Keep it plain-language. */
  description: string;
  /** Set to false to hide the screen from navigation and routing. */
  enabled: boolean;
}

export const CONFIG = {
  /** Brand shown in the shell (text wordmark — see src/shell/BrandMark.tsx). */
  brand: {
    name: 'EliseAI',
    /** Name the AI uses in conversations and previews. */
    assistantName: 'Elise',
    /** Shown on the sign-in page and in the sidebar so nobody mistakes the demo for a real product login. */
    disclaimer: 'Concept prototype for an interview demo — not an official EliseAI product. All data is fictional.',
  },
  /** Product (module) name under the brand (can also be changed at runtime in Settings). */
  productName: 'Turn Board',
  /** Fictional operator that owns the portfolio. */
  organizationName: 'Northgate Residential',

  /** Every date in the app is computed relative to this fixed "today". */
  today: '2026-10-06',
  /** Deterministic seed for the mock data generator. Change it to get a different (but stable) dataset. */
  seed: 20261006,

  /** Bump when the shape of persisted state changes, so stale localStorage is ignored. */
  storageVersion: 3,

  /**
   * Single accent color as space-separated RGB channels (for Tailwind's alpha syntax).
   * Default is EliseAI purple (#7638FA); the brand's light periwinkle is #AFC1F6.
   */
  accent: {
    base: '118 56 250', // EliseAI purple #7638FA
    strong: '91 33 214', // #5B21D6 (hover / text on light)
    soft: '241 235 255', // #F1EBFF
    baseDark: '155 107 255', // #9B6BFF
    strongDark: '196 168 255', // #C4A8FF
    softDark: '42 22 99', // #2A1663
  },

  /** Default landing screen after sign-in. */
  homeScreen: 'turns' as ScreenId,

  /** Rules switched off by default (not part of the turn story). Re-enable them in Settings. */
  defaultDisabledRules: ['renewal-not-offered', 'delinquent-no-reminder', 'tour-no-show'],

  /** Navigation order = object key order. Rename, re-describe, or disable screens here. */
  screens: {
    turns: { label: 'Turn board', description: 'Every unit in turnover, step by step, with the date it will really be ready.', enabled: true },
    work: { label: 'Schedule', description: 'Make-ready and service work by status and on a timeline.', enabled: true },
    exceptions: { label: 'Exceptions', description: 'Only the turns and work orders that need a person to decide.', enabled: true },
    approvals: { label: 'Approvals', description: 'Changes Elise suggests, waiting for a person to approve.', enabled: true },
    units: { label: 'Units', description: 'Every unit with its status, dates and open issues.', enabled: true },
    field: { label: 'Field app', description: 'What technicians and porters see on their phone.', enabled: true },
    moveout: { label: 'Move-out guide', description: 'What a resident on notice sees: the scheduled move-out checklist and room-by-room photo guide.', enabled: true },
    conversations: { label: 'Conversations', description: 'Resident, prospect and vendor messages across every channel.', enabled: true },
    impact: { label: 'Impact', description: 'What faster turns are worth per year.', enabled: true },
    activity: { label: 'Activity log', description: 'Every change, who made it, and whether it was approved or automatic.', enabled: true },
    settings: { label: 'Settings', description: 'Automation level, connected systems and demo data.', enabled: true },
    // Not part of the turn-board story; switch on to bring them back.
    overview: { label: 'Overview', description: 'Key numbers and the most urgent items across the portfolio.', enabled: false },
    residents: { label: 'Residents', description: 'Leases, balances and renewals — the resident ledger from the PMS.', enabled: false },
    leasing: { label: 'Leasing', description: 'Every lead from first message to signed lease.', enabled: false },
  } satisfies Record<ScreenId, ScreenConfig>,

  /** Systems the console pretends to be connected to. Labels are generic on purpose. */
  integrations: {
    pms: { label: 'Property management system', short: 'PMS', description: 'Units, residents, leases, balances.' },
    crm: { label: 'Leasing CRM', short: 'CRM', description: 'Prospects, listings, conversations.' },
    workOrders: { label: 'Work-order tool', short: 'Work orders', description: 'Make-ready and service tasks, vendors.' },
  },

  /** Demo sign-in defaults. The login is simulated — nothing is checked. */
  demoUser: {
    name: 'Alex Morgan',
    email: 'alex.morgan@northgate.example',
    role: 'Regional manager',
  },
};

export type IntegrationId = keyof typeof CONFIG.integrations;
