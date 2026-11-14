import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfflineBar } from './OfflineBar';

const meta = {
  title: 'UI/OfflineBar',
  component: OfflineBar,
  args: { variant: 'offline' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OfflineBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 3.1: no network. */
export const Offline: Story = {};
/** 3.2: the network is up, the server doesn't answer (E-2.4). */
export const ServerDown: Story = { args: { variant: 'server' } };
/** 6.2: the server rejected the old version; the app reloaded and asks to save again. */
export const Updated: Story = { args: { variant: 'updated' } };
/** Sign-in screens (OCT-13 1.9): nothing is saved there offline. */
export const NoNetwork: Story = { args: { variant: 'no_network' } };
/** All is well: an empty live region. */
export const Hidden: Story = { args: { variant: null } };
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
};
export const DarkServerDown: Story = {
  args: { variant: 'server' },
  globals: { theme: 'dark' },
};
