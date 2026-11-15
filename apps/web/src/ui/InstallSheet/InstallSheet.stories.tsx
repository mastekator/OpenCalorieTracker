import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ToastProvider } from '../Toast/Toast';
import { InstallSheet } from './InstallSheet';

type Props = { variant: 'safari' | 'other-browser' };

// Opens on load; the button reopens it.
function Demo({ variant }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('install.card.cta')}
      </Button>
      <InstallSheet
        open={open}
        onClose={() => setOpen(false)}
        variant={variant}
        url="https://calories.home.lan/"
      />
    </>
  );
}

const meta = {
  title: 'UI/InstallSheet',
  component: Demo,
  args: { variant: 'safari' },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 2.2: three steps in Safari. */
export const Safari: Story = {};
export const SafariDark: Story = { globals: { theme: 'dark' } };
export const SafariRussian: Story = { globals: { locale: 'ru' } };
export const SafariNarrowRussian: Story = {
  globals: { locale: 'ru', viewport: { value: 'iphoneSE' } },
};
/** 2.4: Chrome, Firefox or an in-app browser on iPhone. «Copy address» shows a toast. */
export const OtherBrowser: Story = { args: { variant: 'other-browser' } };
export const OtherBrowserDark: Story = {
  args: { variant: 'other-browser' },
  globals: { theme: 'dark' },
};
export const OtherBrowserRussian: Story = {
  args: { variant: 'other-browser' },
  globals: { locale: 'ru' },
};
