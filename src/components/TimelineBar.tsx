import type { ReactNode } from 'react';
import { daysBetween, dateRange, isWeekend, parseDate } from '../domain/dates';
import type { ISODate } from '../domain/types';
import { cx } from './ui';

/**
 * TimelineBar — rows of date bars (a lightweight Gantt) with a "today" line and per-row markers
 * such as target or move-in dates. Scrolls horizontally inside its own box on narrow screens.
 *
 * @prop rows        One row per thing (unit, crew, prospect …), each with bars and optional markers.
 * @prop start, end  Visible date window (inclusive).
 * @prop today       Draws the "today" line.
 * @prop dayWidth    Pixels per day (default 28).
 * @prop onBarClick  Called with the bar id.
 * @prop legend      Optional legend under the chart.
 */
export interface TimelineBarItem {
  id: string;
  start: ISODate;
  /** Last day, inclusive. */
  end: ISODate;
  label: string;
  tone: 'done' | 'active' | 'todo' | 'late' | 'blocked' | 'projected';
  title?: string;
}

export interface TimelineMarker {
  date: ISODate;
  label: string;
  tone: 'target' | 'danger' | 'success';
}

export interface TimelineRow {
  id: string;
  label: ReactNode;
  sublabel?: ReactNode;
  bars: TimelineBarItem[];
  markers?: TimelineMarker[];
}

export interface TimelineBarProps {
  rows: TimelineRow[];
  start: ISODate;
  end: ISODate;
  today: ISODate;
  dayWidth?: number;
  onBarClick?: (id: string) => void;
  onRowClick?: (id: string) => void;
  legend?: boolean;
}

const BAR: Record<TimelineBarItem['tone'], string> = {
  done: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  active: 'bg-sky-500 text-white dark:bg-sky-600',
  todo: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  late: 'bg-amber-400 text-amber-950',
  blocked: 'bg-red-700 text-white dark:bg-red-600',
  projected: 'border border-dashed border-slate-400 bg-transparent text-slate-600 dark:border-slate-500 dark:text-slate-300',
};
const MARKER: Record<TimelineMarker['tone'], string> = {
  target: 'bg-accent',
  danger: 'bg-red-600',
  success: 'bg-emerald-600',
};

const LABEL_W = 168;
const ROW_H = 40;

export function TimelineBar({ rows, start, end, today, dayWidth = 28, onBarClick, onRowClick, legend = true }: TimelineBarProps) {
  const days = dateRange(start, end);
  const width = days.length * dayWidth;
  const x = (d: ISODate) => daysBetween(start, d) * dayWidth;
  const todayX = x(today);

  return (
    <div>
      <div className="scroll-thin overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
        <div style={{ width: LABEL_W + width }} className="relative text-xs">
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
            <div style={{ width: LABEL_W }} className="sticky left-0 z-30 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {parseDate(start).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })}
            </div>
            {days.map((d) => (
              <div key={d} style={{ width: dayWidth }} className={cx('shrink-0 py-1 text-center tabular-nums', d === today ? 'font-semibold text-accent-strong' : 'text-slate-500 dark:text-slate-400', isWeekend(d) && 'bg-slate-100 dark:bg-slate-800/60')}>
                <div className="text-[10px] leading-3">{'SMTWTFS'[parseDate(d).getUTCDay()]}</div>
                <div>{Number(d.slice(8))}</div>
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row) => (
            <div key={row.id} className="flex border-b border-slate-100 last:border-b-0 dark:border-slate-800" style={{ height: ROW_H }}>
              <div style={{ width: LABEL_W }} className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900">
                {onRowClick ? (
                  <button type="button" onClick={() => onRowClick(row.id)} className="truncate text-left text-sm font-medium text-slate-900 hover:underline dark:text-slate-100">{row.label}</button>
                ) : <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{row.label}</div>}
                {row.sublabel && <div className="truncate text-[11px] muted">{row.sublabel}</div>}
              </div>
              <div className="relative shrink-0" style={{ width }}>
                {days.map((d) => isWeekend(d) && (
                  <div key={d} className="absolute inset-y-0 bg-slate-50 dark:bg-slate-800/40" style={{ left: x(d), width: dayWidth }} />
                ))}
                {row.bars.map((b) => {
                  if (b.end < start || b.start > end) return null;
                  const s = b.start < start ? start : b.start;
                  const e = b.end > end ? end : b.end;
                  const left = x(s) + 2;
                  const w = (daysBetween(s, e) + 1) * dayWidth - 4;
                  const cls = cx('absolute top-2 flex h-6 items-center overflow-hidden rounded px-1.5 text-[11px] font-medium', BAR[b.tone]);
                  return onBarClick ? (
                    <button key={b.id} type="button" title={b.title ?? b.label} aria-label={b.title ?? b.label} onClick={() => onBarClick(b.id)} className={cx(cls, 'hover:ring-2 hover:ring-accent/50')} style={{ left, width: w }}>
                      <span className="truncate">{w > 30 ? b.label : ''}</span>
                    </button>
                  ) : (
                    <div key={b.id} title={b.title ?? b.label} className={cls} style={{ left, width: w }}><span className="truncate">{w > 30 ? b.label : ''}</span></div>
                  );
                })}
                {row.markers?.map((m) => m.date >= start && m.date <= end && (
                  <div key={m.label + m.date} title={m.label} className="absolute inset-y-1 z-[5]" style={{ left: x(m.date) + dayWidth - 2 }}>
                    <div className={cx('h-full w-0.5', MARKER[m.tone])} />
                    <div className={cx('absolute -left-[3px] top-0 h-2 w-2 rotate-45', MARKER[m.tone])} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Today line */}
          {today >= start && today <= end && (
            <div aria-hidden className="pointer-events-none absolute bottom-0 top-0 z-[6] w-px bg-accent" style={{ left: LABEL_W + todayX + dayWidth / 2 }}>
              <span className="absolute -left-5 top-0 rounded bg-accent px-1 text-[10px] font-semibold text-white dark:text-slate-950">Today</span>
            </div>
          )}
        </div>
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] muted">
          {(['done', 'active', 'todo', 'late', 'blocked', 'projected'] as const).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={cx('inline-block h-2.5 w-4 rounded-sm', BAR[t])} />
              {{ done: 'Done', active: 'In progress', todo: 'Planned', late: 'Past due', blocked: 'Blocked', projected: 'Projected' }[t]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-accent" />Available / move-in date</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-red-600" />Projected ready (late)</span>
        </div>
      )}
    </div>
  );
}
