import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import type { AuthMethod, Registration, SetupError } from '@oct/shared';
import { aiProviders } from './ai/settings.js';

// Local enums: @oct/shared ships TS sources, so the server imports only its types at runtime.
const authMethod = z.enum(['password', 'passkey'] satisfies AuthMethod[]);
const registration = z.enum(['invite', 'open'] satisfies Registration[]);

const envSchema = z.object({
  PUBLIC_URL: z.string().optional(),
  AUTH_METHODS: z
    .string()
    .default('password,passkey')
    .transform((s) => [...new Set(s.split(',').map((m) => m.trim()))])
    .pipe(z.array(authMethod).min(1)),
  REGISTRATION: registration.default('invite'),
  ADMIN_EMAIL: z.string().trim().toLowerCase().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  // The image sets DATA_DIR=/data; this default keeps `pnpm dev` off the filesystem root.
  DATA_DIR: z.string().default('./data'),
  WEB_DIST: z.string().default('../web/dist'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  AI_PROVIDER: z.enum(aiProviders).optional(),
  AI_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.url().optional(),
});

export interface Config {
  /** Origin of PUBLIC_URL, or null when it is missing or unusable (a setup error, not a crash). */
  publicUrl: string | null;
  authMethods: AuthMethod[];
  registration: Registration;
  adminEmail: string | undefined;
  adminPassword: string | undefined;
  trustProxyHops: number;
  dataDir: string;
  webDist: string;
  port: number;
  host: string;
  ai: {
    provider: (typeof aiProviders)[number] | undefined;
    model: string | undefined;
    apiKey: string | undefined;
    baseUrl: string | undefined;
  };
}

/** Parses the environment once. Nonsense values throw; installation problems surface via setupErrors(). */
export function loadConfig(env: Record<string, string | undefined>): Config {
  // `KEY=` in an env file means "not set".
  const set = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== ''),
  );
  const parsed = envSchema.safeParse(set);
  if (!parsed.success)
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;
  return {
    publicUrl: publicOrigin(e.PUBLIC_URL),
    authMethods: e.AUTH_METHODS,
    registration: e.REGISTRATION,
    adminEmail: e.ADMIN_EMAIL || undefined,
    adminPassword: e.ADMIN_PASSWORD,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    dataDir: e.DATA_DIR,
    webDist: e.WEB_DIST,
    port: e.PORT,
    host: e.HOST,
    ai: {
      provider: e.AI_PROVIDER,
      model: e.AI_MODEL,
      apiKey: e.AI_API_KEY,
      baseUrl: e.AI_BASE_URL,
    },
  };
}

/** A bare origin; https required except localhost (WebAuthn rejects plain http and IP RP ids). */
function publicOrigin(raw: string | undefined): string | null {
  const url = raw ? URL.parse(raw) : null;
  if (!url) return null;
  const secure =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && url.hostname === 'localhost');
  const bare =
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password;
  return secure && bare ? url.origin : null;
}

/** All installation problems, in display order; the first one is shown on the sign-in screen. */
export function setupErrors(config: Config, db: Database): SetupError[] {
  const errors: SetupError[] = [];
  if (!config.publicUrl) errors.push('public_url_invalid');
  // The admin from env is only used to seed an empty database.
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    if (!config.adminEmail) errors.push('admin_missing');
    if (config.authMethods.includes('password') && !config.adminPassword) {
      errors.push('admin_password_missing');
    }
  }
  return errors;
}

export const setupErrorMessages: Record<SetupError, string> = {
  public_url_invalid:
    'PUBLIC_URL must be the origin users open, e.g. https://food.example.com (https required except for localhost, no path).',
  admin_missing: 'ADMIN_EMAIL is not set and the database has no users yet.',
  admin_password_missing:
    'ADMIN_PASSWORD is not set, but password sign-in is enabled and the database has no users yet.',
};
