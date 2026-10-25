import { admissionConfig, relaySession, useRelaySession } from '../../services/relay-access';
import { getEngineClient } from '../../engine-host/engine-client';
import { useState } from 'react';
import { useAppMode, useIsPaused } from '../../stores/editor';
import { translate, useLocale } from '../../i18n';
import { errorIssue, type AppIssue } from '@simagents/shared';
import { formatIssue } from '../../i18n/errors';

interface ModeControlsProps {
  stoppedByError?: boolean;
  mutationPending?: boolean;
  /** Opens the guided setup; starting always goes through its review step. */
  onSetup: () => void;
  onPause?: () => Promise<void>;
  onResume?: () => Promise<void>;
}

export function ModeControls({ onSetup, onPause, onResume, stoppedByError, mutationPending }: ModeControlsProps) {
  useLocale();
  useRelaySession();
  const relayConfig = admissionConfig();
  const relayBlocked = !!relayConfig && getEngineClient().usesRelay(relayConfig.relayUrl) && !relaySession.getToken();
  const mode = useAppMode(), paused = useIsPaused();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppIssue>();
  const ready = mode === 'editor';
  const state = ready ? 'ready' : stoppedByError ? 'error' : paused ? 'paused' : 'running';
  const toggle = async () => {
    setLoading(true); setError(undefined);
    try { if (paused) await onResume?.(); else await onPause?.(); }
    catch (cause) { setError(errorIssue(cause)); }
    finally { setLoading(false); }
  };
  return <div className="session-controls" role="group" aria-label={translate('Simulation controls')}>
    <span className="session-state" data-state={state}><span className="dot" aria-hidden="true" /><span>{translate(state === 'ready' ? 'Ready' : state === 'error' ? 'Error' : state === 'paused' ? 'Paused' : 'Running')}</span></span>
    {stoppedByError && !ready && <button type="button" className="btn btn-small hidden sm:inline-flex" disabled={loading || mutationPending} onClick={onSetup}>{translate('New session')}</button>}
    <button className={ready || paused ? 'btn btn-primary' : 'btn'} type="button"
      disabled={loading || (paused && !ready && relayBlocked) || (ready && mutationPending)}
      title={relayBlocked ? translate('Get relay access before resuming.') : undefined}
      onClick={ready ? onSetup : toggle}>
      {translate(loading ? 'Working…' : ready ? 'Start' : paused ? 'Resume' : 'Pause')}
    </button>
    {error && <span role="alert">{formatIssue(error)}</span>}
  </div>;
}
