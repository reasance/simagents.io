import { admissionConfig, relaySession, useRelaySession } from '../services/relay-access';
import { errorIssue, type AppIssue } from '@simagents/shared';
import { formatIssue } from '../i18n/errors';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppMode, useEditorStore, type AppMode } from '../stores/editor';
import { useSessionLimitsStore } from '../stores/sessionLimits';
import { useAliveAgents, useAgents, useSimTime } from '../stores/world';
import { useVisualizationStore } from '../stores/visualization';
import { getEngineClient } from '../engine-host/engine-client';
import { ModeControls } from './Controls';
import { setLocale, translate, useLocale, type Locale, type TranslationKey } from '../i18n';
import { formatSimTime } from '../utils/format';
import type { ConnectionStatus } from '../hooks/useEngine';

interface Props {
  status: ConnectionStatus;
  errorMessage?: string;
  mutationPending?: boolean;
  onSetup: () => void;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onReset: () => void;
  onImport: () => void;
  onExport: () => void;
  onConfigure: () => void;
  onReplay: () => void;
  onNavigate?: () => void;
}

const SECTIONS: Array<{ label: TranslationKey; mode: AppMode | 'world' }> = [
  { label: 'World', mode: 'world' },
  { label: 'Relations', mode: 'analytics' },
  { label: 'Replay', mode: 'replay' },
  { label: 'Prompts', mode: 'prompts' },
];

function Readout({ label, children, optional }: { label: TranslationKey; children: ReactNode; optional?: boolean }) {
  return <div className={`readout${optional ? ' readout-optional' : ''}`}><span>{translate(label)}</span><span>{children}</span></div>;
}

