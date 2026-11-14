import type { Meta, StoryObj } from '@storybook/react-vite';
import { MacroStat } from './MacroStat';

const meta = {
  title: 'UI/MacroStat',
  component: MacroStat,
  args: { macro: 'protein', value: 68, norm: 120, remaining: 52 },
  argTypes: {
    macro: { control: 'inline-radio', options: ['protein', 'fat', 'carbs'] },
    variant: { control: 'inline-radio', options: ['column', 'row'] },
  },
} satisfies Meta<typeof MacroStat>;
export default meta;
type Story = StoryObj<typeof meta>;

const narrow: Story['decorators'] = [
  (Story) => <div style={{ maxWidth: 120 }}>{Story()}</div>,
];

export const Left: Story = { decorators: narrow };
export const Over: Story = {
  args: { macro: 'fat', value: 82, norm: 70, remaining: -12 },
  decorators: narrow,
};
export const NoNorm: Story = {
  args: { norm: null, remaining: null },
  decorators: narrow,
};
export const Row: Story = {
  args: { variant: 'row', value: 92, remaining: undefined },
  decorators: [(Story) => <div style={{ maxWidth: 320 }}>{Story()}</div>],
};

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 'var(--space-3)',
};

/** Columns as on Today (left / over / no norm) and rows as on Week. */
export const Matrix: Story = {
  decorators: [(Story) => <div style={{ maxWidth: 350 }}>{Story()}</div>],
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div style={grid}>
        <MacroStat macro="protein" value={96} norm={120} remaining={24} />
        <MacroStat macro="fat" value={82} norm={70} remaining={-12} />
        <MacroStat macro="carbs" value={232} norm={240} remaining={8} />
      </div>
      <div style={grid}>
        <MacroStat macro="protein" value={68.4} norm={null} />
        <MacroStat macro="fat" value={52} norm={null} />
        <MacroStat macro="carbs" value={141} norm={null} />
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <MacroStat variant="row" macro="protein" value={92} norm={120} />
        <MacroStat variant="row" macro="fat" value={78} norm={70} />
        <MacroStat variant="row" macro="carbs" value={206} norm={null} />
      </div>
    </div>
  ),
};
