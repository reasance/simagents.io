import { translate, useLocale } from '../../../i18n';
import { useSurvivalMetrics } from '../../../stores/analytics';
import { MetricCard } from '../MetricCard';

/** Who is still alive and what the dead died of. Per-agent survival is in the relations table. */
export function SurvivalPanel() {
  useLocale();
  const survival = useSurvivalMetrics();
  if (!survival?.overall) return <p className="hint m-0">{translate(survival ? 'No survival data available yet...' : 'Loading survival metrics...')}</p>;
  const { overall, deathCauses = { starvation: 0, exhaustion: 0 } } = survival;
  return <div className="grid gap-4">
    <div className="stat-grid">
      <MetricCard label="Alive" value={overall.totalAlive} />
      <MetricCard label="Dead" value={overall.totalDead} tone={overall.totalDead > 0 ? 'alert' : 'default'} />
      <MetricCard label="Total" value={overall.totalAgents} />
    </div>
    {overall.totalDead > 0 && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 m-0 text-sm">
      <dt className="muted">{translate('Starvation')}</dt><dd className="m-0 figure">{deathCauses.starvation}</dd>
      <dt className="muted">{translate('Exhaustion')}</dt><dd className="m-0 figure">{deathCauses.exhaustion}</dd>
      <dt className="muted">{translate('Other / unspecified:')}</dt><dd className="m-0 figure">{deathCauses.other ?? 0}</dd>
    </dl>}
  </div>;
}
