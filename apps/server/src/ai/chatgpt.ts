import { createHash, randomBytes } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { APICallError } from 'ai';
import { z } from 'zod';
import type { ChatgptSignIn } from '@oct/shared';
import { ApiError } from '../http/errors.js';
import type { Secrets } from '../secrets.js';

// Endpoints from https://auth.openai.com/.well-known/openid-configuration; flow and parameters from
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in (checked 2026-11-27).
export const AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize';
export const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';
export const REVOKE_URL = 'https://auth.openai.com/api/accounts/oauth/revoke';
// Nobody listens there: the admin pastes the address the browser fails to open (ADR-0031 §4).
// 1459, not Codex CLI's 1455, so a CLI on the admin's computer does not catch the redirect.
export const REDIRECT_URI = 'http://127.0.0.1:1459/auth/callback';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const DYNAMIC_CLIENT = 'dynamic_agent_client';
const AGENT_NAME = 'OpenCalorieTracker';

export const ACCESS_PURPOSE = 'chatgpt.access';
export const REFRESH_PURPOSE = 'chatgpt.refresh';
export const STATE_TTL_MS = 10 * 60_000;
export const REFRESH_BEFORE_MS = 5 * 60_000;
const TIMEOUT_MS = 15_000;

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  id_token: z.string().optional(),
  earliest_refresh_at: z.number().optional(),
});

interface AuthRow {
  client_id: string;
  account_label: string | null;
  access_enc: string;
  refresh_enc: string;
  expires_at: number;
  earliest_refresh_at: number | null;
  signed_in_at: number;
  rev: number;
}

const b64url = (bytes: Buffer) => bytes.toString('base64url');

/** The id_token claims; read only for the nonce and the label: the token came straight from OpenAI over TLS. */
function claims(idToken: string | undefined) {
  try {
    const payload = idToken?.split('.')[1];
    return payload
      ? (JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
          nonce?: unknown;
          email?: unknown;
        })
      : null;
  } catch {
    return null;
  }
}

// shortcut: OAuth sends epoch seconds, the docs do not say; a value already in ms is kept.
const toMs = (t: number) => (t < 1e12 ? t * 1000 : t);

/** A failed refresh as a provider error, so aiResultOf turns 401 into auth_error. */
const authFailed = (message: string, statusCode = 401) =>
  new APICallError({
    message,
    url: TOKEN_URL,
    requestBodyValues: {},
    statusCode,
    isRetryable: false,
  });

const signInFailed = (reason: string) =>
  new ApiError(400, 'chatgpt_sign_in_failed', { reason });

/**
 * The admin's ChatGPT sign-in (ADR-0031 §4): PKCE by pasting the callback address, tokens sealed in
 * chatgpt_auth, one refresh at a time per process. Tokens never leave this module except as the
 * access token for the provider call.
 */
