import { useLocale, translate } from '../i18n';
import { useAgentStatsStore } from '../stores/agentStats';
/**
 * AnalyticsPage - Full-screen analytics dashboard
 */

import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor';
import { useWorldStore } from '../stores/world';
import { useFetchSnapshot } from '../stores/analytics';
import { SurvivalPanel } from '../components/Analytics/panels/SurvivalPanel';
import { EconomyPanel } from '../components/Analytics/panels/EconomyPanel';
import { BehaviorPanel } from '../components/Analytics/panels/BehaviorPanel';
import { TemporalPanel } from '../components/Analytics/panels/TemporalPanel';
import { RelationsPanel } from '../components/Analytics/panels/RelationsPanel';

export function AnalyticsPage() {
  useLocale();
  const metrics = useAgentStatsStore(state => state.metrics);
  const setMode = useEditorStore((s) => s.setMode);
  const agents = useWorldStore((s) => s.agents);
  const fetchSnapshot = useFetchSnapshot();

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    // Initial fetch
    fetchSnapshot();

    // Set up interval
    const interval = setInterval(() => {
      fetchSnapshot();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  const handleBackToCity = () => {
    setMode(agents.length > 0 ? 'simulation' : 'editor');
  };

  return (
    <div className="feature-page h-full min-h-0 flex flex-col bg-city-bg">
      {/* Header */}
      <header className="feature-header flex-none min-h-14 bg-city-surface border-b border-city-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-city-accent rounded-md flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-city-text">{translate("Analytics Dashboard")}</h1>
        </div>

        <button
          type="button"
          onClick={handleBackToCity}
          className="px-4 py-1.5 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-xs font-medium rounded border border-city-border/50 flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>{translate("Back to City")}</button>
      </header>

      <p role="note" className="px-4 py-2 text-xs text-city-text-muted">{metrics?.complete ? translate("Action attempts and events are cumulative since this world began.") : translate("Incomplete history: counters cover only available legacy events and subsequent activity.")}{" "}{translate("Attempts include failed world actions; result events are not counted twice. Temporal charts show the latest 30 recorded ticks. Gini includes living agents with zero balance.")}</p>
      {/* Main content - 2x2 grid */}
      <main tabIndex={0} aria-label={translate("Analytics Dashboard")} className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-[600px]">
          {/* Survival Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-status-success">❤️</span>{translate("Survival Metrics")}</h2>
            </div>
            <div tabIndex={0} className="flex-1 overflow-auto p-4">
              <SurvivalPanel />
            </div>
          </section>

          {/* Economy Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-status-warning">💰</span>{translate("Economy Metrics")}</h2>
            </div>
            <div tabIndex={0} className="flex-1 overflow-auto p-4">
              <EconomyPanel />
            </div>
          </section>

          {/* Behavior Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-city-accent">🎯</span>{translate("Behavior Metrics")}</h2>
            </div>
            <div tabIndex={0} className="flex-1 overflow-auto p-4">
              <BehaviorPanel />
            </div>
          </section>

          {/* Temporal Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-status-info">⏱️</span>{translate("Temporal Metrics")}</h2>
            </div>
            <div tabIndex={0} className="flex-1 overflow-auto p-4">
              <TemporalPanel />
            </div>
          </section>
        </div>

        {/* Relations Panel: what agents said and did to each other */}
        <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col mt-4">
          <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
            <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
              <span className="text-city-accent">🗣️</span>{translate("Relations Metrics")}</h2>
          </div>
          <div tabIndex={0} className="overflow-x-auto p-4">
            <RelationsPanel />
          </div>
        </section>
      </main>

      {/* Footer with refresh info */}
      <footer className="feature-footer flex-none min-h-10 bg-city-surface border-t border-city-border px-4 flex items-center justify-between text-xs text-city-text-muted">
        <span>{translate("Auto-refresh every 30 seconds")}</span>
        <button
          type="button"
          onClick={() => fetchSnapshot()}
          className="hover:text-city-text flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>{translate("Refresh Now")}</button>
      </footer>
    </div>
  );
}
