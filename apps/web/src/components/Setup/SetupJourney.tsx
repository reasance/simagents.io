import { useCallback, useEffect, useRef, useState } from 'react';
import { errorIssue, isLLMProviderId, type AppIssue } from '@simagents/shared';
import { useRelaySession } from '../../services/relay-access';
import { formatError, formatIssue } from '../../i18n/errors';
import { translate, useLocale, type TranslationKey } from '../../i18n';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useConnectionsStore } from '../../stores/connections';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useRosterStore } from '../../stores/roster';
import { useEditorStore } from '../../stores/editor';
import { useSessionLimitsStore } from '../../stores/sessionLimits';
import { useConnectionVerificationStore } from '../../stores/connectionVerification';
import { useRequestCaptureStore } from '../../stores/requestCapture';
import { useProxyUrl } from '../../stores/settings';
import { byokPreflight, dryRunPreflightIssue, internalFixturesEnabled } from '../../services/byok-preflight';
import { useDryRunStore } from '../../stores/dryRun';
import { profileVerificationIssue } from '../../services/profile-verification-gate';
import { loadSavedWorld, type SavedWorld } from '../../services/persistence';
import { effortLabel, modelLabel, providerLabel } from '../../services/participants';
import { SessionLimitsForm } from '../Controls/SessionLimitsForm';
import { CredentialVaultControls } from '../ConfigPanel/CredentialVaultControls';
import { ConnectionsConfig } from '../ConfigPanel/ConnectionsConfig';
import { ProviderKeys } from './ProviderKeys';
import { ParticipantCard, PARTICIPANT_COLORS } from './ParticipantCard';

export type SetupStep = 'keys' | 'participants' | 'start';
const STEPS: Array<{ id: SetupStep; label: TranslationKey }> = [
  { id: 'keys', label: 'Provider keys' },
  { id: 'participants', label: 'Participants' },
  { id: 'start', label: 'Limits and start' },
];

interface Props {
  initialStep?: SetupStep;
  onClose: () => void;
  onStart: (resume?: boolean) => Promise<void>;
  onAdvanced: () => void;
}

