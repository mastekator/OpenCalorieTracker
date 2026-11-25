import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Database } from 'better-sqlite3';
import { API_VERSION, type ConfigResponse } from '@oct/shared';
import { accountRoutes } from './account/routes.js';
import { adminRoutes } from './admin/routes.js';
import { aiRoutes } from './ai/routes.js';
import type { AiRuntime } from './ai/runtime.js';
import { authRoutes } from './auth/routes.js';
import { photoBarcodes, type PhotoBarcodes } from './barcodes/read.js';
import { barcodeRoutes } from './barcodes/routes.js';
import { device } from './auth/device.js';
import { passkeyRoutes } from './auth/passkeys.js';
import { dummyHash } from './auth/password.js';
import { session } from './auth/session.js';
import { diaryRoutes } from './diary/routes.js';
import { exportRoutes } from './export/routes.js';
import { mealRoutes } from './meals/routes.js';
import { importRoutes } from './imports/routes.js';
import { illustrationRoutes } from './illustrations/routes.js';
import { integrationRoutes } from './integrations/routes.js';
import { normAgentRoutes } from './norm-agent/routes.js';
import { photoRoutes } from './photos/routes.js';
import { profileRoutes } from './profile/routes.js';
import { recipeRoutes } from './recipes/routes.js';
import { setupRoutes } from './setup/routes.js';
import { syncRoutes } from './sync/routes.js';
import { tokenAuth } from './tokens/auth.js';
import { tokenRoutes } from './tokens/routes.js';
import { weightRoutes } from './weight/routes.js';
import { setupErrors, setupMode, type Config } from './config.js';
import { apiVersion } from './http/apiVersion.js';
import { appVersion as version } from './version.js';
import { ApiError, onError } from './http/errors.js';
import type { Secrets } from './secrets.js';

/** Cap for every /api/* body except photo and import uploads; JSON bodies are read whole into memory. */
export const MAX_JSON_BYTES = 64 * 1024;
const jsonLimit = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: () => {
    throw new ApiError(413, 'payload_too_large');
  },
});

export interface AppDeps {
  config: Config;
  db: Database;
  /** The active AI model; read ai.current() in each request, never once per route. */
  ai: AiRuntime;
  secrets: Secrets;
  /** Outbound HTTP (Open Food Facts); tests pass a fake. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** AppDeps plus the state createApp shares between routes. */
export type RouteDeps = AppDeps & {
  /** Barcodes read from photos; one cache for the barcode and recognition routes. */
  photoBarcodes: PhotoBarcodes;
};

export function createApp(appDeps: AppDeps) {
  const deps: RouteDeps = { ...appDeps, photoBarcodes: photoBarcodes() };
  const { config, db } = deps;
  const app = new Hono();
  app.onError(onError);
  // Warm up now so the first unknown-email sign-in is not slower than the rest (AC-5.2).
  void dummyHash();

  // First, so oversized anonymous bodies are cut before any DB work. Photo and import uploads have their own limits.
  app.use('/api/*', (c, next) =>
    c.req.method === 'POST' &&
    (c.req.path === '/api/photos' || c.req.path === '/api/imports')
      ? next()
      : jsonLimit(c, next),
  );
  // Without a valid PUBLIC_URL no origin is trusted: mutating form-like requests get 403.
  app.use(
    '/api/*',
    csrf({ origin: config.publicUrl ? [config.publicUrl] : [] }),
  );

  app.use('/api/*', apiVersion);
  app.use('/api/*', device(config));
  app.use('/api/*', session(deps));
  // After session: a token request is the token's user, never the cookie's. Internal /api/* ignore tokens.
  const byToken = tokenAuth(deps);
  app.use('/api/v1/*', byToken);
  app.use('/mcp', byToken);
  app.route('/api', authRoutes(deps));
  app.route('/api', passkeyRoutes(deps));
  app.route('/api', setupRoutes(deps));
  app.route('/api', adminRoutes(deps));
  app.route('/api', profileRoutes(deps));
  app.route('/api', accountRoutes(deps));
  app.route('/api', integrationRoutes(deps));
  app.route('/api', tokenRoutes(deps));
  app.route('/api', barcodeRoutes(deps));
  app.route('/api', aiRoutes(deps));
  app.route('/api', photoRoutes(deps));
  app.route('/api', mealRoutes(deps));
  app.route('/api', recipeRoutes(deps));
  app.route('/api', illustrationRoutes(deps));
  app.route('/api', diaryRoutes(deps));
  app.route('/api', normAgentRoutes(deps));
  app.route('/api', syncRoutes(deps));
  app.route('/api', weightRoutes(deps));
  app.route('/api', exportRoutes(deps));
  app.route('/api', importRoutes(deps));

  app.get('/api/health', (c) => c.json({ ok: true, version }));
  app.get('/api/config', (c) =>
    c.json({
      version,
      apiVersion: API_VERSION,
      publicUrl: config.publicUrl,
      authMethods: config.authMethods,
      registration: config.registration,
      setupError: setupErrors(config, db)[0] ?? null,
      setupRequired: setupMode(config, db) === 'wizard',
    } satisfies ConfigResponse),
  );
  // Unknown API routes must 404, not fall through to the SPA's index.html.
  app.all('/api/*', () => {
    throw new ApiError(404, 'not_found');
  });

  app.use('*', serveStatic({ root: config.webDist }));
  // SPA fallback: unknown non-API paths get index.html.
  app.get('*', serveStatic({ root: config.webDist, path: 'index.html' }));
  return app;
}
