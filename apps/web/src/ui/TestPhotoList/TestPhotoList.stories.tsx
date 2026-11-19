import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  RUNNING_PHOTOS,
  SET2_PHOTOS,
  STOPPED_PHOTOS,
  TEST_PHOTOS,
} from './fixtures';
import { TestPhotoList } from './TestPhotoList';

/** Per-photo results of a model test, OCT-248 4.2–4.5. */
const meta = {
  title: 'UI/TestPhotoList',
  component: TestPhotoList,
  args: { photos: TEST_PHOTOS },
  decorators: [(Story) => <div style={{ maxWidth: 360 }}>{Story()}</div>],
} satisfies Meta<typeof TestPhotoList>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** Set 1: ok, «expected exact», «kcal out of range» from the old result text, empty photo. */
export const Results: Story = {};
export const ResultsDark: Story = { ...dark };
/** The current photo spins, the rest wait. */
export const Running: Story = {
  args: { photos: RUNNING_PHOTOS, running: true },
};
export const RunningDark: Story = { ...Running, ...dark };
/** Provider error on the first photo, the rest not run. */
export const Stopped: Story = { args: { photos: STOPPED_PHOTOS } };
export const StoppedDark: Story = { ...Stopped, ...dark };
/** Set 2: every reason in a red line, counts and kcal/100 g in «Expected»; the worst case wraps on a phone. */
export const Reasons: Story = { args: { photos: SET2_PHOTOS } };
export const ReasonsDark: Story = { ...Reasons, ...dark };
