/**
 * Shared types for Sim Agents
 * These types are used by both server and web
 */

import type { AGENT_STATES, LOCATION_TYPES, EVENT_TYPES } from '../constants';

// ============================================
// Core Identity Types
// ============================================

export interface PhysicalIdentity {
  id: string; // UUID v7
  endpoint: string; // Agent's API endpoint
  created_at: number; // Unix timestamp
}

// ============================================
// Agent Types
// ============================================

export type AgentState = (typeof AGENT_STATES)[keyof typeof AGENT_STATES];

export interface AgentPosition {
  x: number;
  y: number;
}

export interface Agent {
  id: string;
  x: number;
  y: number;
  color: string;
  state: AgentState;
  llm_type: LLMType;
}

export type LLMType =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'glm'
  | 'grok'
  | 'mistral'
  | 'minimax'
  | 'kimi'
  | 'openrouter'
  // Decision models: they choose among offered options and produce no text
  | 'typesafe'
  | 'levanto';

// ============================================
// Location Types
// ============================================

export type LocationType = (typeof LOCATION_TYPES)[keyof typeof LOCATION_TYPES];

export interface Location {
  id: string;
  x: number;
  y: number;
  type: LocationType;
  name?: string;
}

// ============================================
// World State Types
// ============================================

export interface WorldState {
  tick: number;
  timestamp: number;
  agents: Agent[];
  locations: Location[];
}

// ============================================
// Event Types
// ============================================

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface WorldEvent {
  id: string;
  type: EventType;
  tick: number;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface AgentActionEvent extends WorldEvent {
  type: typeof EVENT_TYPES.AGENT_ACTION;
  data: {
    agent_id: string;
    action: string;
    from: AgentPosition;
    to?: AgentPosition;
  };
}

export interface AgentInteractionEvent extends WorldEvent {
  type: typeof EVENT_TYPES.AGENT_INTERACTION;
  data: {
    agent_a: string;
    agent_b: string;
    interaction_type: string;
    outcome?: string;
  };
}

// ============================================
// API Types
// ============================================

export interface SSEMessage {
  type: EventType;
  data: WorldState | WorldEvent;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  version: string;
}
