import { Settings2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Redirect, Route, Switch, useLocation, useSearch } from 'wouter';
import { api } from '../api/client';
import type { Key } from '../i18n/translate';
import { useT } from '../i18n';
import { Button } from '../ui/Button/Button';
import { NavBar } from '../ui/NavBar/NavBar';
import { useOnline } from '../ui/OfflineBar/OfflineBar';
import { PasskeysScreen } from '../features/settings/PasskeysScreen';
import { PasswordScreen } from '../features/settings/PasswordScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import {
  CaptureProvider,
  MEAL_NEW_PATH,
  useCapture,
} from '../features/meals/CaptureContext';
import {
  MEAL_EDIT_PATH,
  RecognitionScreen,
  type MealEditState,
} from '../features/meals/RecognitionScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';
import { AuthLayout } from './AuthLayout';
import { ConfigProvider, useConfig } from './ConfigContext';
import { LoginScreen } from './LoginScreen';
import { safeNext } from './next';
import { RegisterScreen, type RegisterKind } from './RegisterScreen';
import { useSession } from './SessionContext';

/** A screen inside the app: navbar and a content column (wide on Today, Diary, Week). */
function Screen({
  wide = false,
  children,
  ...nav
}: Parameters<typeof NavBar>[0] & { wide?: boolean; children?: ReactNode }) {
  return (
    <div className={`screen${wide ? ' screen--wide' : ''}`}>
      <NavBar {...nav} />
      <main className="screen__body">{children}</main>
    </div>
  );
}

// shortcut: only the way into the photo flow; the Today screen itself is OCT-67.
function TodayStub() {
  const { t } = useT();
  const capture = useCapture();
  return (
    <div className="today-stub">
      <Button variant="tonal" onClick={capture.pick}>
        {t('capture.gallery')}
      </Button>
      <Button variant="tonal" onClick={capture.manual}>
        {t('capture.manual')}
      </Button>
    </div>
  );
}

// shortcut: the edit screen placeholder until OCT-58.
function MealEditStub() {
  const { t } = useT();
  return (
    <div className="screen">
      <NavBar
        title={t('nav.add_food')}
        back={{ href: '/', label: t('common.cancel') }}
      />
    </div>
  );
}

// shortcut: admin screens are stubs until OCT-46 (invites, users, blocks) and OCT-81 (AI provider).
const ADMIN_TITLES: Record<string, Key> = {
  invites: 'invites.title',
  users: 'users.title',
  blocks: 'blocks.title',
  ai: 'settings.ai_provider',
};

