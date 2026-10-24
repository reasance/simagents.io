import { assertOfficialRelay } from './official-relay';
import { registerCredentialRequest } from './credential-requests';
import { AppError, isDecisionProtocol, relayErrorIssue, validateConnectionProfile, type ConnectionProfile } from '@simagents/shared';
import { boundedProviderJson, classifyProviderStatus, ProviderRequestError } from '@simagents/engine/engine/llm/provider-error';
/** Explicit first-page listing. Lack of a listing never blocks a manually entered model ID. */
export async function listConnectionModels(input: ConnectionProfile, key: string, relayAccessToken?: string): Promise<string[]> {
  const profile = validateConnectionProfile(input);
  assertOfficialRelay(profile);
  if (!key.trim()) throw new Error('Enter or unlock the connection credential');
  if (isDecisionProtocol(profile.protocol)) throw new Error('Model listing is unavailable for decision models; enter a model ID manually');
  const suffix = profile.protocol === 'openai-responses' ? '/responses' : profile.protocol === 'chat-completions' ? '/chat/completions' : '/messages';
  let url = profile.endpoint;
  if (profile.protocol !== 'gemini-generate-content') {
    if (!url.endsWith(suffix)) throw new Error('Model listing is unavailable for this custom path; enter a model ID manually');
    url = url.slice(0, -suffix.length) + '/models';
  }
  if (profile.transport === 'user-relay') url = `${profile.relayUrl}/${url.slice('https://'.length)}`;
  let headers: Record<string, string> = profile.protocol === 'gemini-generate-content' ? { 'x-goog-api-key': key }
    : profile.protocol === 'anthropic-messages' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    : { Authorization: `Bearer ${key}` };
  let requestBody: string | undefined;
  if (profile.transport === 'official-relay') {
    if (!relayAccessToken) throw new Error('Enter or unlock the official relay access token');
    url = `${profile.relayUrl}/v1/models`;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${relayAccessToken}`, 'X-Provider-Key': key };
    requestBody = JSON.stringify({ providerId: profile.providerId, protocol: profile.protocol, endpoint: profile.endpoint });
  }
  const controller = new AbortController();
  const unregister = registerCredentialRequest(controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { method: requestBody ? 'POST' : 'GET', body: requestBody, headers, signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!response.ok && profile.transport === 'official-relay' && response.headers.has('X-Simagents-Relay-Error')) throw new AppError(relayErrorIssue(response.headers.get('X-Simagents-Relay-Error')));
    if (!response.ok) throw new ProviderRequestError(classifyProviderStatus(response.status), profile.providerId, response.status);
    const body = await boundedProviderJson(response) as { data?: unknown; models?: unknown };
    const rows = profile.protocol === 'gemini-generate-content' ? body.models : body.data;
    if (!Array.isArray(rows)) throw new Error('Model list format is incompatible; enter a model ID manually');
    return [...new Set(rows.slice(0, 500).map((row: { id?: unknown; name?: unknown }) => profile.protocol === 'gemini-generate-content' ? row?.name : row?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 500)
      .map((id) => profile.protocol === 'gemini-generate-content' ? id.replace(/^models\//, '') : id))];
  } finally { unregister(); clearTimeout(timer); }
}
