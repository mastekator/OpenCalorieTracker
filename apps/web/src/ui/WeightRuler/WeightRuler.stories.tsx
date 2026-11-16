import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Units } from '@oct/shared';
import { useT } from '../../i18n';
import { WeightRuler } from './WeightRuler';

function Demo({ value, units }: { value: number; units: Units }) {
  const { t } = useT();
  const [v, setV] = useState(value);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <WeightRuler
        value={v}
        units={units}
        label={t('field.weight')}
        onChange={setV}
      />
      <code style={{ font: 'var(--text-footnote-size) monospace' }}>
        value = {v}
      </code>
    </div>
  );
}

const meta = {
  title: 'UI/WeightRuler',
  component: Demo,
  args: { value: 80.2, units: 'metric' },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Drag, tap a tick, ↑/↓ or the wheel: ±0.1 a tick. */
export const Kilograms: Story = {};
export const Pounds: Story = { args: { units: 'us', value: 180 } };
/** No ticks below 30 kg. */
export const AtMinimum: Story = { args: { value: 30 } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const RussianDark: Story = {
  globals: { locale: 'ru', theme: 'dark' },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
