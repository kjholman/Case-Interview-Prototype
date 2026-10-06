import { CONFIG } from '../config';
import { ImpactCalculator } from '../components/ImpactCalculator';
import { PageHeader } from '../components/ui';
import { useScopedData, useStore } from '../store/AppStore';

export function Impact() {
  const { state } = useStore();
  const data = useScopedData();
  const cfg = CONFIG.screens.impact;
  const units = data.units.length;
  const avgRent = units ? Math.round(data.units.reduce((s, u) => s + u.rent, 0) / units / 5) * 5 : 0;
  const scope = state.propertyId === 'all' ? 'the whole portfolio' : data.properties[0]?.name;

  return (
    <>
      <PageHeader title={cfg.label} description={cfg.description}>
        <p className="mt-1 text-xs muted">Units and average rent start from {scope} ({units} units, ${avgRent.toLocaleString()} average rent). Everything else is an assumption to discuss.</p>
      </PageHeader>
      {/* Remount when the property changes so starting values follow the selection. */}
      <ImpactCalculator key={state.propertyId} initial={{ units, avgRent }} />
    </>
  );
}
