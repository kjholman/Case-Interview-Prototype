/**
 * Small UI primitives shared by every screen: page header, card, switch, tabs, select, search,
 * modal and toasts. The fourteen documented building blocks live in their own files.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ── PageHeader ───────────────────────────────────────────────────────────── */

export function PageHeader({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="mt-0.5 text-sm muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── Card ─────────────────────────────────────────────────────────────────── */

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          {typeof title === 'string' ? <h2 className="text-sm text-slate-900 dark:text-white">{title}</h2> : title}
          {actions}
        </div>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Switch ───────────────────────────────────────────────────────────────── */

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</label>
        {description && <p className="text-xs muted">{description}</p>}
      </div>
      <button
        id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-slate-300 dark:bg-slate-700')}
      >
        <span className={cx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/* ── Tabs (segmented) ─────────────────────────────────────────────────────── */

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: IconName; count?: number }[]; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (idx + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
      {options.map((o, i) => (
        <button
          key={o.value} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}
          className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-sm font-medium',
            o.value === value ? 'bg-accent-soft text-accent-strong' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
          {o.count !== undefined && <span className="rounded bg-slate-200 px-1 text-[11px] tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-200">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Select / Search ──────────────────────────────────────────────────────── */

export function Select({ label, value, onChange, options, hideLabel, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hideLabel?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'label'}>{label}</label>
      <select id={id} className="input pr-8" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search', className }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cx('relative', className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input id={id} type="search" className="input pl-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ── Chip filter (toggle buttons) ─────────────────────────────────────────── */

export function ChipToggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        pressed ? 'border-accent bg-accent-soft text-accent-strong' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800')}>
      {children}
    </button>
  );
}

/* ── Modal (confirm) ──────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-md p-5 shadow-xl">
        <h2 className="text-base text-slate-900 dark:text-white">{title}</h2>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{children}</div>
        <div className="mt-5 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

/* ── Toasts ───────────────────────────────────────────────────────────────── */

interface Toast { id: number; message: string; tone: 'info' | 'success' | 'warning'; action?: { label: string; onClick: () => void } }
const ToastContext = createContext<(message: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone ?? 'success', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
            <Icon name={t.tone === 'warning' ? 'alert' : t.tone === 'info' ? 'bolt' : 'check'} className={cx('h-4 w-4 shrink-0', t.tone === 'warning' ? 'text-amber-400 dark:text-amber-600' : 'text-emerald-400 dark:text-emerald-600')} />
            <span>{t.message}</span>
            {t.action && (
              <button type="button" className="ml-1 font-semibold underline underline-offset-2" onClick={() => { t.action!.onClick(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ── Field (label + value pair) ───────────────────────────────────────────── */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}
