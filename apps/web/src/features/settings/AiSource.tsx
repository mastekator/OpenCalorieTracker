import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, Info, Trash2 } from 'lucide-react';
import {
  aiStatusSchema,
  ownAiSchema,
  type AiCheckResult,
  type AiConsentsResponse,
  type OwnAi,
} from '@oct/shared';
import { api, type ApiError } from '../../api/client';
import { useRequireOnline } from '../../app/connection';
import { useT } from '../../i18n';
import {
  AiSettingsForm,
  type AiDraftState,
  type AiFormStatus,
} from '../../ui/AiSettingsForm/AiSettingsForm';
import { Banner } from '../../ui/Banner/Banner';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { consentName } from '../../ui/ConsentsList/ConsentsList';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { StatusLine } from '../../ui/ProviderStatus/ProviderStatus';
import { useToast } from '../../ui/Toast/Toast';
import { codeOf, draftBody, draftOf, useModels } from './aiDraft';

export const OWN_AI_PATH = '/api/ai/own';

/** The local copy of GET /api/ai/own, so the screen shows the source offline (OCT-178 1.14). */
const ownKey = (userId: number) => `oct.ownAi.${userId}`;

function readOwn(userId: number): OwnAi | undefined {
  try {
    return ownAiSchema.parse(JSON.parse(localStorage.getItem(ownKey(userId))!));
  } catch {
    return undefined;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** What the shared form reads: the own key in the shape of the admin's status. */
const formStatus = (own: OwnAi | undefined): AiFormStatus => ({
  source: null,
  provider: own?.provider ?? null,
  model: own?.model ?? null,
  state: own?.state ?? 'not_configured',
  keySet: !!own?.keyLast4 && !own.keyUnreadable,
  keyLast4: own?.keyLast4 ?? null,
  keyUnreadable: own?.keyUnreadable ?? false,
  baseUrlHost: own?.baseUrl ? hostOf(own.baseUrl) : null,
  savedInactive: false,
});

type Props = {
  userId: number;
  /** The server's AI from the consents copy; it names the «Through the server» row. */
  server: AiConsentsResponse['server'] | undefined;
  /** The key was saved or deleted: the AI the server uses for this user changed. */
  onChanged: () => void;
};

/** «How AI works» on Settings → AI (OCT-178 §2–4, ADR-0031 §2): the server's AI or the user's own key. */
export function AiSource({ userId, server, onChanged }: Props) {
  const { t } = useT();
  const toast = useToast();
  const online = useOnline();
  const requireOnline = useRequireOnline();
  const [own, setOwn] = useState(() => readOwn(userId));
  const [source, setSource] = useState<'server' | 'own'>(() =>
    readOwn(userId) ? 'own' : 'server',
  );
  // 403 ai_user_keys_disabled: no «Own API key»; `blocked` when it came in answer to an action.
  const [forbidden, setForbidden] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [draft, setDraft] = useState<AiDraftState>(() =>
    draftOf(formStatus(readOwn(userId))),
  );
  const [replacing, setReplacing] = useState(false);
  const [keyError, setKeyError] = useState<string>();
  const [addressError, setAddressError] = useState<string>();
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [failed, setFailed] = useState<AiCheckResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    models,
    load: loadModels,
    reset: resetModels,
  } = useModels(draft, OWN_AI_PATH);

  /** The server's answer replaces the draft and the copy; the typed key is dropped from memory. */
  const show = useCallback(
    (next: OwnAi) => {
      setOwn(next);
      localStorage.setItem(ownKey(userId), JSON.stringify(next));
      setDraft(draftOf(formStatus(next)));
      setReplacing(false);
      setKeyError(undefined);
      setAddressError(undefined);
      setFailed(null);
      if (next) setSource('own');
    },
    [userId],
  );

  const disallow = useCallback(() => {
    setForbidden(true);
    setSource('server');
    show(null);
  }, [show]);

  useEffect(() => {
    if (!online) return;
    let live = true;
    const cached = readOwn(userId);
    void (async () => {
      // First: GET /api/ai/own clears the «keys were turned off» notice on the server.
      const status = await api('/api/ai/status', aiStatusSchema).catch(
        () => null,
      );
      if (live && status) {
        setNotice(status.userKeysDisabledNotice);
        setAdminOnly(status.serverAdminOnly);
      }
      try {
        const next = await api(OWN_AI_PATH, ownAiSchema);
        if (!live) return;
        setForbidden(false);
        show(next);
        // The copy had a key the server no longer has.
        if (!next && cached) setSource('server');
      } catch (err) {
        if (live && codeOf(err) === 'ai_user_keys_disabled') disallow();
      }
    })();
    return () => {
      live = false;
    };
  }, [online, userId, show, disallow]);

  const saved = formStatus(own);
  const dirty =
    !own ||
    draft.provider !== own.provider ||
    draft.model !== own.model ||
    !!draft.apiKey ||
    !!draft.baseUrl;
  // A new address never gets the saved key (OCT-278), so its own key may be needed.
  const keyOpen =
    replacing ||
    draft.provider !== saved.provider ||
    !saved.keySet ||
    !!draft.baseUrl.trim();

  function change(patch: Partial<AiDraftState>) {
    setDraft((d) => ({ ...d, ...patch }));
    if ('provider' in patch || 'apiKey' in patch || 'baseUrl' in patch)
      resetModels();
    setFailed(null);
    setKeyError(undefined);
    setAddressError(undefined);
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
    } else if (code === 'ai_base_url_private')
      setAddressError(t('errors.ai_base_url_private'));
    else if (code === 'ai_user_keys_disabled') {
      disallow();
      setBlocked(true);
    } else toast({ text: t(`errors.${code}`) });
  }

  async function run(kind: 'check' | 'save', action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  const check = () =>
    run('check', async () => {
      const next = await api(`${OWN_AI_PATH}/check`, ownAiSchema, {
        method: 'POST',
      });
      // A failed check only shows in the state line; nothing else changes.
      show(next);
    });

  // The server checks first and saves only a working key (AC-A.2).
  const save = () =>
    run('save', async () => {
      setFailed(null);
      show(
        await api(OWN_AI_PATH, ownAiSchema, {
          method: 'PUT',
          body: draftBody(draft),
        }),
      );
      toast({ text: t('ai_settings.key_saved') });
      onChanged();
    });

  async function remove() {
    setConfirmDelete(false);
    try {
      show(await api(OWN_AI_PATH, ownAiSchema, { method: 'DELETE' }));
    } catch (err) {
      return fail(err);
    }
    setSource('server');
    toast({ text: t('ai_settings.key_deleted') });
    onChanged();
  }

  function pick(next: 'server' | 'own') {
    if (next === source) return;
    // The source is whether a key is saved: back to the server means deleting it.
    if (next === 'server' && own)
      return requireOnline('ai', () => setConfirmDelete(true))();
    setSource(next);
  }

  const options = [
    {
      value: 'server' as const,
      label: t('ai_settings.src_server'),
      sub: server
        ? t('ai_settings.src_server_sub', {
            provider: consentName(server.providerKey),
          })
        : t(
            adminOnly
              ? 'ai_settings.src_server_admin_only'
              : 'ai_settings.src_server_none',
          ),
    },
    ...(forbidden
      ? []
      : [
          {
            value: 'own' as const,
            label: t('ai_settings.src_key'),
            sub: t('ai_settings.src_key_sub'),
          },
        ]),
  ];

  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  // Arrows move the choice like a native radio group (roving tabindex).
  function onArrow(e: KeyboardEvent) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
      e.key
    ];
    if (!step) return;
    e.preventDefault();
    const at = options.findIndex((o) => o.value === source);
    const i = (at + step + options.length) % options.length;
    const next = options[i]!.value;
    // Leaving a saved key asks first; on cancel the focus stays on «Own API key».
    const asks = next === 'server' && !!own;
    pick(next);
    if (!asks) radios.current[i]?.focus();
  }

  return (
    <>
      {notice && (
        <Banner
          icon={<Info aria-hidden="true" />}
          title={t('ai_settings.keys_off')}
        >
          {t('ai_settings.keys_off_body')}
        </Banner>
      )}
      {blocked && !notice && (
        <Banner tone="warning" title={t('errors.ai_user_keys_disabled')}>
          {t('ai_settings.keys_off_body')}
        </Banner>
      )}
      <section className="list">
        <h2 className="list__title" id="ai-source">
          {t('ai_settings.how')}
        </h2>
        <ul
          className="list__rows"
          role="radiogroup"
          aria-labelledby="ai-source"
          onKeyDown={onArrow}
        >
          {options.map((o, i) => (
            <li key={o.value} className="list__item" role="none">
              <button
                type="button"
                role="radio"
                aria-checked={source === o.value}
                tabIndex={source === o.value ? 0 : -1}
                ref={(el) => {
                  radios.current[i] = el;
                }}
                className="list-row list-row--interactive"
                onClick={() => pick(o.value)}
              >
                <span className="list-row__label">
                  {o.label}
                  {o.sub && (
                    <span className="list-row__description">{o.sub}</span>
                  )}
                  {o.value === 'own' && own && (
                    <span className="list-row__description">
                      <StatusLine state={own.state} />
                    </span>
                  )}
                </span>
                <span className="ai-form__radio" aria-hidden="true">
                  {source === o.value && <Check />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {source === 'own' && !forbidden && (
        <>
          <AiSettingsForm
            status={saved}
            title={t('ai_settings.key_group')}
            draft={draft}
            onChange={change}
            keyOpen={keyOpen}
            onReplaceKey={() => setReplacing(true)}
            keyError={keyError}
            addressError={addressError}
            dirty={dirty}
            busy={busy}
            failed={failed}
            checked={null}
            conflict={false}
            onCheck={requireOnline('ai', () => void check())}
            onSave={requireOnline('ai', () => void save())}
            onReload={() => {}}
            models={models}
            onLoadModels={requireOnline('ai', () => void loadModels(draft))}
          />
          <p className="ai-form__note">{t('ai_settings.key_where')}</p>
          {own && (
            <List>
              <ListRow
                icon={<Trash2 />}
                danger
                chevron={false}
                onClick={requireOnline('ai', () => setConfirmDelete(true))}
              >
                {t('ai_settings.key_delete')}
              </ListRow>
            </List>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t('ai_settings.key_delete_q')}
        body={t('ai_settings.key_delete_body')}
        confirmLabel={t('ai_settings.key_delete_confirm')}
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
