import { AppError, errorIssue, type AppIssue } from '@simagents/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatIssue } from './i18n/errors';
import { translate, useLocale } from './i18n';
import { importWorld } from './services/import-world';
import { APP_DATA_BUDGET } from './services/app-data';
import { migrateLegacyRuntime } from './services/migrate-legacy-runtime';
import { downloadWorldExport } from './services/persistence';
import { getEngineClient } from './engine-host/engine-client';
import { useEngine } from './hooks/useEngine';
import { useWorldControl } from './hooks/useWorldControl';
import { useWorldStore, useAliveAgents, useNotableEvents } from './stores/world';
import { useEditorStore, useAppMode, useIsAnalyticsMode, useIsReplayMode, useIsPromptsMode } from './stores/editor';
import { useReplayStore } from './stores/replay';
import { TopBar } from './components/TopBar';
import { SetupJourney, type SetupStep } from './components/Setup/SetupJourney';
import { ConfigPanel } from './components/ConfigPanel';
import { StorageNotice } from './components/StorageNotice';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorldMap } from './components/Canvas/WorldMap';
import { ParticipantList } from './components/World/ParticipantList';
import { AgentDetail } from './components/World/AgentDetail';
import { Feed } from './components/World/Feed';
import { ResourceProfile } from './components/ResourceProfile';
import { MobileNav, type MobileView } from './components/MobileNav';
import { SocialGraphView } from './components/SocialGraph';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReplayPage } from './pages/ReplayPage';
import { PromptsPage } from './pages/PromptsPage';

/** The world before it starts: what this is, and the one thing to do next. */
function FirstRun({ onSetup, onImport }: { onSetup: () => void; onImport: () => void }) {
  useLocale();
  return <section className="first-run" aria-label={translate('Simulation setup')}>
    <div className="first-run-card">
      <span className="engraved">{translate('An observatory for AI models')}</span>
      <h1>{translate('Put different models in one world and watch what grows between them.')}</h1>
      <p>{translate('Bring your own keys, choose each model and its effort, and let them survive at their own speed. Nothing tells them to cooperate.')}</p>
      <dl>
        <dt>{translate('Imposed')}</dt><dd>{translate('A 100 × 100 world, hunger, energy, health, resources and seasons')}</dd>
        <dt>{translate('Left open')}</dt><dd>{translate('Who talks to whom, gifts, force, names for places, any rules')}</dd>
      </dl>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={onSetup}>{translate('Set up a simulation')}</button>
        <button type="button" className="btn btn-quiet" onClick={onImport}>{translate('Import saved world')}</button>
      </div>
    </div>
  </section>;
}

