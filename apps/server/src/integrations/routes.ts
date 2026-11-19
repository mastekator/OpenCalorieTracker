import type { Database } from 'better-sqlite3';
import { Hono } from 'hono';
import {
  adminIntegrationsRequestSchema,
  type AdminIntegrations,
  type Integrations,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireAdmin, requireUser, type AuthEnv } from '../auth/session.js';
import type { Config } from '../config.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';

/** Whether outbound requests are allowed: ALLOW_OUTBOUND_REQUESTS wins over the admin's switch (ADR-0034 §5). */
export function integrationsPolicy(
  db: Database,
  config: Pick<Config, 'outbound'>,
): AdminIntegrations {
  if (config.outbound !== undefined)
    return { outbound: config.outbound, outboundFromEnv: true };
  const allowed = db
    .prepare('SELECT outbound_allowed FROM integration_settings')
    .pluck()
    .get() as number | undefined;
  // No row: allowed (AC-0.6).
  return { outbound: allowed !== 0, outboundFromEnv: false };
}

export function integrationRoutes({ db, config }: AppDeps) {
  const policy = () => integrationsPolicy(db, config);
  return new Hono<AuthEnv>()
    .get('/admin/integrations', requireAdmin, (c) => c.json(policy()))
    .put(
      '/admin/integrations',
      requireAdmin,
      validate('json', adminIntegrationsRequestSchema),
      (c) => {
        if (config.outbound !== undefined)
          throw new ApiError(409, 'outbound_env_managed');
        // The users' own switches stay as they are (E-6).
        db.prepare(
          `INSERT INTO integration_settings (id, outbound_allowed, updated_at, updated_by)
           VALUES (1, @allowed, @now, @userId)
           ON CONFLICT (id) DO UPDATE SET outbound_allowed = excluded.outbound_allowed,
             updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).run({
          allowed: +c.req.valid('json').outbound,
          now: Date.now(),
          userId: c.var.user.id,
        });
        return c.json(policy());
      },
    )
    .get('/integrations', requireUser, (c) => {
      const enabled = db
        .prepare('SELECT off_enabled FROM users WHERE id = ?')
        .pluck()
        .get(c.var.user.id) as number;
      return c.json({
        barcode: { enabled: enabled === 1, blocked: !policy().outbound },
      } satisfies Integrations);
    });
}
