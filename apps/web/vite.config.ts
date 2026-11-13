import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Light --theme-color in src/styles/tokens.css (design OCT-25 §1).
const THEME_COLOR = '#F8FAF9';

export default defineConfig({
  plugins: [
    react(),
    // ADR-0012: precache the whole shell, API stays network-only except photo thumbnails.
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false,
      manifest: {
        name: 'OpenCalorieTracker',
        short_name: 'OpenCalorie',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: THEME_COLOR,
        theme_color: THEME_COLOR,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // iOS reads splash screens at launch from the network/HTTP cache, not via the SW.
        globIgnores: ['**/apple-splash-*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Thumbnails only (ADR-0008); ?size=full is never cached.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              /^\/api\/photos\/[^/]+$/.test(url.pathname) &&
              url.searchParams.get('size') !== 'full',
            handler: 'CacheFirst',
            options: {
              cacheName: 'thumbs-v1',
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Dev only: forward API calls to the local server (apps/server, PORT default 3000).
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3000}` },
  },
});
