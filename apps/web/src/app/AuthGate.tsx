import type { ReactNode } from 'react';
import { Redirect, useLocation, useSearch } from 'wouter';
import { loginHref } from './next';
import { useSession } from './SessionContext';

/** Signed-in screens only; otherwise sign-in, which brings the user back here (AC-5.3). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [path] = useLocation();
  const search = useSearch();
  if (!user)
    return (
      <Redirect to={loginHref(search ? `${path}?${search}` : path)} replace />
    );
  return children;
}
