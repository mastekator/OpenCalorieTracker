import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { gToOz, type DishUnit, type Units } from '@oct/shared';
import { useT } from '../../i18n';
import { WeightStepper } from './WeightStepper';

function Demo({
  grams,
  units,
  unit,
}: {
  grams: number | null;
  units: Units;
  unit?: DishUnit;
}) {
  const { t } = useT();
  const [value, setValue] = useState(grams);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <WeightStepper
        grams={value}
        units={units}
        unit={unit}
        label={t(unit === 'ml' ? 'edit.weight.label_ml' : 'edit.weight.label', {
          dish: unit === 'ml' ? 'Orange juice' : 'Buckwheat',
        })}
        onChange={setValue}
      />
      {/* What the screen receives: grams, or null to disable «Save». */}
      <code style={{ font: 'var(--text-footnote-size) monospace' }}>
        grams = {String(value)}
        {value !== null && units === 'us' && !unit && ` (${gToOz(value)} oz)`}
      </code>
    </div>
  );
}

const meta = {
  title: 'UI/WeightStepper',
  component: Demo,
  args: { grams: 150, units: 'metric' },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Grams: Story = {};
/** «−» is disabled at 1 g. */
export const AtMinimum: Story = { args: { grams: 1 } };
export const AtMaximum: Story = { args: { grams: 5000 } };
/** Empty field: danger border and the range hint; the value is kept. */
export const Invalid: Story = { args: { grams: null } };
export const Ounces: Story = { args: { units: 'us', grams: 283.5 } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const InvalidDark: Story = {
  args: { grams: null },
  globals: { theme: 'dark' },
};
export const Russian: Story = {
  args: { grams: null },
  globals: { locale: 'ru' },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
/** A drink: ml, fl oz in the US system (ADR-0038 §4). */
export const Millilitres: Story = { args: { grams: 500, unit: 'ml' } };
export const MillilitresDark: Story = {
  ...Millilitres,
  globals: { theme: 'dark' },
};
export const FluidOunces: Story = {
  args: { grams: 500, unit: 'ml', units: 'us' },
};
export const FluidOuncesDark: Story = {
  ...FluidOunces,
  globals: { theme: 'dark' },
};
export const MillilitresInvalid: Story = {
  args: { grams: null, unit: 'ml' },
};
