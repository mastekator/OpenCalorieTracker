import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Database } from 'better-sqlite3';
import { API_VERSION, type ConfigResponse } from '@oct/shared';
import { accountRoutes } from './account/routes.js';
import { adminRoutes } from './admin/routes.js';
import { aiRoutes } from './ai/routes.js';
import type { AiModel } from './ai/model.js';
import { authRoutes } from './auth/routes.js';
import { device } from './auth/device.js';
import { dummyHash } from './auth/password.js';
import { session } from './auth/session.js';
import { photoRoutes } from './photos/routes.js';
import { profileRoutes } from './profile/routes.js';
import { setupErrors, type Config } from './config.js';
import { apiVersion } from './http/apiVersion.js';
import { ApiError, onError } from './http/errors.js';

// Same relative path from src/ (dev, tests) and dist/ (production).
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

export interface AppDeps {
  config: Config;
  db: Database;
  /** Null or absent: manual mode, no AI configured. */
  model?: AiModel | null;
}

export function createApp(deps: AppDeps) {
  const { config, db } = deps;
  const app = new Hono();
  app.onError(onError);
  // Warm up now so the first unknown-email sign-in is not slower than the rest (AC-5.2).
  void dummyHash();

  // Without a valid PUBLIC_URL no origin is trusted: mutating form-like requests get 403.
  app.use(
    '/api/*',
    csrf({ origin: config.publicUrl ? [config.publicUrl] : [] }),
  );

  app.use('/api/*', apiVersion);
  app.use('/api/*', device(config));
  app.use('/api/*', session(deps));
  app.route('/api', authRoutes(deps));
  app.route('/api', adminRoutes(deps));
  app.route('/api', profileRoutes(deps));
  app.route('/api', accountRoutes(deps));
  app.route('/api', aiRoutes(deps));
  app.route('/api', photoRoutes(deps));

  app.get('/api/health', (c) => c.json({ ok: true, version }));
  app.get('/api/config', (c) =>
    c.json({
      version,
      apiVersion: API_VERSION,
      publicUrl: config.publicUrl,
      authMethods: config.authMethods,
      registration: config.registration,
      setupError: setupErrors(config, db)[0] ?? null,
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
