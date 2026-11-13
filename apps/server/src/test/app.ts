import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { migrate } from '../db/migrate.js';
import { openDb } from '../db/open.js';

/** The app over a migrated in-memory database; `env` overrides a valid default setup. */
export function testApp(env: Record<string, string | undefined> = {}) {
  const config = loadConfig({
    PUBLIC_URL: 'http://localhost:3000',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'correct horse battery staple',
    ...env,
  });
  const db = openDb(':memory:');
  migrate(db);
  return { app: createApp({ config, db }), config, db };
}