export function createChatgptAuth({
  db,
  secrets,
  fetch = globalThis.fetch,
  now = Date.now,
}: {
  db: Database;
  secrets: Secrets;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}) {
  const pending = new Map<
    string,
    { verifier: string; nonce: string; clientId: string; expiresAt: number }
  >();
  let refreshing: Promise<string> | null = null;

  const row = () =>
    db.prepare('SELECT * FROM chatgpt_auth WHERE id = 1').get() as
      AuthRow | undefined;

  const post = (url: string, body: Record<string, string>) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  /** The token response, or the status and OAuth error of a refused one. */
  const tokenRequest = async (body: Record<string, string>) => {
    const res = await post(TOKEN_URL, { ...body, resource: RESOURCE });
    const json = (await res.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    const tokens = res.ok ? tokensSchema.safeParse(json) : null;
    return tokens?.success
      ? { tokens: tokens.data }
      : {
          status: res.status,
          error: String(json?.error ?? 'invalid_response'),
        };
  };

  const sealed = (t: z.infer<typeof tokensSchema>) => ({
    access: secrets.seal(t.access_token, ACCESS_PURPOSE),
    refresh: secrets.seal(t.refresh_token, REFRESH_PURPOSE),
    expiresAt: now() + t.expires_in * 1000,
    earliest: t.earliest_refresh_at ? toMs(t.earliest_refresh_at) : null,
  });

  const refresh = async (): Promise<string> => {
    const saved = row();
    if (!saved) throw authFailed('ChatGPT is not signed in');
    const refreshToken = secrets.open(saved.refresh_enc, REFRESH_PURPOSE);
    if (!refreshToken) throw authFailed('ChatGPT tokens cannot be read');
    const res = await tokenRequest({
      grant_type: 'refresh_token',
      client_id: saved.client_id,
      refresh_token: refreshToken,
    });
    if (!res.tokens) {
      console.error(
        `[warn] ChatGPT token refresh failed: ${res.status} ${res.error}`,
      );
      // 400/401 is a dead refresh token: sign in again (AC-B1.6). Other statuses may pass.
      throw authFailed(
        `ChatGPT token refresh failed: ${res.error}`,
        res.status === 400 || res.status === 401 ? 401 : res.status,
      );
    }
    const s = sealed(res.tokens);
    // The refresh token is single-use: saved before the access token is handed out. rev guards
    // against a sign-in or sign-out that happened while this request was in flight.
    const { changes } = db
      .prepare(
        `UPDATE chatgpt_auth SET access_enc = ?, refresh_enc = ?, expires_at = ?, earliest_refresh_at = ?,
           rev = rev + 1 WHERE id = 1 AND rev = ?`,
      )
      .run(s.access, s.refresh, s.expiresAt, s.earliest, saved.rev);
    if (!changes) throw authFailed('ChatGPT sign-in changed during refresh');
    return res.tokens.access_token;
  };

  return {
    /** The signed-in account for the admin screen; never a token. */
    signIn(): ChatgptSignIn | null {
      const saved = row();
      return saved
        ? { accountLabel: saved.account_label, signedInAt: saved.signed_in_at }
        : null;
    },

    /** The authorization address the admin opens; the state lives 10 minutes, for one attempt. */
    start(): string {
      for (const [state, p] of pending)
        if (p.expiresAt <= now()) pending.delete(state);
      const clientId = row()?.client_id ?? DYNAMIC_CLIENT;
      const state = b64url(randomBytes(32));
      const verifier = b64url(randomBytes(32));
      const nonce = b64url(randomBytes(16));
      pending.set(state, {
        verifier,
        nonce,
        clientId,
        expiresAt: now() + STATE_TTL_MS,
      });
      const hostId = (
        db.prepare('SELECT host_id FROM instance_ai').get() as {
          host_id: string;
        }
      ).host_id;
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        resource: RESOURCE,
        state,
        nonce,
        code_challenge: b64url(createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256',
        ext_agent_host_id: `urn:uuid:${hostId}`,
        // The docs send the name on the first registration only.
        ...(clientId === DYNAMIC_CLIENT && { agent_name_hint: AGENT_NAME }),
      }).toString();
      return url.toString();
    },

    /** Checks the pasted callback address, exchanges the code and saves the tokens. */
    async finish(callbackUrl: string): Promise<ChatgptSignIn> {
      const params = URL.parse(callbackUrl.trim())?.searchParams;
      const state = params?.get('state');
      const p = state ? pending.get(state) : undefined;
      if (state) pending.delete(state);
      if (!params || !p || p.expiresAt <= now())
        throw new ApiError(400, 'chatgpt_state_invalid');
      const error = params.get('error');
      if (error) throw signInFailed(error);
      const code = params.get('code');
      const issued = params.get('client_id');
      // A new registration returns its client id here; a reauth may omit it but must not change it.
      const clientId =
        p.clientId === DYNAMIC_CLIENT ? issued : (issued ?? p.clientId);
      if (!code || !clientId || clientId === DYNAMIC_CLIENT)
        throw signInFailed('invalid_callback');
      if (clientId !== p.clientId && p.clientId !== DYNAMIC_CLIENT)
        throw signInFailed('client_id_mismatch');
      const res = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: p.verifier,
        redirect_uri: REDIRECT_URI,
      });
      if (!res.tokens) {
        console.error(
          `[warn] ChatGPT sign-in failed: ${res.status} ${res.error}`,
        );
        throw signInFailed(res.error);
      }
      const idClaims = claims(res.tokens.id_token);
      if (res.tokens.id_token && idClaims?.nonce !== p.nonce)
        throw signInFailed('nonce_mismatch');
      const accountLabel =
        typeof idClaims?.email === 'string' ? idClaims.email : null;
      const s = sealed(res.tokens);
      const signedInAt = now();
      db.prepare(
        `INSERT INTO chatgpt_auth (id, client_id, account_label, access_enc, refresh_enc, expires_at,
           earliest_refresh_at, signed_in_at, rev) VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT (id) DO UPDATE SET client_id = excluded.client_id, account_label = excluded.account_label,
           access_enc = excluded.access_enc, refresh_enc = excluded.refresh_enc, expires_at = excluded.expires_at,
           earliest_refresh_at = excluded.earliest_refresh_at, signed_in_at = excluded.signed_in_at,
           rev = chatgpt_auth.rev + 1`,
      ).run(
        clientId,
        accountLabel,
        s.access,
        s.refresh,
        s.expiresAt,
        s.earliest,
        signedInAt,
      );
      console.log('[info] ChatGPT signed in by admin');
      return { accountLabel, signedInAt };
    },

    /** A valid access token, refreshed under 5 minutes before expiry; one refresh per process (E-4). */
    accessToken(): Promise<string> {
      const saved = row();
      const access = saved && secrets.open(saved.access_enc, ACCESS_PURPOSE);
      const left = saved ? saved.expires_at - now() : 0;
      if (
        access &&
        left > 0 &&
        (left > REFRESH_BEFORE_MS || (saved.earliest_refresh_at ?? 0) > now())
      )
        return Promise.resolve(access);
      return (refreshing ??= refresh().finally(() => {
        refreshing = null;
      }));
    },

    /** Deletes the tokens; revoking at OpenAI is best effort, the row is gone either way. */
    async signOut() {
      const saved = row();
      if (!saved) return;
      db.prepare('DELETE FROM chatgpt_auth').run();
      console.log('[info] ChatGPT signed out by admin');
      const token = secrets.open(saved.refresh_enc, REFRESH_PURPOSE);
      if (token)
        await post(REVOKE_URL, {
          token,
          token_type_hint: 'refresh_token',
          client_id: saved.client_id,
        }).catch(() => undefined);
    },
  };
}

export type ChatgptAuth = ReturnType<typeof createChatgptAuth>;
