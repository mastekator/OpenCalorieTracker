import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Lock, Webhook as WebhookIcon } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  MAX_WEBHOOKS,
  webhookEventSchema,
  type Webhook,
  type WebhookEvent,
} from '@oct/shared';
import { ApiError, type ClientErrorCode } from '../../api/client';
import { createWebhook, listWebhooks, updateWebhook } from '../../api/webhooks';
import { useIntegrations } from '../../data/DataContext';
import { useT } from '../../i18n';
import { codeOf } from '../admin/useAdminList';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { Field } from '../../ui/Field/Field';
import {
  IntegrationStatus,
  type IntegrationState,
} from '../../ui/IntegrationStatus/IntegrationStatus';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Sheet } from '../../ui/Sheet/Sheet';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import { WEBHOOKS_PATH } from './IntegrationsScreen';
import { SecretSheet } from './TokensScreen';
import './settings.css';

const EVENTS = webhookEventSchema.options;
/** i18n keys can't hold dots. */
export const EV_KEY = {
  'meal.saved': 'meal_saved',
  'day.closed': 'day_closed',
  'day.empty': 'day_empty',
} as const satisfies Record<WebhookEvent, string>;

/** Hub card: the count, a failing webhook by name, or the admin's ban (OCT-187 §1, 5.6). */
export function useWebhooksCard(): { text: string; state: IntegrationState } {
  const { t, num } = useT();
  const hooks = useIntegrations()?.webhooks;
  const n = hooks?.count ?? 0;
  // A summary cached before the enabled count reads all as on until it is fetched again.
  const on = (hooks?.enabled ?? n) > 0;
  const failing = hooks?.failing ?? null;
  return {
    text: failing
      ? t('integr.webhooks.failing', { name: failing })
      : n > 0
        ? t('integr.webhooks.n_webhooks', { count: n, n: num(n) })
        : t('integr.webhooks.desc'),
    state: hooks?.blocked ? 'blocked' : failing ? 'error' : on ? 'on' : 'off',
  };
}

/** The admin's ban (403 outbound_disabled) reads the same as the banner. */
export function errorText(
  t: ReturnType<typeof useT>['t'],
  code: ClientErrorCode,
) {
  if (code === 'outbound_disabled') return t('integr.webhooks.blocked');
  if (code === 'limit_reached') return t('integr.webhooks.limit');
  return t(`errors.${code}`);
}

export const webhookPath = (id: number) => `${WEBHOOKS_PATH}/${id}`;

/** The address and the state line: on, failing N in a row, off after failures, banned. */
export function WebhookSummary({
  w,
  blocked,
}: {
  w: Webhook;
  blocked: boolean;
}) {
  const { t, num } = useT();
  const [state, note]: [IntegrationState, string?] = blocked
    ? ['blocked']
    : !w.enabled
      ? [
          'off',
          w.disabledReason
            ? t('integr.webhooks.auto_off', { n: num(w.failStreak) })
            : undefined,
        ]
      : w.failStreak > 0
        ? ['error', t('integr.webhooks.fails', { n: num(w.failStreak) })]
        : ['on'];
  return (
    <>
      <span className="webhooks__url">{w.url}</span>
      <span className="settings__status">
        <IntegrationStatus state={state} />
        {note && <span className="webhooks__note">{note}</span>}
      </span>
    </>
  );
}

