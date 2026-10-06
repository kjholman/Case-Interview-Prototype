import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CONFIG } from '../config';
import { DataTable, type Column } from '../components/DataTable';
import { DetailDrawer } from '../components/DetailDrawer';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { KeyNumber } from '../components/KeyNumber';
import { RESIDENT_STAGE, StatusPill, type Tone } from '../components/StatusPill';
import { ChipToggle, Field, PageHeader, SearchInput, useToast } from '../components/ui';
import { daysBetween, formatDate, formatLongDate, TODAY } from '../domain/dates';
import { formatCurrency } from '../domain/impact';
import type { Resident, ResidentStage } from '../domain/types';
import { useAlerts, useLookups, useScopedData, useStore } from '../store/AppStore';

const STAGE_TONE: Record<ResidentStage, Tone> = { current: 'neutral', renewal_offered: 'info', renewed: 'success', notice_given: 'warning' };
type Filter = 'balance' | 'expiring' | 'offered' | 'notice';

export function Residents() {
  const { state } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const openId = params.get('r') ?? undefined;
  const cfg = CONFIG.screens.residents;

  const lastPayment = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of state.data.ledger) if (e.type === 'payment' && (m.get(e.residentId) ?? '') < e.date) m.set(e.residentId, e.date);
    return m;
  }, [state.data.ledger]);

  const daysLeft = (r: Resident) => daysBetween(TODAY, r.leaseEnd);
  const rows = data.residents.filter((r) =>
    (!filters.has('balance') || r.balance > 0) &&
    (!filters.has('expiring') || (daysLeft(r) <= 60 && daysLeft(r) >= 0 && r.stage !== 'notice_given')) &&
    (!filters.has('offered') || r.stage === 'renewal_offered') &&
    (!filters.has('notice') || r.stage === 'notice_given') &&
    (!q || r.name.toLowerCase().includes(q.toLowerCase()) || l.unitById.get(r.unitId)?.number.includes(q)));

  const toggle = (f: Filter) => setFilters((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const open = (id?: string) => { const n = new URLSearchParams(params); if (id) n.set('r', id); else n.delete('r'); setParams(n, { replace: true }); };

  const delinquent = data.residents.filter((r) => r.balance > 0);
  const expiring = data.residents.filter((r) => r.stage === 'current' && daysLeft(r) <= 60 && daysLeft(r) >= 0);
  const renewed = data.residents.filter((r) => r.stage === 'renewed').length;
  const offered = data.residents.filter((r) => r.stage === 'renewal_offered').length;

  const columns: Column<Resident>[] = [
    { id: 'name', header: 'Resident', sortValue: (r) => r.name,
      cell: (r) => <div><span className="font-medium text-slate-900 dark:text-white">{r.name}</span><span className="block text-[11px] muted">{r.email}</span></div> },
    { id: 'unit', header: 'Unit', sortValue: (r) => `${r.propertyId}${l.unitById.get(r.unitId)?.number.padStart(5, '0')}`,
      cell: (r) => <div><span>{l.unitById.get(r.unitId)?.number}</span>{state.propertyId === 'all' && <span className="block text-[11px] muted">{l.propertyById.get(r.propertyId)?.name}</span>}</div> },
    { id: 'leaseEnd', header: 'Lease ends', sortValue: (r) => r.leaseEnd,
      cell: (r) => <div className="tabular-nums">{formatDate(r.leaseEnd)}{r.stage !== 'renewed' && daysLeft(r) <= 60 && daysLeft(r) >= 0 && <span className="block text-[11px] text-amber-700 dark:text-amber-400">in {daysLeft(r)} days</span>}</div> },
    { id: 'stage', header: 'Renewal', sortValue: (r) => r.stage, cell: (r) => <StatusPill tone={STAGE_TONE[r.stage]} label={RESIDENT_STAGE[r.stage]} /> },
    { id: 'balance', header: 'Balance', align: 'right', sortValue: (r) => r.balance,
      cell: (r) => <span className={r.balance > 0 ? 'font-medium text-red-700 dark:text-red-400' : 'muted'}>{formatCurrency(r.balance)}</span> },
    { id: 'paid', header: 'Last payment', hideBelow: 'md', sortValue: (r) => lastPayment.get(r.id), cell: (r) => <span className="tabular-nums">{formatDate(lastPayment.get(r.id))}</span> },
  ];

  if (!state.settings.integrations.pms) {
    return (
      <>
        <PageHeader title={cfg.label} description={cfg.description} />
        <div className="card"><EmptyState icon="plug" title="Property management system not connected" body="Residents and ledgers come from the PMS. Reconnect it in Settings." action={<a className="btn-primary" href="#/settings">Open settings</a>} /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KeyNumber label="Residents" value={data.residents.length} hint={`${data.residents.filter((r) => r.stage === 'notice_given').length} on notice`} icon="users" />
        <KeyNumber label="Delinquent" value={formatCurrency(delinquent.reduce((s, r) => s + r.balance, 0))} hint={`${delinquent.length} residents owe a balance`} tone={delinquent.length ? 'bad' : 'good'} icon="dollar" />
        <KeyNumber label="Expiring, no offer" value={expiring.length} hint="Lease ends within 60 days" tone={expiring.length ? 'warn' : 'good'} icon="calendar" />
        <KeyNumber label="Renewals" value={`${renewed} signed`} hint={`${offered} offers out`} tone="good" icon="checkCircle" />
      </div>
      <div className="card mb-3 flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Name or unit" label="Search residents" className="md:w-56" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filters">
          <ChipToggle pressed={filters.has('balance')} onClick={() => toggle('balance')}>Balance due<span className="opacity-70">{delinquent.length}</span></ChipToggle>
          <ChipToggle pressed={filters.has('expiring')} onClick={() => toggle('expiring')}>Ends within 60 days</ChipToggle>
          <ChipToggle pressed={filters.has('offered')} onClick={() => toggle('offered')}>Offer sent</ChipToggle>
          <ChipToggle pressed={filters.has('notice')} onClick={() => toggle('notice')}>On notice</ChipToggle>
        </div>
      </div>
      <div className="card overflow-hidden">
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} caption="Residents" onRowClick={(r) => open(r.id)} selectedId={openId}
          initialSort={{ id: 'name', dir: 'asc' }} maxHeight="calc(100vh - 360px)" empty={<EmptyState icon="search" title="No residents match" />} />
        <div className="border-t border-slate-200 px-3 py-2 text-xs muted dark:border-slate-800">{rows.length} of {data.residents.length} residents</div>
      </div>
      <ResidentDrawer key={openId} residentId={openId} onClose={() => open()} />
    </>
  );
}

function ResidentDrawer({ residentId, onClose }: { residentId?: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const l = useLookups();
  const { all } = useAlerts();
  const toast = useToast();
  const r = residentId ? l.residentById.get(residentId) : undefined;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Online payment');
  const [noticeDate, setNoticeDate] = useState('');
  if (!r) return null;
  const unit = l.unitById.get(r.unitId);
  const entries = state.data.ledger.filter((e) => e.residentId === r.id).sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const conv = state.data.conversations.find((c) => c.contact.id === r.id);
  const alerts = all.filter((a) => a.record.id === r.id);

  const pay = () => {
    const amt = Number(amount || r.balance);
    if (!(amt > 0)) return;
    dispatch({ type: 'recordPayment', residentId: r.id, amount: amt, method });
    toast(`Posted ${formatCurrency(amt, 2)} to ${r.name}'s ledger`);
    setAmount('');
  };

  return (
    <DetailDrawer open onClose={onClose} title={r.name}
      subtitle={<><StatusPill tone={STAGE_TONE[r.stage]} label={RESIDENT_STAGE[r.stage]} /><span>Unit {unit?.number} · {l.propertyById.get(r.propertyId)?.name}</span></>}>
      <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label="Lease">{formatLongDate(r.leaseStart)} – {formatLongDate(r.leaseEnd)}</Field>
        <Field label="Rent">{formatCurrency(unit?.rent ?? 0)}/mo</Field>
        <Field label="Balance"><span className={r.balance > 0 ? 'font-semibold text-red-700 dark:text-red-400' : ''}>{formatCurrency(r.balance, 2)}</span></Field>
        <Field label="Phone">{r.phone}</Field>
        <Field label="Email">{r.email}</Field>
        <Field label="Last reminder">{formatDate(r.lastReminderDate)}</Field>
      </dl>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/50">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div><p className="font-medium text-slate-900 dark:text-slate-100">{a.title}</p><p className="text-xs text-slate-600 dark:text-slate-400">{a.route === 'approval' ? 'Waiting in Approvals: ' : ''}{a.fix?.label ?? a.suggestedAction}</p></div>
            </div>
          ))}
        </div>
      )}

      <section className="mb-6">
        <h3 className="section-title mb-2">Ledger</h3>
        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs muted dark:bg-slate-900">
              <th className="px-3 py-1.5 font-medium">Date</th><th className="px-3 py-1.5 font-medium">Description</th>
              <th className="px-3 py-1.5 text-right font-medium">Charge</th><th className="px-3 py-1.5 text-right font-medium">Payment</th><th className="px-3 py-1.5 text-right font-medium">Balance</th>
            </tr></thead>
            <tbody>
              {entries.map((e) => {
                running += e.amount;
                return (
                  <tr key={e.id} className="border-t border-slate-100 tabular-nums dark:border-slate-800">
                    <td className="whitespace-nowrap px-3 py-1.5">{formatDate(e.date)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{e.description}</td>
                    <td className="px-3 py-1.5 text-right">{e.amount > 0 ? formatCurrency(e.amount, 2) : ''}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700 dark:text-emerald-400">{e.amount < 0 ? formatCurrency(-e.amount, 2) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(running, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="pay-amt" className="label">Payment amount</label>
            <input id="pay-amt" type="number" min={0} step="0.01" className="input w-36" placeholder={r.balance ? r.balance.toFixed(2) : '0.00'} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pay-method" className="label">Method</label>
            <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['Online payment', 'Check', 'Money order', 'Cashier check'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <button type="button" className="btn-primary" onClick={pay} disabled={!(Number(amount || r.balance) > 0)}><Icon name="dollar" />Record payment</button>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="section-title mb-2">Renewal</h3>
        <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
          {r.stage === 'renewed' ? `Renewed through ${formatDate(r.leaseEnd)}.`
            : r.stage === 'notice_given' ? `Moving out ${formatDate(r.leaseEnd)}. The unit is on notice with a make-ready plan.`
            : r.stage === 'renewal_offered' ? `Offer sent ${formatDate(r.renewalOfferDate)}. Lease ends ${formatDate(r.leaseEnd)}.`
            : `No offer yet. Lease ends ${formatDate(r.leaseEnd)} (${daysBetween(TODAY, r.leaseEnd)} days).`}
        </p>
        <div className="flex flex-wrap gap-2">
          {r.stage === 'current' && (
            <button type="button" className="btn-secondary" onClick={() => {
              dispatch({ type: 'updateRecord', collection: 'residents', id: r.id, patch: { stage: 'renewal_offered', renewalOfferDate: TODAY }, action: 'Sent renewal offer',
                target: { collection: 'residents', id: r.id, label: r.name }, propertyId: r.propertyId, changes: [{ field: 'stage', label: 'Renewal', from: 'current', to: 'renewal_offered' }] });
              toast('Renewal offer sent');
            }}>Send renewal offer</button>
          )}
          {(r.stage === 'current' || r.stage === 'renewal_offered') && (
            <button type="button" className="btn-secondary" onClick={() => { dispatch({ type: 'renewLease', residentId: r.id }); toast('Renewal signed — lease extended 12 months'); }}>
              <Icon name="check" />Mark renewal signed
            </button>
          )}
        </div>
      </section>

      {r.stage !== 'notice_given' && (
        <section className="mb-6">
          <h3 className="section-title mb-2">Notice to vacate</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="notice-date" className="label">Move-out date</label>
              <input id="notice-date" type="date" className="input" value={noticeDate || r.leaseEnd} min={TODAY} onChange={(e) => setNoticeDate(e.target.value)} />
            </div>
            <button type="button" className="btn-danger" onClick={() => {
              dispatch({ type: 'giveNotice', residentId: r.id, moveOut: noticeDate || r.leaseEnd });
              toast(`Notice recorded. Unit ${unit?.number} is on notice and its make-ready plan is scheduled.`, { tone: 'warning' });
            }}>Record notice</button>
          </div>
          <p className="mt-1 text-xs muted">Puts the unit on notice, sets it available 10 days after move-out, and schedules the standard make-ready plan.</p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {unit && <Link to={`/units?unit=${unit.id}`} className="btn-ghost btn-sm">View unit {unit.number}</Link>}
        {conv && <Link to={`/conversations?c=${conv.id}`} className="btn-ghost btn-sm">Open conversation</Link>}
      </div>
    </DetailDrawer>
  );
}
