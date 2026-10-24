/** Content-free error transport between the Worker and the SPA. */
export type AppErrorCode =
  | 'PROVIDER_CREDENTIALS' | 'PROVIDER_QUOTA' | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_INCOMPATIBLE' | 'PROVIDER_NETWORK'
  | 'RELAY_WARMING' | 'RELAY_ACCESS' | 'RELAY_RATE_LIMIT' | 'RELAY_SIZE_LIMIT' | 'RELAY_TIMEOUT' | 'RELAY_REQUEST_REJECTED' | 'RELAY_UNAVAILABLE'
  | 'REQUEST_LIMIT' | 'DURATION_LIMIT' | 'SESSION_ENDED' | 'INVALID_SNAPSHOT' | 'VERSION_MISMATCH'
  | 'SAVED_WORLD_READ' | 'STORAGE_BUDGET' | 'STORAGE_QUOTA' | 'STORAGE_UNAVAILABLE' | 'STORAGE_BLOCKED' | 'STORAGE_CORRUPT' | 'COLLECTION_PAUSED' | 'COLLECTION_BACKPRESSURE' | 'MIGRATION_INVALID'
  | 'EXPERIMENT_BUSY' | 'VAULT_BUSY' | 'ENGINE_TIMEOUT' | 'ENGINE_RESET' | 'CANCELLED' | 'INTERNAL_ERROR' | 'EXPORT_FAILED'
  | 'VAULT_PASSPHRASE' | 'VAULT_UNLOCK' | 'VAULT_CHANGED' | 'VAULT_LOCKED'
  | 'BYOK_AGENT_REQUIRED' | 'BYOK_INTERNAL' | 'BYOK_CONNECTION' | 'BYOK_RELAY_TOKEN' | 'BYOK_PROVIDER_MISMATCH' | 'BYOK_KEY' | 'BYOK_MODEL' | 'BYOK_CONFIGURATION' | 'BYOK_MIGRATION' | 'BYOK_PROVIDER_KEY' | 'BYOK_RELAY_URL' | 'MODEL_VERIFY_REQUIRED' | 'AGENT_UNRESPONSIVE';
