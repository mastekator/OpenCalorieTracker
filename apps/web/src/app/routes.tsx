import { Redirect, Route, Switch } from 'wouter';
import type { Key } from '../i18n/translate';
import { useT } from '../i18n';

// shortcut: placeholder screens; each is replaced by its own sign-in task (OCT-2).
function Stub({ title }: { title: Key }) {
  const { t } = useT();
  return (
    <main className="page">
      <h1>{t(title)}</h1>
    </main>
  );
}

export function Routes() {
  return (
    <Switch>
      <Route path="/login">
        <Stub title="screens.login" />
      </Route>
      <Route path="/invite">
        <Stub title="screens.invite" />
      </Route>
      <Route path="/recover">
        <Stub title="screens.recover" />
      </Route>
      <Route path="/register">
        <Stub title="screens.register" />
      </Route>
      <Route path="/">
        <Stub title="screens.home" />
      </Route>
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}
