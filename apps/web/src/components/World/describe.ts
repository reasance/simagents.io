import { translate, translateLabel } from '../../i18n';
import type { Agent, WorldEvent } from '../../stores/world';

type Names = (agentId: unknown) => string;

export function nameLookup(agents: Agent[]): Names {
  const names = new Map(agents.map(agent => [agent.id, agent.name ?? agent.llmType]));
  return (agentId) => (typeof agentId === 'string' ? names.get(agentId) ?? translate('Unknown agent') : translate('Unknown agent'));
}

/** "2 food" in either language: item labels are catalogued capitalised, sentences use lower case. */
const item = (type: unknown, quantity: unknown) => {
  const name = String(type ?? '');
  return `${typeof quantity === 'number' ? quantity : 1} ${translateLabel(name.charAt(0).toUpperCase() + name.slice(1)).toLowerCase()}`;
};

/** One plain sentence for an event that says something about relations or survival. */
export function describeNotable(event: WorldEvent, name: Names): { text: string; quote?: string } {
  const p = event.payload ?? {};
  switch (event.type) {
    case 'agent_spoke': {
      const listeners = Array.isArray(p.listenerIds) ? p.listenerIds.length : 0;
      const text = p.to
        ? translate('{speaker} to {listener}', { speaker: name(event.agentId), listener: name(p.to) })
        : translate('{speaker}, heard by {count} nearby', { speaker: name(event.agentId), count: listeners });
      return { text, quote: typeof p.message === 'string' ? p.message : '' };
    }
    case 'agent_gave':
      return { text: translate('{giver} gave {item} to {recipient}', { giver: name(p.giverId ?? event.agentId), item: item(p.itemType, p.quantity), recipient: name(p.recipientId) }) };
    case 'agent_harmed':
      return { text: translate(p.victimDied ? '{attacker} struck {victim}, who died' : '{attacker} struck {victim}', { attacker: name(p.attackerId ?? event.agentId), victim: name(p.victimId) }) };
    case 'agent_stole':
      return { text: translate('{taker} took {item} from {owner}', { taker: name(p.thiefId ?? event.agentId), item: item(p.itemType, p.quantity), owner: name(p.victimId) }) };
    case 'agent_traded': {
      const offered = p.offered as { itemType?: string; quantity?: number } | undefined, received = p.received as { itemType?: string; quantity?: number } | undefined;
      return { text: translate('{a} swapped {given} for {taken} with {b}', { a: name(p.initiatorId ?? event.agentId), given: item(offered?.itemType, offered?.quantity), taken: item(received?.itemType, received?.quantity), b: name(p.targetId) }) };
    }
    case 'agent_name_location': {
      const params = p.params as { name?: string } | undefined;
      return { text: translate('{agent} named a place', { agent: name(event.agentId) }), quote: params?.name };
    }
    case 'agent_died':
      return { text: translate('{agent} died', { agent: name(event.agentId) }) };
    case 'agent_undecided':
      return { text: translate('{agent} stayed undecided', { agent: name(event.agentId) }) };
    case 'agent_unresponsive':
      return { text: translate('{agent} stopped responding ({reason})', { agent: name(event.agentId), reason: translateLabel(String(p.code ?? '')) }) };
    default:
      return { text: translateLabel(event.type) };
  }
}
