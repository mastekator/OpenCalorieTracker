import { useEffect, useRef, useState } from 'react';
import { Check, Info, Lock, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  AI_PROVIDERS,
  type AdminAiStatus,
  type AiCheckResult,
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
import { Sheet } from '../Sheet/Sheet';
import './AiSettingsForm.css';

/** What the admin is typing; the key lives only here, never in storage. */
export type AiDraftState = {
  provider: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
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
}: Props) {
  const { t } = useT();
  const [sheet, setSheet] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);
  const focusKey = useRef(false);
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
  // Known only for the active model: the check sends an image (ADR-0013).
  const vision: AiProviderState | null =
    draft.provider === status.provider &&
    draft.model === status.model &&
    (status.state === 'ok' || status.state === 'no_vision')
      ? status.state
      : null;
  const ready = !!draft.model.trim() && (!compatible || !!draft.baseUrl.trim());

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
        label={t('ai.form.key')}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={t(
          compatible ? 'ai.form.optional' : 'ai.form.key_placeholder',
        )}
        value={draft.apiKey}
        onChange={(event) => onChange({ apiKey: event.target.value })}
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
                  label={t('ai.address')}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    status.baseUrlHost
                      ? `http://${status.baseUrlHost}/v1`
                      : t('ai.form.address_placeholder')
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
            // shortcut: a plain name field; the provider's list comes with OCT-276.
            <li className="list__item ai-form__field ai-form__model">
              <Field
                label={t('ai.model')}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                hint={t('ai.form.model_hint')}
                value={draft.model}
                onChange={(event) => onChange({ model: event.target.value })}
              />
              {vision && (
                <Badge tone={vision === 'ok' ? 'ok' : 'neutral'}>
                  {t(vision === 'ok' ? 'ai.form.photo' : 'ai.form.no_photo')}
                </Badge>
              )}
            </li>
          )}
        </ul>
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
              {t(busy === 'save' ? 'ai.checking' : 'ai.form.save_anyway')}
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
            disabled={!ready || busy === 'save'}
            onClick={onCheck}
          >
            {t(busy === 'check' ? 'ai.checking' : 'ai.form.check')}
          </Button>
          <Button
            loading={busy === 'save'}
            disabled={!ready || busy === 'check'}
            onClick={onSave}
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
