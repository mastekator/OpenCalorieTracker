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

/** The admin's switches; ALLOW_OUTBOUND_REQUESTS and ALLOW_API_TOKENS win over the table (ADR-0034 §5, ADR-0027 §6). */
export function integrationsPolicy(
  db: Database,
  config: Pick<Config, 'outbound' | 'tokens'>,
): AdminIntegrations {
  const row = db
    .prepare(
      'SELECT outbound_allowed AS outbound, tokens_allowed AS tokens FROM integration_settings',
    )
    .get() as { outbound: number; tokens: number } | undefined;
  // No row: both allowed (AC-0.6).
  return {
    outbound: config.outbound ?? row?.outbound !== 0,
    outboundFromEnv: config.outbound !== undefined,
    tokens: config.tokens ?? row?.tokens !== 0,
    tokensFromEnv: config.tokens !== undefined,
  };
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
        const { outbound, tokens } = c.req.valid('json');
        if (outbound !== undefined && config.outbound !== undefined)
          throw new ApiError(409, 'outbound_env_managed');
        if (tokens !== undefined && config.tokens !== undefined)
          throw new ApiError(409, 'tokens_env_managed');
        // Queued webhook events are dropped, not held for later (ADR-0027 §6).
        if (outbound === false) db.prepare('DELETE FROM webhook_outbox').run();
        // A missing switch keeps its value; the users' own switches and tokens stay too (E-6).
        // The table value, not the policy: env may override the other switch.
        db.prepare(
          `INSERT INTO integration_settings (id, outbound_allowed, tokens_allowed, updated_at, updated_by)
           VALUES (1, coalesce(@outbound, 1), coalesce(@tokens, 1), @now, @userId)
           ON CONFLICT (id) DO UPDATE SET
             outbound_allowed = coalesce(@outbound, outbound_allowed),
             tokens_allowed = coalesce(@tokens, tokens_allowed),
             updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).run({
          outbound: outbound === undefined ? null : +outbound,
          tokens: tokens === undefined ? null : +tokens,
          now: Date.now(),
          userId: c.var.user.id,
        });
        return c.json(policy());
      },
    )
    .get('/integrations', requireUser, (c) => {
      const u = db
        .prepare(
          'SELECT off_enabled AS off, mcp_enabled AS mcp, last_export_at AS at, last_export_format AS format FROM users WHERE id = ?',
        )
        .get(c.var.user.id) as {
        off: number;
        mcp: number;
        at: number | null;
        format: 'json' | 'csv' | null;
      };
      const tokens = db
        .prepare('SELECT count(*) FROM api_tokens WHERE user_id = ?')
        .pluck()
        .get(c.var.user.id) as number;
      const hooks = db
        .prepare(
          `SELECT count(*) AS count, coalesce(sum(enabled), 0) AS enabled,
             (SELECT name FROM webhooks WHERE user_id = @id
              AND (disabled_reason = 'failures' OR fail_streak > 0) ORDER BY id LIMIT 1) AS failing
           FROM webhooks WHERE user_id = @id`,
        )
        .get({ id: c.var.user.id }) as {
        count: number;
        enabled: number;
        failing: string | null;
      };
      const p = policy();
      return c.json({
        barcode: { enabled: u.off === 1, blocked: !p.outbound },
        export: {
          lastAt: u.at === null ? null : new Date(u.at).toISOString(),
          lastFormat: u.format,
        },
        tokens: { count: tokens, blocked: !p.tokens },
        webhooks: { ...hooks, blocked: !p.outbound },
        // MCP signs in with a token, so the tokens switch blocks it too.
        mcp: { enabled: u.mcp === 1, blocked: !p.tokens },
      } satisfies Integrations);
    });
}
