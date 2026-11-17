import { useEffect, useState } from 'react';
import {
  Download,
  Globe,
  Image,
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
  type PhotoRetentionDays,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useRequireOnline } from '../../app/connection';
import {
  appUrl,
  currentInstallPlatform,
  useInstallPrompt,
  type InstallPlatform,
} from '../../app/install';
import { applyTheme } from '../../app/theme';
import { useAiStatus, useDb, useSettings } from '../../data/DataContext';
import {
  expiringPhotos,
  flush,
  patchSettings,
  pendingCount,
  putPhotoRetention,
} from '../../data/outbox';
import { DESKTOP_MEDIA } from '../../styles/breakpoints';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { InstallSheet } from '../../ui/InstallSheet/InstallSheet';
import { List, ListRow } from '../../ui/List/List';
import {
  RetentionSheet,
  useRetentionLabel,
} from '../../ui/RetentionSheet/RetentionSheet';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { AiStateBadge } from '../../ui/ProviderStatus/ProviderStatus';
import { SegmentedRow } from '../../ui/SegmentedRow/SegmentedRow';
import { useToast } from '../../ui/Toast/Toast';
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
function recognitionText(t: ReturnType<typeof useT>['t'], status: AiStatus) {
  const provider = status.providerName ?? status.baseUrlHost;
  return status.recognition === 'ready' && provider
    ? t('settings.recognition_on', { provider })
    : t('settings.recognition_off');
}

/** null (forever) is the longest. */
const longer = (a: PhotoRetentionDays, b: PhotoRetentionDays) =>
  a === null ? b !== null : b !== null && a > b;

type Props = {
  user: MeResponse;
  /** Ends the session and clears this device; called after the confirm (4.6, 4.7). */
  onLogout: () => Promise<void>;
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
  // D.1: Chrome and Edge install from the address bar on the desktop.
  const [desktop] = useState(
    () => !!window.matchMedia?.(DESKTOP_MEDIA).matches,
  );
  const toast = useToast();
  const retentionLabel = useRetentionLabel();
  const retention = settings?.photoRetentionDays ?? 30;
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [shorten, setShorten] = useState<{
    days: PhotoRetentionDays;
    count: number;
  } | null>(null);
  // 'sending': the queue goes out first; a number: the confirm with that many unsent (4.6, 4.7).
  const [signOut, setSignOut] = useState<'sending' | number | null>(null);
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

  async function chooseRetention(days: PhotoRetentionDays) {
    setRetentionOpen(false);
    if (days === retention) return;
    const count = longer(retention, days) ? await expiringPhotos(db, days) : 0;
    if (count > 0) setShorten({ days, count });
    else await putPhotoRetention(db, days);
  }

  async function startSignOut() {
    if (signOut !== null) return;
    if (navigator.onLine && (await pendingCount(db)) > 0) {
      setSignOut('sending');
      await flush(db).catch(() => {});
    }
    setSignOut(await pendingCount(db));
  }

  return (
    <div className="settings settings--columns">
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
          <ListRow
            icon={<Image />}
            description={t('settings.photos.hint')}
            value={retentionLabel(retention)}
            onClick={() => setRetentionOpen(true)}
          >
            {t('settings.photos.keep')}
          </ListRow>
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
        <RetentionSheet
          open={retentionOpen}
          value={retention}
          onSelect={(days) => void chooseRetention(days)}
          onClose={() => setRetentionOpen(false)}
        />
        <ConfirmDialog
          open={!!shorten}
          stack
          title={
            shorten?.days === 0
              ? t('settings.photos.shorten.title_none')
              : t('settings.photos.shorten.title', { days: shorten?.days ?? 0 })
          }
          body={
            shorten &&
            (shorten.days === 0
              ? t('settings.photos.shorten.body_none', { count: shorten.count })
              : t('settings.photos.shorten.body', {
                  count: shorten.count,
                  days: shorten.days ?? 0,
                }))
          }
          confirmLabel={t('settings.photos.shorten.ok')}
          onConfirm={() => {
            if (shorten) void putPhotoRetention(db, shorten.days);
            setShorten(null);
          }}
          onCancel={() => setShorten(null)}
        />
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
            prompt.canInstall &&
            !desktop && (
              <ListRow
                icon={<Download />}
                onClick={() => void prompt.install()}
              >
                {t('settings.install')}
              </ListRow>
            )
          )}
          {/* Hidden until the first status arrives: a guessed line could be untrue (OCT-172). */}
          {ai.status && (
            <ListRow
              icon={<Sparkle />}
              description={recognitionText(t, ai.status)}
            >
              {t('settings.recognition')}
            </ListRow>
          )}
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
            <ListRow danger chevron={false} onClick={() => void startSignOut()}>
              {signOut === 'sending' ? (
                <span className="settings__sending" aria-busy="true">
                  {/* Button's spinner, the same on every waiting action. */}
                  <span className="button__spinner" aria-hidden="true" />
                  {t('logout.sending')}
                </span>
              ) : (
                t('settings.logout')
              )}
            </ListRow>
          </List>
        </div>
        <ConfirmDialog
          open={typeof signOut === 'number'}
          title={t('logout.confirm.title')}
          body={
            typeof signOut === 'number' && signOut > 0
              ? t('logout.confirm.queue', { count: signOut })
              : t('logout.confirm.body')
          }
          confirmLabel={
            typeof signOut === 'number' && signOut > 0
              ? t('logout.confirm.queue_ok')
              : t('logout.confirm.ok')
          }
          stack={typeof signOut === 'number' && signOut > 0}
          onConfirm={() =>
            void onLogout().catch((err) => {
              setSignOut(null);
              toast({
                text: t(
                  `errors.${err instanceof ApiError ? err.code : 'internal'}`,
                ),
              });
            })
          }
          onCancel={() => setSignOut(null)}
        />

        <p className="settings__version">
          {t('settings.version', { v: __APP_VERSION__ })}
        </p>
      </div>
    </div>
  );
}
