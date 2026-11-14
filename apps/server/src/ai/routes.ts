import { access, readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import type { AiStatus, Recognition } from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { photoPath } from '../photos/store.js';
import { recognizeMeal } from './recognize.js';
import { recognitionStatus } from './status.js';

const RESULT_TTL_MS = 10 * 60_000;

/** AI status and photo recognition (ADR-0007 "HTTP"). State is per app instance. */
export function aiRoutes({ config, model = null }: AppDeps) {
  // Successful and in-flight recognitions by "userId:photoId"; failures are dropped at once.
  const results = new Map<string, Promise<Recognition>>();
  // The photo each user is recognizing now: one call per user at a time.
  const running = new Set<number>();

  return new Hono<AuthEnv>()
    .get('/ai/status', requireUser, (c) =>
      c.json({
        recognition: recognitionStatus(model),
        // 'unavailable' comes with the last AI result (OCT-73).
        interview: model ? 'ready' : 'not_configured',
      } satisfies AiStatus),
    )
    .post('/photos/:id/recognize', requireUser, async (c) => {
      const status = recognitionStatus(model);
      if (status === 'not_configured')
        throw new ApiError(409, 'ai_not_configured');
      if (status === 'no_vision') throw new ApiError(409, 'ai_no_vision');

      const user = c.var.user;
      const photoId = c.req.param('id');
      const jpg = photoPath(config.dataDir, user.id, photoId, 'full');
      if (!jpg) throw new ApiError(404, 'not_found');

      // Join a running or finished call first, so a retry after a dropped connection never gets 429.
      const key = `${user.id}:${photoId}`;
      let result = results.get(key);
      if (!result) {
        if (running.has(user.id))
          throw new ApiError(429, 'too_many_attempts', { retryAfterSec: 5 });
        running.add(user.id);
        // No request signal: the call finishes even if the client goes away (ADR-0007).
        const preview = photoPath(config.dataDir, user.id, photoId, 'preview')!;
        result = readJpeg(jpg, preview).then((bytes) =>
          recognizeMeal(model!, bytes, user.locale),
        );
        results.set(key, result);
        result.then(
          () => setTimeout(() => results.delete(key), RESULT_TTL_MS).unref(),
          () => results.delete(key),
        );
        void result.finally(() => running.delete(user.id)).catch(() => {});
      }
      return c.json(await result);
    });
}

/** The full photo; 410 when only its preview is left after the retention period (ADR-0008). */
async function readJpeg(path: string, preview: string) {
  try {
    return new Uint8Array(await readFile(path));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    const expired = await access(preview).then(
      () => true,
      () => false,
    );
    throw new ApiError(
      expired ? 410 : 404,
      expired ? 'photo_expired' : 'not_found',
    );
  }
}
