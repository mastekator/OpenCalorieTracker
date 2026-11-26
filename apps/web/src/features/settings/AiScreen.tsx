import { useEffect, useRef, useState } from 'react';
import { Power, WifiOff } from 'lucide-react';
import { z } from 'zod';
import type { AiConsentsResponse, MeResponse } from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useRequireOnline } from '../../app/connection';
import {
  readConsents,
  refreshConsents,
  removeConsent,
} from '../../data/aiConsents';
import { useDeviceAi } from '../../data/deviceAi';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { ConsentsList, consentName } from '../../ui/ConsentsList/ConsentsList';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import './settings.css';

export const AI_SETTINGS_PATH = '/settings/ai';

/**
 * Settings → AI (OCT-178 §1, §5.1): the device switch and the consents. The copy on this
 * device shows at once and offline; online the server's list replaces it.
 */
export function AiScreen({ user }: { user: MeResponse }) {
  const { t } = useT();
  const toast = useToast();
  const online = useOnline();
  const requireOnline = useRequireOnline();
  const [deviceAi, setDeviceAi] = useDeviceAi(user.id);
  const [data, setData] = useState<AiConsentsResponse | null>(() =>
    readConsents(user.id),
  );
  const [revoke, setRevoke] = useState<string | null>(null);
  const consentsCol = useRef<HTMLDivElement>(null);
  // Index of the revoked row: its button is gone, so focus moves on instead of falling to body.
  const focusAt = useRef<number | null>(null);

  useEffect(() => {
    const i = focusAt.current;
    const col = consentsCol.current;
    if (i === null || !col) return;
    focusAt.current = null;
    const buttons = col.querySelectorAll<HTMLButtonElement>('button');
    const title = col.querySelector<HTMLElement>('h2');
    const next = buttons[i] ?? buttons[i - 1] ?? title;
    if (next === title && title) title.tabIndex = -1;
    next?.focus();
  }, [data]);

  useEffect(() => {
    if (!online) return;
    let live = true;
    refreshConsents(user.id)
      .then((value) => live && setData(value))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [online, user.id]);

  async function confirmRevoke(providerKey: string) {
    setRevoke(null);
    try {
      await api(
        `/api/ai/consents/${encodeURIComponent(providerKey)}`,
        z.undefined(),
        { method: 'DELETE' },
      );
    } catch (err) {
      toast({
        text: t(`errors.${err instanceof ApiError ? err.code : 'internal'}`),
      });
      return;
    }
    removeConsent(user.id, providerKey);
    focusAt.current =
      data?.consents.findIndex((c) => c.providerKey === providerKey) ?? null;
    setData(
      (d) =>
        d && {
          ...d,
          consents: d.consents.filter((c) => c.providerKey !== providerKey),
        },
    );
    toast({ text: t('ai_settings.revoked') });
  }

  return (
    <div className="settings settings--columns">
      {!online && (
        <div className="settings__offline">
          <Banner
            icon={<WifiOff aria-hidden="true" />}
            title={t('offline.no_network')}
          >
            {t('ai_settings.offline_body')}
          </Banner>
        </div>
      )}
      <div className="settings__col">
        <List
          title={t('ai_settings.device')}
          footer={t('ai_settings.device_note')}
        >
          <ListRow
            value={
              <Switch
                checked={deviceAi}
                onChange={setDeviceAi}
                label={t('ai_settings.device_switch')}
              />
            }
          >
            {t('ai_settings.device_switch')}
          </ListRow>
        </List>
        {!deviceAi && (
          <Banner
            icon={<Power aria-hidden="true" />}
            title={t('ai_settings.device_off')}
          >
            {t('ai_settings.device_off_body')}
          </Banner>
        )}
      </div>
      <div className="settings__col" ref={consentsCol}>
        {data && (
          <ConsentsList
            {...data}
            onRevoke={(key) => requireOnline('ai', () => setRevoke(key))()}
          />
        )}
      </div>
      <ConfirmDialog
        open={revoke !== null}
        title={t('ai_settings.revoke_q', {
          provider: revoke ? consentName(revoke) : '',
        })}
        body={t('ai_settings.revoke_body')}
        confirmLabel={t('ai_settings.revoke')}
        tone="danger"
        onConfirm={() => revoke && void confirmRevoke(revoke)}
        onCancel={() => setRevoke(null)}
      />
    </div>
  );
}
