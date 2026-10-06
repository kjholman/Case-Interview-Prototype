import { useMemo, useState } from 'react';
import { CONFIG } from '../../config';
import { CHANNEL } from '../../components/ChatThread';
import { Icon } from '../../components/Icon';
import { ChipToggle, Modal, Segmented, Select } from '../../components/ui';
import type { InboundContact } from '../../domain/elise';
import type { Channel } from '../../domain/types';
import { useLookups, useScopedData, useStore } from '../../store/AppStore';

type Kind = 'resident' | 'prospect' | 'new_lead';

const EXAMPLES: Record<Kind, string[]> = {
  resident: [
    "My AC isn't cooling and it's 85 degrees inside.",
    'Water is leaking from the ceiling in my bathroom — water everywhere!',
    "The dishwasher won't drain.",
    'Can I split my balance into two payments this month?',
    "I'd like to renew. Is there any flexibility on the increase?",
    "I need to give notice — I'm moving out in December.",
  ],
  prospect: [
    'Can I tour a 2 bedroom this week?',
    'How much is rent for a 1 bedroom, and when is it available?',
    'Do you allow dogs? I have a 50 lb lab.',
  ],
  new_lead: [
    'Hi! Can I come see a 1 bedroom this week?',
    'How much is rent for a 2 bedroom?',
    'Do you have any move-in specials?',
  ],
};

/**
 * "Simulate an inbound message" — lets the presenter play a resident, prospect or new lead.
 * Elise triages it, acts in the systems of record and replies (or drafts) per the automation level.
 */
export function InboundSimulator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const data = useScopedData();
  const l = useLookups();
  const [kind, setKind] = useState<Kind>('resident');
  const [channel, setChannel] = useState<Channel>('sms');
  const [text, setText] = useState(EXAMPLES.resident[0]);
  const [leadName, setLeadName] = useState('Jordan Avery');
  const [beds, setBeds] = useState('1');
  const residents = useMemo(() => [...data.residents].sort((a, b) => a.propertyId.localeCompare(b.propertyId) || a.unitId.localeCompare(b.unitId)), [data.residents]);
  const prospects = useMemo(() => data.prospects.filter((p) => p.stage !== 'leased' && p.stage !== 'lost').sort((a, b) => a.name.localeCompare(b.name)), [data.prospects]);
  const [residentId, setResidentId] = useState(residents[0]?.id ?? '');
  const [prospectId, setProspectId] = useState(prospects[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState(state.propertyId === 'all' ? state.data.properties[0].id : state.propertyId);
  const level = state.settings.automationLevel;
  const name = CONFIG.brand.assistantName;
  const short = (pid: string) => l.propertyById.get(pid)?.name.split(' ').slice(0, 2).join(' ') ?? '';

  const pickKind = (k: Kind) => {
    setKind(k);
    setText(EXAMPLES[k][0]);
  };

  const send = () => {
    const contact: InboundContact = kind === 'resident' ? { kind, id: residentId }
      : kind === 'prospect' ? { kind, id: prospectId }
      : { kind: 'new_lead', name: leadName, beds: Number(beds), propertyId };
    dispatch({ type: 'inbound', inbound: { contact, channel, text } });
    onClose();
  };

  const canSend = text.trim().length > 2 && (kind !== 'resident' || residentId) && (kind !== 'prospect' || prospectId) && (kind !== 'new_lead' || leadName.trim());

  return (
    <Modal open={open} onClose={onClose} title="Simulate an inbound message" wide
      actions={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={send} disabled={!canSend}><Icon name="send" />Send to {name}</button>
      </>}>
      <div className="space-y-4">
        <p className="text-xs muted">
          Play a resident, prospect or new lead. {name} will sort the request, act in the PMS and CRM, and{' '}
          {level === 1 ? 'draft a reply for staff to approve (Level 1).' : `reply on her own unless it needs a person (Level ${level}).`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Kind> label="From" value={kind} onChange={pickKind}
            options={[{ value: 'resident', label: 'Resident' }, { value: 'prospect', label: 'Prospect' }, { value: 'new_lead', label: 'New lead' }]} />
          <Segmented<Channel> label="Channel" value={channel} onChange={setChannel}
            options={(Object.keys(CHANNEL) as Channel[]).map((c) => ({ value: c, label: CHANNEL[c].label, icon: CHANNEL[c].icon }))} />
        </div>

        {kind === 'resident' && (
          <Select label="Resident" value={residentId} onChange={setResidentId}
            options={residents.map((r) => ({ value: r.id, label: `${r.name} · Unit ${l.unitById.get(r.unitId)?.number}${state.propertyId === 'all' ? ` · ${short(r.propertyId)}` : ''}` }))} />
        )}
        {kind === 'prospect' && (
          <Select label="Prospect" value={prospectId} onChange={setProspectId}
            options={prospects.map((p) => ({ value: p.id, label: `${p.name} · ${p.stage.replace('_', ' ')}${state.propertyId === 'all' ? ` · ${short(p.propertyId)}` : ''}` }))} />
        )}
        {kind === 'new_lead' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label htmlFor="lead-name" className="label">Name</label>
              <input id="lead-name" className="input" value={leadName} onChange={(e) => setLeadName(e.target.value)} />
            </div>
            <Select label="Looking for" value={beds} onChange={setBeds}
              options={[{ value: '0', label: 'Studio' }, { value: '1', label: '1 bedroom' }, { value: '2', label: '2 bedrooms' }, { value: '3', label: '3 bedrooms' }]} />
            <Select label="Property" value={propertyId} onChange={setPropertyId}
              options={state.data.properties.map((p) => ({ value: p.id, label: p.name }))} />
          </div>
        )}

        <div>
          <label htmlFor="inbound-text" className="label">Message</label>
          <textarea id="inbound-text" rows={3} className="input" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES[kind].map((ex) => (
              <ChipToggle key={ex} pressed={text === ex} onClick={() => setText(ex)}>{ex.length > 38 ? `${ex.slice(0, 36)}…` : ex}</ChipToggle>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
