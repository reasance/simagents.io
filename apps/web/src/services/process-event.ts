import type { AgentBubble, Agent, WorldEvent } from '../stores/world';
import { recordPromptEvent } from './promptLogs';

export interface ProcessEventDeps {
  processedEventIds: Set<string>;
  addEvent: (event: WorldEvent) => void;
  addBubble: (bubble: AgentBubble) => void;
  setTick: (tick: number) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  recordDecisionEvent?: (event: WorldEvent) => void;
}

export function processWorldEvent(data: WorldEvent, deps: ProcessEventDeps): void {
  if (data.id) {
    if (deps.processedEventIds.has(data.id)) {
      return;
    }
    deps.processedEventIds.add(data.id);
    if (deps.processedEventIds.size > 200) {
      const idsArray = Array.from(deps.processedEventIds);
      deps.processedEventIds.clear();
      for (const id of idsArray.slice(-100)) {
        deps.processedEventIds.add(id);
      }
    }
  }

  deps.recordDecisionEvent?.(data);
  recordPromptEvent(data);
  deps.addEvent(data);

  if (data.agentId) {
    const bubbleContent = getBubbleContent(data);
    if (bubbleContent) {
      deps.addBubble({
        agentId: data.agentId,
        text: bubbleContent.text,
        emoji: bubbleContent.emoji,
        timestamp: Date.now(),
      });
    }
  }

  switch (data.type) {
    case 'connected':
    case 'ping':
      break;

    case 'tick_start':
      deps.setTick(data.tick);
      break;

    case 'tick_end':
    case 'minute_elapsed':
      deps.setTick(data.tick);
      break;

    case 'agent_move':
      if (data.agentId && data.payload.params) {
        const params = data.payload.params as { toX: number; toY: number };
        deps.updateAgent(data.agentId, { x: params.toX, y: params.toY, state: 'walking' });
      }
      break;

    case 'agent_moved':
      if (data.agentId && data.payload.to) {
        const to = data.payload.to as { x: number; y: number };
        deps.updateAgent(data.agentId, { x: to.x, y: to.y, state: 'idle' });
      }
      break;

    case 'agent_work':
      if (data.agentId) {
        deps.updateAgent(data.agentId, { state: 'working' });
      }
      break;

    case 'agent_worked':
      if (data.agentId) {
        deps.updateAgent(data.agentId, { state: 'working' });
      }
      break;

    case 'agent_sleep':
      if (data.agentId) {
        deps.updateAgent(data.agentId, { state: 'sleeping' });
      }
      break;

    case 'agent_sleeping':
      if (data.agentId) {
        deps.updateAgent(data.agentId, { state: 'sleeping' });
      }
      break;

    case 'agent_woke':
      if (data.agentId) {
        deps.updateAgent(data.agentId, { state: 'idle' });
      }
      break;

    case 'needs_updated':
      if (data.agentId && data.payload) {
        const { hunger, energy, health } = data.payload as {
          hunger?: number;
          energy?: number;
          health?: number;
        };
        deps.updateAgent(data.agentId, {
          ...(hunger !== undefined && { hunger }),
          ...(energy !== undefined && { energy }),
          ...(health !== undefined && { health }),
        });
      }
      break;

    case 'balance_changed':
      if (data.agentId && data.payload.newBalance !== undefined) {
        deps.updateAgent(data.agentId, {
          balance: data.payload.newBalance as number,
        });
      }
      break;

    case 'agent_died':
      if (data.agentId) {
        deps.updateAgent(data.agentId, { health: 0, state: 'dead' });
      }
      break;

    default:
      break;
  }
}

function getBubbleContent(event: WorldEvent): { emoji: string; text: string } | null {
  const reasoning = event.payload?.reasoning as string | undefined;

  switch (event.type) {
    case 'agent_move':
      return { emoji: '🚶', text: reasoning || 'Moving...' };
    case 'agent_work':
      return { emoji: '🏭', text: reasoning || 'Working...' };
    case 'agent_sleep':
      return { emoji: '💤', text: reasoning || 'Sleeping...' };
    case 'agent_buy':
      return { emoji: '🛒', text: reasoning || 'Buying...' };
    case 'agent_consume':
      return { emoji: '🍔', text: reasoning || 'Eating...' };
    case 'agent_gather':
      return { emoji: '⛏️', text: reasoning || 'Gathering...' };
    case 'agent_trade':
      return { emoji: '🤝', text: reasoning || 'Trading...' };
    case 'agent_moved':
      return { emoji: '🚶', text: reasoning || 'Moved!' };
    case 'agent_worked':
      return { emoji: '🏭', text: reasoning || 'Worked!' };
    case 'agent_sleeping':
      return { emoji: '💤', text: reasoning || 'Sleeping...' };
    case 'agent_woke':
      return { emoji: '☀️', text: reasoning || 'Awake!' };
    case 'agent_bought':
      return { emoji: '🛒', text: reasoning || 'Bought!' };
    case 'agent_consumed':
      return { emoji: '🍔', text: reasoning || 'Ate!' };
    case 'balance_changed': {
      const delta = (event.payload.newBalance as number) - (event.payload.oldBalance as number || 0);
      if (delta > 0) return { emoji: '💰', text: `+${delta} CITY` };
      if (delta < 0) return { emoji: '💸', text: `${delta} CITY` };
      return null;
    }
    case 'agent_died':
      return { emoji: '💀', text: 'Died!' };
    default:
      return null;
  }
}
