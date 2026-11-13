import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  addons: ['storybook-addon-pseudo-states'],
  framework: '@storybook/react-vite',
  // No service worker in Storybook: the PWA plugin would precache the Storybook build.
  viteFinal: (config) => ({
    ...config,
    plugins: config.plugins
      ?.flat()
      .filter(
        (p) => !(p && 'name' in p && p.name.startsWith('vite-plugin-pwa')),
      ),
  }),
};
export default config;