export function SetupJourney({ initialStep, onClose, onStart, onAdvanced }: Props) {
  useLocale();
  useRelaySession();
  const profiles = useConnectionsStore(s => s.profiles);
  const keys = useApiKeysStore();
  const roster = useRosterStore(s => s.roster);
  const { addEntry, duplicateEntry, removeEntry, updateEntry } = useRosterStore();
  const limits = useSessionLimitsStore(s => s.limits);
  const proxy = useProxyUrl();
  const capture = useRequestCaptureStore();
  useConnectionVerificationStore(s => s.results);
  const dryRun = useDryRunStore(s => s.enabled), setDryRun = useDryRunStore(s => s.setEnabled);
  const activeKeys = keys.getActiveKeys();
  const hasKey = dryRun || Object.keys(activeKeys).some(id => isLLMProviderId(id)) || profiles.some(profile => !!activeKeys[profile.credentialRef]) || internalFixturesEnabled();
  const dryRunIssue = dryRunPreflightIssue(roster, internalFixturesEnabled());
  const issue = dryRun ? dryRunIssue && formatIssue(dryRunIssue)
    : byokPreflight(roster, activeKeys, proxy, internalFixturesEnabled(), profiles) ?? profileVerificationIssue(roster, profiles);
  const [step, setStep] = useState<SetupStep>(() => initialStep ?? (!hasKey ? 'keys' : issue ? 'participants' : 'start'));
  const [busy, setBusy] = useState(false), [limitsValid, setLimitsValid] = useState(true), [error, setError] = useState<AppIssue>();
  const [saved, setSaved] = useState<SavedWorld>(), [saveError, setSaveError] = useState(''), [choice, setChoice] = useState<'resume' | 'new'>('new');
  const dialog = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useDialogFocus(dialog, true, close);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    let cancelled = false;
    void loadSavedWorld().then(world => { if (!cancelled) setSaved(world); })
      .catch(() => { if (!cancelled) setSaveError('Saved world could not be read. Existing data has been preserved.'); });
    return () => { cancelled = true; };
  }, []);

  // A world started on scripted replies resumes only as a dry run, and a model world only with models.
  const resumable = !!saved && (saved.snapshot.configuration?.dryRun === true) === dryRun;
  useEffect(() => { setChoice(resumable ? 'resume' : 'new'); }, [resumable]);
  const index = STEPS.findIndex(s => s.id === step);
  const canLeave = (id: SetupStep) => id === 'keys' ? hasKey : id === 'participants' ? !issue : !issue && limitsValid;
  const reachable = (id: SetupStep) => STEPS.slice(0, STEPS.findIndex(s => s.id === id)).every(s => canLeave(s.id));
  const next = STEPS[index + 1]?.id;
  const addParticipant = () => {
    const source = roster.at(-1);
    const used = new Set(roster.map(entry => entry.color.toLowerCase()));
    const color = PARTICIPANT_COLORS.find(c => !used.has(c.value))?.value ?? PARTICIPANT_COLORS[roster.length % PARTICIPANT_COLORS.length].value;
    const name = `Agent ${roster.length + 1}`;
    addEntry(source ? { provider: source.provider, connectionId: source.connectionId, modelId: source.modelId, color, name } : { provider: 'claude', color, name });
  };
  async function start() {
    setBusy(true); setError(undefined);
    try { await onStart(choice === 'resume' && resumable); if (useEditorStore.getState().mode === 'simulation') onClose(); }
    catch (cause) { setError(errorIssue(cause)); }
    finally { setBusy(false); }
  }

  return <div className="setup-backdrop">
    <div className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title" tabIndex={-1} ref={dialog}>
      <aside className="setup-rail">
        <span className="brand-name">{translate('SimAgents')}</span>
        <header className="setup-rail-intro">
          <h1 id="setup-title" className="m-0 text-base font-medium">{translate('Set up your simulation')}</h1>
          <p className="hint m-0 mt-1">{translate('Your world runs on this device. Your models make the decisions.')}</p>
        </header>
        <nav aria-label={translate('Setup progress')}>
          <ol className="setup-progress">{STEPS.map((s, i) => <li key={s.id} aria-current={step === s.id ? 'step' : undefined} data-done={i < index && canLeave(s.id) ? 'true' : undefined}>
            <button type="button" disabled={!reachable(s.id)} onClick={() => setStep(s.id)}><span>{i + 1}</span><span>{translate(s.label)}</span></button>
          </li>)}</ol>
        </nav>
        <button type="button" className="btn btn-quiet mt-auto lg:self-start" onClick={close} aria-label={translate('Close simulation setup')}>{translate('Close')}</button>
      </aside>

      <main className="setup-body">
        <span className="engraved">{translate('Step {current} of {total}', { current: index + 1, total: STEPS.length })}</span>
        <h2 ref={heading} tabIndex={-1}>{translate(STEPS[index].label)}</h2>

        {step === 'keys' && <>
          <div className="choice-cards" role="group" aria-label={translate('How participants decide')}>
            <button type="button" aria-pressed={!dryRun} onClick={() => setDryRun(false)}><span>{translate('Real models')}</span><span>{translate('Your keys, billed by each provider')}</span></button>
            <button type="button" aria-pressed={dryRun} onClick={() => setDryRun(true)}><span>{translate('Dry run')}</span><span>{translate('Scripted replies in this tab: no keys, no requests, no cost')}</span></button>
          </div>
          {dryRun ? <p className="notice" role="status">{translate('Participants answer with scripted local replies after a delay that grows with their effort. Use it to try the interface; the world says nothing about the models.')}</p> : <>
          <p className="setup-lede">{translate('Paste a key for each provider you want to bring. Your provider bills every request. Keys stay in this tab unless you save them encrypted on this device.')}</p>
          <section className="setup-section" aria-label={translate('Provider keys')}><ProviderKeys /></section>
          <details className="setup-section">
            <summary className="cursor-pointer min-h-11 flex items-center font-medium">{translate('Save keys on this device (encrypted)')}</summary>
            <CredentialVaultControls />
          </details>
          <details className="setup-section">
            <summary className="cursor-pointer min-h-11 flex items-center font-medium">{translate('Custom endpoints and relays')}</summary>
            <ConnectionsConfig />
          </details>
          </>}
        </>}

        {step === 'participants' && <>
          <p className="setup-lede">{translate(dryRun ? 'Each participant is a model with an effort level. In a dry run no model is called: the effort only sets how long each reply takes.' : 'Each participant is a model with an effort level. Add the same model more than once with different efforts to compare them. Every participant needs one verification request before the world starts.')}</p>
          <div className="grid gap-4">
            {roster.map((entry, i) => <ParticipantCard key={entry.id ?? i} entry={entry} canRemove={roster.length > 1}
              onUpdate={patch => updateEntry(i, patch)} onDuplicate={() => duplicateEntry(i)} onRemove={() => removeEntry(i)} />)}
          </div>
          <button type="button" className="btn mt-4" onClick={addParticipant}>{translate('Add participant')}</button>
          {issue && <p className="notice mt-6" role="status">{issue}</p>}
        </>}

        {step === 'start' && <>
          <p className="setup-lede">{translate('Time keeps passing while models think, so a slower model spends more of its life deciding. Nothing in the world tells the participants to cooperate.')}</p>
          {dryRun && <p className="notice" role="status">{translate('Dry run: replies are scripted in this tab. Nothing is sent to a provider and nothing is billed. The saved world is marked as a dry run.')}</p>}
          <section className="setup-section">
            <header><span className="engraved">{translate('Participants')}</span><button type="button" className="btn btn-quiet btn-small" onClick={() => setStep('participants')}>{translate('Edit')}</button></header>
            <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={translate('Participants')}><table className="summary-table">
              <thead><tr><th scope="col">{translate('Name')}</th><th scope="col">{translate('Model')}</th><th scope="col">{translate('Effort')}</th><th scope="col">{translate('Provider')}</th></tr></thead>
              <tbody>{roster.map((entry, i) => <tr key={entry.id ?? i}>
                <td><span className="inline-flex items-center gap-2"><span className="dot" style={{ color: entry.color }} aria-hidden="true" />{entry.name}</span></td>
                <td>{modelLabel(entry)}</td><td className="figure">{effortLabel(entry) ?? translate('Default')}</td><td className="muted">{providerLabel(entry)}</td>
              </tr>)}</tbody>
            </table></div>
          </section>
          {saved && !resumable && <p className="hint">{translate(dryRun ? 'The saved world was run with real models; starting replaces it. Switch to real models to resume it.' : 'The saved world is a dry run; starting replaces it. Switch to the dry run to resume it.')}</p>}
          {saved && resumable && <section className="setup-section">
            <header><span className="engraved">{translate('World')}</span></header>
            {!saved.snapshot.random?.complete && <p role="note" className="hint">{translate('Original random history is unavailable for this save. Random sequence continuity is preserved only from its first updated save.')}</p>}
            <div className="choice-cards">
              <button type="button" aria-pressed={choice === 'resume'} onClick={() => setChoice('resume')}><span>{translate('Resume saved world')}</span><span>{translate('tick')} {String(saved.snapshot.store.worldState.currentTick)} · {saved.snapshot.store.agents.length} {translate('agents')}</span></button>
              <button type="button" aria-pressed={choice === 'new'} onClick={() => setChoice('new')}><span>{translate('Start new world')}</span><span>{translate('clears the saved world snapshot')}</span></button>
            </div>
          </section>}
          <section className="setup-section">
            <header><span className="engraved">{translate('Session limits')}</span></header>
            <SessionLimitsForm onValidityChange={setLimitsValid} />
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" aria-label={translate('Capture actual requests for this session')} aria-describedby="request-capture-description" checked={capture.enabled} onChange={event => capture.setEnabled(event.target.checked)} />
              <span>{translate('Capture actual requests for this session')}<span id="request-capture-description" className="hint block mt-1">{translate('Optional local diagnostics: prompts and responses are saved on this device. Up to 100 completed attempts per session, up to 16,384 characters per request/response body; truncation is marked. Authentication headers and URLs are excluded; known session keys are redacted. Shared storage budget applies. Applies when starting a session.')}</span></span>
            </label>
          </section>
          {issue && <div className="notice" role="status"><p className="m-0">{issue}</p><button type="button" className="btn btn-small mt-2" onClick={() => setStep('participants')}>{translate(dryRun ? 'Edit' : 'Return to model verification')}</button>{!dryRun && <p className="hint mt-2 mb-0">{translate('Changing the response token limit requires verifying the model again.')}</p>}</div>}
        </>}
        {saveError && <p role="alert" className="text-sm text-alert">{formatError(saveError)}</p>}
        {error && <p role="alert" className="notice notice-alert">{formatIssue(error)}</p>}
      </main>

      <footer className="setup-footer">
        <p className="hint m-0">{translate('Settings are saved as you go. Closing does not start a session.')}</p>
        <div>
          <button type="button" className="btn btn-quiet" onClick={onAdvanced}>{translate('Advanced settings')}</button>
          {index > 0 && <button type="button" className="btn" onClick={() => setStep(STEPS[index - 1].id)}>{translate('Back')}</button>}
          {next ? <button type="button" className="btn btn-primary" disabled={!canLeave(step)} onClick={() => setStep(next)}>{translate('Continue')}</button>
            : <button type="button" className="btn btn-primary" disabled={busy || !!issue || !limitsValid || !!saveError} onClick={() => void start()}>{translate(busy ? 'Starting…' : choice === 'resume' && resumable ? 'Resume world' : dryRun ? 'Start dry run' : 'Start world')}</button>}
        </div>
      </footer>
    </div>
  </div>;
}
