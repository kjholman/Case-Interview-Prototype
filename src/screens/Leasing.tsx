import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CONFIG } from '../config';
import { DetailDrawer } from '../components/DetailDrawer';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { KanbanBoard } from '../components/KanbanBoard';
import { KeyNumber } from '../components/KeyNumber';
import { PROSPECT_STAGE, StatusPill, type Tone } from '../components/StatusPill';
import { ChipToggle, Field, PageHeader, SearchInput, cx, useToast } from '../components/ui';
import { addBusinessDays, addDays, formatDate, formatLongDate, formatWeekday, maxDate, TODAY } from '../domain/dates';
import { TOUR_SLOTS } from '../domain/elise';
import { formatCurrency } from '../domain/impact';
import type { Prospect, ProspectStage } from '../domain/types';
import { useActor, useLookups, useScopedData, useStore } from '../store/AppStore';
import { InboundSimulator } from './shared/InboundSimulator';

const COLUMNS: { id: ProspectStage; tone: Tone }[] = [
  { id: 'inquiry', tone: 'neutral' },
  { id: 'tour_scheduled', tone: 'info' },
  { id: 'toured', tone: 'info' },
  { id: 'applied', tone: 'warning' },
  { id: 'approved', tone: 'accent' },
  { id: 'leased', tone: 'success' },
];

