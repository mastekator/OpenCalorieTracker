import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Database } from 'better-sqlite3';
import { Hono, type MiddlewareHandler } from 'hono';
import {
  aiDraftSchema,
  aiModelsRequestSchema,
  isLocalAiHost,
  type AiCheckResult,
  type AiDraft,
  type AiModelsResponse,
  type OwnAi,
} from '@oct/shared';
import type { RouteDeps } from '../app.js';
import { requireUser, type AuthEnv, type User } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import type { Secrets } from '../secrets.js';
import { hostOf, isBlockedIp, isPrivateIp } from '../webhooks/address.js';
import {
  draftConnection,
  fetchModels,
  redacted,
  runCheck,
  throttle,
} from './check.js';
import { createModel } from './model.js';
import { forgetOwnResult, ownResult, recordOwnResult } from './status.js';
import {
  userKeysAllowed,
  type AiProvider,
  type AiSettings,
} from './settings.js';

/** Encryption purpose of user_ai_settings.api_key_enc (ADR-0031 §2). */
export const OWN_KEY_PURPOSE = 'user_ai.api_key';

/** The user's own key row; keyUnreadable when the key does not decrypt (another secret.key). */
export function ownAiRow(db: Database, secrets: Secrets, userId: number) {
  const row = db
    .prepare(
      'SELECT provider, model, base_url, api_key_enc, api_key_last4 FROM user_ai_settings WHERE user_id = ?',
    )
    .get(userId) as
    | {
        provider: AiProvider;
        model: string;
        base_url: string | null;
        api_key_enc: string | null;
        api_key_last4: string | null;
      }
    | undefined;
  if (!row) return null;
  const apiKey =
    row.api_key_enc === null
      ? undefined
      : secrets.open(row.api_key_enc, OWN_KEY_PURPOSE);
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url ?? undefined,
    apiKey: apiKey ?? undefined,
    keyLast4: row.api_key_last4,
    keyUnreadable: apiKey === null,
  };
}

type Connection = Omit<AiSettings, 'source'>;

const privateAddress = () => new ApiError(400, 'ai_base_url_private');

/**
 * A user's own address must lead out of the admin's network (SSRF, ADR-0031 §2): https, not local
 * by name, and every address the name resolves to is public.
 */
export async function assertPublicUrl(raw: string) {
  const url = URL.parse(raw);
  if (url?.protocol !== 'https:' || isLocalAiHost(raw)) throw privateAddress();
  const host = hostOf(url);
  // A failed or empty lookup is refused: fetch resolves again and might reach a private address.
  const ips = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!ips.length || ips.some((ip) => isBlockedIp(ip) || isPrivateIp(ip)))
    throw privateAddress();
}

// shortcut: checks the name before each request but does not pin the address, so a DNS rebind
// between lookup and connect gets through; pin it with an undici Agent lookup if that matters.
const publicFetch: typeof fetch = async (input, init) => {
  await assertPublicUrl(input instanceof Request ? input.url : String(input));
  // A redirect would skip the check: a public host could send the request to a private one.
  return fetch(input, { ...init, redirect: 'error' });
};

/** The model of a user's own key; a non-admin's own address is checked at every request. */
export async function ownModel(
  user: Partial<Pick<User, 'role'>>,
  settings: Connection,
) {
  const guard = user.role !== 'admin' && !!settings.baseUrl;
  if (guard) await assertPublicUrl(settings.baseUrl!);
  return (await createModel(settings, guard ? publicFetch : undefined))!;
}

type Env = AuthEnv & { Variables: { user: User } };

