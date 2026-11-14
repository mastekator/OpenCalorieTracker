import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RecognitionState } from './RecognitionState';

// Stand-in meal photo; the `Gone` story shows the placeholder a deleted photo leaves.
const photo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 280">' +
    '<rect width="390" height="280" fill="#6b4f3a"/>' +
    '<circle cx="195" cy="140" r="110" fill="#f4f1ea"/>' +
    '<circle cx="160" cy="120" r="45" fill="#e2a03f"/>' +
    '<circle cx="235" cy="125" r="38" fill="#5a8f3d"/>' +
    '<circle cx="195" cy="185" r="35" fill="#c0503a"/></svg>',
)}`;

const meta = {
  title: 'Meals/RecognitionState',
  component: RecognitionState,
  args: {
    state: 'loading',
    photoUrl: photo,
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
export const Gone: Story = {
  args: { state: 'gone', photoUrl: '/api/photos/gone' },
};
export const GoneDark: Story = {
  args: { state: 'gone', photoUrl: '/api/photos/gone' },
  globals: dark,
};
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
