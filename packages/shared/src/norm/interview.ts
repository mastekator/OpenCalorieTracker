import { z } from 'zod';
import { REQUIRED_FIELDS, type NormResult } from './calculate.js';
import {
  activitySchema,
  goalSchema,
  sexSchema,
  type Profile,
} from './schemas.js';

// Models often send null for "not mentioned"; null and absent mean the same here.
const opt = <T extends z.ZodType>(schema: T) => schema.nullish();

const measure = <U extends string>(units: readonly [U, ...U[]]) =>
  z.object({ value: z.number(), unit: z.enum(units) }).strict();

const heightSchema = measure(['cm', 'in', 'unspecified']);
const weightSchema = measure(['kg', 'lb', 'unspecified']);

/**
 * What the model returns for one user message (ADR-0015 §2): fields it understood
 * and a short reply. Values are not range-checked here; advanceInterview checks them.
 */
export const interviewTurnSchema = z
  .object({
    extracted: z
      .object({
        sex: opt(sexSchema),
        birthDate: opt(z.iso.date()),
        ageYears: opt(z.number().int()),
        height: opt(heightSchema),
        weight: opt(weightSchema),
        activity: opt(activitySchema),
        goal: opt(goalSchema),
        targetWeight: opt(z.union([weightSchema, z.literal('unknown')])),
        deadline: opt(z.union([z.iso.date(), z.literal('unknown')])),
      })
      .strict(),
    reply: z.string().min(1).max(500),
  })
  .strict();
export type InterviewTurn = z.infer<typeof interviewTurnSchema>;

/** A profile field the agent asks about or reports on. */
export type InterviewField = keyof Profile;
export type MeasureField = 'heightCm' | 'weightKg' | 'targetWeightKg';

/** Agent draft (stored as JSON): checked profile fields plus answers the profile cannot hold. */
export interface InterviewDraft {
  profile: Profile;
  /** "I don't know" answers, so they are not asked again. */
  unknown: ('targetWeightKg' | 'deadline')[];
  /** `${targetWeightKg}|${deadline}` already warned about (once per pair). */
  paceWarned: string | null;
}

export type InterviewState = 'active' | 'summary' | 'minor';

/**
 * Assistant messages. Structured kinds carry data, not text: the client renders
 * them from its dictionary. Heights and weights are in the user's units.
 */
export type AssistantMessage =
  | { kind: 'text'; text: string; ask?: InterviewField }
  | { kind: 'opening'; known: Profile }
  | {
      kind: 'invalid';
      field: InterviewField;
      min?: number | string;
      max?: number | string;
    }
  | {
      kind: 'unit_check';
      field: MeasureField;
      value: number;
      asUnit: 'cm' | 'in' | 'kg' | 'lb';
      converted: number;
    }
  | {
      kind: 'pace';
      level: 'fast' | 'danger';
      deadline: string;
      safeDeadline: string | null;
    }
  | { kind: 'minor' }
  | { kind: 'limit' }
  | {
      kind: 'summary';
      draft: Profile;
      norm: Extract<NormResult, { status: 'ok' }>;
    }
  | { kind: 'edit' };

export type ChatMessage =
  | { role: 'user'; kind: 'text'; text: string }
  | ({ role: 'assistant' } & AssistantMessage);

/** POST /api/norm-agent/messages: a new user message, or a retry of the last one after an error. */
export const agentMessageRequestSchema = z.union([
  z.object({ text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ retry: z.literal(true) }).strict(),
]);
export type AgentMessageRequest = z.infer<typeof agentMessageRequestSchema>;

/** Norm agent responses (ADR-0015 §5): the whole dialog on GET, the turn's new messages otherwise. */
export interface AgentResponse {
  messages: ChatMessage[];
  draft: InterviewDraft;
  state: InterviewState;
  userTurns: number;
}

/** First missing field in question order; target and deadline only for lose/gain, "unknown" counts as answered. */
export function nextField({
  profile: p,
  unknown,
}: Pick<InterviewDraft, 'profile' | 'unknown'>): InterviewField | null {
  const required = REQUIRED_FIELDS.find((k) => p[k] === null);
  if (required) return required;
  if (p.goal === 'maintain') return null;
  if (p.targetWeightKg === null)
    return unknown.includes('targetWeightKg') ? null : 'targetWeightKg';
  if (p.deadline === null && !unknown.includes('deadline')) return 'deadline';
  return null;
}
