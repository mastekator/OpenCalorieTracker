import { describe, expect, it } from 'vitest';
import type { AiTestRunSummary } from '@oct/shared';
import { bestRunId } from './ModelCompare';

const run = (
  id: number,
  passed: number,
  msPerPhoto: number | null,
  status: AiTestRunSummary['status'] = 'done',
): AiTestRunSummary => ({
  id,
  provider: 'google',
  model: `m${id}`,
  status,
  stopReason: null,
  appVersion: '0.2.0',
  promptVersion: 3,
  startedAt: 0,
  finishedAt: 1,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  passed,
  total: 9,
  msPerPhoto,
});

describe('bestRunId', () => {
  it('takes the most passed', () => {
    expect(bestRunId([run(1, 7, 1000), run(2, 9, 5000), run(3, 8, 900)])).toBe(
      2,
    );
  });

  it('breaks a tie by the shorter time per photo', () => {
    expect(bestRunId([run(1, 8, 4000), run(2, 8, 3000), run(3, 8, null)])).toBe(
      2,
    );
  });

  it('skips stopped and interrupted runs, even with more passed', () => {
    expect(
      bestRunId([
        run(1, 9, 1000, 'stopped'),
        run(2, 9, 1000, 'interrupted'),
        run(3, 5, 4000),
      ]),
    ).toBe(3);
  });

  it('has none without a complete run', () => {
    expect(bestRunId([run(1, 3, 1000, 'stopped')])).toBeNull();
    expect(bestRunId([])).toBeNull();
  });
});
