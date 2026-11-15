import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PhotoRetentionDays } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { RetentionSheet } from './RetentionSheet';

function Demo({
  initial = 30,
  confirm = false,
}: {
  initial?: PhotoRetentionDays;
  /** The alert of a shorter period that deletes photos. */
  confirm?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(!confirm);
  const [value, setValue] = useState(initial);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('settings.photos.keep')}
      </Button>
      <RetentionSheet
        open={open}
        value={value}
        onSelect={(days) => {
          setValue(days);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
      <ConfirmDialog
        open={confirm}
        title={t('settings.photos.shorten.title', { days: 7 })}
        body={t('settings.photos.shorten.body', { count: 23, days: 7 })}
        confirmLabel={t('settings.photos.shorten.ok')}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </>
  );
}

const meta = { title: 'UI/RetentionSheet', component: Demo } satisfies Meta<
  typeof Demo
>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 30 days, the default. */
export const Default: Story = {};
export const Forever: Story = { args: { initial: null } };
export const DontKeep: Story = { args: { initial: 0 } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
/** A shorter period that deletes photos asks first. */
export const ShortenConfirm: Story = { args: { confirm: true } };
export const ShortenConfirmDark: Story = {
  args: { confirm: true },
  globals: { theme: 'dark' },
};
/** ≥ 1024px: centred dialog (D.1). */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