/** OCT-187 5.1–5.4, 5.6–5.7: the list with states, add and edit, the secret once, «Turn off all». */
export function WebhooksScreen() {
  const { t, num } = useT();
  const toast = useToast();
  const online = useOnline();
  const [, navigate] = useLocation();
  const blocked = useIntegrations()?.webhooks.blocked ?? false;
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [failed, setFailed] = useState<ClientErrorCode | null>(null);
  const [editing, setEditing] = useState<'new' | null>(null);
  // The secret lives only here, never in kv or a cache.
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(
    null,
  );
  const [offAll, setOffAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setFailed(null);
    listWebhooks().then(setHooks, (e) => setFailed(codeOf(e)));
  };
  useEffect(load, []);

  const put = (w: Webhook) =>
    setHooks((list) => list?.map((x) => (x.id === w.id ? w : x)) ?? null);

  async function turnOn(w: Webhook) {
    setBusy(true);
    try {
      put(await updateWebhook(w.id, { enabled: true }));
    } catch (e) {
      toast({ text: errorText(t, codeOf(e)) });
    } finally {
      setBusy(false);
    }
  }

  /** One PATCH each; on a failure the ones already off stay off and the rest keep their state. */
  async function turnOffAll() {
    setOffAll(false);
    setBusy(true);
    try {
      for (const w of hooks?.filter((x) => x.enabled) ?? [])
        put(await updateWebhook(w.id, { enabled: false }));
    } catch (e) {
      toast({ text: errorText(t, codeOf(e)) });
    } finally {
      setBusy(false);
    }
  }

  if (failed)
    return (
      <ScreenState
        icon={<CircleAlert />}
        tone="danger"
        title={t(`errors.${failed}`)}
        action={
          <Button variant="tonal" onClick={load}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  if (!hooks) return null;

  const full = hooks.length >= MAX_WEBHOOKS;
  const addButton = (
    <Button
      disabled={!online || blocked || full}
      onClick={() => setEditing('new')}
    >
      {t('integr.webhooks.add')}
    </Button>
  );
  return (
    <div className="settings">
      {blocked && (
        <Banner icon={<Lock aria-hidden="true" />}>
          {t('integr.webhooks.blocked')}
        </Banner>
      )}
      {hooks.length === 0 ? (
        <ScreenState
          icon={<WebhookIcon />}
          title={t('integr.webhooks.empty_title')}
          action={addButton}
        >
          {t('integr.webhooks.empty_body')}
        </ScreenState>
      ) : (
        <>
          <List
            title={t('integr.tokens.of_max', {
              n: num(hooks.length),
              max: num(MAX_WEBHOOKS),
            })}
            footer={t('integr.webhooks.never_holds')}
          >
            {hooks.map((w) => (
              <ListRow
                key={w.id}
                icon={<WebhookIcon />}
                description={<WebhookSummary w={w} blocked={blocked} />}
                disabled={!online}
                onClick={() => online && navigate(webhookPath(w.id))}
                action={
                  !w.enabled &&
                  !blocked && (
                    <button
                      type="button"
                      className="list-row__action"
                      disabled={!online || busy}
                      aria-label={t('integr.webhooks.turn_on_label', {
                        name: w.name,
                      })}
                      onClick={() => void turnOn(w)}
                    >
                      {t('integr.turn_on')}
                    </button>
                  )
                }
              >
                {w.name}
              </ListRow>
            ))}
          </List>
          <div className="import__actions">{addButton}</div>
          <p className="import__note" aria-live="polite">
            {!online
              ? t('integr.tokens.need_net')
              : full
                ? t('integr.webhooks.limit')
                : null}
          </p>
          {hooks.some((w) => w.enabled) && (
            <List>
              <ListRow
                danger
                chevron={false}
                disabled={!online || busy}
                onClick={() => online && !busy && setOffAll(true)}
              >
                {t('integr.webhooks.off_all')}
              </ListRow>
            </List>
          )}
        </>
      )}
      <EditSheet
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(w) => {
          setEditing(null);
          if ('secret' in w) {
            const { secret: value, ...item } = w;
            setHooks((list) => [...(list ?? []), item]);
            setSecret({ name: item.name, value });
          }
        }}
      />
      <SecretSheet
        secret={secret?.value ?? null}
        title={t('integr.webhooks.created_title', { name: secret?.name ?? '' })}
        ns="webhooks"
        onClose={() => setSecret(null)}
      />
      <ConfirmDialog
        open={offAll}
        title={t('integr.webhooks.off_all_title')}
        body={t('integr.webhooks.off_all_body')}
        confirmLabel={t('integr.webhooks.off_all')}
        onConfirm={() => void turnOffAll()}
        onCancel={() => setOffAll(false)}
      />
    </div>
  );
}

type Errors = Partial<
  Record<'name' | 'url' | 'events' | 'dayClosedAt' | 'emptyBy', string>
>;

/** Which field a 400 points at: http_not_private is the address, validation_failed names its path. */
function fieldErrors(e: unknown, text: string): Errors | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null;
  if (e.code === 'http_not_private') return { url: text };
  if (e.code !== 'validation_failed' || !Array.isArray(e.details)) return null;
  const errors: Errors = {};
  for (const d of e.details as { path?: unknown[] }[]) {
    const key = d.path?.[0];
    if (
      key === 'name' ||
      key === 'url' ||
      key === 'events' ||
      key === 'dayClosedAt' ||
      key === 'emptyBy'
    )
      errors[key] = text;
  }
  return Object.keys(errors).length ? errors : null;
}

