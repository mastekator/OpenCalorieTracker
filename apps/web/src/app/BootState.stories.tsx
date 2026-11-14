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
/** The server could not be reached (offline, server down). */
export const Network: Story = { args: { error: new ApiError(0, 'network') } };
/** Offline first run: no local copy to start from. */
export const NetworkFirstRun: Story = {
  args: {
    error: new ApiError(0, 'network'),
    hint: 'Sign-in needs a connection',
  },
};
/** Any other failure. */
export const Error: Story = { args: { error: new ApiError(500, 'internal') } };
export const Desktop: Story = {
  args: { error: new ApiError(0, 'network') },
  globals: { viewport: { value: 'desktop' } },
};
