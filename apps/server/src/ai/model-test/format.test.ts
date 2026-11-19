import { describe, expect, it } from 'vitest';
import { modelsMdRow, reportMarkdown, type ModelTestRun } from './format.js';

const run: ModelTestRun = {
  provider: 'google',
  model: 'gemini-3.5-flash-lite',
  appVersion: '0.2.0',
  promptVersion: 1,
  testSet: 2,
  startedAt: Date.UTC(2026, 10, 17, 23, 59),
  inputTokens: 12000,
  outputTokens: 900,
  photos: [
    ...Array.from({ length: 8 }, (_, i) => ({
      file: `p${i}.jpg`,
      expected: 'egg; 70-160 kcal; exact',
      got: 'Egg',
      kcal: 78,
      levels: 'exact',
      ms: 4000,
      result: 'ok',
    })),
    {
      file: 'chair.jpg',
      expected: '(none)',
      ms: 4900,
      result: 'error ai_invalid_response | x',
    },
  ],
};

describe('modelsMdRow', () => {
  it('formats the docs/MODELS.md row (AC-2.2)', () => {
    expect(modelsMdRow(run)).toBe(
      '| google | gemini-3.5-flash-lite | 8/9 | 2026-11-17 | 4.1 s/photo; OCT v0.2.0, prompt 1, set 2 |',
    );
  });

  it('has no address for openai-compatible', () => {
    const local = { ...run, provider: 'openai-compatible', model: 'llava' };
    expect(modelsMdRow(local)).toMatch(/^\| openai-compatible \| llava \|/);
    expect(reportMarkdown(local)).not.toMatch(
      /http|localhost|\d+\.\d+\.\d+\.\d+/,
    );
  });
});

describe('reportMarkdown', () => {
  it('lists tokens, every photo and the row, escaping pipes', () => {
    const md = reportMarkdown(run);
    expect(md).toContain('- Tokens: 12000 in, 900 out');
    expect(md).toContain(
      '| chair.jpg | (none) |  |  |  | 4.9 s | error ai_invalid_response \\| x |',
    );
    expect(md.endsWith(modelsMdRow(run))).toBe(true);
    expect(md).not.toContain('Cost');
  });
});
