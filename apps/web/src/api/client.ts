import { API_VERSION, type ErrorCode } from '@oct/shared';
import type { z } from 'zod';

/** Server codes plus `network`: the request never reached the server (client only). */
export type ClientErrorCode = ErrorCode | 'network';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

// Set by app/update.ts once the service worker is registered.
let onOutdated = () => location.reload();
export function setOutdatedHandler(handler: () => void) {
  onOutdated = handler;
}

// Set by app/SessionContext.tsx: a 401 means the session expired mid-use.
let onUnauthenticated = () => {};
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

// Set by app/update.ts: a write went through, so the «save again» bar can go (OCT-25 6.2).
let onWriteOk = () => {};
export function setWriteOkHandler(handler: () => void) {
  onWriteOk = handler;
}

// The network is up but the server doesn't answer (E-2.4). Only real requests change it, no pings.
let serverDown = false;
const serverListeners = new Set<() => void>();
function setServerDown(down: boolean) {
  if (down === serverDown) return;
  serverDown = down;
  serverListeners.forEach((l) => l());
}
export const isServerDown = () => serverDown;
export function subscribeServerDown(listener: () => void) {
  serverListeners.add(listener);
  return () => void serverListeners.delete(listener);
}

/** The session probe: its 401 means "not signed in", not "session expired". */
export const ME_PATH = '/api/auth/me';

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
      headers: {
        Accept: 'application/json',
        // The server rejects writes from an outdated client (ADR-0012).
        'X-Api-Version': String(API_VERSION),
        // A Blob (photo upload, ADR-0008) goes as raw bytes with its own type.
        ...(body === undefined
          ? {}
          : {
              'Content-Type':
                body instanceof Blob ? body.type : 'application/json',
            }),
      },
      body:
        body === undefined || body instanceof Blob
          ? body
          : JSON.stringify(body),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (navigator.onLine) setServerDown(true);
    throw new ApiError(0, 'network');
  }
  // A proxy answers for the app when it is down; any other answer is the server's own.
  setServerDown([502, 503, 504].includes(res.status));

  let data: unknown;
  try {
    data = res.status === 204 ? undefined : await res.json();
  } catch {
    throw new ApiError(res.status, 'internal');
  }

  if (!res.ok) {
    const error = (data as { error?: { code?: unknown; details?: unknown } })
      ?.error;
    if (error?.code === 'client_outdated') onOutdated();
    if (error?.code === 'unauthenticated' && path !== ME_PATH)
      onUnauthenticated();
    throw typeof error?.code === 'string'
      ? new ApiError(res.status, error.code as ErrorCode, error.details)
      : new ApiError(res.status, 'internal');
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(res.status, 'internal');
  if (method !== 'GET') onWriteOk();
  return parsed.data;
}
