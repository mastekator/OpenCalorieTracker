import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import {
  AI_PROVIDERS,
  normalizeGtin,
  recipeParseRequestSchema,
  refineRequestSchema,
  type AiStatus,
  type LighterResponse,
  type RecipeParseResponse,
  type RefineResponse,
} from '@oct/shared';
import type { RouteDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { readBarcodes } from '../barcodes/read.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { photoPath } from '../photos/store.js';
import { readRecipe } from '../recipes/read.js';
import { lighterRecipe } from './lighter.js';
import { parseRecipe } from './parse.js';
import { readLabel, recognizeMeal } from './recognize.js';
import { refineMeal, type Refined } from './refine.js';
import { baseUrlHost, refineLimit } from './settings.js';
import { interviewStatus, recognitionStatus } from './status.js';

export const RESULT_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 24 * 3600_000;

/** AI status, photo recognition and refining (ADR-0007 "HTTP", ADR-0020 §5). State is per app instance. */
export function aiRoutes({ config, db, ai, photoBarcodes }: RouteDeps) {
  // Successful and in-flight AI calls by "userId:photoId" or "userId:refine:requestId"; failures are dropped at once.
  const results = new Map<string, Promise<unknown>>();
  // Users with an AI call running now: one call per user at a time, recognize and refine alike.
  const running = new Set<number>();
  // Refinements by "userId:sessionId" (ADR-0020 §6); `charged` keeps a retried requestId from counting twice.
  // shortcut: in memory, a restart resets the counts; fine per ADR-0020 §6.
  const sessions = new Map<
    string,
    { used: number; at: number; charged: Set<string> }
  >();

  /** Joins a running or finished call first, so a retry after a dropped connection never gets 429. */
  const once = <T>(key: string, userId: number, run: () => Promise<T>) => {
    const cached = results.get(key) as Promise<T> | undefined;
    if (cached) return cached;
    if (running.has(userId))
      throw new ApiError(429, 'too_many_attempts', { retryAfterSec: 5 });
    running.add(userId);
    // No request signal: the call finishes even if the client goes away (ADR-0007).
    const result = run();
    results.set(key, result);
    result.then(
      () => setTimeout(() => results.delete(key), RESULT_TTL_MS).unref(),
      () => results.delete(key),
    );
    void result.finally(() => running.delete(userId)).catch(() => {});
    return result;
  };

  return new Hono<AuthEnv>()
    .get('/ai/status', requireUser, (c) => {
      const { settings = null, model = null } = ai.current() ?? {};
      return c.json({
        recognition: recognitionStatus(model),
        interview: interviewStatus(model),
        providerName: settings ? AI_PROVIDERS[settings.provider].name : null,
        baseUrlHost:
          settings?.provider === 'openai-compatible'
            ? baseUrlHost(settings)
            : null,
        refineLimit: refineLimit(db),
      } satisfies AiStatus);
    })
    .post('/photos/:id/recognize', requireUser, async (c) => {
      // Taken once: a model change mid-request does not touch this call (ADR-0018 §3).
      const model = ai.current()?.model ?? null;
      const status = recognitionStatus(model);
      if (status === 'not_configured')
        throw new ApiError(409, 'ai_not_configured');
      if (status === 'no_vision') throw new ApiError(409, 'ai_no_vision');

      const user = c.var.user;
      const photoId = c.req.param('id');
      const label = c.req.query('mode') === 'label';
      const code = label ? normalizeGtin(c.req.query('barcode') ?? '') : null;
      if (label && !code) throw new ApiError(400, 'barcode_invalid');
      const jpg = photoPath(config.dataDir, user.id, photoId, 'full');
      if (!jpg) throw new ApiError(404, 'not_found');

      const preview = photoPath(config.dataDir, user.id, photoId, 'preview')!;
      const photoKey = `${user.id}:${photoId}`;
      const result = code
        ? once(`${photoKey}:label:${code}`, user.id, () =>
            readJpeg(jpg, preview).then((bytes) =>
              readLabel(model!, bytes, user.locale, code),
            ),
          )
        : once(photoKey, user.id, async () => {
            const bytes = await readJpeg(jpg, preview);
            // Waits for decoding only, never for Open Food Facts (AC-4.13); a failed read means no codes.
            const codes = await photoBarcodes(photoKey, () =>
              readBarcodes(bytes),
            ).catch(() => []);
            return recognizeMeal(
              model!,
              bytes,
              user.locale,
              undefined,
              undefined,
              codes,
            );
          });
      return c.json(await result);
    })
    .post(
      '/ai/refine',
      requireUser,
      validate('json', refineRequestSchema),
      async (c) => {
        const model = ai.current()?.model ?? null;
        if (!model) throw new ApiError(409, 'ai_not_configured');
        const user = c.var.user;
        const { mode, requestId, sessionId, photoId, text, dishes } =
          c.req.valid('json');
        if (mode === 'again' && !photoId)
          throw new ApiError(400, 'validation_failed', [
            { path: ['photoId'], code: 'invalid_type' },
          ]);

        const now = Date.now();
        for (const [k, s] of sessions)
          if (now - s.at > SESSION_TTL_MS) sessions.delete(k);
        const sessionKey = `${user.id}:${sessionId}`;
        const session = sessions.get(sessionKey) ?? {
          used: 0,
          at: now,
          charged: new Set<string>(),
        };
        const key = `${user.id}:refine:${requestId}`;
        const limit = refineLimit(db);
        // A retry of a running, finished or charged request is never refused (it costs nothing).
        if (
          limit !== null &&
          session.used >= limit &&
          !results.has(key) &&
          !session.charged.has(requestId)
        )
          throw new ApiError(429, 'refine_limit_reached');
        const charge = () => {
          if (session.charged.has(requestId)) return;
          session.charged.add(requestId);
          session.used++;
          session.at = Date.now();
          sessions.set(sessionKey, session);
        };

        // Ownership before vision: another user's photo is 404 even when it would not be sent.
        let photo: { jpg: string; preview: string } | undefined;
        if (photoId) {
          const jpg = photoPath(config.dataDir, user.id, photoId, 'full');
          const preview = photoPath(
            config.dataDir,
            user.id,
            photoId,
            'preview',
          );
          if (
            !jpg ||
            !preview ||
            !((await exists(jpg)) || (await exists(preview)))
          )
            throw new ApiError(404, 'not_found');
          photo = { jpg, preview };
        }
        if (mode === 'again' && recognitionStatus(model) === 'no_vision')
          throw new ApiError(409, 'ai_no_vision');

        const refine = async () => {
          let jpeg: Uint8Array | undefined;
          if (photo && mode === 'again')
            jpeg = await readJpeg(photo.jpg, photo.preview);
          // Refine sends the photo only when the model reads photos and it is still stored; else text only.
          else if (photo && recognitionStatus(model) === 'ready')
            jpeg = await readFile(photo.jpg).then(
              (b) => new Uint8Array(b),
              () => undefined,
            );
          const refined = await refineMeal(model, {
            mode,
            jpeg,
            dishes,
            text,
            locale: user.locale,
          });
          // Thrown inside the call so an empty answer is never cached (ADR-0020 §5).
          if (!refined.dishes.length)
            throw new ApiError(422, 'ai_empty_result');
          return refined;
        };
        const result = once<Refined>(key, user.id, () =>
          refine().then(
            (refined) => {
              charge();
              return refined;
            },
            (err: unknown) => {
              // A timeout may still have cost the provider; other failures do not count.
              if (err instanceof ApiError && err.timedOut) charge();
              throw err;
            },
          ),
        );
        const refined = await result;
        return c.json({
          ...refined,
          left:
            limit === null
              ? null
              : // From the map: a retry of a call that charged meanwhile holds a stale copy.
                Math.max(0, limit - (sessions.get(sessionKey)?.used ?? 0)),
        } satisfies RefineResponse);
      },
    )
    .post('/ai/recipes/:id/lighter', requireUser, async (c) => {
      const model = ai.current()?.model ?? null;
      if (!model) throw new ApiError(409, 'ai_not_configured');
      const user = c.var.user;
      const id = c.req.param('id');
      // The recipe is read here, never taken from the client (ADR-0023 §8).
      const row = /^\d+$/.test(id)
        ? (db
            .prepare(
              'SELECT rev, per100_kcal FROM recipes WHERE id = ? AND user_id = ?',
            )
            .get(Number(id), user.id) as
            { rev: number; per100_kcal: number | null } | undefined)
        : undefined;
      if (row === undefined) throw new ApiError(404, 'not_found');
      // No ingredients to make lighter (ADR-0035 §3).
      if (row.per100_kcal !== null)
        throw new ApiError(400, 'validation_failed');
      const { rev } = row;
      // By rev: a retry of the same recipe joins the call, an edited recipe asks afresh.
      const result = once<LighterResponse>(
        `${user.id}:lighter:${id}:${rev}`,
        user.id,
        () => lighterRecipe(model, readRecipe(db, Number(id)), user.locale),
      );
      return c.json(await result);
    })
    .post(
      '/ai/recipes/parse',
      requireUser,
      validate('json', recipeParseRequestSchema),
      async (c) => {
        const model = ai.current()?.model ?? null;
        if (!model) throw new ApiError(409, 'ai_not_configured');
        const user = c.var.user;
        const { text } = c.req.valid('json');
        // By a hash, so the key kept for 10 minutes holds no recipe text; a retry joins the call.
        const hash = createHash('sha256').update(text).digest('hex');
        const result = once<RecipeParseResponse>(
          `${user.id}:parse:${hash}`,
          user.id,
          () => parseRecipe(model, text, user.locale),
        );
        return c.json(await result);
      },
    );
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** The full photo; 410 when only its preview is left after the retention period (ADR-0008). */
export async function readJpeg(path: string, preview: string) {
  try {
    return new Uint8Array(await readFile(path));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    const expired = await exists(preview);
    throw new ApiError(
      expired ? 410 : 404,
      expired ? 'photo_expired' : 'not_found',
    );
  }
}
