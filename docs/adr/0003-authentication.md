# ADR-0003: Authentication — passwords, passkeys, sessions, invites, brute-force guard

**Status:** Proposed
**Date:** 2026-11-13
**Deciders:** @mastekator95 (owner), @lead

## Context

Approved product document "Product OCT-2" (owner decisions of 2026-11-13) requires: sign-in by password and/or passkey selected by env; one admin defined in env and created only on an empty database; registration by one-time invite (default) or open; recovery links from the admin and a container command for the admin; no e-mail; brute-force protection that times out and blocks the **IP + device** pair and the whole IP, never the account; 90-day sliding sessions in an httpOnly cookie. Installs sit behind an arbitrary reverse proxy that terminates HTTPS. No external services.

## Decision

### Passwords

- Hash with Node's built-in `crypto.scrypt` (no native dependency): N = 2^15, r = 8, p = 1, 16-byte random salt, 32-byte key, stored as `scrypt$N$r$p$salt$hash` (base64) so parameters can be raised later with rehash-on-login. ~100 ms and 32 MB per hash on a Raspberry Pi 4; comparison with `timingSafeEqual`.
- Policy (AC-0.8) lives in `packages/shared` as one function used by the form and by the server: 8–128 chars, a letter, a digit, a non-alphanumeric character, not equal to the email, not in the common-password list. The list: the top 10 000 passwords from a public list, lower-cased, shipped as a text file in `apps/server` (~80 KB), loaded into a `Set` on first use. The client checks the four simple rules live; the list check is server-only (`password_too_common`).
- A login for a non-existent email still runs one scrypt over a dummy hash, so response time does not reveal accounts (AC-5.2).

### Passkeys (WebAuthn)

- `@simplewebauthn/server` on the server, `@simplewebauthn/browser` on the client.
- RP id = hostname of `PUBLIC_URL`, expected origin = origin of `PUBLIC_URL`, RP name "OpenCalorieTracker".
- Registration: `residentKey: 'required'`, `userVerification: 'preferred'`, `user.id` = `users.webauthn_user_id` (random, never the email), `excludeCredentials` = the user's passkeys. Default passkey name is derived from the User-Agent ("iPhone · Safari").
- Sign-in is username-less: `allowCredentials` empty, the browser offers discoverable credentials; the web uses conditional UI (`autocomplete="username webauthn"`). The returned user handle + credential id find the passkey; unknown credential → `passkey_unknown` (E-5.3).
- Challenges are kept in an in-memory `Map` keyed by a random `challengeId` returned with the options, TTL 5 minutes, single use. `shortcut: lost on restart and not shared between processes; fine for a single-process container, move to a table if we ever run several.`
- Passkey sign-in is **not** subject to the brute-force guard (AC-5.10).
- If the page origin differs from `PUBLIC_URL`, the client does not call WebAuthn and shows "Open the app at <PUBLIC_URL>" (AC-7.2).

### Sessions and device id

- Session token: 32 random bytes, base64url, in cookie `oct_session` — `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=90 days` (`Secure` is dropped only when `PUBLIC_URL` is `http://localhost`). The table stores `sha256(token)`. On each authenticated request the session is looked up; if `last_seen_at` is older than one hour, `expires_at` and the cookie are extended to now + 90 days (bounded writes). Expired, missing or deleted-user sessions → 401 `unauthenticated` (E-5.4). Logout deletes the row and clears the cookie.
- Device id: cookie `oct_device` — 16 random bytes, `HttpOnly; Secure; SameSite=Strict; Max-Age=400 days` (browser maximum), set on the first request that lacks it and refreshed on sign-in. It is only a key for the brute-force guard, never a fingerprint.
- Middleware: `session` (sets `c.var.user` when valid), `requireUser`, `requireAdmin`. The `/api/auth/*` routes that sign in are the only unauthenticated mutating routes.

### Real client IP

`client-ip.ts`: with `TRUST_PROXY_HOPS = n > 0`, take the n-th address from the right of `X-Forwarded-For` (the address the outermost trusted proxy saw); with `0`, or if the header has fewer entries, use the socket address. Default `1` (one reverse proxy — the standard install, required anyway for HTTPS). README explains `2` for Cloudflare Tunnel + local proxy and the symptom of a wrong value (everyone shares one IP).

### Brute-force guard (`auth/guard.ts`)

One table `login_guards`, two kinds of rows. A _failure_ is: wrong password, unknown email, failed open registration (AC-3.6), unknown/invalid invite or recovery token (E-4.5).

- **Device row** (`kind='device'`, key = IP + device id): on failure `fail_count++`, `last_email`, `user_agent`; at 5 → `timeout_until = now + 15 min`, `fail_count = 0`, `timeout_count++`; at the 3rd timeout without a success in between → `blocked_at = now`. Success on password sign-in deletes the row (AC-5.9).
- **IP row** (`kind='ip'`, key = IP, device id NULL): fixed window — if `window_started_at` is older than 1 h, reset `fail_count`; at 20 failures in the window → 15-minute timeout; timeouts counted in a 24 h window, the 3rd → `blocked_at`. Success does **not** reset it. Requests without a device cookie count only here.
- Before checking a password (or token, or open registration) the guard rejects with 429 `too_many_attempts { retryAfterSec }`, `device_blocked` or `ip_blocked`; such attempts are not counted (AC-5.7). Blocks are lifted only by the admin (`DELETE` the row) or by the CLI. Timeouts expire by time and are not listed.
- All guard updates for one request run in one transaction.

