import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createModel, type AiModel } from './ai/model.js';
import { getAiSettings } from './ai/settings.js';
import { ensureAdmin } from './auth/admin.js';
import { loadConfig, setupErrorMessages, setupErrors } from './config.js';
import { migrate } from './db/migrate.js';
import { openDb } from './db/open.js';
import { SWEEP_INTERVAL_MS, sweepPhotos } from './photos/sweep.js';

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(join(config.dataDir, 'oct.sqlite'));
migrate(db);
await ensureAdmin(config, db);

// Installation problems keep the server up so the sign-in screen can explain them.
for (const error of setupErrors(config, db)) {
  console.error(`[setup] ${error}: ${setupErrorMessages[error]}`);
}

// Broken AI settings must not take the server down: it falls back to manual mode.
let model: AiModel | null = null;
try {
  model = await createModel(getAiSettings(config));
} catch (err) {
  console.error(
    `[setup] AI model could not be created (${(err as Error).name}); AI is off.`,
  );
}

// A failed sweep is retried next hour; it must not take the server down.
const sweep = () =>
  sweepPhotos(db, config.dataDir, Date.now()).catch((err) =>
    console.error(`[photos] sweep failed: ${(err as Error).message}`),
  );
void sweep();
setInterval(sweep, SWEEP_INTERVAL_MS).unref();

serve(
  {
    fetch: createApp({ config, db, model }).fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(
      `[info] server listening on http://${info.address}:${info.port}`,
    );
  },
);
