import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CircleAlert, KeyRound, Plus } from 'lucide-react';
import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { z } from 'zod';
import { passkeySchema, type MeResponse, type Passkey } from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { Field } from '../../ui/Field/Field';
import { List, ListRow } from '../../ui/List/List';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { isLastMethod } from './methods';
import './settings.css';

const PATH = '/api/account/passkeys';
const optionsSchema = z.object({
  challengeId: z.string(),
  options: z.custom<PublicKeyCredentialCreationOptionsJSON>(
    (v) => typeof v === 'object' && v !== null,
  ),
});
const codeOf = (err: unknown): ClientErrorCode =>
  err instanceof ApiError ? err.code : 'passkey_failed';
const isCancel = (err: unknown) =>
  err instanceof Error &&
  (err.name === 'NotAllowedError' || err.name === 'AbortError');

type Props = {
  user: MeResponse;
  /** Re-reads /me, so `methods` and the settings rows follow a change. */
  onChanged: () => Promise<void>;
};

/** 3.3 My passkeys (OCT-13 §7): list, «this device», rename and delete in a sheet, add. */
export function PasskeysScreen({ user, onChanged }: Props) {
  const { t, locale } = useT();
  const toast = useToast();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [loadError, setLoadError] = useState<ClientErrorCode | null>(null);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Passkey | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setPasskeys(await api(PATH, z.array(passkeySchema)));
    } catch (err) {
      setLoadError(codeOf(err));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const date = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      // The year only when it is not the current one.
      ...(new Date(ms).getFullYear() !== new Date().getFullYear() && {
        year: 'numeric',
      }),
    }).format(ms);

  async function add() {
    setError(null);
    if (!browserSupportsWebAuthn()) return setError('passkey_failed');
    setAdding(true);
    try {
      const { challengeId, options } = await api(
        `${PATH}/options`,
        optionsSchema,
        { method: 'POST' },
      );
      const response = await startRegistration({ optionsJSON: options });
      await api(`${PATH}/verify`, passkeySchema, {
        method: 'POST',
        body: { challengeId, response },
      });
      toast({ text: t('passkeys.added') });
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      if (!isCancel(err)) setError(codeOf(err));
    } finally {
      setAdding(false);
    }
  }

  if (loadError)
    return (
      <ScreenState
        icon={<CircleAlert />}
        tone="danger"
        title={t(`errors.${loadError}`)}
        action={
          <Button variant="tonal" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  // Under 300 ms nothing is shown (OCT-13 §3); a short list needs no skeleton.
  if (!passkeys) return null;

  const last = isLastMethod(user, passkeys.length);
  return (
    <div className="settings">
      {error && <Banner tone="danger">{t(`errors.${error}`)}</Banner>}
      <List footer={passkeys.length > 0 ? t('passkeys.hint') : undefined}>
        {passkeys.map((p) => (
          <ListRow
            key={p.id}
            icon={<KeyRound />}
            description={
              p.lastUsedAt === null
                ? t('passkeys.meta_unused', { date: date(p.createdAt) })
                : t('passkeys.meta', {
                    date: date(p.createdAt),
                    when: date(p.lastUsedAt),
                  })
            }
            value={
              p.thisDevice ? (
                <Badge tone="ok">{t('passkeys.this_device')}</Badge>
              ) : undefined
            }
            onClick={() => setOpen(p)}
          >
            {p.name}
          </ListRow>
        ))}
      </List>
      <List>
        <ListRow
          icon={<Plus />}
          accent
          disabled={adding}
          onClick={adding ? undefined : () => void add()}
        >
          {t('passkeys.add')}
        </ListRow>
      </List>
      {open && (
        <PasskeySheet
          passkey={open}
          last={last}
          onClose={() => setOpen(null)}
          onDone={async (deleted) => {
            setOpen(null);
            if (deleted) toast({ text: t('passkeys.deleted') });
            await Promise.all([load(), deleted && onChanged()]);
          }}
        />
      )}
    </div>
  );
}

type SheetProps = {
  passkey: Passkey;
  /** The only enabled way to sign in: deleting is not offered (AC-6.2). */
  last: boolean;
  onClose: () => void;
  onDone: (deleted: boolean) => Promise<void>;
};

export function PasskeySheet({ passkey, last, onClose, onDone }: SheetProps) {
  const { t } = useT();
  const [name, setName] = useState(passkey.name);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  async function run(kind: 'save' | 'delete') {
    setConfirm(false);
    setBusy(kind);
    setError(null);
    try {
      await (kind === 'save'
        ? api(`${PATH}/${passkey.id}`, passkeySchema, {
            method: 'PATCH',
            body: { name },
          })
        : api(`${PATH}/${passkey.id}`, z.undefined(), { method: 'DELETE' }));
      await onDone(kind === 'delete');
    } catch (err) {
      setError(codeOf(err));
      setBusy(null);
    }
  }

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && name !== passkey.name) void run('save');
  };

  return (
    <>
      <Sheet open onClose={onClose} title={passkey.name}>
        <form className="passkey-sheet" onSubmit={save}>
          {error && <Banner tone="danger">{t(`errors.${error}`)}</Banner>}
          <Field
            label={t('passkeys.name')}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="tonal"
            loading={busy === 'save'}
            disabled={
              !name.trim() || name === passkey.name || busy === 'delete'
            }
          >
            {t('passkeys.save_name')}
          </Button>
          <Button
            variant="danger-plain"
            disabled={last || busy !== null}
            aria-describedby={last ? `passkey-${passkey.id}-only` : undefined}
            onClick={() => setConfirm(true)}
          >
            {t('passkeys.delete')}
          </Button>
          {last && (
            <p
              id={`passkey-${passkey.id}-only`}
              className="passkey-sheet__note"
            >
              {t('passkeys.only_method')}
            </p>
          )}
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        title={t('passkeys.delete')}
        body={t('passkeys.delete_confirm', { name: passkey.name })}
        confirmLabel={t('passkeys.delete')}
        onConfirm={() => void run('delete')}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