/** The user's own AI key (ADR-0031 §2): only their own row, the key itself never leaves the server. */
export function ownAiRoutes({ config, db, secrets }: RouteDeps) {
  const throttleCheck = throttle();
  // Separate, so Save right after a passed check is not refused.
  const throttleSave = throttle();

  const allowed: MiddlewareHandler<Env> = async (c, next) => {
    // Opening the settings is what clears the "keys were turned off" notice, allowed or not.
    if (c.req.method === 'GET' && c.req.path === '/api/ai/own')
      db.prepare('UPDATE users SET ai_notice_seen = 1 WHERE id = ?').run(
        c.var.user.id,
      );
    if (!userKeysAllowed(db, config))
      throw new ApiError(403, 'ai_user_keys_disabled');
    await next();
  };

  const view = (userId: number): OwnAi => {
    const row = ownAiRow(db, secrets, userId);
    if (!row) return null;
    const { state, checkedAt, details } = ownResult(userId) ?? {
      state: 'unknown',
      checkedAt: null,
    };
    return {
      provider: row.provider,
      model: row.model,
      baseUrl: row.baseUrl ?? null,
      keyLast4: row.keyLast4,
      keyUnreadable: row.keyUnreadable,
      state,
      checkedAt,
      ...redacted(details, row.apiKey),
    };
  };

  /** A draft's key and address; a missing key is taken only from a readable saved one. */
  const connection = (
    userId: number,
    draft: Pick<AiDraft, 'provider' | 'apiKey' | 'baseUrl'>,
  ) => {
    // A ChatGPT subscription is the admin's server provider only, never an own key (ADR-0031 §4, B2).
    if (draft.provider === 'chatgpt')
      throw new ApiError(400, 'validation_failed');
    const saved = ownAiRow(db, secrets, userId);
    if (!draft.apiKey && saved?.keyUnreadable)
      throw new ApiError(400, 'ai_key_required');
    return draftConnection(draft, saved);
  };

  return (
    new Hono<Env>()
      .use('/ai/own', requireUser, allowed)
      .use('/ai/own/*', requireUser, allowed)
      .get('/ai/own', (c) => c.json(view(c.var.user.id)))
      // Always checked first; nothing is saved when the check fails (AC-A.2), no force for users.
      .put('/ai/own', validate('json', aiDraftSchema), async (c) => {
        const user = c.var.user;
        const draft = c.req.valid('json');
        const settings: Connection = {
          provider: draft.provider,
          model: draft.model,
          ...connection(user.id, draft),
        };
        throttleSave(user.id);
        const result = await runCheck(
          await ownModel(user, settings),
          settings.apiKey,
        );
        if (result.state !== 'ok')
          throw new ApiError(422, 'ai_check_failed', {
            state: result.state,
            ...redacted(result.details, settings.apiKey),
          } satisfies Omit<AiCheckResult, 'checkedAt'>);
        // The admin may have turned own keys off while the check ran.
        if (!userKeysAllowed(db, config))
          throw new ApiError(403, 'ai_user_keys_disabled');
        db.prepare(
          `INSERT INTO user_ai_settings (user_id, provider, model, base_url, api_key_enc, api_key_last4, updated_at)
         VALUES (@userId, @provider, @model, @baseUrl, @enc, @last4, @now)
         ON CONFLICT (user_id) DO UPDATE SET provider = @provider, model = @model, base_url = @baseUrl,
           api_key_enc = @enc, api_key_last4 = @last4, updated_at = @now`,
        ).run({
          userId: user.id,
          provider: settings.provider,
          model: settings.model,
          baseUrl: settings.baseUrl ?? null,
          enc: settings.apiKey
            ? secrets.seal(settings.apiKey, OWN_KEY_PURPOSE)
            : null,
          last4: settings.apiKey?.slice(-4) ?? null,
          now: Date.now(),
        });
        recordOwnResult(user.id, result);
        return c.json(view(user.id));
      })
      .delete('/ai/own', (c) => {
        db.prepare('DELETE FROM user_ai_settings WHERE user_id = ?').run(
          c.var.user.id,
        );
        forgetOwnResult(c.var.user.id);
        return c.json(null satisfies OwnAi);
      })
      .post('/ai/own/check', async (c) => {
        const user = c.var.user;
        const row = ownAiRow(db, secrets, user.id);
        if (!row) throw new ApiError(409, 'ai_not_configured');
        throttleCheck(user.id);
        recordOwnResult(
          user.id,
          await runCheck(await ownModel(user, row), row.apiKey),
        );
        return c.json(view(user.id));
      })
      // No throttle: listing models changes nothing, as for the admin.
      .post(
        '/ai/own/models',
        validate('json', aiModelsRequestSchema),
        async (c) => {
          const user = c.var.user;
          const draft = c.req.valid('json');
          const { apiKey, baseUrl } = connection(user.id, draft);
          const guard = user.role !== 'admin' && !!baseUrl;
          if (guard) await assertPublicUrl(baseUrl!);
          const models = await fetchModels({
            provider: draft.provider,
            apiKey,
            baseUrl,
            ...(guard && { fetch: publicFetch }),
          });
          return c.json({ models } satisfies AiModelsResponse);
        },
      )
  );
}
