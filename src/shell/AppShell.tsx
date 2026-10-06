import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CONFIG, type ScreenId } from '../config';
import { AutomationLevelControl } from '../components/AutomationLevelControl';
import { Icon } from '../components/Icon';
import { Modal, cx, useToast } from '../components/ui';
import { SCREENS, enabledScreens } from '../screens/registry';
import { useAlerts, useScopedData, useStore } from '../store/AppStore';
import { useTheme, type ThemePref } from './theme';

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);
  useAutoRunToast();

  return (
    <div className="min-h-screen lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">Skip to content</a>

      {/* Sidebar — fixed on desktop, slide-over on small screens */}
      <div className={cx('fixed inset-0 z-40 bg-slate-950/40 lg:hidden', navOpen ? 'block' : 'hidden')} onClick={() => setNavOpen(false)} aria-hidden />
      <aside className={cx('fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:z-30 lg:w-60 lg:translate-x-0',
        navOpen ? 'translate-x-0' : '-translate-x-full')} aria-label="Main navigation">
        <Brand onClose={() => setNavOpen(false)} />
        <LeftNav />
        <SidebarFooter />
      </aside>

      <div className="flex min-h-screen flex-col">
        <TopBar onMenu={() => setNavOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function Brand({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4 dark:border-slate-800">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white dark:text-slate-950"><Icon name="building" className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{state.settings.productName}</p>
        <p className="truncate text-[11px] muted">{CONFIG.organizationName}</p>
      </div>
      <button type="button" className="btn-ghost p-1 lg:hidden" onClick={onClose} aria-label="Close menu"><Icon name="x" className="h-5 w-5" /></button>
    </div>
  );
}

function useNavBadges(): Partial<Record<ScreenId, { count: number; tone: 'danger' | 'accent' | 'neutral' }>> {
  const { exceptions, approvals } = useAlerts();
  const data = useScopedData();
  const needsReply = data.conversations.filter((c) => c.status !== 'resolved' && (c.escalated || c.messages[c.messages.length - 1]?.from === 'contact')).length;
  return {
    exceptions: { count: exceptions.length, tone: exceptions.some((a) => a.severity === 'critical') ? 'danger' : 'neutral' },
    approvals: { count: approvals.length, tone: 'accent' },
    conversations: { count: needsReply, tone: 'neutral' },
  };
}

function LeftNav() {
  const badges = useNavBadges();
  return (
    <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
      <ul className="space-y-0.5">
        {enabledScreens().map((id) => {
          const b = badges[id];
          return (
            <li key={id}>
              <NavLink to={SCREENS[id].path}
                className={({ isActive }) => cx('flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium',
                  isActive ? 'bg-accent-soft text-accent-strong' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
                <Icon name={SCREENS[id].icon} className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{CONFIG.screens[id].label}</span>
                {b && b.count > 0 && (
                  <span className={cx('rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    b.tone === 'danger' ? 'bg-red-600 text-white' : b.tone === 'accent' ? 'bg-accent text-white dark:text-slate-950' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')}>
                    {b.count}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarFooter() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  return (
    <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Automation</span>
        <AutomationLevelControl compact value={state.settings.automationLevel}
          onChange={(level) => { dispatch({ type: 'setLevel', level }); toast(`Automation set to Level ${level}`, { tone: 'info' }); }} />
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { state, dispatch } = useStore();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-6">
      <button type="button" className="btn-ghost p-1.5 lg:hidden" onClick={onMenu} aria-label="Open menu"><Icon name="menu" className="h-5 w-5" /></button>
      <label htmlFor="property-switcher" className="sr-only">Property</label>
      <div className="relative min-w-0">
        <Icon name="building" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <select id="property-switcher" value={state.propertyId} onChange={(e) => dispatch({ type: 'setProperty', propertyId: e.target.value })}
          className="input max-w-[62vw] truncate py-1.5 pl-8 pr-8 font-medium sm:max-w-xs">
          <option value="all">All properties ({state.data.units.length} units)</option>
          {state.data.properties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.city}</option>)}
        </select>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const order: ThemePref[] = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(pref) + 1) % order.length];
  const icon = pref === 'dark' ? 'moon' : pref === 'light' ? 'sun' : 'monitor';
  return (
    <button type="button" className="btn-ghost p-1.5" onClick={() => setPref(next)} aria-label={`Theme: ${pref}. Switch to ${next}`} title={`Theme: ${pref}`}>
      <Icon name={icon} className="h-5 w-5" />
    </button>
  );
}

function UserMenu() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = state.session;
  const initials = (user?.name ?? 'D U').split(' ').map((p) => p[0]).slice(0, 2).join('');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white dark:bg-slate-200 dark:text-slate-900">{initials}</span>
        <span className="hidden text-left md:block">
          <span className="block text-sm font-medium leading-4 text-slate-900 dark:text-white">{user?.name}</span>
          <span className="block text-[11px] leading-4 muted">{user?.role}</span>
        </span>
        <Icon name="chevronDown" className="hidden h-4 w-4 text-slate-400 md:block" />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 mt-1 w-60 p-1 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{user?.name}</p>
            <p className="truncate text-xs muted">{user?.email}</p>
          </div>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => { setOpen(false); setConfirm(true); }}>
            <Icon name="refresh" />Reset demo data
          </button>
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => { dispatch({ type: 'logout' }); navigate('/login'); }}>
            <Icon name="logOut" />Sign out
          </button>
        </div>
      )}
      <ResetModal open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { dispatch({ type: 'reset' }); setConfirm(false); toast('Demo data reset'); }} />
    </div>
  );
}

export function ResetModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Reset demo data?"
      actions={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={onConfirm}>Reset</button></>}>
      All changes, approvals and activity go back to the starting dataset. Settings return to Level 1 with every system connected. You stay signed in.
    </Modal>
  );
}

/** Announces automatic changes after the automation level or data changes. */
function useAutoRunToast() {
  const { state } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const seen = useRef(state.lastAutoRun.seq);
  useEffect(() => {
    if (state.lastAutoRun.seq === seen.current) return;
    seen.current = state.lastAutoRun.seq;
    if (state.lastAutoRun.count > 0) {
      toast(`Automation applied ${state.lastAutoRun.count} change${state.lastAutoRun.count === 1 ? '' : 's'}`, {
        tone: 'info',
        action: CONFIG.screens.activity.enabled ? { label: 'View', onClick: () => navigate('/activity') } : undefined,
      });
    }
  }, [state.lastAutoRun, toast, navigate]);
}
