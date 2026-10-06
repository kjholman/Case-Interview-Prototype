import type { AssistantDraft, AssistantMode } from '../domain/assistant';
import { Icon } from './Icon';
import { StatusPill } from './StatusPill';

/**
 * AIResponsePreview — shows what the assistant would say right now, which records it used,
 * and any reasons it would hold the reply for a person. Mode comes from the automation level.
 *
 * @prop draft     { text, sources, holds } from draftAssistantReply().
 * @prop mode      { label, tone, description, autoSend } from assistantMode().
 * @prop onSend    Send the draft as the assistant.
 * @prop onEdit    Copy the draft into the staff composer.
 */
export interface AIResponsePreviewProps {
  draft: AssistantDraft;
  mode: AssistantMode;
  onSend?: () => void;
  onEdit?: () => void;
}

export function AIResponsePreview({ draft, mode, onSend, onEdit }: AIResponsePreviewProps) {
  return (
    <section aria-label="Assistant reply preview" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm text-slate-900 dark:text-white">
          <Icon name="sparkles" className="h-4 w-4 text-accent" />
          What the assistant would say
        </h3>
        <StatusPill tone={mode.tone} label={mode.label} />
      </div>
      <p className="text-xs muted">{mode.description}</p>

      <blockquote className="rounded-md border border-accent/30 bg-accent-soft/50 p-3 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
        {draft.text || <span className="muted">No reply drafted.</span>}
      </blockquote>

      {draft.holds.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          <p className="mb-1 flex items-center gap-1.5 font-medium"><Icon name="alert" className="h-4 w-4" />Why it's held</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {draft.holds.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </div>
      )}

      {draft.sources.length > 0 && (
        <div>
          <p className="section-title mb-1.5">Based on</p>
          <ul className="space-y-1">
            {draft.sources.map((s) => (
              <li key={s.label} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="mt-px shrink-0 rounded bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">{s.system}</span>
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(onSend || onEdit) && (
        <div className="flex flex-wrap gap-2">
          {onSend && (
            <button type="button" className="btn-primary btn-sm" onClick={onSend} disabled={!draft.text}>
              <Icon name="sparkles" className="h-3.5 w-3.5" />{mode.autoSend ? 'Send now' : 'Approve and send'}
            </button>
          )}
          {onEdit && <button type="button" className="btn-secondary btn-sm" onClick={onEdit}><Icon name="edit" className="h-3.5 w-3.5" />Edit as staff reply</button>}
        </div>
      )}
    </section>
  );
}
