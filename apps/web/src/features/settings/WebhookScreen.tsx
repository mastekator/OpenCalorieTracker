import { useEffect, useState } from 'react';
import { CircleAlert, Lock, Send, Webhook as WebhookIcon } from 'lucide-react';
import { useLocation } from 'wouter';
import type { Webhook, WebhookDelivery } from '@oct/shared';
import type { ClientErrorCode } from '../../api/client';
import {
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  rotateWebhookSecret,
  testWebhook,
  updateWebhook,
} from '../../api/webhooks';
import { useIntegrations } from '../../data/DataContext';
import { useT } from '../../i18n';
import { codeOf } from '../admin/useAdminList';
import { Badge } from '../../ui/Badge/Badge';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { useToast } from '../../ui/Toast/Toast';
import { WEBHOOKS_PATH } from './IntegrationsScreen';
import { SecretSheet } from './TokensScreen';
import { EditSheet, errorText, EV_KEY, WebhookSummary } from './WebhooksScreen';
import './settings.css';

const ERRORS = ['timeout', 'refused', 'blocked_address', 'dns', 'network'];

/** «200», «503 ×3», «no reply in 10 s»: the response, or why there was none. */
function useOutcome() {
  const { t, num } = useT();
  return (d: WebhookDelivery) => {
    const ok = d.error === null && d.status !== null && d.status < 300;
    const text = d.error
      ? ERRORS.includes(d.error)
        ? t(`integr.webhooks.err.${d.error as 'timeout'}`)
        : d.error
      : d.attempts > 1
        ? t('integr.webhooks.retries', {
            status: String(d.status),
            n: num(d.attempts),
          })
        : String(d.status);
    return { ok, text };
  };
}

