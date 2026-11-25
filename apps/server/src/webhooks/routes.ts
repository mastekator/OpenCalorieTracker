import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { Hono } from 'hono';
import {
  createWebhookRequestSchema,
  MAX_WEBHOOK_DELIVERIES,
  MAX_WEBHOOKS,
  updateWebhookRequestSchema,
  webhookEmptyByOk,
  type CreatedWebhook,
  type Webhook,
  type WebhookDelivery,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { integrationsPolicy } from '../integrations/routes.js';
import { checkWebhookUrl } from './address.js';
import { deliver as realDeliver, type DeliveryResult } from './send.js';

/** Secrets.seal() purpose of webhooks.secret_enc. */
export const WEBHOOK_SECRET_PURPOSE = 'webhook.secret';

interface Row {
  id: number;
  name: string;
  url: string;
  secret_enc: string;
  events: string;
  day_closed_at: string;
  empty_by: string | null;
  enabled: number;
  fail_streak: number;
  disabled_reason: 'failures' | null;
  created_at: number;
}

interface DeliveryRow {
  id: number;
  event: WebhookDelivery['event'];
  at: number;
  status: number | null;
  error: string | null;
  attempts: number;
  duration_ms: number | null;
}

const toApi = (r: Row): Webhook => ({
  id: r.id,
  name: r.name,
  url: r.url,
  events: JSON.parse(r.events) as Webhook['events'],
  dayClosedAt: r.day_closed_at,
  emptyBy: r.empty_by,
  enabled: r.enabled === 1,
  disabledReason: r.disabled_reason,
  failStreak: r.fail_streak,
  createdAt: new Date(r.created_at).toISOString(),
});

const deliveryToApi = (r: DeliveryRow): WebhookDelivery => ({
  id: r.id,
  event: r.event,
  at: new Date(r.at).toISOString(),
  status: r.status,
  error: r.error,
  attempts: r.attempts,
  durationMs: r.duration_ms,
});

/** 32 random bytes, shown once; the HMAC key is this string (docs/webhooks.md). */
const newSecret = () => randomBytes(32).toString('base64url');

/** One log row; keeps the last MAX_WEBHOOK_DELIVERIES per webhook in the same transaction. */
export function logDelivery(
  db: Database,
  webhookId: number,
  event: string,
  attempts: number,
  r: DeliveryResult,
  at = Date.now(),
): DeliveryRow {
  return db.transaction(() => {
    const row = db
      .prepare(
        `INSERT INTO webhook_deliveries (webhook_id, event, at, status, error, attempts, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id, event, at, status, error, attempts, duration_ms`,
      )
      .get(
        webhookId,
        event,
        at,
        r.status,
        r.error,
        attempts,
        r.durationMs,
      ) as DeliveryRow;
    db.prepare(
      `DELETE FROM webhook_deliveries WHERE webhook_id = ? AND id NOT IN
       (SELECT id FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT ?)`,
    ).run(webhookId, webhookId, MAX_WEBHOOK_DELIVERIES);
    return row;
  })();
}

/** Webhook management, by session only (ADR-0027 §3). Someone else's id answers 404. */
export function webhookRoutes({
  db,
  config,
  secrets,
  deliverWebhook = realDeliver,
}: AppDeps) {
  const own = (id: string, userId: number) => {
    const row = db
      .prepare('SELECT * FROM webhooks WHERE id = ? AND user_id = ?')
      .get(Number(id), userId) as Row | undefined;
    if (!row) throw new ApiError(404, 'not_found');
    return row;
  };
  // An enabled webhook the admin's ban would silence is refused instead of saved quietly.
  const outboundOr403 = () => {
    if (!integrationsPolicy(db, config).outbound)
      throw new ApiError(403, 'outbound_disabled');
  };

  return new Hono<AuthEnv>()
    .get('/webhooks', requireUser, (c) => {
      const rows = db
        .prepare('SELECT * FROM webhooks WHERE user_id = ? ORDER BY id')
        .all(c.var.user.id) as Row[];
      return c.json(rows.map(toApi));
    })
    .post(
      '/webhooks',
      requireUser,
      validate('json', createWebhookRequestSchema),
      (c) => {
        const w = c.req.valid('json');
        if (w.enabled) outboundOr403();
        checkWebhookUrl(w.url);
        const userId = c.var.user.id;
        const count = db
          .prepare('SELECT count(*) FROM webhooks WHERE user_id = ?')
          .pluck()
          .get(userId) as number;
        if (count >= MAX_WEBHOOKS) throw new ApiError(409, 'limit_reached');
        const secret = newSecret();
        const row = db
          .prepare(
            `INSERT INTO webhooks (user_id, name, url, secret_enc, events, day_closed_at, empty_by, enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          )
          .get(
            userId,
            w.name,
            w.url,
            secrets.seal(secret, WEBHOOK_SECRET_PURPOSE),
            JSON.stringify(w.events),
            w.dayClosedAt,
            w.emptyBy,
            +w.enabled,
            Date.now(),
          ) as Row;
        return c.json({ ...toApi(row), secret } satisfies CreatedWebhook, 201);
      },
    )
    .patch(
      '/webhooks/:id',
      requireUser,
      validate('json', updateWebhookRequestSchema),
      (c) => {
        const patch = c.req.valid('json');
        const w = { ...toApi(own(c.req.param('id'), c.var.user.id)), ...patch };
        if (!webhookEmptyByOk(w))
          throw new ApiError(400, 'validation_failed', [
            { path: ['emptyBy'], message: 'required with day.empty' },
          ]);
        if (patch.url !== undefined) checkWebhookUrl(patch.url);
        if (w.enabled) outboundOr403();
        // Switching on starts the failure count over (ADR-0027 §3, design 5.6).
        const reset = patch.enabled === true;
        const row = db
          .prepare(
            `UPDATE webhooks SET name = ?, url = ?, events = ?, day_closed_at = ?, empty_by = ?, enabled = ?,
               fail_streak = CASE WHEN ? THEN 0 ELSE fail_streak END,
               disabled_reason = CASE WHEN ? THEN NULL ELSE disabled_reason END
             WHERE id = ? RETURNING *`,
          )
          .get(
            w.name,
            w.url,
            JSON.stringify(w.events),
            w.dayClosedAt,
            w.emptyBy,
            +w.enabled,
            +reset,
            +reset,
            w.id,
          ) as Row;
        return c.json(toApi(row));
      },
    )
    .post('/webhooks/:id/secret', requireUser, (c) => {
      const { id } = own(c.req.param('id'), c.var.user.id);
      const secret = newSecret();
      const row = db
        .prepare('UPDATE webhooks SET secret_enc = ? WHERE id = ? RETURNING *')
        .get(secrets.seal(secret, WEBHOOK_SECRET_PURPOSE), id) as Row;
      return c.json({ ...toApi(row), secret } satisfies CreatedWebhook);
    })
    .delete('/webhooks/:id', requireUser, (c) => {
      const { id } = own(c.req.param('id'), c.var.user.id);
      db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
      return c.body(null, 204);
    })
    .get('/webhooks/:id/deliveries', requireUser, (c) => {
      const { id } = own(c.req.param('id'), c.var.user.id);
      const rows = db
        .prepare(
          `SELECT id, event, at, status, error, attempts, duration_ms
           FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC`,
        )
        .all(id) as DeliveryRow[];
      return c.json(rows.map(deliveryToApi));
    })
    .post('/webhooks/:id/test', requireUser, async (c) => {
      // Works for a switched-off webhook too; only the admin's ban stops it.
      outboundOr403();
      const row = own(c.req.param('id'), c.var.user.id);
      const secret = secrets.open(row.secret_enc, WEBHOOK_SECRET_PURPOSE);
      if (secret === null) throw new ApiError(500, 'internal');
      const deliveryId = `test-${randomUUID()}`;
      const body = JSON.stringify({
        version: 1,
        id: deliveryId,
        event: 'test',
        occurredAt: new Date().toISOString(),
        user: { id: c.var.user.id },
        data: {},
      });
      const result = await deliverWebhook({
        url: row.url,
        secret,
        event: 'test',
        deliveryId,
        body,
      });
      return c.json(deliveryToApi(logDelivery(db, row.id, 'test', 1, result)));
    });
}
