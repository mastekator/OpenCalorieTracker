import type { IncomingMessage } from 'node:http';
import type { Context } from 'hono';

/**
 * The client address as seen by the outermost trusted proxy (ADR-0003): the `hops`-th
 * X-Forwarded-For entry from the right, or the socket address with 0 hops or a shorter header.
 */
export function clientIp(c: Context, hops: number): string {
  const forwarded = (c.req.header('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops > 0 && forwarded.length >= hops) {
    return forwarded[forwarded.length - hops]!;
  }
  // `incoming` is absent only under app.request() in tests.
  const env = c.env as { incoming?: IncomingMessage } | undefined;
  return env?.incoming?.socket.remoteAddress ?? '';
}
