import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Switch } from './Switch';

function Demo({ initial, disabled }: { initial: boolean; disabled?: boolean }) {
  const { t } = useT();
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      checked={checked}
      onChange={setChecked}
      label={t('manual.toggle')}
      disabled={disabled}
    />
  );
}

const meta = {
  title: 'UI/Switch',
  component: Demo,
  args: { initial: false },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { initial: true } };
/** Offline (8.15). */
export const Disabled: Story = { args: { initial: true, disabled: true } };
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
export const OffDark: Story = { globals: { theme: 'dark' } };
export const OnDark: Story = { ...On, globals: { theme: 'dark' } };
export const DisabledDark: Story = { ...Disabled, globals: { theme: 'dark' } };
