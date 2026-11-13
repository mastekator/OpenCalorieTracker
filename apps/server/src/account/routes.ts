import { Hono } from 'hono';
import { accountSettingsPatchSchema, type AccountSettings } from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { validate } from '../http/validate.js';
import { bumpRev } from '../sync/rev.js';

/** Language, theme and units of one's own account (ADR-0011 §3, AC-0.3). */
export function accountRoutes({ db }: AppDeps) {
  const read = (userId: number) =>
    db
      .prepare(
        `SELECT locale, theme, units, settings_rev AS settingsRev
         FROM users WHERE id = ?`,
      )
      .get(userId) as AccountSettings;

  return new Hono<AuthEnv>().patch(
    '/account/settings',
    requireUser,
    validate('json', accountSettingsPatchSchema),
    (c) => {
      const userId = c.var.user.id;
      const { editedAt, ...fields } = c.req.valid('json');
      const changes = Object.entries(fields).filter(([, v]) => v !== undefined);
      db.transaction(() => {
        if (!changes.length) return;
        const { settings_edited_at: stored } = db
          .prepare('SELECT settings_edited_at FROM users WHERE id = ?')
          .get(userId) as { settings_edited_at: number | null };
        // An offline edit made before the stored one loses (last edit wins).
        if (editedAt !== undefined && stored !== null && editedAt < stored) {
          return;
        }
        // Keys come from the zod schema, never from the client, so interpolating them is safe.
        const set = changes.map(([k]) => `${k} = ?`).join(', ');
        db.prepare(
          `UPDATE users SET ${set}, settings_edited_at = ?, settings_rev = ? WHERE id = ?`,
        ).run(
          ...changes.map(([, v]) => v),
          editedAt ?? Date.now(),
          bumpRev(db, userId),
          userId,
        );
      })();
      return c.json(read(userId));
    },
  );
}
