import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { Meal } from '@oct/shared';
import type { Config } from '../config.js';
import { integrationsPolicy } from '../integrations/routes.js';
import type { Secrets } from '../secrets.js';
import { logDelivery, WEBHOOK_SECRET_PURPOSE } from './routes.js';
import { deliver as realDeliver, type Deliver } from './send.js';

export const DELIVERY_INTERVAL_MS = 5_000;
const BATCH = 20;
const PARALLEL = 4;
/** Waits before the 2nd, 3rd and 4th attempt; after the 4th the event is dropped (ADR-0027 §3). */
export const RETRY_MS = [30_000, 120_000, 600_000];
/** Failed events in a row that switch a webhook off. */
export const FAILS_TO_DISABLE = 20;

type Policy = Pick<Config, 'outbound' | 'tokens'>;

/** What a deleted meal still tells: no dishes. */
export type DeletedMeal = Pick<
  Meal,
  'id' | 'clientId' | 'localDate' | 'mealType'
>;

/**
 * Queues `meal.saved` for every enabled webhook of the user that wants it. Call inside the
 * transaction that writes the meal; `meal` is read only when there is someone to tell.
 */
export function enqueueMealSaved(
  db: Database,
  config: Policy,
  userId: number,
  action: 'created' | 'updated' | 'deleted',
  meal: () => Meal | DeletedMeal,
  now = Date.now(),
) {
  const hooks = db
    .prepare(
      `SELECT id FROM webhooks WHERE user_id = ? AND enabled = 1
       AND EXISTS (SELECT 1 FROM json_each(events) WHERE value = 'meal.saved')`,
    )
    .pluck()
    .all(userId) as number[];
  if (!hooks.length || !integrationsPolicy(db, config).outbound) return;
  const m = meal();
  const data = {
    action,
    meal: {
      id: m.id,
      clientId: m.clientId,
      date: m.localDate,
      mealType: m.mealType,
      ...('items' in m && {
        eatenAt: m.eatenAt,
        items: m.items.map((i) => ({
          name: i.name,
          grams: i.grams,
          unit: i.unit,
          kcal: i.kcal,
          proteinG: i.proteinG,
          fatG: i.fatG,
          carbsG: i.carbsG,
        })),
        kcal: m.kcal,
        proteinG: m.proteinG,
        fatG: m.fatG,
        carbsG: m.carbsG,
      }),
    },
  };
  const insert = db.prepare(
    `INSERT INTO webhook_outbox (webhook_id, event, body, next_at) VALUES (?, 'meal.saved', ?, ?)`,
  );
  // One id per webhook: it is X-OCT-Delivery, the receiver's key for dropping repeats.
  for (const id of hooks)
    insert.run(
      id,
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        event: 'meal.saved',
        occurredAt: new Date(now).toISOString(),
        user: { id: userId },
        data,
      }),
      now,
    );
}

interface DueRow {
  id: number;
  webhook_id: number;
  event: string;
  body: string;
  attempts: number;
  url: string;
  secret_enc: string;
}

export interface DeliveryDeps {
  db: Database;
  config: Policy;
  secrets: Secrets;
  deliver?: Deliver;
}

/** One pass: up to 20 due events, 4 at a time. Under the admin's ban the outbox is emptied instead. */
export async function deliverDue(
  { db, config, secrets, deliver = realDeliver }: DeliveryDeps,
  now = Date.now(),
) {
  if (!integrationsPolicy(db, config).outbound) {
    db.prepare('DELETE FROM webhook_outbox').run();
    return;
  }
  // A switched-off webhook drops what it had queued; switching it on does not replay old events.
  db.prepare(
    'DELETE FROM webhook_outbox WHERE webhook_id IN (SELECT id FROM webhooks WHERE enabled = 0)',
  ).run();
  const rows = db
    .prepare(
      `SELECT o.id, o.webhook_id, o.event, o.body, o.attempts, w.url, w.secret_enc
       FROM webhook_outbox o JOIN webhooks w ON w.id = o.webhook_id
       WHERE o.next_at <= ? ORDER BY o.next_at, o.id LIMIT ?`,
    )
    .all(now, BATCH) as DueRow[];

  const one = async (row: DueRow) => {
    const secret = secrets.open(row.secret_enc, WEBHOOK_SECRET_PURPOSE);
    const attempts = row.attempts + 1;
    const result =
      secret === null
        ? { status: null, error: 'secret', durationMs: 0 }
        : await deliver({
            url: row.url,
            secret,
            event: row.event,
            deliveryId: (JSON.parse(row.body) as { id: string }).id,
            body: row.body,
          });
    const ok =
      result.status !== null && result.status >= 200 && result.status < 300;
    db.transaction(() => {
      if (!ok && attempts <= RETRY_MS.length) {
        db.prepare(
          'UPDATE webhook_outbox SET attempts = ?, next_at = ? WHERE id = ?',
        ).run(attempts, now + RETRY_MS[attempts - 1]!, row.id);
        return;
      }
      db.prepare('DELETE FROM webhook_outbox WHERE id = ?').run(row.id);
      if (ok)
        db.prepare('UPDATE webhooks SET fail_streak = 0 WHERE id = ?').run(
          row.webhook_id,
        );
      else
        db.prepare(
          `UPDATE webhooks SET fail_streak = fail_streak + 1,
             enabled = CASE WHEN fail_streak + 1 >= @max THEN 0 ELSE enabled END,
             disabled_reason = CASE WHEN fail_streak + 1 >= @max THEN 'failures' ELSE disabled_reason END
           WHERE id = @id`,
        ).run({ id: row.webhook_id, max: FAILS_TO_DISABLE });
    })();
    logDelivery(db, row.webhook_id, row.event, attempts, result, now);
  };

  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < rows.length) {
        const row = rows[next++]!;
        // A webhook deleted mid-send fails its log insert; the pass must not end while others still send.
        await one(row).catch((err) =>
          console.error(
            `[webhooks] event ${row.id}: ${(err as Error).message}`,
          ),
        );
      }
    }),
  );
}

/** The background deliverer; a pass still running skips the next tick. Returns stop(). */
export function startWebhookDelivery(deps: DeliveryDeps) {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    deliverDue(deps)
      .catch((err) =>
        console.error(`[webhooks] delivery failed: ${(err as Error).message}`),
      )
      .finally(() => (busy = false));
  }, DELIVERY_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
