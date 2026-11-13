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
import { failureNote, isSchemaError, toApiError } from './common.js';
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
  // A timer, not AbortSignal.timeout(): fake timers in tests must be able to fire it.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), INTERVIEW_TIMEOUT_MS);
  const abortSignal = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;
  const started = Date.now();
  let result = 'ok';
  let fields = '';
  let failure = '';
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const { output } = await generateText({
          model,
          system: interviewSystemPrompt(locale, draft, today, units),
          messages: toModelMessages(history),
          output: Output.object({ schema: interviewTurnSchema }),
          maxRetries: 0,
          abortSignal,
        });
        // Field names only: values and texts are personal data.
        fields = Object.entries(output.extracted)
          .filter(([, v]) => v != null)
          .map(([k]) => k)
          .join(',');
        return output;
      } catch (err) {
        if (attempt === 1 && isSchemaError(err) && !abortSignal.aborted)
          continue;
        throw err;
      }
    }
  } catch (err) {
    failure = failureNote(err);
    if (signal?.aborted) {
      result = 'aborted';
      throw err;
    }
    const apiError = toApiError(err, timeout.signal.aborted);
    result = apiError.code;
    throw apiError;
  } finally {
    clearTimeout(timer);
    console.log(
      `ai.interview provider=${model.provider} model=${model.modelId} prompt=${INTERVIEW_PROMPT_VERSION} ms=${Date.now() - started} fields=${fields} result=${result}${failure}`,
    );
  }
}
