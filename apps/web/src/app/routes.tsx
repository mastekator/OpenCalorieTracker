import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { Redirect, Route, Switch, useSearch } from 'wouter';
import type { Key } from '../i18n/translate';
import { useT } from '../i18n';
import { Button } from '../ui/Button/Button';
import { NavBar } from '../ui/NavBar/NavBar';
import {
  CaptureProvider,
  MEAL_NEW_PATH,
  useCapture,
} from '../features/meals/CaptureContext';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';
import { AuthLayout } from './AuthLayout';
import { ConfigProvider, useConfig } from './ConfigContext';
import { LoginScreen } from './LoginScreen';
import { safeNext } from './next';
import { useSession } from './SessionContext';

// shortcut: placeholder screens; each is replaced by its own task (invite/recovery OCT-44, Today OCT-19, …).
function AuthStub({ title }: { title: Key }) {
  const { t } = useT();
  return <h1>{t(title)}</h1>;
}

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

// shortcut: the full-screen meal flow placeholder until the recognition screen (OCT-57).
function MealFlowStub() {
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

/** Signed-in screens, rendered inside AppShell. */
export function AppScreens() {
  const { t } = useT();
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
          large
          title={t('nav.profile')}
          action={{
            icon: Settings2,
            label: t('nav.settings'),
            href: '/settings',
            mobileOnly: true,
          }}
        />
      </Route>
      <Route path="/settings">
        <Screen
          title={t('nav.settings')}
          back={{ href: '/profile', label: t('nav.profile'), mobileOnly: true }}
        />
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

function SignedIn() {
  const { user } = useSession();
  return (
    <AuthGate>
      <Switch>
        {/* A modal flow over the whole screen, without the tab bar (OCT-16 §1). */}
        <Route path={MEAL_NEW_PATH}>
          <MealFlowStub />
        </Route>
        <Route>
          <CaptureProvider>
            <AppShell email={user?.email}>
              <AppScreens />
            </AppShell>
          </CaptureProvider>
        </Route>
      </Switch>
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
        <AuthLayout>
          <AuthStub title="screens.invite" />
        </AuthLayout>
      </Route>
      <Route path="/recover">
        <AuthLayout>
          <AuthStub title="screens.recover" />
        </AuthLayout>
      </Route>
      <Route path="/register">
        <AuthLayout>
          <AuthStub title="screens.register" />
        </AuthLayout>
      </Route>
      <Route>
        <SignedIn />
      </Route>
    </Switch>
  );
}
