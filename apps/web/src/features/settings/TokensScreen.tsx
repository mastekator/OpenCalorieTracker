import { useEffect, useState } from 'react';
import { CircleAlert, KeyRound, Lock } from 'lucide-react';
import { MAX_API_TOKENS, type ApiToken, type ApiTokenScope } from '@oct/shared';
import type { ClientErrorCode } from '../../api/client';
import {
  createToken,
  deleteAllTokens,
  deleteToken,
  listTokens,
} from '../../api/tokens';
import { useIntegrations } from '../../data/DataContext';
import { useT } from '../../i18n';
import { codeOf } from '../admin/useAdminList';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { CommandLine } from '../../ui/CommandLine/CommandLine';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { Field } from '../../ui/Field/Field';
import { FormRow } from '../../ui/FormList/FormList';
import type { IntegrationState } from '../../ui/IntegrationStatus/IntegrationStatus';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Segment } from '../../ui/Segment/Segment';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { shortDate } from './ExportScreen';
import './settings.css';

export const API_DOCS_URL =
  'https://github.com/mastekator/OpenCalorieTracker/blob/main/docs/api.md';

const DAY = 24 * 60 * 60 * 1000;
/** Expiring within this many days is shown in warning colour (OCT-187 4.4). */
const SOON_DAYS = 7;
const EXPIRY = ['never', '30', '90', '365'] as const;
type Expiry = (typeof EXPIRY)[number];

/** Hub card: the count and on / off / blocked (OCT-187 §1). */
export function useTokensCard(): { text: string; state: IntegrationState } {
  const { t, num } = useT();
  const tokens = useIntegrations()?.tokens;
  const n = tokens?.count ?? 0;
  return {
    text:
      n > 0
        ? t('integr.tokens.n_tokens', { count: n, n: num(n) })
        : t('integr.tokens.desc'),
    state: tokens?.blocked ? 'blocked' : n > 0 ? 'on' : 'off',
  };
}

