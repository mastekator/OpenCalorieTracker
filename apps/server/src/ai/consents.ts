import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  aiConsentRequestSchema,
  type AiConsentRequired,
  type AiConsentsResponse,
} from '@oct/shared';
import type { Database } from 'better-sqlite3';
import type { RouteDeps } from '../app.js';
import { requireUser, type AuthEnv, type User } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import type { AiRuntime } from './runtime.js';
import { baseUrlHost } from './settings.js';

const hasConsent = (db: Database, userId: number, key: string) =>
  db
    .prepare('SELECT 1 FROM ai_consents WHERE user_id = ? AND provider_key = ?')
    .get(userId, key) !== undefined;

/**
 * The model for this request's user, checked before any of their data goes out (ADR-0031 §3):
 * 409 without a model, 403 ai_consent_required without consent to a non-local provider.
 * Puts aiSource on the request, so every AI error of it carries details.aiSource.
 */
export async function userAi(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any route path and input
  c: Context<AuthEnv & { Variables: { user: User } }, any, any>,
  db: Database,
  ai: AiRuntime,
) {
  const user = c.var.user;
  const resolved = ai.forUser(user);
  if (!resolved) throw new ApiError(409, 'ai_not_configured');
  c.set('aiSource', resolved.source);
  if (!resolved.local && !hasConsent(db, user.id, resolved.providerKey)) {
    const host = baseUrlHost(resolved.settings);
    throw new ApiError(403, 'ai_consent_required', {
      providerKey: resolved.providerKey,
      provider: resolved.settings.provider,
      ...(host && { host }),
      aiSource: resolved.source,
    } satisfies AiConsentRequired);
  }
  return { ...resolved, model: await resolved.build() };
}

/** The user's consents to send their data to an AI provider through the server (ADR-0031 §3). */
export function consentRoutes({ db, ai }: RouteDeps) {
  return new Hono<AuthEnv>()
    .get('/ai/consents', requireUser, (c) => {
      const user = c.var.user;
      const consents = db
        .prepare(
          'SELECT provider_key AS providerKey, granted_at AS grantedAt FROM ai_consents WHERE user_id = ? ORDER BY granted_at',
        )
        .all(user.id) as AiConsentsResponse['consents'];
      const resolved = ai.forUser(user);
      return c.json({
        consents,
        server: resolved && {
          providerKey: resolved.providerKey,
          provider: resolved.settings.provider,
          host: baseUrlHost(resolved.settings),
          local: resolved.local,
        },
      } satisfies AiConsentsResponse);
    })
    .post(
      '/ai/consents',
      requireUser,
      validate('json', aiConsentRequestSchema),
      (c) => {
        // Any key is kept: a consent may be for the user's own key (OCT-484), not the server's.
        db.prepare(
          'INSERT OR IGNORE INTO ai_consents (user_id, provider_key, granted_at) VALUES (?, ?, ?)',
        ).run(c.var.user.id, c.req.valid('json').providerKey, Date.now());
        return c.body(null, 204);
      },
    )
    .delete('/ai/consents/:providerKey', requireUser, (c) => {
      // A call already past the check still finishes (E-7).
      db.prepare(
        'DELETE FROM ai_consents WHERE user_id = ? AND provider_key = ?',
      ).run(c.var.user.id, c.req.param('providerKey'));
      return c.body(null, 204);
    });
}
