import { expect, test } from 'bun:test';
import { getDefaultModelId } from '@simagents/shared';
import { dryRunPreflightIssue } from '../services/byok-preflight-issue';

test('a dry run needs only participants with a model', () => {
  expect(dryRunPreflightIssue([])).toEqual({ code: 'BYOK_AGENT_REQUIRED' });
  expect(dryRunPreflightIssue([{ name: 'A', provider: 'claude', modelId: getDefaultModelId('claude'), color: '#000000' }])).toBeUndefined();
  expect(dryRunPreflightIssue([{ name: 'A', provider: 'claude', modelId: ' ', color: '#000000' }])).toEqual({ code: 'BYOK_MODEL', parameters: { agent: 'A' } });
  expect(dryRunPreflightIssue([{ name: 'B', provider: 'baseline_random', modelId: 'baseline_random', color: '#000000' }])?.code).toBe('BYOK_INTERNAL');
});
