import type { Meta, StoryObj } from '@storybook/react-vite';
import { IntegrationStatus } from './IntegrationStatus';

/** OCT-313 §4: the four states of an integration. */
const meta = {
  title: 'Settings/IntegrationStatus',
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <IntegrationStatus state="off" />
      <IntegrationStatus state="on" />
      <IntegrationStatus state="error" />
      <IntegrationStatus state="blocked" />
    </div>
  ),
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {};
export const StatesDark: Story = { globals: { theme: 'dark' } };
