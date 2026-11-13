import type { ErrorCode } from '@oct/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal };

/**
 * Calls the API and returns the response parsed by `schema`.
 * Any failure (network, non-2xx, unreadable or unexpected body) throws ApiError.
 */
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  { method = 'GET', body, signal }: Options = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, 'internal');
  }

  let data: unknown;
  try {
    data = res.status === 204 ? undefined : await res.json();
  } catch {
    throw new ApiError(res.status, 'internal');
  }

  if (!res.ok) {
    const error = (data as { error?: { code?: unknown; details?: unknown } })
      ?.error;
    throw typeof error?.code === 'string'
      ? new ApiError(res.status, error.code as ErrorCode, error.details)
      : new ApiError(res.status, 'internal');
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(res.status, 'internal');
  return parsed.data;
}
