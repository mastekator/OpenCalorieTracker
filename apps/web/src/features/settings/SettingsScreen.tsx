import { useEffect, useState } from 'react';
import {
  Download,
  Globe,
  KeyRound,
  Lock,
  Moon,
  Ruler,
  Shield,
  Sparkle,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import { useLocation } from 'wouter';
import {
  adminAiStatusSchema,
  LOCALES,
  type AiProviderState,
  type AiStatus,
  type Locale,
  type MeResponse,
} from '@oct/shared';
import { api } from '../../api/client';
import { useRequireOnline } from '../../app/connection';
import {
  appUrl,
  currentInstallPlatform,
  useInstallPrompt,
  type InstallPlatform,
} from '../../app/install';
import { applyTheme } from '../../app/theme';
import { useAiStatus, useDb, useSettings } from '../../data/DataContext';
import { patchSettings } from '../../data/outbox';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { InstallSheet } from '../../ui/InstallSheet/InstallSheet';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { AiStateBadge } from '../../ui/ProviderStatus/ProviderStatus';
import { SegmentedRow } from '../../ui/SegmentedRow/SegmentedRow';
import { BLOCKS_API, blocksSchema } from '../admin/BlocksScreen';
import { AI_STATUS_PATH } from './AiProviderScreen';
import { enabledMethods } from './methods';
import './settings.css';

/** The admin closed the AC-1.7 hint on this device. */
export const hintClosedKey = (userId: number) => `oct.adminPwHint.${userId}`;

/** Each language in itself (AC-3.2), capitalised as a menu item: «русский» → «Русский». */
const languageName = (l: Locale) => {
  const name = new Intl.DisplayNames([l], { type: 'language' }).of(l) ?? l;
  return name.charAt(0).toLocaleUpperCase(l) + name.slice(1);
};
const LANGUAGES = LOCALES.map((l) => ({ value: l, label: languageName(l) }));

/** Who gets the photos (AC-6.10): the provider, an own server's host, or nobody. */
function recognitionText(
  t: ReturnType<typeof useT>['t'],
  status: AiStatus | undefined,
) {
  if (!status) return undefined;
  const provider = status.providerName ?? status.baseUrlHost;
  return status.recognition === 'ready' && provider
    ? t('settings.recognition_on', { provider })
    : t('settings.recognition_off');
}

type Props = {
  user: MeResponse;
  onLogout: () => void;
  /** iPhone install sheet; detected from the browser when omitted. */
  platform?: InstallPlatform | null;
};

/**
 * Screen 10 (OCT-25 §4): groups in the design's order, two columns on the desktop (D.1).
 * Language, theme and units apply at once and sync through the queue, also offline (4.8).
 */
export function SettingsScreen({ user, onLogout, platform: given }: Props) {
  const { t, locale, setLocale } = useT();
  const db = useDb();
  const settings = useSettings();
  const ai = useAiStatus();
  const prompt = useInstallPrompt();
  const [platform] = useState(() =>
    given === undefined ? currentInstallPlatform() : given,
  );
  const [installOpen, setInstallOpen] = useState(false);
  const theme = settings?.theme ?? user.theme;
  const units = settings?.units ?? user.units;
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
  const [aiState, setAiState] = useState<AiProviderState | null>(null);
  const [blocks, setBlocks] = useState(0);
  // Free reads (no request to the provider); a failure just leaves the row without a badge.
  useEffect(() => {
    setBlocks(0);
    if (!isAdmin || !online) return setAiState(null);
    let live = true;
    api(AI_STATUS_PATH, adminAiStatusSchema)
      .then((s) => live && setAiState(s.state))
      .catch(() => {});
    api(BLOCKS_API, blocksSchema)
      .then((b) => live && setBlocks(b.length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isAdmin, online]);

  return (
    <div className="settings">
      {!online && (
        <div className="settings__offline">
          <Banner icon={<WifiOff aria-hidden="true" />}>
            {t('settings.offline')}
          </Banner>
        </div>
      )}
      <div className="settings__col">
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
              value={
                blocks > 0 ? <Badge tone="err">{blocks}</Badge> : undefined
              }
              onClick={adminRow('/settings/admin/blocks')}
            >
              {t('blocks.title')}
            </ListRow>
            <ListRow
              icon={<Sparkle />}
              disabled={!online}
              value={aiState ? <AiStateBadge state={aiState} /> : undefined}
              onClick={adminRow('/settings/admin/ai')}
            >
              {t('settings.ai_provider')}
            </ListRow>
          </List>
        )}

        <List title={t('settings.group.appearance')}>
          <SegmentedRow
            icon={<Globe />}
            label={t('settings.language')}
            options={LANGUAGES}
            value={locale}
            // Saved first: the sync effect in DataProvider then reads the new value, not the old.
            onChange={(l) =>
              void patchSettings(db, { locale: l }).finally(() => setLocale(l))
            }
          />
          <SegmentedRow
            icon={<Moon />}
            label={t('settings.theme')}
            options={(['system', 'light', 'dark'] as const).map((v) => ({
              value: v,
              label: t(`settings.theme_option.${v}`),
            }))}
            value={theme}
            onChange={(v) =>
              void patchSettings(db, { theme: v }).finally(() => applyTheme(v))
            }
          />
        </List>

        <List
          title={t('settings.group.data')}
          footer={t('settings.units_hint')}
        >
          <SegmentedRow
            icon={<Ruler />}
            label={t('settings.units')}
            options={(['metric', 'us'] as const).map((v) => ({
              value: v,
              label: t(`settings.units_option.${v}`),
            }))}
            value={units}
            onChange={(v) => void patchSettings(db, { units: v })}
          />
        </List>
      </div>

      <div className="settings__col">
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

        <List title={t('settings.group.app')}>
          {platform ? (
            <ListRow icon={<Download />} onClick={() => setInstallOpen(true)}>
              {t('settings.install')}
            </ListRow>
          ) : (
            prompt.canInstall && (
              <ListRow
                icon={<Download />}
                onClick={() => void prompt.install()}
              >
                {t('settings.install')}
              </ListRow>
            )
          )}
          <ListRow
            icon={<Sparkle />}
            description={recognitionText(t, ai.status)}
          >
            {t('settings.recognition')}
          </ListRow>
        </List>
        {platform && (
          <InstallSheet
            open={installOpen}
            onClose={() => setInstallOpen(false)}
            variant={platform}
            url={appUrl()}
          />
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
    </div>
  );
}
