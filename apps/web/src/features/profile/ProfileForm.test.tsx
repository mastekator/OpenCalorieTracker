import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  calculateNorm,
  type ManualNorm,
  type Profile,
  type ProfileRequest,
  type ProfileResponse,
  type Units,
} from '@oct/shared';
import { ApiError } from '../../api/client';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ToastProvider } from '../../ui/Toast/Toast';
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

type Extra = Partial<Parameters<typeof ProfileForm>[0]>;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>
    <ToastProvider>{children}</ToastProvider>
  </I18nProvider>
);

function setup(
  profile: Profile,
  {
    units = 'metric' as Units,
    onSave = echo,
    rev = 1,
    manual = null,
    ...extra
  }: Extra & {
    rev?: number;
    manual?: ManualNorm | null;
  } = {},
) {
  const props = {
    initial: { ...response(profile), manual, rev },
    today,
    onSave,
    ...extra,
  };
  const view = render(<ProfileForm {...props} units={units} />, { wrapper });
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

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  history.replaceState(null, '', '/profile');
});
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

  it('opens «How it’s calculated» over the kept draft and focuses back on return', async () => {
    setup(base);
    await type('Weight', '90');
    const draft = calculateNorm({ ...base, weightKg: 90 }, today);
    if (draft.status !== 'ok') throw new Error(draft.status);
    const how = await screen.findByRole('button', {
      name: /How it’s calculated/,
    });
    act(() => fireEvent.click(how));
    expect(location.search).toBe('?how');
    const title = await screen.findByRole('heading', {
      name: 'How we calculated your goal',
    });
    expect(document.activeElement).toBe(title);
    // The steps explain the draft the card shows (AC-2.4b); the form is out of the way.
    expect(document.body.textContent).toContain(`${kcal(draft.kcal)} kcal`);
    expect(screen.queryByRole('textbox', { name: 'Weight' })).toBeNull();

    act(() => history.back());
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'How we calculated your goal' }),
      ).toBeNull(),
    );
    expect((await field('Weight')).value).toBe('90.0');
    expect(document.activeElement?.textContent).toMatch(/How it’s calculated/);
  });

  it('«How it’s calculated» with a missing field says what to fill in', async () => {
    history.replaceState(null, '', '/profile?how');
    setup({ ...base, heightCm: null });
    await screen.findByText('Fill in height to see the calculation');
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
    await screen.findByText(/≈ 0\.4 kg a week/);
    // The date tail is one unbreakable piece.
    expect(screen.getByText(/^· around/).className).toBe('profile__nowrap');
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

  it('reference 3: «Fast pace», «Move the date» sets the date for 1 % a week', async () => {
    const p3 = {
      ...base,
      weightKg: 90,
      goal: 'lose' as const,
      targetWeightKg: 80,
      deadline: '2026-03-12',
    };
    setup(p3);
    await screen.findByText('Fast pace');
    fireEvent.click(screen.getByRole('button', { name: 'Move the date' }));
    expect(screen.queryByText('Fast pace')).toBeNull();
    await act(async () => fireEvent.click(save()));
    const sent = echo.mock.calls[0]![0].profile;
    expect(sent.deadline).toBe('2026-03-20');
    const next = calculateNorm(sent, today);
    if (next.status !== 'ok') throw new Error(next.status);
    expect(next.pace!.pctPerWeek).toBeLessThanOrEqual(1);
  });

  it('reference 5: dangerous pace, capped at the floor with the real date', async () => {
    setup({
      ...base,
      sex: 'female',
      heightCm: 165,
      weightKg: 60,
      activity: 'minimal',
      goal: 'lose',
      targetWeightKg: 55,
      deadline: '2026-01-22',
    });
    await screen.findByText('This pace may harm your health');
    screen.getByText(/you won’t make it by Jan 22, more likely by Apr 12\./);
  });

  it('gaining capped at gain_fast shows the deadline and the real date (OCT-173)', async () => {
    setup({
      ...base,
      weightKg: 70,
      goal: 'gain',
      targetWeightKg: 75,
      deadline: '2026-02-01',
    });
    await screen.findByText(
      /Gaining this fast adds mostly fat, so your goal is capped: you won’t make it by Feb 1, more likely by Apr 11\./,
    );
    expect(screen.queryByText(/safe minimum/)).toBeNull();
  });

  it('reference 4: TDEE below the floor (AC-2.1b)', async () => {
    setup({
      ...base,
      sex: 'female',
      birthDate: '1966-01-01',
      heightCm: 150,
      weightKg: 45,
      activity: 'minimal',
      goal: 'lose',
    });
    await screen.findByText(/can’t safely lose weight through diet alone/);
  });

  it('warns about an implausible BMI without blocking saving', async () => {
    setup({ ...base, weightKg: 40 });
    await screen.findByText('Check your height and weight');
    await type('Weight', '41');
    expect((save() as HTMLButtonElement).disabled).toBe(false);
  });

  it('under 18: 8.12, the disclaimer stays without a close button', async () => {
    setup(
      { ...base, birthDate: '2010-01-01' },
      { onAgent: vi.fn(), onHideDisclaimer: vi.fn(), disclaimerHidden: true },
    );
    await screen.findByText('This calculation is for adults');
    screen.getByText(/For teenagers, it’s best to set a goal with a doctor/);
    screen.getByText(/This is an estimate, not medical advice/);
    expect(
      screen.queryByRole('button', { name: 'Hide this notice' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Set up with the assistant/ }),
    ).toBeNull();
  });

  it('goal reached: «Switch» saves, «Undo» reverts', async () => {
    const reached = {
      ...base,
      weightKg: 79.5,
      goal: 'lose' as const,
      targetWeightKg: 80,
      deadline: '2026-03-12',
    };
    setup(reached);
    await screen.findByText('You’ve reached 80 kg');
    const keep = calculateNorm({ ...base, weightKg: 79.5 }, today);
    if (keep.status !== 'ok') throw new Error(keep.status);
    screen.getByText(new RegExp(`Your goal will be ${kcal(keep.kcal)} kcal`));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Switch' })),
    );
    expect(echo.mock.calls[0]![0].profile).toMatchObject({
      goal: 'maintain',
      targetWeightKg: null,
      deadline: null,
    });
    const undo = await screen.findByRole('button', { name: 'Undo' });
    await act(async () => fireEvent.click(undo));
    expect(echo.mock.calls[1]![0].profile).toEqual(reached);
  });

  it('goal reached: «Not now» holds for the same profile rev', async () => {
    const reached = {
      ...base,
      weightKg: 79.5,
      goal: 'lose' as const,
      targetWeightKg: 80,
    };
    setup(reached, { rev: 7 });
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('You’ve reached 80 kg')).toBeNull();
    cleanup();
    setup(reached, { rev: 7 });
    await screen.findByText('Daily goal');
    expect(screen.queryByText('You’ve reached 80 kg')).toBeNull();
    cleanup();
    setup(reached, { rev: 8 });
    await screen.findByText('You’ve reached 80 kg');
  });

  it('hides the disclaimer for good and moves focus to the assistant', async () => {
    const onHideDisclaimer = vi.fn();
    setup(base, { onAgent: vi.fn(), onHideDisclaimer });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Hide this notice' }),
    );
    expect(onHideDisclaimer).toHaveBeenCalledOnce();
    expect(screen.queryByText(/not medical advice/)).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /Set up with the assistant/ }),
    );
    // After a reload the account flag keeps it hidden.
    cleanup();
    setup(base, { onHideDisclaimer, disclaimerHidden: true });
    await screen.findByText(kcal(2760));
    expect(screen.queryByText(/not medical advice/)).toBeNull();
  });

  it('no close button on the disclaimer before a norm was ever saved', async () => {
    setup({ ...base, activity: null }, { onHideDisclaimer: vi.fn() });
    await screen.findByText(/not medical advice/);
    expect(
      screen.queryByRole('button', { name: 'Hide this notice' }),
    ).toBeNull();
  });
  it('under 18: «Set manually» turns the switch on and focuses it', async () => {
    setup({ ...base, birthDate: '2010-01-01' });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Set manually' }),
    );
    const toggle = screen.getByRole('switch', { name: 'Set my own goal' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(toggle);
    // No calculation for under-18s: default shares, kcal to fill in.
    expect((await field('Protein')).value).toBe('20');
    expect((await field('Kcal a day')).value).toBe('');
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    await type('Kcal a day', '2200');
    await screen.findByText(kcal(2200));
    expect((save() as HTMLButtonElement).disabled).toBe(false);
  });

  it('«Go to the form» from the chat: filled fields become unsaved edits (OCT-91)', async () => {
    const partial = {
      ...base,
      birthDate: null,
      weightKg: null,
      activity: null,
    };
    const props = {
      initial: response(partial),
      units: 'metric' as Units,
      today,
      onSave: echo,
    };
    const view = render(<ProfileForm {...props} />, { wrapper });
    await type('Height', '175');

    view.rerender(
      <ProfileForm
        {...props}
        agentDraft={{
          profile: {
            ...partial,
            sex: 'female',
            birthDate: '1990-05-01',
            // Not told in the chat: the typed height stays.
            heightCm: null,
            activity: 'light',
            goal: 'lose',
            targetWeightKg: 60,
          },
          at: 1,
        }}
      />,
    );

    expect(
      screen
        .getByRole('radio', { name: 'Female' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect((await field('Height')).value).toBe('175');
    expect(screen.getByDisplayValue('1990-05-01')).toBeTruthy();
    expect(screen.getByText(/^Light/)).toBeTruthy();
    expect((await field('Target weight')).value).toBe('60.0');
    // Unsaved edits (no norm yet without the weight, so no badge on the card).
    expect(document.querySelector('.profile--dirty')).toBeTruthy();
    expect((save() as HTMLButtonElement).disabled).toBe(false);
    // The first empty field gets the focus; nothing is saved.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: /^Weight/ }),
      ),
    );
    expect(echo).not.toHaveBeenCalled();
  });

  it('«Go to the form» with an empty draft still starts the form (OCT-91)', async () => {
    const props = {
      initial: response({ ...base, weightKg: null }),
      units: 'metric' as Units,
      today,
      onSave: echo,
    };
    const view = render(<ProfileForm {...props} />, { wrapper });
    await field('Height');
    view.rerender(
      <ProfileForm {...props} agentDraft={{ profile: null, at: 1 }} />,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: /^Weight/ }),
      ),
    );
    expect(echo).not.toHaveBeenCalled();
  });

  it('8.14: the AI-unavailable banner', async () => {
    setup(base, { onAgent: vi.fn(), agentUnavailable: true });
    expect(
      await screen.findByText('The AI isn’t available right now'),
    ).toBeTruthy();
    expect(
      screen.getByText('Try again later or fill in the form below.'),
    ).toBeTruthy();
  });

  it('the switch starts from the current calculation', async () => {
    setup(base);
    fireEvent.click(await screen.findByRole('switch'));
    expect((await field('Kcal a day')).value).toBe('2760');
    const shares = ['Protein', 'Fat', 'Carbs'].map(async (n) =>
      Number((await field(n)).value),
    );
    const [p, f, c] = await Promise.all(shares);
    expect(p! + f! + c!).toBe(100);
    screen.getByText('not saved');
    // Below the floor: a warning with the disclaimer, saving still allowed (AC-3.3).
    await type('Kcal a day', '1400');
    screen.getByText(/That’s below 1,500 kcal/);
    expect((save() as HTMLButtonElement).disabled).toBe(false);
  });

  it('21/30/44: the dialog fills carbs; «I’ll fix it myself» keeps the input', async () => {
    setup(base);
    fireEvent.click(await screen.findByRole('switch'));
    await type('Kcal a day', '2000');
    await type('Carbs', '44');
    await type('Fat', '30');
    await type('Protein', '21');
    screen.getByText('5% left — we’ll fill it in when you save');
    fireEvent.click(save());
    const dialog = await screen.findByRole('alertdialog');
    within(dialog).getByText('Carbs 44 → 49%');
    within(dialog).getByText(/add the rest to carbs/);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'I’ll fix it myself' }),
    );
    expect(echo).not.toHaveBeenCalled();
    const carbs = await field('Carbs');
    expect(carbs.value).toBe('44');
    expect(document.activeElement).toBe(carbs);

    fireEvent.click(save());
    await act(async () =>
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Fill in and save',
        }),
      ),
    );
    expect(echo.mock.calls[0]![0].manual).toEqual({
      kcal: 2000,
      proteinPct: 21,
      fatPct: 30,
      carbsPct: 49,
    });
    await screen.findByText('set manually');
  });

  it('the rest goes to fat when carbs were edited last', async () => {
    setup(base);
    fireEvent.click(await screen.findByRole('switch'));
    await type('Protein', '20');
    await type('Fat', '30');
    await type('Carbs', '55');
    screen.getByText('5% over — we’ll trim it when you save');
    fireEvent.click(save());
    within(await screen.findByRole('alertdialog')).getByText('Fat 30 → 25%');
  });

  it('a manual goal: «Reset to calculated» saves at once, «Undo» brings it back', async () => {
    const manual = { kcal: 2000, proteinPct: 25, fatPct: 30, carbsPct: 45 };
    setup(base, { manual });
    await screen.findByText('set manually');
    screen.getByText('From your profile: 2,760 kcal');
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Reset to calculated' }),
      ),
    );
    expect(echo.mock.calls[0]![0]).toEqual({ profile: base, manual: null });
    await screen.findByText('Using the calculated goal');
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'false',
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Undo' })),
    );
    expect(echo.mock.calls[1]![0]).toEqual({ profile: base, manual });
    await screen.findByText('set manually');
  });
});
