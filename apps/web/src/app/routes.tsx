import { Settings2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { ConfigResponse } from '@oct/shared';
import { Redirect, Route, Switch, useLocation, useSearch } from 'wouter';
import { openUserDb } from '../data/db';
import { flush, pendingCount } from '../data/outbox';
import { getLastUser, pendingOf } from '../data/user';
import { ConfirmDialog } from '../ui/ConfirmDialog/ConfirmDialog';
import { useT } from '../i18n';
import { NavBar } from '../ui/NavBar/NavBar';
import { PasskeysScreen } from '../features/settings/PasskeysScreen';
import { AiProviderScreen } from '../features/settings/AiProviderScreen';
import { PasswordScreen } from '../features/settings/PasswordScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { BlocksScreen } from '../features/admin/BlocksScreen';
import { INVITES_PATH, InvitesScreen } from '../features/admin/InvitesScreen';
import { UsersScreen } from '../features/admin/UsersScreen';
import {
  CaptureProvider,
  MEAL_NEW_PATH,
} from '../features/meals/CaptureContext';
import { diaryDay, localToday } from '../features/diary/day';
import { DiaryScreen } from '../features/diary/DiaryScreen';
import { TodayScreen } from '../features/diary/TodayScreen';
import {
  MEAL_EDIT_PATH,
  RecognitionScreen,
  type MealEditState,
} from '../features/meals/RecognitionScreen';
import {
  MealEditExisting,
  MealEditRoute,
  MealRecalc,
} from '../features/meals/MealEditScreen';
import { UndoDeleteProvider } from '../features/diary/undoDelete';
import {
  KitchenScreen,
  NEW_RECIPE_PATH,
} from '../features/kitchen/KitchenScreen';
import { RecipeEditorScreen } from '../features/kitchen/RecipeEditor';
import { RecipeScreen } from '../features/kitchen/RecipeScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { periodPath } from '../features/week/period';
import { WeekNavHead, WeekScreen } from '../features/week/WeekScreen';
import { WeightScreen } from '../features/weight/WeightScreen';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';
import { AuthLayout } from './AuthLayout';
import { ConfigProvider, useConfig } from './ConfigContext';
import { LoginScreen } from './LoginScreen';
import { safeNext } from './next';
import { RegisterScreen, type RegisterKind } from './RegisterScreen';
import { SetupScreen } from './SetupScreen';
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

/** Signed-in screens, rendered inside AppShell. */
export function AppScreens() {
  const { t } = useT();
  const { user, refresh, logout } = useSession();
  const [, navigate] = useLocation();
  const search = new URLSearchParams(useSearch());
  const how = search.has('how');
  const toSettings = { href: '/settings', label: t('nav.settings') };
  if (!user) return null;
  return (
    <Switch>
      <Route path="/">
        <Screen wide large title={t('nav.today')}>
          <TodayScreen />
        </Screen>
      </Route>
      <Route path="/diary">
        <Redirect to={`/diary/${localToday()}`} replace />
      </Route>
      <Route path="/diary/:date">
        {({ date }) => (
          <Screen
            wide
            large
            title={t('nav.diary')}
            action={
              diaryDay(date, localToday()) === localToday()
                ? undefined
                : {
                    label: t('diary.today_btn'),
                    onClick: () =>
                      navigate(`/diary/${localToday()}`, { replace: true }),
                  }
            }
          >
            <DiaryScreen date={date} />
          </Screen>
        )}
      </Route>
      <Route path="/week">
        <Redirect to={periodPath('week', localToday())} replace />
      </Route>
      <Route path="/week/:id">
        {({ id }) => (
          <Screen
            wide
            large
            title={t('nav.week')}
            aside={<WeekNavHead mode="week" id={id} />}
          >
            <WeekScreen mode="week" id={id} />
          </Screen>
        )}
      </Route>
      <Route path="/month/:id">
        {({ id }) => (
          <Screen
            wide
            large
            title={t('nav.week')}
            aside={<WeekNavHead mode="month" id={id} />}
          >
            <WeekScreen mode="month" id={id} />
          </Screen>
        )}
      </Route>
      <Route path="/weight">
        {/* No tab: back to where it was opened, Today or the profile (OCT-189 §3). */}
        <Screen
          wide
          title={t('weight_card.title')}
          back={
            search.get('from') === 'profile'
              ? { href: '/profile', label: t('nav.profile') }
              : { href: '/', label: t('nav.today') }
          }
        >
          <WeightScreen onSetGoal={() => navigate('/profile')} />
        </Screen>
      </Route>
      <Route path="/profile">
        {/* 8.20 is /profile?how: the same Screen, so ProfileScreen and its draft stay mounted. */}
        <Screen
          {...(how
            ? {
                title: t('norm.how'),
                back: { href: '/profile', label: t('nav.profile') },
              }
            : {
                wide: true,
                large: true,
                title: t('nav.profile'),
                action: {
                  icon: Settings2,
                  label: t('nav.settings'),
                  href: '/settings',
                  mobileOnly: true,
                },
              })}
        >
          <ProfileScreen />
        </Screen>
      </Route>
      <Route path="/kitchen">
        <KitchenScreen />
      </Route>
      <Route path={NEW_RECIPE_PATH}>
        <RecipeEditorScreen />
      </Route>
      <Route path="/kitchen/:id/edit">
        {({ id }) => <RecipeEditorScreen key={id} id={id} />}
      </Route>
      <Route path="/kitchen/:id">{({ id }) => <RecipeScreen id={id} />}</Route>
      <Route path="/settings">
        <Screen
          wide
          title={t('settings.title')}
          back={{ href: '/profile', label: t('nav.profile'), mobileOnly: true }}
        >
          <SettingsScreen user={user} onLogout={logout} />
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
      {user.role !== 'admin' && (
        <Route path="/settings/admin/*">
          <Redirect to="/settings" replace />
        </Route>
      )}
      <Route path="/settings/admin/ai">
        <Screen wide title={t('settings.ai_provider')} back={toSettings}>
          <AiProviderScreen />
        </Screen>
      </Route>
      <Route path={INVITES_PATH}>
        {/* «Invite» is the row under the list (OCT-13 §7), not a navbar action too. */}
        <Screen title={t('invites.title')} back={toSettings}>
          <InvitesScreen />
        </Screen>
      </Route>
      <Route path="/settings/admin/users">
        <Screen title={t('users.title')} back={toSettings}>
          <UsersScreen selfId={user.id} />
        </Screen>
      </Route>
      <Route path="/settings/admin/blocks">
        <Screen title={t('blocks.title')} back={toSettings}>
          <BlocksScreen />
        </Screen>
      </Route>
      <Route path="/settings/admin/*">
        <Redirect to="/settings" replace />
      </Route>
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}

/**
 * Sign-in; a signed-in user goes on to `next` (AC-5.3) before the config is needed,
 * so an offline start from the local copy never waits for /api/config.
 */
function Login() {
  const { user, signedIn } = useSession();
  const params = new URLSearchParams(useSearch());
  if (user) return <Redirect to={safeNext(params.get('next'))} replace />;
  return (
    <ConfigProvider>
      <AuthLayout>
        <LoginForm onSignedIn={signedIn} expired={params.has('expired')} />
      </AuthLayout>
    </ConfigProvider>
  );
}

function LoginForm({
  onSignedIn,
  expired,
}: {
  onSignedIn: () => Promise<void>;
  expired: boolean;
}) {
  const config = useConfig();
  const [queued, setQueued] = useState(0);
  // The expired user's queue waits on this device and goes out after sign-in (3.7).
  useEffect(() => {
    const last = getLastUser();
    if (expired && last) void pendingOf(last.id).then(setQueued, () => {});
  }, [expired]);
  if (setupPending(config)) return <Redirect to="/setup" replace />;
  return (
    <LoginScreen
      config={config}
      onSignedIn={onSignedIn}
      notice={expired ? { kind: 'expired' } : undefined}
      queued={queued}
    />
  );
}

/** `?photo=` → recognition; no photo → manual entry on the edit screen. */
export function MealNew() {
  const search = useSearch();
  const photoId = new URLSearchParams(search).get('photo');
  if (!photoId)
    return (
      <Redirect
        to={search ? `${MEAL_EDIT_PATH}?${search}` : MEAL_EDIT_PATH}
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
  const { user, signedIn, logout } = useSession();
  const { t } = useT();
  // Set before the session refresh, so the new user goes to Today instead of seeing 2.5.
  const [done, setDone] = useState(false);
  // Unsent changes of the signed-in user: the same warning as sign-out in settings (4.6).
  const [queued, setQueued] = useState(0);

  async function signOut() {
    if (!user) return;
    let count = await pendingOf(user.id).catch(() => 0);
    if (count > 0 && navigator.onLine) {
      const db = await openUserDb(user.id);
      try {
        await flush(db).catch(() => {});
        count = await pendingCount(db);
      } finally {
        // An open connection would block the delete in clearLocal.
        db.close();
      }
    }
    if (count > 0) setQueued(count);
    else await logout({ stay: true });
  }
  // No admin yet: only the wizard can make an account (OCT-242 AC-3.1).
  if (setupPending(config)) return <Redirect to="/setup" replace />;
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
          await signedIn();
        }}
        onSignOut={signOut}
      />
      <ConfirmDialog
        open={queued > 0}
        title={t('logout.confirm.title')}
        body={t('logout.confirm.queue', { count: queued })}
        confirmLabel={t('logout.confirm.queue_ok')}
        stack
        onConfirm={() => {
          setQueued(0);
          void logout({ stay: true });
        }}
        onCancel={() => setQueued(0)}
      />
    </AuthLayout>
  );
}

