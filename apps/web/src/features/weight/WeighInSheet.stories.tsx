import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import { lbToKg, type Weighing } from '@oct/shared';
import { EMPTY_PROFILE } from '../../data/DataContext';
import { Button } from '../../ui/Button/Button';
import { ToastProvider } from '../../ui/Toast/Toast';
import { WeighInSheet } from './WeighInSheet';

const DIARY: Weighing[] = [
  { date: '2026-11-02', weightKg: 81.4 },
  { date: '2026-11-07', weightKg: 80.9 },
  { date: '2026-11-12', weightKg: 80.6 },
  { date: '2026-11-14', weightKg: 79.8 },
];

const PROFILE = {
  ...EMPTY_PROFILE,
  profile: {
    sex: 'male',
    birthDate: '1990-03-10',
    heightCm: 180,
    weightKg: 79.8,
    activity: 'light',
    goal: 'lose',
    targetWeightKg: 73,
    deadline: null,
  },
} satisfies ComponentProps<typeof WeighInSheet>['profile'];

type Args = Pick<
  ComponentProps<typeof WeighInSheet>,
  'units' | 'edit' | 'weighings'
>;

/** Live: saving updates the diary, «Open» brings the sheet back. */
function Demo({ units, edit, weighings }: Args) {
  const [open, setOpen] = useState(true);
  const [diary, setDiary] = useState(weighings);
  return (
    <ToastProvider>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <WeighInSheet
        open={open}
        onClose={() => setOpen(false)}
        today="2026-11-16"
        units={units}
        weighings={diary}
        profile={PROFILE}
        edit={edit}
        onPut={async (date, weightKg) =>
          setDiary((d) => [
            ...d.filter((w) => w.date !== date),
            { date, weightKg },
          ])
        }
        onDelete={async (date) =>
          setDiary((d) => d.filter((w) => w.date !== date))
        }
      />
    </ToastProvider>
  );
}

const meta = {
  title: 'Screens/Weight/WeighInSheet',
  component: Demo,
  args: { units: 'metric', weighings: DIARY },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);

/** 2.1: starts from the latest weighing; drag the ruler or press − / +, then «Save». */
export const New: Story = {};
export const NewDark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
/** 2.3: today is already logged — the note says saving replaces it. */
export const DayLogged: Story = {
  args: { weighings: [...DIARY, { date: '2026-11-16', weightKg: 79.5 }] },
};
const keyboard = async () =>
  fireEvent.click(
    await body().findByRole('button', { name: /keyboard|клавиатуры/ }),
  );
/** Types into the keyboard field and presses «Save». */
const typeAndSave = async (text: string) => {
  const b = body();
  await keyboard();
  fireEvent.change(await b.findByRole('textbox'), { target: { value: text } });
  await b.findByDisplayValue(text);
  fireEvent.click(b.getByRole('button', { name: /^(Save|Сохранить)$/ }));
};

/** 2.2: a tap on the number opens the decimal keyboard, the value selected. */
export const Keyboard: Story = {
  play: async () => {
    await keyboard();
  },
};
/** 2.6: 8,02 is out of range — «Save» offers 80,2. */
export const Typo: Story = { play: () => typeAndSave('8,02') };
/** 2.6: 5 has no obvious fix — the field turns red, the sheet stays. */
export const OutOfRange: Story = { play: () => typeAndSave('5') };
/** 2.5: 86,9 is over 5 % above 14 Nov — «Check the weight». */
export const Jump: Story = { play: () => typeAndSave('86,9') };
/** 2.4: the date row opens the month: dots for weighings, no future days. */
export const Calendar: Story = {
  play: async () => {
    fireEvent.click(
      await body().findByRole('button', { name: /^(Date|Дата)/ }),
    );
  },
};
/** 3.3: «Weigh-in · Nov 12» with «Delete weigh-in» (no confirmation, «Undo» in the toast). */
export const Edit: Story = { args: { edit: '2026-11-12' } };
export const EditDark: Story = {
  args: { edit: '2026-11-12' },
  globals: { theme: 'dark' },
};
/** US units: 180 lb stays 180 lb when saved untouched. */
export const Pounds: Story = {
  args: {
    units: 'us',
    weighings: [{ date: '2026-11-14', weightKg: lbToKg(180) }],
  },
};
/** Desktop: the sheet is a centred dialog. */
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
};
