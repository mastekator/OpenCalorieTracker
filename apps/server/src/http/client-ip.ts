import type { IncomingMessage } from 'node:http';
import { isIPv6 } from 'node:net';
import type { Context } from 'hono';

/**
 * The client address as seen by the outermost trusted proxy (ADR-0003): the `hops`-th
 * X-Forwarded-For entry from the right, or the socket address with 0 hops or a shorter header.
 * IPv6 comes back as its /64, since one client owns the whole prefix.
 */
export function clientIp(c: Context, hops: number): string {
  const forwarded = (c.req.header('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops > 0 && forwarded.length >= hops) {
    return normalizeIp(forwarded[forwarded.length - hops]!);
  }
  // `incoming` is absent only under app.request() in tests.
  const env = c.env as { incoming?: IncomingMessage } | undefined;
  return normalizeIp(env?.incoming?.socket.remoteAddress ?? '');
}

/** IPv4-mapped IPv6 → IPv4, other IPv6 → `a:b:c:d::/64`; anything else unchanged. */
export function normalizeIp(raw: string): string {
  const ip = raw.split('%')[0]!; // zone id
  if (!isIPv6(ip)) return raw;
  // An embedded dotted IPv4 tail takes two groups.
  const groupsOf = (s: string) =>
    s ? s.split(':').flatMap((g) => (g.includes('.') ? v4Groups(g) : [g])) : [];
  const [head = '', tail] = ip.split('::');
  const h = groupsOf(head);
  const t = groupsOf(tail ?? '');
  const g = [
    ...h,
    ...Array<string>(8 - h.length - t.length).fill('0'),
    ...t,
  ].map((x) => parseInt(x, 16));
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255].join('.');
  }
  return `${g
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`;
}

const v4Groups = (v4: string) => {
  const [a, b, c, d] = v4.split('.').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
};
