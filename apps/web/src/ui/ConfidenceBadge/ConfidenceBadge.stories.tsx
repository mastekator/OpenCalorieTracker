import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfidenceBadge } from './ConfidenceBadge';

const meta = {
  title: 'UI/ConfidenceBadge',
  component: ConfidenceBadge,
  args: { source: 'ai', confidence: 0.97 },
  argTypes: {
    source: { control: 'inline-radio', options: ['ai', 'manual', 'history'] },
    confidence: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
  },
} satisfies Meta<typeof ConfidenceBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Exact: Story = {};
/** No badge on purpose: high confidence is the norm (OCT-16 §3); screen readers still hear it. */
export const High: Story = { args: { confidence: 0.85 } };
export const Medium: Story = { args: { confidence: 0.6 } };
export const Low: Story = { args: { confidence: 0.2 } };
export const Manual: Story = {
  args: { source: 'manual', confidence: undefined },
};
export const History: Story = {
  args: { source: 'history', confidence: undefined },
};

/** Every variant, as in the OCT-16 confidence table. */
export const Matrix: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      <ConfidenceBadge source="ai" confidence={0.97} />
      <ConfidenceBadge source="ai" confidence={0.6} />
      <ConfidenceBadge source="ai" confidence={0.2} />
      <ConfidenceBadge source="manual" />
      <ConfidenceBadge source="history" />
    </div>
  ),
};
export const MatrixDark: Story = { ...Matrix, globals: { theme: 'dark' } };
export const MatrixRussian: Story = { ...Matrix, globals: { locale: 'ru' } };
