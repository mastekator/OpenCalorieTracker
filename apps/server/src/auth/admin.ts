import { randomBytes } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { setupErrors, type Config } from '../config.js';
import { ADMIN_SETUP_TTL, createLink } from './invites.js';
import { hashPassword, verifyPassword } from './password.js';

/**
 * Startup step after migrations (ADR-0003): seeds the admin from env on an empty database,
 * otherwise only warns. No HTTP route can create an admin (AC-1.2). Never logs the values.
 */
export async function ensureAdmin(config: Config, db: Database) {
  await seedOrCheckAdmin(config, db);
  adminSetupLink(config, db);
}

/**
 * AC-1.5: with passkeys only, an admin without a passkey gets a 24-hour setup link in the log,
 * and a new one on the next start once it expires. The one secret the log may hold (AC-0.7).
 */
function adminSetupLink(config: Config, db: Database) {
  if (config.authMethods.includes('password') || !config.publicUrl) return;
  const admin = db
    .prepare(
      `SELECT id FROM users u WHERE role = 'admin'
       AND NOT EXISTS (SELECT 1 FROM passkeys WHERE user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM invites WHERE kind = 'recovery' AND user_id = u.id
         AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?)`,
    )
    .get(Date.now()) as { id: number } | undefined;
  if (!admin) return;
  const { url, expiresAt } = createLink(db, config.publicUrl, {
    kind: 'recovery',
    userId: admin.id,
    ttl: ADMIN_SETUP_TTL,
    createdBy: null,
  });
  console.log(
    `[setup] Open this link to create the admin passkey (valid until ${new Date(expiresAt).toISOString()}): ${url}`,
  );
}

async function seedOrCheckAdmin(config: Config, db: Database) {
  const hasUsers = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (!hasUsers) {
    // Invalid admin env is reported via setupErrors by the caller and on the sign-in screen.
    if (setupErrors(config, db).some((e) => e.startsWith('admin_'))) return;
    const password =
      config.authMethods.includes('password') && config.adminPassword
        ? await hashPassword(config.adminPassword)
        : undefined;
    const now = Date.now();
    db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO users (email, role, webauthn_user_id, password_from_config, created_at)
           VALUES (?, 'admin', ?, ?, ?)`,
        )
        .run(config.adminEmail, randomBytes(16), password ? 1 : 0, now);
      if (password) {
        db.prepare(
          'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, ?)',
        ).run(lastInsertRowid, password, now);
      }
    })();
    console.log('[info] admin account created from ADMIN_EMAIL');
    return;
  }

  // AC-1.6: env values only seed an empty database; later edits change nothing.
  const admin = db
    .prepare(
      `SELECT u.email, p.hash FROM users u LEFT JOIN passwords p ON p.user_id = u.id
       WHERE u.role = 'admin'`,
    )
    .get() as { email: string; hash: string | null } | undefined;
  if (admin && config.adminEmail && config.adminEmail !== admin.email) {
    console.warn(
      '[warn] ADMIN_EMAIL differs from the existing admin; it is used only on an empty database and was ignored.',
    );
  }
  if (
    admin?.hash &&
    config.adminPassword &&
    !(await verifyPassword(config.adminPassword, admin.hash))
  ) {
    console.warn(
      "[warn] ADMIN_PASSWORD differs from the admin's password; it is used only on an empty database and was ignored.",
    );
  }

  // E-7.2: users left without any enabled sign-in method after AUTH_METHODS changed.
  const { stranded } = db
    .prepare(
      `SELECT COUNT(*) AS stranded FROM users u
       WHERE NOT (? AND EXISTS (SELECT 1 FROM passwords WHERE user_id = u.id))
         AND NOT (? AND EXISTS (SELECT 1 FROM passkeys WHERE user_id = u.id))`,
    )
    .get(
      config.authMethods.includes('password') ? 1 : 0,
      config.authMethods.includes('passkey') ? 1 : 0,
    ) as { stranded: number };
  if (stranded) {
    console.warn(
      `[warn] ${stranded} user(s) have no sign-in method enabled in AUTH_METHODS; give them recovery links.`,
    );
  }
}

/**
 * E-6.2, `cli.js reset-admin-access`: lifts every sign-in block and timeout, then issues a fresh
 * 24-hour admin recovery link. Blocks are lifted even when the link cannot be made.
 */
export function resetAdminAccess(config: Config, db: Database) {
  const cleared = db.prepare('DELETE FROM login_guards').run().changes;
  const admin = db
    .prepare("SELECT id FROM users WHERE role = 'admin'")
    .get() as { id: number } | undefined;
  if (!admin) throw new Error('The database has no admin.');
  if (!config.publicUrl)
    throw new Error('PUBLIC_URL is missing or invalid; cannot build the link.');
  const { url, expiresAt } = createLink(db, config.publicUrl, {
    kind: 'recovery',
    userId: admin.id,
    ttl: ADMIN_SETUP_TTL,
    createdBy: null,
  });
  return { cleared, url, expiresAt };
}
