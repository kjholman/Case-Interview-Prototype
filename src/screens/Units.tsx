import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CONFIG } from '../config';
import { DataTable, type Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { StatusPill, UNIT_STATUS } from '../components/StatusPill';
import { ChipToggle, PageHeader, SearchInput, Select } from '../components/ui';
import { formatDate, TODAY } from '../domain/dates';
import { formatCurrency } from '../domain/impact';
import type { Unit, UnitStatus } from '../domain/types';
import { forecastPlan, unitPlan, type PlanForecast } from '../domain/workplan';
import { useAlerts, useLookups, useScopedData, useStore } from '../store/AppStore';
import { UnitDrawer } from './shared/Drawers';

interface Row extends Unit {
  propertyName: string;
  person?: string;
  forecast?: PlanForecast;
  late: boolean;
  issues: number;
}

export function Units() {
  const { state } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const { all } = useAlerts();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [floorplan, setFloorplan] = useState('all');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const statuses = new Set((params.get('status') ?? '').split(',').filter(Boolean) as UnitStatus[]);
  const openId = params.get('unit') ?? undefined;
  const cfg = CONFIG.screens.units;

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const toggleStatus = (s: UnitStatus) => {
    const n = new Set(statuses);
    if (n.has(s)) n.delete(s); else n.add(s);
    setParam('status', [...n].join(','));
  };

  const rows: Row[] = useMemo(() => {
    const issueCount = new Map<string, number>();
    for (const a of all) {
      const unitId = a.record.collection === 'units' ? a.record.id
        : a.record.collection === 'tasks' ? l.taskById.get(a.record.id)?.unitId
        : a.record.collection === 'residents' ? l.residentById.get(a.record.id)?.unitId : undefined;
      if (unitId) issueCount.set(unitId, (issueCount.get(unitId) ?? 0) + 1);
    }
    return data.units.map((u) => {
      const plan = unitPlan(l.tasksByUnit.get(u.id) ?? [], u.id);
      const forecast = plan.length ? forecastPlan(plan, TODAY) : undefined;
      const person = u.incomingProspectId ? l.prospectById.get(u.incomingProspectId)?.name : u.residentId ? l.residentById.get(u.residentId)?.name : undefined;
      return {
        ...u, propertyName: l.propertyById.get(u.propertyId)?.name ?? '', person, forecast,
        late: !!(forecast && u.availableDate && forecast.readyDate > u.availableDate && u.status !== 'ready' && u.status !== 'occupied'),
        issues: issueCount.get(u.id) ?? 0,
      };
    });
  }, [data.units, l, all]);

  const filtered = rows.filter((r) =>
    (!statuses.size || statuses.has(r.status)) &&
    (floorplan === 'all' || r.floorplan === floorplan) &&
    (!onlyIssues || r.issues > 0) &&
    (!q || r.number.includes(q) || r.person?.toLowerCase().includes(q.toLowerCase())));

  const columns: Column<Row>[] = [
    { id: 'unit', header: 'Unit', sortValue: (r) => r.propertyName + r.number.padStart(5, '0'),
      cell: (r) => <div><span className="font-medium text-slate-900 dark:text-white">{r.number}</span>{state.propertyId === 'all' && <span className="block text-[11px] muted">{r.propertyName}</span>}</div> },
    { id: 'plan', header: 'Plan', sortValue: (r) => r.floorplan, hideBelow: 'md',
      cell: (r) => <span className="text-slate-700 dark:text-slate-300">{r.floorplan} <span className="muted">· {r.beds === 0 ? 'Studio' : `${r.beds} bd`}</span></span> },
    { id: 'rent', header: 'Rent', align: 'right', sortValue: (r) => r.rent, hideBelow: 'sm', cell: (r) => formatCurrency(r.rent) },
    { id: 'status', header: 'Status', sortValue: (r) => r.status, cell: (r) => <StatusPill {...UNIT_STATUS[r.status]} /> },
    { id: 'person', header: 'Resident', sortValue: (r) => r.person, hideBelow: 'lg',
      cell: (r) => r.person ? <span>{r.person}{r.incomingProspectId && <span className="ml-1 text-[11px] muted">(incoming)</span>}</span> : <span className="muted">—</span> },
    { id: 'moveout', header: 'Move-out', sortValue: (r) => r.moveOutDate, hideBelow: 'md', cell: (r) => <span className="tabular-nums">{formatDate(r.moveOutDate)}</span> },
    { id: 'available', header: 'Available', sortValue: (r) => r.availableDate,
      cell: (r) => {
        const mismatch = r.crmAvailableDate && r.availableDate && r.crmAvailableDate !== r.availableDate;
        return (
          <span className="inline-flex items-center gap-1 tabular-nums">
            {formatDate(r.availableDate)}
            {mismatch && <span title={`Listing says ${formatDate(r.crmAvailableDate)}`} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-700 dark:text-red-400"><Icon name="alert" className="h-3.5 w-3.5" />CRM {formatDate(r.crmAvailableDate)}</span>}
          </span>
        );
      } },
    { id: 'makeready', header: 'Make-ready', sortValue: (r) => (r.forecast ? (r.late ? -1 : r.forecast.done / r.forecast.total) : undefined), hideBelow: 'sm',
      cell: (r) => r.forecast ? (
        <div className="min-w-[110px]">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className={r.late ? 'h-full bg-red-600' : 'h-full bg-emerald-500'} style={{ width: `${(r.forecast.done / r.forecast.total) * 100}%` }} />
            </div>
            <span className="text-xs tabular-nums muted">{r.forecast.done}/{r.forecast.total}</span>
          </div>
          {r.forecast.done < r.forecast.total && <span className={r.late ? 'text-[11px] font-medium text-red-700 dark:text-red-400' : 'text-[11px] muted'}>Ready {formatDate(r.forecast.readyDate)}{r.late && ' · late'}</span>}
        </div>
      ) : <span className="muted">—</span> },
    { id: 'issues', header: 'Issues', align: 'right', sortValue: (r) => r.issues,
      cell: (r) => r.issues ? <StatusPill tone={r.late ? 'danger' : 'warning'} label={String(r.issues)} /> : <span className="muted">—</span> },
  ];

  const counts = (Object.keys(UNIT_STATUS) as UnitStatus[]).map((s) => ({ s, n: rows.filter((r) => r.status === s).length }));
  const floorplans = [...new Set(rows.map((r) => r.floorplan))].sort();

  if (!state.settings.integrations.pms) {
    return (
      <>
        <PageHeader title={cfg.label} description={cfg.description} />
        <div className="card"><EmptyState icon="plug" title="Property management system not connected" body="Unit data comes from the PMS. Reconnect it in Settings to see units." action={<a className="btn-primary" href="#/settings">Open settings</a>} /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description} />
      <div className="card mb-3 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Unit or resident" label="Search units" className="lg:w-56" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {counts.map((c) => (
            <ChipToggle key={c.s} pressed={statuses.has(c.s)} onClick={() => toggleStatus(c.s)}>
              {UNIT_STATUS[c.s].label}<span className="tabular-nums opacity-70">{c.n}</span>
            </ChipToggle>
          ))}
          <ChipToggle pressed={onlyIssues} onClick={() => setOnlyIssues((v) => !v)}><Icon name="alert" className="h-3 w-3" />Has issues</ChipToggle>
        </div>
        <Select label="Floorplan" hideLabel value={floorplan} onChange={setFloorplan} className="lg:ml-auto lg:w-40"
          options={[{ value: 'all', label: 'All floorplans' }, ...floorplans.map((f) => ({ value: f, label: f }))]} />
      </div>
      <div className="card overflow-hidden">
        <DataTable
          rows={filtered} columns={columns} getRowId={(r) => r.id} caption="Units"
          onRowClick={(r) => setParam('unit', r.id)} selectedId={openId}
          initialSort={{ id: 'unit', dir: 'asc' }} maxHeight="calc(100vh - 260px)"
          empty={<EmptyState icon="search" title="No units match" body="Try clearing a filter." />}
        />
        <div className="border-t border-slate-200 px-3 py-2 text-xs muted dark:border-slate-800">{filtered.length} of {rows.length} units</div>
      </div>
      <UnitDrawer unitId={openId} onClose={() => setParam('unit')} />
    </>
  );
}
