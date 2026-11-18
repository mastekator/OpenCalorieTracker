// First: drops root before any other module touches the filesystem (ADR-0017).
import './privileges.js';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createAiRuntime } from './ai/runtime.js';
import { getAiSettings } from './ai/settings.js';
import { ensureAdmin } from './auth/admin.js';
import {
  dataDirWritable,
  loadConfig,
  setupErrorMessages,
  setupErrors,
} from './config.js';
import { migrate } from './db/migrate.js';
import { openDb } from './db/open.js';
import { SWEEP_INTERVAL_MS, sweepPhotos } from './photos/sweep.js';
import { loadSecrets } from './secrets.js';

const config = loadConfig(process.env);
config.dataDirWritable = dataDirWritable(config.dataDir);
// Unwritable DATA_DIR: an empty in-memory database with no admin, only so the screen can explain.
const db = openDb(
  config.dataDirWritable ? join(config.dataDir, 'oct.sqlite') : ':memory:',
);
migrate(db);
if (config.dataDirWritable) await ensureAdmin(config, db);

// Installation problems keep the server up so the sign-in screen can explain them.
for (const error of setupErrors(config, db)) {
  const message =
    error === 'data_dir_not_writable'
      ? `${config.dataDir} is not writable for ${process.getuid?.()}:${process.getgid?.()}; set PUID/PGID or the folder permissions.`
      : setupErrorMessages[error];
  console.error(`[setup] ${error}: ${message}`);
}

const secrets = loadSecrets(config.dataDirWritable ? config.dataDir : null);
const ai = createAiRuntime();
await ai.apply(getAiSettings(config, db, secrets));

// A failed sweep is retried next hour; it must not take the server down.
const sweep = () =>
  sweepPhotos(db, config.dataDir, Date.now()).catch((err) =>
    console.error(`[photos] sweep failed: ${(err as Error).message}`),
  );
if (config.dataDirWritable) {
  void sweep();
  setInterval(sweep, SWEEP_INTERVAL_MS).unref();
}

serve(
  {
    fetch: createApp({ config, db, ai, secrets }).fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(
      `[info] server listening on http://${info.address}:${info.port}`,
    );
  },
);
