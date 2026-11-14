import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Router, type AroundNavHandler } from 'wouter';
import { navigate } from 'wouter/use-browser-location';
import { useT } from '../i18n';
import { ConfirmDialog } from '../ui/ConfirmDialog/ConfirmDialog';
import { isDirty, saveDirty } from './dirty';

const url = () => location.pathname + location.search + location.hash;
const pathOf = (to: string) => to.split(/[?#]/)[0];

// The page the user is on: «back» has already changed the URL by the time we hear of it.
let here = url();
let ask: ((go: () => void) => void) | undefined;
for (const type of ['pushState', 'replaceState'])
  addEventListener(type, () => {
    here = url();
  });
// Added at import, before wouter subscribes, so it can stop wouter from rendering the new page.
addEventListener('popstate', (e) => {
  // Same screen, another view of it (/profile ↔ /profile?how): nothing is left.
  if (!ask || !isDirty() || location.pathname === pathOf(here)) {
    here = url();
    return;
  }
  e.stopImmediatePropagation();
  const to = url();
  // shortcut: puts the page back as a new entry (works for back and forward alike), so the
  // history keeps a duplicate; track entry indexes if that ever matters.
  history.pushState(null, '', here);
  ask(() => navigate(to, { replace: true }));
});

/**
 * Asks before leaving a screen with unsaved edits (OCT-22 8.19, OCT-19 6.8):
 * links, tabs and navigate() through wouter, back/forward, closing the tab (in dirty.ts).
 * Moving within the same path (only the query changes) stays on the screen and passes.
 * A screen opts in with useDirty(flag, save).
 */
export function LeaveGuard({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [go, setGo] = useState<(() => void) | null>(null);

  useEffect(() => {
    ask = (next) => setGo(() => next);
    return () => {
      ask = undefined;
    };
  }, []);

  // Redirects (replace) pass: they are the app's own, not the user leaving.
  const aroundNav = useCallback<AroundNavHandler>((nav, to, opts) => {
    if (!isDirty() || opts?.replace || pathOf(to) === location.pathname)
      return nav(to, opts);
    setGo(() => () => nav(to, opts));
  }, []);

  const close = () => setGo(null);
  return (
    <Router aroundNav={aroundNav}>
      {children}
      <ConfirmDialog
        open={go !== null}
        title={t('leave.title')}
        body={t('leave.body')}
        tone="primary"
        confirmLabel={t('leave.save')}
        secondaryLabel={t('leave.discard')}
        cancelLabel={t('leave.stay')}
        // A failed save stays on the screen, which shows its own error.
        onConfirm={async () => {
          close();
          if (await saveDirty()) go?.();
        }}
        onSecondary={() => {
          close();
          go?.();
        }}
        onCancel={close}
      />
    </Router>
  );
}
