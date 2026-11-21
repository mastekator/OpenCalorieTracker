import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PhotoViewer, ViewerMark } from './PhotoViewer';

/** Server test photos, served by Storybook's staticDirs as /api/photos/<id>. */
const PHOTO = '/api/photos/eggs.jpg';

type Props = { full?: string | null };

function Demo({ full = PHOTO }: Props) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        className="viewer-open"
        style={{ width: 'var(--thumb-size)', height: 'var(--thumb-size)' }}
        aria-label="Open photo full screen"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <img src={PHOTO} alt="" />
        <ViewerMark />
      </button>
      <PhotoViewer
        open={open}
        onClose={() => setOpen(false)}
        preview={PHOTO}
        full={full}
        title="Lunch, today 13:10"
        alt="Meal photo: Lunch, today 13:10"
      />
    </>
  );
}

const meta = {
  title: 'UI/PhotoViewer',
  component: Demo,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** The full photo over the preview; «×», Esc, a tap beside it or a swipe down close. */
export const Full: Story = {};
export const FullDark: Story = { globals: dark };
/** The storage setting deleted the full photo: the preview and why (OCT-429 2.3). */
export const Expired: Story = { args: { full: null } };
export const ExpiredDark: Story = { args: { full: null }, globals: dark };
/** The full photo didn't load: the preview stays, with «Try again» (OCT-429 2.4). */
export const LoadError: Story = { args: { full: '/api/photos/gone' } };
export const LoadErrorDark: Story = {
  args: { full: '/api/photos/gone' },
  globals: dark,
};
export const Russian: Story = { globals: { locale: 'ru' } };
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, ...dark } };
