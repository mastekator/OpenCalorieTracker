import { useEffect, useState } from 'react';
import { ApiError, type ClientErrorCode } from '../api/client';

/** The banner: password ones (`password`, timeout, blocked) sit above the fields, the rest on top. */
export type Notice =
  | { kind: 'expired' }
  | { kind: 'error'; code: ClientErrorCode; password?: true }
  | { kind: 'timeout'; until: number }
  | { kind: 'blocked' }
  | { kind: 'no_passkey' }
  | { kind: 'revoked' };

export function noticeOf(err: unknown, fallback: ClientErrorCode): Notice {
  if (!(err instanceof ApiError)) return { kind: 'error', code: fallback };
  switch (err.code) {
    case 'too_many_attempts': {
      const sec = (err.details as { retryAfterSec?: unknown } | undefined)
        ?.retryAfterSec;
      return {
        kind: 'timeout',
        until: Date.now() + (typeof sec === 'number' ? sec : 60) * 1000,
      };
    }
    case 'device_blocked':
    case 'ip_blocked':
      return { kind: 'blocked' };
    case 'passkey_unknown':
      return { kind: 'revoked' };
    default:
      return { kind: 'error', code: err.code };
  }
}

/** The shown notice; a timeout counts down once a minute and goes away when it ends. */
export function useNotice(initial: Notice | null) {
  const [notice, setNotice] = useState(initial);
  const [now, setNow] = useState(Date.now);
  const left = notice?.kind === 'timeout' ? notice.until - now : 0;
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), left % 60_000 || 60_000);
    return () => clearTimeout(id);
  }, [left]);
  return {
    notice: notice?.kind === 'timeout' && left <= 0 ? null : notice,
    minutes: Math.ceil(left / 60_000),
    show: (next: Notice | null) => {
      setNow(Date.now());
      setNotice(next);
    },
  };
}