export function Leasing() {
  const { state, dispatch } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const toast = useToast();
  const actor = useActor();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const openId = params.get('p') ?? undefined;
  const cfg = CONFIG.screens.leasing;
  const open = (id?: string) => { const n = new URLSearchParams(params); if (id) n.set('p', id); else n.delete('p'); setParams(n, { replace: true }); };

  const prospects = data.prospects.filter((p) => (showLost || p.stage !== 'lost') && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const count = (s: ProspectStage) => data.prospects.filter((p) => p.stage === s).length;
  const upcomingTours = data.prospects.filter((p) => p.stage === 'tour_scheduled' && p.tourDate && p.tourDate >= TODAY);
  const toursAll = data.prospects.filter((p) => p.tourDate);
  const byElise = toursAll.filter((p) => p.tourBookedBy === 'elise').length;

  const move = (id: string, to: string) => {
    const p = l.prospectById.get(id);
    if (!p || p.stage === to) return;
    if (to === 'leased') { open(id); toast('Choose a unit and move-in date to sign the lease', { tone: 'info' }); return; }
    const patch: Partial<Prospect> = { stage: to as ProspectStage, lastContactDate: TODAY };
    if (to === 'tour_scheduled' && !(p.tourDate && p.tourDate >= TODAY)) Object.assign(patch, { tourDate: addBusinessDays(addDays(TODAY, 1), 0), tourTime: TOUR_SLOTS[0], tourBookedBy: 'staff' });
    dispatch({ type: 'updateRecord', collection: 'prospects', id, patch, action: `Moved lead to ${PROSPECT_STAGE[to as ProspectStage]}`,
      target: { collection: 'prospects', id, label: p.name }, propertyId: p.propertyId, changes: [{ field: 'stage', label: 'Stage', from: p.stage, to }] });
    toast(`${p.name} → ${PROSPECT_STAGE[to as ProspectStage]}`);
  };

  if (!state.settings.integrations.crm) {
    return (
      <>
        <PageHeader title={cfg.label} description={cfg.description} />
        <div className="card"><EmptyState icon="plug" title="Leasing CRM not connected" body="Leads and tours come from the CRM. Reconnect it in Settings." action={<a className="btn-primary" href="#/settings">Open settings</a>} /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description}
        actions={<button type="button" className="btn-primary" onClick={() => setSimOpen(true)}><Icon name="send" />New lead message</button>} />
      <InboundSimulator open={simOpen} onClose={() => setSimOpen(false)} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KeyNumber label="New leads" value={count('inquiry')} hint="Not toured yet" icon="user" />
        <KeyNumber label="Upcoming tours" value={upcomingTours.length} hint={upcomingTours[0] ? `Next ${formatWeekday(upcomingTours.map((p) => p.tourDate!).sort()[0])}` : 'None booked'} icon="calendar" />
        <KeyNumber label={`Tours booked by ${CONFIG.brand.assistantName}`} value={toursAll.length ? `${Math.round((byElise / toursAll.length) * 100)}%` : '—'} hint={`${byElise} of ${toursAll.length} tours`} tone="good" icon="sparkles" />
        <KeyNumber label="Applications" value={count('applied') + count('approved')} hint={`${count('approved')} approved, ready to sign`} icon="checkCircle" />
        <KeyNumber label="Leases signed" value={count('leased')} hint="Move-ins scheduled" tone="good" icon="key" />
      </div>

      <div className="card mb-3 flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Lead name" label="Search leads" className="md:w-56" />
        <ChipToggle pressed={showLost} onClick={() => setShowLost((v) => !v)}>Show lost leads<span className="opacity-70">{count('lost')}</span></ChipToggle>
        <p className="text-xs muted md:ml-auto">Drag a card, or use “Move to”. Moving to Lease signed asks for a unit and move-in date.</p>
      </div>

      <KanbanBoard
        columns={[...COLUMNS, ...(showLost ? [{ id: 'lost' as ProspectStage, tone: 'neutral' as Tone }] : [])].map((c) => ({ id: c.id, title: PROSPECT_STAGE[c.id], tone: c.tone }))}
        items={[...prospects].sort((a, b) => (a.tourDate ?? a.lastContactDate).localeCompare(b.tourDate ?? b.lastContactDate))}
        getId={(p) => p.id} getColumn={(p) => p.stage} onMove={move} onOpen={(p) => open(p.id)}
        renderCard={(p) => {
          const unit = p.interestedUnitId ? l.unitById.get(p.interestedUnitId) : undefined;
          const missed = p.stage === 'tour_scheduled' && p.tourDate && p.tourDate < TODAY;
          return (
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
              <p className="text-xs muted">{p.beds === 0 ? 'Studio' : `${p.beds} bed`} · move-in {formatDate(p.desiredMoveIn)} · {p.source}</p>
              {p.tourDate && p.stage === 'tour_scheduled' && (
                <p className={cx('flex items-center gap-1 text-xs', missed ? 'font-medium text-red-700 dark:text-red-400' : 'text-slate-700 dark:text-slate-300')}>
                  <Icon name="calendar" className="h-3.5 w-3.5" />{missed ? 'Missed tour ' : 'Tour '}{formatWeekday(p.tourDate)}{p.tourTime && `, ${p.tourTime}`}
                  {p.tourBookedBy === 'elise' && <StatusPill tone="accent" label={CONFIG.brand.assistantName} dot={false} className="ml-1 px-1.5 py-0 text-[10px]" />}
                </p>
              )}
              {unit && <p className="text-xs muted">{p.stage === 'leased' ? 'Leased' : 'Interested in'} unit {unit.number}{state.propertyId === 'all' ? ` · ${l.propertyById.get(p.propertyId)?.name.split(' ').slice(0, 2).join(' ')}` : ''}</p>}
            </div>
          );
        }}
      />
      <ProspectDrawer key={openId} prospectId={openId} onClose={() => open()} actor={actor} />
    </>
  );
}

function ProspectDrawer({ prospectId, onClose, actor }: { prospectId?: string; onClose: () => void; actor: string }) {
  const { state, dispatch } = useStore();
  const l = useLookups();
  const toast = useToast();
  const p = prospectId ? l.prospectById.get(prospectId) : undefined;
  const available = useMemo(() => {
    if (!p) return [];
    return state.data.units
      .filter((u) => u.propertyId === p.propertyId && (u.status === 'vacant' || u.status === 'ready' || u.status === 'notice') && !u.incomingProspectId)
      .sort((a, b) => Number(b.beds === p.beds) - Number(a.beds === p.beds) || (a.availableDate ?? '').localeCompare(b.availableDate ?? ''));
  }, [state.data.units, p]);
  const [unitId, setUnitId] = useState(p?.interestedUnitId && available.some((u) => u.id === p.interestedUnitId) ? p.interestedUnitId : available[0]?.id ?? '');
  const unit = l.unitById.get(unitId);
  const [moveIn, setMoveIn] = useState('');
  const [tourDate, setTourDate] = useState(addBusinessDays(addDays(TODAY, 1), 0));
  const [tourTime, setTourTime] = useState(TOUR_SLOTS[0]);
  if (!p) return null;
  const conv = state.data.conversations.find((c) => c.contact.id === p.id);
  const defaultMoveIn = unit ? maxDate(unit.availableDate ?? TODAY, TODAY, p.desiredMoveIn > TODAY ? p.desiredMoveIn : TODAY) : TODAY;

  const setStage = (stage: ProspectStage, label: string, extra: Partial<Prospect> = {}) => {
    dispatch({ type: 'updateRecord', collection: 'prospects', id: p.id, patch: { stage, lastContactDate: TODAY, ...extra }, action: label,
      target: { collection: 'prospects', id: p.id, label: p.name }, propertyId: p.propertyId, changes: [{ field: 'stage', label: 'Stage', from: p.stage, to: stage }] });
    toast(label);
  };

  return (
    <DetailDrawer open onClose={onClose} title={p.name}
      subtitle={<><StatusPill tone="info" label={PROSPECT_STAGE[p.stage]} /><span>{l.propertyById.get(p.propertyId)?.name}</span></>}>
      <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label="Looking for">{p.beds === 0 ? 'Studio' : `${p.beds} bedroom`}</Field>
        <Field label="Desired move-in">{formatDate(p.desiredMoveIn)}</Field>
        <Field label="Source">{p.source}</Field>
        <Field label="Phone">{p.phone || '—'}</Field>
        <Field label="Email">{p.email || '—'}</Field>
        <Field label="Last contact">{formatDate(p.lastContactDate)}</Field>
        <Field label="Tour">{p.tourDate ? `${formatWeekday(p.tourDate)}${p.tourTime ? `, ${p.tourTime}` : ''}` : '—'}</Field>
        <Field label="Booked by">{p.tourBookedBy === 'elise' ? CONFIG.brand.assistantName : p.tourBookedBy === 'staff' ? 'Staff' : '—'}</Field>
        {p.leaseStart && <Field label="Lease">{formatLongDate(p.leaseStart)} – {formatLongDate(p.leaseEnd)}</Field>}
      </dl>

      {(p.stage === 'inquiry' || p.stage === 'tour_scheduled') && (
        <section className="mb-6">
          <h3 className="section-title mb-2">{p.stage === 'tour_scheduled' ? 'Reschedule tour' : 'Schedule a tour'}</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div><label htmlFor="tour-date" className="label">Date</label><input id="tour-date" type="date" className="input" min={TODAY} value={tourDate} onChange={(e) => setTourDate(e.target.value)} /></div>
            <div><label htmlFor="tour-time" className="label">Time</label>
              <select id="tour-time" className="input" value={tourTime} onChange={(e) => setTourTime(e.target.value)}>{TOUR_SLOTS.map((t) => <option key={t}>{t}</option>)}</select></div>
            <button type="button" className="btn-primary" onClick={() => setStage('tour_scheduled', `Tour booked ${formatWeekday(tourDate)}, ${tourTime} by ${actor}`, { tourDate, tourTime, tourBookedBy: 'staff' })}>
              <Icon name="calendar" />Book tour
            </button>
          </div>
        </section>
      )}

      {p.stage !== 'leased' && p.stage !== 'lost' && (
        <section className="mb-6">
          <h3 className="section-title mb-2">Next step</h3>
          <div className="flex flex-wrap gap-2">
            {p.stage === 'tour_scheduled' && <button type="button" className="btn-secondary" onClick={() => setStage('toured', 'Marked toured')}>Mark toured</button>}
            {(p.stage === 'toured' || p.stage === 'inquiry') && <button type="button" className="btn-secondary" onClick={() => setStage('applied', 'Application started')}>Start application</button>}
            {p.stage === 'applied' && <button type="button" className="btn-secondary" onClick={() => setStage('approved', 'Application approved (screening passed)')}><Icon name="check" />Approve application</button>}
            <button type="button" className="btn-ghost text-red-700 dark:text-red-400" onClick={() => setStage('lost', 'Marked lead lost')}>Mark lost</button>
          </div>
        </section>
      )}

      {p.stage !== 'leased' && p.stage !== 'lost' && (
        <section className="mb-6 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <h3 className="section-title mb-2">Sign lease</h3>
          {available.length ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <label htmlFor="lease-unit" className="label">Unit</label>
                <select id="lease-unit" className="input" value={unitId} onChange={(e) => { setUnitId(e.target.value); setMoveIn(''); }}>
                  {available.map((u) => <option key={u.id} value={u.id}>Unit {u.number} · {u.beds === 0 ? 'Studio' : `${u.beds} bd`} · {formatCurrency(u.rent)} · {u.status} · avail. {formatDate(u.availableDate)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="lease-movein" className="label">Move-in</label>
                <input id="lease-movein" type="date" className="input" min={TODAY} value={moveIn || defaultMoveIn} onChange={(e) => setMoveIn(e.target.value)} />
              </div>
              <button type="button" className="btn-primary sm:col-span-2" disabled={!unit} onClick={() => {
                dispatch({ type: 'signLease', prospectId: p.id, unitId, moveIn: moveIn || defaultMoveIn });
                toast(`Lease signed — Unit ${unit?.number} is now leased with move-in ${formatDate(moveIn || defaultMoveIn)}`);
              }}><Icon name="key" />Sign lease for Unit {unit?.number}</button>
              {unit && (moveIn || defaultMoveIn) < (unit.availableDate ?? TODAY) && (
                <p className="text-xs text-amber-700 dark:text-amber-400 sm:col-span-2">Move-in is before the unit's available date ({formatDate(unit.availableDate)}). The make-ready check will flag it.</p>
              )}
            </div>
          ) : <p className="text-sm muted">No available units at this property.</p>}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {p.interestedUnitId && <Link to={`/units?unit=${p.interestedUnitId}`} className="btn-ghost btn-sm">View unit {l.unitById.get(p.interestedUnitId)?.number}</Link>}
        {conv && <Link to={`/conversations?c=${conv.id}`} className="btn-ghost btn-sm">Open conversation</Link>}
      </div>
    </DetailDrawer>
  );
}
