import { useState } from 'react';
import { Barcode, Lock, Upload } from 'lucide-react';
import { useLocation } from 'wouter';
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
import { Switch } from '../../ui/Switch/Switch';
import './settings.css';

export const INTEGRATIONS_PATH = '/settings/integrations';
export const BARCODE_PATH = `${INTEGRATIONS_PATH}/barcode`;
export const IMPORT_PATH = `${INTEGRATIONS_PATH}/import`;

/** The admin's ban wins over the user's own switch, which is kept for when it is lifted (E-6). */
function useBarcodeState(): { on: boolean; state: IntegrationState } {
  const settings = useSettings();
  const blocked = useOutboundBlocked();
  const on = !!settings?.offEnabled;
  return { on, state: blocked ? 'blocked' : on ? 'on' : 'off' };
}

/** OCT-187 §1: «Connections»; v0.3 shows only the barcode lookup card. */
export function IntegrationsScreen() {
  const { t } = useT();
  const [, navigate] = useLocation();
  const { state } = useBarcodeState();
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
      </List>
      <List title={t('integr.your_data')}>
        <ListRow
          icon={<Upload />}
          description={t('integr.import.desc')}
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
