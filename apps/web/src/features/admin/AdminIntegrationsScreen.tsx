import { useEffect, useState } from 'react';
import { CircleAlert, Lock } from 'lucide-react';
import {
  adminIntegrationsSchema,
  type AdminIntegrations,
  type AdminIntegrationsRequest,
} from '@oct/shared';
import { api, type ClientErrorCode } from '../../api/client';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { List, ListRow } from '../../ui/List/List';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import { codeOf } from './useAdminList';

export const ADMIN_INTEGRATIONS_API = '/api/admin/integrations';

/** OCT-187 7.1–7.3: server-wide switches for outbound requests and API tokens (ADR-0034 §5, ADR-0027 §6). */
export function AdminIntegrationsScreen() {
  const { t } = useT();
  const toast = useToast();
  const [policy, setPolicy] = useState<AdminIntegrations | null>(null);
  const [failed, setFailed] = useState<ClientErrorCode | null>(null);
  // Which switch asks before turning off.
  const [confirm, setConfirm] = useState<keyof AdminIntegrationsRequest | null>(
    null,
  );

  const load = () => {
    setFailed(null);
    api(ADMIN_INTEGRATIONS_API, adminIntegrationsSchema).then(setPolicy, (e) =>
      setFailed(codeOf(e)),
    );
  };
  useEffect(load, []);

  async function put(body: AdminIntegrationsRequest) {
    setConfirm(null);
    try {
      setPolicy(
        await api(ADMIN_INTEGRATIONS_API, adminIntegrationsSchema, {
          method: 'PUT',
          body,
        }),
      );
    } catch (err) {
      // 409 *_env_managed: the .env changed under us; show what is in force now.
      toast({ text: t(`errors.${codeOf(err)}`) });
      load();
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
  if (!policy) return null;
  return (
    <div className="settings">
      {(policy.outboundFromEnv || policy.tokensFromEnv) && (
        <Banner
          icon={<Lock aria-hidden="true" />}
          title={t('integr.admin.env_title')}
        >
          {policy.outboundFromEnv && (
            <>
              <code>ALLOW_OUTBOUND_REQUESTS={String(policy.outbound)}</code>
              <br />
            </>
          )}
          {policy.tokensFromEnv && (
            <>
              <code>ALLOW_API_TOKENS={String(policy.tokens)}</code>
              <br />
            </>
          )}
          {t('integr.admin.env_body')}
        </Banner>
      )}
      <List footer={t('integr.admin.allowed_hint')}>
        <ListRow
          description={t('integr.admin.outbound_sub')}
          value={
            <Switch
              checked={policy.outbound}
              onChange={(v) =>
                v ? void put({ outbound: true }) : setConfirm('outbound')
              }
              label={t('integr.admin.outbound')}
              disabled={policy.outboundFromEnv}
            />
          }
        >
          {t('integr.admin.outbound')}
        </ListRow>
        <ListRow
          description={t('integr.admin.tokens_sub')}
          value={
            <Switch
              checked={policy.tokens}
              onChange={(v) =>
                v ? void put({ tokens: true }) : setConfirm('tokens')
              }
              label={t('integr.admin.tokens')}
              disabled={policy.tokensFromEnv}
            />
          }
        >
          {t('integr.admin.tokens')}
        </ListRow>
      </List>
      <ConfirmDialog
        open={confirm !== null}
        title={t(
          confirm === 'tokens'
            ? 'integr.admin.tokens_block_title'
            : 'integr.admin.block_title',
        )}
        body={t(
          confirm === 'tokens'
            ? 'integr.admin.tokens_block_body'
            : 'integr.admin.block_body',
        )}
        confirmLabel={t('integr.admin.block_ok')}
        onConfirm={() => confirm && void put({ [confirm]: false })}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
