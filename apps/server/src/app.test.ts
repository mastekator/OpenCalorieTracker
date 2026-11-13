import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, onError } from './http/errors.js';
import { validate } from './http/validate.js';
import { testApp } from './test/app.js';

describe('GET /api/health', () => {
  it('returns ok and the version', async () => {
    const res = await testApp().app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
    });
  });
});

describe('GET /api/config', () => {
  it('returns public settings only', async () => {
    const res = await testApp({ REGISTRATION: 'open' }).app.request(
      '/api/config',
    );
    expect(await res.json()).toEqual({
      version: expect.any(String),
      apiVersion: 1,
      publicUrl: 'http://localhost:3000',
      authMethods: ['password', 'passkey'],
      registration: 'open',
      setupError: null,
    });
  });
});

describe('errors', () => {
  const app = new Hono();
  app.onError(onError);
  app.post('/v', validate('json', z.object({ grams: z.number().int() })), (c) =>
    c.json({ grams: c.req.valid('json').grams }),
  );
  app.get('/conflict', () => {
    throw new ApiError(409, 'email_taken');
  });
  app.get('/boom', () => {
    throw new Error('boom');
  });
  const post = (body: string) =>
    app.request('/v', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });

  it('unknown API route is 404 not_found, not the SPA', async () => {
    const res = await testApp().app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found' } });
  });

  it('validation failure is 400 with zod issues', async () => {
    const res = await post('{"grams":"a lot"}');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'validation_failed',
        details: [{ path: ['grams'], code: 'invalid_type' }],
      },
    });
  });

  it('passes valid input through', async () => {
    expect(await (await post('{"grams":120}')).json()).toEqual({ grams: 120 });
  });

  it('malformed JSON is validation_failed', async () => {
    const res = await post('{');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'validation_failed' } });
  });

  it('ApiError keeps its status and code', async () => {
    const res = await app.request('/conflict');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'email_taken' } });
  });

  it('unexpected errors are 500 internal', async () => {
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 'internal' } });
  });
});

describe('csrf', () => {
  const postForm = (origin: string, env = {}) =>
    testApp(env).app.request('/api/anything', {
      method: 'POST',
      body: 'a=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    });

  it('rejects a foreign origin with 403 forbidden', async () => {
    const res = await postForm('https://evil.example.com');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'forbidden' } });
  });

  it('lets the PUBLIC_URL origin through', async () => {
    expect((await postForm('http://localhost:3000')).status).toBe(404);
  });

  it('trusts no origin while PUBLIC_URL is invalid', async () => {
    expect(
      (await postForm('http://localhost:3000', { PUBLIC_URL: '' })).status,
    ).toBe(403);
  });
});
