import type { LLMType } from './types';

export type AuthStyle = 'bearer' | 'x-api-key' | 'google-key';
export type CorsMode = 'direct' | 'proxy';

export type ReasoningCapability =
  | { kind: 'none' }
  | { kind: 'effort'; levels: string[]; default?: string }
  | { kind: 'budget'; min: number; max: number; default: number }
  | { kind: 'toggle' }
  | { kind: 'model-swap'; reasoningModelId: string };

export interface ModelCatalogEntry {
  id: string;
  label: string;
  reasoning: ReasoningCapability;
  /** Vendor documentation page the id and reasoning controls were checked against. */
  source: string;
  /** ISO date of that check. */
  verifiedAt: string;
  /** Still served by the vendor but superseded; kept so saved rosters keep their capabilities. */
  legacy?: boolean;
}

export interface ProviderCatalogEntry {
  id: LLMType;
  displayName: string;
  endpoint: string;
  authStyle: AuthStyle;
  cors: CorsMode;
  docsUrl: string;
  models: ModelCatalogEntry[];
  defaultModelId: string;
}

export type BaselineLLMType =
  | 'baseline_random'
  | 'baseline_rule'
  | 'baseline_sugarscape'
  | 'baseline_qlearning';

export type AgentRosterProvider = LLMType | BaselineLLMType;
export type ReasoningLevel = string | number | boolean;

export interface AgentRosterEntry {
  connectionId?: string;
  capabilities?: import('./connections').ModelCapabilities;
  id?: string;
  name: string;
  provider: AgentRosterProvider;
  modelId: string;
  reasoningLevel?: ReasoningLevel;
  color: string;
  personality?: string | null;
}

const VERIFIED = '2026-10-25';

const effort = (levels: string[], defaultLevel: string): ReasoningCapability => ({ kind: 'effort', levels, default: defaultLevel });
const claudeEffort = (defaultLevel: string) => effort(['low', 'medium', 'high', 'xhigh', 'max'], defaultLevel);
const anthropicThinkingBudget: ReasoningCapability = { kind: 'budget', min: 1024, max: 64000, default: 4096 };
const geminiThinkingBudget: ReasoningCapability = { kind: 'budget', min: 0, max: 24576, default: 4096 };

const CLAUDE_SOURCE = 'https://platform.claude.com/docs/en/build-with-claude/effort';
const OPENAI_SOURCE = 'https://developers.openai.com/api/docs/models';
const GEMINI_SOURCE = 'https://ai.google.dev/gemini-api/docs/thinking';
const GROK_SOURCE = 'https://docs.x.ai/docs/guides/reasoning';
const DEEPSEEK_SOURCE = 'https://api-docs.deepseek.com/guides/thinking_mode';
const QWEN_SOURCE = 'https://www.alibabacloud.com/help/en/model-studio/deep-thinking';
const GLM_SOURCE = 'https://docs.z.ai/guides/capabilities/thinking-mode';
const MISTRAL_SOURCE = 'https://docs.mistral.ai/capabilities/reasoning/';
const MINIMAX_SOURCE = 'https://platform.minimax.io/docs/api-reference/text-chat-openai.md';
const KIMI_SOURCE = 'https://platform.kimi.ai/docs/api/chat.md';

const zAiEndpoint = ['https://api.z.ai', 'api/paas/v4/chat/completions'].join('/');

