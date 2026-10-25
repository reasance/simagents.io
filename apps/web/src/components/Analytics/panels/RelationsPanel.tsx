import { useEffect, useState } from 'react';
import { useLocale, translate } from '../../../i18n';
import { getEngineClient } from '../../../engine-host/engine-client';
import { computeEmergenceMetrics, emergenceAgentsCsv, emergenceEdgesCsv, type EmergenceMetrics } from '@simagents/engine/engine/emergence-metrics';
import { MetricCard } from '../MetricCard';

/**
 * RelationsPanel - observer-only metrics of what agents said and did to each
 * other, computed from the event log. Agents never see these figures.
 */

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const ratio = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

export function RelationsPanel() {
  useLocale();
  const [metrics, setMetrics] = useState<EmergenceMetrics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => getEngineClient().exportWorld()
      .then((file) => { if (!cancelled) { setMetrics(computeEmergenceMetrics(file.snapshot)); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    void load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-32 text-city-text-muted text-sm">
        {failed ? translate('No relationship data available yet...') : translate('Loading relationship metrics...')}
      </div>
    );
  }

  const stamp = Math.round(metrics.simMinutes);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label={translate('Simulated minutes')} value={metrics.simMinutes} />
        <MetricCard label={translate('Replies to addressed speech')} value={ratio(metrics.addressedReciprocity)} />
        <MetricCard label={translate('Gifts returned')} value={ratio(metrics.giftReciprocity)} />
        <MetricCard label={translate('Place names shared')} value={`${metrics.placeNames.sharedNames}/${metrics.placeNames.distinctNames}`} />
      </div>

      {/* The enclosing focusable section scrolls; a nested scroller would be unreachable by keyboard. */}
      <div>
        <table className="w-full text-xs text-city-text">
          <thead className="text-city-text-muted">
            <tr className="text-left">
              <th className="pr-2 font-medium">{translate('Agent')}</th>
              <th className="pr-2 font-medium">{translate('Model')}</th>
              <th className="pr-2 font-medium" title={translate('Survival (min)')}>{translate('Survival (min)')}</th>
              <th className="pr-2 font-medium" title={translate('Decisions per sim hour')}>{translate('Decisions per sim hour')}</th>
              <th className="pr-2 font-medium" title={translate('Utterances (questions)')}>{translate('Utterances (questions)')}</th>
              <th className="pr-2 font-medium" title={translate('Gifts out / in')}>{translate('Gifts out / in')}</th>
              <th className="pr-2 font-medium">{translate('Strikes')}</th>
              <th className="font-medium">{translate('Takes')}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.agents.map((row) => (
              <tr key={row.agentId} className="border-t border-city-border">
                <td className="pr-2 py-1">
                  {row.name}
                  {!row.alive && <span className="text-city-text-muted"> †</span>}
                  {row.unresponsive && <span className="text-city-text-muted"> ({translate('Unresponsive')})</span>}
                </td>
                <td className="pr-2 py-1">{[row.modelId || row.llmType, row.effort].filter(Boolean).join(' · ')}</td>
                <td className="pr-2 py-1">{row.survivalMinutes}</td>
                <td className="pr-2 py-1">
                  {row.decisionsPerSimHour}
                  {row.undecidedTurns > 0 && <span className="text-city-text-muted"> ({translate('Undecided: {count}', { count: row.undecidedTurns })})</span>}
                </td>
                <td className="pr-2 py-1">{row.utterances} ({row.questions})</td>
                <td className="pr-2 py-1">{row.giftsGiven} / {row.giftsReceived}</td>
                <td className="pr-2 py-1">{row.strikes}</td>
                <td className="py-1">{row.takes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => download(`simagents-agents-${stamp}.csv`, emergenceAgentsCsv(metrics), 'text/csv')}
          className="px-2 py-1 text-xs rounded bg-city-surface-alt border border-city-border hover:bg-city-surface-hover">{translate('Export agents CSV')}</button>
        <button type="button" onClick={() => download(`simagents-interactions-${stamp}.csv`, emergenceEdgesCsv(metrics), 'text/csv')}
          className="px-2 py-1 text-xs rounded bg-city-surface-alt border border-city-border hover:bg-city-surface-hover">{translate('Export interactions CSV')}</button>
        <button type="button" onClick={() => download(`simagents-relations-${stamp}.json`, JSON.stringify(metrics, null, 2), 'application/json')}
          className="px-2 py-1 text-xs rounded bg-city-surface-alt border border-city-border hover:bg-city-surface-hover">{translate('Export JSON')}</button>
      </div>
    </div>
  );
}
