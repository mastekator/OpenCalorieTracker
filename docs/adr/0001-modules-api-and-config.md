# ADR-0001: Modules, API conventions and configuration

**Status:** Proposed
**Date:** 2026-11-13
**Deciders:** @mastekator95 (owner), @lead

## Context

OpenCalorieTracker ships as one Docker container: Hono (Node 24) serves the JSON API under `/api` and the built React app; data lives in SQLite under `/data`. It must run on weak hardware (Raspberry Pi 4, < 150 MB RAM), assume nothing about the host and take all install-specific settings from environment variables. The monorepo scaffold (`apps/server`, `apps/web`, `packages/shared`, pnpm, Vitest) already exists (OCT-8). Every later epic builds on the conventions fixed here.

## Decision

### Repository layout

```
apps/server/src/
  index.ts            # starts the HTTP server: load config, open DB, migrate, bootstrap admin, serve
  app.ts              # createApp(deps): mounts feature routers under /api, static files, SPA fallback
  cli.ts              # maintenance commands run inside the container (ADR-0003)
  config.ts           # parses process.env once with zod -> typed Config
  http/               # errors.ts (ApiError + onError handler), validate.ts (zod helper), client-ip.ts
  db/                 # open.ts, migrate.ts, migrations/NNNN_name.sql
  auth/               # passwords, sessions, webauthn, guard, invites, middleware, routes
  users/              # account settings and admin user/blocks routes
  ai/                 # provider selection and operations (ADR-0005)
  <feature>/          # meals/, diary/, profile/ ... added by later epics, same shape
apps/web/src/          # see ADR-0004
packages/shared/src/  # zod schemas and inferred types of API requests/responses, error codes
```

- A feature folder owns its routes, SQL and tests. It exports one Hono router (`export const mealsRoutes = new Hono<AppEnv>()`) mounted in `app.ts`. No service/repository layers: route handlers call small plain functions that run prepared SQL statements.
- `createApp({ config, db })` takes its dependencies as arguments so tests build an app over an in-memory database with any config. No DI container, no module-level singletons besides `index.ts`.
- `packages/shared` contains only what both sides need: request/response zod schemas, their `z.infer` types and the `ErrorCode` union. No runtime code with side effects; it is consumed as TypeScript source (already set up by `exports: ./src/index.ts`).

### API conventions

- **Prefix and version.** All endpoints live under `/api`, without a version segment. Web and API are built and shipped together in one image, so they cannot drift. If a future separately released client (Capacitor, stage 4) needs a breaking change, the new shape goes under `/api/v2` then. `GET /api/health` returns `{ ok: true, version }`.
- **Style.** JSON over REST-ish resources: `GET /api/meals?date=…`, `POST /api/meals`, `PATCH /api/meals/:id`, `DELETE /api/meals/:id`. Actions that are not resources are verbs under their area: `POST /api/auth/login`, `POST /api/admin/blocks/:id/unblock`. Field names are `camelCase`; timestamps are ISO 8601 UTC strings; local calendar days are `YYYY-MM-DD`; masses are integer grams; energy is kcal with one decimal at most.
- **Errors.** Every non-2xx response has the body `{ "error": { "code": "invalid_credentials", "details"?: … } }`. `code` is a stable snake_case string from the shared `ErrorCode` union; the client translates it (ADR-0004), the server never sends user-facing text. Status codes: 400 `validation_failed` (details = zod issues with `path` and `code`), 401 `unauthenticated`, 403 `forbidden`, 404 `not_found`, 409 conflicts (`email_taken`, `invite_used`…), 429 `too_many_attempts` (details `{ retryAfterSec }`) / `device_blocked` / `ip_blocked`, 503 `ai_unavailable`, 500 `internal`. Handlers throw `new ApiError(status, code, details?)`; one `app.onError` turns it into the body and logs unexpected errors without request bodies.
- **Validation.** Every request body, query and param is parsed with the shared zod schema through one helper on top of Hono's built-in `validator` (`validate('json', schema)`), which throws `validation_failed`. No extra validator package. Responses are typed with the shared types; they are not re-validated at runtime.
- **Auth on routes.** Middleware `requireUser` (401 without a valid session) and `requireAdmin` (403 for non-admins) from ADR-0003. Every query on user data filters by `c.var.user.id`; a foreign id returns 404, not 403, so ids cannot be probed.
- **CSRF.** Cookies are `SameSite=Strict`, and Hono's `csrf()` middleware rejects state-changing requests whose `Origin` differs from `PUBLIC_URL`'s origin.

