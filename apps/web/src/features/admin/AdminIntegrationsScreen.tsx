import { useEffect, useState } from 'react';
import { CircleAlert, Lock } from 'lucide-react';
import { adminIntegrationsSchema, type AdminIntegrations } from '@oct/shared';
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

/** OCT-187 7.1–7.3: the server-wide switch for outbound requests (ADR-0034 §5). */
export function AdminIntegrationsScreen() {
  const { t } = useT();
  const toast = useToast();
  const [policy, setPolicy] = useState<AdminIntegrations | null>(null);
  const [failed, setFailed] = useState<ClientErrorCode | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = () => {
    setFailed(null);
    api(ADMIN_INTEGRATIONS_API, adminIntegrationsSchema).then(setPolicy, (e) =>
      setFailed(codeOf(e)),
    );
  };
  useEffect(load, []);

  async function put(outbound: boolean) {
    setConfirm(false);
    try {
      setPolicy(
        await api(ADMIN_INTEGRATIONS_API, adminIntegrationsSchema, {
          method: 'PUT',
          body: { outbound },
        }),
      );
    } catch (err) {
      // 409 outbound_env_managed: the .env changed under us; show what is in force now.
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
      {policy.outboundFromEnv && (
        <Banner
          icon={<Lock aria-hidden="true" />}
          title={t('integr.admin.env_title')}
        >
          <code>ALLOW_OUTBOUND_REQUESTS={String(policy.outbound)}</code>
          <br />
          {t('integr.admin.env_body')}
        </Banner>
      )}
      <List footer={t('integr.admin.allowed_hint')}>
        <ListRow
          description={t('integr.admin.outbound_sub')}
          value={
            <Switch
              checked={policy.outbound}
              onChange={(v) => (v ? void put(true) : setConfirm(true))}
              label={t('integr.admin.outbound')}
              disabled={policy.outboundFromEnv}
            />
          }
        >
          {t('integr.admin.outbound')}
        </ListRow>
      </List>
      <ConfirmDialog
        open={confirm}
        title={t('integr.admin.block_title')}
        body={t('integr.admin.block_body')}
        confirmLabel={t('integr.admin.block_ok')}
        onConfirm={() => void put(false)}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
