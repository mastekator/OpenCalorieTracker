import { generateText } from 'ai';
import { Hono } from 'hono';
import {
  AI_PROVIDERS,
  createInviteRequestSchema,
  type AdminAiStatus,
  type CreatedLinkResponse,
  type Invite,
} from '@oct/shared';
import { callModel, noVisionError } from '../ai/common.js';
import { baseUrlHost, getAiSettings } from '../ai/settings.js';
import { providerState, redactSecrets } from '../ai/status.js';
import type { AppDeps } from '../app.js';
import { createLink, LINK_TTL } from '../auth/invites.js';
import { requireAdmin, type AuthEnv, type User } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';

const CHECK_INTERVAL_MS = 10_000;
const CHECK_TIMEOUT_MS = 20_000;
// Not 1 as in ADR-0013: OpenAI's Responses API rejects max_output_tokens below 16.
const CHECK_MAX_TOKENS = 16;
// 1×1 transparent PNG.
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Admin-only API (ADR-0003); everything under /api/admin answers 403 to other users (AC-2.8). */
export function adminRoutes({ config, db, model = null }: AppDeps) {
  const publicUrl = () => {
    if (!config.publicUrl) throw new ApiError(409, 'not_configured');
    return config.publicUrl;
  };
  const id = (raw: string) => {
    const n = Number(raw);
    if (!Number.isSafeInteger(n)) throw new ApiError(404, 'not_found');
    return n;
  };

  const settings = model ? getAiSettings(config) : null;
  const aiStatus = (): AdminAiStatus => {
    const { state, checkedAt, details } = providerState(model);
    return {
      provider: settings?.provider ?? null,
      providerName: settings ? AI_PROVIDERS[settings.provider].name : null,
      model: settings?.model ?? null,
      keySet: !!settings?.apiKey,
      baseUrlHost: baseUrlHost(settings),
      source: settings?.source ?? null,
      state,
      checkedAt,
      ...(details && {
        details: {
          status: details.status,
          message:
            details.message && redactSecrets(details.message, settings?.apiKey),
        },
      }),
    };
  };
  // Counted from the start of a check, so a double click never reaches the provider twice.
  let lastCheck = -Infinity;

  return (
    new Hono<AuthEnv & { Variables: { user: User } }>()
      .use('/admin/*', requireAdmin)
      .get('/admin/ai', (c) => c.json(aiStatus()))
      // One tiny request with an image, so no_vision is told apart (ADR-0013).
      .post('/admin/ai/check', async (c) => {
        if (!model) throw new ApiError(409, 'ai_not_configured');
        const wait = lastCheck + CHECK_INTERVAL_MS - Date.now();
        if (wait > 0)
          throw new ApiError(429, 'too_many_attempts', {
            retryAfterSec: Math.ceil(wait / 1000),
          });
        lastCheck = Date.now();
        try {
          await callModel(
            model,
            {
              op: 'check',
              promptVersion: 0,
              timeoutMs: CHECK_TIMEOUT_MS,
              mapError: noVisionError,
              logExtra: () => '',
            },
            (abortSignal) =>
              generateText({
                model,
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: 'Reply OK.' },
                      { type: 'file', data: PIXEL_PNG, mediaType: 'image/png' },
                    ],
                  },
                ],
                maxOutputTokens: CHECK_MAX_TOKENS,
                maxRetries: 0,
                abortSignal,
              }),
          );
        } catch (err) {
          // A check that found a failure is not itself an error: the state says what failed.
          if (!(err instanceof ApiError)) throw err;
        }
        return c.json(aiStatus());
      })
      .get('/admin/invites', (c) => {
        const now = Date.now();
        const rows = db
          .prepare(
            `SELECT id, email, created_at, expires_at, used_at, revoked_at FROM invites
           WHERE kind = 'invite' ORDER BY created_at DESC, id DESC`,
          )
          .all() as {
          id: number;
          email: string;
          created_at: number;
          expires_at: number;
          used_at: number | null;
          revoked_at: number | null;
        }[];
        return c.json(
          rows.map((r): Invite => ({
            id: r.id,
            email: r.email,
            createdAt: r.created_at,
            expiresAt: r.expires_at,
            usedAt: r.used_at,
            revokedAt: r.revoked_at,
            status: r.used_at
              ? 'used'
              : r.revoked_at
                ? 'revoked'
                : r.expires_at <= now
                  ? 'expired'
                  : 'pending',
          })),
        );
      })
      .post(
        '/admin/invites',
        validate('json', createInviteRequestSchema),
        (c) => {
          const { email } = c.req.valid('json');
          if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
            throw new ApiError(409, 'email_taken');
          }
          const link = createLink(db, publicUrl(), {
            kind: 'invite',
            email,
            ttl: LINK_TTL,
            createdBy: c.var.user.id,
          });
          return c.json(link satisfies CreatedLinkResponse, 201);
        },
      )
      // Also revokes recovery links: their ids come back from recovery-link.
      .post('/admin/invites/:id/revoke', (c) => {
        const inviteId = id(c.req.param('id'));
        const { changes } = db
          .prepare(
            `UPDATE invites SET revoked_at = @now
           WHERE id = @id AND used_at IS NULL AND revoked_at IS NULL AND expires_at > @now`,
          )
          .run({ now: Date.now(), id: inviteId });
        if (changes) return c.body(null, 204);
        if (db.prepare('SELECT 1 FROM invites WHERE id = ?').get(inviteId)) {
          throw new ApiError(409, 'invite_used');
        }
        throw new ApiError(404, 'not_found');
      })
      .post('/admin/users/:id/recovery-link', (c) => {
        const userId = id(c.req.param('id'));
        if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
          throw new ApiError(404, 'not_found');
        }
        const link = createLink(db, publicUrl(), {
          kind: 'recovery',
          userId,
          ttl: LINK_TTL,
          createdBy: c.var.user.id,
        });
        return c.json(link satisfies CreatedLinkResponse, 201);
      })
  );
}
