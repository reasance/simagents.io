import { useState } from 'react';
import { approvedRelayDestination, defaultConnection, isDecisionProtocol, LLM_CATALOG, type ConnectionProfile, type LLMType, type TextProtocol } from '@simagents/shared';
import { translate, translateLabel, useLocale } from '../../i18n';
import { formatError } from '../../i18n/errors';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useConnectionsStore } from '../../stores/connections';
import { useProxyUrl, useSettingsStore } from '../../stores/settings';
import { useRosterStore } from '../../stores/roster';
import { admissionConfig } from '../../services/relay-access';
import { officialRelayUrl } from '../../services/official-relay';
import { RelayAccessButton } from '../RelaySessionGate';

type Route = 'direct' | 'official-relay' | 'user-relay';
const OFFICIAL_RELAY_CREDENTIAL = 'relay:access';

/** The connection a provider key uses when nothing custom was set up. */
function providerConnection(providerId: LLMType, route: Route, relayUrl: string): ConnectionProfile {
  const base = defaultConnection(providerId, relayUrl);
  if (route === 'direct') return { ...base, transport: 'direct', relayUrl: undefined };
  if (route === 'official-relay') return { ...base, transport: 'official-relay', relayUrl: officialRelayUrl(), relayCredentialRef: OFFICIAL_RELAY_CREDENTIAL };
  return { ...base, transport: 'user-relay', relayUrl };
}

function routesFor(providerId: LLMType): Route[] {
  const base = defaultConnection(providerId);
  const routes: Route[] = [];
  if (LLM_CATALOG.find(p => p.id === providerId)?.cors === 'direct' && !isDecisionProtocol(base.protocol)) routes.push('direct');
  if (admissionConfig() && !isDecisionProtocol(base.protocol) && approvedRelayDestination(providerId, base.protocol as TextProtocol, base.endpoint)) routes.push('official-relay');
  routes.push('user-relay');
  return routes;
}

const ROUTE_LABELS: Record<Route, 'Direct from this browser' | 'Official relay' | 'Your relay'> = {
  direct: 'Direct from this browser', 'official-relay': 'Official relay', 'user-relay': 'Your relay',
};

function KeyRow({ providerId }: { providerId: LLMType }) {
  useLocale();
  const provider = LLM_CATALOG.find(p => p.id === providerId)!;
  const keys = useApiKeysStore();
  const { profiles, save } = useConnectionsStore();
  const relayUrl = useProxyUrl();
  const existing = profiles.find(p => p.id === `provider:${providerId}`);
  const routes = routesFor(providerId);
  const [route, setRoute] = useState<Route>((existing?.transport as Route | undefined) ?? routes[0]);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const stored = keys.getActiveKeys()[providerId];
  const needsRelayUrl = route === 'user-relay' && !relayUrl.trim();
  const decision = isDecisionProtocol(defaultConnection(providerId).protocol);

  async function apply(nextRoute = route) {
    setError('');
    try {
      if (secret.trim()) {
        await keys.setCredential(providerId, secret);
        const failure = useApiKeysStore.getState().error;
        if (failure) throw new Error(failure);
      }
      const connection = providerConnection(providerId, nextRoute, relayUrl.trim());
      save(connection);
      // Participants of this provider that have no connection yet start using this key.
      const roster = useRosterStore.getState();
      roster.roster.forEach((entry, index) => {
        if (!entry.connectionId && entry.provider === providerId) roster.updateEntry(index, { connectionId: connection.id, provider: providerId, modelId: entry.modelId });
      });
      setSecret('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid connection'); }
  }

  return <div className="key-row">
    <div>
      <strong>{translateLabel(provider.displayName)}</strong>
      <span className="hint">{decision ? translate('Decision model: chooses among actions, cannot speak') : stored ? translate('Key in this tab ({masked})', { masked: `••••${stored.slice(-4)}` }) : translate('No key yet')}</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input className="input" type="password" autoComplete="off" aria-label={translate('API key for {provider}', { provider: translateLabel(provider.displayName) })}
        placeholder={stored ? translate('Replace the key in this tab') : translate('Paste API key')} value={secret} onChange={event => setSecret(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && secret.trim() && !needsRelayUrl) void apply(); }} />
      {routes.length > 1 ? <select className="input" aria-label={translate('Route for {provider}', { provider: translateLabel(provider.displayName) })} value={route}
        onChange={event => { const next = event.target.value as Route; setRoute(next); if (stored && !(next === 'user-relay' && !relayUrl.trim())) void apply(next); }}>
        {routes.map(option => <option key={option} value={option}>{translate(ROUTE_LABELS[option])}</option>)}
      </select> : <span className="hint self-center">{translate(ROUTE_LABELS[route])}</span>}
      {needsRelayUrl && <p className="hint sm:col-span-2">{translate('This provider does not accept calls from a browser. Enter your relay URL above.')}</p>}
      {route === 'official-relay' && stored && <div className="sm:col-span-2"><RelayAccessButton /></div>}
      {error && <p role="alert" className="text-sm text-alert sm:col-span-2">{formatError(error)}</p>}
    </div>
    <div className="flex gap-2 justify-end">
      <button type="button" className="btn btn-small" disabled={keys.isLoading || !secret.trim() || needsRelayUrl} onClick={() => void apply()}>{translate('Save key')}</button>
      {stored && <button type="button" className="btn btn-quiet btn-small" disabled={keys.isLoading} onClick={() => void keys.setCredential(providerId, '')} aria-label={translate('Remove key for {provider}', { provider: translateLabel(provider.displayName) })}>{translate('Remove')}</button>}
    </div>
  </div>;
}

/** Step one: one key per provider. Each key gets a standard connection automatically. */
export function ProviderKeys() {
  useLocale();
  const relayUrl = useProxyUrl();
  const setRelayUrl = useSettingsStore(s => s.setProxyUrl);
  const { profiles, save } = useConnectionsStore();
  const updateRelay = (value: string) => {
    setRelayUrl(value);
    // Standard connections that go through the user's relay follow the new URL once it is valid.
    for (const profile of profiles) {
      if (profile.id.startsWith('provider:') && profile.transport === 'user-relay') {
        try { save({ ...profile, relayUrl: value.trim() }); } catch { /* Keep the last valid URL until the new one is complete. */ }
      }
    }
  };
  return <div className="grid gap-2">
    <label className="field max-w-xl"><span>{translate('Your relay URL (optional)')}</span>
      <input type="url" value={relayUrl} placeholder="https://relay.example.com" onChange={event => updateRelay(event.target.value)} />
      <span className="hint">{translate('Needed only for providers that do not accept calls from a browser, and for Jev and Sage.')}</span>
    </label>
    <div>{LLM_CATALOG.map(provider => <KeyRow key={provider.id} providerId={provider.id} />)}</div>
  </div>;
}
