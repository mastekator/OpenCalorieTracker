import { Hono } from 'hono';
import {
  illustrationChoiceInputSchema,
  isIllustrationId,
  matchIllustration,
  nameKey,
  type IllustrationChoice,
  type IllustrationId,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { bumpRev } from '../sync/rev.js';

/** SQL joining a dish `i` of a meal `m` with its name's remembered choice `c`. */
export const CHOICE_JOIN =
  'LEFT JOIN illustration_choices c ON c.user_id = m.user_id AND c.name_key = i.name_key';

/**
 * Resolved illustration (ADR-0009): `stored` is `COALESCE(i.illustration, c.illustration)`;
 * missing or no longer in the set → matched by name.
 */
export const resolveIllustration = (
  stored: string | null,
  name: string,
): IllustrationId =>
  isIllustrationId(stored) ? stored : matchIllustration(name);

/** The user's remembered illustrations for dish names (AC-4.4, 4.7). */
export function illustrationRoutes({ db }: AppDeps) {
  return new Hono<AuthEnv>()
    .get('/illustrations/choices', requireUser, (c) =>
      c.json(
        db
          .prepare(
            'SELECT name_key AS nameKey, illustration FROM illustration_choices WHERE user_id = ? ORDER BY name_key',
          )
          .all(c.var.user.id) as IllustrationChoice[],
      ),
    )
    .put(
      '/illustrations/choices',
      requireUser,
      validate('json', illustrationChoiceInputSchema),
      (c) => {
        const userId = c.var.user.id;
        const { name, illustration } = c.req.valid('json');
        const key = nameKey(name);
        if (!key)
          throw new ApiError(400, 'validation_failed', [
            { path: ['name'], code: 'custom' },
          ]);
        db.transaction(() => {
          if (illustration === null)
            // shortcut: no tombstone yet, OCT-75 adds it with /api/sync.
            db.prepare(
              'DELETE FROM illustration_choices WHERE user_id = ? AND name_key = ?',
            ).run(userId, key);
          else
            db.prepare(
              `INSERT INTO illustration_choices (user_id, name_key, illustration, rev) VALUES (?, ?, ?, ?)
               ON CONFLICT (user_id, name_key) DO UPDATE SET illustration = excluded.illustration, rev = excluded.rev`,
            ).run(userId, key, illustration, bumpRev(db, userId));
        })();
        return c.body(null, 204);
      },
    );
}
