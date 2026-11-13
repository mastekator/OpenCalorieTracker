import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorBody, ErrorCode } from '@oct/shared';

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

// Hono's own exceptions (csrf, malformed JSON) mapped to our codes.
const httpCodes: Partial<Record<number, ErrorCode>> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
};

export function onError(err: Error, c: Context) {
  let status: ContentfulStatusCode = 500;
  let error: ErrorBody['error'] = { code: 'internal' };
  if (err instanceof ApiError) {
    status = err.status;
    error =
      err.details === undefined
        ? { code: err.code }
        : { code: err.code, details: err.details };
  } else if (err instanceof HTTPException && httpCodes[err.status]) {
    status = err.status as ContentfulStatusCode;
    error = { code: httpCodes[err.status]! };
  } else {
    // Never log request bodies: they may hold passwords or photos.
    console.error(`[error] ${c.req.method} ${c.req.path}`, err);
  }
  return c.json({ error } satisfies ErrorBody, status);
}