export function TopBar(props: Props) {
  const locale = useLocale();
  const relayState = useRelaySession();
  const relayConfig = admissionConfig();
  const activeRelay = !!relayConfig && getEngineClient().usesRelay(relayConfig.relayUrl);
  const mode = useAppMode();
  const usage = useSessionLimitsStore(state => state.usage);
  const simTimeMs = useSimTime();
  const alive = useAliveAgents().length, total = useAgents().length;
  const setMode = useEditorStore(state => state.setMode);
  const toggleSocialGraph = useVisualizationStore(state => state.toggleSocialGraph);
  const menu = useRef<HTMLDetailsElement>(null);
  const [speed, setSpeed] = useState(10), [error, setError] = useState<AppIssue>();
  const connected = props.status === 'connected';
  useEffect(() => getEngineClient().onState(state => { if (state.speed !== undefined) setSpeed(state.speed); }), []);
  // The menu is pinned under the bar on narrow screens, where the bar can wrap to two lines.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty('--header-bottom', `${Math.round(element.getBoundingClientRect().bottom)}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    // Safari does not focus buttons on pointer activation, so Escape is handled on the document too.
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        event.preventDefault();
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const closeMenu = () => { if (menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } };
  const action = (run: () => void) => () => { closeMenu(); props.onNavigate?.(); run(); };
  const changeSpeed = async (next: number) => {
    setError(undefined);
    try { await getEngineClient().setSpeed(next); setSpeed(next); }
    catch (cause) { setError(errorIssue(cause)); }
  };
  const current = mode === 'editor' || mode === 'simulation' ? 'world' : mode;
  const go = (target: AppMode | 'world') => {
    if (target === current) return;
    if (target === 'replay') props.onReplay();
    else setMode(target === 'world' ? (connected ? 'simulation' : 'editor') : target);
  };
  const sectionButtons = (inMenu: boolean) => SECTIONS.map(section => <button key={section.label} type="button"
    className={inMenu ? 'menu-nav-item' : undefined}
    aria-current={current === section.mode ? 'page' : undefined}
    title={section.mode === 'replay' ? translate('Opening replay pauses the world') : undefined}
    onClick={inMenu ? action(() => go(section.mode)) : () => go(section.mode)}>{translate(section.label)}</button>);
  const relayBadge = <span className="badge" data-relay-status={relayState.status} role="status">{translate(relayState.status === 'ready' ? 'Relay ready' : relayState.status === 'checking' ? 'Relay renewing…' : relayState.status === 'interaction-required' ? 'Relay verification required' : relayState.status === 'expired' ? 'Relay expired' : 'Relay unavailable')}</span>;
  const readouts = <>
    <Readout label="World time"><span className="figure">{formatSimTime(simTimeMs)}</span></Readout>
    <Readout label="Alive"><span className="figure">{alive}/{total}</span></Readout>
    {usage && <Readout label="Requests" optional><span className="figure" title={translate('Local attempted-request counter; not a guaranteed billing cap')}>{usage.requests}/{usage.limits.maxRequests}</span></Readout>}
    <div className="readout"><span>{translate('Speed')}</span>
      <span><select aria-label={translate('Simulation speed')} value={speed} onChange={event => void changeSpeed(Number(event.target.value))}>
        {[...new Set([1, 2, 4, 5, 10, 20, 50, speed])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}×</option>)}
      </select></span>
    </div>
  </>;

  return <><div className="topbar" ref={bar}>
    <div className="brand"><span className="brand-name">{translate('SimAgents')}</span><span className="brand-tag">{translate('Beta')}</span></div>
    <nav className="nav-tabs" aria-label={translate('Sections')}>{sectionButtons(false)}</nav>
    <div className="readouts" role="group" aria-label={translate('World readouts')}>
      {connected && readouts}
      {activeRelay && relayBadge}
    </div>
    <ModeControls mutationPending={props.mutationPending} stoppedByError={!!props.errorMessage} onSetup={props.onSetup} onPause={props.onPause} onResume={props.onResume} />
    <details ref={menu} className="simulation-tools">
      <summary aria-label={translate('Open menu')}>{translate('Menu')}</summary>
      <nav aria-label={translate('Simulation tools')} className="simulation-tools-content">
        {connected && <div className="menu-readouts">{readouts}</div>}
        {sectionButtons(true)}
        <hr className="menu-nav-item" />
        {props.errorMessage && mode !== 'editor' && <button className="sm:hidden" disabled={props.mutationPending} onClick={action(props.onSetup)}>{translate('New session')}</button>}
        <button disabled={props.mutationPending} onClick={action(props.onSetup)}>{translate('Keys and participants')}</button>
        <button disabled={props.mutationPending} onClick={action(props.onConfigure)}>{translate('Advanced settings')}</button>
        {connected && <button onClick={action(toggleSocialGraph)}>{translate('Social Graph')}</button>}
        <hr />
        <button disabled={props.mutationPending} onClick={action(props.onImport)}>{translate('Import saved world')}</button>
        {connected && <button onClick={action(props.onExport)}>{translate('Export current world')}</button>}
        {relayConfig && <button onClick={action(() => { void relaySession.start(); })}>{translate('Get relay access')}</button>}
        {connected && <button disabled={props.mutationPending} onClick={action(() => { if (confirm(translate('Reset simulation? This clears the saved world and all replay/prompt archives on this device. Export data first.'))) props.onReset(); })}>{translate('Reset')}</button>}
        {props.mutationPending && <p role="status" className="menu-row muted">{translate('Importing world…')}</p>}
        <hr />
        <label className="menu-row">{translate('Language')}
          <select aria-label={translate('Language')} value={locale} onChange={event => setLocale(event.target.value as Locale)}>
            <option value="en">{translate('English')}</option><option value="it">{translate('Italiano')}</option>
          </select>
        </label>
      </nav>
    </details>
    {error && <p role="alert" className="text-sm text-alert">{formatIssue(error)}</p>}
  </div>
  {/* On narrow screens the readouts are in the menu; relay state must stay in view. */}
  {activeRelay && <div className="relay-strip lg:hidden">{relayBadge}</div>}
  </>;
}