### Configuration

All install-specific settings are environment variables, parsed once in `config.ts` with zod. Names:

| Variable                                               | Default            | Meaning                                                                                                                                       |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                           | — (required)       | Origin users open, e.g. `https://food.example.com`. `https` required except `localhost`. WebAuthn RP id and origin, CSRF origin, invite links |
| `AUTH_METHODS`                                         | `password,passkey` | Comma list of enabled sign-in methods                                                                                                         |
| `REGISTRATION`                                         | `invite`           | `invite` or `open`                                                                                                                            |
| `ADMIN_EMAIL`                                          | —                  | Admin account, used only on an empty database                                                                                                 |
| `ADMIN_PASSWORD`                                       | —                  | Initial admin password (required when `password` is enabled), used only on an empty database                                                  |
| `TRUST_PROXY_HOPS`                                     | `1`                | How many reverse proxies in front of the container append to `X-Forwarded-For`; `0` = use the socket address (ADR-0003)                       |
| `DATA_DIR`                                             | `/data`            | SQLite file and photos                                                                                                                        |
| `PORT` / `HOST`                                        | `3000` / `0.0.0.0` | Listen address                                                                                                                                |
| `TZ`                                                   | container default  | Only for log timestamps; user days come from the device (OCT-4)                                                                               |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` | unset              | ADR-0005                                                                                                                                      |

- **Bad config does not crash the container.** Problems the owner must fix in the compose file (`PUBLIC_URL` missing or invalid, admin missing on an empty DB, `ADMIN_PASSWORD` weak) are logged once as clear errors and exposed as `setupError` from the public `GET /api/config`, so the sign-in screen can show "Installation not configured" (OCT-2 AC-1.3, AC-7.1). Auth endpoints answer 503 `not_configured` while `setupError` is set. Values that make no sense at all (e.g. `REGISTRATION=foo`) do fail fast at startup with the zod message.
- `GET /api/config` (no auth) returns `{ version, publicUrl, authMethods, registration, setupError }` — never secrets.
- Secrets (`ADMIN_PASSWORD`, `AI_API_KEY`) are never logged, returned by the API or written to the database in clear text.

### Logging and testing

- Logging is `console` lines with a level prefix; no logging library. Never log request bodies, cookies, tokens, passwords or photos.
- Tests: Vitest, colocated `*.test.ts`. Server tests call `createApp({ config, db: openDb(':memory:') }).request(...)` — real SQL, real migrations, no mocks of our own code. AI calls use the AI SDK mock model (ADR-0005). Every acceptance criterion marked "test" in a product document gets a test at this level.

## Options Considered

- **tRPC / RPC-style API instead of REST + shared zod.** Less boilerplate for our own client, but ties the API to TypeScript clients and a library; a future Capacitor app and the stage-3 Home Assistant endpoint want plain HTTP. Rejected.
- **Hono RPC client (`hc`).** Typed client for free, but couples web types to server route types and slows the editor in a growing app. Shared zod schemas give the same safety with less magic. Rejected for now.
- **`/api/v1` prefix from day one.** Costs nothing but promises versioning we do not need while web and API ship as one unit. Rejected; `/api/v2` is the escape hatch.
- **Layered architecture (controllers/services/repositories).** Abstractions for a small app that has one storage engine. Rejected.

## Consequences

- New features are a folder plus one line in `app.ts`; reviewers check the same shape everywhere.
- Error codes are part of the public contract and need translations in both dictionaries.
- Config problems are visible both in the log and on the sign-in screen, at the cost of a small "not configured" state in the API.

## Action Items

1. [ ] OCT-2 task "Server foundation" implements `config.ts`, `http/`, `createApp(deps)`, `GET /api/config`.
2. [ ] README documents all variables in one table (OCT-2 task "Admin CLI and install docs").
