import { useEffect, type ReactNode } from 'react';
import { translate, useLocale, type TranslationKey } from '../i18n';
import { useAgentStatsStore } from '../stores/agentStats';
import { useFetchSnapshot } from '../stores/analytics';
import { SurvivalPanel } from '../components/Analytics/panels/SurvivalPanel';
import { BehaviorPanel } from '../components/Analytics/panels/BehaviorPanel';
import { TemporalPanel } from '../components/Analytics/panels/TemporalPanel';
import { RelationsPanel } from '../components/Analytics/panels/RelationsPanel';

function Panel({ title, children, wide }: { title: TranslationKey; children: ReactNode; wide?: boolean }) {
  return <section className={`surface p-5 stack${wide ? ' lg:col-span-3' : ''}`} aria-label={translate(title)}>
    <h2 className="m-0 text-base font-medium">{translate(title)}</h2>
    {children}
  </section>;
}

/** Observer-only figures. Relations come first; they are what the experiment is about. */
export function AnalyticsPage() {
  useLocale();
  const metrics = useAgentStatsStore(state => state.metrics);
  const fetchSnapshot = useFetchSnapshot();
  useEffect(() => {
    void fetchSnapshot();
    const interval = setInterval(() => void fetchSnapshot(), 30000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  return <div className="feature-page">
    <header className="feature-header">
      <div><span className="engraved">{translate('Observer only')}</span><h1>{translate('Relations')}</h1>
        <p className="hint m-0 mt-1 max-w-2xl">{translate('What the participants said and did to each other, and how long they lasted. None of these figures is ever shown to them.')}</p></div>
      <button type="button" className="btn btn-small" onClick={() => void fetchSnapshot()}>{translate('Refresh now')}</button>
    </header>
    <main tabIndex={0} aria-label={translate('Relations')} className="feature-content">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Relations Metrics" wide><div className="overflow-x-auto" role="region" tabIndex={0} aria-label={translate('Relations Metrics')}><RelationsPanel /></div></Panel>
        <Panel title="Survival Metrics"><SurvivalPanel /></Panel>
        <Panel title="Behavior Metrics"><BehaviorPanel /></Panel>
        <Panel title="Temporal Metrics"><TemporalPanel /></Panel>
      </div>
      <p role="note" className="hint mt-4 max-w-3xl">{metrics?.complete ? translate('Action attempts and events are cumulative since this world began.') : translate('Incomplete history: counters cover only available legacy events and subsequent activity.')}{' '}{translate('Attempts include failed world actions; result events are not counted twice. Temporal charts show the latest 30 recorded ticks.')}</p>
    </main>
    <footer className="feature-footer"><span>{translate('Refreshed every 30 seconds')}</span></footer>
  </div>;
}
