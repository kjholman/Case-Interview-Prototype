import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * DetailDrawer — right-side panel for the details of one record. Full-screen on phones.
 * Esc or the backdrop closes it; focus moves into the drawer and returns afterwards.
 *
 * @prop open      Whether the drawer is shown.
 * @prop onClose   Called on Esc, backdrop click or the close button.
 * @prop title     Heading.
 * @prop subtitle  Optional line under the heading (status pills, ids …).
 * @prop footer    Optional sticky footer for actions.
 * @prop children  Body content.
 */
export interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function DetailDrawer({ open, onClose, title, subtitle, footer, children }: DetailDrawerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        // Keep focus inside the drawer.
        const f = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex="0"]');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-950/30 dark:bg-black/50" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="drawer-title"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl dark:bg-slate-900 sm:max-w-lg sm:border-l sm:border-slate-200 sm:dark:border-slate-800">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="drawer-title" className="truncate text-lg text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <div className="mt-1 flex flex-wrap items-center gap-2 text-sm muted">{subtitle}</div>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="btn-ghost -mr-2 p-1.5" aria-label="Close details">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}
