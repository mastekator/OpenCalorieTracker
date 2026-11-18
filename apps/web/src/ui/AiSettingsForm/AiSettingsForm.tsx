import { useEffect, useId, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  CircleAlert,
  Info,
  Lock,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import {
  AI_PROVIDERS,
  type AdminAiStatus,
  type AiCheckResult,
  type AiModelInfo,
  type AiProviderId,
  type AiProviderState,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { Field } from '../Field/Field';
import { ListRow } from '../List/List';
import '../List/List.css';
import { AI_STATES, Details } from '../ProviderStatus/ProviderStatus';
import { ModelSheet } from '../ModelSheet/ModelSheet';
import { Sheet } from '../Sheet/Sheet';
import './AiSettingsForm.css';

/** What the admin is typing; the key lives only here, never in storage. */
export type AiDraftState = {
  provider: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
};

/** The provider's model list for the draft's connection; error is the reason in words. */
export type ModelsState = {
  list: AiModelInfo[] | null;
  loading: boolean;
  error: string | null;
};

const PROVIDERS = Object.keys(AI_PROVIDERS) as AiProviderId[];
const HINTS: Partial<
  Record<AiProviderId, 'google' | 'openrouter' | 'compatible'>
> = {
  google: 'google',
  openrouter: 'openrouter',
  'openai-compatible': 'compatible',
};

type Props = {
  status: AdminAiStatus;
  draft: AiDraftState;
  onChange: (patch: Partial<AiDraftState>) => void;
  /** The key field instead of «Set · …abcd». */
  keyOpen: boolean;
  onReplaceKey: () => void;
  keyError?: string;
  /** The draft differs from the active settings: «Check» and «Save» instead of «Check now». */
  dirty: boolean;
  busy: 'check' | 'save' | null;
  /** 422 ai_check_failed of the last save: «Not saved» and «Save anyway». */
  failed: AiCheckResult | null;
  /** A draft check that did not pass. */
  checked: AiCheckResult | null;
  /** 409 ai_settings_changed. */
  conflict: boolean;
  onCheck: () => void;
  onSave: () => void;
  onSaveAnyway: () => void;
  onReload: () => void;
  models: ModelsState;
  /** Fetch the list for the draft (sheet opened without one, «Refresh list», key field left). */
  onLoadModels: () => void;
};

const detailsOf = (r: AiCheckResult) =>
  [r.details?.status && `HTTP ${r.details.status}`, r.details?.message]
    .filter(Boolean)
    .join('\n');

/** The «Connection» group and its buttons on «AI provider» (OCT-248 §1, §3). */
export function AiSettingsForm({
  status,
  draft,
  onChange,
  keyOpen,
  onReplaceKey,
  keyError,
  dirty,
  busy,
  failed,
  checked,
  conflict,
  onCheck,
  onSave,
  onSaveAnyway,
  onReload,
  models,
  onLoadModels,
}: Props) {
  const { t } = useT();
  const [sheet, setSheet] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const focusKey = useRef(false);
  const modelErrId = useId();
  // Set by a tap on Check or Save with an empty required field: its error shows until it is filled.
  const [tried, setTried] = useState(false);
  // After the sheet's cleanup returns focus to its opener (OCT-248 1.3).
  useEffect(() => {
    if (!focusKey.current) return;
    focusKey.current = false;
    keyRef.current?.focus();
  });

  const env = status.source === 'env';
  const compatible = draft.provider === 'openai-compatible';
  const providerName = (id: AiProviderId) =>
    AI_PROVIDERS[id].name ?? t('ai.compatible');
  const lock = <Lock className="ai-form__lock" aria-hidden="true" />;
  // From the provider's list; else known only for the active model: the check sends an image (ADR-0013).
  const listed = models.list?.find((m) => m.id === draft.model);
  const vision: AiProviderState | null = listed
    ? listed.vision === null
      ? null
      : listed.vision
        ? 'ok'
        : 'no_vision'
    : draft.provider === status.provider &&
        draft.model === status.model &&
        (status.state === 'ok' || status.state === 'no_vision')
      ? status.state
      : null;
  // The server keeps the saved address when the field is left empty (only its host comes back).
  const savedAddress =
    status.provider === 'openai-compatible' ? status.baseUrlHost : null;
  const addressEmpty = compatible && !draft.baseUrl.trim() && !savedAddress;
  const modelEmpty = !draft.model.trim();

  /** Buttons stay active: a tap with an empty required field says what is missing and goes there. */
  const guarded = (action: () => void) => () => {
    if (!addressEmpty && !modelEmpty) return action();
    setTried(true);
    (addressEmpty ? addressRef : modelRef).current?.focus();
  };

  function pick(provider: AiProviderId) {
    setSheet(false);
    if (provider === draft.provider) return;
    // Another provider needs its own key (AC-1.7).
    onChange({
      provider,
      apiKey: '',
      model: provider === status.provider ? (status.model ?? '') : '',
    });
    focusKey.current = true;
  }

  const keyRow = env ? (
    <ListRow
      description={t(status.keySet ? 'ai.form.key_set' : 'ai.form.key_unset')}
      value={lock}
    >
      {t('ai.form.key')}
    </ListRow>
  ) : keyOpen ? (
    <li className="list__item ai-form__field">
      <Field
        ref={keyRef}
        revealLabels={[t('ai.form.show_key'), t('ai.form.hide_key')]}
        label={t('ai.form.key')}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={t(
          compatible ? 'ai.form.optional' : 'ai.form.key_placeholder',
        )}
        value={draft.apiKey}
        onChange={(event) => onChange({ apiKey: event.target.value })}
        onBlur={() =>
          draft.apiKey.trim() &&
          !models.list &&
          !models.loading &&
          !models.error &&
          onLoadModels()
        }
        error={
          keyError ??
          (status.keyUnreadable && draft.provider === status.provider
            ? t('ai.form.key_unreadable')
            : undefined)
        }
        hint={
          status.provider && draft.provider !== status.provider && !compatible
            ? t('ai.form.new_key', { provider: providerName(draft.provider) })
            : undefined
        }
      />
    </li>
  ) : (
    <ListRow
      description={
        status.keyLast4
          ? t('ai.form.key_last4', { last4: status.keyLast4 })
          : t('ai.form.key_set')
      }
      action={
        <button
          type="button"
          className="list-row__action ai-form__replace"
          onClick={onReplaceKey}
        >
          {t('ai.form.replace')}
        </button>
      }
    >
      {t('ai.form.key')}
    </ListRow>
  );

  return (
    <div className="ai-form">
      <section className="list">
        <h2 className="list__title">{t('ai.form.connection')}</h2>
        <ul className="list__rows">
          <ListRow
            description={providerName(draft.provider)}
            value={env ? lock : undefined}
            onClick={env ? undefined : () => setSheet(true)}
          >
            {t('ai.form.provider')}
          </ListRow>
          {compatible &&
            (env ? (
              <ListRow
                description={
                  <span className="ai-form__mono">{status.baseUrlHost}</span>
                }
                value={lock}
              >
                {t('ai.address')}
              </ListRow>
            ) : (
              <li className="list__item ai-form__field">
                <Field
                  ref={addressRef}
                  label={t('ai.address')}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t(
                    savedAddress
                      ? 'ai.form.address_unchanged'
                      : 'ai.form.address_placeholder',
                  )}
                  hint={
                    savedAddress
                      ? t('ai.form.address_saved', { host: savedAddress })
                      : undefined
                  }
                  error={
                    tried && addressEmpty
                      ? t('ai.form.address_required')
                      : undefined
                  }
                  value={draft.baseUrl}
                  onChange={(event) =>
                    onChange({ baseUrl: event.target.value })
                  }
                />
              </li>
            ))}
          {keyRow}
          {env ? (
            <ListRow
              description={
                <span className="ai-form__mono">{status.model}</span>
              }
              value={lock}
            >
              {t('ai.model')}
            </ListRow>
          ) : (
            <li className="list__item">
              <button
                ref={modelRef}
                type="button"
                className="list-row list-row--interactive"
                aria-describedby={modelEmpty && tried ? modelErrId : undefined}
                onClick={() => {
                  setModelSheet(true);
                  if (!models.list && !models.loading && !models.error)
                    onLoadModels();
                }}
              >
                <span className="list-row__label">
                  {t('ai.model')}
                  {/* Only the model name is monospaced, not the prompts (OCT-276 review). */}
                  <span
                    className={`list-row__description${draft.model ? ' ai-form__mono' : ''}`}
                  >
                    {draft.model ||
                      t(
                        models.loading
                          ? 'ai.models.loading'
                          : 'ai.models.choose',
                      )}
                  </span>
                </span>
                {vision && (
                  <Badge tone={vision === 'ok' ? 'ok' : 'neutral'}>
                    {t(vision === 'ok' ? 'ai.form.photo' : 'ai.form.no_photo')}
                  </Badge>
                )}
                <ChevronRight
                  className="list-row__chevron"
                  aria-hidden="true"
                />
              </button>
            </li>
          )}
        </ul>
        {tried && modelEmpty && !env && (
          <p id={modelErrId} className="ai-form__msg ai-form__msg--error">
            <CircleAlert aria-hidden="true" />
            {t('ai.form.model_required')}
          </p>
        )}
        {vision === 'no_vision' && (
          <p className="ai-form__msg ai-form__msg--warn">
            <TriangleAlert aria-hidden="true" />
            {t('ai.form.no_vision')}
          </p>
        )}
        {status.savedInactive && (
          <p className="ai-form__msg">
            <Info aria-hidden="true" />
            {t('ai.form.inactive')}
          </p>
        )}
      </section>

      {draft.provider === 'google' && (
        <Banner tone="warning" title={t('ai.gemini.title')}>
          {t('ai.gemini.body')}
        </Banner>
      )}

      {conflict && (
        <Banner
          tone="warning"
          actions={
            <Button variant="plain" small onClick={onReload}>
              {t('ai.form.reload')}
            </Button>
          }
        >
          {t('ai.form.changed')}
        </Banner>
      )}
      {checked && AI_STATES[checked.state].banner && (
        <Banner
          tone={AI_STATES[checked.state].banner}
          title={t(`ai.status.${checked.state}`)}
        />
      )}
      {checked && detailsOf(checked) && <Details>{detailsOf(checked)}</Details>}

      {failed ? (
        <>
          <Banner
            tone="danger"
            title={t('ai.form.not_saved', {
              reason: t(`ai.status.${failed.state}`),
            })}
          >
            {t('ai.form.not_saved_body')}
          </Banner>
          {detailsOf(failed) && <Details>{detailsOf(failed)}</Details>}
          <div className="ai-form__stack">
            <Button
              variant="tonal"
              loading={busy === 'save'}
              disabled={busy === 'check'}
              onClick={onSaveAnyway}
            >
              {t(busy === 'save' ? 'ai.form.saving' : 'ai.form.save_anyway')}
            </Button>
            <Button
              variant="plain"
              loading={busy === 'check'}
              disabled={busy === 'save'}
              onClick={onCheck}
            >
              {t(busy === 'check' ? 'ai.checking' : 'ai.form.check')}
            </Button>
          </div>
        </>
      ) : dirty ? (
        <div className="ai-form__row">
          <Button
            variant="tonal"
            loading={busy === 'check'}
            disabled={busy === 'save'}
            onClick={guarded(onCheck)}
          >
            {t(busy === 'check' ? 'ai.checking' : 'ai.form.check')}
          </Button>
          <Button
            loading={busy === 'save'}
            disabled={busy === 'check'}
            onClick={guarded(onSave)}
          >
            {t(busy === 'save' ? 'ai.checking' : 'ai.form.save')}
          </Button>
        </div>
      ) : (
        <div className="ai-form__check">
          <Button variant="tonal" loading={busy === 'check'} onClick={onCheck}>
            {busy !== 'check' && <RefreshCw aria-hidden="true" />}
            {t(busy === 'check' ? 'ai.checking' : 'ai.check')}
          </Button>
          <p className="ai-form__note">{t('ai.check_note')}</p>
        </div>
      )}

      <ModelSheet
        open={modelSheet}
        onClose={() => setModelSheet(false)}
        models={models.list}
        loading={models.loading}
        error={models.error}
        value={draft.model}
        onRefresh={onLoadModels}
        onPick={(model) => {
          setModelSheet(false);
          onChange({ model });
        }}
      />
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={t('ai.form.provider')}
      >
        <ul
          className="list__rows"
          role="radiogroup"
          aria-label={t('ai.form.provider')}
        >
          {PROVIDERS.map((id) => {
            const hint = HINTS[id];
            return (
              <li key={id} className="list__item" role="none">
                <button
                  type="button"
                  role="radio"
                  aria-checked={id === draft.provider}
                  className="list-row list-row--interactive"
                  onClick={() => pick(id)}
                >
                  <span className="list-row__label">
                    {providerName(id)}
                    {hint && (
                      <span className="list-row__description">
                        {t(`ai.form.hint.${hint}`)}
                      </span>
                    )}
                  </span>
                  <span className="ai-form__radio" aria-hidden="true">
                    {id === draft.provider && <Check />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
