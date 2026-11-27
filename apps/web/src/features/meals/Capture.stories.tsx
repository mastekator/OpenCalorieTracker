import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { CaptureMenu } from './CaptureMenu';

type Props = { show: 'menu' | 'open' | 'camera'; aiOff?: boolean };

/** Menu 5.5 and the two capture dialogs (3.8, E-1.3) as CaptureProvider shows them. */
function Demo({ show, aiOff }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  const dialog = show === 'open' ? 'capture.err.open' : 'capture.err.camera';
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('nav.add_food')}
      </Button>
      {show === 'menu' ? (
        <CaptureMenu
          open={open}
          onClose={close}
          onPhoto={close}
          onGallery={close}
          onManual={close}
          aiOff={aiOff}
        />
      ) : (
        <ConfirmDialog
          open={open}
          tone="primary"
          stack={show === 'open'}
          title={t(`${dialog}.title`)}
          body={t(`${dialog}.body`)}
          confirmLabel={t(
            show === 'open' ? 'capture.err.open.cta' : 'capture.gallery',
          )}
          cancelLabel={t('common.close')}
          onConfirm={close}
          onCancel={close}
        />
      )}
    </>
  );
}

const meta = {
  title: 'Meals/Capture',
  component: Demo,
  args: { show: 'menu' },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

export const Menu: Story = {};
export const MenuDark: Story = { globals: dark };
export const MenuRussian: Story = { globals: { locale: 'ru' } };
/** 4.4: «AI on this device» off, the note above «Take photo» (OCT-178). */
export const MenuAiOff: Story = { args: { aiOff: true } };
export const MenuAiOffDark: Story = { args: { aiOff: true }, globals: dark };
export const MenuAiOffRussian: Story = {
  args: { aiOff: true },
  globals: { locale: 'ru' },
};
export const MenuAiOffDesktop: Story = {
  args: { aiOff: true },
  globals: desktop,
};
export const OpenError: Story = { args: { show: 'open' } };
export const OpenErrorDark: Story = { args: { show: 'open' }, globals: dark };
export const OpenErrorDesktop: Story = {
  args: { show: 'open' },
  globals: desktop,
};
export const CameraDenied: Story = { args: { show: 'camera' } };
export const CameraDeniedDark: Story = {
  args: { show: 'camera' },
  globals: dark,
};
