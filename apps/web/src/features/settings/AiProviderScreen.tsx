import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { CircleAlert, LogIn, Power, Users, WifiOff } from 'lucide-react';
import {
  adminAiStatusSchema,
  aiCheckResultSchema,
  type AdminAiStatus,
  type AiCheckResult,
} from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import {
  AiSettingsForm,
  type AiDraftState,
} from '../../ui/AiSettingsForm/AiSettingsForm';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { Field } from '../../ui/Field/Field';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import {
  ChatGptUsageLink,
  ProviderStatus,
} from '../../ui/ProviderStatus/ProviderStatus';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import {
  AI_STATUS_PATH,
  codeOf,
  draftBody,
  draftOf,
  useModels,
} from './aiDraft';
import { ChatGptSignInSheet } from './ChatGptSignInSheet';
import { ModelCompare } from './ModelCompare';
import { ModelTest } from './ModelTest';
import './settings.css';

export { AI_STATUS_PATH };

const SETTINGS_PATH = `${AI_STATUS_PATH}/settings`;

/** Admin «AI provider» (OCT-25 §5, OCT-248): live status and the settings form, never a stale copy (E-6.2). */
export function AiProviderScreen() {
  const { t, locale } = useT();
  const toast = useToast();
  const online = useOnline();
  const [status, setStatus] = useState<AdminAiStatus | null>(null);
  const [loadError, setLoadError] = useState<ClientErrorCode | null>(null);
  const [draft, setDraft] = useState<AiDraftState>(() => draftOf(null));
  const [replacing, setReplacing] = useState(false);
  const [keyError, setKeyError] = useState<string>();
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [failed, setFailed] = useState<AiCheckResult | null>(null);
  const [checked, setChecked] = useState<AiCheckResult | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [testsRev, setTestsRev] = useState(0);
  const nextTestsRev = useCallback(() => setTestsRev((n) => n + 1), []);
  const { models, load: loadModels, reset: resetModels } = useModels(draft);

  /** The server's answer replaces the draft; the typed key is dropped from memory. */
  const show = useCallback((next: AdminAiStatus) => {
    setStatus(next);
    setDraft(draftOf(next));
    setReplacing(false);
    setKeyError(undefined);
    setFailed(null);
    setChecked(null);
    setConflict(false);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      show(await api(AI_STATUS_PATH, adminAiStatusSchema));
    } catch (err) {
      setLoadError(codeOf(err));
    }
  }, [show]);
  // Re-read when the network comes back: offline shows no data at all.
  useEffect(() => {
    if (online) void load();
    else setStatus(null);
  }, [online, load]);

  if (!online)
    return (
      <ScreenState
        icon={<WifiOff />}
        title={t('ai.offline.title')}
        role="status"
      >
        {t('ai.offline.body')}
      </ScreenState>
    );
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
  // Under 300 ms nothing is shown (OCT-13 §3).
  if (!status) return null;

  const env = status.source === 'env';
  const dirty =
    !env &&
    (!status.source ||
      draft.provider !== status.provider ||
      draft.model !== (status.model ?? '') ||
      !!draft.apiKey ||
      !!draft.baseUrl);
  // A new address never gets the saved key (OCT-278), so its own key may be needed.
  const keyOpen =
    replacing ||
    draft.provider !== status.provider ||
    !status.keySet ||
    !!draft.baseUrl.trim();
  const body = draftBody(draft);
  const chatgpt = draft.provider === 'chatgpt';
  const signIn = status.chatgpt;
  // Shown also with AI_PROVIDER=chatgpt in env: the tokens never come from env (ADR-0031 §4).
  const subscription = signIn ? (
    <>
      {signIn.accountLabel && (
        <ListRow description={signIn.accountLabel}>
          {t('ai.chatgpt.account')}
        </ListRow>
      )}
      <ListRow
        description={new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
        }).format(signIn.signedInAt)}
      >
        {t('ai.chatgpt.signed_in')}
      </ListRow>
    </>
  ) : (
    <ListRow description={t('ai.chatgpt.not_connected_body')}>
      {t('ai.chatgpt.not_connected')}
    </ListRow>
  );
  const shareWarning = (
    <Banner
      tone="warning"
      icon={<Users aria-hidden="true" />}
      title={t('ai.chatgpt.share_title')}
      actions={<ChatGptUsageLink />}
    >
      {t('ai.chatgpt.share_body')}
    </Banner>
  );

  function change(patch: Partial<AiDraftState>) {
    setDraft((d) => ({ ...d, ...patch }));
    // Another connection has its own list.
    if ('provider' in patch || 'apiKey' in patch || 'baseUrl' in patch)
      resetModels();
    setFailed(null);
    setChecked(null);
    setKeyError(undefined);
  }

  function fail(err: unknown) {
    const code = codeOf(err);
    const details = (err as ApiError).details as
      Partial<AiCheckResult> | undefined;
    if (code === 'too_many_attempts') {
      const sec = (details as { retryAfterSec?: unknown })?.retryAfterSec;
      toast({
        text: t('ai.wait', { count: typeof sec === 'number' ? sec : 10 }),
      });
    } else if (code === 'ai_check_failed' && details?.state)
      setFailed({
        state: details.state,
        checkedAt: null,
        details: details.details,
      });
    else if (code === 'ai_key_required') {
      setReplacing(true);
      setKeyError(t('errors.ai_key_required'));
    } else if (code === 'ai_settings_changed') setConflict(true);
    else if (code === 'ai_not_configured' || code === 'ai_env_managed')
      void load();
    else toast({ text: t(`errors.${code}`) });
  }

  async function check() {
    setBusy('check');
    setChecked(null);
    try {
      if (!dirty)
        setStatus(
          await api(`${AI_STATUS_PATH}/check`, adminAiStatusSchema, {
            method: 'POST',
          }),
        );
      else {
        const result = await api(
          `${AI_STATUS_PATH}/check`,
          aiCheckResultSchema,
          { method: 'POST', body },
        );
        if (result.state === 'ok') toast({ text: t('ai.form.check_ok') });
        else setChecked(result);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function save(force: boolean) {
    setBusy('save');
    setFailed(null);
    try {
      show(
        await api(SETTINGS_PATH, adminAiStatusSchema, {
          method: 'PUT',
          body: { ...body, rev: status!.rev, ...(force && { force }) },
        }),
      );
      toast({ text: t('ai.form.saved') });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  /** Only the sign-in changed: an unsaved draft (e.g. ChatGPT picked, not saved yet) is kept. */
  async function reloadSignIn() {
    try {
      setStatus(await api(AI_STATUS_PATH, adminAiStatusSchema));
    } catch (err) {
      fail(err);
    }
  }

  async function signedIn() {
    setSigningIn(false);
    toast({ text: t('ai.chatgpt.signed_in_done') });
    await reloadSignIn();
  }

  async function signOut() {
    setConfirmSignOut(false);
    try {
      await api(`${AI_STATUS_PATH}/chatgpt`, z.unknown(), {
        method: 'DELETE',
      });
      toast({ text: t('ai.chatgpt.disconnected') });
      await reloadSignIn();
    } catch (err) {
      fail(err);
    }
  }

  async function turnOff() {
    setConfirmOff(false);
    try {
      show(await api(SETTINGS_PATH, adminAiStatusSchema, { method: 'DELETE' }));
      toast({ text: t('ai.form.off_done') });
    } catch (err) {
      fail(err);
    }
  }

  return (
    <>
      <ProviderStatus
        status={status}
        test={
          <ModelTest
            status={status}
            draft={draft}
            dirty={dirty}
            onFinished={nextTestsRev}
          />
        }
        compare={<ModelCompare rev={testsRev} />}
        side={
          // A saved row, even with an unreadable key, can be removed; env settings cannot (E-10).
          !env &&
          status.rev !== null && (
            <List>
              <ListRow
                icon={<Power />}
                danger
                chevron={false}
                onClick={() => setConfirmOff(true)}
              >
                {t('ai.form.turn_off')}
              </ListRow>
            </List>
          )
        }
      >
        {chatgpt && signIn && status.state === 'auth_error' && (
          <Button onClick={() => setSigningIn(true)}>
            <LogIn aria-hidden="true" />
            {t('ai.chatgpt.sign_in_again')}
          </Button>
        )}
        <AiSettingsForm
          status={status}
          subscription={subscription}
          draft={draft}
          onChange={change}
          keyOpen={keyOpen}
          onReplaceKey={() => setReplacing(true)}
          keyError={keyError}
          dirty={dirty}
          busy={busy}
          failed={failed}
          checked={checked}
          conflict={conflict}
          onCheck={() => void check()}
          onSave={() => void save(false)}
          onSaveAnyway={() => void save(true)}
          onReload={() => void load()}
          models={models}
          onLoadModels={() => void loadModels(draft)}
        />
        {chatgpt &&
          (signIn ? (
            <>
              <List>
                <ListRow
                  icon={<LogIn />}
                  accent
                  chevron={false}
                  onClick={() => setSigningIn(true)}
                >
                  {t('ai.chatgpt.sign_in_again')}
                </ListRow>
                <ListRow
                  icon={<Power />}
                  danger
                  chevron={false}
                  onClick={() => setConfirmSignOut(true)}
                >
                  {t('ai.chatgpt.disconnect')}
                </ListRow>
              </List>
              {shareWarning}
            </>
          ) : (
            <>
              {shareWarning}
              <Button onClick={() => setSigningIn(true)}>
                <LogIn aria-hidden="true" />
                {t('ai.chatgpt.sign_in')}
              </Button>
            </>
          ))}
        <RefineLimitField status={status} onSaved={setStatus} />
        <UserKeysGroup
          status={status}
          onSaved={setStatus}
          onFailed={() => void load()}
        />
      </ProviderStatus>
      <ConfirmDialog
        open={confirmOff}
        title={t('ai.form.off_title')}
        body={t('ai.form.off_body')}
        confirmLabel={t('ai.form.off_confirm')}
        onConfirm={() => void turnOff()}
        onCancel={() => setConfirmOff(false)}
      />
      <ConfirmDialog
        open={confirmSignOut}
        title={t('ai.chatgpt.disconnect_title')}
        body={t('ai.chatgpt.disconnect_body')}
        confirmLabel={t('ai.chatgpt.disconnect_confirm')}
        onConfirm={() => void signOut()}
        onCancel={() => setConfirmSignOut(false)}
      />
      <ChatGptSignInSheet
        open={signingIn}
        onClose={() => setSigningIn(false)}
        onDone={() => void signedIn()}
      />
    </>
  );
}

/** Refinements per meal per edit session (ADR-0020 §6); saved on blur or Enter, also with AI_* in env. */
function RefineLimitField({
  status,
  onSaved,
}: {
  status: AdminAiStatus;
  onSaved: (next: AdminAiStatus) => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const [value, setValue] = useState(String(status.refineLimit ?? ''));
  const [error, setError] = useState<string>();

  async function commit() {
    const text = value.trim();
    const limit = text === '' ? null : Number(text);
    if (
      limit !== null &&
      !(Number.isInteger(limit) && limit >= 1 && limit <= 50)
    )
      return setError(t('ai.form.limit_invalid'));
    setError(undefined);
    if (limit === status.refineLimit) return;
    try {
      onSaved(
        await api(`${AI_STATUS_PATH}/refine-limit`, adminAiStatusSchema, {
          method: 'PUT',
          body: { limit },
        }),
      );
      toast({ text: t('ai.form.limit_saved') });
    } catch (err) {
      toast({ text: t(`errors.${codeOf(err)}`) });
    }
  }

  return (
    <form
      className="list settings__limit"
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
    >
      <h2 className="list__title">{t('ai.form.limit_title')}</h2>
      <ul className="list__rows">
        <li className="list__item ai-form__field">
          <Field
            label={t('ai.form.limit')}
            hint={t('ai.form.limit_hint')}
            error={error}
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
            onBlur={() => void commit()}
          />
        </li>
      </ul>
    </form>
  );
}

/** «Allow personal API keys» (ADR-0031 §2): turning it off deletes every saved own key, so it asks first. */
function UserKeysGroup({
  status,
  onSaved,
  onFailed,
}: {
  status: AdminAiStatus;
  /** Only the switch changes: an unsaved draft in the form above is kept. */
  onSaved: (next: AdminAiStatus) => void;
  onFailed: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  async function put(allow: boolean) {
    setConfirm(false);
    try {
      await api(`${AI_STATUS_PATH}/user-keys`, z.unknown(), {
        method: 'PUT',
        body: { allow },
      });
      onSaved({
        ...status,
        allowUserKeys: allow,
        userKeyCount: allow ? status.userKeyCount : 0,
      });
    } catch (err) {
      // 409 user_ai_keys_env_managed: the .env changed under us; the reload shows the lock.
      toast({ text: t(`errors.${codeOf(err)}`) });
      onFailed();
    }
  }

  return (
    <>
      <List
        title={t('ai.form.users_title')}
        footer={t('ai.form.allow_keys_hint')}
      >
        <ListRow
          description={
            status.userKeysLocked ? t('ai.form.allow_keys_env') : undefined
          }
          value={
            <Switch
              checked={status.allowUserKeys}
              onChange={(on) =>
                on || !status.userKeyCount ? void put(on) : setConfirm(true)
              }
              label={t('ai.form.allow_keys')}
              disabled={status.userKeysLocked}
            />
          }
        >
          {t('ai.form.allow_keys')}
        </ListRow>
      </List>
      <ConfirmDialog
        open={confirm}
        title={t('ai.form.keys_off_title')}
        body={
          status.userKeyCount === 1
            ? t('ai.form.keys_off_body_single')
            : t('ai.form.keys_off_body', { count: status.userKeyCount })
        }
        confirmLabel={t('ai.form.keys_off_confirm')}
        onConfirm={() => void put(false)}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
