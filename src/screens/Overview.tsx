import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONFIG } from '../config';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { KeyNumber } from '../components/KeyNumber';
import { SEVERITY, StatusPill, UNIT_STATUS } from '../components/StatusPill';
import { Card, PageHeader, cx } from '../components/ui';
import { addDays, formatDate, formatWeekday, relativeDay, TODAY } from '../domain/dates';
import type { UnitStatus } from '../domain/types';
import { recordLink } from '../shell/links';
import { useAlerts, useLookups, useScopedData, useStore } from '../store/AppStore';
import { InboundSimulator } from './shared/InboundSimulator';

const STATUS_BAR: Record<UnitStatus, string> = {
  occupied: 'bg-slate-300 dark:bg-slate-600', notice: 'bg-amber-400', vacant: 'bg-red-600', ready: 'bg-emerald-500', leased: 'bg-sky-500',
};

export function Overview() {
  const { state } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const { all, exceptions, approvals } = useAlerts();
  const cfg = CONFIG.screens.overview;

  const m = useMemo(() => {
    const units = data.units;
    const count = (s: UnitStatus) => units.filter((u) => u.status === s).length;
    const occupied = count('occupied') + count('notice');
    const openWork = data.tasks.filter((t) => t.status !== 'done');
    return {
      total: units.length,
      counts: (Object.keys(UNIT_STATUS) as UnitStatus[]).map((s) => ({ s, n: count(s) })),
      occupancy: units.length ? (occupied / units.length) * 100 : 0,
      leased: units.length ? ((occupied + count('leased')) / units.length) * 100 : 0,
      vacant: count('vacant'),
      ready: count('ready'),
      openWork: openWork.length,
      pastDue: openWork.filter((t) => t.due < TODAY && t.status !== 'blocked').length,
      blocked: openWork.filter((t) => t.status === 'blocked').length,
      behind: all.filter((a) => a.ruleId === 'makeready-late').length,
      critical: all.filter((a) => a.severity === 'critical').length,
    };
  }, [data, all]);

  const autoToday = state.audit.filter((e) => e.mode === 'automatic' && e.at.startsWith(TODAY) && (state.propertyId === 'all' || e.propertyId === state.propertyId)).length;
  const urgent = exceptions.slice(0, 6);

  const upcoming = useMemo(() => {
    const end = addDays(TODAY, 14);
    const items: { date: string; label: string; kind: 'Move-out' | 'Move-in'; unitId: string }[] = [];
    for (const u of data.units) {
      if (u.status === 'notice' && u.moveOutDate && u.moveOutDate <= end) items.push({ date: u.moveOutDate, kind: 'Move-out', label: `Unit ${u.number}`, unitId: u.id });
      if (u.status === 'leased' && u.availableDate && u.availableDate <= end) items.push({ date: u.availableDate, kind: 'Move-in', label: `Unit ${u.number}`, unitId: u.id });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [data.units]);

  return (
    <>
      <PageHeader title={cfg.label} description={`${cfg.description} ${formatWeekday(TODAY)}.`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KeyNumber label="Occupancy" value={`${m.occupancy.toFixed(1)}%`} hint={`${m.leased.toFixed(1)}% leased incl. move-ins`} icon="building" to="/units" />
        <KeyNumber label="Vacant, not ready" value={m.vacant} hint={`${m.ready} ready to lease`} tone={m.vacant > 0 ? 'warn' : 'good'} icon="home" to="/units?status=vacant" />
        <KeyNumber label="Make-ready behind" value={m.behind} hint={m.behind ? 'Will miss available date' : 'All on track'} tone={m.behind ? 'bad' : 'good'} icon="clock" to="/work?view=timeline" />
        <KeyNumber label="Open work" value={m.openWork} hint={`${m.pastDue} late · ${m.blocked} blocked`} tone={m.pastDue ? 'bad' : 'default'} icon="wrench" to="/work" />
        <KeyNumber label="Needs a person" value={exceptions.length + approvals.length} hint={`${exceptions.length} exceptions · ${approvals.length} approvals`} tone={m.critical ? 'bad' : 'default'} icon="alert" to="/exceptions" />
        <KeyNumber label="Automatic changes today" value={autoToday} hint={`Automation Level ${state.settings.automationLevel}`} icon="bolt" to="/activity" />
      </div>

      <EliseCard />

      <Card className="mt-4" title="Units by status" bodyClassName="p-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img"
          aria-label={m.counts.map((c) => `${UNIT_STATUS[c.s].label} ${c.n}`).join(', ')}>
          {m.counts.map((c) => c.n > 0 && <div key={c.s} className={STATUS_BAR[c.s]} style={{ width: `${(c.n / m.total) * 100}%` }} />)}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {m.counts.map((c) => (
            <li key={c.s}>
              <Link to={`/units?status=${c.s}`} className="inline-flex items-center gap-1.5 hover:underline">
                <span className={cx('h-2.5 w-2.5 rounded-sm', STATUS_BAR[c.s])} />
                <span className="text-slate-700 dark:text-slate-300">{UNIT_STATUS[c.s].label}</span>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{c.n}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card title="Most urgent" actions={<Link to="/exceptions" className="text-sm font-medium text-accent-strong hover:underline">All exceptions ({exceptions.length})</Link>} bodyClassName="p-0">
          {urgent.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {urgent.map((a) => (
                <li key={a.id}>
                  <Link to={recordLink(a.record, l) ?? '/exceptions'} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <StatusPill {...SEVERITY[a.severity]} className="mt-0.5 w-[72px] justify-center" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.title}</p>
                      <p className="truncate text-xs muted">{a.reason}</p>
                    </div>
                    {state.propertyId === 'all' && <span className="ml-auto hidden shrink-0 text-xs muted md:block">{l.propertyById.get(a.propertyId)?.name}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing urgent" body="No exceptions need a person right now." />}
        </Card>

        <Card title="Next 14 days" bodyClassName="p-0">
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.map((u) => (
                <li key={u.kind + u.unitId}>
                  <Link to={`/units?unit=${u.unitId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-[11px] uppercase muted">{formatDate(u.date).split(' ')[0]}</p>
                      <p className="text-lg font-semibold leading-5 tabular-nums text-slate-900 dark:text-white">{formatDate(u.date).split(' ')[1]}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{u.kind} · {u.label}</p>
                      <p className="text-xs muted">{relativeDay(u.date)}</p>
                    </div>
                    <StatusPill tone={u.kind === 'Move-in' ? 'info' : 'warning'} label={u.kind} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No move-ins or move-outs" icon="calendar" />}
        </Card>
      </div>

      {state.propertyId === 'all' && (
        <Card className="mt-4" title="By property" bodyClassName="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs muted">
              <th className="px-4 py-2 font-medium">Property</th><th className="px-4 py-2 text-right font-medium">Units</th>
              <th className="px-4 py-2 text-right font-medium">Occupancy</th><th className="px-4 py-2 text-right font-medium">Vacant</th>
              <th className="px-4 py-2 text-right font-medium">Open work</th><th className="px-4 py-2 text-right font-medium">Needs a person</th>
            </tr></thead>
            <tbody>
              {state.data.properties.map((p) => {
                const us = state.data.units.filter((u) => u.propertyId === p.id);
                const occ = us.filter((u) => u.status === 'occupied' || u.status === 'notice').length;
                const need = exceptions.filter((a) => a.propertyId === p.id).length + approvals.filter((a) => a.propertyId === p.id).length;
                return (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2"><span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span><span className="ml-2 text-xs muted">{p.city}, {p.state}</span></td>
                    <td className="px-4 py-2 text-right tabular-nums">{us.length}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{((occ / us.length) * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{us.filter((u) => u.status === 'vacant').length}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{state.data.tasks.filter((t) => t.propertyId === p.id && t.status !== 'done').length}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{need}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

const minutesBetween = (a: string, b: string) => (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60_000;
const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmtMinutes = (m?: number) => (m === undefined ? '—' : m < 1 ? 'Under 1 min' : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} hrs`);

/** What Elise is doing: share of conversations she handles, response time, work orders and tours. */
function EliseCard() {
  const data = useScopedData();
  const [simOpen, setSimOpen] = useState(false);
  const name = CONFIG.brand.assistantName;
  const m = useMemo(() => {
    const elise: number[] = [];
    const staff: number[] = [];
    for (const c of data.conversations) {
      // Response time = reply time minus the most recent message from the contact before it.
      let lastInbound: string | undefined;
      for (const msg of c.messages) {
        if (msg.from === 'contact') lastInbound = msg.at;
        else if (lastInbound) {
          (msg.from === 'ai' ? elise : staff).push(minutesBetween(lastInbound, msg.at));
          lastInbound = undefined;
          if (msg.from === 'ai') continue;
        } else if (msg.from === 'staff') {
          const prev = [...c.messages].reverse().find((x) => x.from === 'contact' && x.at <= msg.at);
          if (prev) staff.push(minutesBetween(prev.at, msg.at));
        }
      }
    }
    const handled = data.conversations.filter((c) => c.handledBy === 'ai' && !c.escalated).length;
    const wo = data.tasks.filter((t) => t.source === 'elise');
    const tours = data.prospects.filter((p) => p.tourDate && p.tourBookedBy === 'elise');
    return {
      share: data.conversations.length ? Math.round((handled / data.conversations.length) * 100) : 0,
      escalated: data.conversations.filter((c) => c.escalated && c.status !== 'resolved').length,
      eliseMedian: median(elise), staffMedian: median(staff),
      woOpen: wo.filter((t) => t.status !== 'done').length, woTotal: wo.length,
      tours: tours.length, toursUpcoming: tours.filter((p) => p.stage === 'tour_scheduled' && p.tourDate! >= TODAY).length,
    };
  }, [data]);

  return (
    <section className="dark relative mt-4 overflow-hidden rounded-lg bg-[#0B0A12] p-4 text-white">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-20 h-48 w-72 rounded-full bg-[#7638FA]/40 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm text-white"><Icon name="sparkles" className="h-4 w-4 text-[#AFC1F6]" />{name} across your properties</h2>
        <button type="button" className="btn btn-sm bg-white text-slate-900 hover:bg-slate-200" onClick={() => setSimOpen(true)}><Icon name="send" className="h-3.5 w-3.5" />Simulate inbound message</button>
      </div>
      <dl className="relative mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: `Conversations ${name} handled without staff`, value: `${m.share}%`, hint: `${m.escalated} escalated to staff` },
          { label: 'Median first response', value: fmtMinutes(m.eliseMedian), hint: `Staff: ${fmtMinutes(m.staffMedian)}` },
          { label: `Work orders created by ${name}`, value: String(m.woTotal), hint: `${m.woOpen} still open` },
          { label: `Tours booked by ${name}`, value: String(m.tours), hint: `${m.toursUpcoming} upcoming` },
        ].map((x) => (
          <div key={x.label}>
            <dt className="text-xs text-slate-400">{x.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{x.value}</dd>
            <dd className="text-xs text-[#AFC1F6]">{x.hint}</dd>
          </div>
        ))}
      </dl>
      <InboundSimulator open={simOpen} onClose={() => setSimOpen(false)} />
    </section>
  );
}
