import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  MealInput,
  RecognitionStatus,
  RecognizedDish,
  RefineRequest,
} from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { useLocation } from 'wouter';
import { LeaveGuard } from '../../app/LeaveGuard';
import { ToastProvider } from '../../ui/Toast/Toast';
import { MealEditScreen } from './MealEditScreen';
import { MEAL_EDIT_PATH, SLOW_MS } from './RecognitionScreen';

const noodles: RecognizedDish = {
  name: 'Mie goreng',
  grams: 300,
  kcal: 510,
  proteinG: 14,
  fatG: 21,
  carbsG: 66,
  confidence: 0.6,
};
const egg: RecognizedDish = {
  name: 'Fried egg',
  grams: 50,
  kcal: 98,
  proteinG: 7,
  fatG: 8,
  carbsG: 0,
  confidence: 0.98,
};
const chicken: RecognizedDish = {
  name: 'Chicken',
  grams: 80,
  kcal: 150,
  proteinG: 20,
  fatG: 8,
  carbsG: 0,
  confidence: 0.6,
};

type Call = {
  body: RefineRequest;
  settle: (r: Response | Error) => void;
};
let calls: Call[];

/** /api/ai/refine answers by hand; the history hint finds nothing. */
beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/ai/refine')
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal!.reason),
          );
          calls.push({
            body: JSON.parse(String(init?.body)),
            settle: (r) => (r instanceof Error ? reject(r) : resolve(r)),
          });
        });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        dishes?: unknown[];
      };
      return Promise.resolve(
        Response.json((body.dishes ?? []).map(() => null)),
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const answer = (dishes: RecognizedDish[]) =>
  Response.json({ dishes, questions: [], left: null });
const failure = (status: number, code: string) =>
  Response.json({ error: { code } }, { status });

async function setup({
  recognition = 'ready' as RecognitionStatus | undefined,
  photoId = 'p1' as string | undefined,
  dishes = [noodles, egg],
  onSave = vi.fn(async (input: MealInput) => void input),
} = {}) {
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <MealEditScreen
          dishes={dishes}
          photoId={photoId}
          units="metric"
          recognition={recognition}
          onSave={onSave}
          onClose={() => {}}
          now={() => new Date(2026, 10, 15, 13, 24)}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onSave };
}

const field = () => screen.getByRole('textbox', { name: 'What should I fix?' });
const button = (name: string) =>
  screen.queryAllByRole('button', { name }).at(-1) as
    HTMLButtonElement | undefined;
const type = (text: string) =>
  fireEvent.change(field(), { target: { value: text } });
const total = () => document.querySelector('.meal-edit__kcal')!.textContent;
const names = () =>
  [...document.querySelectorAll('.dish-row__name')].map((n) => n.textContent);

/** Types, taps «Refine» and answers the request with `res`. */
async function refine(text: string, res: Response) {
  type(text);
  fireEvent.click(button('Refine')!);
  await waitFor(() => expect(calls).toHaveLength(1));
  await act(async () => calls[0]!.settle(res));
}

