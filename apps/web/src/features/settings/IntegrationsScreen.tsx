import { useEffect, useState } from 'react';
import {
  Barcode,
  Bot,
  Download,
  KeyRound,
  Lock,
  Upload,
  Webhook,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { listImports, type PastImport } from '../../api/imports';
import { useDb, useOutboundBlocked, useSettings } from '../../data/DataContext';
import { patchSettings } from '../../data/outbox';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import {
  IntegrationStatus,
  type IntegrationState,
} from '../../ui/IntegrationStatus/IntegrationStatus';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Switch } from '../../ui/Switch/Switch';
import { useExportCard } from './ExportScreen';
import { useMcpState } from './McpScreen';
import { useTokensCard } from './TokensScreen';
import { useWebhooksCard } from './WebhooksScreen';
import './settings.css';

export const INTEGRATIONS_PATH = '/settings/integrations';
export const BARCODE_PATH = `${INTEGRATIONS_PATH}/barcode`;
export const IMPORT_PATH = `${INTEGRATIONS_PATH}/import`;
export const EXPORT_PATH = `${INTEGRATIONS_PATH}/export`;
export const TOKENS_PATH = `${INTEGRATIONS_PATH}/tokens`;
export const WEBHOOKS_PATH = `${INTEGRATIONS_PATH}/webhooks`;
export const MCP_PATH = `${INTEGRATIONS_PATH}/mcp`;

/** The admin's ban wins over the user's own switch, which is kept for when it is lifted (E-6). */
function useBarcodeState(): { on: boolean; state: IntegrationState } {
  const settings = useSettings();
  const blocked = useOutboundBlocked();
  const on = !!settings?.offEnabled;
  return { on, state: blocked ? 'blocked' : on ? 'on' : 'off' };
}

/** OCT-187 §1: «Connections» (barcode lookup, tokens, webhooks, MCP) and «Your data». */
export function IntegrationsScreen() {
  const { t, num } = useT();
  const [, navigate] = useLocation();
  const { state } = useBarcodeState();
  const online = useOnline();
  const exportCard = useExportCard();
  const tokensCard = useTokensCard();
  const webhooksCard = useWebhooksCard();
  const mcp = useMcpState();
  const [imports, setImports] = useState<PastImport[]>([]);
  // The count needs the server: offline the card keeps its plain description.
  useEffect(() => {
    if (!online) return;
    let live = true;
    listImports().then(
      (list) => live && setImports(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [online]);
  const count = (n: number) => ({ count: n, n: num(n) });
  const entries = imports.reduce((sum, i) => sum + i.records, 0);
  return (
    <div className="settings">
      <p className="settings__lead">{t('integr.lead')}</p>
      <List title={t('integr.connections')}>
        <ListRow
          icon={<Barcode />}
          description={
            <>
              {t('integr.barcode.desc')}
              <span className="settings__status">
                <IntegrationStatus state={state} />
              </span>
            </>
          }
          onClick={() => navigate(BARCODE_PATH)}
        >
          {t('integr.barcode.title')}
        </ListRow>
        <ListRow
          icon={<KeyRound />}
          description={
            <>
              {tokensCard.text}
              <span className="settings__status">
                <IntegrationStatus state={tokensCard.state} />
              </span>
            </>
          }
          onClick={() => navigate(TOKENS_PATH)}
        >
          {t('integr.tokens.title')}
        </ListRow>
        <ListRow
          icon={<Webhook />}
          description={
            <>
              {webhooksCard.text}
              <span className="settings__status">
                <IntegrationStatus state={webhooksCard.state} />
              </span>
            </>
          }
          onClick={() => navigate(WEBHOOKS_PATH)}
        >
          {t('integr.webhooks.title')}
        </ListRow>
        <ListRow
          icon={<Bot />}
          description={
            <>
              {t('integr.mcp.desc')}
              <span className="settings__status">
                <IntegrationStatus state={mcp} />
                {mcp === 'on' && ` · ${t('integr.mcp.read_only')}`}
              </span>
            </>
          }
          onClick={() => navigate(MCP_PATH)}
        >
          {t('integr.mcp.title')}
        </ListRow>
      </List>
      <List title={t('integr.your_data')}>
        <ListRow
          icon={<Download />}
          description={exportCard}
          onClick={() => navigate(EXPORT_PATH)}
        >
          {t('integr.export.title')}
        </ListRow>
        <ListRow
          icon={<Upload />}
          description={
            imports.length > 0
              ? `${t('integr.import.n_imports', count(imports.length))} · ${t('integr.import.records', count(entries))}`
              : t('integr.import.desc')
          }
          onClick={() => navigate(IMPORT_PATH)}
        >
          {t('integr.import.title')}
        </ListRow>
      </List>
    </div>
  );
}

const KV = ['what', 'where', 'from', 'never'] as const;

/** OCT-313 4.1–4.3: the user's switch, what leaves the server, «Turn off» with a confirm. */
export function BarcodeIntegrationScreen() {
  const { t } = useT();
  const db = useDb();
  const { on, state } = useBarcodeState();
  const [confirm, setConfirm] = useState(false);
  const set = (offEnabled: boolean) => void patchSettings(db, { offEnabled });
  const blocked = state === 'blocked';
  return (
    <div className="settings">
      <IntegrationStatus state={state} />
      {blocked && (
        <Banner icon={<Lock aria-hidden="true" />}>
          {t('integr.barcode.blocked')}
        </Banner>
      )}
      <List>
        <ListRow
          description={t('integr.barcode.sub')}
          value={
            <Switch
              checked={state === 'on'}
              onChange={set}
              label={t('integr.barcode.switch')}
              disabled={blocked}
            />
          }
        >
          {t('integr.barcode.switch')}
        </ListRow>
      </List>
      <List title={t('integr.barcode.out')} footer={t('integr.barcode.note')}>
        {KV.map((k) => (
          <ListRow key={k} description={t(`integr.barcode.kv.${k}_v`)}>
            {t(`integr.barcode.kv.${k}`)}
          </ListRow>
        ))}
      </List>
      {state === 'on' && (
        <List>
          <ListRow danger chevron={false} onClick={() => setConfirm(true)}>
            {t('integr.turn_off')}
          </ListRow>
        </List>
      )}
      <ConfirmDialog
        open={confirm && on}
        title={t('integr.barcode.off_confirm')}
        confirmLabel={t('integr.turn_off')}
        onConfirm={() => {
          set(false);
          setConfirm(false);
        }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
