import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from './ProgressBar';

const tones = ['accent', 'protein', 'fat', 'carbs'] as const;

const meta = {
  title: 'UI/ProgressBar',
  component: ProgressBar,
  args: { value: 1240, max: 2100, tone: 'accent', label: 'kcal' },
  argTypes: { tone: { control: 'inline-radio', options: tones } },
  decorators: [(Story) => <div style={{ maxWidth: 320 }}>{Story()}</div>],
} satisfies Meta<typeof ProgressBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const UnderNorm: Story = {};
export const Empty: Story = { args: { value: 0 } };
export const AtNorm: Story = { args: { value: 2100 } };
export const Over: Story = { args: { value: 2240 } };

/** Every tone empty, under, at and over the norm. */
export const Matrix: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 320 }}>
      {tones.map((tone) =>
        [0, 60, 100, 130].map((value) => (
          <ProgressBar
            key={`${tone}${value}`}
            tone={tone}
            value={value}
            max={100}
            label={tone}
          />
        )),
      )}
    </div>
  ),
};
