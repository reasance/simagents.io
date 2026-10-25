#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateConnectionProfile, ModelCapabilitiesSchema, PROVIDER_DEFINITIONS, isDecisionProtocol } from '../packages/shared/src/connections.ts';
const manifest = JSON.parse(await readFile('docs/provider-verification-manifest.json', 'utf8'));
const fail = message => { throw new Error(`Provider manifest: ${message}`); };
if (manifest.schemaVersion !== 1 || manifest.status !== 'draft-not-authorized' || manifest.approval !== null || manifest.budget.authorizedMaximum !== null) fail('this checker covers the unexecuted draft only; it cannot authorize traffic');
const providers = new Set(manifest.combinations.map(row => row.providerId));
// Decision models (Jev, Sage) are not carried by the official relay this campaign exercises.
const textProviders = PROVIDER_DEFINITIONS.filter(row => !isDecisionProtocol(row.protocol)).map(row => row.id).sort();
if (textProviders.length !== 11 || [...providers].sort().join(',') !== textProviders.join(',')) fail('minimum provider inventory is incomplete');
if (manifest.combinations.length !== 12 || manifest.combinations.filter(row => row.providerId === 'codex').map(row => row.protocol).sort().join(',') !== 'chat-completions,openai-responses') fail('both OpenAI protocols are required');
const ids = new Set(), calls = new Set();
for (const row of manifest.combinations) {
  if (ids.has(row.id)) fail('duplicate row'); ids.add(row.id);
  validateConnectionProfile({ id: row.id, name: row.id, providerId: row.providerId, protocol: row.protocol, endpoint: row.endpoint, credentialRef: row.credentialReference, transport: row.transport, relayUrl: 'https://unconfigured-staging.example', relayCredentialRef: 'relay:staging' });
  ModelCapabilitiesSchema.parse(row.capabilities);
  if (row.verification.status !== 'unverified' || row.verification.verifiedAt !== null) fail('draft has claimed executed evidence');
  if (row.calls.length !== 4 || row.calls[0].kind !== 'connection-probe' || row.calls.slice(1).some(call => call.kind !== 'simulation-decision')) fail('each row needs a probe and three world decisions');
  for (const call of row.calls) { if (calls.has(call.attemptId) || call.status !== 'not-authorized') fail('invalid attempt identity/authority'); calls.add(call.attemptId); }
  const price = row.pricing;
  if (price.currency !== 'USD' || !/^https:\/\//.test(price.source) || !/^\d{4}-\d{2}-\d{2}$/.test(price.retrievedAt) || ![price.inputPerMillion,price.outputPerMillion].every(value => Number.isFinite(value) && value >= 0)) fail('pricing provenance is incomplete');
}
if (calls.size !== 48 || manifest.budget.maximumInferenceAttempts !== 48 || !manifest.budget.stopOnFirstError || manifest.budget.automaticRetries !== 0 || manifest.budget.automaticFallbacks !== 0) fail('campaign bounds changed');
const promptHash = createHash('sha256').update(manifest.worldProtocol.customPrompt).digest('hex');
if (promptHash !== manifest.worldProtocol.customPromptSha256) fail('prompt changed without a new manifest');
console.log('Draft validated: 11 providers, 12 combinations, 48 unexecuted/unapproved attempts; no network calls.');
