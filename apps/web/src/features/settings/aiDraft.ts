import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiModelsResponseSchema,
  type AdminAiStatus,
  type AiProviderId,
} from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import type {
  AiDraftState,
  ModelsState,
} from '../../ui/AiSettingsForm/AiSettingsForm';

export const AI_STATUS_PATH = '/api/admin/ai';

export const codeOf = (err: unknown): ClientErrorCode =>
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
export const connectionOf = (d: AiDraftState) => ({
  provider: d.provider,
  // Left out: the server keeps the saved address of the same provider.
  baseUrl:
    (d.provider === 'openai-compatible' && d.baseUrl.trim()) || undefined,
  // Left out: the server keeps the saved key of the same provider.
  apiKey: d.apiKey.trim() || undefined,
});

export const draftOf = (
  s: Pick<AdminAiStatus, 'provider' | 'model'> | null,
): AiDraftState => ({
  provider: (s?.provider as AiProviderId | null) ?? 'google',
  // Only the host comes back (ADR-0013): an empty field keeps the saved address.
  baseUrl: '',
  apiKey: '',
  model: s?.model ?? '',
});

/** The draft as a check, a save and a model test send it. */
export const draftBody = (d: AiDraftState) => ({
  ...connectionOf(d),
  model: d.model.trim(),
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

/** The provider's model list for a draft (path: the admin's or the user's own key routes); a typed key fetches it once typing pauses. */
export function useModels(draft: AiDraftState, path = AI_STATUS_PATH) {
  const { t } = useT();
  const [models, setModels] = useState<ModelsState>(NO_MODELS);
  // Only the answer to the latest request is shown: the draft may change meanwhile.
  const req = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(
    async (d: AiDraftState) => {
      // Leaving the key field during the pause fetches now, not twice.
      clearTimeout(timer.current);
      const id = ++req.current;
      setModels({ ...NO_MODELS, loading: true });
      try {
        const { models: list } = await api(
          `${path}/models`,
          aiModelsResponseSchema,
          { method: 'POST', body: connectionOf(d) },
        );
        if (id === req.current)
          setModels({ list, loading: false, error: null });
      } catch (err) {
        if (id === req.current)
          setModels({
            list: null,
            loading: false,
            error: t('ai.models.failed', {
              reason: t(`ai.models.reason.${modelsReason(err, d.provider)}`),
            }),
          });
      }
    },
    [t, path],
  );
  // The key itself goes only to the server.
  useEffect(() => {
    if (!draft.apiKey.trim()) return;
    timer.current = setTimeout(() => void load(draft), MODELS_DELAY_MS);
    return () => clearTimeout(timer.current);
    // The model is left out on purpose: picking one must not refetch the list.
  }, [draft.apiKey, draft.baseUrl, draft.provider, load]);

  /** Another connection has its own list. */
  const reset = useCallback(() => {
    req.current++;
    setModels(NO_MODELS);
  }, []);

  return { models, load, reset };
}
