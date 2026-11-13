import type { Preview } from '@storybook/react-vite';
import { LOCALES } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../src/i18n';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/layout.css';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme (data-theme on <html>)',
      toolbar: {
        icon: 'mirror',
        items: ['system', 'light', 'dark'],
        dynamicTitle: true,
      },
    },
    locale: {
      description: 'Language',
      toolbar: { icon: 'globe', items: [...LOCALES], dynamicTitle: true },
    },
  },
  initialGlobals: {
    theme: 'system',
    locale: 'en',
    viewport: { value: 'iphone390' },
  },
  parameters: {
    viewport: {
      options: {
        iphoneSE: {
          name: 'iPhone SE 375',
          styles: { width: '375px', height: '667px' },
        },
        iphone390: {
          name: 'iPhone 390',
          styles: { width: '390px', height: '844px' },
        },
        desktop: {
          name: 'Desktop 1280',
          styles: { width: '1280px', height: '800px' },
        },
      },
    },
  },
  decorators: [
    (Story, { globals }) => {
      // Same switch as the app: the attribute wins, no attribute follows the system.
      const root = document.documentElement;
      if (globals.theme === 'light' || globals.theme === 'dark')
        root.dataset.theme = globals.theme;
      else delete root.dataset.theme;
      // I18nProvider reads the saved locale once; the key remounts it on switch.
      localStorage.setItem(LOCALE_STORAGE_KEY, globals.locale);
      return (
        <I18nProvider key={globals.locale}>
          <Story />
        </I18nProvider>
      );
    },
  ],
};
export default preview;
