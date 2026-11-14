import type { Meta, StoryObj } from '@storybook/react-vite';
import { atPath } from '../ui/navStory';
import { AppShell } from './AppShell';
import { AppScreens } from './routes';

/** The signed-in layout with placeholder screens; check it at 390 and at 1280 (desktop). */
const meta = {
  title: 'App/AppShell',
  component: AppShell,
  decorators: [atPath],
  render: (args) => (
    <AppShell {...args}>
      <AppScreens />
    </AppShell>
  ),
  args: { email: 'anna@example.com', children: null },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: 'desktop' } };

export const Today: Story = {};
export const Profile: Story = { parameters: { path: '/profile' } };
export const Settings: Story = { parameters: { path: '/settings' } };
export const TodayDesktop: Story = { globals: desktop };
export const ProfileDesktop: Story = {
  parameters: { path: '/profile' },
  globals: desktop,
};
export const SettingsDesktop: Story = {
  parameters: { path: '/settings' },
  globals: desktop,
};
