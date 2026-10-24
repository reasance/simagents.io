import { accumulateMetrics } from '../../engine/metrics';
/**
 * Event store queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/events.ts`. Version numbering, which
 * the DB version did atomically with MAX(version)+1, is replaced by a
 * monotonic counter on the store (single-threaded, so no race).
 */

import type { Event, NewEvent } from '../../db/schema';
import { getEventCategory, type EventCategory } from '../../events/event-types';
import { STORE_EVENT_CAP, store } from '../store';

export async function appendEvent(event: Omit<NewEvent, 'version'>): Promise<Event | null> {
  const category = getEventCategory(event.eventType);
  const row: Event = {
    id: store.nextEventId++,
    tenantId: event.tenantId ?? null,
    tick: event.tick,
    agentId: event.agentId ?? null,
    eventType: event.eventType,
    payload: (event.payload ?? {}) as Record<string, unknown>,
    category: (event.category ?? category) as EventCategory,
    version: store.nextEventVersion++,
    createdAt: new Date(),
  };
  accumulateMetrics(store.metrics, row, row.agentId ? store.agents.get(row.agentId)?.llmType : undefined, store.agents.size);
  store.events.push(row);
  if (store.events.length > STORE_EVENT_CAP) {
    store.events.splice(0, store.events.length - STORE_EVENT_CAP);
  }
  return row;
}

export async function getEventsByAgent(agentId: string, limit = 100): Promise<Event[]> {
  return store.events
    .filter((e) => e.agentId === agentId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

export async function getEventsByTick(tick: number): Promise<Event[]> {
  return store.events.filter((e) => e.tick === tick).sort((a, b) => a.id - b.id);
}

export async function getEventsByTickRange(fromTick: number, toTick: number): Promise<Event[]> {
  return store.events
    .filter((e) => e.tick >= fromTick && e.tick <= toTick)
    .sort((a, b) => a.tick - b.tick || a.id - b.id);
}

export async function getEventsByType(eventType: string, limit = 100): Promise<Event[]> {
  return store.events
    .filter((e) => e.eventType === eventType)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

export async function getRecentSignals(tick: number): Promise<Event[]> {
  // No explicit ordering in the original query; insertion order (ascending id)
  // matches what Postgres returns in practice for an append-only table.
  return store.events.filter((e) => e.eventType === 'agent_signaled' && e.tick >= tick - 1);
}

/** What an agent said or heard, oldest first, capped to the most recent `limit` utterances. */
export async function getConversationForAgent(agentId: string, limit: number): Promise<Event[]> {
  return store.events
    .filter((e) => e.agentId === agentId && (e.eventType === 'agent_spoke' || e.eventType === 'agent_heard'))
    .sort((a, b) => a.id - b.id)
    .slice(-limit);
}

export async function getRecentEvents(limit = 50): Promise<Event[]> {
  return [...store.events].sort((a, b) => b.id - a.id).slice(0, limit);
}

export async function getEventCount(): Promise<number> {
  return store.metrics.totalEvents;
}

export async function getEventsByCategory(category: EventCategory, tick: number): Promise<Event[]> {
  return store.events
    .filter((e) => e.tick === tick && e.category === category)
    .sort((a, b) => a.id - b.id);
}