export default function App() {
  useLocale();
  useEffect(() => { migrateLegacyRuntime(); }, []);
  const engine = useEngine();
  const { status, connect, disconnect } = engine;
  const selectedAgentId = useWorldStore(s => s.selectedAgentId);
  const selectedResourceId = useWorldStore(s => s.selectedResourceId);
  const { resetWorld, setWorldState, setEvents } = useWorldStore();
  const { setMode, setPaused } = useEditorStore();
  const mode = useAppMode();
  const isAnalytics = useIsAnalyticsMode(), isReplay = useIsReplayMode(), isPrompts = useIsPromptsMode();
  const { enterReplayMode } = useReplayStore();
  const alive = useAliveAgents().length;
  const notable = useNotableEvents().length;
  const { fetchState, start, pause, resume, reset } = useWorldControl();

  const [synced, setSynced] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [setup, setSetup] = useState<SetupStep | 'auto' | undefined>();
  const [showConfig, setShowConfig] = useState(false);
  const [importBusy, setImportBusy] = useState(false), [importComplete, setImportComplete] = useState(false);
  const [importIssue, setImportIssue] = useState<AppIssue>(), [exportIssue, setExportIssue] = useState<AppIssue>();
  const importInput = useRef<HTMLInputElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (synced) return;
    void fetchState().then(state => {
      if (state?.isRunning) {
        setWorldState({ tick: state.tick, agents: state.agents || [], resourceSpawns: state.resourceSpawns || [], shelters: state.shelters || [] });
        setPaused(state.isPaused);
        setMode('simulation');
      }
      setSynced(true);
    });
  }, [synced, fetchState, setMode, setPaused, setWorldState]);

  const handleStart = useCallback(async (resumeSavedWorld = false) => {
    const result = await start({ resumeSavedWorld });
    if (!result.success) throw new AppError(result.issue ?? { code: 'INTERNAL_ERROR' });
    setWorldState({ tick: result.tick ?? 1, agents: result.agents ?? [], resourceSpawns: result.resourceSpawns ?? [], shelters: result.shelters ?? [] });
    if (result.events) setEvents(result.events);
    setPaused(false);
    setMode('simulation');
    connect();
  }, [start, setWorldState, setEvents, setPaused, setMode, connect]);

  const handleReset = useCallback(async () => {
    disconnect();
    await reset();
    resetWorld();
    setPaused(false);
    setMode('editor');
  }, [disconnect, reset, resetWorld, setPaused, setMode]);

  const handleExport = useCallback(async () => {
    setExportIssue(undefined);
    try { downloadWorldExport(await getEngineClient().exportWorld()); }
    catch { setExportIssue({ code: 'EXPORT_FAILED' }); }
  }, []);

  const handleImport = useCallback(async (file: File | undefined) => {
    if (!file || importBusy) return;
    setImportBusy(true); setImportIssue(undefined); setImportComplete(false); setExportIssue(undefined);
    try {
      if (file.size > APP_DATA_BUDGET) throw new AppError({ code: 'STORAGE_BUDGET' });
      await importWorld(JSON.parse(await file.text()), getEngineClient());
      disconnect(); resetWorld(); setPaused(false); setMode('editor');
      // History is indexed by world and agent; importing never deletes another world's archives.
      useReplayStore.getState().reset();
      setImportComplete(true);
    } catch (error) { setImportIssue(errorIssue(error)); }
    finally { setImportBusy(false); if (importInput.current) importInput.current.value = ''; }
  }, [disconnect, resetWorld, setMode, setPaused, importBusy]);

  const handlePause = useCallback(async () => { await pause(); disconnect(); }, [pause, disconnect]);
  const handleResume = useCallback(async () => { await resume(); connect(); }, [resume, connect]);
  const handleReplay = useCallback(async () => {
    if (getEngineClient().isRunning()) await getEngineClient().pause();
    disconnect();
    setMode('replay');
    enterReplayMode();
  }, [disconnect, setMode, enterReplayMode]);
  const handleError = useCallback((error: Error, info: React.ErrorInfo) => {
    console.error('[App] Component error caught:', { error: error.message, componentStack: info.componentStack });
  }, []);

  // On small screens, choosing something on the map opens its details.
  useEffect(() => {
    if ((selectedAgentId || selectedResourceId) && window.innerWidth < 1024) setMobileView('details');
  }, [selectedAgentId, selectedResourceId]);

  const openSetup = (step?: SetupStep) => { returnFocus.current = document.activeElement as HTMLElement; setSetup(step ?? 'auto'); };
  const openConfig = () => { returnFocus.current = document.activeElement as HTMLElement; setShowConfig(true); };
  const restoreFocus = () => requestAnimationFrame(() => {
    const previous = returnFocus.current;
    if (previous?.isConnected && previous.getClientRects().length) previous.focus();
    else document.querySelector<HTMLElement>('.simulation-tools > summary')?.focus();
  });
  const overlay = !!setup || showConfig;
  const ready = mode === 'editor';

  const topBar = (onNavigate?: () => void) => <TopBar status={status} mutationPending={importBusy} errorMessage={engine.error ?? undefined}
    onSetup={() => openSetup(engine.error && !ready ? 'start' : undefined)} onPause={handlePause} onResume={handleResume} onReset={() => void handleReset()}
    onConfigure={openConfig} onImport={() => importInput.current?.click()} onExport={() => void handleExport()} onReplay={() => void handleReplay()} onNavigate={onNavigate} />;

  const notices = <>
    {(importComplete || importIssue || exportIssue) && <div role={importIssue || exportIssue ? 'alert' : 'status'} tabIndex={0} className="simulation-error-notice surface p-4 text-sm">
      <p className="m-0">{importIssue || exportIssue ? formatIssue((importIssue ?? exportIssue)!) : translate('World imported. Use Start to resume the saved world.')}</p>
      <button type="button" className="btn btn-small mt-3" onClick={() => { setImportIssue(undefined); setImportComplete(false); setExportIssue(undefined); }}>{translate('Close')}</button>
    </div>}
    {engine.error && !importIssue && !exportIssue && <div role="alert" tabIndex={0} className="simulation-error-notice surface p-4 text-sm" style={{ borderColor: '#e07a6a80' }}>
      <strong>{translate('Simulation paused.')}</strong> {engine.error}
      <p className="hint mb-0">{translate('Check the connection, model and provider quota, then resume explicitly. No fallback or automatic retry was used.')}</p>
    </div>}
    <StorageNotice />
    <input ref={importInput} type="file" accept="application/json,.json" className="hidden" onChange={event => void handleImport(event.currentTarget.files?.[0])} />
    {setup && <SetupJourney initialStep={setup === 'auto' ? undefined : setup} onStart={handleStart}
      onClose={() => { setSetup(undefined); restoreFocus(); }} onAdvanced={() => { setSetup(undefined); setShowConfig(true); }} />}
    {showConfig && <ConfigPanel onClose={() => { setShowConfig(false); restoreFocus(); }} />}
  </>;

  if (isAnalytics || isReplay || isPrompts) {
    const section = isAnalytics ? 'Relations' : isReplay ? 'Replay' : 'Prompts';
    return <>
      {notices}
      <SocialGraphView controls={topBar} />
      <div inert={overlay} className="feature-shell">
        <header className="app-header shrink-0">{topBar()}</header>
        <div className="feature-body">
          <ErrorBoundary sectionName={translate(section)} onError={handleError}>
            {isAnalytics ? <AnalyticsPage /> : isReplay ? <ReplayPage /> : <PromptsPage />}
          </ErrorBoundary>
        </div>
      </div>
    </>;
  }

  const detail = selectedAgentId
    ? <ErrorBoundary sectionName={translate('Agent Profile')} onError={handleError} compact><AgentDetail agentId={selectedAgentId} /></ErrorBoundary>
    : selectedResourceId ? <ErrorBoundary sectionName={translate('Resource Profile')} onError={handleError} compact><ResourceProfile /></ErrorBoundary> : null;
  const map = <ErrorBoundary sectionName={translate('Canvas')} onError={handleError}><WorldMap showTools={!ready} /></ErrorBoundary>;

  return <>
    {notices}
    <SocialGraphView controls={topBar} />
    <div inert={overlay} className="world-shell">
      <header className="app-header shrink-0">{topBar()}</header>
      <div className="world-body">
        <main className="world-stage" aria-label={translate('World')}>
          <div className="h-full" style={{ paddingBottom: ready ? 0 : 'var(--mobile-pad, 0px)' }}>{map}</div>
          {!ready && mobileView !== 'map' && <div className="lg:hidden absolute inset-0 z-20 flex flex-col bg-panel" style={{ paddingBottom: 'calc(var(--mobile-nav-height) + env(safe-area-inset-bottom))' }}>
            {mobileView === 'participants' ? <div className="flex-1 overflow-y-auto"><ParticipantList /></div>
              : mobileView === 'feed' ? <Feed />
              : <div className="flex-1 overflow-y-auto">{detail ?? <p className="hint p-4">{translate('Tap an agent or resource on the map to view details')}</p>}</div>}
          </div>}
          {ready && <FirstRun onSetup={() => openSetup()} onImport={() => importInput.current?.click()} />}
        </main>
        <aside className="world-rail" id="desktop-observation-panel" aria-label={translate('Agent details and events')}>
          <section className="rail-section"><div className="rail-scroll">{detail ?? <ParticipantList />}</div></section>
          <Feed />
        </aside>
      </div>
      {!ready && <MobileNav current={mobileView} onChange={setMobileView} alive={alive} notable={notable} hasSelection={!!detail} />}
    </div>
  </>;
}
