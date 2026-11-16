import type { Meta, StoryObj } from '@storybook/react-vite';
import { Mark } from './Mark';

/** App mark «Macro peas» (OCT-217). Theme: toolbar; Light and Dark stories pin it. */
const meta = {
  title: 'UI/Mark',
  component: Mark,
  render: () => (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
    >
      {[
        'var(--space-4)',
        'var(--space-8)',
        'var(--control-height-lg)',
        '128px',
      ].map((size) => (
        <div key={size} style={{ width: size, height: size }}>
          <Mark />
        </div>
      ))}
    </div>
  ),
} satisfies Meta<typeof Mark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const System: Story = {};
export const Light: Story = { globals: { theme: 'light' } };
export const Dark: Story = { globals: { theme: 'dark' } };
