import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { API_VERSION } from '@oct/shared';
import {
  api,
  ApiError,
  ME_PATH,
  setOutdatedHandler,
  setUnauthenticatedHandler,
} from './client';

const respond = (status: number, body: string | null) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );
const schema = z.object({ ok: z.boolean() });
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => expect.unreachable(),
    (err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      return err as ApiError;
    },
  );

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('returns the parsed body on 2xx', async () => {
    respond(200, '{"ok":true}');
    await expect(api('/api/x', schema)).resolves.toEqual({ ok: true });
  });

  it('sends JSON bodies with same-origin credentials', async () => {
    respond(204, null);
    await api('/api/x', z.undefined(), { method: 'POST', body: { a: 1 } });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: '{"a":1}',
    });
  });

  it('sends a Blob as raw bytes with its own type', async () => {
    respond(204, null);
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await api('/api/x', z.undefined(), { method: 'POST', body: blob });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.body).toBe(blob);
    expect(init?.headers).toMatchObject({ 'Content-Type': 'image/jpeg' });
  });

  it('always sends the API version', async () => {
    respond(200, '{"ok":true}');
    await api('/api/x', schema);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.headers).toMatchObject({
      'X-Api-Version': String(API_VERSION),
    });
  });

  it('hands client_outdated to the update handler and still throws', async () => {
    const handler = vi.fn();
    setOutdatedHandler(handler);
    respond(409, '{"error":{"code":"client_outdated"}}');
    expect((await failure(api('/api/x', schema))).code).toBe('client_outdated');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('hands unauthenticated to the session handler, except for the session probe', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    respond(401, '{"error":{"code":"unauthenticated"}}');
    await failure(api(ME_PATH, schema));
    expect(handler).not.toHaveBeenCalled();
    respond(401, '{"error":{"code":"unauthenticated"}}');
    expect((await failure(api('/api/x', schema))).code).toBe('unauthenticated');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not treat a wrong password as an expired session', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    respond(401, '{"error":{"code":"invalid_credentials"}}');
    await failure(api('/api/auth/login', schema, { method: 'POST' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('maps an error body to ApiError(code)', async () => {
    respond(403, '{"error":{"code":"forbidden"}}');
    const err = await failure(api('/api/x', schema));
    expect([err.status, err.code]).toEqual([403, 'forbidden']);
  });

  it('maps a non-JSON error to internal', async () => {
    respond(502, '<html>Bad gateway</html>');
    const err = await failure(api('/api/x', schema));
    expect([err.status, err.code]).toEqual([502, 'internal']);
  });

  it('maps a body that fails the schema to internal', async () => {
    respond(200, '{"ok":"yes"}');
    expect((await failure(api('/api/x', schema))).code).toBe('internal');
  });

  it('maps a network failure to network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const err = await failure(api('/api/x', schema));
    expect([err.status, err.code]).toEqual([0, 'network']);
  });

  it('rethrows the abort error of a cancelled request, not network', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    const controller = new AbortController();
    controller.abort();
    await expect(
      api('/api/x', schema, { signal: controller.signal }),
    ).rejects.toBe(abort);
  });
});
