import { createHmac } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { hostOf, isBlockedIp } from './address.js';

/** The whole request, response included (E-4). */
export const WEBHOOK_TIMEOUT_MS = 10_000;

export interface DeliveryResult {
  /** HTTP status; null: no response. */
  status: number | null;
  /** timeout | refused | blocked_address | dns | network */
  error: string | null;
  durationMs: number;
}

export interface Outgoing {
  url: string;
  /** Sealed-open secret as the user sees it (base64url); the HMAC key is its UTF-8 bytes. */
  secret: string;
  event: string;
  /** X-OCT-Delivery: the same for every retry of one event. */
  deliveryId: string;
  /** Sent exactly as signed. */
  body: string;
}

export type Deliver = (out: Outgoing) => Promise<DeliveryResult>;

/** hex HMAC-SHA256(secret, "<t>.<body>"), as in docs/webhooks.md. */
export const sign = (secret: string, t: number, body: string) =>
  createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

export const signatureHeader = (secret: string, body: string, now: number) => {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${sign(secret, t, body)}`;
};

const errorOf = (e: NodeJS.ErrnoException) =>
  e.name === 'AbortError' || e.name === 'TimeoutError'
    ? 'timeout'
    : e.code === 'ECONNREFUSED'
      ? 'refused'
      : e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN'
        ? 'dns'
        : 'network';

/**
 * Posts one signed event. The host is resolved here and every address checked, then the socket
 * connects to exactly that address (no DNS rebinding in between). No redirects: a 3xx is the result.
 * `lookup` and `blocked` are for tests only.
 */
export function createDeliver({
  lookup = (host: string) => dnsLookup(host, { all: true }),
  blocked = isBlockedIp,
  timeoutMs = WEBHOOK_TIMEOUT_MS,
}: {
  lookup?: (host: string) => Promise<{ address: string; family: number }[]>;
  blocked?: (ip: string) => boolean;
  timeoutMs?: number;
} = {}): Deliver {
  return async ({ url, secret, event, deliveryId, body }) => {
    const started = Date.now();
    const done = (status: number | null, error: string | null) => ({
      status,
      error,
      durationMs: Date.now() - started,
    });
    const target = new URL(url);
    let addresses: { address: string; family: number }[];
    try {
      addresses = await lookup(hostOf(target));
    } catch (e) {
      return done(null, errorOf(e as NodeJS.ErrnoException));
    }
    if (!addresses.length || addresses.some((a) => blocked(a.address)))
      return done(null, 'blocked_address');
    const pinned = addresses[0]!;
    const pin: LookupFunction = (_host, options, cb) =>
      options.all
        ? cb(null, [pinned])
        : cb(null, pinned.address, pinned.family);
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise<DeliveryResult>((resolve) => {
      const req = request(
        target,
        {
          method: 'POST',
          // An IP literal never calls lookup; it was checked above all the same.
          lookup: pin,
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            'content-type': 'application/json',
            'user-agent': 'OpenCalorieTracker-Webhook',
            'x-oct-event': event,
            'x-oct-delivery': deliveryId,
            'x-oct-signature': signatureHeader(secret, body, Date.now()),
          },
        },
        (res) => {
          // The receiver's body is not kept; the timeout still covers reading it.
          res.resume();
          res.on('end', () => resolve(done(res.statusCode ?? null, null)));
          res.on('error', (e) => resolve(done(null, errorOf(e))));
        },
      );
      req.on('error', (e) => resolve(done(null, errorOf(e))));
      req.end(body);
    });
  };
}

export const deliver = createDeliver();
