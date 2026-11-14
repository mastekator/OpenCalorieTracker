import { Hono } from 'hono';
import {
  SYNC_PAGE_SIZE,
  syncQuerySchema,
  type IllustrationId,
  type SyncResponse,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { readSettings } from '../account/routes.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { validate } from '../http/validate.js';
import { readMealsByRev } from '../meals/read.js';

type Change =
  | { rev: number; kind: 'meal' }
  | { rev: number; kind: 'deleted'; clientId: string }
  | {
      rev: number;
      kind: 'choice';
      nameKey: string;
      illustration: IllustrationId | null;
    }
  | { rev: number; kind: 'settings' };

/**
 * Everything of the user changed after `since`, by rev (ADR-0011 §3). Each change has its own
 * rev from `bumpRev`, so a page can end on any change without splitting one rev across pages.
 */
export function syncRoutes({ db }: AppDeps) {
  // One page plus one row per source tells whether more remains after the merged page.
  const limit = SYNC_PAGE_SIZE + 1;
  const meals = db.prepare(
    `SELECT rev, 'meal' AS kind FROM meals WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ${limit}`,
  );
  const tombstones = db.prepare(
    `SELECT rev, 'deleted' AS kind, client_id AS clientId FROM meal_tombstones
     WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ${limit}`,
  );
  const choices = db.prepare(
    `SELECT rev, 'choice' AS kind, name_key AS nameKey, illustration FROM illustration_choices
     WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ${limit}`,
  );
  const user = db.prepare(
    'SELECT settings_rev AS settingsRev, sync_rev AS syncRev FROM users WHERE id = ?',
  );

  return new Hono<AuthEnv>().get(
    '/sync',
    requireUser,
    validate('query', syncQuerySchema),
    (c) => {
      const userId = c.var.user.id;
      const { since } = c.req.valid('query');
      const res = db.transaction((): SyncResponse => {
        const { settingsRev, syncRev } = user.get(userId) as {
          settingsRev: number;
          syncRev: number;
        };
        const all = [
          ...(meals.all(userId, since) as Change[]),
          ...(tombstones.all(userId, since) as Change[]),
          ...(choices.all(userId, since) as Change[]),
          // since = 0 is the first load: never-changed settings (settings_rev 0) come too.
          ...(settingsRev > since || since === 0
            ? [{ rev: settingsRev, kind: 'settings' } as Change]
            : []),
        ].sort((a, b) => a.rev - b.rev);
        const page = all.slice(0, SYNC_PAGE_SIZE);
        const more = all.length > SYNC_PAGE_SIZE;
        const rev = more ? page.at(-1)!.rev : syncRev;
        const out: SyncResponse = {
          rev,
          more,
          meals: page.some((x) => x.kind === 'meal')
            ? readMealsByRev(db, userId, since, rev)
            : [],
          deletedMealClientIds: [],
        };
        for (const x of page)
          if (x.kind === 'deleted') out.deletedMealClientIds.push(x.clientId);
          else if (x.kind === 'choice')
            (out.illustrationChoices ??= []).push({
              nameKey: x.nameKey,
              illustration: x.illustration,
            });
          else if (x.kind === 'settings')
            out.settings = readSettings(db, userId);
        return out;
      })();
      return c.json(res);
    },
  );
}
