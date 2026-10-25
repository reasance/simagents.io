import { useLocale, translate } from '../../../i18n';
/**
 * TemporalPanel - Temporal metrics visualization
 */

import { useTemporalMetrics } from '../../../stores/analytics';
import { MetricCard } from '../MetricCard';
import { LineChart } from '../charts/LineChart';

export function TemporalPanel() {
  useLocale();
  const temporal = useTemporalMetrics();

  if (!temporal) {
    return (
      <div className="flex items-center justify-center h-32 text-city-text-muted text-sm">{translate("Loading temporal metrics...")}</div>
    );
  }

  const { tickDurations = [], eventsByTick = [], currentTick = 0 } = temporal;

  // Calculate averages
  const avgDuration = tickDurations.length > 0
    ? tickDurations.reduce((sum, d) => sum + d.duration, 0) / tickDurations.length
    : 0;

  const avgActions = tickDurations.length > 0
    ? tickDurations.reduce((sum, d) => sum + d.actionsExecuted, 0) / tickDurations.length
    : 0;

  const totalEvents = temporal.totalEvents ?? eventsByTick.reduce((sum, d) => sum + d.eventCount, 0);

  // Prepare line chart data for decision latencys
  const durationLineData = [{
    id: 'duration',
    color: '#ffc93c',
    points: tickDurations.map((d) => ({
      x: d.tick,
      y: d.duration,
    })),
  }];

  // Prepare line chart data for actions per tick
  const actionsLineData = [{
    id: 'actions',
    color: '#aea8de',
    points: tickDurations.map((d) => ({
      x: d.tick,
      y: d.actionsExecuted,
    })),
  }];

  // Prepare line chart data for events per tick
  const eventsLineData = [{
    id: 'events',
    color: '#aea8de',
    points: eventsByTick.map((d) => ({
      x: d.tick,
      y: d.eventCount,
    })),
  }];

  // Prepare line chart data for agent count over time
  const agentCountData = [{
    id: 'agents',
    color: '#aea8de',
    points: tickDurations.map((d) => ({
      x: d.tick,
      y: d.agentCount,
    })),
  }];

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="stat-grid">
        <MetricCard
          label={translate("Current Tick")}
          value={currentTick}
        />
        <MetricCard
          label={translate("Avg max decision latency")}
          value={`${avgDuration.toFixed(0)}ms`}
          tone={avgDuration > 5000 ? 'alert' : 'default'}
        />
        <MetricCard
          label={translate("Total Events")}
          value={totalEvents.toLocaleString()}
        />
      </div>

      {/* Actions per tick */}
      <div>
        <div className="engraved">{translate("Avg Actions/Tick:")}{" "}{avgActions.toFixed(1)}
        </div>
      </div>

      {/* Tick duration over time */}
      {tickDurations.length > 0 && (
        <div>
          <div className="engraved mb-2">{translate("Max decision latency (ms)")}</div>
          <LineChart
            data={durationLineData}
            height={120}
          />
        </div>
      )}

      {/* Actions per tick over time */}
      {tickDurations.length > 0 && (
        <div>
          <div className="engraved mb-2">{translate("Actions per Tick")}</div>
          <LineChart
            data={actionsLineData}
            height={120}
          />
        </div>
      )}

      {/* Events per tick */}
      {eventsByTick.length > 0 && (
        <div>
          <div className="engraved mb-2">{translate("Events per Tick")}</div>
          <LineChart
            data={eventsLineData}
            height={120}
          />
        </div>
      )}

      {/* Agent count over time */}
      {tickDurations.length > 0 && tickDurations.some((d) => d.agentCount > 0) && (
        <div>
          <div className="engraved mb-2">{translate("Active Agents over Time")}</div>
          <LineChart
            data={agentCountData}
            height={120}
          />
        </div>
      )}

      {/* Recent ticks table */}
      {tickDurations.length > 0 && (
        <div>
          <div className="engraved mb-2">{translate("Recent Ticks")}</div>
          <div className="overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-city-border">
                  <th className="px-2 py-1 text-left text-city-text-muted">{translate("Tick")}</th>
                  <th className="px-2 py-1 text-right text-city-text-muted">{translate("Max decision latency")}</th>
                  <th className="px-2 py-1 text-right text-city-text-muted">{translate("Agents")}</th>
                  <th className="px-2 py-1 text-right text-city-text-muted">{translate("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tickDurations.slice(-5).reverse().map((d) => (
                  <tr key={d.tick} className="border-b border-city-border/50 last:border-0">
                    <td className="px-2 py-1 text-city-text">{d.tick}</td>
                    <td className="px-2 py-1 text-right text-city-text">
                      {d.duration.toLocaleString()}ms
                    </td>
                    <td className="px-2 py-1 text-right text-city-text">{d.agentCount}</td>
                    <td className="px-2 py-1 text-right text-city-text">{d.actionsExecuted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
