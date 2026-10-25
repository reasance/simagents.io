import { expect, test } from 'bun:test';
import { useRosterStore } from '../stores/roster';

test('duplicating an agent keeps its model and picks an effort level no copy uses yet', () => {
  const { setRoster } = useRosterStore.getState();
  setRoster([{ id: 'opus-a', name: 'Agent 1', provider: 'claude', modelId: 'claude-opus-5-5', reasoningLevel: 'medium', color: '#e07a5f' }]);
  useRosterStore.getState().duplicateEntry(0);
  useRosterStore.getState().duplicateEntry(0);
  const roster = useRosterStore.getState().roster;
  expect(roster.map((entry) => entry.modelId)).toEqual(['claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5']);
  expect(roster.map((entry) => entry.reasoningLevel)).toEqual(['medium', 'low', 'high']);
  expect(new Set(roster.map((entry) => entry.id)).size).toBe(3);
  expect(new Set(roster.map((entry) => entry.name)).size).toBe(3);
});

test('a model without effort levels is copied with its reasoning setting unchanged', () => {
  useRosterStore.getState().setRoster([{ id: 'qwen-a', name: 'Agent 1', provider: 'qwen', modelId: 'qwen3.8-max', reasoningLevel: true, color: '#000000' }]);
  useRosterStore.getState().duplicateEntry(0);
  expect(useRosterStore.getState().roster.map((entry) => entry.reasoningLevel)).toEqual([true, true]);
});

test('a saved thinking budget on a model that now takes effort levels reverts to the provider default', () => {
  const budget = { temperature: false, output: 'text-json', tokenParameter: 'max_tokens', reasoning: 'budget', maxOutputTokens: 32768 } as const;
  useRosterStore.getState().setRoster([
    { id: 'sonnet', name: 'Agent 1', provider: 'claude', modelId: 'claude-sonnet-5', reasoningLevel: 4096, capabilities: budget, color: '#e07a5f' },
    { id: 'opus', name: 'Agent 2', provider: 'claude', modelId: 'claude-opus-5-5', reasoningLevel: 'max', color: '#e07a5f' },
    { id: 'haiku', name: 'Agent 3', provider: 'claude', modelId: 'claude-haiku-4-5', reasoningLevel: 4096, capabilities: budget, color: '#e07a5f' },
  ]);
  const [sonnet, opus, haiku] = useRosterStore.getState().roster;
  expect(sonnet.reasoningLevel).toBeUndefined();
  expect(sonnet.capabilities?.reasoning).toBe('effort');
  expect(opus.reasoningLevel).toBe('max');
  expect(haiku).toMatchObject({ reasoningLevel: 4096, capabilities: { reasoning: 'budget' } });
});
