import { useState } from 'react';
import {
  Globe,
  KeyRound,
  Lock,
  Moon,
  Shield,
  Sparkle,
  UserPlus,
  Users,
} from 'lucide-react';
import { useLocation } from 'wouter';
import type { MeResponse } from '@oct/shared';
import { useRequireOnline } from '../../app/connection';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { enabledMethods } from './methods';
import './settings.css';

/** The admin closed the AC-1.7 hint on this device. */
export const hintClosedKey = (userId: number) => `oct.adminPwHint.${userId}`;

type Props = {
  user: MeResponse;
  onLogout: () => void;
};

/** Screen 10 (OCT-13 §7): groups in the design's order; admin rows need a network (3.5). */
export function SettingsScreen({ user, onLogout }: Props) {
  const { t } = useT();
  const online = useOnline();
  const requireOnline = useRequireOnline();
  const [, navigate] = useLocation();
  const [hintClosed, setHintClosed] = useState(
    () => localStorage.getItem(hintClosedKey(user.id)) === '1',
  );
  const enabled = enabledMethods(user);
  const go = (href: string) => () => navigate(href);
  // Offline these rows look inactive but still answer a tap with the reason (OCT-25 3.6, 4.8).
  const adminRow = (href: string) => requireOnline('admin', go(href));
  const authRow = (href: string) => requireOnline('auth', go(href));
  const isAdmin = user.role === 'admin';

  return (
    <div className="settings">
      {isAdmin &&
        user.passwordFromConfig &&
        enabled.includes('password') &&
        !hintClosed && (
          <Banner
            tone="accent"
            icon={<KeyRound aria-hidden="true" />}
            title={t('admin.hint.change_pw')}
            onClose={() => {
              localStorage.setItem(hintClosedKey(user.id), '1');
              setHintClosed(true);
            }}
          >
            <Button small variant="tonal" onClick={go('/settings/password')}>
              {t('admin.hint.cta')}
            </Button>
          </Banner>
        )}

      {isAdmin && (
        // shortcut: the admin screens are stubs until OCT-46 and OCT-81.
        <List
          title={t('settings.group.admin')}
          footer={online ? undefined : t('admin.offline')}
        >
          <ListRow
            icon={<UserPlus />}
            disabled={!online}
            onClick={adminRow('/settings/admin/invites')}
          >
            {t('invites.title')}
          </ListRow>
          <ListRow
            icon={<Users />}
            disabled={!online}
            onClick={adminRow('/settings/admin/users')}
          >
            {t('users.title')}
          </ListRow>
          <ListRow
            icon={<Shield />}
            disabled={!online}
            onClick={adminRow('/settings/admin/blocks')}
          >
            {t('blocks.title')}
          </ListRow>
          <ListRow
            icon={<Sparkle />}
            disabled={!online}
            onClick={adminRow('/settings/admin/ai')}
          >
            {t('settings.ai_provider')}
          </ListRow>
        </List>
      )}

      {/* shortcut: language and theme pickers come with OCT-80. */}
      <List title={t('settings.group.appearance')}>
        <ListRow icon={<Globe />}>{t('settings.language')}</ListRow>
        <ListRow icon={<Moon />}>{t('settings.theme')}</ListRow>
      </List>

      {enabled.length > 0 && (
        <List title={t('settings.group.signin', { email: user.email })}>
          {enabled.includes('passkey') && (
            <ListRow
              icon={<KeyRound />}
              disabled={!online}
              onClick={authRow('/settings/passkeys')}
            >
              {t('passkeys.title')}
            </ListRow>
          )}
          {enabled.includes('password') && (
            <ListRow
              icon={<Lock />}
              disabled={!online}
              onClick={authRow('/settings/password')}
            >
              {t(
                user.methods.includes('password')
                  ? 'password.change'
                  : 'password.set',
              )}
            </ListRow>
          )}
        </List>
      )}

      <div className="settings__logout">
        <List>
          <ListRow danger chevron={false} onClick={onLogout}>
            {t('settings.logout')}
          </ListRow>
        </List>
      </div>

      <p className="settings__version">
        {t('settings.version', { v: __APP_VERSION__ })}
      </p>
    </div>
  );
}
