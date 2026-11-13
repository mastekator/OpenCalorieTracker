import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { photoPath, savePhoto } from './store.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Photo upload and owner-only download (ADR-0008 "Upload", "Serving"). */
export function photoRoutes({ config }: AppDeps) {
  return new Hono<AuthEnv>()
    .post(
      '/photos',
      requireUser,
      // Raw bytes; the format is detected by sharp, not by Content-Type.
      bodyLimit({
        maxSize: MAX_PHOTO_BYTES,
        onError: () => {
          throw new ApiError(413, 'photo_too_large');
        },
      }),
      async (c) => {
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        const photoId = await savePhoto(config.dataDir, c.var.user.id, bytes);
        return c.json({ photoId }, 201);
      },
    )
    .get('/photos/:id', requireUser, async (c) => {
      const size = c.req.query('size') ?? 'preview';
      if (size !== 'preview' && size !== 'full')
        throw new ApiError(400, 'validation_failed');
      // Another user's or a malformed id is indistinguishable from a missing one (AC-4.4).
      const path = photoPath(
        config.dataDir,
        c.var.user.id,
        c.req.param('id'),
        size,
      );
      if (!path) throw new ApiError(404, 'not_found');
      const data = await readFile(path).catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') throw new ApiError(404, 'not_found');
        throw err;
      });
      return c.body(new Uint8Array(data), 200, {
        'Content-Type': size === 'full' ? 'image/jpeg' : 'image/webp',
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
    });
}
