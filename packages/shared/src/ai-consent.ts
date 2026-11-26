import { z } from 'zod';
import type { AiProviderId } from './ai-providers.js';

/**
 * What a user's consent is given to (ADR-0031 §3): the provider id, and for an OpenAI-compatible
 * server also its host. A new model or key keeps it, a new provider or host asks again.
 */
export function providerKey(settings: {
  provider: AiProviderId;
  baseUrl?: string | null;
}) {
  if (settings.provider !== 'openai-compatible') return settings.provider;
  return `openai-compatible:${parseUrl(settings.baseUrl ?? '')?.host ?? ''}`;
}

// Not URL.parse: older Safari in the PWA lacks it.
const parseUrl = (url: string) => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const ipv4 = (host: string) => {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p)))
    return null;
  const n = parts.map(Number);
  return n.every((b) => b <= 255) ? n : null;
};

const localIpv4 = ([a, b]: number[]) =>
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 172 && b! >= 16 && b! <= 31) ||
  (a === 192 && b === 168) ||
  (a === 169 && b === 254);

/**
 * A host inside the admin's network, by its name only, no DNS (ADR-0031 §5): data sent there does
 * not leave the network, so no consent is asked. An unparsable address is not local.
 */
export function isLocalAiHost(url: string) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  // URL lowercases the name and keeps IPv6 in brackets; a trailing dot is the same host.
  const host = parsed.hostname.replace(/\.$/, '');
  if (host.startsWith('[')) {
    const ip = host.slice(1, -1);
    if (ip === '::1' || ip === '::') return true;
    if (/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)) return true;
    // IPv4-mapped: URL writes ::ffff:127.0.0.1 as ::ffff:7f00:1.
    const mapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(ip);
    if (!mapped) return false;
    const hi = parseInt(mapped[1]!, 16);
    const lo = parseInt(mapped[2]!, 16);
    return localIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }
  const v4 = ipv4(host);
  if (v4) return localIpv4(v4);
  return (
    !host.includes('.') ||
    /(^|\.)localhost$/.test(host) ||
    /\.(local|lan|internal)$/.test(host)
  );
}

export const aiSourceSchema = z.enum(['server', 'own_key']);
export type AiSource = z.infer<typeof aiSourceSchema>;

export const aiConsentRequestSchema = z.object({
  providerKey: z.string().min(1).max(200),
});

/** GET /api/ai/consents: the user's consents and the provider the server would use for them. */
export interface AiConsentsResponse {
  consents: { providerKey: string; grantedAt: number }[];
  server: {
    providerKey: string;
    provider: AiProviderId;
    host: string | null;
    local: boolean;
  } | null;
}

/** details of 403 ai_consent_required (ADR-0031 §3). */
export interface AiConsentRequired {
  providerKey: string;
  provider: AiProviderId;
  host?: string;
  aiSource: AiSource;
}
