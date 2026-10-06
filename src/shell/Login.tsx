import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CONFIG } from '../config';
import { Icon } from '../components/Icon';
import { useStore } from '../store/AppStore';
import { BrandMark } from './BrandMark';

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
    <main className="grid min-h-screen bg-white dark:bg-slate-950 lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="dark relative hidden overflow-hidden bg-[#0B0A12] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -left-24 top-1/3 h-[28rem] w-[28rem] rounded-full bg-[#7638FA]/50 blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-[#AFC1F6]/25 blur-[110px]" />
        <BrandMark className="relative text-3xl" />
        <div className="relative max-w-md">
          <p className="text-sm font-medium uppercase tracking-widest text-[#AFC1F6]">{state.settings.productName}</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">Every unit, task and conversation in one place.</h2>
          <p className="mt-4 text-base text-slate-300">Leasing, maintenance, renewals and resident communication, with {CONFIG.brand.assistantName} handling the routine work and your team handling the exceptions.</p>
        </div>
        <p className="relative text-xs text-slate-500">{CONFIG.brand.disclaimer}</p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark onLight className="text-2xl" />
            <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-400">{state.settings.productName}</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-2xl text-slate-900 dark:text-white">Welcome back</h1>
              <p className="mt-1 text-sm muted">Sign in to {CONFIG.organizationName}</p>
            </div>
            <div>
              <label htmlFor="email" className="label">Work email</label>
              <input id="email" type="email" autoComplete="username" className="input py-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" autoComplete="current-password" className="input py-2" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="role" className="label">Sign in as</label>
              <select id="role" className="input py-2" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-primary w-full rounded-full py-2.5 text-base" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <p className="flex items-start gap-1.5 rounded-md bg-accent-soft/60 p-2.5 text-xs text-slate-700 dark:text-slate-300">
              <Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0 text-accent" />
              Prototype sign-in. Nothing is checked or sent anywhere — any email and password will work.
            </p>
            <p className="text-[11px] muted lg:hidden">{CONFIG.brand.disclaimer}</p>
          </form>
        </div>
      </section>
    </main>
  );
}
