import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ToastProvider, useToast } from './Toast';

type Props = { icon?: boolean; action?: boolean; long?: boolean };

// Lucide `check`.
const check = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// Shows on load; the button shows it again (it hides after 3 s).
function Demo({ icon = false, action = false, long = false }: Props) {
  const { t } = useT();
  const show = useToast();
  const toast = () =>
    show({
      text: long ? t('errors.ai_not_configured') : t('link_ready.copied'),
      icon: icon ? check : undefined,
      action: action
        ? { label: t('link_ready.share'), onClick: () => {} }
        : undefined,
    });
  useEffect(toast, []);
  return (
    <Button variant="tonal" onClick={toast}>
      {t('link_ready.copied')}
    </Button>
  );
}

const meta = {
  title: 'UI/Toast',
  component: Demo,
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

export const Text: Story = {};
export const WithIcon: Story = { args: { icon: true } };
export const WithAction: Story = { args: { icon: true, action: true } };
/** Wraps on narrow screens (iPhone SE). */
export const LongText: Story = {
  args: { long: true, action: true },
  globals: { viewport: { value: 'iphoneSE' } },
};
export const Dark: Story = {
  args: { icon: true, action: true },
  globals: { theme: 'dark' },
};
export const Russian: Story = {
  args: { icon: true, action: true },
  globals: { locale: 'ru' },
};
export const Desktop: Story = {
  args: { icon: true, action: true },
  globals: { viewport: { value: 'desktop' } },
};
