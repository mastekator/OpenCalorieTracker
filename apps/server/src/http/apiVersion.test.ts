import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { API_VERSION } from '@oct/shared';
import { apiVersion } from './apiVersion.js';
import { onError } from './errors.js';

const app = new Hono();
app.onError(onError);
app.use('*', apiVersion);
app.all('/x', (c) => c.json({ ok: true }));

const send = (method: string, version?: string) =>
  app.request('/x', {
    method,
    headers: version === undefined ? {} : { 'X-Api-Version': version },
  });

describe('apiVersion', () => {
  it('rejects a write from an older client with 409 client_outdated', async () => {
    const res = await send('POST', String(API_VERSION - 1));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'client_outdated' } });
  });

  it('rejects an unreadable version on a write', async () => {
    expect((await send('PATCH', 'abc')).status).toBe(409);
  });

  it('lets through a write without the header', async () => {
    expect((await send('POST')).status).toBe(200);
  });

  it('lets through a write with the current version', async () => {
    expect((await send('DELETE', String(API_VERSION))).status).toBe(200);
  });

  it('never blocks reads', async () => {
    expect((await send('GET', String(API_VERSION - 1))).status).toBe(200);
  });
});
