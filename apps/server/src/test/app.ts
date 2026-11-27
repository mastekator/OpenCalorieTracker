import { randomBytes } from 'node:crypto';
import type { AiModel } from '../ai/model.js';
import { createAiRuntime } from '../ai/runtime.js';
import { getAiSettings } from '../ai/settings.js';
import { createApp, type AppDeps } from '../app.js';
import { loadConfig } from '../config.js';
import { migrate } from '../db/migrate.js';
import { openDb } from '../db/open.js';
import { secretsFrom } from '../secrets.js';

/** The app over a migrated in-memory database; `env` overrides a valid default setup, `model` is the active AI, `fetch` fakes outbound HTTP. */
export function testApp(
  env: Record<string, string | undefined> = {},
  model: AiModel | null = null,
  fetch?: typeof globalThis.fetch,
  deliverWebhook?: AppDeps['deliverWebhook'],
) {
  const config = loadConfig({
    PUBLIC_URL: 'http://localhost:3000',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'Correct-horse-battery-9',
    ...env,
  });
  const db = openDb(':memory:');
  migrate(db);
  const secrets = secretsFrom(randomBytes(32));
  // Without AI_* the model still needs settings: openai-compatible has no display name.
  const ai = createAiRuntime(
    { db, secrets, config, fetch },
    model && {
      model,
      settings: getAiSettings(config) ?? {
        provider: 'openai-compatible',
        model: model.modelId,
        apiKey: undefined,
        baseUrl: undefined,
        source: 'env',
      },
    },
  );
  return {
    app: createApp({ config, db, ai, secrets, fetch, deliverWebhook }),
    config,
    db,
    ai,
    secrets,
  };
}

/** The Set-Cookie line for `name`, if the response sets it. */
export const setCookie = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
