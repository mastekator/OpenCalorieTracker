import type { Meta, StoryObj } from '@storybook/react-vite';
import { Delayed, Skeleton } from './Skeleton';

// The shape of a list of meals: a thumbnail, two lines, a number.
function MealRows() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <Skeleton
            width="var(--control-height-lg)"
            height="var(--control-height-lg)"
          />
          <div style={{ flex: 1, display: 'grid', gap: 'var(--space-2)' }}>
            <Skeleton
              width="70%"
              height="var(--text-body-size)"
              radius="var(--radius-sm)"
            />
            <Skeleton
              width="40%"
              height="var(--text-footnote-size)"
              radius="var(--radius-sm)"
            />
          </div>
          <Skeleton
            width="var(--space-12)"
            height="var(--text-body-size)"
            radius="var(--radius-sm)"
          />
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Block: Story = {};
export const Circle: Story = {
  args: {
    width: 'var(--camera-button-size)',
    height: 'var(--camera-button-size)',
    radius: 'var(--radius-full)',
  },
};
export const Rows: Story = { render: () => <MealRows /> };
/** Nothing for 300 ms, then the skeleton (reload the story to see the delay). */
export const DelayedRows: Story = {
  render: () => (
    <Delayed>
      <MealRows />
    </Delayed>
  ),
};
export const Desktop: Story = {
  render: () => <MealRows />,
  globals: { viewport: { value: 'desktop' } },
};
