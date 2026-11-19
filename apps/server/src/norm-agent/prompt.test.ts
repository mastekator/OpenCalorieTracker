import { describe, expect, it } from 'vitest';
import { INTERVIEW_PROMPT_VERSION, interviewSystemPrompt } from './prompt.js';

describe('interviewSystemPrompt', () => {
  it('asks the deadline with the target weight (OCT-302)', () => {
    expect(INTERVIEW_PROMPT_VERSION).toBe(2);
    const draft = { profile: {}, unknown: [] } as never;
    expect(
      interviewSystemPrompt('en', draft, '2026-11-19', 'metric'),
    ).toContain('Asking for the deadline: name the target weight');
  });
});
