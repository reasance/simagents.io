/**
 * Zod validation schemas for Sim Agents
 * Used for runtime validation of API inputs/outputs
 */

import { z } from 'zod';
import { AGENT_STATES, LOCATION_TYPES, EVENT_TYPES } from '../constants';

// ============================================
// Physical Identity Schemas
// ============================================

export const PhysicalIdentitySchema = z.object({
  id: z.string().uuid(),
  endpoint: z.string().url(),
  created_at: z.number(),
});

// ============================================
// Agent Schemas
// ============================================

export const AgentStateSchema = z.enum([
  AGENT_STATES.IDLE,
  AGENT_STATES.WALKING,
  AGENT_STATES.WORKING,
  AGENT_STATES.SLEEPING,
  AGENT_STATES.DEAD,
  AGENT_STATES.INTERACTING,
]);

export const LLMTypeSchema = z.enum([
  'claude',
  'codex',
  'gemini',
  'deepseek',
  'qwen',
  'glm',
  'grok',
  'mistral',
  'minimax',
  'kimi',
]);

export const AgentPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const AgentSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  color: z.string(),
  state: AgentStateSchema,
  llm_type: LLMTypeSchema,
});

// ============================================
// Location Schemas
// ============================================

export const LocationTypeSchema = z.enum([
  LOCATION_TYPES.RESIDENTIAL,
  LOCATION_TYPES.COMMERCIAL,
  LOCATION_TYPES.INDUSTRIAL,
  LOCATION_TYPES.CIVIC,
]);

export const LocationSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  type: LocationTypeSchema,
  name: z.string().optional(),
});

// ============================================
// World State Schemas
// ============================================

export const WorldStateSchema = z.object({
  tick: z.number(),
  timestamp: z.number(),
  agents: z.array(AgentSchema),
  locations: z.array(LocationSchema),
});

// ============================================
// Event Schemas
// ============================================

export const EventTypeSchema = z.enum([
  EVENT_TYPES.WORLD_UPDATE,
  EVENT_TYPES.AGENT_ACTION,
  EVENT_TYPES.AGENT_INTERACTION,
  EVENT_TYPES.RESOURCE_EVENT,
  EVENT_TYPES.LOCATION_EVENT,
]);

export const WorldEventSchema = z.object({
  id: z.string(),
  type: EventTypeSchema,
  tick: z.number(),
  timestamp: z.number(),
  data: z.record(z.string(), z.unknown()),
});

// ============================================
// API Schemas
// ============================================

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.number(),
  version: z.string(),
});

// ============================================
// Inferred Types (for use when Zod is the source of truth)
// ============================================

export type AgentSchemaType = z.infer<typeof AgentSchema>;
export type LocationSchemaType = z.infer<typeof LocationSchema>;
export type WorldStateSchemaType = z.infer<typeof WorldStateSchema>;
export type WorldEventSchemaType = z.infer<typeof WorldEventSchema>;
