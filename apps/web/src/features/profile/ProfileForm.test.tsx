import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  calculateNorm,
  type Profile,
  type ProfileRequest,
  type ProfileResponse,
  type Units,
} from '@oct/shared';
import { ApiError } from '../../api/client';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ProfileForm } from './ProfileForm';

const today = '2026-01-01';
// Reference example 1 (product OCT-5 §2.6): 2 760 kcal.
const base: Profile = {
  sex: 'male',
  birthDate: '1996-01-01',
  heightCm: 180,
  weightKg: 80,
  activity: 'moderate',
  goal: 'maintain',
  targetWeightKg: null,
  deadline: null,
};
const response = (profile: Profile): ProfileResponse => ({
  profile,
  manual: null,
  rev: 1,
});
const echo = vi.fn(async (req: ProfileRequest) => ({ ...req, rev: 2 }));

function setup(
  profile: Profile,
  { units = 'metric' as Units, onSave = echo } = {},
) {
  const props = { initial: response(profile), today, onSave };
  const view = render(<ProfileForm {...props} units={units} />, {
    wrapper: I18nProvider,
  });
  return {
    setUnits: (u: Units) => view.rerender(<ProfileForm {...props} units={u} />),
  };
}

const field = (name: string) =>
  screen.findByRole('textbox', { name }) as Promise<HTMLInputElement>;
async function type(name: string, value: string) {
  const input = await field(name);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}
const save = () => screen.getByRole('button', { name: 'Save' });
/** The big number in the norm card. */
const kcal = (n: number) => new Intl.NumberFormat('en').format(n);

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  echo.mockClear();
});

describe('ProfileForm', () => {
  it('previews the norm on every edit, matching reference example 1', async () => {
    setup(base);
    await screen.findByText(kcal(2760));
    expect(screen.getByText('calculated')).toBeTruthy();
    expect((save() as HTMLButtonElement).disabled).toBe(true);

    await type('Weight', '90');
    const next = calculateNorm({ ...base, weightKg: 90 }, today);
    if (next.status !== 'ok') throw new Error(next.status);
    expect(next.kcal).not.toBe(2760);
    await screen.findByText(kcal(next.kcal));
    expect(screen.getByText('not saved')).toBeTruthy();
    expect((save() as HTMLButtonElement).disabled).toBe(false);
  });

  it('asks for the missing fields and saves a partial profile', async () => {
    setup({ ...base, heightCm: null, activity: null });
    await screen.findByText('Add your height and activity to see your goal');
    await type('Weight', '81');
    await act(async () => fireEvent.click(save()));
    expect(echo.mock.calls[0]![0].profile).toMatchObject({
      heightCm: null,
      activity: null,
      weightKg: 81,
    });
    await screen.findByText('Add your height and activity to see your goal');
  });

  it('shows a range error at the field and blocks saving', async () => {
    setup(base);
    await type('Height', '300');
    await screen.findByText('Height: 100 to 250 cm');
    expect((await field('Height')).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Fix height to see your goal')).toBeTruthy();
    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a field the server rejected at the field', async () => {
    const onSave = vi.fn(async () => {
      throw new ApiError(400, 'validation_failed', [
        { path: ['profile', 'weightKg'], code: 'too_big' },
      ]);
    });
    setup(base, { onSave });
    await type('Weight', '82');
    await act(async () => fireEvent.click(save()));
    await screen.findByText('Check the highlighted fields');
    expect((await field('Weight')).getAttribute('aria-invalid')).toBe('true');
    // Editing the field clears the server's error.
    await type('Weight', '83');
    expect(screen.queryByText('Check the highlighted fields')).toBeNull();
  });

  it('keeps 180 lb as 180 lb after saving and reopening (AC-0.4b)', async () => {
    setup(base, { units: 'us' });
    await type('Weight', '180');
    await act(async () => fireEvent.click(save()));
    const stored = echo.mock.calls[0]![0].profile;
    expect(stored.weightKg).toBeCloseTo(81.6466266, 6);
    cleanup();
    setup(stored, { units: 'us' });
    expect((await field('Weight')).value).toBe('180.0');
  });

  it('converts the unsaved height when the units change (E-1.9)', async () => {
    const { setUnits } = setup(base);
    setUnits('us');
    expect((await field('Height, feet')).value).toBe('5');
    expect((await field('Height, inches')).value).toBe('11');

    await type('Height, inches', '10');
    await type('Height, inches', '11');
    setUnits('metric');
    expect((await field('Height')).value).toBe('180');
  });

  it('flags 12 inches', async () => {
    setup(base, { units: 'us' });
    await type('Height, inches', '12');
    await screen.findByText('Height: inches must be 0 to 11');
    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the pace under the goal for a target weight', async () => {
    setup({ ...base, goal: 'lose', targetWeightKg: 75 });
    const goal = await screen.findByRole('radiogroup', { name: 'Goal' });
    expect(within(goal).getByRole('radio', { name: 'Lose' }).ariaChecked).toBe(
      'true',
    );
    await screen.findByText(/≈ 0\.4 kg a week · around/);
    expect(screen.getByLabelText('By date')).toBeTruthy();
  });

  it('offers both paths on the first visit, only the form without AI', async () => {
    const empty = Object.fromEntries(
      Object.keys(base).map((k) => [k, null]),
    ) as unknown as Profile;
    const onAgent = vi.fn();
    const view = render(
      <ProfileForm
        initial={response(empty)}
        units="metric"
        today={today}
        onSave={echo}
        onAgent={onAgent}
      />,
      { wrapper: I18nProvider },
    );
    await screen.findByText('Let’s work out your daily goal');
    fireEvent.click(screen.getByRole('button', { name: /With the assistant/ }));
    expect(onAgent).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Form/ }));
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: 'Male' }),
    );
    expect(screen.queryByText('Let’s work out your daily goal')).toBeNull();

    view.unmount();
    render(
      <ProfileForm
        initial={response(empty)}
        units="metric"
        today={today}
        onSave={echo}
      />,
      { wrapper: I18nProvider },
    );
    await screen.findByText(
      'Fill in the fields below — your goal appears as you type.',
    );
    expect(
      screen.queryByRole('button', { name: /With the assistant/ }),
    ).toBeNull();
  });
});
