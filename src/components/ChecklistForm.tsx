import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { cx } from './ui';

/**
 * ChecklistForm — a phone-friendly checklist with large touch targets, photo slots and notes.
 * Photos are placeholders by default; tapping a slot opens the device camera / file picker if
 * available, and otherwise marks the slot as "photo added".
 *
 * @prop items        [{ id, label, hint? }]
 * @prop photoSlots   Number of photo placeholders (default 3; 0 hides the section).
 * @prop requireAll   Require every item checked before "Mark complete" (default true).
 * @prop initialNotes Pre-filled notes.
 * @prop onSubmit     Called with { checked, notes, photos, complete }.
 */
export interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
}

export interface ChecklistResult {
  checked: string[];
  notes: string;
  photos: number;
  complete: boolean;
}

export interface ChecklistFormProps {
  items: ChecklistItem[];
  photoSlots?: number;
  requireAll?: boolean;
  initialNotes?: string;
  onSubmit: (r: ChecklistResult) => void;
}

export function ChecklistForm({ items, photoSlots = 3, requireAll = true, initialNotes = '', onSubmit }: ChecklistFormProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState(initialNotes);
  const [photos, setPhotos] = useState<(string | true | null)[]>(() => Array(photoSlots).fill(null));
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const notesId = useId();
  const allDone = items.every((i) => checked.has(i.id));
  const photoCount = photos.filter(Boolean).length;

  useEffect(() => () => photos.forEach((p) => typeof p === 'string' && URL.revokeObjectURL(p)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setChecked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const submit = (complete: boolean) => onSubmit({ checked: [...checked], notes, photos: photoCount, complete });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(true); }} className="flex flex-col gap-5">
      <fieldset>
        <legend className="section-title mb-2">Checklist · {checked.size}/{items.length}</legend>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input type="checkbox" className="h-5 w-5 shrink-0 rounded border-slate-300 accent-[rgb(var(--accent))]" checked={checked.has(item.id)} onChange={() => toggle(item.id)} />
                <span className="min-w-0">
                  <span className={cx('block text-sm', checked.has(item.id) ? 'text-slate-500 line-through' : 'text-slate-900 dark:text-slate-100')}>{item.label}</span>
                  {item.hint && <span className="block text-xs muted">{item.hint}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {photoSlots > 0 && (
        <fieldset>
          <legend className="section-title mb-2">Photos · {photoCount}/{photoSlots}</legend>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotos((ps) => ps.map((x, j) => (j === i ? URL.createObjectURL(f) : x))); }} />
                <button type="button"
                  onClick={() => (p ? setPhotos((ps) => ps.map((x, j) => (j === i ? null : x))) : setPhotos((ps) => ps.map((x, j) => (j === i ? true : x))))}
                  onDoubleClick={() => fileRefs.current[i]?.click()}
                  aria-label={p ? `Remove photo ${i + 1}` : `Add photo ${i + 1}`}
                  className={cx('flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 text-xs',
                    p ? 'border-emerald-500 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' : 'border-dashed border-slate-300 text-slate-500 hover:border-accent hover:text-accent dark:border-slate-700')}>
                  {typeof p === 'string' ? <img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" /> : (
                    <>
                      <Icon name={p ? 'image' : 'camera'} className="h-6 w-6" />
                      {p ? `Photo ${i + 1}` : 'Add photo'}
                    </>
                  )}
                </button>
                {!p && (
                  <button type="button" className="mt-1 w-full text-center text-[11px] text-accent-strong underline-offset-2 hover:underline" onClick={() => fileRefs.current[i]?.click()}>
                    Use camera
                  </button>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor={notesId} className="section-title mb-2 block">Notes</label>
        <textarea id={notesId} rows={3} className="input" placeholder="Anything the office should know?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <button type="submit" className="btn-primary py-3 text-base" disabled={requireAll && !allDone}>
          <Icon name="check" className="h-5 w-5" />Mark complete
        </button>
        {requireAll && !allDone && <p className="text-center text-xs muted">Check every item to complete, or save progress.</p>}
        <button type="button" className="btn-secondary py-2.5" onClick={() => submit(false)}>Save progress</button>
      </div>
    </form>
  );
}
