import { useEffect, useState } from 'react';
import { useLocale, translate } from '../../../i18n';
import { getEngineClient } from '../../../engine-host/engine-client';
import { downloadText } from '../../../services/persistence';
import { useAnalyticsStore } from '../../../stores/analytics';
import { emergenceAgentsCsv, emergenceEdgesCsv, type EmergenceMetrics } from '@simagents/engine/engine/emergence-metrics';
import { MetricCard } from '../MetricCard';
import { useAgents } from '../../../stores/world';
import { useAgentRoster } from '../../../stores/roster';
import { participantSummary, rosterEntryFor } from '../../../services/participants';

/**
 * RelationsPanel - observer-only metrics of what agents said and did to each
 * other, computed by the worker from the live event log. Agents never see these figures.
 */

const ratio = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

export function RelationsPanel() {
  useLocale();
  const [metrics, setMetrics] = useState<EmergenceMetrics | null>(null);
  const [failed, setFailed] = useState(false);
  // Refresh with the rest of the dashboard: its 30-second timer and its Refresh button.
  const refreshedAt = useAnalyticsStore((state) => state.lastUpdated);
  const agents = useAgents();
  const roster = useAgentRoster();

  useEffect(() => {
    let cancelled = false;
    getEngineClient().getEmergenceMetrics()
      .then((next) => { if (!cancelled) { setMetrics(next); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [refreshedAt]);

  if (!metrics) {
    return (
      <p className="hint m-0">{failed ? translate('No relationship data available yet...') : translate('Loading relationship metrics...')}</p>
    );
  }

  const stamp = Math.round(metrics.simMinutes);
  const label = (row: EmergenceMetrics['agents'][number]) => {
    const agent = agents.find(a => a.id === row.agentId);
    const entry = rosterEntryFor({ rosterEntryId: agent?.rosterEntryId, name: row.name }, roster);
    return entry ? participantSummary(entry) : [row.modelId || row.llmType, row.effort].filter(Boolean).join(' · ');
  };
  return (
    <div className="grid gap-5">
      <div className="stat-grid">
        <MetricCard label={translate('Replies to addressed speech')} value={ratio(metrics.addressedReciprocity)} />
        <MetricCard label={translate('Gifts returned')} value={ratio(metrics.giftReciprocity)} />
        <MetricCard label={translate('Place names shared')} value={`${metrics.placeNames.sharedNames}/${metrics.placeNames.distinctNames}`} />
        <MetricCard label={translate('Simulated minutes')} value={metrics.simMinutes} />
      </div>

      {/* The enclosing focusable section scrolls; a nested scroller would be unreachable by keyboard. */}
      <table className="summary-table">
        <thead>
          <tr>
            <th scope="col">{translate('Agent')}</th>
            <th scope="col">{translate('Model')}</th>
            <th scope="col">{translate('Survival (min)')}</th>
            <th scope="col">{translate('Decisions per sim hour')}</th>
            <th scope="col">{translate('Utterances (questions)')}</th>
            <th scope="col">{translate('Gifts out / in')}</th>
            <th scope="col">{translate('Strikes')}</th>
            <th scope="col">{translate('Takes')}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.agents.map((row) => {
            const color = agents.find(a => a.id === row.agentId)?.color;
            return <tr key={row.agentId}>
              <td>
                <span className="inline-flex items-center gap-2">{color && <span className="dot" style={{ color }} aria-hidden="true" />}{row.name}{!row.alive && <span className="muted"> †</span>}</span>
                {row.unresponsive && <span className="block hint">{translate('Unresponsive')}</span>}
              </td>
              <td className="muted">{label(row)}</td>
              <td className="figure">{row.survivalMinutes}</td>
              <td className="figure">{row.decisionsPerSimHour}{row.undecidedTurns > 0 && <span className="block hint">{translate('Undecided: {count}', { count: row.undecidedTurns })}</span>}</td>
              <td className="figure">{row.utterances} ({row.questions})</td>
              <td className="figure">{row.giftsGiven} / {row.giftsReceived}</td>
              <td className="figure">{row.strikes}</td>
              <td className="figure">{row.takes}</td>
            </tr>;
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-small" onClick={() => downloadText(`simagents-agents-${stamp}.csv`, emergenceAgentsCsv(metrics), 'text/csv')}>{translate('Export agents CSV')}</button>
        <button type="button" className="btn btn-small" onClick={() => downloadText(`simagents-interactions-${stamp}.csv`, emergenceEdgesCsv(metrics), 'text/csv')}>{translate('Export interactions CSV')}</button>
        <button type="button" className="btn btn-small" onClick={() => downloadText(`simagents-relations-${stamp}.json`, JSON.stringify(metrics, null, 2), 'application/json')}>{translate('Export JSON')}</button>
      </div>
    </div>
  );
}
