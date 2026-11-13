import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig, setupErrorMessages, setupErrors } from './config.js';
import { migrate } from './db/migrate.js';
import { openDb } from './db/open.js';

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(join(config.dataDir, 'oct.sqlite'));
migrate(db);

// Installation problems keep the server up so the sign-in screen can explain them.
for (const error of setupErrors(config, db)) {
  console.error(`[setup] ${error}: ${setupErrorMessages[error]}`);
}

serve(
  {
    fetch: createApp({ config, db }).fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(
      `[info] server listening on http://${info.address}:${info.port}`,
    );
  },
);
