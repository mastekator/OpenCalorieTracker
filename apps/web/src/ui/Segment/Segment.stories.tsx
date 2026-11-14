import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Segment } from './Segment';

// Two options as on the invite screen; a third, long one checks wrapping.
function Demo({ count, initial = 0 }: { count: 2 | 3; initial?: number }) {
  const { t } = useT();
  const options = [
    { value: 'passkey', label: t('reg.method.passkey') },
    { value: 'password', label: t('reg.method.password') },
    { value: 'long', label: t('errors.ai_no_vision') }, // long label: wraps, not cut
  ].slice(0, count);
  const [value, setValue] = useState(options[initial]!.value);
  return (
    <Segment
      label={t('reg.method.title')}
      options={options}
      value={value}
      onChange={setValue}
    />
  );
}

const meta = {
  title: 'UI/Segment',
  component: Demo,
  args: { count: 2 },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoOptions: Story = {};
export const SecondSelected: Story = { args: { initial: 1 } };
export const ThreeOptions: Story = { args: { count: 3 } };
export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
