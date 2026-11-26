import { BlockList, isIP } from 'node:net';
import { ApiError } from '../http/errors.js';

const list = (v4: string[], v6: string[]) => {
  const b = new BlockList();
  for (const net of v4) {
    const [ip, bits] = net.split('/');
    b.addSubnet(ip!, Number(bits), 'ipv4');
  }
  for (const net of v6) {
    const [ip, bits] = net.split('/');
    b.addSubnet(ip!, Number(bits), 'ipv6');
  }
  return b;
};

/** Never reached at send time: loopback, link-local (cloud metadata), «this network», multicast. */
const blocked = list(
  ['127.0.0.0/8', '169.254.0.0/16', '0.0.0.0/8', '224.0.0.0/4'],
  ['::1/128', '::/128', 'fe80::/10', 'ff00::/8'],
);
/** Home network: RFC 1918 and unique local IPv6, where plain http is allowed. */
const privateNets = list(
  ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
  ['fc00::/7'],
);
const PRIVATE_SUFFIXES = ['.lan', '.local', '.home.arpa'];

const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
const check = (b: BlockList, ip: string) => {
  // BlockList matches only the family it is asked about: test the IPv4 inside ::ffff:a.b.c.d too.
  const mapped = v4Mapped.exec(ip)?.[1];
  if (mapped) return b.check(mapped, 'ipv4');
  const family = isIP(ip);
  return family !== 0 && b.check(ip, family === 4 ? 'ipv4' : 'ipv6');
};

/** At every delivery, for each address the name resolves to (ADR-0027 §3). */
export const isBlockedIp = (ip: string) => check(blocked, ip);

/** RFC 1918 or unique local IPv6: the admin's network, off limits to users' own AI addresses (ADR-0031 §2). */
export const isPrivateIp = (ip: string) => check(privateNets, ip);

/** The URL's host without IPv6 brackets. */
export const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, '');

/** On save: https to any host, plain http only to the home network; otherwise 400 http_not_private. */
export function checkWebhookUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol === 'https:') return;
  const host = hostOf(url).toLowerCase();
  const ok = isIP(host)
    ? check(privateNets, host)
    : PRIVATE_SUFFIXES.some((s) => host.endsWith(s));
  if (!ok) throw new ApiError(400, 'http_not_private');
}
