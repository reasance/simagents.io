import { translateLabel, useLocale, translate } from '../../i18n';

import { RelayAccessButton } from '../RelaySessionGate';
import { admissionConfig, useRelaySession } from '../../services/relay-access';
import { migrateLegacyRuntime } from '../../services/migrate-legacy-runtime';
import { assertOfficialRelay, officialRelayUrl } from '../../services/official-relay';
import { useState } from 'react';
import { defaultConnection, PROVIDER_DEFINITIONS, PROTOCOLS, validateConnectionProfile, type ConnectionProfile, type LLMType } from '@simagents/shared';
import { useConnectionsStore } from '../../stores/connections';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useRosterStore } from '../../stores/roster';
import { useProxyUrl } from '../../stores/settings';

export function ConnectionsConfig({ onSaved }: { onSaved?: (profile: ConnectionProfile) => void } = {}) {
  useLocale();
  useRelaySession();
  const autonomousAccess = !!admissionConfig();
  const { profiles, save, remove, migrationError } = useConnectionsStore();
  const keys = useApiKeysStore();
  const relay = useProxyUrl();
  const [draft, setDraft] = useState<ConnectionProfile | undefined>();
  const [secret, setSecret] = useState('');
  const officialUrl = officialRelayUrl();
  const [error, setError] = useState('');
  const input = 'input';
  const button = 'btn btn-small';
  const definition = PROVIDER_DEFINITIONS.find((p) => p.id === draft?.providerId);
  function add(provider: LLMType = 'codex') {
    const id = `connection:${crypto.randomUUID()}`;
    setDraft({ ...defaultConnection(provider, relay), id, credentialRef: id }); setSecret(''); setError('');
  }
  async function apply() {
    try {
      const profile = validateConnectionProfile(draft);
      assertOfficialRelay(profile);
      if (secret.trim()) {
        await keys.setCredential(profile.credentialRef, secret);
        if (useApiKeysStore.getState().error) throw new Error(useApiKeysStore.getState().error!);
      }
      save(profile);
      onSaved?.(profile);
      const roster = useRosterStore.getState();
      roster.roster.forEach((entry, index) => { if (entry.connectionId === profile.id && entry.provider !== profile.providerId) roster.updateEntry(index, { provider: profile.providerId as LLMType, connectionId: profile.id, modelId: entry.modelId }); });
      setDraft(undefined); setSecret(''); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Invalid connection'); }
  }
  return <div className="grid gap-3 pt-2">
    <p className="hint m-0">{translate("Create independent connections with their own credentials, endpoint and protocol. Select a connection on each agent, then explicitly verify its model. Custom endpoints use direct access or your own relay; official relay access is available only when this build has an operator-configured relay URL.")}</p>
    {migrationError && <div role="alert" className="notice">{migrationError}<button className={`${button} ml-2`} onClick={migrateLegacyRuntime}>{translate("Retry settings conversion")}</button></div>}
    <button className={button} onClick={() => add()}>{translate("Add connection")}</button>
    {profiles.map((profile) => <div key={profile.id} className="flex flex-wrap items-center gap-2 text-sm">
      <span>{profile.name} · {profile.protocol}</span>
      <button className={button} onClick={() => { setDraft(profile); setSecret(''); setError(''); }}>{translate("Edit")}{" "}{profile.name}</button>
      <button className={button} onClick={() => { try { remove(profile.id); } catch { setError('Unable to remove connection metadata'); } }}>{translate("Remove")}{" "}{profile.name}</button>
    </div>)}
    {draft && <div className="grid gap-3 surface p-4">
      <label className="field"><span>{translate("Connection name")}</span><input aria-label={translate("Connection name")} className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="field"><span>{translate("Provider")}</span><select aria-label={translate("Connection provider")} className={input} value={draft.providerId} onChange={(e) => { const next = defaultConnection(e.target.value as LLMType, relay); setDraft({ ...next, id: draft.id, credentialRef: draft.credentialRef }); }}>
        {PROVIDER_DEFINITIONS.map((p) => <option key={p.id} value={p.id}>{translateLabel(p.label)}</option>)}
      </select></label>
      <label className="field"><span>{translate("Protocol")}</span><select aria-label={translate("Connection protocol")} className={input} value={draft.protocol} onChange={(e) => setDraft({ ...draft, protocol: e.target.value as ConnectionProfile['protocol'] })}>
        {PROTOCOLS.map((p) => <option key={p}>{p}</option>)}
      </select></label>
      {definition && <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setDraft({ ...draft, endpoint: definition.endpoint, protocol: definition.protocol })}>{translate("Standard endpoint")}</button>
        {definition.variants.map((variant) => <button key={variant.endpoint} className={button} onClick={() => setDraft({ ...draft, endpoint: variant.endpoint, protocol: variant.protocol ?? draft.protocol })}>{translateLabel(variant.label)}</button>)}
      </div>}
      <label className="field"><span>{translate("Endpoint")}</span><input aria-label={translate("Connection endpoint")} className={input} value={draft.endpoint} onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })} /></label>
      <p className="hint m-0">{translate("Enter the full inference URL. For Gemini, enter the URL ending in /models. Regional or workspace-specific URLs can be entered here; use credentials for that region and plan.")}</p>
      <label className="field"><span>{translate("Transport")}</span><select aria-label={translate("Connection transport")} className={input} value={draft.transport} onChange={(e) => setDraft({ ...draft, transport: e.target.value as ConnectionProfile['transport'], ...(e.target.value === 'official-relay' ? { relayUrl: officialUrl, relayCredentialRef: 'relay:access' } : {}) })}><option value="direct">{translate("Direct to provider")}</option><option value="user-relay">{translate("Your relay")}</option><option value="official-relay" disabled={!autonomousAccess}>{translate("Official relay")}{" "}{!autonomousAccess ? " " + translate("(not configured)") : ""}</option></select></label>
      {draft.transport === 'user-relay' && <label className="field"><span>{translate("Relay URL")}</span><input aria-label={translate("Connection relay")} className={input} value={draft.relayUrl ?? ''} onChange={(e) => setDraft({ ...draft, relayUrl: e.target.value })} /></label>}
      {draft.transport === 'official-relay' && <div className="grid gap-2 text-sm">
        <p className="break-all">{translate("Requests, keys and responses transit")}{" "}{officialUrl}{translate(". This relay accepts approved provider endpoints. Access is temporary and requires no account.")}</p>
        <RelayAccessButton />
      </div>}
      <label className="field"><span>{translate("API key (session only)")}</span><input aria-label={translate("Connection API key")} type="password" autoComplete="off" className={input} value={secret} placeholder={keys.getActiveKeys()[draft.credentialRef] ? translate("Credential already in memory; leave empty to retain it") : translate("Enter API key")} onChange={(e) => setSecret(e.target.value)} /></label>
      <p className="hint m-0">{translate("Keys remain in memory. Use the encrypted vault controls to save them on this device. Changes apply when starting a new simulation. Removing a profile leaves its credential in the vault.")}</p>
      {keys.getActiveKeys()[draft.credentialRef] && <button className={button} disabled={keys.isLoading} onClick={() => void keys.setCredential(draft.credentialRef, '')}>{translate("Clear connection session key")}</button>}
      <button className={button} disabled={keys.isLoading} onClick={() => void apply()}>{translate("Save connection")}</button>
      <button className={button} onClick={() => { setDraft(undefined); setSecret(''); }}>{translate("Cancel connection edit")}</button>
    </div>}
    {error && <p role="alert" className="text-sm text-alert">{error}</p>}
  </div>;
}
