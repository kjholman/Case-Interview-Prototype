import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CONFIG } from '../config';
import { AIResponsePreview } from '../components/AIResponsePreview';
import { CHANNEL, ChatThread } from '../components/ChatThread';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PROSPECT_STAGE, RESIDENT_STAGE, StatusPill } from '../components/StatusPill';
import { PageHeader, SearchInput, Segmented, Select, cx, useToast } from '../components/ui';
import { assistantMode, draftAssistantReply } from '../domain/assistant';
import { formatDate, formatDateTime, TODAY } from '../domain/dates';
import { formatCurrency } from '../domain/impact';
import type { Channel, Conversation } from '../domain/types';
import { useActor, useLookups, useScopedData, useStore } from '../store/AppStore';

type Filter = 'needs' | 'escalated' | 'ai' | 'all';
const needsReply = (c: Conversation) => c.status !== 'resolved' && (c.escalated || c.messages[c.messages.length - 1]?.from === 'contact');

export function Conversations() {
  const { state, dispatch } = useStore();
  const data = useScopedData();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('needs');
  const [channel, setChannel] = useState<'all' | Channel>('all');
  const [q, setQ] = useState('');
  const selectedId = params.get('c') ?? undefined;
  const cfg = CONFIG.screens.conversations;

  const list = useMemo(() => data.conversations
    .filter((c) => (filter === 'all' || (filter === 'needs' && needsReply(c)) || (filter === 'escalated' && c.escalated && c.status !== 'resolved') || (filter === 'ai' && c.handledBy === 'ai')))
    .filter((c) => channel === 'all' || c.channel === channel)
    .filter((c) => !q || c.contact.name.toLowerCase().includes(q.toLowerCase()) || c.subject.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.escalated && b.status !== 'resolved') - Number(a.escalated && a.status !== 'resolved') || (b.messages.at(-1)?.at ?? '').localeCompare(a.messages.at(-1)?.at ?? '')),
  [data.conversations, filter, channel, q]);

  const selected = selectedId ? data.conversations.find((c) => c.id === selectedId) ?? state.data.conversations.find((c) => c.id === selectedId) : undefined;
  const select = (id?: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id); else next.delete('c');
    setParams(next, { replace: true });
  };

  if (!state.settings.integrations.crm) {
    return (
      <>
        <PageHeader title={cfg.label} description={cfg.description} />
        <div className="card"><EmptyState icon="plug" title="Leasing CRM not connected" body="Conversations come from the CRM. Reconnect it in Settings." action={<a className="btn-primary" href="#/settings">Open settings</a>} /></div>
      </>
    );
  }

  const counts = {
    needs: data.conversations.filter(needsReply).length,
    escalated: data.conversations.filter((c) => c.escalated && c.status !== 'resolved').length,
    ai: data.conversations.filter((c) => c.handledBy === 'ai').length,
    all: data.conversations.length,
  };

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description} />
      <div className="card grid h-[calc(100vh-170px)] min-h-[560px] overflow-hidden lg:grid-cols-[320px_1fr] xl:grid-cols-[300px_1fr]">
        {/* List */}
        <div className={cx('flex min-h-0 flex-col border-slate-200 dark:border-slate-800 lg:border-r', selected && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
            <div className="overflow-x-auto">
              <Segmented label="Filter conversations" value={filter} onChange={setFilter}
                options={[{ value: 'needs', label: 'Needs reply', count: counts.needs }, { value: 'escalated', label: 'Escalated', count: counts.escalated }, { value: 'ai', label: 'AI' }, { value: 'all', label: 'All' }]} />
            </div>
            <div className="flex gap-2">
              <SearchInput value={q} onChange={setQ} placeholder="Name or subject" label="Search conversations" className="flex-1" />
              <Select label="Channel" hideLabel value={channel} onChange={(v) => setChannel(v as typeof channel)} className="w-28"
                options={[{ value: 'all', label: 'All' }, ...(Object.keys(CHANNEL) as Channel[]).map((c) => ({ value: c, label: CHANNEL[c].label }))]} />
            </div>
          </div>
          <ul className="scroll-thin flex-1 overflow-y-auto" aria-label="Conversations">
            {list.map((c) => {
              const last = c.messages.at(-1);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => select(c.id)} aria-current={c.id === selectedId}
                    className={cx('flex w-full gap-3 border-b border-slate-100 px-3 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50', c.id === selectedId && 'bg-accent-soft/60')}>
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Icon name={CHANNEL[c.channel].icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cx('truncate text-sm', needsReply(c) ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300')}>{c.contact.name}</span>
                        <span className="shrink-0 text-[11px] muted">{last ? formatDateTime(last.at).replace('Today, ', '') : ''}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-600 dark:text-slate-400">{c.subject}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {c.escalated && c.status !== 'resolved' && <StatusPill tone="danger" label="Escalated" />}
                        <StatusPill tone={c.handledBy === 'ai' ? 'accent' : 'neutral'} label={c.handledBy === 'ai' ? 'AI' : 'Staff'} dot={false} />
                        {c.status === 'resolved' && <StatusPill tone="success" label="Resolved" dot={false} />}
                        <span className="text-[11px] muted">{c.contact.kind === 'prospect' ? 'Prospect' : 'Resident'}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {!list.length && <EmptyState title="No conversations" body="Nothing matches this filter." icon="message" />}
          </ul>
        </div>

        {/* Thread + preview */}
        {selected ? <ThreadPane key={selected.id} conv={selected} onBack={() => select(undefined)} dispatch={dispatch} /> : (
          <div className="hidden items-center justify-center lg:flex">
            <EmptyState icon="message" title="Select a conversation" body="See the thread and what the assistant would say based on current data." />
          </div>
        )}
      </div>
    </>
  );
}

function ThreadPane({ conv, onBack, dispatch }: { conv: Conversation; onBack: () => void; dispatch: ReturnType<typeof useStore>['dispatch'] }) {
  const { state } = useStore();
  const l = useLookups();
  const actor = useActor();
  const toast = useToast();
  const [draftText, setDraftText] = useState('');
  const draft = useMemo(() => draftAssistantReply(conv, state.data, { today: TODAY, connected: state.settings.integrations }), [conv, state.data, state.settings.integrations]);
  const mode = assistantMode(state.settings.automationLevel, conv, draft);
  const resident = conv.contact.kind === 'resident' ? l.residentById.get(conv.contact.id) : undefined;
  const prospect = conv.contact.kind === 'prospect' ? l.prospectById.get(conv.contact.id) : undefined;
  const unit = resident ? l.unitById.get(resident.unitId) : prospect?.interestedUnitId ? l.unitById.get(prospect.interestedUnitId) : undefined;

  const sendAI = () => {
    dispatch({ type: 'addMessage', conversationId: conv.id, message: { from: 'ai', authorName: 'Assistant', body: draft.text } });
    toast(mode.autoSend ? 'Assistant reply sent' : 'Approved and sent');
  };
  const sendStaff = (text: string) => {
    dispatch({ type: 'addMessage', conversationId: conv.id, message: { from: 'staff', authorName: actor, body: text } });
    toast('Reply sent');
  };
  const update = (patch: Partial<Conversation>, action: string, msg: string) => {
    dispatch({ type: 'updateConversation', id: conv.id, patch, action });
    toast(msg);
  };

  return (
    <div className="flex min-h-0 flex-col xl:grid xl:grid-cols-[1fr_360px]">
      <div className="flex min-h-0 flex-1 flex-col border-slate-200 dark:border-slate-800 xl:border-r">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <button type="button" className="btn-ghost -ml-2 p-1 lg:hidden" onClick={onBack} aria-label="Back to list"><Icon name="chevronLeft" className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base text-slate-900 dark:text-white">{conv.contact.name}</h2>
            <p className="flex flex-wrap items-center gap-1.5 text-xs muted">
              <Icon name={CHANNEL[conv.channel].icon} className="h-3.5 w-3.5" />{CHANNEL[conv.channel].label} · {conv.subject}
              {unit && <> · <Link className="text-accent-strong hover:underline" to={`/units?unit=${unit.id}`}>Unit {unit.number}</Link></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conv.handledBy === 'ai'
              ? <button type="button" className="btn-secondary btn-sm" onClick={() => update({ handledBy: 'staff', staffName: actor }, 'Took over conversation from assistant', 'You are handling this conversation')}>Take over</button>
              : <button type="button" className="btn-secondary btn-sm" onClick={() => update({ handledBy: 'ai', staffName: undefined }, 'Handed conversation back to assistant', 'Handed back to the assistant')}>Hand back to AI</button>}
            {conv.status !== 'resolved'
              ? <button type="button" className="btn-secondary btn-sm" onClick={() => update({ status: 'resolved', escalated: false }, 'Resolved conversation', 'Resolved')}><Icon name="check" className="h-3.5 w-3.5" />Resolve</button>
              : <button type="button" className="btn-ghost btn-sm" onClick={() => update({ status: 'open' }, 'Reopened conversation', 'Reopened')}>Reopen</button>}
          </div>
          {conv.escalated && conv.status !== 'resolved' && (
            <p className="w-full rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800 dark:bg-red-950/60 dark:text-red-300">
              <Icon name="alert" className="mr-1 inline h-3.5 w-3.5" />Escalated: {conv.escalationReason}
            </p>
          )}
        </div>
        <ChatThread messages={conv.messages} channel={conv.channel} composer={{ onSend: sendStaff, value: draftText, onChange: setDraftText, placeholder: `Reply by ${CHANNEL[conv.channel].label.toLowerCase()} as ${actor}…` }} />
      </div>

      {/* Below the thread on smaller screens, a third column on very wide screens */}
      <aside className="scroll-thin max-h-[45%] shrink-0 overflow-y-auto border-t border-slate-200 p-4 dark:border-slate-800 xl:max-h-none xl:border-t-0" aria-label="Assistant and contact details">
        <AIResponsePreview draft={draft} mode={mode} onSend={sendAI} onEdit={() => setDraftText(draft.text)} />
        <div className="mt-6">
          <h3 className="section-title mb-2">{conv.contact.kind === 'prospect' ? 'Prospect' : 'Resident'}</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {resident && <>
              <div><dt className="text-xs muted">Lease ends</dt><dd>{formatDate(resident.leaseEnd)}</dd></div>
              <div><dt className="text-xs muted">Renewal</dt><dd>{RESIDENT_STAGE[resident.stage]}</dd></div>
              <div><dt className="text-xs muted">Balance</dt><dd className={resident.balance ? 'font-medium text-red-700 dark:text-red-400' : ''}>{formatCurrency(resident.balance)}</dd></div>
              <div><dt className="text-xs muted">Phone</dt><dd>{resident.phone}</dd></div>
            </>}
            {prospect && <>
              <div><dt className="text-xs muted">Stage</dt><dd>{PROSPECT_STAGE[prospect.stage]}</dd></div>
              <div><dt className="text-xs muted">Wants</dt><dd>{prospect.beds === 0 ? 'Studio' : `${prospect.beds} bed`} · {formatDate(prospect.desiredMoveIn)}</dd></div>
              <div><dt className="text-xs muted">Source</dt><dd>{prospect.source}</dd></div>
              <div><dt className="text-xs muted">Tour</dt><dd>{formatDate(prospect.tourDate)}</dd></div>
            </>}
          </dl>
        </div>
      </aside>
    </div>
  );
}
