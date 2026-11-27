import type { Meta, StoryObj } from '@storybook/react-vite';
import { AWARDS } from '@oct/shared';
import { Medal, type MedalState } from './Medal';

const STATES: MedalState[] = ['got', 'locked', 'secret'];

/** All award medals (OCT-184) in every state; size per story. Theme: toolbar; Light and Dark pin it. */
const meta = {
  title: 'UI/Medal',
  component: Medal,
  args: { awardKey: 'weeks_1', state: 'got', size: 'md' },
  render: ({ size }) => (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      {STATES.map((state) => (
        <div
          key={state}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
        >
          {AWARDS.filter(
            (a) => state !== 'secret' || a.category === 'secret',
          ).map((a) => (
            <Medal
              key={a.key}
              awardKey={a.key}
              state={state}
              size={size}
              label={`${a.key} (${state})`}
            />
          ))}
        </div>
      ))}
    </div>
  ),
} satisfies Meta<typeof Medal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = { globals: { theme: 'light' } };
export const MediumDark: Story = { globals: { theme: 'dark' } };
export const Small: Story = {
  args: { size: 'sm' },
  globals: { theme: 'light' },
};
export const SmallDark: Story = {
  args: { size: 'sm' },
  globals: { theme: 'dark' },
};
export const Large: Story = {
  args: { size: 'lg' },
  globals: { theme: 'light' },
};
export const LargeDark: Story = {
  args: { size: 'lg' },
  globals: { theme: 'dark' },
};
