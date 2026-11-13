import { defineConfig } from '@vite-pwa/assets-generator/config';

// Run `pnpm --filter web icons` after changing docs/design/oct-25/icon.svg; the PNGs are committed (ADR-0012).
// Square icons (system masks round them); splash screens: pwa-splash.config.ts.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: {
      sizes: [192, 512],
      padding: 0,
      favicons: [[48, 'favicon.ico']],
    },
    maskable: { sizes: [] },
    apple: { sizes: [180], padding: 0 },
  },
  // The generator writes next to the image, so the script copies the master into public/ first.
  images: ['public/icon.svg'],
});
