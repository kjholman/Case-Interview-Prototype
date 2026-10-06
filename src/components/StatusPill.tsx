import type { Priority, ProspectStage, ResidentStage, Severity, TaskStatus, UnitStatus } from '../domain/types';
import { cx } from './ui';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'critical' | 'accent';

/**
 * StatusPill — a compact colored label for a status.
 *
 * Tones differ in lightness as well as hue (amber dot is light, red is dark, critical is solid),
 * so they stay distinguishable in grayscale and for color-blind users.
 *
 * @prop tone   Visual tone. See `Tone`.
 * @prop label  Plain-language text, e.g. "Needs approval", "3 days late".
 * @prop dot    Show a leading dot (default true).
 * @prop title  Optional tooltip.
 */
export interface StatusPillProps {
  tone: Tone;
  label: string;
  dot?: boolean;
  title?: string;
  className?: string;
}

const TONES: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  info: { pill: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900', dot: 'bg-sky-500' },
  success: { pill: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900', dot: 'bg-emerald-500' },
  warning: { pill: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900', dot: 'bg-amber-400' },
  danger: { pill: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900', dot: 'bg-red-600' },
  critical: { pill: 'bg-red-700 text-white dark:bg-red-600', dot: 'bg-white' },
  accent: { pill: 'bg-accent-soft text-accent-strong', dot: 'bg-accent' },
};

export function StatusPill({ tone, label, dot = true, title, className }: StatusPillProps) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone].pill, className)}>
      {dot && <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', TONES[tone].dot)} />}
      {label}
    </span>
  );
}

/* Shared status → label/tone maps. Edit labels here to change wording everywhere. */

export const UNIT_STATUS: Record<UnitStatus, { label: string; tone: Tone }> = {
  occupied: { label: 'Occupied', tone: 'neutral' },
  notice: { label: 'On notice', tone: 'warning' },
  vacant: { label: 'Vacant', tone: 'danger' },
  ready: { label: 'Ready', tone: 'success' },
  leased: { label: 'Leased', tone: 'info' },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  blocked: { label: 'Blocked', tone: 'danger' },
  done: { label: 'Done', tone: 'success' },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  critical: { label: 'Critical', tone: 'critical' },
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'neutral' },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  urgent: { label: 'Urgent', tone: 'critical' },
  high: { label: 'High', tone: 'danger' },
  normal: { label: 'Normal', tone: 'neutral' },
  low: { label: 'Low', tone: 'neutral' },
};

export const RESIDENT_STAGE: Record<ResidentStage, string> = {
  current: 'No offer yet',
  renewal_offered: 'Offer sent',
  renewed: 'Renewed',
  notice_given: 'Gave notice',
};

export const PROSPECT_STAGE: Record<ProspectStage, string> = {
  inquiry: 'Inquiry',
  tour_scheduled: 'Tour scheduled',
  toured: 'Toured',
  applied: 'Applied',
  approved: 'Approved',
  leased: 'Lease signed',
  lost: 'Lost',
};
