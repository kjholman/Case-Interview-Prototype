import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONFIG } from '../config';
import { DataTable, type Column } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { StatusPill, type Tone } from '../components/StatusPill';
import { ChipToggle, PageHeader, SearchInput } from '../components/ui';
import { formatDateTime } from '../domain/dates';
import type { AuditEvent, AuditMode } from '../domain/types';
import { useFormatValue } from '../shell/format';
import { recordLink } from '../shell/links';
import { useLookups, useStore } from '../store/AppStore';

export const AUDIT_MODE: Record<AuditMode, { label: string; tone: Tone }> = {
  approved: { label: 'Approved', tone: 'success' },
  automatic: { label: 'Automatic', tone: 'accent' },
  rejected: { label: 'Rejected', tone: 'danger' },
  manual: { label: 'Manual', tone: 'neutral' },
  snoozed: { label: 'Snoozed', tone: 'warning' },
};

export function Activity() {
  const { state } = useStore();
  const l = useLookups();
  const formatValue = useFormatValue();
  const [modes, setModes] = useState<Set<AuditMode>>(new Set());
  const [q, setQ] = useState('');
  const cfg = CONFIG.screens.activity;

  const rows = useMemo(() => state.audit.filter((e) =>
    (state.propertyId === 'all' || !e.propertyId || e.propertyId === state.propertyId) &&
    (!modes.size || modes.has(e.mode)) &&
    (!q || `${e.actor} ${e.action} ${e.target?.label ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [state.audit, state.propertyId, modes, q]);

  const columns: Column<AuditEvent>[] = [
    { id: 'at', header: 'When', sortValue: (e) => e.at, cell: (e) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(e.at)}</span> },
    { id: 'mode', header: 'How', sortValue: (e) => e.mode, cell: (e) => <StatusPill {...AUDIT_MODE[e.mode]} /> },
    { id: 'actor', header: 'Who', sortValue: (e) => e.actor, hideBelow: 'md', cell: (e) => <span className="whitespace-nowrap">{e.actor}</span> },
    { id: 'action', header: 'What', cell: (e) => (
      <div className="min-w-[200px]">
        <p className="text-slate-900 dark:text-slate-100">{e.action}</p>
        {e.target && (recordLink(e.target, l)
          ? <Link to={recordLink(e.target, l)!} className="text-xs text-accent-strong hover:underline">{e.target.label}</Link>
          : <p className="text-xs muted">{e.target.label}</p>)}
        {e.note && <p className="text-xs muted">{e.note}</p>}
      </div>
    ) },
    { id: 'changes', header: 'Changes', hideBelow: 'lg', cell: (e) => e.changes?.length ? (
      <ul className="space-y-0.5 text-xs">
        {e.changes.map((c) => (
          <li key={c.field}><span className="muted">{c.label}:</span> <span className="line-through decoration-slate-400 muted">{formatValue(c, c.from)}</span> → <span className="font-medium text-slate-900 dark:text-slate-100">{formatValue(c, c.to)}</span></li>
        ))}
      </ul>
    ) : <span className="muted">—</span> },
  ];

  const count = (m: AuditMode) => state.audit.filter((e) => e.mode === m).length;

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description} />
      <div className="card mb-3 flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Person, action or record" label="Search activity" className="md:w-64" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          {(Object.keys(AUDIT_MODE) as AuditMode[]).map((m) => (
            <ChipToggle key={m} pressed={modes.has(m)} onClick={() => setModes((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; })}>
              {AUDIT_MODE[m].label}<span className="tabular-nums opacity-70">{count(m)}</span>
            </ChipToggle>
          ))}
        </div>
      </div>
      <div className="card overflow-hidden">
        <DataTable rows={rows} columns={columns} getRowId={(e) => e.id} caption="Activity log" initialSort={{ id: 'at', dir: 'desc' }}
          maxHeight="calc(100vh - 250px)" empty={<EmptyState icon="history" title="No activity matches" />} />
      </div>
    </>
  );
}
