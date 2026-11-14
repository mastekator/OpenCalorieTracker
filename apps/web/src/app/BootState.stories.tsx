import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApiError } from '../api/client';
import { BootState } from './BootState';

const meta = {
  title: 'App/BootState',
  component: BootState,
  args: { error: null, onRetry: () => {} },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BootState>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing for 300 ms, then the skeleton. */
export const Loading: Story = {};
/** 3.4: no network and no local copy on this device; retries by itself when back online. */
export const FirstRunOffline: Story = {
  args: { error: new ApiError(0, 'network') },
};
export const FirstRunOfflineDark: Story = {
  ...FirstRunOffline,
  globals: { theme: 'dark' },
};
export const FirstRunOfflineDesktop: Story = {
  ...FirstRunOffline,
  globals: { viewport: { value: 'desktop' } },
};
/** Any other failure. */
export const Error: Story = { args: { error: new ApiError(500, 'internal') } };
export const ErrorDark: Story = { ...Error, globals: { theme: 'dark' } };
