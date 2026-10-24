/**
 * Speak Action Handler (Local Free Speech)
 *
 * Whatever an agent says is heard by every living agent within the hearing
 * radius. An optional addressee only marks who the words are for; it does not
 * make them private. The engine never interprets the content.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, SpeakParams } from '../types';
import type { Agent } from '../../db/schema';
import { getRuntimeConfig } from '../../config';
import { getAliveAgents } from '../../engine-memory/queries/agents';

export async function handleSpeak(
  intent: ActionIntent<SpeakParams>,
  agent: Agent
): Promise<ActionResult> {
  const { message, to } = intent.params;
  const radius = getRuntimeConfig().actions.speak.hearingRadius;
  const listeners = (await getAliveAgents()).filter((other) =>
    other.id !== agent.id && Math.abs(other.x - agent.x) + Math.abs(other.y - agent.y) <= radius
  );

  if (to !== undefined && !listeners.some((listener) => listener.id === to)) {
    return { success: false, error: 'Nobody by that id is within earshot' };
  }

  const timestamp = Date.now();
  const listenerIds = listeners.map((listener) => listener.id);
  return {
    success: true,
    events: [
      {
        id: uuid(),
        type: 'agent_spoke',
        tick: intent.tick,
        timestamp,
        agentId: agent.id,
        payload: { message, to: to ?? null, listenerIds, x: agent.x, y: agent.y },
      },
      ...listeners.map((listener) => ({
        id: uuid(),
        type: 'agent_heard',
        tick: intent.tick,
        timestamp,
        agentId: listener.id,
        payload: { speakerId: agent.id, message, addressedToListener: to === listener.id, x: agent.x, y: agent.y },
      })),
    ],
  };
}
