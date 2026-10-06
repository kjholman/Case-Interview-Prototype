import { useMemo, useState } from 'react';
import { CONFIG, type IntegrationId } from '../config';
import { AutomationLevelControl } from '../components/AutomationLevelControl';
import { Icon } from '../components/Icon';
import { Card, PageHeader, Segmented, Switch, useToast } from '../components/ui';
import { summarizeRoutes } from '../domain/automation';
import { formatLongDate, TODAY } from '../domain/dates';
import { RULES } from '../domain/rules';
import type { AutomationLevel } from '../domain/types';
import { ResetModal } from '../shell/AppShell';
import { useTheme, type ThemePref } from '../shell/theme';
import { computeAlerts, useAlerts, useStore } from '../store/AppStore';

export function Settings() {
  const { state, dispatch } = useStore();
  const { portfolio } = useAlerts();
  const toast = useToast();
  const { pref, setPref } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(state.settings.productName);
  const cfg = CONFIG.screens.settings;

  // Live preview of what each level would do with today's alerts.
  const preview = useMemo(() => {
    const p = {} as Record<AutomationLevel, { auto: number; approval: number; exception: number }>;
    for (const lvl of [1, 2, 3] as AutomationLevel[]) {
      const s = summarizeRoutes(portfolio.filter((a) => !state.rejected[a.id]), lvl);
      p[lvl] = { auto: s.auto.length, approval: s.approval.length, exception: s.exception.length };
    }
    return p;
  }, [portfolio, state.rejected]);

  const autoToday = state.audit.filter((e) => e.mode === 'automatic' && e.at.startsWith(TODAY) && e.target).length;

  const ruleCounts = useMemo(() => {
    const all = computeAlerts({ data: state.data, settings: { ...state.settings, disabledRules: [] } });
    return new Map(RULES.map((r) => [r.id, all.filter((a) => a.ruleId === r.id).length]));
  }, [state.data, state.settings]);

  const setLevel = (level: AutomationLevel) => {
    if (level === state.settings.automationLevel) return;
    dispatch({ type: 'setLevel', level });
    toast(`Automation set to Level ${level}`, { tone: 'info' });
  };

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description} />
      <div className="space-y-4">
        <Card title="Automation level">
          <p className="mb-3 text-sm muted">How much the system does without asking. Counts show what each level would do with the items open right now across the portfolio. {autoToday} change{autoToday === 1 ? ' was' : 's were'} applied automatically today.</p>
          <AutomationLevelControl value={state.settings.automationLevel} onChange={setLevel} preview={preview} />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Connected systems">
            <div className="space-y-4">
              {(Object.keys(CONFIG.integrations) as IntegrationId[]).map((id) => {
                const it = CONFIG.integrations[id];
                const on = state.settings.integrations[id];
                const affected = RULES.filter((r) => r.requires.includes(id)).length;
                return (
                  <div key={id}>
                    <Switch checked={on} label={it.label}
                      description={`${it.description} ${on ? `Last sync today 8:02 AM.` : `Disconnected — ${affected} rules paused.`}`}
                      onChange={(v) => { dispatch({ type: 'setIntegration', id, on: v }); toast(`${it.label} ${v ? 'connected' : 'disconnected'}`, { tone: v ? 'success' : 'warning' }); }} />
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Workspace">
            <div className="space-y-4">
              <form onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'setProductName', name: name.trim() || CONFIG.productName }); toast('Product name saved'); }}>
                <label htmlFor="pname" className="label">Product name</label>
                <div className="flex gap-2">
                  <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  <button type="submit" className="btn-secondary">Save</button>
                </div>
                <p className="mt-1 text-xs muted">Shown in the sidebar and sign-in page. Default comes from config.ts.</p>
              </form>
              <div>
                <span className="label">Theme</span>
                <Segmented<ThemePref> label="Theme" value={pref} onChange={setPref}
                  options={[{ value: 'system', label: 'System', icon: 'monitor' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }]} />
              </div>
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Demo data</p>
                <p className="mt-0.5 text-xs muted">Fixed date {formatLongDate(TODAY)} · seed {CONFIG.seed} · changes are saved in this browser only.</p>
                <button type="button" className="btn-secondary mt-2" onClick={() => setConfirm(true)}><Icon name="refresh" />Reset demo data</button>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Rules" bodyClassName="p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {RULES.map((r) => {
              const blocked = r.requires.filter((x) => !state.settings.integrations[x]);
              return (
                <li key={r.id} className="px-4 py-3">
                  <Switch checked={!state.settings.disabledRules.includes(r.id)} onChange={() => dispatch({ type: 'toggleRule', ruleId: r.id })}
                    label={`${r.label} (${ruleCounts.get(r.id) ?? 0})`}
                    description={`${r.description} Uses: ${r.requires.map((x) => CONFIG.integrations[x].short).join(', ')}.${blocked.length ? ` Paused — ${blocked.map((x) => CONFIG.integrations[x].short).join(', ')} disconnected.` : ''}`} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <ResetModal open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { dispatch({ type: 'reset' }); setConfirm(false); setName(CONFIG.productName); toast('Demo data reset'); }} />
    </>
  );
}
