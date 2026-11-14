import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RecognitionState } from './RecognitionState';

// No API in Storybook: the photo shows its surface-2 placeholder.
const meta = {
  title: 'Meals/RecognitionState',
  component: RecognitionState,
  args: {
    state: 'loading',
    photoUrl: '/api/photos/demo',
    onRetry: fn(),
    onRetake: fn(),
    onManual: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof RecognitionState>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 3.1 */
export const Loading: Story = {};
export const LoadingDark: Story = { globals: dark };
/** 3.2 after 10 s */
export const Slow: Story = { args: { state: 'slow' } };
export const SlowDark: Story = { args: { state: 'slow' }, globals: dark };
/** 3.3 */
export const Unavailable: Story = { args: { state: 'unavailable' } };
export const UnavailableDark: Story = {
  args: { state: 'unavailable' },
  globals: dark,
};
/** 3.4 */
export const Quota: Story = { args: { state: 'quota' } };
export const QuotaDark: Story = { args: { state: 'quota' }, globals: dark };
/** 3.5 */
export const Failed: Story = { args: { state: 'failed' } };
export const FailedDark: Story = { args: { state: 'failed' }, globals: dark };
/** 3.5 without «Try again»: the photo is gone or expired. */
export const Gone: Story = { args: { state: 'gone' } };
export const GoneDark: Story = { args: { state: 'gone' }, globals: dark };
/** 3.6 */
export const Empty: Story = { args: { state: 'empty' } };
export const EmptyDark: Story = { args: { state: 'empty' }, globals: dark };
/** 3.7 */
export const Offline: Story = { args: { state: 'offline' } };
export const OfflineDark: Story = { args: { state: 'offline' }, globals: dark };
export const Russian: Story = {
  args: { state: 'slow' },
  globals: { locale: 'ru' },
};
export const Desktop: Story = {
  args: { state: 'failed' },
  globals: { viewport: { value: 'desktop' } },
};
