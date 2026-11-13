import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { API_VERSION } from '@oct/shared';
import { api, ApiError, setOutdatedHandler } from './client';

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

  it('maps a network failure to internal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect((await failure(api('/api/x', schema))).code).toBe('internal');
  });
});
