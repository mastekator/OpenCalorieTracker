import { generateText, Output } from 'ai';
import {
  interviewTurnSchema,
  type ChatMessage,
  type InterviewDraft,
  type InterviewTurn,
  type Units,
} from '@oct/shared';
import {
  INTERVIEW_PROMPT_VERSION,
  interviewSystemPrompt,
  toModelMessages,
} from '../norm-agent/prompt.js';
import { callModel } from './common.js';
import type { AiModel } from './model.js';

export const INTERVIEW_TIMEOUT_MS = 30_000;

export interface InterviewInput {
  /** The dialog so far, ending with the user's new message. */
  history: ChatMessage[];
  draft: InterviewDraft;
  today: string;
  units: Units;
}

/**
 * One model turn of the norm agent (ADR-0015 §2): extracted fields and a reply, not yet
 * checked (advanceInterview does that). One retry on a schema mismatch, 30 s in total;
 * provider failures become ApiError, aborting `signal` rethrows the abort as is.
 */
export async function normInterview(
  model: AiModel,
  { history, draft, today, units }: InterviewInput,
  locale: string,
  signal?: AbortSignal,
): Promise<InterviewTurn> {
  return callModel(
    model,
    {
      op: 'interview',
      promptVersion: INTERVIEW_PROMPT_VERSION,
      timeoutMs: INTERVIEW_TIMEOUT_MS,
      signal,
      // Field names only: values and texts are personal data.
      logExtra: (turn) =>
        `fields=${Object.entries(turn?.extracted ?? {})
          .filter(([, v]) => v != null)
          .map(([k]) => k)
          .join(',')}`,
    },
    async (abortSignal) => {
      const { output } = await generateText({
        model,
        system: interviewSystemPrompt(locale, draft, today, units),
        messages: toModelMessages(history),
        output: Output.object({ schema: interviewTurnSchema }),
        maxRetries: 0,
        abortSignal,
      });
      return output;
    },
  );
}
