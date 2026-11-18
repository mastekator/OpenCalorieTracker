import { access, readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import {
  AI_PROVIDERS,
  refineRequestSchema,
  type AiStatus,
  type Recognition,
  type RefineResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { photoPath } from '../photos/store.js';
import { recognizeMeal } from './recognize.js';
import { refineMeal, type Refined } from './refine.js';
import { baseUrlHost } from './settings.js';
import { interviewStatus, recognitionStatus } from './status.js';

const RESULT_TTL_MS = 10 * 60_000;

/** AI status, photo recognition and refining (ADR-0007 "HTTP", ADR-0020 §5). State is per app instance. */
export function aiRoutes({ config, ai }: AppDeps) {
  // Successful and in-flight AI calls by "userId:photoId" or "userId:refine:requestId"; failures are dropped at once.
  const results = new Map<string, Promise<unknown>>();
  // Users with an AI call running now: one call per user at a time, recognize and refine alike.
  const running = new Set<number>();

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
      const jpg = photoPath(config.dataDir, user.id, photoId, 'full');
      if (!jpg) throw new ApiError(404, 'not_found');

      const preview = photoPath(config.dataDir, user.id, photoId, 'preview')!;
      const result = once<Recognition>(`${user.id}:${photoId}`, user.id, () =>
        readJpeg(jpg, preview).then((bytes) =>
          recognizeMeal(model!, bytes, user.locale),
        ),
      );
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
        const { mode, requestId, photoId, text, dishes } = c.req.valid('json');
        if (mode === 'again' && !photoId)
          throw new ApiError(400, 'validation_failed', [
            { path: ['photoId'], code: 'invalid_type' },
          ]);

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

        const result = once<Refined>(
          `${user.id}:refine:${requestId}`,
          user.id,
          async () => {
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
          },
        );
        return c.json({
          ...(await result),
          left: null,
        } satisfies RefineResponse);
      },
    );
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** The full photo; 410 when only its preview is left after the retention period (ADR-0008). */
async function readJpeg(path: string, preview: string) {
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
