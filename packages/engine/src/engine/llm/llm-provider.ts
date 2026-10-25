import { sanitizeRequestTrace, type RequestTrace } from './request-trace';
import { AppError, relayErrorIssue, getDefaultModelId, type LLMType, type ReasoningLevel, type ConnectionProfile, type ModelCapabilities } from '@simagents/shared';
import { buildFinalPromptWithMemories } from '../../llm/prompt-builder';
import { parseResponse } from '../../llm/response-parser';
import type { AgentObservation } from '../../llm/types';
import { toActionDecision, type ActionDecision, type DecisionContext, type DecisionProvider } from '../decision';
import { normalizeDecisionText } from './protocol-adapters';
import { ProviderRequestError, boundedProviderJson, classifyProviderStatus, isTruncatedResponse } from './provider-error';
import type { RequestBudget } from './request-budget';
import { buildProviderRequest, type ProviderPrompt } from './request-builder';
import { extractProviderResponse } from './response-extractor';

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;
export const DECISION_SYSTEM_PROMPT =
  'You are choosing one simulation action. Return only the JSON object requested by the simulation prompt.';

export interface LLMDecisionProviderConfig {
  onTrace?: (trace: RequestTrace) => void;
  traceSecrets?: string[];
  budget?: RequestBudget;
  relayAccessToken?: string;
  getRelayAccessToken?: () => string | undefined;
  connection?: ConnectionProfile;
  capabilities?: ModelCapabilities;
  connectionId?: string;
  provider: LLMType;
  modelId?: string;
  reasoningLevel?: ReasoningLevel;
  apiKey: string;
  proxyUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export class LLMDecisionProvider implements DecisionProvider {
  readonly kind: LLMType;

  constructor(private readonly config: LLMDecisionProviderConfig) {
    this.kind = config.provider;
  }

  async decide(ctx: DecisionContext, signal: AbortSignal): Promise<ActionDecision> {
    if (signal.aborted) throw new DOMException('Decision aborted', 'AbortError');

    const observation = ctx.observation as AgentObservation;
    const personality = observation.self?.personality ?? ctx.agent.personality ?? null;
    const userPrompt = await buildFinalPromptWithMemories(
      ctx.agent.id,
      observation,
      personality as AgentObservation['self']['personality']
    );

    return this.decideWithPrompt({ system: DECISION_SYSTEM_PROMPT, user: userPrompt }, signal, { agentId: ctx.agent.id, tick: observation.tick });
  }

  /** Explicit connection probes reuse the production transport without running world actions. */
  async decideWithPrompt(prompt: ProviderPrompt, signal: AbortSignal, traceContext?: { agentId: string; tick: number }): Promise<ActionDecision> {
    const release = await this.config.budget?.acquire(this.config.connectionId ?? this.config.provider, signal);
    let relayAccessToken: string | undefined;
    let trace: RequestTrace | undefined;
    try {
      if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      // Read after queue admission so queued requests use the renewed token.
      relayAccessToken = this.config.getRelayAccessToken ? this.config.getRelayAccessToken() : this.config.relayAccessToken;
      const request = buildProviderRequest({
        provider: this.config.provider,
        connection: this.config.connection,
        relayAccessToken,
        capabilities: this.config.capabilities,
        modelId: this.config.modelId ?? getDefaultModelId(this.config.provider),
        reasoningLevel: this.config.reasoningLevel,
        apiKey: this.config.apiKey,
        prompt,
        maxTokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: this.config.temperature ?? DEFAULT_TEMPERATURE,
        proxyUrl: this.config.proxyUrl,
      });
      if (this.config.onTrace && traceContext) trace = {
        ...traceContext, requestId: crypto.randomUUID(), protocol: request.protocol ?? 'chat-completions',
        requestedModel: this.config.modelId ?? getDefaultModelId(this.config.provider), connectionId: this.config.connectionId,
        startedAt: Date.now(), durationMs: 0, outcome: 'failed', requestBody: JSON.stringify(request.body), truncated: false, redacted: false,
      };
      const captureText = trace ? (text: string) => { trace!.responseBody = text; } : undefined;
      let response: Response;
      try {
        response = await fetch(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(request.body),
          signal,
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ProviderRequestError('network', this.config.provider);
      }

      if (trace) trace.status = response.status;
      if (!response.ok && this.config.connection?.transport === 'official-relay' && response.headers.has('X-Simagents-Relay-Error')) {
        throw new AppError(relayErrorIssue(response.headers.get('X-Simagents-Relay-Error')));
      }
      if (!response.ok) {
        const details = await boundedProviderJson(response, 65536, captureText).catch(() => undefined);
        throw new ProviderRequestError(classifyProviderStatus(response.status, details), this.config.provider, response.status);
      }
      let json: unknown;
      try { json = await boundedProviderJson(response, undefined, captureText); }
      catch { throw new ProviderRequestError('incompatible', this.config.provider); }
      if (isTruncatedResponse(json)) throw new ProviderRequestError('incompatible', this.config.provider);
      const extracted = extractProviderResponse(this.config.provider, json, request.protocol);
      let text: string;
      try { text = normalizeDecisionText(extracted.text, this.config.capabilities?.output === 'json-schema'); }
      catch { throw new ProviderRequestError('incompatible', this.config.provider); }
      const parsed = parseResponse(text);
      if (!parsed) {
        throw new ProviderRequestError('incompatible', this.config.provider);
      }

      const decision = toActionDecision(parsed);
      const responseData = json && typeof json === 'object' ? json as Record<string, unknown> : {};
      const reportedModel = responseData.model ?? responseData.modelVersion;
      decision.telemetry = {
        pricingContext: this.config.connection ? { providerId: this.config.provider, modelId: usedModelId(request.body, this.config.modelId ?? getDefaultModelId(this.config.provider)), endpoint: this.config.connection.endpoint } : undefined,
        costEligible: extracted.costEligible === true,
        ...(this.config.reasoningLevel !== undefined ? { effort: String(this.config.reasoningLevel) } : {}),
        modelId: typeof reportedModel === 'string' && reportedModel.length > 0 && reportedModel.length <= 500
          ? reportedModel : usedModelId(request.body, this.config.modelId ?? getDefaultModelId(this.config.provider)),
        tokens: extracted.usage
          ? {
              input: extracted.usage.inputTokens,
              output: extracted.usage.outputTokens,
            }
          : undefined,
      };
      if (trace) trace.outcome = 'success';
      return decision;
    } catch (error) {
      if (trace) {
        trace.outcome = signal.aborted ? 'aborted' : 'failed';
        trace.errorCode = signal.aborted ? 'aborted' : error instanceof ProviderRequestError ? error.code : 'relay-or-transport';
      }
      throw error;
    } finally {
      if (trace) {
        trace.durationMs = Math.max(0, Date.now() - trace.startedAt);
        // Diagnostics must never change the result of an inference request.
        try { this.config.onTrace?.(sanitizeRequestTrace(trace, [this.config.apiKey, relayAccessToken ?? '', this.config.relayAccessToken ?? '', ...(this.config.traceSecrets ?? [])])); } catch { /* Collector failure is isolated. */ }
      }
      release?.();
    }
  }
}

function usedModelId(body: Record<string, unknown>, fallback: string): string {
  return typeof body.model === 'string' ? body.model : fallback;
}
