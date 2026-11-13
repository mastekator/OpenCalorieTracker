import { createHash, randomBytes } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { LinkKind, LinkStatus } from '@oct/shared';
import { ApiError } from '../http/errors.js';

const DAY = 24 * 60 * 60 * 1000;
/** Invites and recovery links (AC-2.2, AC-6.4). */
export const LINK_TTL = 7 * DAY;
/** The admin's passkey setup link on a passkey-only installation (AC-1.5). */
export const ADMIN_SETUP_TTL = DAY;

const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest();

const paths: Record<LinkKind, string> = {
  invite: 'invite',
  recovery: 'recover',
};

/**
 * Creates an invite (by email) or a recovery link (by user), revoking the pending one of the same
 * kind for the same person. Only the hash is stored; the returned URL is the one copy of the token.
 */
export function createLink(
  db: Database,
  publicUrl: string,
  link: {
    kind: LinkKind;
    email?: string;
    userId?: number;
    ttl: number;
    createdBy: number | null;
  },
) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = now + link.ttl;
  const target = link.kind === 'invite' ? 'email' : 'user_id';
  const id = db.transaction(() => {
    db.prepare(
      `UPDATE invites SET revoked_at = ?
       WHERE kind = ? AND ${target} = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    ).run(now, link.kind, link.email ?? link.userId, now);
    return db
      .prepare(
        `INSERT INTO invites (kind, email, user_id, token_hash, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        link.kind,
        link.email ?? null,
        link.userId ?? null,
        tokenHash(token),
        link.createdBy,
        now,
        expiresAt,
      ).lastInsertRowid as number;
  })();
  return { id, url: `${publicUrl}/${paths[link.kind]}#${token}`, expiresAt };
}

export interface Link {
  id: number;
  kind: LinkKind;
  /** The invitee, or the user a recovery link is for. */
  email: string;
  user_id: number | null;
  status: LinkStatus;
}

/** The link behind a token, or `{ status: 'invalid' }` for an unknown or revoked one (E-4.4). */
export function findLink(
  db: Database,
  token: string,
): Link | { status: 'invalid' } {
  const row = db
    .prepare(
      `SELECT i.id, i.kind, COALESCE(i.email, u.email) AS email, i.user_id,
              i.expires_at, i.used_at
       FROM invites i LEFT JOIN users u ON u.id = i.user_id
       WHERE i.token_hash = ? AND i.revoked_at IS NULL`,
    )
    .get(tokenHash(token)) as
    | (Omit<Link, 'status'> & {
        expires_at: number;
        used_at: number | null;
      })
    | undefined;
  if (!row) return { status: 'invalid' };
  const { expires_at, used_at, ...link } = row;
  const status: LinkStatus =
    used_at !== null ? 'used' : expires_at <= Date.now() ? 'expired' : 'valid';
  return { ...link, status };
}

/** Throws the error a link of this status gets when someone tries to use it. */
export function assertUsable(
  link: Link | { status: 'invalid' },
): asserts link is Link {
  if (link.status === 'invalid') throw new ApiError(400, 'invite_invalid');
  if (link.status === 'expired') throw new ApiError(410, 'invite_expired');
  if (link.status === 'used') throw new ApiError(409, 'invite_used');
}

/**
 * Re-checks the token and marks it used; call inside the transaction that acts on it, so of two
 * concurrent uses exactly one wins (E-3.3) and a link revoked or expired meanwhile fails (AC-3.4).
 */
export function consumeLink(db: Database, token: string, kind: LinkKind) {
  const link = findLink(db, token);
  assertUsable(link);
  if (link.kind !== kind) throw new ApiError(400, 'invite_invalid');
  db.prepare('UPDATE invites SET used_at = ? WHERE id = ?').run(
    Date.now(),
    link.id,
  );
  return link;
}