describe('«What should I fix?» on the edit screen (OCT-261)', () => {
  it('no field without AI set up (table 6)', async () => {
    await setup({ recognition: 'not_configured' });
    expect(
      screen.queryByRole('textbox', { name: 'What should I fix?' }),
    ).toBeNull();
    expect(button('Recognize again')).toBeUndefined();
  });

  it('a model without vision: no «Recognize again», «Refine» goes as text', async () => {
    await setup({ recognition: 'no_vision' });
    expect(button('Recognize again')).toBeUndefined();
    type('there is chicken');
    fireEvent.click(button('Refine')!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body.photoId).toBeUndefined();
  });

  it('without a photo: the placeholder asks what was eaten, no «Recognize again»', async () => {
    await setup({ photoId: '', dishes: [] });
    expect(field().getAttribute('placeholder')).toContain(
      'What did you eat or what should I fix?',
    );
    expect(button('Recognize again')).toBeUndefined();
  });

  it('offline: the field takes text, the buttons wait, «Needs a connection»', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await setup();
    type('there is chicken');
    expect(screen.getByText('Needs a connection')).toBeTruthy();
    expect(button('Refine')!.disabled).toBe(true);
    expect(button('Recognize again')!.disabled).toBe(true);
  });

  it.each([
    ['Refine', 'Refining…'],
    ['Recognize again', 'Recognizing again…'],
  ])(
    '«%s»: «%s» with the sent text, focus on «Cancel», back to the field after cancel (OCT-282)',
    async (start, busyText) => {
      await setup();
      type('there is chicken');
      fireEvent.click(button(start)!);
      await waitFor(() => expect(calls).toHaveLength(1));
      const busy = document.querySelector<HTMLElement>('.refine__busy')!;
      expect(within(busy).getByText(busyText)).toBeTruthy();
      expect(busy.textContent).toContain('«there is chicken»');
      const cancel = within(busy).getByRole('button', { name: 'Cancel' });
      expect(document.activeElement).toBe(cancel);
      fireEvent.click(cancel);
      await waitFor(() => expect(document.activeElement).toBe(field()));
    },
  );

  it('busy: the list, Save and the buttons are locked; slow after 10 s; «Cancel» drops a late answer (AC-6.2)', async () => {
    await setup();
    type('there is chicken');
    vi.useFakeTimers();
    fireEvent.click(button('Refine')!);
    await act(async () => {});
    expect(calls).toHaveLength(1);
    expect(screen.getByText('Refining…')).toBeTruthy();
    expect(
      document.querySelector('.meal-edit__list')!.hasAttribute('inert'),
    ).toBe(true);
    expect(button('Save')!.disabled).toBe(true);
    expect(button('Recognize again')!.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(screen.getByText('Taking longer than usual…')).toBeTruthy();
    fireEvent.click(
      within(document.querySelector<HTMLElement>('.refine__busy')!).getByRole(
        'button',
        { name: 'Cancel' },
      ),
    );
    vi.useRealTimers();
    await act(async () => calls[0]!.settle(answer([chicken])));
    expect(names()).toEqual(['Mie goreng', 'Fried egg']);
    expect(field()).toHaveProperty('value', 'there is chicken');
    expect(button('Save')!.disabled).toBe(false);
  });

  it.each([
    [503, 'ai_unavailable', 'AI is unavailable right now'],
    [429, 'ai_quota_exceeded', 'AI request limit reached. Try again later'],
    [
      422,
      'ai_invalid_response',
      'Couldn’t refine — try wording it differently',
    ],
    [422, 'ai_empty_result', 'AI removed every dish — the list is unchanged'],
  ])(
    '%i %s: «%s», the list and the text stay (AC-2.8)',
    async (status, code, text) => {
      await setup();
      await refine('there is chicken', failure(status, code));
      expect(screen.getByText(text)).toBeTruthy();
      expect(names()).toEqual(['Mie goreng', 'Fried egg']);
      expect(field()).toHaveProperty('value', 'there is chicken');
      // D.5: the banner goes once the text is edited.
      type('there is chicken, 80 g');
      expect(screen.queryByText(text)).toBeNull();
    },
  );

  it('«Try again» after «AI unavailable» sends the same request with a new requestId', async () => {
    await setup();
    await refine('there is chicken', failure(503, 'ai_unavailable'));
    fireEvent.click(button('Try again')!);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body.text).toBe('there is chicken');
    expect(calls[1]!.body.requestId).not.toBe(calls[0]!.body.requestId);
    expect(calls[1]!.body.sessionId).toBe(calls[0]!.body.sessionId);
  });

  it('«Try again» sends the list as it is now: `ref` points into the current list', async () => {
    await setup();
    await refine('there is chicken', failure(503, 'ai_unavailable'));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Weight of Fried egg' }),
      { target: { value: '60' } },
    );
    fireEvent.click(button('Try again')!);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body.dishes[1]!.grams).toBe(60);
  });

  it('photo_expired: «Recognize again» goes, «The photo is no longer stored»', async () => {
    await setup();
    fireEvent.click(button('Recognize again')!);
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0]!.settle(failure(410, 'photo_expired')));
    expect(button('Recognize again')).toBeUndefined();
    expect(
      screen.getAllByText('The photo is no longer stored').length,
    ).toBeGreaterThan(0);
  });

  it('refine_limit_reached: the buttons wait with «Refinement limit reached», no banner; edits by hand work (ADR-0020 §6)', async () => {
    await setup();
    await refine('there is chicken', failure(429, 'refine_limit_reached'));
    expect(
      screen
        .getByText('Refinement limit reached — edit by hand')
        .closest('[role="status"]'),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    type('one more');
    expect(button('Refine')!.disabled).toBe(true);
    for (const b of screen.getAllByRole('button', { name: 'Recognize again' }))
      expect((b as HTMLButtonElement).disabled).toBe(true);
    const weight = screen.getByRole('textbox', { name: 'Weight of Fried egg' });
    fireEvent.change(weight, { target: { value: '100' } });
    expect(weight).toHaveProperty('value', '100');
    expect(total()).toContain('706');
  });

  it('left: 0 in an answer locks the next request the same way', async () => {
    await setup();
    await refine(
      'there is chicken',
      Response.json({
        dishes: [
          { ...noodles, ref: 'd1' },
          { ...egg, ref: 'd2' },
        ],
        questions: [],
        left: 0,
      }),
    );
    type('one more');
    expect(button('Refine')!.disabled).toBe(true);
    expect(
      screen.getByText('Refinement limit reached — edit by hand'),
    ).toBeTruthy();
  });

  it('«Refine»: marks, kcal shift, «Removed», a cleared field; «Undo» brings back exactly the list before', async () => {
    await setup();
    // A hand edit first: «Undo» must bring it back too (AC-3.3).
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Weight of Fried egg' }),
      {
        target: { value: '100' },
      },
    );
    const before = names();
    const kcalBefore = total();
    await refine(
      'there is chicken',
      answer([
        { ...noodles, grams: 240, kcal: 408, ref: 'd1' },
        { ...chicken, ref: null },
      ]),
    );
    const body = calls[0]!.body;
    expect(body.mode).toBe('refine');
    expect(body.photoId).toBe('p1');
    expect(body.dishes.map((d) => [d.id, d.fixed])).toEqual([
      ['d1', []],
      ['d2', ['grams']],
    ]);
    expect(names()).toEqual(['Mie goreng', 'Chicken']);
    expect(screen.getByText('changed')).toBeTruthy();
    expect(screen.getByText(/^was 300\s+g$/)).toBeTruthy();
    expect(screen.getByText('new')).toBeTruthy();
    expect(screen.getByText('List updated')).toBeTruthy();
    expect(screen.getByText(/Removed: Fried egg/)).toBeTruthy();
    expect(field()).toHaveProperty('value', '');
    fireEvent.click(button('Undo')!);
    expect(names()).toEqual(before);
    expect(document.activeElement).toBe(field());
    expect(total()).toBe(kcalBefore);
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Weight of Fried egg',
        }) as HTMLInputElement
      ).value,
    ).toBe('100');
    expect(screen.queryByText('List updated')).toBeNull();
    expect(screen.queryByText('new')).toBeNull();
  });

  it('a weight edit after the step drops the marks and the strip', async () => {
    await setup();
    await refine(
      'there is chicken',
      answer([
        { ...noodles, ref: 'd1' },
        { ...egg, ref: 'd2' },
        { ...chicken, ref: null },
      ]),
    );
    expect(screen.getByText('new')).toBeTruthy();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Weight of Chicken' }),
      {
        target: { value: '90' },
      },
    );
    expect(screen.queryByText('new')).toBeNull();
    expect(screen.queryByText('List updated')).toBeNull();
  });

  it('«Recognize again» replaces every AI dish, keeps a manual one, sends the hint (AC-1.4, 1.5)', async () => {
    await setup();
    fireEvent.click(button('Add a dish manually')!);
    const enter = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    enter(/^Name/, 'Rye bread');
    enter(/^Weight ·/, '40');
    enter(/^Calories ·/, '100');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(names()).toContain('Rye bread'));
    type('it is pumpkin');
    fireEvent.click(button('Recognize again')!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toMatchObject({
      mode: 'again',
      photoId: 'p1',
      text: 'it is pumpkin',
    });
    await act(async () =>
      calls[0]!.settle(answer([{ ...egg, grams: 60, kcal: 118 }, chicken])),
    );
    expect(names()).toEqual(['Rye bread', 'Fried egg', 'Chicken']);
    expect(screen.getByText(/Removed: Mie goreng/)).toBeTruthy();
  });

  it('Save after «Refine»: the changed dish goes as AI, the text never goes', async () => {
    const { onSave } = await setup();
    await refine(
      'there is chicken',
      answer([
        { ...noodles, grams: 240, kcal: 408, ref: 'd1' },
        { ...egg, ref: 'd2' },
      ]),
    );
    await act(async () => fireEvent.click(button('Save')!));
    const input = onSave.mock.calls[0]![0];
    expect(input.items.map((i) => [i.name, i.grams, i.source])).toEqual([
      ['Mie goreng', 240, 'ai'],
      ['Fried egg', 50, 'ai'],
    ]);
    expect(JSON.stringify(input)).not.toContain('chicken');
  });

  it('E-6.1: leaving while refining, «Save and leave» saves the list before the refinement', async () => {
    function Flow({ onSave }: { onSave: (input: MealInput) => void }) {
      const [path, navigate] = useLocation();
      if (path !== MEAL_EDIT_PATH) return <p>Today page</p>;
      return (
        <MealEditScreen
          dishes={[noodles, egg]}
          photoId="p1"
          units="metric"
          recognition="ready"
          onSave={async (input) => {
            onSave(input);
            navigate('/', { replace: true });
          }}
          onClose={() => navigate('/')}
        />
      );
    }
    history.replaceState(null, '', '/');
    history.pushState(null, '', MEAL_EDIT_PATH);
    const onSave = vi.fn();
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <LeaveGuard>
            <Flow onSave={onSave} />
          </LeaveGuard>
        </ToastProvider>
      </I18nProvider>,
    );
    type('there is chicken');
    fireEvent.click(button('Refine')!);
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(button('Close')!);
    await act(async () => fireEvent.click(button('Save and leave')!));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(
      (onSave.mock.calls[0]![0] as MealInput).items.map((i) => i.name),
    ).toEqual(['Mie goreng', 'Fried egg']);
    // The late answer lands on nothing.
    await act(async () => calls[0]!.settle(answer([chicken])));
    expect(screen.getByText('Today page')).toBeTruthy();
  });
});
