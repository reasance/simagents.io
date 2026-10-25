import { afterEach, expect, test } from 'bun:test';
import { formatSimTime } from '../utils/format';
import { SPRITES } from '../components/Canvas/pixel-art';
import { describeNotable, nameLookup } from '../components/World/describe';
import { useWorldStore, type Agent, type WorldEvent } from '../stores/world';

const agent = (id: string, name: string): Agent => ({ id, name, llmType: 'claude', x: 0, y: 0, hunger: 100, energy: 100, health: 100, balance: 0, state: 'idle', color: '#8fb8de' });
const event = (type: string, agentId: string, payload: Record<string, unknown>, id = `${type}-${agentId}-${Math.random()}`): WorldEvent => ({ id, type, tick: 1, timestamp: 0, agentId, payload });

afterEach(() => useWorldStore.getState().resetWorld());

test('simulated time reads as day and clock', () => {
  expect(formatSimTime(0)).toBe('D1 00:00');
  expect(formatSimTime(25 * 60 * 60_000 + 7 * 60_000)).toBe('D2 01:07');
});

test('feed sentences name who did what to whom and keep speech verbatim', () => {
  const names = nameLookup([agent('a', 'Ada'), agent('b', 'Bo')]);
  expect(describeNotable(event('agent_spoke', 'a', { message: 'Do you have food?', to: 'b', listenerIds: ['b'] }), names)).toEqual({ text: 'Ada to Bo', quote: 'Do you have food?' });
  expect(describeNotable(event('agent_spoke', 'a', { message: 'Hello', to: null, listenerIds: ['b'] }), names).text).toBe('Ada, heard by 1 nearby');
  expect(describeNotable(event('agent_gave', 'a', { giverId: 'a', recipientId: 'b', itemType: 'food', quantity: 2 }), names).text).toBe('Ada gave 2 food to Bo');
  expect(describeNotable(event('agent_harmed', 'b', { attackerId: 'b', victimId: 'a', victimDied: true }), names).text).toBe('Bo struck Ada, who died');
  expect(describeNotable(event('agent_undecided', 'b', {}), names).text).toBe('Bo stayed undecided');
});

test('the store keeps speech and per-agent decisions beyond the short raw event window', () => {
  const store = useWorldStore.getState();
  store.addEvent(event('agent_spoke', 'a', { message: 'hi', listenerIds: [] }, 'spoken'));
  store.addEvent(event('agent_sleep', 'a', { action: 'sleep', reasoning: 'tired' }, 'decision'));
  for (let i = 0; i < 150; i++) store.addEvent(event('needs_updated', 'a', {}, `noise-${i}`));
  const state = useWorldStore.getState();
  expect(state.events).toHaveLength(100);
  expect(state.events.some(e => e.id === 'spoken')).toBe(false);
  expect(state.notable.map(e => e.id)).toEqual(['spoken']);
  expect(state.decisions.a.map(e => e.id)).toEqual(['decision']);
});

test('every map sprite is eight by eight and only uses colours it defines', () => {
  for (const [name, sprite] of Object.entries(SPRITES)) {
    expect(sprite.rows.length, name).toBe(8);
    for (const row of sprite.rows) {
      expect(row.length, `${name}: ${row}`).toBe(8);
      for (const cell of row) expect(cell === '.' || cell === 'c' || cell in sprite.colors, `${name} uses ${cell}`).toBe(true);
    }
  }
});