/** Signed-in screens, rendered inside AppShell. */
export function AppScreens() {
  const { t } = useT();
  const { user, refresh } = useSession();
  const online = useOnline();
  const [, navigate] = useLocation();
  const toSettings = { href: '/settings', label: t('nav.settings') };
  // shortcut: signs out at once; the confirm with unsent changes and clearing local data are OCT-80.
  const logout = async () => {
    await api('/api/auth/logout', z.undefined(), { method: 'POST' }).catch(
      () => {},
    );
    await refresh();
  };
  if (!user) return null;
  return (
    <Switch>
      <Route path="/">
        <Screen wide large title={t('nav.today')}>
          <TodayStub />
        </Screen>
      </Route>
      <Route path="/diary">
        <Screen wide large title={t('nav.diary')} />
      </Route>
      <Route path="/week">
        <Screen wide large title={t('nav.week')} />
      </Route>
      <Route path="/profile">
        <Screen
          wide
          large
          title={t('nav.profile')}
          action={{
            icon: Settings2,
            label: t('nav.settings'),
            href: '/settings',
            mobileOnly: true,
          }}
        >
          <ProfileScreen />
        </Screen>
      </Route>
      <Route path="/settings">
        <Screen
          title={t('nav.settings')}
          back={{ href: '/profile', label: t('nav.profile'), mobileOnly: true }}
        >
          <SettingsScreen
            user={user}
            online={online}
            onLogout={() => void logout()}
          />
        </Screen>
      </Route>
      <Route path="/settings/passkeys">
        <Screen title={t('passkeys.title')} back={toSettings}>
          <PasskeysScreen user={user} onChanged={refresh} />
        </Screen>
      </Route>
      <Route path="/settings/password">
        <Screen
          title={t(
            user.methods.includes('password')
              ? 'password.change'
              : 'password.set',
          )}
          back={toSettings}
        >
          <PasswordScreen
            user={user}
            onDone={async () => {
              await refresh();
              navigate('/settings');
            }}
          />
        </Screen>
      </Route>
      <Route path="/settings/admin/:page">
        {({ page }) =>
          ADMIN_TITLES[page] ? (
            <Screen title={t(ADMIN_TITLES[page])} back={toSettings} />
          ) : (
            <Redirect to="/settings" replace />
          )
        }
      </Route>
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}

/** Sign-in; a signed-in user goes on to `next` (AC-5.3). */
function Login() {
  const config = useConfig();
  const { user, refresh } = useSession();
  const params = new URLSearchParams(useSearch());
  if (user) return <Redirect to={safeNext(params.get('next'))} replace />;
  return (
    <AuthLayout>
      <LoginScreen
        config={config}
        onSignedIn={refresh}
        notice={params.has('expired') ? { kind: 'expired' } : undefined}
      />
    </AuthLayout>
  );
}

/** `?photo=` → recognition; no photo → manual entry on the edit screen. */
function MealNew() {
  const photoId = new URLSearchParams(useSearch()).get('photo');
  if (!photoId)
    return (
      <Redirect
        to={MEAL_EDIT_PATH}
        replace
        state={{ manual: 'user' } satisfies MealEditState}
      />
    );
  // A new photo (retake, drop, paste) restarts the screen.
  return <RecognitionScreen key={photoId} photoId={photoId} />;
}

/** Invite, recovery link or open registration; on success straight to Today (OCT-13 §6). */
function Register({ kind }: { kind: RegisterKind }) {
  const config = useConfig();
  const { user, refresh } = useSession();
  // Set before the session refresh, so the new user goes to Today instead of seeing 2.5.
  const [done, setDone] = useState(false);
  if (user && (done || kind === 'open')) return <Redirect to="/" replace />;
  if (kind === 'open' && config.registration !== 'open')
    return <Redirect to="/login" replace />;
  return (
    <AuthLayout>
      <RegisterScreen
        kind={kind}
        config={config}
        token={location.hash.slice(1)}
        user={user}
        onSignedIn={async () => {
          setDone(true);
          await refresh();
        }}
        onSignOut={async () => {
          await api('/api/auth/logout', z.unknown(), { method: 'POST' });
          await refresh();
        }}
      />
    </AuthLayout>
  );
}

function SignedIn() {
  const { user } = useSession();
  return (
    <AuthGate>
      {/* Above the meal flow too: «Retake» opens the camera in the same tap (iOS). */}
      <CaptureProvider>
        <Switch>
          {/* A modal flow over the whole screen, without the tab bar (OCT-16 §1). */}
          <Route path={MEAL_NEW_PATH}>
            <MealNew />
          </Route>
          <Route path={MEAL_EDIT_PATH}>
            <MealEditStub />
          </Route>
          <Route>
            <AppShell email={user?.email}>
              <AppScreens />
            </AppShell>
          </Route>
        </Switch>
      </CaptureProvider>
    </AuthGate>
  );
}

export function Routes() {
  return (
    <Switch>
      <Route path="/login">
        {/* Only sign-in needs the config: the signed-in app must start offline (E-8.10). */}
        <ConfigProvider>
          <Login />
        </ConfigProvider>
      </Route>
      <Route path="/invite">
        <ConfigProvider>
          <Register kind="invite" />
        </ConfigProvider>
      </Route>
      <Route path="/recover">
        <ConfigProvider>
          <Register kind="recovery" />
        </ConfigProvider>
      </Route>
      <Route path="/register">
        <ConfigProvider>
          <Register kind="open" />
        </ConfigProvider>
      </Route>
      <Route>
        <SignedIn />
      </Route>
    </Switch>
  );
}
