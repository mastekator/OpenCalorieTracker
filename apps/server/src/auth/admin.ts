import { randomBytes } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { setupErrors, type Config } from '../config.js';
import { hashPassword, verifyPassword } from './password.js';

/**
 * Startup step after migrations (ADR-0003): seeds the admin from env on an empty database,
 * otherwise only warns. No HTTP route can create an admin (AC-1.2). Never logs the values.
 */
export async function ensureAdmin(config: Config, db: Database) {
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
