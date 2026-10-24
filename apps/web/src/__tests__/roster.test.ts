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
