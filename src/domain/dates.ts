/**
 * Date utilities. Everything is relative to a fixed "today" (CONFIG.today) so the demo
 * looks identical on every run. All math is done in UTC on 'YYYY-MM-DD' strings.
 */
import { CONFIG } from '../config';
import type { ISODate, ISODateTime } from './types';

export const TODAY: ISODate = CONFIG.today;
const DAY_MS = 86_400_000;

export function parseDate(d: ISODate): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISODate(new Date(parseDate(d).getTime() + n * DAY_MS));
}

export function isWeekend(d: ISODate): boolean {
  const day = parseDate(d).getUTCDay();
  return day === 0 || day === 6;
}

/** Moves forward n working days (Mon–Fri). n = 0 rolls a weekend date forward to Monday. */
export function addBusinessDays(d: ISODate, n: number): ISODate {
  let cur = d;
  while (isWeekend(cur)) cur = addDays(cur, 1);
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur)) left--;
  }
  return cur;
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}

export function daysFromToday(d: ISODate, today: ISODate = TODAY): number {
  return daysBetween(today, d);
}

export const maxDate = (...ds: (ISODate | undefined)[]): ISODate =>
  ds.filter((d): d is ISODate => !!d).reduce((a, b) => (b > a ? b : a));
export const minDate = (...ds: (ISODate | undefined)[]): ISODate =>
  ds.filter((d): d is ISODate => !!d).reduce((a, b) => (b < a ? b : a));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Today", "Tomorrow", "in 3 days", "2 days ago". */
export function relativeDay(d: ISODate, today: ISODate = TODAY): string {
  const n = daysBetween(today, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `in ${plural(n, 'day')}` : `${plural(-n, 'day')} ago`;
}

/** Plain-language due label: "3 days late", "Due today", "Due in 2 days". */
export function dueLabel(due: ISODate, today: ISODate = TODAY): string {
  const n = daysBetween(today, due);
  if (n < 0) return `${plural(-n, 'day')} late`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${plural(n, 'day')}`;
}

const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtLong = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "Oct 6" */
export const formatDate = (d?: ISODate) => (d ? fmtShort.format(parseDate(d)) : '—');
/** "Tue, Oct 6" */
export const formatWeekday = (d?: ISODate) => (d ? fmtWeekday.format(parseDate(d)) : '—');
/** "Oct 6, 2026" */
export const formatLongDate = (d?: ISODate) => (d ? fmtLong.format(parseDate(d)) : '—');

/** "Oct 6, 9:42 AM" or "Today, 9:42 AM" */
export function formatDateTime(dt: ISODateTime, today: ISODate = TODAY): string {
  const [d, t = '00:00'] = dt.split('T');
  const [h, m] = t.split(':').map(Number);
  const time = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const n = daysBetween(today, d);
  const day = n === 0 ? 'Today' : n === -1 ? 'Yesterday' : formatDate(d);
  return `${day}, ${time}`;
}

/** Current wall-clock time placed on the fixed demo date, for new audit events and messages. */
export function nowDateTime(today: ISODate = TODAY): ISODateTime {
  const now = new Date();
  return `${today}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Inclusive list of dates between a and b. */
export function dateRange(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}
