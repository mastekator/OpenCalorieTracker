import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import {
  lbToKg,
  type ProfileResponse,
  type Units,
  type Weighing,
} from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { EMPTY_PROFILE } from '../../data/DataContext';
import { WeighInSheet } from './WeighInSheet';

const TODAY = '2026-11-16';
const DIARY: Weighing[] = [
  { date: '2026-11-12', weightKg: 80.6 },
  { date: '2026-11-14', weightKg: 79.8 },
];

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

async function setup({
  weighings = DIARY,
  units = 'metric' as Units,
  profile = EMPTY_PROFILE,
  edit,
}: {
  weighings?: Weighing[];
  units?: Units;
  profile?: ProfileResponse;
  edit?: string;
} = {}) {
  const calls: string[] = [];
  const onPut = vi.fn(async (date: string, kg: number) => {
    calls.push(`put ${date} ${kg}`);
  });
  const onDelete = vi.fn(async (date: string) => {
    calls.push(`delete ${date}`);
  });
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <WeighInSheet
        open={open}
        onClose={() => setOpen(false)}
        today={TODAY}
        units={units}
        weighings={weighings}
        profile={profile}
        edit={edit}
        onPut={onPut}
        onDelete={onDelete}
      />
    );
  }
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onPut, onDelete, calls };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const sheetOpen = () => screen.queryByRole('heading', { level: 2 }) !== null;
const dialog = () => screen.queryByRole('alertdialog');
// Numbers and units are joined by a no-break space.
const dialogText = () => dialog()?.textContent?.replace(/\u00a0/g, ' ');
const save = () => act(async () => fireEvent.click(button('Save')));
function type(text: string) {
  fireEvent.click(button(/Enter weight with the keyboard$/));
  fireEvent.change(screen.getByRole('textbox', { name: 'Weight' }), {
    target: { value: text },
  });
}

