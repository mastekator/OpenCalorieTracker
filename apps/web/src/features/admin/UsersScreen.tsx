import { useState } from 'react';
import { z } from 'zod';
import {
  adminUserSchema,
  createdLinkResponseSchema,
  type AdminUser,
  type CreatedLinkResponse,
} from '@oct/shared';
import { api, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { List, ListRow } from '../../ui/List/List';
import { Sheet } from '../../ui/Sheet/Sheet';
import { LinkReadySheet } from './LinkReadySheet';
import { codeOf, formatDate, useAdminList } from './useAdminList';
import './admin.css';

const API = '/api/admin/users';
const listSchema = z.array(adminUserSchema);
const nameOf = (u: AdminUser) => u.name ?? u.email;
/** «Since … · signed in …» (4.4, 4.5). */
const meta = (t: ReturnType<typeof useT>['t'], locale: string, u: AdminUser) =>
  u.lastLoginAt === null
    ? t('users.meta_never', { date: formatDate(locale, u.createdAt) })
    : t('users.meta', {
        date: formatDate(locale, u.createdAt),
        when: formatDate(locale, u.lastLoginAt),
      });

/** 4.4 Users (OCT-13 §7): one's own row opens nothing — self-deletion is not offered. */
export function UsersScreen({ selfId }: { selfId: number }) {
  const { t, locale } = useT();
  const { items, act, failed } = useAdminList(API, listSchema);
  const [open, setOpen] = useState<AdminUser | null>(null);

  if (failed) return failed;
  if (!items) return null;
  return (
    <div className="settings">
      <List>
        {items.map((u) => (
          <ListRow
            key={u.id}
            description={
              u.name ? (
                <>
                  {u.email}
                  <br />
                  {meta(t, locale, u)}
                </>
              ) : (
                meta(t, locale, u)
              )
            }
            value={
              u.role === 'admin' ? <Badge>{t('users.admin')}</Badge> : undefined
            }
            onClick={u.id === selfId ? undefined : () => setOpen(u)}
          >
            {nameOf(u)}
          </ListRow>
        ))}
      </List>
      {open && (
        <UserSheet
          user={open}
          onClose={() => setOpen(null)}
          onDelete={() => {
            setOpen(null);
            void act(
              () =>
                api(`${API}/${open.id}`, z.undefined(), { method: 'DELETE' }),
              t('users.deleted', { name: nameOf(open) }),
            );
          }}
        />
      )}
    </div>
  );
}

type SheetProps = {
  user: AdminUser;
  onClose: () => void;
  onDelete: () => void;
};

/** 4.5 A user: recovery link (the same «Link ready» sheet) and deletion with an explicit warning (AC-8.3). */
export function UserSheet({ user, onClose, onDelete }: SheetProps) {
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [link, setLink] = useState<CreatedLinkResponse>();
  const name = nameOf(user);

  async function recovery() {
    setBusy(true);
    setError(null);
    try {
      setLink(
        await api(
          `${API}/${user.id}/recovery-link`,
          createdLinkResponseSchema,
          {
            method: 'POST',
          },
        ),
      );
    } catch (err) {
      setError(codeOf(err));
    }
    setBusy(false);
  }

  if (link)
    return (
      <LinkReadySheet
        url={link.url}
        body={t('link_ready.recovery_body', {
          name,
          date: formatDate(locale, link.expiresAt),
        })}
        onClose={onClose}
      />
    );
  return (
    <>
      <Sheet open title={name} onClose={onClose}>
        <div className="admin-sheet">
          {error && <Banner tone="danger">{t(`errors.${error}`)}</Banner>}
          <p className="admin-sheet__note">
            {user.email} · {meta(t, locale, user)}
          </p>
          <Button
            variant="tonal"
            loading={busy}
            onClick={() => void recovery()}
          >
            {t('users.recovery_link')}
          </Button>
          <Button
            variant="danger-plain"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            {t('users.delete')}
          </Button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        title={t('users.delete_title', { name })}
        body={t('users.delete_body', { name })}
        confirmLabel={t('users.delete')}
        onConfirm={onDelete}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