export interface AppIssue { code: AppErrorCode; parameters?: Record<string, string | number> }
const providerCodes: Record<string, AppErrorCode> = { credentials: 'PROVIDER_CREDENTIALS', quota: 'PROVIDER_QUOTA', 'rate-limit': 'PROVIDER_RATE_LIMIT', unavailable: 'PROVIDER_UNAVAILABLE', incompatible: 'PROVIDER_INCOMPATIBLE', network: 'PROVIDER_NETWORK' };
const codes: AppErrorCode[] = ['RELAY_WARMING', 'RELAY_ACCESS', 'RELAY_RATE_LIMIT', 'RELAY_SIZE_LIMIT', 'RELAY_TIMEOUT', 'RELAY_REQUEST_REJECTED', 'RELAY_UNAVAILABLE', ...Object.values(providerCodes), 'REQUEST_LIMIT', 'DURATION_LIMIT', 'SESSION_ENDED', 'INVALID_SNAPSHOT', 'VERSION_MISMATCH', 'SAVED_WORLD_READ', 'STORAGE_BUDGET', 'STORAGE_QUOTA', 'STORAGE_UNAVAILABLE', 'STORAGE_BLOCKED', 'STORAGE_CORRUPT', 'COLLECTION_PAUSED', 'COLLECTION_BACKPRESSURE', 'MIGRATION_INVALID', 'EXPERIMENT_BUSY', 'VAULT_BUSY', 'ENGINE_TIMEOUT', 'ENGINE_RESET', 'CANCELLED', 'INTERNAL_ERROR', 'EXPORT_FAILED', 'VAULT_PASSPHRASE', 'VAULT_UNLOCK', 'VAULT_CHANGED', 'VAULT_LOCKED', 'BYOK_AGENT_REQUIRED', 'BYOK_INTERNAL', 'BYOK_CONNECTION', 'BYOK_RELAY_TOKEN', 'BYOK_PROVIDER_MISMATCH', 'BYOK_KEY', 'BYOK_MODEL', 'BYOK_CONFIGURATION', 'BYOK_MIGRATION', 'BYOK_PROVIDER_KEY', 'BYOK_RELAY_URL', 'MODEL_VERIFY_REQUIRED', 'AGENT_UNRESPONSIVE'];
export function isAppIssue(value: unknown): value is AppIssue {
  if (!value || typeof value !== 'object') return false;
  const issue = value as AppIssue;
  return codes.includes(issue.code) && (issue.parameters === undefined || (!!issue.parameters && typeof issue.parameters === 'object' && !Array.isArray(issue.parameters) &&
    Object.entries(issue.parameters).every(([key, item]) => !['constructor', 'prototype', '__proto__'].includes(key) && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) && ((typeof item === 'string' && item.length <= 512) || (typeof item === 'number' && Number.isFinite(item))))));
}
export class AppError extends Error {
  constructor(readonly issue: AppIssue, message: string = issue.code) { super(message); this.name = 'AppError'; }
}
/** Classify trusted engine failures without forwarding their stack, message or payload. */
export function errorIssue(error: unknown): AppIssue {
  if (error instanceof AppError) return { code: error.issue.code, ...(error.issue.parameters ? { parameters: { ...error.issue.parameters } } : {}) };
  const value = error && typeof error === 'object' ? error as { code?: unknown; name?: unknown; provider?: unknown; status?: unknown; message?: unknown; issue?: unknown } : {};
  if (isAppIssue(value.issue)) return { code: value.issue.code, ...(value.issue.parameters ? { parameters: { ...value.issue.parameters } } : {}) };
  if (typeof value.code === 'string' && codes.includes(value.code as AppErrorCode)) return { code: value.code as AppErrorCode };
  if (typeof value.code === 'string' && providerCodes[value.code]) {
    const parameters: Record<string, string | number> = {};
    if (typeof value.provider === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value.provider)) parameters.provider = value.provider;
    if (typeof value.status === 'number' && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) parameters.status = value.status;
    return { code: providerCodes[value.code], parameters };
  }
  if (value.code === 'request-limit') return { code: 'REQUEST_LIMIT' };
  if (value.code === 'duration-limit') return { code: 'DURATION_LIMIT' };
  if (value.code === 'session-ended') return { code: 'SESSION_ENDED' };
  const message = typeof value.message === 'string' ? value.message : typeof error === 'string' ? error : '';
  if (value.name === 'QuotaExceededError') return { code: 'STORAGE_QUOTA' };
  if (value.name === 'AbortError' || /cancelled|aborted/i.test(message)) return { code: 'CANCELLED' };
  if (/experiment is running/i.test(message)) return { code: 'EXPERIMENT_BUSY' };
  if (/credential operation.*running/i.test(message)) return { code: 'VAULT_BUSY' };
  if (/passphrase.*12|passphrase.*required/i.test(message)) return { code: 'VAULT_PASSPHRASE' };
  if (/wrong passphrase|incorrect passphrase|damaged vault|decrypt|corrupt.*vault/i.test(message)) return { code: 'VAULT_UNLOCK' };
  if (/vault.*changed|archive.*changed/i.test(message)) return { code: 'VAULT_CHANGED' };
  if (/vault.*locked|locked.*vault/i.test(message)) return { code: 'VAULT_LOCKED' };
  if (/saved world could not be read/i.test(message)) return { code: 'SAVED_WORLD_READ' };
  if (/request budget.*exhausted/i.test(message)) return { code: 'REQUEST_LIMIT' };
  if (/session duration limit/i.test(message)) return { code: 'DURATION_LIMIT' };
  if (/local data budget|exceeds.*storage budget/i.test(message)) return { code: 'STORAGE_BUDGET' };
  if (/close other.*tabs/i.test(message)) return { code: 'STORAGE_BLOCKED' };
  if (/accounting.*invalid|stored application data.*invalid/i.test(message)) return { code: 'STORAGE_CORRUPT' };
  if (/storage cannot keep up/i.test(message)) return { code: 'COLLECTION_BACKPRESSURE' };
  if (/legacy|migration/i.test(message)) return { code: 'MIGRATION_INVALID' };
  if (/imported file|imported event|snapshot/i.test(message)) return { code: 'INVALID_SNAPSHOT' };
  if (/timed out/i.test(message)) return { code: 'ENGINE_TIMEOUT' };
  if (/worker reset/i.test(message)) return { code: 'ENGINE_RESET' };
  if (/response.*size limit|invalid json|truncated|invalid.*response|incomplete.*response/i.test(message)) return { code: 'PROVIDER_INCOMPATIBLE' };
  if (/indexeddb|storage.*unavailable|local.*write.*failed/i.test(message)) return { code: 'STORAGE_UNAVAILABLE' };
  return { code: 'INTERNAL_ERROR' };
}
