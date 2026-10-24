import type { TextProtocol, LLMType } from '@simagents/shared';

export interface ExtractedLLMResponse {
  text: string;
  costEligible?: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  thinkingText?: string;
}

export function extractProviderResponse(
  provider: LLMType,
  json: unknown,
  protocol?: TextProtocol
): ExtractedLLMResponse {
  if (protocol === 'openai-responses') return extractResponses(json);
  if (protocol === 'chat-completions') return extractOpenAICompatible(json);
  if (protocol === 'anthropic-messages') return extractAnthropic(json);
  if (protocol === 'gemini-generate-content') return extractGemini(json);
  switch (provider) {
    case 'claude':
      return extractAnthropic(json);
    case 'gemini':
      return extractGemini(json);
    case 'codex':
    case 'deepseek':
    case 'qwen':
    case 'glm':
    case 'grok':
    case 'mistral':
    case 'minimax':
    case 'kimi':
    case 'openrouter':
      return extractOpenAICompatible(json);
    default:
      return unreachable(provider);
  }
}

function extractAnthropic(json: unknown): ExtractedLLMResponse {
  const data = asRecord(json);
  const content = Array.isArray(data.content) ? data.content : [];
  const text: string[] = [];
  const thinking: string[] = [];

  for (const block of content) {
    const item = asRecord(block);
    if (item.type === 'text' && typeof item.text === 'string') {
      text.push(item.text);
    } else if (item.type === 'thinking' && typeof item.thinking === 'string') {
      thinking.push(item.thinking);
    }
  }

  const usage = asRecord(data.usage);
  return {
    text: text.join('\n'),
    usage: tokenUsage(usage.input_tokens, usage.output_tokens),
    costEligible: completeUsage(usage.input_tokens, usage.output_tokens) && notCached(usage.cache_creation_input_tokens) && notCached(usage.cache_read_input_tokens),
    thinkingText: thinking.length > 0 ? thinking.join('\n') : undefined,
  };
}

function extractOpenAICompatible(json: unknown): ExtractedLLMResponse {
  const data = asRecord(json);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = asRecord(choices[0]);
  const message = asRecord(first.message);
  const usage = asRecord(data.usage);
  const chunkThinking = thinkingChunksToText(message.content);

  return {
    text: messageContentToText(message.content),
    usage: tokenUsage(usage.prompt_tokens, usage.completion_tokens),
    costEligible: completeUsage(usage.prompt_tokens, usage.completion_tokens) && notCached(asRecord(usage.prompt_tokens_details).cached_tokens),
    thinkingText:
      typeof message.reasoning_content === 'string' ? message.reasoning_content : chunkThinking,
  };
}

function extractGemini(json: unknown): ExtractedLLMResponse {
  const data = asRecord(json);
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const first = asRecord(candidates[0]);
  const content = asRecord(first.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const usage = asRecord(data.usageMetadata);

  const input = tokenCount(usage.promptTokenCount), candidatesOutput = tokenCount(usage.candidatesTokenCount ?? usage.outputTokenCount);
  const total = tokenCount(usage.totalTokenCount), thinking = tokenCount(usage.thoughtsTokenCount);
  const explicitOutput = candidatesOutput !== undefined && thinking !== undefined ? candidatesOutput + thinking : candidatesOutput;
  const totalConsistent = input !== undefined && total !== undefined && total >= input && (explicitOutput === undefined || total - input >= explicitOutput);
  const output = totalConsistent ? total! - input! : explicitOutput;
  return {
    text: parts.filter((part) => asRecord(part).thought !== true).map(part => asRecord(part).text).filter((text): text is string => typeof text === 'string').join('\n'),
    usage: tokenUsage(input, output),
    costEligible: completeUsage(input, output) && (total === undefined ? thinking !== undefined : totalConsistent) && notCached(usage.cachedContentTokenCount),
  };
}

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const item = asRecord(part);
      // Mistral returns reasoning as typed thinking chunks next to the answer text.
      if (item.type === 'thinking') return '';
      if (typeof item.text === 'string') return item.text;
      if (typeof item.content === 'string') return item.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function thinkingChunksToText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map(asRecord)
    .filter((item) => item.type === 'thinking')
    .map((item) => typeof item.text === 'string' ? item.text : Array.isArray(item.thinking) ? messageContentToText(item.thinking) : '')
    .filter(Boolean)
    .join('\n');
  return text || undefined;
}

function tokenUsage(input: unknown, output: unknown): ExtractedLLMResponse['usage'] | undefined {
  const inputTokens = tokenCount(input), outputTokens = tokenCount(output);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return { inputTokens, outputTokens };
}

function tokenCount(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined; }
function completeUsage(input: unknown, output: unknown): boolean { return tokenCount(input) !== undefined && tokenCount(output) !== undefined; }
function notCached(value: unknown): boolean { return value === undefined || value === 0; }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function unreachable(value: never): never {
  throw new Error(`Unhandled response extraction case: ${String(value)}`);
}

function extractResponses(json: unknown): ExtractedLLMResponse {
  const data = asRecord(json);
  const items = Array.isArray(data.output) ? data.output : [];
  const text = items.filter((item) => asRecord(item).type === 'message').flatMap((item) => {
    const content = asRecord(item).content;
    return Array.isArray(content) ? content.filter((part) => asRecord(part).type === 'output_text').map((part) => asRecord(part).text).filter((value): value is string => typeof value === 'string') : [];
  });
  const usage = asRecord(data.usage);
  return { text: text.join('\n'), usage: tokenUsage(usage.input_tokens, usage.output_tokens), costEligible: completeUsage(usage.input_tokens, usage.output_tokens) && notCached(asRecord(usage.input_tokens_details).cached_tokens) };
}
