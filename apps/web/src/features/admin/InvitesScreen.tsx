import { useRef, useState, type FormEvent } from 'react';
import { Mail, Plus } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { z } from 'zod';
import {
  createdLinkResponseSchema,
  inviteSchema,
  type CreatedLinkResponse,
  type Invite,
} from '@oct/shared';
import { api, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { Field } from '../../ui/Field/Field';
import { List, ListRow } from '../../ui/List/List';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Sheet } from '../../ui/Sheet/Sheet';
import { LinkReadySheet } from './LinkReadySheet';
import { codeOf, formatDate, useAdminList } from './useAdminList';
import './admin.css';

export const INVITES_PATH = '/settings/admin/invites';
const API = '/api/admin/invites';
const listSchema = z.array(inviteSchema);
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
const TONE = {
  pending: 'warn',
  used: 'ok',
  expired: 'neutral',
  revoked: 'err',
} as const;

/** «Earlier · 30 days» counts from when the status changed, not from creation. */
const changedAt = (i: Invite) => i.usedAt ?? i.revokedAt ?? i.expiresAt;

/** 4.1 Invites (OCT-13 §7): pending with «Revoke», the last 30 days, «Show all»; `?new` opens 4.2. */
export function InvitesScreen() {
  const { t, locale } = useT();
  const [, navigate] = useLocation();
  const creating = new URLSearchParams(useSearch()).has('new');
  const { items, load, act, failed } = useAdminList(API, listSchema);
  const [showAll, setShowAll] = useState(false);
  const [revoke, setRevoke] = useState<Invite | null>(null);
  const [link, setLink] = useState<{ email: string } & CreatedLinkResponse>();

  if (failed) return failed;
  if (!items) return null;

  const pending = items.filter((i) => i.status === 'pending');
  const done = items.filter((i) => i.status !== 'pending');
  const cutoff = Date.now() - RECENT_MS;
  const earlier = showAll ? done : done.filter((i) => changedAt(i) >= cutoff);
  const hidden = done.length - earlier.length;
  const date = (ms: number) => formatDate(locale, ms);
  const meta = (i: Invite) =>
    i.status === 'used'
      ? t('invites.used_at', { datetime: formatDate(locale, i.usedAt!, true) })
      : i.status === 'pending'
        ? t('invites.valid_until', { date: date(i.expiresAt) })
        : t('invites.created_at', { date: date(i.createdAt) });
  const openNew = () => navigate(`${INVITES_PATH}?new`);

  return (
    <div className="settings">
      {items.length === 0 ? (
        <ScreenState icon={<Mail />} title={t('invites.empty')} />
      ) : (
        <>
          {pending.length > 0 && (
            <List title={t('invites.pending')}>
              {pending.map((i) => (
                <ListRow
                  key={i.id}
                  description={meta(i)}
                  value={
                    <Button
                      small
                      variant="danger-plain"
                      aria-label={`${t('invites.revoke')} ${i.email}`}
                      onClick={() => setRevoke(i)}
                    >
                      {t('invites.revoke')}
                    </Button>
                  }
                >
                  {i.email}
                </ListRow>
              ))}
            </List>
          )}
          {done.length > 0 && (
            <List
              title={t('invites.earlier')}
              footer={hidden > 0 ? t('invites.older_hidden') : undefined}
            >
              {earlier.map((i) => (
                <ListRow
                  key={i.id}
                  description={meta(i)}
                  value={
                    <Badge tone={TONE[i.status]}>
                      {t(`invites.status.${i.status}`)}
                    </Badge>
                  }
                >
                  {i.email}
                </ListRow>
              ))}
              {hidden > 0 && (
                <ListRow
                  accent
                  chevron={false}
                  onClick={() => setShowAll(true)}
                >
                  {t('invites.show_all')}
                </ListRow>
              )}
            </List>
          )}
        </>
      )}
      <List footer={t('invites.once_hint')}>
        <ListRow icon={<Plus />} accent onClick={openNew}>
          {t('invites.invite')}
        </ListRow>
      </List>

      {creating && (
        <NewInviteSheet
          pending={pending}
          onClose={() => navigate(INVITES_PATH, { replace: true })}
          onCreated={(created) => {
            navigate(INVITES_PATH, { replace: true });
            setLink(created);
            void load();
          }}
        />
      )}
      {link && (
        <LinkReadySheet
          url={link.url}
          body={t('link_ready.invite_body', {
            email: link.email,
            date: date(link.expiresAt),
          })}
          onClose={() => setLink(undefined)}
        />
      )}
      <ConfirmDialog
        open={revoke !== null}
        title={t('invites.revoke')}
        body={
          revoke
            ? t('invites.revoke_confirm', { email: revoke.email })
            : undefined
        }
        confirmLabel={t('invites.revoke')}
        onConfirm={() => {
          const id = revoke!.id;
          setRevoke(null);
          void act(
            () => api(`${API}/${id}/revoke`, z.undefined(), { method: 'POST' }),
            t('invites.revoked'),
          );
        }}
        onCancel={() => setRevoke(null)}
      />
    </div>
  );
}

type SheetProps = {
  pending: Invite[];
  onClose: () => void;
  onCreated: (link: { email: string } & CreatedLinkResponse) => void;
};

/** 4.2 New invite: a pending invite for the same email is replaced by the server. */
export function NewInviteSheet({ pending, onClose, onCreated }: SheetProps) {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [empty, setEmpty] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const normalized = email.trim().toLowerCase();
  const replaces = pending.some((i) => i.email.toLowerCase() === normalized);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // The button stays enabled: an empty field is explained, not blocked (4.2).
    if (!normalized) {
      setEmpty(true);
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const link = await api(API, createdLinkResponseSchema, {
        method: 'POST',
        body: { email: email.trim() },
      });
      onCreated({ email: email.trim(), ...link });
    } catch (err) {
      setError(codeOf(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open title={t('invites.new.title')} onClose={onClose}>
      <form className="admin-sheet" onSubmit={(e) => void submit(e)}>
        {error && error !== 'email_taken' && (
          <Banner tone="danger">{t(`errors.${error}`)}</Banner>
        )}
        <Field
          label={t('invites.new.email')}
          type="email"
          autoComplete="off"
          autoFocus
          ref={input}
          value={email}
          hint={
            replaces ? t('invites.new.replaces') : t('invites.new.email_hint')
          }
          error={
            empty
              ? t('invites.new.required')
              : error === 'email_taken'
                ? t('invites.new.exists')
                : undefined
          }
          onChange={(e) => {
            setEmail(e.target.value);
            setEmpty(false);
            if (error === 'email_taken') setError(null);
          }}
        />
        <Button type="submit" loading={busy}>
          {t('invites.new.submit')}
        </Button>
      </form>
    </Sheet>
  );
}
