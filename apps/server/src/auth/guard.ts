import type { Context } from 'hono';
import type { AppDeps } from '../app.js';
import { ApiError } from '../http/errors.js';
import { clientIp } from '../http/client-ip.js';
import type { AuthEnv } from './session.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Thresholds of AC-5.7, AC-5.8 and AC-5.8a; changed by PR, not by env (ADR-0003). */
export const DEVICE_FAILS = 5;
export const IP_FAILS = 20;
export const IP_FAIL_WINDOW = HOUR;
export const TIMEOUT = 15 * MINUTE;
export const TIMEOUTS_TO_BLOCK = 3;
export const IP_TIMEOUT_WINDOW = DAY;
/** Unblocked rows idle this long hold nothing that still matters; fail() prunes them. */
export const STALE_AFTER = DAY;

interface Row {
  kind: 'device' | 'ip';
  ip: string;
  device_id: string;
  fail_count: number;
  window_started_at: number | null;
  timeout_count: number;
  timeouts_window_started_at: number | null;
  timeout_until: number | null;
  blocked_at: number | null;
  last_email: string | null;
  user_agent: string | null;
  last_fail_at: number | null;
}

/**
 * Brute-force protection for password sign-in, registration and token checks (ADR-0003):
 * call check() before the secret is verified, then fail() or succeed().
 */
export function guard(c: Context<AuthEnv>, { config, db }: AppDeps) {
  const ip = clientIp(c, config.trustProxyHops);
  const deviceId = c.var.deviceId;
  const load = (kind: Row['kind'], device_id: string): Row | undefined =>
    db
      .prepare(
        'SELECT * FROM login_guards WHERE kind = ? AND ip = ? AND device_id = ?',
      )
      .get(kind, ip, device_id) as Row | undefined;
  const fresh = (kind: Row['kind'], device_id: string): Row => ({
    kind,
    ip,
    device_id,
    fail_count: 0,
    window_started_at: null,
    timeout_count: 0,
    timeouts_window_started_at: null,
    timeout_until: null,
    blocked_at: null,
    last_email: null,
    user_agent: null,
    last_fail_at: null,
  });
  const save = db.prepare(
    `INSERT INTO login_guards (kind, ip, device_id, fail_count, window_started_at, timeout_count,
       timeouts_window_started_at, timeout_until, blocked_at, last_email, user_agent, last_fail_at)
     VALUES (@kind, @ip, @device_id, @fail_count, @window_started_at, @timeout_count,
       @timeouts_window_started_at, @timeout_until, @blocked_at, @last_email, @user_agent, @last_fail_at)
     ON CONFLICT (kind, ip, device_id) DO UPDATE SET
       fail_count = excluded.fail_count, window_started_at = excluded.window_started_at,
       timeout_count = excluded.timeout_count,
       timeouts_window_started_at = excluded.timeouts_window_started_at,
       timeout_until = excluded.timeout_until, blocked_at = excluded.blocked_at,
       last_email = excluded.last_email, user_agent = excluded.user_agent,
       last_fail_at = excluded.last_fail_at`,
  );
  // A row in timeout or blocked takes no more failures (AC-5.7), even from requests already past check().
  const closed = (row: Row, now: number) =>
    row.blocked_at !== null || (row.timeout_until ?? 0) > now;
  const timeOut = (row: Row, now: number) => {
    row.fail_count = 0;
    row.timeout_count++;
    row.timeout_until = now + TIMEOUT;
    if (row.timeout_count >= TIMEOUTS_TO_BLOCK) row.blocked_at = now;
  };

  return {
    /** Throws 429 while the IP or this device is blocked or timed out; counts nothing. */
    check() {
      const now = Date.now();
      const ipRow = load('ip', '');
      const deviceRow = deviceId ? load('device', deviceId) : undefined;
      if (ipRow?.blocked_at) throw new ApiError(429, 'ip_blocked');
      if (deviceRow?.blocked_at) throw new ApiError(429, 'device_blocked');
      const until = Math.max(
        ipRow?.timeout_until ?? 0,
        deviceRow?.timeout_until ?? 0,
      );
      if (until > now) {
        throw new ApiError(429, 'too_many_attempts', {
          retryAfterSec: Math.ceil((until - now) / 1000),
        });
      }
    },

    /** Records one failed attempt against this IP and, if the client has one, its device. */
    fail(email?: string) {
      const now = Date.now();
      const seen = {
        last_email: email ?? null,
        user_agent: c.req.header('user-agent') ?? null,
        last_fail_at: now,
      };
      db.transaction(() => {
        db.prepare(
          'DELETE FROM login_guards WHERE blocked_at IS NULL AND last_fail_at < ?',
        ).run(now - STALE_AFTER);

        const ipRow = load('ip', '') ?? fresh('ip', '');
        if (!closed(ipRow, now)) {
          if (now - (ipRow.window_started_at ?? 0) >= IP_FAIL_WINDOW) {
            ipRow.fail_count = 0;
            ipRow.window_started_at = now;
          }
          if (++ipRow.fail_count >= IP_FAILS) {
            if (
              now - (ipRow.timeouts_window_started_at ?? 0) >=
              IP_TIMEOUT_WINDOW
            ) {
              ipRow.timeout_count = 0;
              ipRow.timeouts_window_started_at = now;
            }
            timeOut(ipRow, now);
            ipRow.window_started_at = null;
          }
          save.run({ ...ipRow, ...seen });
        }

        if (!deviceId) return;
        const deviceRow = load('device', deviceId) ?? fresh('device', deviceId);
        if (closed(deviceRow, now)) return;
        if (++deviceRow.fail_count >= DEVICE_FAILS) timeOut(deviceRow, now);
        save.run({ ...deviceRow, ...seen });
      })();
    },

    /** Clears this device's counters; the IP's are left to expire (AC-5.9). */
    succeed() {
      if (deviceId) {
        db.prepare(
          "DELETE FROM login_guards WHERE kind = 'device' AND ip = ? AND device_id = ?",
        ).run(ip, deviceId);
      }
    },
  };
}
