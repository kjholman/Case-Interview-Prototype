import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import { formatDateTime } from '../domain/dates';
import type { Channel, Message } from '../domain/types';
import { Icon, type IconName } from './Icon';
import { cx } from './ui';

export const CHANNEL: Record<Channel, { label: string; icon: IconName }> = {
  sms: { label: 'SMS', icon: 'sms' },
  email: { label: 'Email', icon: 'mail' },
  voice: { label: 'Voice', icon: 'voice' },
  chat: { label: 'Web chat', icon: 'message' },
};

/**
 * ChatThread — a message thread with optional composer. Contact messages sit on the left;
 * assistant and staff messages on the right, labeled so it's clear who answered.
 *
 * @prop messages   Messages in order.
 * @prop channel    Shown on voice messages as a transcript style.
 * @prop composer   Optional { onSend, placeholder, value?, onChange? } — controlled or uncontrolled.
 */
export interface ChatThreadProps {
  messages: Message[];
  channel: Channel;
  composer?: {
    onSend: (text: string) => void;
    placeholder?: string;
    value?: string;
    onChange?: (v: string) => void;
    disabled?: boolean;
  };
}

export function ChatThread({ messages, channel, composer }: ChatThreadProps) {
  const end = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState('');
  const value = composer?.value ?? local;
  const setValue = composer?.onChange ?? setLocal;
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [messages.length]);

  const send = () => {
    if (!value.trim() || !composer) return;
    composer.onSend(value.trim());
    setValue('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4" aria-label="Messages">
        {messages.map((m) => {
          const mine = m.from !== 'contact';
          return (
            <li key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[85%] rounded-lg px-3 py-2 text-sm',
                !mine && 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
                m.from === 'ai' && 'bg-accent-soft text-slate-900 dark:text-slate-100',
                m.from === 'staff' && 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900',
                channel === 'voice' && m.body.startsWith('[Call') && 'italic')}>
                <div className={cx('mb-0.5 flex items-center gap-1 text-[11px] font-medium', m.from === 'staff' ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400')}>
                  {m.from === 'ai' && <Icon name="sparkles" className="h-3 w-3 text-accent" />}
                  {m.from === 'ai' ? CONFIG.brand.assistantName : m.from === 'staff' ? `${m.authorName} · staff` : m.authorName}
                  <span aria-hidden>·</span>
                  <time>{formatDateTime(m.at)}</time>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
              </div>
            </li>
          );
        })}
        <div ref={end} />
      </ol>
      {composer && (
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <label htmlFor="composer" className="sr-only">Reply</label>
          <textarea
            id="composer" rows={2} className="input resize-none" placeholder={composer.placeholder ?? 'Write a reply…'}
            value={value} disabled={composer.disabled} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="hidden text-[11px] muted sm:inline"><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to send as staff</span>
            <button type="button" className="btn-primary btn-sm ml-auto" disabled={!value.trim() || composer.disabled} onClick={send}>Send as staff</button>
          </div>
        </div>
      )}
    </div>
  );
}
