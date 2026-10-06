import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CONFIG } from '../config';
import { Icon } from '../components/Icon';
import { useStore } from '../store/AppStore';

const ROLES = ['Regional manager', 'Property manager', 'Leasing agent', 'Maintenance technician'];

/** Simulated sign-in. Nothing is verified or sent anywhere — any email and password work. */
export function Login() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState(CONFIG.demoUser.email);
  const [password, setPassword] = useState('demo-password');
  const [role, setRole] = useState(CONFIG.demoUser.role);
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const local = email.split('@')[0] || 'demo';
    const name = email === CONFIG.demoUser.email
      ? CONFIG.demoUser.name
      : local.split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
    // Short delay so it feels like a real sign-in.
    setTimeout(() => {
      dispatch({ type: 'login', session: { name, email, role } });
      navigate(role === 'Maintenance technician' && CONFIG.screens.field.enabled ? '/field' : `/${CONFIG.homeScreen}`, { replace: true });
    }, 350);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white dark:text-slate-950"><Icon name="building" className="h-5 w-5" /></div>
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">{state.settings.productName}</p>
            <p className="text-xs muted">{CONFIG.organizationName}</p>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6 shadow-sm">
          <h1 className="text-lg text-slate-900 dark:text-white">Sign in</h1>
          <div>
            <label htmlFor="email" className="label">Work email</label>
            <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="role" className="label">Sign in as</label>
            <select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full py-2" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="flex items-start gap-1.5 rounded-md bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
            <Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0" />
            Prototype sign-in. Nothing is checked or sent anywhere — any email and password will work.
          </p>
        </form>
      </div>
    </main>
  );
}
