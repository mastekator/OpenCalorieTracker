import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import {
  authMethodSchema,
  emailSchema,
  passwordProblems,
  registrationSchema,
  type AuthMethod,
  type Registration,
  type SetupError,
} from '@oct/shared';
import { isCommonPassword } from './auth/password.js';
import { aiProviders } from './ai/settings.js';

const envSchema = z.object({
  PUBLIC_URL: z.string().optional(),
  AUTH_METHODS: z
    .string()
    .default('password,passkey')
    .transform((s) => [...new Set(s.split(',').map((m) => m.trim()))])
    .pipe(z.array(authMethodSchema).min(1)),
  REGISTRATION: registrationSchema.default('invite'),
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
  ALLOW_OUTBOUND_REQUESTS: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
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
  /** False when the process cannot write DATA_DIR; set at startup by dataDirWritable(). */
  dataDirWritable: boolean;
  webDist: string;
  port: number;
  host: string;
  ai: {
    provider: (typeof aiProviders)[number] | undefined;
    model: string | undefined;
    apiKey: string | undefined;
    baseUrl: string | undefined;
  };
  /** ALLOW_OUTBOUND_REQUESTS; when set, it overrides the admin's switch (ADR-0034 §5). */
  outbound: boolean | undefined;
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
    dataDirWritable: true,
    webDist: e.WEB_DIST,
    port: e.PORT,
    host: e.HOST,
    ai: {
      provider: e.AI_PROVIDER,
      model: e.AI_MODEL,
      apiKey: e.AI_API_KEY,
      baseUrl: e.AI_BASE_URL,
    },
    outbound: e.ALLOW_OUTBOUND_REQUESTS,
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
  if (!config.dataDirWritable) errors.push('data_dir_not_writable');
  if (!config.publicUrl) errors.push('public_url_invalid');
  // The admin from env is only used to seed an empty database.
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    const { adminEmail: email, adminPassword: password } = config;
    // Without ADMIN_EMAIL the setup wizard creates the admin, unless env started a config install.
    if (!email) {
      if (password) errors.push('admin_missing');
      return errors;
    }
    if (!emailSchema.safeParse(email).success) {
      errors.push('admin_email_invalid');
    }
    if (config.authMethods.includes('password')) {
      if (!password) errors.push('admin_password_missing');
      else if (
        passwordProblems(password, email).length ||
        isCommonPassword(password)
      ) {
        errors.push('admin_password_invalid');
      }
    }
  }
  return errors;
}

/**
 * ADR-0021 §1: the first-run wizard runs only on a healthy install with an empty database
 * and no ADMIN_EMAIL; anything else is a setup error, a config install or normal work.
 */
export function setupMode(config: Config, db: Database): 'wizard' | null {
  return !config.adminEmail &&
    !setupErrors(config, db).length &&
    !db.prepare('SELECT 1 FROM users LIMIT 1').get()
    ? 'wizard'
    : null;
}

/** Creates `dir` if needed and proves this process can write it and the database in it. */
export function dataDirWritable(dir: string) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, '.write-test');
    writeFileSync(probe, '');
    rmSync(probe);
    const db = join(dir, 'oct.sqlite');
    if (existsSync(db)) accessSync(db, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export const setupErrorMessages: Record<SetupError, string> = {
  data_dir_not_writable:
    'DATA_DIR is not writable for this user; set PUID/PGID to the owner of the data folder or fix its permissions.',
  public_url_invalid:
    'PUBLIC_URL must be the origin users open, e.g. https://food.example.com (https required except for localhost, no path).',
  admin_missing:
    'ADMIN_PASSWORD is set but ADMIN_EMAIL is not; set both for an unattended install or remove ADMIN_PASSWORD to use the setup wizard.',
  admin_email_invalid: 'ADMIN_EMAIL is not a valid email address.',
  admin_password_missing:
    'ADMIN_PASSWORD is not set, but password sign-in is enabled and the database has no users yet.',
  admin_password_invalid:
    'ADMIN_PASSWORD must be 8-128 characters with a letter, a digit and a symbol, differ from ADMIN_EMAIL and not be a common password.',
};
