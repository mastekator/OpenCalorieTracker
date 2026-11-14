import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { ToastProvider, useToast } from '../Toast/Toast';
import { Sheet } from './Sheet';

type Props = {
  footer?: boolean;
  long?: boolean;
  unsaved?: boolean;
  toast?: boolean;
  full?: boolean;
};

// Opens on load; «Open» reopens it, so focus return is visible after closing.
function Demo({
  footer = true,
  long = false,
  unsaved = false,
  toast = false,
  full = false,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [open, setOpen] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const body = <p>{t('auth.forgot_sheet.body')}</p>;
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('auth.forgot_sheet.title')}
      </Button>
      <Sheet
        open={open}
        full={full}
        title={t('auth.forgot_sheet.title')}
        onClose={() => (unsaved ? setConfirm(true) : setOpen(false))}
        footer={
          footer && (
            <Button
              onClick={() =>
                toast
                  ? showToast({ text: t('link_ready.copied') })
                  : setOpen(false)
              }
            >
              {toast ? t('link_ready.copied') : t('common.got_it')}
            </Button>
          )
        }
      >
        {long
          ? Array.from({ length: 12 }, (_, i) => <div key={i}>{body}</div>)
          : body}
        <ConfirmDialog
          open={confirm}
          title={t('logout.confirm.title')}
          body={t('logout.confirm.body_unsaved')}
          confirmLabel={t('settings.logout')}
          onConfirm={() => {
            setConfirm(false);
            setOpen(false);
          }}
          onCancel={() => setConfirm(false)}
        />
      </Sheet>
    </>
  );
}

const meta = {
  title: 'UI/Sheet',
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

export const Default: Story = {};
export const WithoutFooter: Story = { args: { footer: false } };
/** Content scrolls, the header and the footer stay. */
export const LongContent: Story = { args: { long: true } };
/** Close (×, Esc, scrim, swipe) asks for confirmation first. */
export const UnsavedConfirm: Story = { args: { unsaved: true } };
/** The footer button shows a toast above the open sheet. */
export const ToastOverSheet: Story = { args: { toast: true } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
/** ≥ 1024px: centred dialog, no handle. */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopLongDark: Story = {
  args: { long: true },
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
/** Full screen on the phone, 88 % high on desktop (chat, OCT-22 §3, D.2). */
export const Full: Story = { args: { full: true } };
export const FullDesktopDark: Story = {
  args: { full: true, long: true },
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
