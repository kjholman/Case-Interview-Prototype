/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CONFIG — the first file to edit when adapting the kit to a new case.
 *  Product name, fixed demo date, seed, accent color, and which screens show.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ScreenId =
  | 'overview'
  | 'units'
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
  /** Neutral, configurable product name (can also be changed at runtime in Settings). */
  productName: 'Operations Console',
  /** Fictional operator that owns the portfolio. */
  organizationName: 'Northgate Residential',

  /** Every date in the app is computed relative to this fixed "today". */
  today: '2026-10-06',
  /** Deterministic seed for the mock data generator. Change it to get a different (but stable) dataset. */
  seed: 20261006,

  /** Bump when the shape of persisted state changes, so stale localStorage is ignored. */
  storageVersion: 1,

  /**
   * Single accent color as space-separated RGB channels (for Tailwind's alpha syntax).
   * Default is indigo. Try teal: base '13 148 136', strong '15 118 110', soft '240 253 250',
   * baseDark '45 212 191', strongDark '94 234 212', softDark '4 47 46'.
   */
  accent: {
    base: '79 70 229', // indigo-600
    strong: '67 56 202', // indigo-700
    soft: '238 242 255', // indigo-50
    baseDark: '129 140 248', // indigo-400
    strongDark: '165 180 252', // indigo-300
    softDark: '30 27 75', // indigo-950
  },

  /** Default landing screen after sign-in. */
  homeScreen: 'overview' as ScreenId,

  /** Navigation order = object key order. Rename, re-describe, or disable screens here. */
  screens: {
    overview: { label: 'Overview', description: 'Key numbers and the most urgent items across the portfolio.', enabled: true },
    units: { label: 'Units', description: 'Every unit with its status, dates and open issues.', enabled: true },
    work: { label: 'Work board', description: 'Make-ready and service work by status and on a timeline.', enabled: true },
    exceptions: { label: 'Exceptions', description: 'Only the items that need a person to decide.', enabled: true },
    approvals: { label: 'Approvals', description: 'Changes the system suggests, waiting for a person to approve.', enabled: true },
    conversations: { label: 'Conversations', description: 'Prospect and resident messages across every channel.', enabled: true },
    field: { label: 'Field app', description: 'What on-site staff see on their phone.', enabled: true },
    impact: { label: 'Impact', description: 'Estimate the annual value of an improvement.', enabled: true },
    activity: { label: 'Activity log', description: 'Every change, who made it, and whether it was approved or automatic.', enabled: true },
    settings: { label: 'Settings', description: 'Automation level, connected systems and demo data.', enabled: true },
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
