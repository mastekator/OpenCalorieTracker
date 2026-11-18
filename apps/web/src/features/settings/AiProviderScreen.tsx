import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Power, WifiOff } from 'lucide-react';
import {
  adminAiStatusSchema,
  aiCheckResultSchema,
  aiModelsResponseSchema,
  type AdminAiStatus,
  type AiCheckResult,
  type AiProviderId,
} from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import {
  AiSettingsForm,
  type AiDraftState,
  type ModelsState,
} from '../../ui/AiSettingsForm/AiSettingsForm';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ProviderStatus } from '../../ui/ProviderStatus/ProviderStatus';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { useToast } from '../../ui/Toast/Toast';

export const AI_STATUS_PATH = '/api/admin/ai';
const SETTINGS_PATH = `${AI_STATUS_PATH}/settings`;

const codeOf = (err: unknown): ClientErrorCode =>
  err instanceof ApiError ? err.code : 'internal';

const NO_MODELS: ModelsState = { list: null, loading: false, error: null };
// After the key is typed (OCT-248 1.2).
const MODELS_DELAY_MS = 600;
const REASONS = [
  'auth_error',
  'quota_exceeded',
  'unavailable',
  'timeout',
] as const;
type Reason =
  (typeof REASONS)[number] | 'no_list' | 'key' | 'address' | 'failed';

/** Provider, address and key of the draft: what the server needs besides the model. */
const connectionOf = (d: AiDraftState) => ({
  provider: d.provider,
  // Left out: the server keeps the saved address of the same provider.
  baseUrl:
    (d.provider === 'openai-compatible' && d.baseUrl.trim()) || undefined,
  // Left out: the server keeps the saved key of the same provider.
  apiKey: d.apiKey.trim() || undefined,
});

/** Why the list did not come, as the tail of «Couldn't load the model list: …». */
function modelsReason(err: unknown, provider: AiProviderId): Reason {
  const code = codeOf(err);
  const state = (err as ApiError).details as { state?: string } | undefined;
  if (code === 'ai_models_failed' && state?.state) {
    const known = REASONS.find((r) => r === state.state);
    if (known) return known;
    if (state.state === 'model_not_found') return 'no_list';
  }
  if (code === 'ai_key_required') return 'key';
  if (code === 'validation_failed' && provider === 'openai-compatible')
    return 'address';
  return 'failed';
}

const draftOf = (s: AdminAiStatus | null): AiDraftState => ({
  provider: (s?.provider as AiProviderId | null) ?? 'google',
  // Only the host comes back (ADR-0013): an empty field keeps the saved address.
  baseUrl: '',
  apiKey: '',
  model: s?.model ?? '',
});

/** Admin «AI provider» (OCT-25 §5, OCT-248): live status and the settings form, never a stale copy (E-6.2). */
export function AiProviderScreen() {
  const { t } = useT();
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
  const [models, setModels] = useState<ModelsState>(NO_MODELS);
  // Only the answer to the latest request is shown: the draft may change meanwhile.
  const modelsReq = useRef(0);
  const modelsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadModels = useCallback(
    async (d: AiDraftState) => {
      // Leaving the key field during the pause fetches now, not twice.
      clearTimeout(modelsTimer.current);
      const id = ++modelsReq.current;
      setModels({ ...NO_MODELS, loading: true });
      try {
        const { models: list } = await api(
          `${AI_STATUS_PATH}/models`,
          aiModelsResponseSchema,
          { method: 'POST', body: connectionOf(d) },
        );
        if (id === modelsReq.current)
          setModels({ list, loading: false, error: null });
      } catch (err) {
        if (id === modelsReq.current)
          setModels({
            list: null,
            loading: false,
            error: t('ai.models.failed', {
              reason: t(`ai.models.reason.${modelsReason(err, d.provider)}`),
            }),
          });
      }
    },
    [t],
  );
  // A typed key fetches the list once typing pauses; the key itself goes only to the server.
  useEffect(() => {
    if (!draft.apiKey.trim()) return;
    modelsTimer.current = setTimeout(
      () => void loadModels(draft),
      MODELS_DELAY_MS,
    );
    return () => clearTimeout(modelsTimer.current);
    // The model is left out on purpose: picking one must not refetch the list.
  }, [draft.apiKey, draft.baseUrl, draft.provider, loadModels]);

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
  const keyOpen =
    replacing || draft.provider !== status.provider || !status.keySet;
  const body = { ...connectionOf(draft), model: draft.model.trim() };

  function change(patch: Partial<AiDraftState>) {
    setDraft((d) => ({ ...d, ...patch }));
    // Another connection has its own list.
    if ('provider' in patch || 'apiKey' in patch || 'baseUrl' in patch) {
      modelsReq.current++;
      setModels(NO_MODELS);
    }
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
        <AiSettingsForm
          status={status}
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
      </ProviderStatus>
      <ConfirmDialog
        open={confirmOff}
        title={t('ai.form.off_title')}
        body={t('ai.form.off_body')}
        confirmLabel={t('ai.form.off_confirm')}
        onConfirm={() => void turnOff()}
        onCancel={() => setConfirmOff(false)}
      />
    </>
  );
}
