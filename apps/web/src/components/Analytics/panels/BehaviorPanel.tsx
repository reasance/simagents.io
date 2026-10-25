import { formatActionLabel, translate, useLocale } from '../../../i18n';
import { useBehaviorMetrics } from '../../../stores/analytics';
import { MetricCard } from '../MetricCard';
import { BarChart } from '../charts/BarChart';

/** What agents did, counted across the whole world. */
export function BehaviorPanel() {
  useLocale();
  const behavior = useBehaviorMetrics();
  if (!behavior?.actionFrequency?.length) return <p className="hint m-0">{translate(behavior ? 'No behavior data available yet...' : 'Loading behavior metrics...')}</p>;
  const { actionFrequency, byLlmType = [] } = behavior;
  const total = actionFrequency.reduce((sum, d) => sum + d.count, 0);
  const samples = byLlmType.reduce((sum, d) => sum + (d.processingSamples ?? 0), 0);
  const avgTime = samples > 0 ? byLlmType.reduce((sum, d) => sum + d.avgProcessingTime * (d.processingSamples ?? 0), 0) / samples : 0;
  return <div className="grid gap-4">
    <div className="stat-grid">
      <MetricCard label="Action attempts" value={total} />
      <MetricCard label="Avg decision time" value={samples > 0 ? `${avgTime.toFixed(0)} ms` : '—'} />
    </div>
    <div>
      <h3 className="engraved m-0 mb-2">{translate('Action Frequency')}</h3>
      <BarChart data={[...actionFrequency].sort((a, b) => b.count - a.count).map(d => ({ label: formatActionLabel(d.actionType), value: d.count }))} height={Math.max(80, actionFrequency.length * 30)} />
    </div>
  </div>;
}
