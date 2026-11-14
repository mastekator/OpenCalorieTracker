import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import type { MeResponse } from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { Field } from '../../ui/Field/Field';
import { PasswordRules } from '../../ui/PasswordRules/PasswordRules';
import { useToast } from '../../ui/Toast/Toast';
import './settings.css';

type Props = {
  user: MeResponse;
  /** Re-reads /me and leaves the screen. */
  onDone: () => Promise<void>;
};

/** 3.4 Change password, or set one without the current field (OCT-13 §7). */
export function PasswordScreen({ user, onDone }: Props) {
  const { t } = useT();
  const toast = useToast();
  const has = user.methods.includes('password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  const mismatch = attempted && repeat !== next;
  const filled = (!has || current) && next && repeat;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setError(null);
    if (!filled || repeat !== next) return;
    setBusy(true);
    try {
      await api('/api/account/password', z.undefined(), {
        method: 'PUT',
        body: has
          ? { currentPassword: current, newPassword: next }
          : { newPassword: next },
      });
      toast({ text: t(has ? 'password.changed' : 'password.set_done') });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'internal');
      setBusy(false);
    }
  }

  const newError =
    error === 'password_invalid' || error === 'password_too_common'
      ? t(`errors.${error}`)
      : undefined;
  const other =
    error && error !== 'invalid_credentials' && !newError ? error : null;

  return (
    <form className="settings" onSubmit={submit} noValidate>
      {other && <Banner tone="danger">{t(`errors.${other}`)}</Banner>}
      {has && (
        <Field
          type="password"
          label={t('password.current')}
          autoComplete="current-password"
          value={current}
          error={
            error === 'invalid_credentials'
              ? t('password.err.current')
              : undefined
          }
          onChange={(e) => setCurrent(e.target.value)}
        />
      )}
      <div>
        <Field
          type="password"
          label={t('password.new')}
          autoComplete="new-password"
          value={next}
          error={newError}
          onChange={(e) => setNext(e.target.value)}
        />
        <PasswordRules
          password={next}
          email={user.email}
          attempted={attempted}
        />
      </div>
      <Field
        type="password"
        label={t('password.repeat')}
        autoComplete="new-password"
        value={repeat}
        hint={t('password.other_devices')}
        error={mismatch ? t('password.err.mismatch') : undefined}
        onChange={(e) => setRepeat(e.target.value)}
      />
      <Button type="submit" loading={busy} disabled={!filled}>
        {t(has ? 'password.change' : 'password.set')}
      </Button>
    </form>
  );
}
