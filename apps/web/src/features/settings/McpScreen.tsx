import { useState } from 'react';
import { Check, Copy, Lock, Plus } from 'lucide-react';
import { useDb, useIntegrations, useSettings } from '../../data/DataContext';
import { createToken } from '../../api/tokens';
import { patchSettings } from '../../data/outbox';
import { useT } from '../../i18n';
import { codeOf } from '../admin/useAdminList';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { CommandLine } from '../../ui/CommandLine/CommandLine';
import type { IntegrationState } from '../../ui/IntegrationStatus/IntegrationStatus';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Segment } from '../../ui/Segment/Segment';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import './settings.css';

export type McpClient = 'claude' | 'cursor';
const CLIENTS: Record<McpClient, string> = {
  claude: 'Claude Desktop',
  cursor: 'Cursor',
};

/** The assistant's config: Cursor speaks HTTP itself, Claude Desktop goes through mcp-remote (docs/api.md, MCP). */
export function mcpConfig(client: McpClient, url: string, token: string) {
  const auth = `Bearer ${token}`;
  const server =
    client === 'cursor'
      ? { url, headers: { Authorization: auth } }
      : {
          command: 'npx',
          args: ['mcp-remote', url, '--header', `Authorization: ${auth}`],
        };
  return JSON.stringify({ mcpServers: { oct: server } }, null, 2);
}

/** Keys in accent, the placeholder in warning (OCT-187 6.2). */
function Snippet({ text, mark }: { text: string; mark?: string }) {
  const parts = text.split(
    new RegExp(
      `("\\w+"(?=:)${mark ? `|${mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : ''})`,
    ),
  );
  return parts.map((part, i) =>
    i % 2 ? (
      <span key={i} className={part === mark ? 'mcp__mark' : 'mcp__key'}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** The user's switch; the admin's token ban wins over it (ADR-0027 §7). Also the hub card's state. */
export function useMcpState(): IntegrationState {
  const on = !!useSettings()?.mcpEnabled;
  // mcp.blocked is the same token ban; a summary cached before MCP has no mcp field.
  const blocked = useIntegrations()?.tokens.blocked ?? false;
  return blocked ? 'blocked' : on ? 'on' : 'off';
}

/** OCT-187 6.1–6.3: the switch, the address, a read token and the assistant's config. */
export function McpScreen({ publicUrl }: { publicUrl: string | null }) {
  const { t } = useT();
  const db = useDb();
  const toast = useToast();
  const online = useOnline();
  const state = useMcpState();
  const [client, setClient] = useState<McpClient>('claude');
  // The token lives only here, never in kv or a cache: it is gone once the screen is left.
  const [token, setToken] = useState<{ name: string; secret: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Without PUBLIC_URL the server checks Origin against the request's own origin.
  const url = `${(publicUrl ?? location.origin).replace(/\/+$/, '')}/mcp`;
  const placeholder = t('integr.mcp.placeholder');

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const name = CLIENTS[client];
      const created = await createToken({
        name,
        scope: 'read',
        expiresInDays: null,
      });
      setToken({ name, secret: created.token });
    } catch (e) {
      toast({ text: t(`errors.${codeOf(e)}`) });
    } finally {
      setBusy(false);
    }
  }

  const secret = token?.secret;
  const shown = secret
    ? `${secret.slice(0, 8)}…${secret.slice(-3)}`
    : placeholder;
  return (
    <div className="settings">
      {state === 'blocked' && (
        <Banner icon={<Lock aria-hidden="true" />}>
          {t('integr.mcp.blocked')}
        </Banner>
      )}
      <List>
        <ListRow
          description={t(
            state === 'on' ? 'integr.mcp.on' : 'integr.status.off',
          )}
          value={
            <Switch
              checked={state === 'on'}
              onChange={(mcpEnabled) => void patchSettings(db, { mcpEnabled })}
              label={t('integr.mcp.switch')}
              disabled={state === 'blocked'}
            />
          }
        >
          {t('integr.mcp.switch')}
        </ListRow>
      </List>
      <Banner tone="warning">{t('integr.mcp.warn')}</Banner>
      {state === 'on' && (
        <>
          <section className="mcp__group">
            <h2 className="list__title">{t('integr.mcp.address')}</h2>
            <CommandLine command={url} />
          </section>
          <List title={t('integr.mcp.token')}>
            {token ? (
              <ListRow
                chevron={false}
                description={t('integr.mcp.created_sub')}
              >
                {token.name}
              </ListRow>
            ) : (
              <ListRow
                icon={<Plus />}
                chevron={false}
                disabled={!online || busy}
                description={t(
                  online ? 'integr.mcp.create_sub' : 'integr.tokens.need_net',
                )}
                onClick={() => online && void create()}
              >
                {t('integr.mcp.create')}
              </ListRow>
            )}
          </List>
          <section className="mcp__group">
            <h2 className="list__title">{t('integr.mcp.setup')}</h2>
            <Segment
              label={t('integr.mcp.setup')}
              options={(['claude', 'cursor'] as const).map((value) => ({
                value,
                label: CLIENTS[value],
              }))}
              value={client}
              onChange={(value) => {
                setClient(value);
                setCopied(false);
              }}
            />
            <pre className="mcp__code" aria-label={t('integr.mcp.snippet')}>
              <code>
                <Snippet
                  text={mcpConfig(client, url, shown)}
                  mark={secret ? undefined : placeholder}
                />
              </code>
            </pre>
            <div>
              <Button
                variant="tonal"
                onClick={() =>
                  // No clipboard (webview, http): the snippet stays selectable by hand.
                  navigator.clipboard
                    ?.writeText(mcpConfig(client, url, secret ?? placeholder))
                    .then(
                      () => setCopied(true),
                      () => {},
                    )
                }
              >
                {copied ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {t(copied ? 'integr.tokens.copied' : 'integr.mcp.copy')}
              </Button>
            </div>
            <p className="list__footer">{t(`integr.mcp.hint_${client}`)}</p>
          </section>
        </>
      )}
      <p className="settings__lead">{t('integr.mcp.read')}</p>
    </div>
  );
}
