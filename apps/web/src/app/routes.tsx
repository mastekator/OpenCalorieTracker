import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { Redirect, Route, Switch } from 'wouter';
import type { Key } from '../i18n/translate';
import { useT } from '../i18n';
import { NavBar } from '../ui/NavBar/NavBar';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';
import { AuthLayout } from './AuthLayout';
import { useSession } from './SessionContext';

// shortcut: placeholder screens; each is replaced by its own task (sign-in OCT-2, Today OCT-19, …).
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

/** Signed-in screens, rendered inside AppShell. */
export function AppScreens() {
  const { t } = useT();
  return (
    <Switch>
      <Route path="/">
        <Screen wide large title={t('nav.today')} />
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
          }}
        />
      </Route>
      <Route path="/settings">
        <Screen
          title={t('nav.settings')}
          back={{ href: '/profile', label: t('nav.profile') }}
        />
      </Route>
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}

function SignedIn() {
  const { user } = useSession();
  return (
    <AuthGate>
      <AppShell email={user?.email}>
        <AppScreens />
      </AppShell>
    </AuthGate>
  );
}

export function Routes() {
  return (
    <Switch>
      <Route path="/login">
        <AuthLayout>
          <AuthStub title="screens.login" />
        </AuthLayout>
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
