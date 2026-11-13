import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

// WEB_DIST overrides where the built frontend lives (e.g. inside a container).
const webDist = process.env.WEB_DIST ?? '../web/dist';

export const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

app.use('*', serveStatic({ root: webDist }));
// SPA fallback: unknown non-API paths get index.html.
app.get('*', serveStatic({ root: webDist, path: 'index.html' }));