/** OCT-187 4.1–4.5: personal API tokens, the token shown once, revoke one or all (ADR-0027). */
export function TokensScreen() {
  const { t, num, locale } = useT();
  const toast = useToast();
  const online = useOnline();
  const blocked = useIntegrations()?.tokens.blocked ?? false;
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [failed, setFailed] = useState<ClientErrorCode | null>(null);
  const [creating, setCreating] = useState(false);
  // The token itself lives only here, never in kv or a cache (AC-5.1).
  const [secret, setSecret] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<ApiToken | 'all' | null>(null);

  const load = () => {
    setFailed(null);
    listTokens().then(setTokens, (e) => setFailed(codeOf(e)));
  };
  useEffect(load, []);

  async function confirmRevoke() {
    const target = revoke;
    setRevoke(null);
    try {
      if (target === 'all') {
        await deleteAllTokens();
        setTokens([]);
      } else if (target) {
        await deleteToken(target.id);
        setTokens((list) => list?.filter((x) => x.id !== target.id) ?? null);
      }
    } catch (e) {
      toast({ text: t(`errors.${codeOf(e)}`) });
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
  if (!tokens) return null;

  const full = tokens.length >= MAX_API_TOKENS;
  const canCreate = online && !blocked && !full;
  const createButton = (
    <Button disabled={!canCreate} onClick={() => setCreating(true)}>
      {t('integr.tokens.create')}
    </Button>
  );
  const docs = (
    <a
      className="tokens__docs"
      href={API_DOCS_URL}
      target="_blank"
      rel="noreferrer"
    >
      {t('integr.tokens.docs')}
    </a>
  );
  const now = Date.now();
  const describe = (x: ApiToken) => {
    const ends = x.expiresAt ? Date.parse(x.expiresAt) : null;
    const expiry =
      ends === null ? (
        t('integr.tokens.no_expiry')
      ) : ends <= now ? (
        t('integr.tokens.expired')
      ) : (
        <span
          className={ends - now < SOON_DAYS * DAY ? 'tokens__soon' : undefined}
        >
          {t('integr.tokens.expires', {
            date: shortDate(x.expiresAt!, locale),
          })}
        </span>
      );
    return (
      <>
        {t(`integr.tokens.scope_${x.scope}`)} ·{' '}
        {t('integr.tokens.created', { date: shortDate(x.createdAt, locale) })} ·{' '}
        {expiry} ·{' '}
        {x.lastUsedAt
          ? t('integr.tokens.last_used', {
              date: shortDate(x.lastUsedAt, locale),
            })
          : t('integr.tokens.never_used')}
      </>
    );
  };

  return (
    <div className="settings">
      {blocked && (
        <Banner icon={<Lock aria-hidden="true" />}>
          {t('integr.tokens.blocked')}
        </Banner>
      )}
      {tokens.length === 0 ? (
        <ScreenState
          icon={<KeyRound />}
          title={t('integr.tokens.empty_title')}
          action={createButton}
          details={docs}
        >
          {t('integr.tokens.empty_body')}
        </ScreenState>
      ) : (
        <>
          <p className="settings__lead">
            {t('integr.tokens.lead')} {docs}
          </p>
          <List
            title={t('integr.tokens.of_max', {
              n: num(tokens.length),
              max: num(MAX_API_TOKENS),
            })}
          >
            {tokens.map((x) => {
              const expired = !!x.expiresAt && Date.parse(x.expiresAt) <= now;
              return (
                <ListRow
                  key={x.id}
                  chevron={false}
                  description={describe(x)}
                  value={
                    <Button
                      small
                      variant="danger-plain"
                      disabled={!online}
                      onClick={() => setRevoke(x)}
                    >
                      {t(
                        expired
                          ? 'integr.tokens.delete'
                          : 'integr.tokens.revoke',
                      )}
                    </Button>
                  }
                >
                  <span className={expired ? 'tokens__expired' : undefined}>
                    {x.name}
                  </span>
                </ListRow>
              );
            })}
          </List>
          <div className="import__actions">{createButton}</div>
          <p className="import__note" aria-live="polite">
            {!online
              ? t('integr.tokens.need_net')
              : full
                ? t('errors.limit_reached')
                : null}
          </p>
          <List>
            <ListRow
              danger
              chevron={false}
              disabled={!online}
              onClick={() => online && setRevoke('all')}
            >
              {t('integr.tokens.revoke_all')}
            </ListRow>
          </List>
        </>
      )}
      <CreateSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={({ token, ...item }) => {
          setTokens((list) => [item, ...(list ?? [])]);
          setCreating(false);
          setSecret(token);
        }}
      />
      <SecretSheet secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={revoke !== null}
        title={
          revoke === 'all'
            ? t('integr.tokens.revoke_all_title')
            : t('integr.tokens.revoke_title', {
                name: revoke?.name ?? '',
              })
        }
        body={
          revoke === 'all'
            ? t('integr.tokens.revoke_all_body')
            : t('integr.tokens.revoke_body')
        }
        confirmLabel={t(
          revoke === 'all'
            ? 'integr.tokens.revoke_all'
            : 'integr.tokens.revoke',
        )}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevoke(null)}
      />
    </div>
  );
}

/** OCT-187 4.2: name, scope and lifetime; 90 days by default. */
function CreateSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: Awaited<ReturnType<typeof createToken>>) => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('read');
  const [expiry, setExpiry] = useState<Expiry>('90');
  const [busy, setBusy] = useState(false);
  // A fresh form each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setName('');
    setScope('read');
    setExpiry('90');
  }, [open]);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      onCreated(
        await createToken({
          name: name.trim(),
          scope,
          expiresInDays:
            expiry === 'never' ? null : (Number(expiry) as 30 | 90 | 365),
        }),
      );
    } catch (e) {
      toast({ text: t(`errors.${codeOf(e)}`) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('integr.tokens.new_title')}
      footer={
        <Button
          loading={busy}
          disabled={!name.trim()}
          onClick={() => void submit()}
        >
          {t('integr.tokens.create')}
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
          hint={t('integr.tokens.name_hint')}
          value={name}
          maxLength={60}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <List>
          <FormRow label={t('integr.tokens.scope')} stacked>
            <Segment
              label={t('integr.tokens.scope')}
              options={[
                { value: 'read', label: t('integr.tokens.scope_read') },
                { value: 'write', label: t('integr.tokens.scope_write') },
              ]}
              value={scope}
              onChange={setScope}
            />
          </FormRow>
          <FormRow label={t('integr.tokens.expiry')} stacked>
            <Segment
              label={t('integr.tokens.expiry')}
              options={EXPIRY.map((value) => ({
                value,
                label: t(`integr.tokens.expiry_${value}`),
              }))}
              value={expiry}
              onChange={setExpiry}
            />
          </FormRow>
        </List>
      </form>
    </Sheet>
  );
}

/** OCT-187 4.3: the token once; «Done» before copying asks first. */
function SecretSheet({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  useEffect(() => setCopied(false), [secret]);
  const done = () => (copied ? onClose() : setAsking(true));
  return (
    <>
      <Sheet
        open={secret !== null}
        onClose={done}
        title={t('integr.tokens.created_title')}
        footer={
          <Button variant="tonal" onClick={done}>
            {t('common.done')}
          </Button>
        }
      >
        <div className="tokens__secret">
          <p>{t('integr.tokens.created_body')}</p>
          {secret && (
            <CommandLine command={secret} onCopy={() => setCopied(true)} />
          )}
        </div>
      </Sheet>
      <ConfirmDialog
        open={asking}
        title={t('integr.tokens.uncopied_title')}
        body={t('integr.tokens.uncopied_body')}
        confirmLabel={t('integr.tokens.uncopied_ok')}
        onConfirm={() => {
          setAsking(false);
          onClose();
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
