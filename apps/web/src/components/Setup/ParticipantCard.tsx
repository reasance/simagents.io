import { useState } from 'react';
import {
  BASELINE_PROVIDER_IDS, defaultCapabilities, defaultConnection, errorIssue, getDefaultModelId, getModelCatalogEntry, getProviderCatalogEntry,
  isLLMProviderId, LLM_CATALOG, publishedPrice, type AgentRosterEntry, type AgentRosterProvider, type AppIssue, type LLMType, type ModelCapabilities,
} from '@simagents/shared';
import { translate, translateLabel, useLocale } from '../../i18n';
import { formatError, formatIssue } from '../../i18n/errors';
import { useConnectionsStore } from '../../stores/connections';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useSessionLimitsStore } from '../../stores/sessionLimits';
import { useConnectionVerificationStore } from '../../stores/connectionVerification';
import { useProxyUrl } from '../../stores/settings';
import { verifyConnection, verificationSignature } from '../../services/connection-verification';
import { listConnectionModels } from '../../services/connection-models';
import { internalFixturesEnabled } from '../../services/byok-preflight';
import { useDryRunStore } from '../../stores/dryRun';
import { ReasoningControl } from './ReasoningControl';

/** Muted, distinguishable on the night background; none collides with the brass accent. */
export const PARTICIPANT_COLORS = [
  { value: '#8fb8de', name: 'Sky' }, { value: '#e39a7a', name: 'Clay' }, { value: '#9fd3a8', name: 'Fern' }, { value: '#c6a0e0', name: 'Lilac' },
  { value: '#7fd1cf', name: 'Teal' }, { value: '#e58fb0', name: 'Rose' }, { value: '#b7c0cc', name: 'Silver' }, { value: '#d4d08a', name: 'Lichen' },
] as const;

const BASELINE_LABELS: Record<string, string> = {
  baseline_random: 'Random baseline', baseline_rule: 'Rule baseline', baseline_sugarscape: 'Sugarscape baseline', baseline_qlearning: 'Q-learning baseline',
};

