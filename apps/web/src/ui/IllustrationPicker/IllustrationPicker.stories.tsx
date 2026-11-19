import { useState } from 'react';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { IllustrationId } from '@oct/shared';
import { Button } from '../Button/Button';
import { IllustrationPicker } from './IllustrationPicker';

type Props = {
  name: string;
  current: IllustrationId;
  manual: boolean;
  photo: boolean;
};

// Opens on load; a pick marks the tile and closes, the button reopens it.
function Demo({ name, current, manual, photo }: Props) {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState(current);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {name}
      </Button>
      <IllustrationPicker
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        current={picked}
        manual={manual}
        onPick={(id) => {
          setPicked(id);
          setOpen(false);
        }}
        onReset={() => setOpen(false)}
        {...(photo && { onCamera: fn(), onGallery: fn() })}
      />
    </>
  );
}

const meta = {
  title: 'UI/IllustrationPicker',
  component: Demo,
  args: { name: 'Борщ', current: 'soup-borscht', manual: false, photo: true },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 4.1: matched by name, opens scrolled to the current tile. */
export const Automatic: Story = { globals: { locale: 'ru' } };
export const AutomaticDark: Story = {
  globals: { locale: 'ru', theme: 'dark' },
};
/** 4.2: picked by hand — «Restore automatic». */
export const Manual: Story = {
  args: { name: 'Шарлотка', current: 'fruit', manual: true },
  globals: { locale: 'ru' },
};
export const ManualDark: Story = {
  ...Manual,
  globals: { locale: 'ru', theme: 'dark' },
};
/** The meal has a photo: no photo actions (AC-4.3). */
export const WithPhoto: Story = {
  args: { name: 'Rice', current: 'grains', photo: false },
};
export const English: Story = {
  args: { name: 'Borscht', current: 'soup-borscht' },
};
export const NarrowManual: Story = {
  ...Manual,
  globals: { locale: 'ru', viewport: { value: 'iphoneSE' } },
};
/** D.1: a dialog with 5 columns and one «Choose file». */
export const Desktop: Story = {
  globals: { locale: 'ru', viewport: { value: 'desktop' } },
};
export const DesktopDark: Story = {
  globals: { locale: 'ru', theme: 'dark', viewport: { value: 'desktop' } },
};
