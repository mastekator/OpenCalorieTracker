import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Activity } from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ActivitySheet } from './ActivitySheet';

function Demo({ initial = 'moderate' }: { initial?: Activity | null }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(initial);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('activity.title')}
      </Button>
      <ActivitySheet
        open={open}
        value={value}
        onSelect={(level) => {
          setValue(level);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const meta = { title: 'UI/ActivitySheet', component: Demo } satisfies Meta<
  typeof Demo
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};
/** First visit: nothing chosen yet. */
export const NoneSelected: Story = { args: { initial: null } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
/** ≥ 1024px: centred dialog (D.1). */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
