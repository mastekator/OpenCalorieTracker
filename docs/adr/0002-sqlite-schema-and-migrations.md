# ADR-0002: SQLite, migrations and the MVP schema

**Status:** Proposed
**Date:** 2026-11-13
**Deciders:** @mastekator95 (owner), @lead

## Context

All data lives in one SQLite file in the `/data` volume; a backup is a copy of the volume. A handful of users per install, writes are rare (a few meals a day per person), the box may be a Raspberry Pi. The design document names `better-sqlite3`. We need a migration mechanism every epic can extend and a first cut of the tables for the whole MVP so later epics do not reshape the auth tables.

## Decision

### Driver and connection

- `better-sqlite3` (synchronous, prepared statements, prebuilt binaries for linux amd64/arm64 — the Docker build must not need a compiler on the final stage).
- One connection per process, opened in `db/open.ts` with: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL`. File: `${DATA_DIR}/oct.sqlite`. WAL lets the maintenance CLI (ADR-0003) write while the server runs.
- Plain SQL with prepared statements; no ORM and no query builder. Multi-step writes use `db.transaction(fn)`.

### Migrations

- Forward-only SQL files `apps/server/src/db/migrations/NNNN_short_name.sql` (copied into the build output). `migrate.ts` reads `PRAGMA user_version`, applies every file with a higher number inside one transaction each, and sets `user_version` to that number. Runs on every startup before the server listens, and in tests on `:memory:`.
- A migration that has been merged to `main` is never edited; changes go into a new file. No down migrations: rollback = restore the volume backup (documented in README).
- Each epic adds its tables in its own migration when it implements them. The schema below is the target shape; columns may be refined by the epic's ADR.

### Conventions

- Primary keys `id INTEGER PRIMARY KEY`. Time is `INTEGER` Unix milliseconds UTC (`created_at`, `expires_at`…); a user's local calendar day is `TEXT 'YYYY-MM-DD'`. Booleans are `INTEGER 0/1`. Every user-owned row has `user_id … REFERENCES users(id) ON DELETE CASCADE`, so deleting a user deletes all their rows in one statement (OCT-2 AC-8.3); photo files are removed from `${DATA_DIR}/photos/<userId>/` in the same request.
- Secrets that must be compared, not read back (session tokens, invite tokens), are stored as SHA-256 hashes; passwords as scrypt hashes (ADR-0003).
- Email is stored normalized (trimmed, lower-cased) with a `UNIQUE` constraint.

### MVP schema (target)

Auth and users — **implemented by OCT-2**:

```sql
users (id, email UNIQUE, name, role TEXT CHECK(role IN ('admin','user')),
       webauthn_user_id BLOB UNIQUE,          -- random 32 bytes, WebAuthn user handle
       locale TEXT DEFAULT 'en', theme TEXT DEFAULT 'system', units TEXT DEFAULT 'metric',
       photo_retention_days INTEGER DEFAULT 30,
       password_from_config INTEGER DEFAULT 0, -- admin hint "change the install password" (AC-1.7)
       created_at, last_login_at)
passwords (user_id PRIMARY KEY REFERENCES users ON DELETE CASCADE, hash, updated_at)
passkeys (id, user_id → users, credential_id BLOB UNIQUE, public_key BLOB, counter INTEGER,
          transports TEXT, name TEXT, created_at, last_used_at)
invites (id, kind TEXT CHECK(kind IN ('invite','recovery')), email, user_id → users NULL,
         token_hash BLOB UNIQUE, created_by → users NULL, created_at, expires_at,
         used_at NULL, revoked_at NULL)        -- also recovery links and the admin setup link
sessions (id, user_id → users, token_hash BLOB UNIQUE, created_at, last_seen_at, expires_at,
          user_agent TEXT)
login_guards (id, kind TEXT CHECK(kind IN ('device','ip')), ip TEXT, device_id TEXT NULL,
              fail_count, window_started_at, timeout_count, timeouts_window_started_at,
              timeout_until NULL, blocked_at NULL, last_email TEXT, user_agent TEXT, last_fail_at,
              UNIQUE(kind, ip, device_id))
```

Later epics — **first approximation, refined in OCT-17 / OCT-20 / OCT-23 / OCT-26**:

```sql
profiles (user_id PRIMARY KEY → users, sex, birth_date, height_cm, weight_kg, activity, goal,
          kcal_override NULL, protein_pct NULL, fat_pct NULL, carbs_pct NULL, updated_at)
meals (id, user_id → users, client_id TEXT,     -- offline queue idempotency key, UNIQUE(user_id, client_id)
       eaten_at INTEGER, tz_offset_min INTEGER, local_date TEXT, meal_type TEXT,
       photo_path NULL, photo_expires_at NULL, preview_path NULL, created_at, updated_at)
meal_items (id, meal_id → meals ON DELETE CASCADE, position, name, grams, kcal, protein_g, fat_g, carbs_g,
            source TEXT CHECK(source IN ('ai','manual','history')), ai_provider NULL, ai_model NULL,
            confidence NULL, illustration TEXT NULL)
illustration_choices (user_id → users, name_key TEXT, illustration TEXT, PRIMARY KEY(user_id, name_key))
agent_messages (id, user_id → users, role TEXT, content TEXT, created_at)
```

Indexes: `meals(user_id, local_date)`, `sessions(user_id)`, `passkeys(user_id)`, `invites(email)`.

## Options Considered

- **`node:sqlite` (built into Node 24).** No native dependency at all, which would simplify multi-arch builds. Still marked experimental/release-candidate and its API is moving; the design document already names `better-sqlite3`. Revisit when it is stable — the switch touches only `db/open.ts` and statement calls.
- **Drizzle / Kysely.** Typed queries and generated migrations, but another layer and toolchain for ~15 tables. Rejected; plain SQL stays readable for reviewers and agents.
- **Migration tracking table instead of `PRAGMA user_version`.** More flexible (out-of-order merges), not needed with forward-only numbered files reviewed one PR at a time.

## Consequences

- Backups and restore are file copies; rollback of a bad migration is a restore.
- Two PRs adding a migration with the same number conflict at review; the second renumbers.
- `better-sqlite3` is a native module: the Dockerfile (OCT-10) must install production dependencies for the target platform in the build stage and copy `node_modules` into the runtime image.

## Action Items

1. [ ] OCT-2 task "Server foundation": `db/open.ts`, `db/migrate.ts`, migration `0001_auth.sql` with the auth tables above, test helper that opens a migrated `:memory:` database.
2. [ ] Epics OCT-3/4/5 add their own migrations.
