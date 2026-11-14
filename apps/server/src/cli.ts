import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resetAdminAccess } from './auth/admin.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { openDb } from './db/open.js';

// Admin CLI (ADR-0003), run next to the live server: `node dist/cli.js reset-admin-access`.
// Only the link goes to stdout, so it can be copied or piped; everything else goes to stderr.
const [command] = process.argv.slice(2);
if (command !== 'reset-admin-access') {
  console.error('Usage: node dist/cli.js reset-admin-access');
  process.exit(1);
}

const config = loadConfig(process.env);
const file = join(config.dataDir, 'oct.sqlite');
// Never create a database here: a wrong DATA_DIR would silently make a second, empty one.
if (!existsSync(file)) {
  console.error(`No database at ${file}; check DATA_DIR.`);
  process.exit(1);
}
const db = openDb(file);
migrate(db);
try {
  const { cleared, url, expiresAt } = resetAdminAccess(config, db);
  console.error(
    `Lifted ${cleared} sign-in block(s). Admin recovery link, valid until ${new Date(expiresAt).toISOString()}:`,
  );
  console.log(url);
} catch (err) {
  console.error(`Sign-in blocks lifted, but: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
