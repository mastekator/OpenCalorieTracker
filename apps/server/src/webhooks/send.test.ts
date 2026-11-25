import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors.js';
import { checkWebhookUrl, isBlockedIp } from './address.js';
import { createDeliver, sign } from './send.js';

let server: Server | undefined;
afterEach(
  () => new Promise<void>((r) => (server ? server.close(() => r()) : r())),
);

/** A receiver on 127.0.0.1 that records requests and answers with `reply`. */
async function receiver(
  reply: (res: import('node:http').ServerResponse) => void = (res) =>
    res.end('ok'),
) {
  const got: { req: IncomingMessage; body: string }[] = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      got.push({ req, body });
      reply(res);
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return { got, port: (server.address() as AddressInfo).port };
}

const out = (url: string) => ({
  url,
  secret: 's3cret',
  event: 'test',
  deliveryId: 'test-1',
  body: '{"event":"test"}',
});

describe('signature', () => {
  it('matches the reference in docs/webhooks.md', () => {
    const doc = readFileSync(
      new URL('../../../../docs/webhooks.md', import.meta.url),
      'utf8',
    );
    const value = (key: string) =>
      new RegExp(`^${key}:\\s+(.+)$`, 'm').exec(doc)![1]!;
    const t = Number(value('t'));
    expect(`t=${t},v1=${sign(value('secret'), t, value('body'))}`).toBe(
      value('signature'),
    );
  });
});

describe('addresses (ADR-0027 §3)', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.8.0.1', true],
    ['169.254.169.254', true],
    ['0.0.0.0', true],
    ['224.0.0.251', true],
    ['::1', true],
    ['::', true],
    ['fe80::1', true],
    ['ff02::1', true],
    ['::ffff:127.0.0.1', true],
    ['::ffff:169.254.169.254', true],
    ['192.168.1.10', false],
    ['10.0.0.5', false],
    ['93.184.216.34', false],
    ['fd00::1', false],
    ['2001:db8::1', false],
  ])('%s blocked at send time: %s', (ip, blocked) => {
    expect(isBlockedIp(ip)).toBe(blocked);
  });

  it.each([
    ['https://example.com/hook', true],
    ['https://127.0.0.1/hook', true], // caught at send time instead
    ['http://192.168.1.10:8123/api/webhook/x', true],
    ['http://172.20.0.3/x', true],
    ['http://[fd12::1]/x', true],
    ['http://ha.local:8123/x', true],
    ['http://ntfy.lan/x', true],
    ['http://box.home.arpa/x', true],
    ['http://example.com/x', false],
    ['http://8.8.8.8/x', false],
    ['http://homeassistant:8123/x', false],
    ['http://172.32.0.1/x', false],
  ])('%s may be saved: %s', (url, ok) => {
    const run = () => checkWebhookUrl(url);
    if (ok) expect(run).not.toThrow();
    else expect(run).toThrow(ApiError);
  });
});

describe('deliver', () => {
  it('sends a signed POST to an allowed address', async () => {
    const r = await receiver();
    const deliver = createDeliver({ blocked: () => false });
    const before = Math.floor(Date.now() / 1000);
    const res = await deliver(out(`http://127.0.0.1:${r.port}/hook`));
    expect(res).toMatchObject({ status: 200, error: null });
    const { req, body } = r.got[0]!;
    expect(body).toBe('{"event":"test"}');
    expect(req.headers['x-oct-event']).toBe('test');
    expect(req.headers['x-oct-delivery']).toBe('test-1');
    const sig = String(req.headers['x-oct-signature']);
    const t = Number(/^t=(\d+),/.exec(sig)![1]);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(sig).toBe(`t=${t},v1=${sign('s3cret', t, body)}`);
  });

  it.each(['127.0.0.1', '169.254.169.254', '[::1]'])(
    'blocks %s without sending',
    async (host) => {
      const r = await receiver();
      const res = await createDeliver()(out(`http://${host}:${r.port}/hook`));
      expect(res).toMatchObject({ status: null, error: 'blocked_address' });
      expect(r.got).toHaveLength(0);
    },
  );

  it('blocks a name that resolves to loopback, even next to a public address', async () => {
    const r = await receiver();
    const deliver = createDeliver({
      lookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    });
    const res = await deliver(out(`http://rebind.example:${r.port}/hook`));
    expect(res.error).toBe('blocked_address');
    expect(r.got).toHaveLength(0);
  });

  it('connects to the address it checked', async () => {
    const r = await receiver();
    const deliver = createDeliver({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      blocked: () => false,
    });
    const res = await deliver(out(`http://anything.example:${r.port}/hook`));
    expect(res.status).toBe(200);
    expect(r.got[0]!.req.headers.host).toBe(`anything.example:${r.port}`);
  });

  it('does not follow a redirect', async () => {
    const r = await receiver((res) => {
      res.writeHead(302, { location: '/elsewhere' }).end();
    });
    const res = await createDeliver({ blocked: () => false })(
      out(`http://127.0.0.1:${r.port}/hook`),
    );
    expect(res).toMatchObject({ status: 302, error: null });
    expect(r.got).toHaveLength(1);
  });

  it('gives up after the timeout', async () => {
    const r = await receiver(() => {}); // never answers
    const res = await createDeliver({ blocked: () => false, timeoutMs: 100 })(
      out(`http://127.0.0.1:${r.port}/hook`),
    );
    expect(res).toMatchObject({ status: null, error: 'timeout' });
    server!.closeAllConnections();
  });

  it('reports a refused connection', async () => {
    const r = await receiver();
    await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;
    const res = await createDeliver({ blocked: () => false })(
      out(`http://127.0.0.1:${r.port}/hook`),
    );
    expect(res).toMatchObject({ status: null, error: 'refused' });
  });
});
