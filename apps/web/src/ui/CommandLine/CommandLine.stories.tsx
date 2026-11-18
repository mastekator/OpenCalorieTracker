import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandLine } from './CommandLine';

const meta = {
  title: 'UI/CommandLine',
  component: CommandLine,
  args: {
    command: 'docker compose logs opencalorietracker | grep "Setup code"',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CommandLine>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
/** Narrow screen: wraps at spaces, the button stays on the right. */
export const Narrow: Story = {
  globals: { viewport: { value: 'iphoneSE' } },
  args: {
    command:
      'docker compose exec opencalorietracker node dist/cli.js reset-admin-access',
  },
};