export const LLM_CATALOG: ProviderCatalogEntry[] = [
  { id: 'openrouter', displayName: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', authStyle: 'bearer', cors: 'direct', docsUrl: 'https://openrouter.ai/settings/keys', defaultModelId: 'openai/gpt-5.4-mini', models: [] },
  {
    id: 'claude',
    displayName: 'Claude (Anthropic)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    authStyle: 'x-api-key',
    cors: 'direct',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    defaultModelId: 'claude-sonnet-5-5',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', reasoning: claudeEffort('medium'), source: CLAUDE_SOURCE, verifiedAt: VERIFIED },
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', reasoning: claudeEffort('high'), source: CLAUDE_SOURCE, verifiedAt: VERIFIED },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', reasoning: claudeEffort('high'), source: CLAUDE_SOURCE, verifiedAt: VERIFIED },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', reasoning: claudeEffort('medium'), source: CLAUDE_SOURCE, verifiedAt: VERIFIED },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', reasoning: claudeEffort('high'), source: CLAUDE_SOURCE, verifiedAt: VERIFIED, legacy: true },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', reasoning: claudeEffort('high'), source: CLAUDE_SOURCE, verifiedAt: VERIFIED, legacy: true },
      { id: 'claude-fable-5', label: 'Claude Fable 5', reasoning: claudeEffort('high'), source: CLAUDE_SOURCE, verifiedAt: VERIFIED, legacy: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', reasoning: anthropicThinkingBudget, source: 'https://platform.claude.com/docs/en/about-claude/models/overview', verifiedAt: VERIFIED, legacy: true },
    ],
  },
  {
    id: 'codex',
    displayName: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.openai.com/api-keys',
    defaultModelId: 'gpt-6.1-sol',
    models: [
      { id: 'gpt-6-astra', label: 'GPT-6 Astra', reasoning: effort(['low', 'medium', 'high', 'xhigh', 'max'], 'medium'), source: OPENAI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', reasoning: effort(['low', 'medium', 'high', 'xhigh', 'max'], 'medium'), source: OPENAI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', reasoning: effort(['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'), source: OPENAI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', reasoning: effort(['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'), source: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra', verifiedAt: VERIFIED },
      { id: 'gpt-5.5', label: 'GPT-5.5', reasoning: effort(['none', 'low', 'medium', 'high', 'xhigh'], 'medium'), source: 'https://developers.openai.com/api/docs/models/all', verifiedAt: VERIFIED, legacy: true },
      { id: 'gpt-5.4', label: 'GPT-5.4', reasoning: effort(['none', 'low', 'medium', 'high', 'xhigh'], 'medium'), source: 'https://developers.openai.com/api/docs/models/all', verifiedAt: VERIFIED, legacy: true },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', reasoning: effort(['none', 'low', 'medium', 'high', 'xhigh'], 'medium'), source: 'https://developers.openai.com/api/docs/models/all', verifiedAt: VERIFIED, legacy: true },
    ],
  },
  {
    id: 'gemini',
    displayName: 'Gemini (Google)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    authStyle: 'google-key',
    cors: 'direct',
    docsUrl: 'https://aistudio.google.com/apikey',
    defaultModelId: 'gemini-3.8-flash',
    models: [
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon', reasoning: effort(['low', 'medium', 'high'], 'medium'), source: GEMINI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', reasoning: effort(['low', 'medium', 'high'], 'medium'), source: GEMINI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', reasoning: effort(['minimal', 'low', 'medium', 'high'], 'medium'), source: GEMINI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', reasoning: effort(['minimal', 'low', 'medium', 'high'], 'minimal'), source: GEMINI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', reasoning: effort(['low', 'medium', 'high'], 'high'), source: GEMINI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', reasoning: effort(['minimal', 'low', 'medium', 'high'], 'high'), source: GEMINI_SOURCE, verifiedAt: VERIFIED },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', reasoning: geminiThinkingBudget, source: 'https://ai.google.dev/gemini-api/docs/models', verifiedAt: VERIFIED, legacy: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', reasoning: geminiThinkingBudget, source: 'https://ai.google.dev/gemini-api/docs/models', verifiedAt: VERIFIED, legacy: true },
    ],
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    defaultModelId: 'deepseek-flash',
    models: [
      // Thinking is on by default; `none` is not a reasoning_effort value.
      { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', reasoning: effort(['low', 'high', 'max'], 'high'), source: DEEPSEEK_SOURCE, verifiedAt: VERIFIED },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', reasoning: effort(['low', 'high', 'max'], 'high'), source: DEEPSEEK_SOURCE, verifiedAt: VERIFIED },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (served by V4.1 Flash)', reasoning: effort(['low', 'high', 'max'], 'high'), source: 'https://api-docs.deepseek.com/quick_start/pricing', verifiedAt: VERIFIED, legacy: true },
    ],
  },
  {
    id: 'qwen',
    displayName: 'Qwen (Alibaba Cloud)',
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://dashscope.console.aliyun.com/apiKey',
    defaultModelId: 'qwen3.8-max',
    models: [
      { id: 'qwen3.8-max', label: 'Qwen3.8 Max', reasoning: { kind: 'toggle' }, source: QWEN_SOURCE, verifiedAt: VERIFIED },
      { id: 'qwen3.8-flash', label: 'Qwen3.8 Flash', reasoning: { kind: 'toggle' }, source: QWEN_SOURCE, verifiedAt: VERIFIED },
      { id: 'qwen3.7-plus', label: 'Qwen3.7 Plus', reasoning: { kind: 'toggle' }, source: QWEN_SOURCE, verifiedAt: VERIFIED },
    ],
  },
  {
    id: 'glm',
    displayName: 'GLM (Z.ai)',
    endpoint: zAiEndpoint,
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    defaultModelId: 'glm-5.3',
    models: [
      // GLM-5.3 models always think and expose no effort control on Z.ai.
      { id: 'glm-5.3', label: 'GLM-5.3', reasoning: { kind: 'none' }, source: GLM_SOURCE, verifiedAt: VERIFIED },
      { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash', reasoning: { kind: 'none' }, source: GLM_SOURCE, verifiedAt: VERIFIED },
      { id: 'glm-5.2', label: 'GLM-5.2', reasoning: { kind: 'toggle' }, source: GLM_SOURCE, verifiedAt: VERIFIED },
      { id: 'glm-5.1', label: 'GLM-5.1', reasoning: { kind: 'toggle' }, source: GLM_SOURCE, verifiedAt: VERIFIED, legacy: true },
    ],
  },
  {
    id: 'grok',
    displayName: 'Grok (xAI)',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://console.x.ai',
    defaultModelId: 'grok-4.7',
    models: [
      // Reasoning cannot be disabled on these models, so `none` is not offered.
      { id: 'grok-4.7', label: 'Grok 4.7', reasoning: effort(['low', 'medium', 'high', 'xhigh'], 'high'), source: GROK_SOURCE, verifiedAt: VERIFIED },
      { id: 'grok-4.6', label: 'Grok 4.6', reasoning: effort(['low', 'medium', 'high', 'xhigh'], 'high'), source: GROK_SOURCE, verifiedAt: VERIFIED },
      { id: 'grok-4.5', label: 'Grok 4.5', reasoning: effort(['low', 'medium', 'high'], 'high'), source: GROK_SOURCE, verifiedAt: VERIFIED },
      { id: 'grok-4.3', label: 'Grok 4.3', reasoning: { kind: 'none' }, source: 'https://docs.x.ai/docs/models', verifiedAt: VERIFIED, legacy: true },
      { id: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 (reasoning)', reasoning: { kind: 'none' }, source: 'https://docs.x.ai/docs/models', verifiedAt: VERIFIED, legacy: true },
      { id: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 (non-reasoning)', reasoning: { kind: 'none' }, source: 'https://docs.x.ai/docs/models', verifiedAt: VERIFIED, legacy: true },
    ],
  },
  {
    id: 'mistral',
    displayName: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://console.mistral.ai/api-keys',
    defaultModelId: 'mistral-medium-3-5',
    models: [
      // Only `none` and `high` are documented reasoning_effort values.
      { id: 'mistral-large-4-0', label: 'Mistral Large 4', reasoning: effort(['none', 'high'], 'high'), source: MISTRAL_SOURCE, verifiedAt: VERIFIED },
      { id: 'mistral-medium-3-5', label: 'Mistral Medium 3.5', reasoning: effort(['none', 'high'], 'high'), source: MISTRAL_SOURCE, verifiedAt: VERIFIED },
      { id: 'mistral-small-latest', label: 'Mistral Small', reasoning: effort(['none', 'high'], 'high'), source: MISTRAL_SOURCE, verifiedAt: VERIFIED },
    ],
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    endpoint: 'https://api.minimax.io/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.minimax.io',
    defaultModelId: 'MiniMax-M3.1-Flash',
    models: [
      { id: 'MiniMax-M3.1-Flash', label: 'MiniMax M3.1 Flash', reasoning: effort(['low', 'medium', 'high', 'xhigh', 'max'], 'max'), source: MINIMAX_SOURCE, verifiedAt: VERIFIED },
      { id: 'MiniMax-M3', label: 'MiniMax M3', reasoning: { kind: 'none' }, source: MINIMAX_SOURCE, verifiedAt: VERIFIED },
    ],
  },
  {
    id: 'kimi',
    displayName: 'Kimi (Moonshot AI)',
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.kimi.ai',
    defaultModelId: 'kimi-k3.1-pro',
    models: [
      { id: 'kimi-k3.1-pro', label: 'Kimi K3.1 Pro', reasoning: effort(['low', 'high', 'max'], 'max'), source: KIMI_SOURCE, verifiedAt: VERIFIED },
      { id: 'kimi-k3.1-pro-highspeed', label: 'Kimi K3.1 Pro (high speed)', reasoning: effort(['low', 'high', 'max'], 'max'), source: KIMI_SOURCE, verifiedAt: VERIFIED },
      { id: 'kimi-k3', label: 'Kimi K3', reasoning: effort(['low', 'high', 'max'], 'max'), source: KIMI_SOURCE, verifiedAt: VERIFIED },
      { id: 'kimi-k2.6', label: 'Kimi K2.6', reasoning: { kind: 'toggle' }, source: KIMI_SOURCE, verifiedAt: VERIFIED, legacy: true },
      { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', reasoning: { kind: 'none' }, source: KIMI_SOURCE, verifiedAt: VERIFIED, legacy: true },
    ],
  },
];

export const LLM_PROVIDER_IDS = LLM_CATALOG.map((entry) => entry.id);

export const BASELINE_PROVIDER_IDS: BaselineLLMType[] = [
  'baseline_random',
  'baseline_rule',
  'baseline_sugarscape',
  'baseline_qlearning',
];

export const DEFAULT_AGENT_ROSTER: AgentRosterEntry[] = [
  {
    name: 'Random-1',
    provider: 'baseline_random',
    modelId: 'baseline_random',
    color: '#9ca3af',
  },
  {
    name: 'Rule-1',
    provider: 'baseline_rule',
    modelId: 'baseline_rule',
    color: '#6b7280',
  },
  {
    name: 'Sugar-1',
    provider: 'baseline_sugarscape',
    modelId: 'baseline_sugarscape',
    color: '#4b5563',
  },
];

export function isLLMProviderId(value: string): value is LLMType {
  return LLM_PROVIDER_IDS.includes(value as LLMType);
}

export function isBaselineProviderId(value: string): value is BaselineLLMType {
  return BASELINE_PROVIDER_IDS.includes(value as BaselineLLMType);
}

export function isRosterProvider(value: string): value is AgentRosterProvider {
  return isLLMProviderId(value) || isBaselineProviderId(value);
}

export function getProviderCatalogEntry(provider: LLMType): ProviderCatalogEntry | undefined {
  return LLM_CATALOG.find((entry) => entry.id === provider);
}

export function getModelCatalogEntry(
  provider: LLMType,
  modelId: string
): ModelCatalogEntry | undefined {
  return getProviderCatalogEntry(provider)?.models.find((model) => model.id === modelId);
}

export function getDefaultModelId(provider: LLMType): string {
  return getProviderCatalogEntry(provider)?.defaultModelId ?? provider;
}
