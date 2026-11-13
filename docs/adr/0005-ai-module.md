# ADR-0005: AI module skeleton

**Status:** Proposed
**Date:** 2026-11-13
**Deciders:** @mastekator95 (owner), @lead

## Context

The installer chooses the AI provider through env; there is no default provider, and without one the app runs in manual mode. Two operations are planned: photo recognition (OCT-3) and the norm interview (OCT-5). Prompts and schemas for them are decided in OCT-17 and OCT-23; this ADR fixes only the shape of the module so both epics plug into it the same way. The design document names the Vercel AI SDK.

## Decision

- Folder `apps/server/src/ai/`:
  - `model.ts` — `createModel(config): LanguageModel | null`. Reads `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`. Unset `AI_PROVIDER` → `null` (manual mode). Provider packages are loaded with dynamic `import()` only for the selected provider to keep memory low.
  - `status.ts` — `aiStatus()` → `{ configured, provider, model }` for the admin status row (OCT-25) and for the client to hide AI actions; never includes the key.
  - `recognize.ts`, `interview.ts` — added by OCT-3 and OCT-5. Each takes the model as an argument plus `locale` (from `users.locale`), calls `generateObject` with a zod schema from `packages/shared`, retries once on schema failure, then throws `ApiError(503, 'ai_unavailable' | 'ai_invalid_response')`. Provider errors map to codes (`ai_quota_exceeded` for 429, `ai_unavailable` otherwise).
- Provider mapping:

| `AI_PROVIDER`       | Package                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `google`            | `@ai-sdk/google`                                                      |
| `openai`            | `@ai-sdk/openai`                                                      |
| `anthropic`         | `@ai-sdk/anthropic`                                                   |
| `openrouter`        | `@ai-sdk/openai-compatible`, base URL `https://openrouter.ai/api/v1`  |
| `openai-compatible` | `@ai-sdk/openai-compatible` with `AI_BASE_URL` (Ollama, LM Studio, …) |

- `AI_PROVIDER` set but `AI_MODEL` missing → logged config error, AI treated as not configured (the app keeps working manually).
- **Tests** use the AI SDK's own mock language model (`MockLanguageModelV*` from `ai/test`) passed into the operation, with fixed responses (valid, invalid-then-valid, invalid twice, provider error). No custom fake provider and no network in CI.
- The photo goes from server to provider only; the browser never talks to the provider and never sees the key.

## Options Considered

- **Provider SDKs directly.** Five integrations with different structured-output APIs. Rejected; the AI SDK is exactly this abstraction.
- **Our own "AiProvider" interface over the SDK.** The SDK's `LanguageModel` already is that interface; a wrapper would add nothing. Rejected.
- **A dedicated OpenRouter provider package.** Works, but the OpenAI-compatible package covers it with one dependency fewer.

## Consequences

- Adding a provider = one row in the mapping and one dependency.
- Vision capability is a property of the chosen model; recognition errors on text-only models are handled in OCT-17.

## Action Items

1. [ ] Implemented together with the first AI feature (OCT-3 breakdown in OCT-17); OCT-2 does not need it.
