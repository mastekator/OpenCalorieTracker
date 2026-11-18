import type { Meta, StoryObj } from '@storybook/react-vite';
import { RUNNING_PHOTOS, STOPPED_PHOTOS, TEST_PHOTOS } from './fixtures';
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

/** ok, «expected exact», «kcal out of range», empty photo. */
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