interface Props {
  entry: AgentRosterEntry;
  canRemove: boolean;
  onUpdate: (patch: Partial<AgentRosterEntry>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function ParticipantCard({ entry, canRemove, onUpdate, onDuplicate, onRemove }: Props) {
  useLocale();
  const profiles = useConnectionsStore(s => s.profiles);
  const saveProfile = useConnectionsStore(s => s.save);
  const keys = useApiKeysStore();
  const relayUrl = useProxyUrl();
  const maxTokens = useSessionLimitsStore(s => s.limits.maxOutputTokens);
  const receipts = useConnectionVerificationStore();
  const dryRun = useDryRunStore(s => s.enabled);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [listingError, setListingError] = useState<AppIssue>();
  const active = keys.getActiveKeys();
  const profile = profiles.find(p => p.id === entry.connectionId);
  const llm = isLLMProviderId(entry.provider);
  const catalogModels = llm ? getProviderCatalogEntry(entry.provider as LLMType)?.models ?? [] : [];
  const catalogModel = llm ? getModelCatalogEntry(entry.provider as LLMType, entry.modelId) : undefined;
  const caps = entry.capabilities ?? (profile ? defaultCapabilities(profile.providerId, entry.modelId, profile.protocol)
    : dryRun && llm ? defaultCapabilities(entry.provider as LLMType, entry.modelId, defaultConnection(entry.provider as LLMType).protocol) : undefined);
  // In a dry run any catalogued model can take part: no key, connection or verification is involved.
  const choosing = llm && (!!profile || dryRun);
  const signature = profile ? verificationSignature(profile, entry.modelId, caps, entry.reasoningLevel, maxTokens, keys.credentialRevision) : '';
  const result = receipts.results[signature];
  const hasKey = !!profile && !!active[profile.credentialRef];
  const price = profile ? publishedPrice({ providerId: profile.providerId, modelId: entry.modelId, endpoint: profile.endpoint }) : undefined;
  // Providers with a key in this tab but no saved connection yet (keys restored from the vault).
  const unconnected = LLM_CATALOG.filter(p => active[p.id] && !profiles.some(profile => profile.credentialRef === p.id));
  const changeCaps = (patch: Partial<ModelCapabilities>) => { if (caps) onUpdate({ capabilities: { ...caps, ...patch } }); };

  function chooseSource(value: string) {
    if (value.startsWith('dry:')) {
      const provider = value.slice('dry:'.length) as LLMType;
      if (provider === entry.provider) return;
      // Keep a real connection for the new provider if one exists, so turning the dry run off needs no rework.
      const connection = profiles.find(p => p.id === `provider:${provider}`);
      onUpdate({ provider, connectionId: connection?.id, modelId: getDefaultModelId(provider), capabilities: undefined, reasoningLevel: undefined });
      return;
    }
    if (value.startsWith('baseline:')) {
      const provider = value.slice('baseline:'.length) as AgentRosterProvider;
      onUpdate({ provider, connectionId: undefined, modelId: provider, capabilities: undefined, reasoningLevel: undefined });
      return;
    }
    let target = profiles.find(p => p.id === value);
    if (!target && value.startsWith('new:')) {
      target = defaultConnection(value.slice('new:'.length) as LLMType, relayUrl);
      saveProfile(target);
    }
    if (!target) return;
    onUpdate({ connectionId: target.id, provider: target.providerId as LLMType, modelId: getDefaultModelId(target.providerId as LLMType), capabilities: undefined, reasoningLevel: undefined });
  }

  async function verify() {
    if (!profile || !caps) return;
    setBusy(true);
    try {
      await verifyConnection(profile, entry.modelId, active[profile.credentialRef] ?? '', caps, entry.reasoningLevel, maxTokens, profile.relayCredentialRef ? active[profile.relayCredentialRef] : undefined);
      receipts.record(signature, 'verified');
    } catch (error) { receipts.record(signature, 'unavailable', undefined, errorIssue(error)); }
    finally { setBusy(false); }
  }

  const status = !llm ? <span className="badge">{translate('Internal baseline')}</span>
    : dryRun ? <span className="badge" role="status">{translate('Dry run')}</span>
    : !profile ? <span className="badge badge-alert">{translate('Choose a provider')}</span>
    : !hasKey ? <span className="badge badge-alert">{translate('No key in this tab')}</span>
    : result?.status === 'verified' ? <span className="badge badge-ok" role="status"><span className="dot" aria-hidden="true" />{translate('Verified in this tab')}</span>
    : result?.status === 'unavailable' ? <span className="badge badge-alert" role="status">{translate('Unavailable')}</span>
    : <span className="badge" role="status">{translate('Not verified yet')}</span>;

  return <article className="participant-card" style={{ ['--participant' as string]: entry.color }} aria-label={entry.name}>
    <div className="participant-card-head">
      <input type="text" aria-label={translate('Name')} value={entry.name} onChange={event => onUpdate({ name: event.target.value })} />
      {status}
      <div className="flex gap-1 ml-auto">
        <button type="button" className="btn btn-quiet btn-small" onClick={onDuplicate} aria-label={translate('Duplicate {agent} with another effort level', { agent: entry.name })}>{translate('Duplicate')}</button>
        <button type="button" className="btn btn-quiet btn-small" onClick={onRemove} disabled={!canRemove} aria-label={translate('Remove {agent}', { agent: entry.name })}>{translate('Remove')}</button>
      </div>
    </div>

    <div className="participant-card-grid">
      <label className="field"><span>{translate('Provider')}</span>
        <select aria-label={translate('Connection for {agent}', { agent: entry.name })} value={!llm ? `baseline:${entry.provider}` : dryRun ? `dry:${entry.provider}` : entry.connectionId ?? ''} onChange={event => chooseSource(event.target.value)}>
          {dryRun ? LLM_CATALOG.map(p => <option key={p.id} value={`dry:${p.id}`}>{translateLabel(p.displayName)}</option>) : <>
          <option value="">{translate('Choose a provider')}</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}{active[p.credentialRef] ? '' : ` — ${translate('no key')}`}</option>)}
          {unconnected.map(p => <option key={p.id} value={`new:${p.id}`}>{translateLabel(p.displayName)}</option>)}
          </>}
          {internalFixturesEnabled() && BASELINE_PROVIDER_IDS.map(id => <option key={id} value={`baseline:${id}`}>{translateLabel(BASELINE_LABELS[id] ?? id)}</option>)}
        </select>
      </label>
      {choosing && <label className="field"><span>{translate('Model')}</span>
        <select aria-label={translate('Model for {agent}', { agent: entry.name })} value={catalogModel ? entry.modelId : '__custom__'}
          onChange={event => onUpdate({ modelId: event.target.value === '__custom__' ? `${entry.provider}:custom-model` : event.target.value, reasoningLevel: undefined, capabilities: undefined })}>
          <optgroup label={translate('Current models')}>{catalogModels.filter(model => !model.legacy).map(model => <option key={model.id} value={model.id}>{translateLabel(model.label)}</option>)}</optgroup>
          {catalogModels.some(model => model.legacy) && <optgroup label={translate('Older models')}>{catalogModels.filter(model => model.legacy).map(model => <option key={model.id} value={model.id}>{translateLabel(model.label)}</option>)}</optgroup>}
          <option value="__custom__">{translate('Custom model ID')}</option>
        </select>
      </label>}
      {choosing && !catalogModel && <label className="field"><span>{translate('Custom model ID')}</span>
        <input type="text" aria-label={translate('Custom model ID for {agent}', { agent: entry.name })} value={entry.modelId} onChange={event => onUpdate({ modelId: event.target.value })} />
      </label>}
      {choosing && <ReasoningControl entry={entry} reasoning={catalogModel?.reasoning} capabilities={caps} onUpdate={onUpdate} />}
    </div>

    <div className="swatches" role="group" aria-label={translate('Color for {agent}', { agent: entry.name })}>
      {PARTICIPANT_COLORS.map(color => { const selected = entry.color.toLowerCase() === color.value; return <button key={color.value} type="button" aria-pressed={selected}
        aria-label={translate('Use {color} for {agent}', { color: translate(color.name), agent: entry.name })} onClick={() => onUpdate({ color: color.value })}>
        <span style={{ ['--swatch' as string]: color.value }} aria-hidden="true">{selected ? '✓' : ''}</span>
      </button>; })}
    </div>

    {llm && profile && !dryRun && <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-small" disabled={busy || !hasKey || !caps} onClick={() => void verify()}
        aria-label={translate('Verify model for {agent} (1 request)', { agent: entry.name })}>{busy ? translate('Verifying…') : translate('Verify · 1 request')}</button>
      <span className="hint">{translate('Sends one paid request with this model and effort. Changing either needs a new check.')}</span>
      {(result?.issue || result?.message) && <p role="alert" className="w-full text-sm text-alert">{result.issue ? formatIssue(result.issue) : formatError(result.message)}</p>}
    </div>}

    {llm && profile && caps && !dryRun && <details>
      <summary className="hint cursor-pointer min-h-11 inline-flex items-center">{translate('Connection details and model capabilities')}</summary>
      <div className="grid gap-3 pt-2">
        <p className="hint break-all">{profile.protocol} · {profile.transport === 'direct' ? profile.endpoint : translate('Via {relay} → {endpoint}', { relay: profile.relayUrl ?? translate('(not configured)'), endpoint: profile.endpoint })}</p>
        <p className="hint">{translate('Published rates')}: {price ? `${price.currency} ${price.inputPerMillion}/${price.outputPerMillion} ${translate('per million input/output tokens')} · ${price.retrievedAt}` : translate('Not available')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-small" disabled={busy || !hasKey} onClick={() => { setBusy(true); setModels([]); setListingError(undefined); void listConnectionModels(profile, active[profile.credentialRef] ?? '', profile.relayCredentialRef ? active[profile.relayCredentialRef] : undefined).then(setModels).catch(error => setListingError(errorIssue(error))).finally(() => setBusy(false)); }}>{translate('Load model IDs (first page)')}</button>
          {models.length > 0 && <label className="field"><span>{translate('Listed models (not verified)')}</span><select value="" onChange={event => onUpdate({ modelId: event.target.value, reasoningLevel: undefined })}><option value="">{translate('Select a listed model')}</option>{models.map(id => <option key={id}>{id}</option>)}</select></label>}
        </div>
        {listingError && <p role="alert" className="text-sm text-alert">{formatError(listingError)}</p>}
        <div className="participant-card-grid">
          <label className="field"><span>{translate('Output')}</span><select aria-label={translate('Output format for {agent}', { agent: entry.name })} value={caps.output} onChange={event => changeCaps({ output: event.target.value as ModelCapabilities['output'] })}><option value="text-json">{translate('Validated text JSON')}</option><option value="json-object">{translate('JSON object mode')}</option><option value="json-schema">{translate('Structured JSON schema')}</option></select></label>
          <label className="field"><span>{translate('Model output-token ceiling')}</span><input type="number" min={32} max={1000000} value={caps.maxOutputTokens} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 32 && value <= 1000000) changeCaps({ maxOutputTokens: value }); }} /></label>
          {profile.protocol === 'chat-completions' && <label className="field"><span>{translate('Token parameter')}</span><select value={caps.tokenParameter} onChange={event => changeCaps({ tokenParameter: event.target.value as ModelCapabilities['tokenParameter'] })}><option>{translate('max_tokens')}</option><option>{translate('max_completion_tokens')}</option></select></label>}
        </div>
        <label className="flex items-center gap-2 text-sm min-h-11"><input type="checkbox" checked={caps.temperature} onChange={event => changeCaps({ temperature: event.target.checked })} />{translate('Accepts temperature')}</label>
      </div>
    </details>}
  </article>;
}