describe('WeighInSheet: log a weighing (OCT-189 §2)', () => {
  it('starts from the latest weighing, steps 0.1 and saves today in 3 taps', async () => {
    const { onPut } = await setup();
    expect(screen.getByRole('heading', { name: 'Log weight' })).toBeTruthy();
    const ruler = screen.getByRole('slider', { name: 'Weight' });
    expect(ruler.getAttribute('aria-valuenow')).toBe('79.8');
    fireEvent.click(button(/^More by 0\.1\skg$/));
    await save();
    expect(onPut).toHaveBeenCalledWith(TODAY, 79.9);
    expect(sheetOpen()).toBe(false);
    expect(await screen.findByText('Logged 79.9 kg')).toBeTruthy();
  });

  it('names the new norm in the toast only when it changed (AC-9.7)', async () => {
    const profile: ProfileResponse = {
      ...EMPTY_PROFILE,
      profile: {
        sex: 'male',
        birthDate: '1990-01-01',
        heightCm: 180,
        weightKg: 79.8,
        activity: 'light',
        goal: 'maintain',
        targetWeightKg: null,
        deadline: null,
      },
    };
    await setup({ profile });
    type('82');
    await save();
    expect(
      await screen.findByText(/^Logged 82\.0 kg · target [\d,]+ kcal$/),
    ).toBeTruthy();
    cleanup();
    // 0.1 kg moves the norm by less than its rounding: no norm in the toast.
    await setup({ profile });
    fireEvent.click(button(/^More by 0\.1\skg$/));
    await save();
    expect(await screen.findByText('Logged 79.9 kg')).toBeTruthy();
  });

  it('replaces the day already logged, with a note before saving (AC-9.1)', async () => {
    const { onPut } = await setup({
      weighings: [...DIARY, { date: TODAY, weightKg: 79.5 }],
    });
    expect(
      screen.getByText(
        'You already logged 79.5 kg for Nov 16. Saving will replace it.',
      ),
    ).toBeTruthy();
    await save();
    expect(onPut).toHaveBeenCalledWith(TODAY, 79.5);
  });

  it('a back-dated weighing: title and toast name the day, not the norm', async () => {
    const { onPut } = await setup();
    fireEvent.click(button(/^Date/));
    fireEvent.click(button('November 15, 2026'));
    expect(button(/November 17, 2026/).hasAttribute('disabled')).toBe(true);
    fireEvent.click(button('Done'));
    expect(
      screen.getByRole('heading', { name: 'Weight for Nov 15' }),
    ).toBeTruthy();
    await save();
    expect(onPut).toHaveBeenCalledWith('2026-11-15', 79.8);
    expect(await screen.findByText('Logged weight for Nov 15')).toBeTruthy();
  });

  it('asks about a jump over 5 % from the nearest weighing (AC-9.5)', async () => {
    const { onPut } = await setup();
    type('86,9');
    await save();
    expect(dialogText()).toContain(
      '86.9 kg is 7.1 kg more than on Nov 14. Is that right?',
    );
    fireEvent.click(button('Edit'));
    expect(dialog()).toBeNull();
    expect(onPut).not.toHaveBeenCalled();
    expect(sheetOpen()).toBe(true);
    await save();
    await act(async () =>
      fireEvent.click(within(dialog()!).getByRole('button', { name: 'Save' })),
    );
    expect(onPut).toHaveBeenCalledWith(TODAY, 86.9);
  });

  it('offers the comma fix for a typo out of range (2.6)', async () => {
    const { onPut } = await setup();
    type('8,02');
    await save();
    expect(dialogText()).toContain('8,02 kg is below 30 kg');
    await act(async () => fireEvent.click(button(/^Yes, 80\.2\skg$/)));
    expect(onPut).toHaveBeenCalledWith(TODAY, 80.2);
  });

  it('without an obvious fix the field turns red and the sheet stays', async () => {
    const { onPut } = await setup();
    type('5');
    await save();
    expect(dialog()).toBeNull();
    const field = screen.getByRole('textbox', { name: 'Weight' });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('30 to 300 kg · comma or dot')).toBeTruthy();
    expect(onPut).not.toHaveBeenCalled();
  });

  it('pounds do not drift: 180 lb saved untouched stays 180 lb (ADR-0014 §2)', async () => {
    const kg = lbToKg(180);
    const { onPut } = await setup({
      units: 'us',
      weighings: [{ date: '2026-11-14', weightKg: kg }],
    });
    expect(
      screen
        .getByRole('slider', { name: 'Weight' })
        .getAttribute('aria-valuenow'),
    ).toBe('180');
    fireEvent.click(button(/^More by 0\.1\slb$/));
    fireEvent.click(button(/^Less by 0\.1\slb$/));
    await save();
    expect(onPut).toHaveBeenCalledWith(TODAY, kg);
  });
});

describe('WeighInSheet: edit a weighing (OCT-189 3.3–3.5)', () => {
  it('deletes at once and «Undo» puts it back (AC-9.6)', async () => {
    const { onPut, onDelete } = await setup({ edit: '2026-11-12' });
    expect(
      screen.getByRole('heading', { name: 'Weigh-in · Nov 12' }),
    ).toBeTruthy();
    await act(async () => fireEvent.click(button('Delete weigh-in')));
    expect(onDelete).toHaveBeenCalledWith('2026-11-12');
    expect(sheetOpen()).toBe(false);
    expect(await screen.findByText('Deleted Nov 12 · 80.6 kg')).toBeTruthy();
    await act(async () => fireEvent.click(button('Undo')));
    expect(onPut).toHaveBeenCalledWith('2026-11-12', 80.6);
  });

  it('moving to a day with a weighing asks to replace it, then delete + put', async () => {
    const { calls } = await setup({ edit: '2026-11-12' });
    fireEvent.click(button(/^Date/));
    fireEvent.click(button(/^November 14, 2026/));
    fireEvent.click(button('Done'));
    await save();
    expect(dialogText()).toContain('There’s already 79.8 kg for Nov 14');
    expect(dialogText()).toContain('Replace it with 80.6 kg?');
    await act(async () => fireEvent.click(button('Replace')));
    expect(calls).toEqual(['delete 2026-11-12', 'put 2026-11-14 80.6']);
  });
});
