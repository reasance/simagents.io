import { z } from 'zod';
import { approvedRelayDestination, relayModelsEndpoint, type TextProtocol } from '@simagents/shared';
const text = z.string().max(200000);
const model = z.string().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const tokens = z.number().int().min(1).max(32768);
const temperature = z.number().finite().min(0).max(2).optional();
const effort = z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const thinking = z.object({ type: z.enum(['enabled', 'disabled']), budget_tokens: tokens.optional() }).strict().optional();
const messages = z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: text }).strict()).min(1).max(8);
// Only the application's simple closed action envelope is supported. No external schema references.
const actionSchema = z.object({
  type: z.literal('object'),
  properties: z.object({ action: z.object({ type: z.literal('string') }).strict(),
    paramsJson: z.object({ type: z.literal('string'), description: z.string().max(200).optional() }).strict(),
    reasoning: z.object({ type: z.literal('string') }).strict() }).strict(),
  required: z.tuple([z.literal('action'), z.literal('paramsJson'), z.literal('reasoning')]), additionalProperties: z.literal(false),
}).strict();
const simpleFormat = z.object({ type: z.literal('json_object') }).strict();
const responsesFormat = z.union([simpleFormat, z.object({ type: z.literal('json_schema'), name: z.literal('simulation_action'), strict: z.literal(true), schema: actionSchema }).strict()]);
const chatFormat = z.union([simpleFormat, z.object({ type: z.literal('json_schema'), json_schema: z.object({ name: z.literal('simulation_action'), strict: z.literal(true), schema: actionSchema }).strict() }).strict()]);
const bodies: Record<TextProtocol, z.ZodTypeAny> = {
  'openai-responses': z.object({ model, instructions: text, input: text, store: z.literal(false), max_output_tokens: tokens, temperature,
    reasoning: z.object({ effort }).strict().optional(), text: z.object({ format: responsesFormat }).strict().optional() }).strict(),
  'chat-completions': z.object({ model, messages, max_tokens: tokens.optional(), max_completion_tokens: tokens.optional(), temperature,
    reasoning_effort: effort.optional(), thinking, enable_thinking: z.boolean().optional(), store: z.literal(false).optional(),
    response_format: chatFormat.optional(), provider: z.object({ allow_fallbacks: z.literal(false), require_parameters: z.literal(true) }).strict().optional(),
  }).strict().refine((body) => (body.max_tokens !== undefined) !== (body.max_completion_tokens !== undefined)),
  'anthropic-messages': z.object({ model, system: text, messages, max_tokens: tokens, temperature, thinking,
    output_config: z.object({ format: z.object({ type: z.literal('json_schema'), schema: actionSchema }).strict().optional(),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional() }).strict().optional() }).strict(),
  'gemini-generate-content': z.object({
    systemInstruction: z.object({ parts: z.array(z.object({ text }).strict()).min(1).max(8) }).strict(),
    contents: z.array(z.object({ role: z.enum(['user', 'model']), parts: z.array(z.object({ text }).strict()).min(1).max(8) }).strict()).min(1).max(8),
    generationConfig: z.object({ maxOutputTokens: tokens, temperature, responseMimeType: z.literal('application/json').optional(), responseJsonSchema: actionSchema.optional(),
      thinkingConfig: z.union([z.object({ thinkingBudget: z.number().int().min(0).max(32768) }).strict(), z.object({ thinkingLevel: z.enum(['minimal', 'low', 'medium', 'high']) }).strict()]).optional(),
    }).strict(),
  }).strict(),
};
const envelopeSchema = z.object({ providerId: z.string().max(100), protocol: z.enum(['openai-responses', 'chat-completions', 'anthropic-messages', 'gemini-generate-content']),
  endpoint: z.string().max(2048), modelId: model.optional(), body: z.unknown().optional() }).strict();
export function approvedRequest(input: unknown, operation: 'inference' | 'models'): { url: string; protocol: TextProtocol; body?: Record<string, unknown> } {
  const envelope = envelopeSchema.parse(input);
  const destination = approvedRelayDestination(envelope.providerId, envelope.protocol, envelope.endpoint);
  if (!destination) throw new Error('Destination is not approved');
  if (operation === 'models') {
    if (envelope.body !== undefined || envelope.modelId !== undefined) throw new Error('Invalid models request');
    return { url: relayModelsEndpoint(destination.endpoint, destination.protocol), protocol: destination.protocol };
  }
  const body = bodies[destination.protocol].parse(envelope.body) as Record<string, unknown>;
  let url = destination.endpoint;
  if (destination.protocol === 'gemini-generate-content') {
    if (!envelope.modelId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(envelope.modelId)) throw new Error('Invalid Gemini model ID');
    url += `/${encodeURIComponent(envelope.modelId)}:generateContent`;
  } else if (envelope.modelId !== body.model) throw new Error('Model IDs do not match');
  if (envelope.providerId === 'openrouter') {
    if (body.model === 'openrouter/auto' || String(body.model).endsWith(':floor') || String(body.model).endsWith(':nitro')) throw new Error('Automatic model routing is unavailable');
    body.provider = { allow_fallbacks: false, require_parameters: true };
  } else if (body.provider !== undefined) throw new Error('Provider routing is unavailable');
  if (envelope.providerId === 'codex') body.store = false;
  return { url, protocol: destination.protocol, body };
}
