import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { VersionCard } from './VersionCard';

const meta = {
  title: 'Sync/VersionCard',
  component: VersionCard,
  args: {
    side: 'this',
    editedAt: Date.UTC(2026, 10, 12, 19, 55),
    kcal: 712,
    rows: [
      { key: 'type', field: true, label: 'Meal', value: 'Dinner' },
      { key: 'd0', label: 'Chicken soup', value: '400 g · 320 kcal' },
      {
        key: 'd1',
        label: 'Sour cream sauce',
        value: '40 g · 92 kcal',
        note: 'only',
      },
      { key: 'd2', label: 'Tea with lemon', value: '—', note: 'missing' },
    ],
    unchanged: [
      { key: 'd3', label: 'Rye bread', value: '60 g · 150 kcal' },
      { key: 'd4', label: 'Butter', value: '10 g · 75 kcal' },
    ],
    onKeep: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VersionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThisDevice: Story = {};
export const ThisDeviceDark: Story = { globals: { theme: 'dark' } };
export const ThisDesktop: Story = { args: { desktop: true } };
/** The other device, changed while the screen was open (2.4). */
export const OtherUpdated: Story = { args: { side: 'other', updated: true } };
export const OtherUpdatedDark: Story = {
  args: { side: 'other', updated: true },
  globals: { theme: 'dark' },
};
/** Only the total differs: no rows, everything folded. */
export const AllUnchanged: Story = { args: { rows: [] } };
