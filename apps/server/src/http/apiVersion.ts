import { createMiddleware } from 'hono/factory';
import { API_VERSION } from '@oct/shared';
import { ApiError } from './errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects writes from a web client built for an older API (ADR-0012, E-8.4).
 * No header (curl, other clients) passes; reads always pass.
 */
export const apiVersion = createMiddleware(async (c, next) => {
  const header = c.req.header('X-Api-Version');
  if (header !== undefined && !SAFE.has(c.req.method)) {
    const version = Number(header);
    if (!Number.isInteger(version) || version < API_VERSION) {
      throw new ApiError(409, 'client_outdated');
    }
  }
  await next();
});
