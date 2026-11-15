import type { Meta, StoryObj } from '@storybook/react-vite';
import { ILLUSTRATION_IDS } from '@oct/shared';
import { DishIllustration } from './DishIllustration';

const meta = {
  title: 'UI/DishIllustration',
  component: DishIllustration,
  args: { id: 'soup-borscht' },
  argTypes: { id: { control: 'select', options: ILLUSTRATION_IDS } },
} satisfies Meta<typeof DishIllustration>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The sizes in use: meal row 44, dish row 40, picker 64, history hint 28. */
export const Sizes: Story = {
  render: (args) => (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
    >
      {[
        'var(--meal-thumb-size)',
        'var(--dish-illo-size)',
        'var(--illo-pick-size)',
        'var(--chat-avatar-size)',
      ].map((size) => (
        <DishIllustration key={size} {...args} size={size} />
      ))}
    </div>
  ),
};

/** The whole set, in picker order. */
export const All: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
      {ILLUSTRATION_IDS.map((id) => (
        <DishIllustration key={id} id={id} />
      ))}
    </div>
  ),
};