/** OCT-187 5.2–5.3: name, address, events with their times; the same sheet edits. */
export function EditSheet({
  target,
  onClose,
  onSaved,
}: {
  target: Webhook | 'new' | null;
  onClose: () => void;
  onSaved: (w: Webhook | Awaited<ReturnType<typeof createWebhook>>) => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [dayClosedAt, setDayClosedAt] = useState('23:59');
  const [emptyBy, setEmptyBy] = useState('20:00');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // A fresh form each time the sheet opens; runs after the sheet focused its title.
  useEffect(() => {
    if (!target) return;
    const w = target === 'new' ? null : target;
    setName(w?.name ?? '');
    setUrl(w?.url ?? '');
    setEvents(w?.events ?? ['meal.saved']);
    setDayClosedAt(w?.dayClosedAt ?? '23:59');
    // A switched-off «nothing logged by» keeps its time (design 5.2).
    setEmptyBy(w?.emptyBy ?? '20:00');
    setErrors({});
    nameRef.current?.focus();
  }, [target]);

  const ready = !!name.trim() && !!url.trim() && events.length > 0;
  async function submit() {
    if (!target || !ready || busy) return;
    setBusy(true);
    setErrors({});
    // Kept in the server's order, so the PATCH doesn't look like a change.
    const body = {
      name: name.trim(),
      url: url.trim(),
      events: EVENTS.filter((e) => events.includes(e)),
      dayClosedAt,
      emptyBy,
    };
    try {
      onSaved(
        target === 'new'
          ? await createWebhook(body)
          : await updateWebhook(target.id, body),
      );
    } catch (e) {
      const code = codeOf(e);
      const fields = fieldErrors(
        e,
        code === 'http_not_private'
          ? t('integr.webhooks.https_only')
          : t('errors.validation_failed'),
      );
      if (fields) setErrors(fields);
      else toast({ text: errorText(t, code) });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (e: WebhookEvent, on: boolean) =>
    setEvents((list) => (on ? [...list, e] : list.filter((x) => x !== e)));
  const times: Partial<
    Record<WebhookEvent, [string, (v: string) => void, keyof Errors]>
  > = {
    'day.closed': [dayClosedAt, setDayClosedAt, 'dayClosedAt'],
    'day.empty': [emptyBy, setEmptyBy, 'emptyBy'],
  };
  const isNew = target === 'new';
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={t(isNew ? 'integr.webhooks.new_title' : 'integr.webhooks.edit')}
      footer={
        <Button loading={busy} disabled={!ready} onClick={() => void submit()}>
          {t(isNew ? 'integr.webhooks.add' : 'integr.webhooks.save')}
        </Button>
      }
    >
      <form
        className="tokens__form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label={t('integr.tokens.name')}
          hint={t('integr.webhooks.name_hint')}
          error={errors.name}
          value={name}
          maxLength={60}
          ref={nameRef}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label={t('integr.webhooks.url')}
          error={errors.url}
          type="url"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="https://"
          value={url}
          maxLength={2000}
          onChange={(e) => {
            setUrl(e.target.value);
            setErrors((x) => ({ ...x, url: undefined }));
          }}
        />
        <List
          title={t('integr.webhooks.events')}
          footer={
            errors.events ??
            errors.dayClosedAt ??
            errors.emptyBy ??
            t('integr.webhooks.tz')
          }
        >
          {EVENTS.map((e) => {
            const on = events.includes(e);
            const time = times[e];
            return (
              <ListRow
                key={e}
                description={t(`integr.webhooks.ev.${EV_KEY[e]}_desc`)}
                value={
                  <span className="webhooks__event">
                    {time && (
                      <input
                        type="time"
                        className="webhooks__time"
                        aria-label={t(
                          e === 'day.closed'
                            ? 'integr.webhooks.ev.day_closed_time'
                            : 'integr.webhooks.ev.day_empty_time',
                        )}
                        aria-invalid={errors[time[2]] ? true : undefined}
                        required
                        value={time[0]}
                        // A cleared field keeps the value.
                        onChange={(ev) =>
                          ev.target.value && time[1](ev.target.value)
                        }
                      />
                    )}
                    <Switch
                      checked={on}
                      onChange={(v) => toggle(e, v)}
                      label={t(`integr.webhooks.ev.${EV_KEY[e]}`)}
                    />
                  </span>
                }
              >
                {t(`integr.webhooks.ev.${EV_KEY[e]}`)}
              </ListRow>
            );
          })}
        </List>
        <p className="import__note">{t('integr.webhooks.data')}</p>
      </form>
    </Sheet>
  );
}