/** No admin yet and nothing to fix in the configuration: the wizard instead of sign-in. */
const setupPending = (config: ConfigResponse) =>
  config.setupRequired && !config.setupError;

/** The first-run wizard; once there is an admin, or with a setup error, sign-in takes over (OCT-242). */
function Setup() {
  const config = useConfig();
  const { signedIn } = useSession();
  // The config is read once: after step 2 the wizard stays for step 3, a reload goes to the app.
  if (!setupPending(config)) return <Redirect to="/login" replace />;
  return (
    <AuthLayout>
      <SetupScreen config={config} onSignedIn={signedIn} />
    </AuthLayout>
  );
}

function SignedIn() {
  const { user } = useSession();
  return (
    <AuthGate>
      {/* Above the meal flow too: «Retake» opens the camera in the same tap (iOS). */}
      <CaptureProvider>
        <UndoDeleteProvider>
          <Switch>
            {/* A modal flow over the whole screen, without the tab bar (OCT-16 §1). */}
            <Route path={MEAL_NEW_PATH}>
              <MealNew />
            </Route>
            <Route path={MEAL_EDIT_PATH}>
              <MealEditRoute />
            </Route>
            {/* After the two above: «new» is not a clientId. */}
            <Route path="/meal/:clientId">
              {({ clientId }) => <MealEditExisting clientId={clientId} />}
            </Route>
            <Route path="/meal/:clientId/recalc">
              {({ clientId }) => <MealRecalc clientId={clientId} />}
            </Route>
            <Route>
              <AppShell email={user?.email}>
                <AppScreens />
              </AppShell>
            </Route>
          </Switch>
        </UndoDeleteProvider>
      </CaptureProvider>
    </AuthGate>
  );
}

export function Routes() {
  return (
    <Switch>
      <Route path="/login">
        {/* Only sign-in needs the config: the signed-in app must start offline (E-8.10). */}
        <Login />
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
      <Route path="/setup">
        {/* Its own key: the config is read again on the way from or to another auth route. */}
        <ConfigProvider key="setup">
          <Setup />
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
