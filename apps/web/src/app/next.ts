/** Screens shown without a session; a 401 there is not an expired session. */
export const PUBLIC_PATHS = ['/login', '/invite', '/recover', '/register'];

export const isPublicPath = (path: string) =>
  PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Where to go after sign-in: only a same-origin path, otherwise "/".
 * Rejects "//host" and "/\host" (browsers read both as another origin) and control characters.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return '/';
  return raw;
}

/** The sign-in URL that brings the user back to `path` (pathname + search, no hash). */
export function loginHref(path: string, expired = false) {
  const params = new URLSearchParams();
  if (path !== '/') params.set('next', path);
  if (expired) params.set('expired', '1');
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
