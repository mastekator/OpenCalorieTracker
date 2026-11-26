import { z } from 'zod';
import type { AiConsentsResponse } from '@oct/shared';
import { api } from '../api/client';

/**
 * The local copy of GET /api/ai/consents (ADR-0031 §6), one per user on this device.
 * Only a hint for screens that work offline: the server checks consent on every AI call.
 */
const key = (userId: number) => `oct.aiConsents.${userId}`;

const consentsSchema = z.object({
  consents: z.array(
    z.object({ providerKey: z.string(), grantedAt: z.number() }),
  ),
  server: z
    .object({
      providerKey: z.string(),
      provider: z.string(),
      host: z.string().nullable(),
      local: z.boolean(),
    })
    .nullable(),
}) as z.ZodType<AiConsentsResponse>;

/** null before the first load on this device, or when the copy is unreadable. */
export function readConsents(userId: number): AiConsentsResponse | null {
  try {
    return consentsSchema.parse(JSON.parse(localStorage.getItem(key(userId))!));
  } catch {
    return null;
  }
}

export const hasConsent = (userId: number, providerKey: string) =>
  !!readConsents(userId)?.consents.some((c) => c.providerKey === providerKey);

const write = (userId: number, value: AiConsentsResponse) =>
  localStorage.setItem(key(userId), JSON.stringify(value));

export async function refreshConsents(userId: number) {
  const value = await api('/api/ai/consents', consentsSchema);
  write(userId, value);
  return value;
}

/** After the server stored a consent: the copy has it at once, without another GET. */
export function addConsent(userId: number, providerKey: string) {
  const value = readConsents(userId) ?? { consents: [], server: null };
  if (!value.consents.some((c) => c.providerKey === providerKey))
    value.consents.push({ providerKey, grantedAt: Date.now() });
  write(userId, value);
}

export const clearConsents = (userId: number) =>
  localStorage.removeItem(key(userId));