/** OCT-187 5.5: state, test, edit, the secret rotated once, the last 20 deliveries, delete. */
export function WebhookScreen({ id }: { id: string }) {
  const { t, num, locale } = useT();
  const toast = useToast();
  const online = useOnline();
  const [, navigate] = useLocation();
  const outcome = useOutcome();
  const blocked = useIntegrations()?.webhooks.blocked ?? false;
  const [hook, setHook] = useState<Webhook | null>(null);
  const [log, setLog] = useState<WebhookDelivery[] | null>(null);
  const [failed, setFailed] = useState<ClientErrorCode | null>(null);
  const [tested, setTested] = useState<WebhookDelivery | null>(null);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<'rotate' | 'delete' | null>(null);
  // The secret lives only here, never in kv or a cache.
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<'test' | 'on' | 'rotate' | 'delete' | null>(
    null,
  );

  const load = () => {
    setFailed(null);
    // No GET /webhooks/:id: the list holds at most 10.
    Promise.all([listWebhooks(), listDeliveries(Number(id))]).then(
      ([list, rows]) => {
        const w = list.find((x) => x.id === Number(id));
        if (!w) return setFailed('not_found');
        setHook(w);
        setLog(rows);
      },
      (e) => setFailed(codeOf(e)),
    );
  };
  useEffect(load, [id]);

  async function run<T>(kind: NonNullable<typeof busy>, f: () => Promise<T>) {
    setBusy(kind);
    try {
      return await f();
    } catch (e) {
      toast({ text: errorText(t, codeOf(e)) });
    } finally {
      setBusy(null);
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
  if (!hook || !log) return null;

  const test = () =>
    run('test', async () => {
      const d = await testWebhook(hook.id);
      setTested(d);
      setLog((rows) => [d, ...(rows ?? [])].slice(0, 20));
    });
  const turnOn = () =>
    run('on', async () =>
      setHook(await updateWebhook(hook.id, { enabled: true })),
    );
  const rotate = () => {
    setAsking(null);
    return run('rotate', async () => {
      const { secret: value, ...w } = await rotateWebhookSecret(hook.id);
      setHook(w);
      setSecret(value);
    });
  };
  const remove = () => {
    setAsking(null);
    return run('delete', async () => {
      await deleteWebhook(hook.id);
      navigate(WEBHOOKS_PATH, { replace: true });
    });
  };
  const result = tested && outcome(tested);
  const when = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const off = !online || busy !== null;

  return (
    <div className="settings">
      {blocked && (
        <Banner icon={<Lock aria-hidden="true" />}>
          {t('integr.webhooks.blocked')}
        </Banner>
      )}
      <List>
        <ListRow
          icon={<WebhookIcon />}
          description={<WebhookSummary w={hook} blocked={blocked} />}
        >
          {hook.name}
        </ListRow>
      </List>
      <div className="webhook__actions">
        <Button
          variant="tonal"
          loading={busy === 'test'}
          disabled={off || blocked}
          onClick={() => void test()}
        >
          <Send aria-hidden="true" />
          {t('integr.webhooks.send_test')}
        </Button>
        {!hook.enabled && !blocked ? (
          <Button
            loading={busy === 'on'}
            disabled={off}
            onClick={() => void turnOn()}
          >
            {t('integr.turn_on')}
          </Button>
        ) : (
          <Button
            variant="plain"
            disabled={!online}
            onClick={() => setEditing(true)}
          >
            {t('integr.webhooks.edit_short')}
          </Button>
        )}
      </div>
      <p className="import__note" aria-live="polite">
        {result && (
          <Badge tone={result.ok ? 'ok' : 'err'}>
            {result.ok
              ? t('integr.webhooks.test_ok', {
                  status: result.text,
                  ms: num(tested.durationMs ?? 0),
                })
              : t('integr.webhooks.test_failed', { reason: result.text })}
          </Badge>
        )}
      </p>
      <List title={t('integr.webhooks.signature')}>
        <ListRow
          description={t('integr.webhooks.secret_set')}
          action={
            <button
              type="button"
              className="list-row__action"
              disabled={off}
              aria-label={t('integr.webhooks.rotate_label')}
              onClick={() => setAsking('rotate')}
            >
              {t('integr.webhooks.rotate')}
            </button>
          }
        >
          {t('integr.webhooks.secret')}
        </ListRow>
      </List>
      <List
        title={`${t('integr.webhooks.log')} · ${t('integr.webhooks.log_last')}`}
        footer={log.length === 0 ? t('integr.webhooks.log_empty') : undefined}
      >
        {log.map((d) => {
          const o = outcome(d);
          return (
            <ListRow
              key={d.id}
              description={when.format(new Date(d.at))}
              value={<Badge tone={o.ok ? 'ok' : 'err'}>{o.text}</Badge>}
            >
              {t(
                `integr.webhooks.ev.${d.event === 'test' ? 'test' : EV_KEY[d.event]}`,
              )}
            </ListRow>
          );
        })}
      </List>
      <List>
        <ListRow
          danger
          chevron={false}
          disabled={off}
          onClick={() => !off && setAsking('delete')}
        >
          {t('integr.webhooks.delete')}
        </ListRow>
      </List>
      <EditSheet
        target={editing ? hook : null}
        onClose={() => setEditing(false)}
        onSaved={(w) => {
          setEditing(false);
          setHook(w);
        }}
      />
      <SecretSheet
        secret={secret}
        title={t('integr.webhooks.rotated_title', { name: hook.name })}
        ns="webhooks"
        onClose={() => setSecret(null)}
      />
      <ConfirmDialog
        open={asking === 'rotate'}
        title={t('integr.webhooks.rotate_title')}
        body={t('integr.webhooks.rotate_body')}
        confirmLabel={t('integr.webhooks.rotate')}
        onConfirm={() => void rotate()}
        onCancel={() => setAsking(null)}
      />
      <ConfirmDialog
        open={asking === 'delete'}
        title={t('integr.webhooks.delete_title', { name: hook.name })}
        body={t('integr.webhooks.delete_body')}
        confirmLabel={t('integr.webhooks.delete_ok')}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(null)}
      />
    </div>
  );
}
