import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { addDays, type Meal } from '@oct/shared';
import type { Config } from '../config.js';
import { integrationsPolicy } from '../integrations/routes.js';
import { readDay } from '../public-api/routes.js';
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
  // One id per webhook: it is X-OCT-Delivery, the receiver's key for dropping repeats.
  for (const id of hooks) queue(db, id, 'meal.saved', userId, data, now);
}

function queue(
  db: Database,
  webhookId: number,
  event: string,
  userId: number,
  data: object,
  now: number,
) {
  db.prepare(
    'INSERT INTO webhook_outbox (webhook_id, event, body, next_at) VALUES (?, ?, ?, ?)',
  ).run(
    webhookId,
    event,
    JSON.stringify({
      version: 1,
      id: randomUUID(),
      event,
      occurredAt: new Date(now).toISOString(),
      user: { id: userId },
      data,
    }),
    now,
  );
}

interface TimedRow {
  id: number;
  user_id: number;
  event: 'day.closed' | 'day.empty';
  at: string;
  time_zone: string | null;
  last_date: string | null;
  created_at: number;
}

/** [YYYY-MM-DD, HH:MM] of `ms` in the time zone. */
function localDateTime(ms: number, timeZone: string | null) {
  // 'sv' gives YYYY-MM-DD HH:MM; h23 keeps midnight 00:00, not 24:00, so strings compare.
  return new Date(ms)
    .toLocaleString('sv', {
      timeZone: timeZone ?? undefined,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .split(' ') as [string, string];
}

/** Queues the event of `r` for `date` and marks the date settled, in one transaction. */
function settle(db: Database, r: TimedRow, date: string, now: number) {
  db.transaction(() => {
    if (r.event === 'day.closed')
      queue(db, r.id, r.event, r.user_id, readDay(db, r.user_id, date), now);
    else if (
      !db
        .prepare('SELECT 1 FROM meals WHERE user_id = ? AND local_date = ?')
        .get(r.user_id, date)
    )
      queue(db, r.id, r.event, r.user_id, { date }, now);
    // Marked even when a meal exists: the day is settled, a later delete does not fire it.
    db.prepare(
      `INSERT INTO webhook_schedule (webhook_id, event, last_date) VALUES (?, ?, ?)
       ON CONFLICT (webhook_id, event) DO UPDATE SET last_date = excluded.last_date`,
    ).run(r.id, r.event, date);
  })();
}

/**
 * Queues `day.closed` / `day.empty` once a local day, when the user's clock passes the chosen
 * time (ADR-0027 §4). A missed yesterday (busy deliverer at 23:59, restart) is caught up with
 * yesterday's date, if the webhook existed then; older missed days are not.
 */
export function enqueueTimed(db: Database, config: Policy, now = Date.now()) {
  if (!integrationsPolicy(db, config).outbound) return;
  const rows = db
    .prepare(
      `SELECT w.id, w.user_id, e.value AS event,
         CASE e.value WHEN 'day.closed' THEN w.day_closed_at ELSE w.empty_by END AS at,
         u.time_zone, s.last_date, w.created_at
       FROM webhooks w
       JOIN json_each(w.events) e ON e.value IN ('day.closed', 'day.empty')
       JOIN users u ON u.id = w.user_id
       LEFT JOIN webhook_schedule s ON s.webhook_id = w.id AND s.event = e.value
       WHERE w.enabled = 1`,
    )
    .all() as TimedRow[];
  const attempt = (r: TimedRow, date: string) => {
    try {
      settle(db, r, date, now);
    } catch (err) {
      console.error(
        `[webhooks] ${r.event} of ${r.id}: ${(err as Error).message}`,
      );
    }
  };
  for (const r of rows) {
    if (!r.at) continue;
    const [date, time] = localDateTime(now, r.time_zone);
    const yesterday = addDays(date, -1);
    if (
      (r.last_date ?? '') < yesterday &&
      localDateTime(r.created_at, r.time_zone)[0] <= yesterday
    )
      attempt(r, yesterday);
    if (time >= r.at && r.last_date !== date) attempt(r, date);
  }
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

/** Timed events are checked this often. */
export const TIMED_INTERVAL_MS = 60_000;

/** The background deliverer; a pass still running skips the next tick. Returns stop(). */
export function startWebhookDelivery(deps: DeliveryDeps) {
  let busy = false;
  let timedAt = -Infinity;
  const timer = setInterval(() => {
    const now = Date.now();
    // Before the busy guard: a slow pass at 23:59 must not push the check past midnight.
    if (now - timedAt >= TIMED_INTERVAL_MS) {
      timedAt = now;
      try {
        enqueueTimed(deps.db, deps.config, now);
      } catch (err) {
        console.error(`[webhooks] timed events: ${(err as Error).message}`);
      }
    }
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