### Admin bootstrap

On startup, after migrations, if `users` is empty:

- `ADMIN_EMAIL` valid, and (`password` enabled ⇒ `ADMIN_PASSWORD` passes the policy) → create the admin (`role='admin'`, `password_from_config=1` when a password is set).
- Passkey-only → create the admin without a password and print to the log a one-time setup link (a `recovery` invite for the admin, 24 h). If the admin still has no passkey on a later start and the link expired, print a new one (AC-1.5).
- Otherwise set `setupError` (ADR-0001) and log the reason. No HTTP route can create an admin (AC-1.2).
- With users present: if `ADMIN_EMAIL`/`ADMIN_PASSWORD` differ from the stored admin, log a warning and change nothing (AC-1.6). Also log a warning with the number of users who have no enabled sign-in method left (E-7.2).

### Invites and recovery links

- Token: 32 random bytes, base64url; stored as `sha256`. Links: `${PUBLIC_URL}/invite#<token>` and `${PUBLIC_URL}/recover#<token>` — the token sits in the URL fragment, so it never reaches proxy access logs or `Referer`. The full link is returned once in the create response and never again.
- Invite: email required; 409 `email_taken` if a user has it; a new invite for the same email revokes the pending one; 7 days. Recovery link: for an existing user, same rules, revokes the user's previous pending recovery link.
- `POST /api/auth/invites/check { token }` → `{ kind, email, status }` where status is `valid | expired | used | invalid` (revoked and unknown are both `invalid`, E-4.2/E-4.4); invalid tokens count as guard failures.
- Completing registration/recovery re-checks the token and consumes it atomically in the same transaction as creating the user or credential: `UPDATE invites SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?` and proceed only if one row changed — the second concurrent request gets 409 `invite_used` (E-3.3). For passkeys the user row and the passkey are inserted only after the WebAuthn response verifies, so a cancelled dialog leaves nothing behind (E-3.2).
- Open registration (`REGISTRATION=open`) uses the same endpoint without a token; a taken email returns the generic 409 `registration_failed` and counts as a guard failure (AC-3.6).

### Admin maintenance CLI

`node dist/cli.js reset-admin-access` (README: `docker exec <container> node dist/cli.js reset-admin-access`). Opens the same SQLite file, deletes all `login_guards` rows, creates an admin recovery link (24 h) and prints it. No HTTP surface.

### API surface (OCT-2)

```
GET    /api/config                                   public
GET    /api/auth/me                                  session user or 401
POST   /api/auth/login               {email,password}
POST   /api/auth/passkey/login/options | /verify
POST   /api/auth/logout
POST   /api/auth/invites/check       {token}
POST   /api/auth/register            {token?, email?, name, password?}         password path
POST   /api/auth/register/passkey/options | /verify  {token?, email?, name, …}  passkey path
POST   /api/auth/recover             {token, password}
POST   /api/auth/recover/passkey/options | /verify
PUT    /api/account/password         {currentPassword?, newPassword}
GET    /api/account/passkeys ; POST /api/account/passkeys/options | /verify
PATCH  /api/account/passkeys/:id {name} ; DELETE /api/account/passkeys/:id   (409 last_sign_in_method)
GET|POST /api/admin/invites ; POST /api/admin/invites/:id/revoke
GET    /api/admin/users ; POST /api/admin/users/:id/recovery-link ; DELETE /api/admin/users/:id
GET    /api/admin/blocks ; DELETE /api/admin/blocks/:id
```

A disabled method's endpoints answer 403 `method_disabled` (AC-0.9). "Last sign-in method" counts only enabled methods.

## Options Considered

- **argon2id (`argon2` / `@node-rs/argon2`).** Stronger memory-hard default, but a native dependency for each architecture. scrypt is built in and adequate with these parameters. Rejected for MVP.
- **Signed stateless session cookie (JWT/iron).** No session table, but no server-side revocation — deleting a user must kill their sessions immediately (E-5.4). Rejected.
- **Token in the URL path (`/invite/<token>`).** Simpler routing, but the token lands in reverse-proxy access logs. Fragment chosen.
- **Rate limiting with an in-memory store.** Lost on restart and invisible to the admin, who must see and lift blocks (AC-8.2). Table chosen.
- **Account lockout.** Explicitly rejected by the owner.

## Consequences

- No new native dependencies beyond `better-sqlite3`.
- `PUBLIC_URL` is load-bearing: changing it kills passkeys (documented, E-7.1).
- The guard thresholds are constants in `guard.ts`, not env variables; change by PR.

## Action Items

1. [ ] OCT-2 development tasks (see OCT-14) implement this ADR in order: foundation → passwords & sessions → guard → invites & registration → passkeys → admin API → CLI & docs; web tasks follow ADR-0004.
