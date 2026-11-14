import type { ReactNode } from 'react';

/** Screens outside the app (sign-in, invite, recovery): a centred card from 1024px (OCT-13 §4.1). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <div className="page auth-layout__card">{children}</div>
    </main>
  );
}
