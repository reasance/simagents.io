import { expect, test } from 'bun:test';
import { getDefaultModelId } from '@simagents/shared';
import { validateWorldSnapshotV1 } from '@simagents/engine/engine/persistence';
import { dryRunPreflightIssue } from '../services/byok-preflight-issue';
import { DRY_RUN_SAMPLES } from '../services/participants';

test('a dry run needs only participants with a model', () => {
  expect(dryRunPreflightIssue([])).toEqual({ code: 'BYOK_AGENT_REQUIRED' });
  expect(dryRunPreflightIssue([{ name: 'A', provider: 'claude', modelId: getDefaultModelId('claude'), color: '#000000' }])).toBeUndefined();
  expect(dryRunPreflightIssue([{ name: 'A', provider: 'claude', modelId: ' ', color: '#000000' }])).toEqual({ code: 'BYOK_MODEL', parameters: { agent: 'A' } });
  expect(dryRunPreflightIssue([{ name: 'B', provider: 'baseline_random', modelId: 'baseline_random', color: '#000000' }])?.code).toBe('BYOK_INTERNAL');
});

test('dry run samples pass the dry run preflight and include one model at two efforts', () => {
  expect(dryRunPreflightIssue(DRY_RUN_SAMPLES)).toBeUndefined();
  const claude = DRY_RUN_SAMPLES.filter((entry) => entry.provider === 'claude');
  expect(new Set(claude.map((entry) => entry.reasoningLevel)).size).toBe(2);
});

test('saved worlds reject a dry run flag that is not a boolean', () => {
  const snapshot = { schemaVersion: 1, savedAtSimTimeMs: 0, worldSeed: 's', speed: 10, configuration: { overrides: {}, customPrompt: null, dryRun: 'yes' } };
  expect(() => validateWorldSnapshotV1(snapshot)).toThrow('Invalid dry run flag');
});
