import type { Meta, StoryObj } from '@storybook/react-vite';
import { atPath } from '../ui/navStory';
import { AppShell } from './AppShell';
import { AppScreens } from './routes';
import type { MeResponse } from '@oct/shared';
import { DataProvider } from '../data/DataContext';
import { SessionContext } from './SessionContext';

// shortcut: partial user, enough for the shell and a local IndexedDB; a full fixture when stories read more of it.
const user = {
  id: 1,
  email: 'anna@example.com',
  units: 'metric',
  methods: [] as MeResponse['methods'],
} as MeResponse;

/** The signed-in layout with placeholder screens; check it at 390 and at 1280 (desktop). */
const meta = {
  title: 'App/AppShell',
  component: AppShell,
  decorators: [
    atPath,
    // No server in Storybook: the profile screen shows its load error inside the shell.
    (Story) => (
      <SessionContext value={{ user, refresh: async () => {} }}>
        <DataProvider user={user}>
          <Story />
        </DataProvider>
      </SessionContext>
    ),
  ],
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

/** Forces navigator.onLine off: the bar above the title (OCT-25 3.1, §7). */
const offline = () => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => false,
  });
  return () => void delete (navigator as { onLine?: boolean }).onLine;
};
export const Offline: Story = {
  parameters: { path: '/profile' },
  beforeEach: offline,
};
export const OfflineDesktop: Story = { ...Offline, globals: desktop };
