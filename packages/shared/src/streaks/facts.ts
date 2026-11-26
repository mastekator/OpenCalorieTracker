import { z } from 'zod';
import { AWARD_KEYS } from './awards.js';
import { CHALLENGE_KEYS, CHALLENGES_PER_MONTH } from './challenges.js';

/** `PUT /api/awards`: add-only upsert (ADR-0032 §3). */
export const awardsPutSchema = z.object({
  awards: z
    .array(
      z.object({
        key: z.string().refine((k) => AWARD_KEYS.has(k)),
        earnedOn: z.iso.date(),
        seen: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type AwardsPut = z.infer<typeof awardsPutSchema>;

/** `:month` of `PUT /api/challenges/:month`. */
export const challengeMonthParamSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

const challengeKeySchema = z.enum(CHALLENGE_KEYS);

/** `PUT /api/challenges/:month`: the first `keys` stored win, `done` merges, `closed` only turns on. */
export const challengeMonthPutSchema = z.object({
  keys: z
    .array(challengeKeySchema)
    .min(1)
    .max(CHALLENGES_PER_MONTH)
    .refine((keys) => new Set(keys).size === keys.length),
  done: z.partialRecord(challengeKeySchema, z.iso.date()),
  closed: z.boolean(),
});
export type ChallengeMonthPut = z.infer<typeof challengeMonthPutSchema>;
