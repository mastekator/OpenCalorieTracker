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
  Recipe,
  Recognition,
  RefineRequest,
} from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { MealEditScreen, type RecalcState } from './MealEditScreen';
import { CHEESECAKE, QUESTION_CASES } from './questions.fixtures';

type Call = { body: RefineRequest; settle: (r: Response) => void };
let calls: Call[];
let online: boolean;

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  calls = [];
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/ai/refine')
        return new Promise<Response>((resolve) =>
          calls.push({ body: JSON.parse(String(init?.body)), settle: resolve }),
        );
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup(
  { dishes, questions }: Recognition = QUESTION_CASES.k1,
  recalc?: RecalcState,
  recipes?: Recipe[],
) {
  const onSave = vi.fn(async (input: MealInput) => void input);
  await renderLoaded(
    <I18nProvider>
      <ToastProvider>
        <MealEditScreen
          dishes={dishes}
          questions={questions}
          photoId="p1"
          units="metric"
          recognition="ready"
          recalc={recalc}
          recipes={recipes}
          onSave={onSave}
          onClose={() => {}}
          now={() => new Date(2026, 10, 15, 13, 24)}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onSave };
}

// The meal type is a radiogroup too.
const groups = () =>
  screen.queryAllByRole('radiogroup', { name: /^Not sure:/ });
const group = (name: string) => screen.getByRole('radiogroup', { name });
const chip = (g: HTMLElement, name: string | RegExp) =>
  within(g).getByRole('radio', { name });
const checked = (g: HTMLElement) =>
  within(g)
    .getAllByRole('radio')
    .filter((r) => r.getAttribute('aria-checked') === 'true')
    .map((r) => r.textContent);
const other = (g: HTMLElement) =>
  within(g).getByRole('button', { name: 'Other…' });
const total = () => document.querySelector('.meal-edit__kcal')!.textContent;
const names = () =>
  [...document.querySelectorAll('.dish-row__name')].map((n) => n.textContent);
const refineCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/ai/refine')
    .length;

const SALAD = 'Not sure: What’s the salad dressing?';

describe('AI questions under a dish (OCT-262)', () => {
  it.each([
    ['k1', ['Not sure: What’s the salad dressing?'], ['Mayo'], '1 question'],
    ['k2', ['Not sure: What is this?'], ['Sweet potato'], '1 question'],
    ['k3', ['Not sure: Which cheesecake?'], ['Classic'], '1 question'],
    [
      'k4k5',
      ['Not sure: How was it cooked?', 'Not sure: What’s in the coffee?'],
      ['Fried', 'Milk'],
      '2 questions',
    ],
    ['k6', ['Not sure: Made with water or milk?'], ['Water'], '1 question'],
  ] as const)(
    '%s: the question under its dish, the guess checked, the count in the estimate line',
    async (key, labels, guesses, count) => {
      await setup(QUESTION_CASES[key]);
      expect(groups()).toHaveLength(labels.length);
      labels.forEach((label, i) => {
        const g = group(label);
        expect(checked(g)).toEqual([guesses[i]]);
        expect(chip(g, `${guesses[i]}, AI guess`)).toBeTruthy();
        expect(other(g)).toBeTruthy();
      });
      expect(document.querySelector('.meal-edit__estimate')!.textContent).toBe(
        `AI estimate · ${count} below`,
      );
    },
  );

  it('K4/K5: each question sits in its own dish row, none under the buckwheat', async () => {
    await setup(QUESTION_CASES.k4k5);
    const rows = [...document.querySelectorAll('.meal-edit__list > li')];
    expect(rows.map((r) => !!r.querySelector('[role=radiogroup]'))).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('a tap answers offline, no request: values, mark, total shift, «Answer applied», Undo', async () => {
    online = false;
    await setup();
    expect(total()).toContain('458');
    fireEvent.click(chip(group(SALAD), 'Yogurt'));
    expect(names()).toEqual(['Vegetable salad with yogurt', 'Grilled chicken']);
    expect(total()).toContain('308');
    expect(screen.getByText('−150')).toBeTruthy();
    expect(screen.getByText('changed')).toBeTruthy();
    expect(screen.getByText('was Vegetable salad with mayo')).toBeTruthy();
    expect(screen.getByText('Answer applied')).toBeTruthy();
    expect(checked(group(SALAD))).toEqual(['Yogurt']);
    // Answered: the estimate line no longer counts it.
    expect(
      document.querySelector('.meal-edit__estimate')!.textContent,
    ).not.toContain('question');
    expect(refineCalls()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(names()[0]).toBe('Vegetable salad with mayo');
    expect(checked(group(SALAD))).toEqual(['Mayo']);
    // The bar is gone: focus goes to the restored option, not <body>.
    expect(document.activeElement?.textContent).toBe('Mayo');
    expect(total()).toContain('458');
  });

  it('the answer can be switched before saving; it is saved as a corrected AI dish', async () => {
    const { onSave } = await setup();
    fireEvent.click(chip(group(SALAD), 'Yogurt'));
    fireEvent.click(chip(group(SALAD), 'No dressing'));
    expect(names()[0]).toBe('Vegetable salad');
    expect(screen.getByText('was Vegetable salad with yogurt')).toBeTruthy();
    // The checked chip again changes nothing.
    fireEvent.click(chip(group(SALAD), 'No dressing'));
    expect(screen.getByText('was Vegetable salad with yogurt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [salad] = onSave.mock.calls[0]![0].items;
    expect(salad).toEqual({
      name: 'Vegetable salad',
      grams: 250,
      kcal: 50,
      proteinG: 3,
      fatG: 0,
      carbsG: 9,
      source: 'ai',
    });
  });

  it('arrows move between the options and answer', async () => {
    await setup(QUESTION_CASES.k2);
    const g = group('Not sure: What is this?');
    fireEvent.keyDown(chip(g, 'Sweet potato, AI guess'), { key: 'ArrowRight' });
    expect(checked(g)).toEqual(['Pumpkin']);
    expect(document.activeElement?.textContent).toBe('Pumpkin');
    expect(names()).toEqual(['Baked pumpkin']);
  });

  it('E-10.b: a weight after the answer scales the chosen option', async () => {
    await setup(QUESTION_CASES.k2);
    fireEvent.click(chip(group('Not sure: What is this?'), 'Pumpkin'));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Weight of Baked pumpkin' }),
      { target: { value: '440' } },
    );
    expect(total()).toContain('114');
  });

  it('E-10.a: deleting or renaming the dish takes its question away', async () => {
    await setup(QUESTION_CASES.k4k5);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Fried chicken patty' }),
    );
    // useSwipeDelete: the tap confirms after the row slides out.
    await waitFor(() =>
      expect(screen.queryByRole('radiogroup', { name: /cooked/ })).toBeNull(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Coffee with milk' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Tea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(groups()).toHaveLength(0);
  });

  it('«Other…» puts «{name}: » into the field and focuses it', async () => {
    await setup(QUESTION_CASES.k3);
    fireEvent.click(other(group('Not sure: Which cheesecake?')));
    const field = screen.getByRole('textbox', { name: 'What should I fix?' });
    expect(field).toHaveProperty('value', 'Classic cheesecake: ');
    expect(document.activeElement).toBe(field);
  });

  it('offline: «Other…» stays focusable but says it needs a connection; the options work', async () => {
    online = false;
    await setup(QUESTION_CASES.k4k5);
    const g = group('Not sure: How was it cooked?');
    const button = other(g);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(button.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe('Needs a connection');
    fireEvent.click(button);
    expect(
      screen.getByRole('textbox', { name: 'What should I fix?' }),
    ).toHaveProperty('value', '');
    fireEvent.click(chip(g, 'Baked'));
    expect(names()[0]).toBe('Baked chicken patty');
  });

  it('a refine answer replaces the questions with its own', async () => {
    await setup();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'What should I fix?' }),
      { target: { value: 'and oatmeal' } },
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Refine' }).at(-1)!);
    await waitFor(() => expect(calls).toHaveLength(1));
    const { k6 } = QUESTION_CASES;
    await act(async () =>
      calls[0]!.settle(
        Response.json({
          dishes: [{ ...k6.dishes[0], ref: null }],
          questions: k6.questions,
          left: null,
        }),
      ),
    );
    expect(groups()).toHaveLength(1);
    expect(group('Not sure: Made with water or milk?')).toBeTruthy();
  });

  it('E-10.c: without questions the screen is as before', async () => {
    await setup({ dishes: QUESTION_CASES.k1.dishes, questions: [] });
    expect(groups()).toHaveLength(0);
    expect(
      document.querySelector('.meal-edit__estimate')!.textContent,
    ).toContain('AI estimate — check the weight.');
  });

  it('come back with a recalculation from history.state', async () => {
    const { k2 } = QUESTION_CASES;
    await setup(
      { dishes: [] },
      {
        draft: { rows: [], mealType: 'lunch', when: '2026-11-15T13:24' },
        ...k2,
      },
    );
    expect(group('Not sure: What is this?')).toBeTruthy();
  });
});

describe('a recipe option (ADR-0035 §6, OCT-352 3.x)', () => {
  const CAKE = 'Not sure: Is it your recipe?';

  it('a chip with kcal per 100 g; a tap makes a recipe portion offline, Undo brings the guess back', async () => {
    online = false;
    await setup(QUESTION_CASES.k7, undefined, [CHEESECAKE]);
    const g = group(CAKE);
    expect(chip(g, /My cheesecake/).textContent).toBe(
      'My cheesecake160\u00a0kcal/100\u00a0g',
    );
    fireEvent.click(chip(g, /My cheesecake/));
    expect(names()).toEqual(['My cheesecake']);
    expect(total()).toContain('240');
    expect(screen.getByText('was 480 kcal')).toBeTruthy();
    expect(screen.getByText(/by recipe/)).toBeTruthy();
    expect(refineCalls()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(names()).toEqual(['Cheesecake']);
    expect(total()).toContain('480');
  });

  it('saves the portion with its recipe link', async () => {
    const { onSave } = await setup(QUESTION_CASES.k7, undefined, [CHEESECAKE]);
    fireEvent.click(chip(group(CAKE), /My cheesecake/));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].items[0]).toMatchObject({
      name: 'My cheesecake',
      grams: 150,
      kcal: 240,
      source: 'recipe',
      recipeId: 10,
    });
  });

  it('a deleted recipe hides its option and the question left with one (E-2.b)', async () => {
    await setup(QUESTION_CASES.k7, undefined, []);
    expect(groups()).toHaveLength(0);
    expect(
      document.querySelector('.meal-edit__estimate')!.textContent,
    ).not.toContain('question');
  });
});

describe('gross → edible (ADR-0039 §5)', () => {
  const edible = { grossG: 772, pct: 80, source: 'ref' as const, key: 'k' };
  const fruit = {
    name: 'Sapodilla',
    grams: 617.6,
    kcal: 512.6,
    proteinG: 2.7,
    fatG: 6.8,
    carbsG: 123,
    confidence: 0.8,
  };
  const recognition = (questions?: Recognition['questions']) => ({
    dishes: [{ ...fruit, edible }],
    questions,
  });
  const line = () =>
    document
      .querySelector('.dish-row__edible')
      ?.textContent?.replace(/\s/g, ' ');
  const save = async (onSave: ReturnType<typeof vi.fn>) => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0]![0] as MealInput).items[0]!;
  };

  it('shows the share, sends no edible the user did not choose', async () => {
    const { onSave } = await setup(recognition());
    expect(line()).toBe('772 g with skin → edible 618 g · 80% · USDA');
    const item = await save(onSave);
    expect(item).toMatchObject({ grams: 617.6 });
    expect(item).not.toHaveProperty('edible');
  });

  it('a chosen share is sent; grams by hand unlink, «Restore» relinks', async () => {
    const { onSave } = await setup(
      recognition([
        {
          dish: 0,
          text: 'About how much is edible?',
          guess: 0,
          options: [80, 50].map((pct) => ({
            label: `${pct}%`,
            ...fruit,
            grams: (772 * pct) / 100,
            edible: { ...edible, pct, source: 'ai' as const },
          })),
        },
      ]),
    );
    fireEvent.click(chip(group('Not sure: About how much is edible?'), '50%'));
    expect(line()).toBe('772 g with skin → edible 386 g · 50% · yours');
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Weight of Sapodilla' }),
      { target: { value: '300' } },
    );
    expect(line()).toBe('Weight set by hand · was 772 g with skinRestore');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Restore the edible weight of Sapodilla',
      }),
    );
    expect(line()).toBe('772 g with skin → edible 386 g · 50% · yours');
    expect(await save(onSave)).toMatchObject({
      grams: 386,
      edible: { key: 'k', pct: 50 },
    });
  });

  describe('in the «Dish» sheet (OCT-420 2.x)', () => {
    const sheet = () => within(screen.getByRole('dialog'));
    const open = async () =>
      fireEvent.click(
        await screen.findByRole('button', { name: 'Edit Sapodilla' }),
      );
    const kcal = () =>
      document
        .querySelector('.dish-sheet__kcal')
        ?.textContent?.replace(/\s/g, ' ');
    const done = () =>
      fireEvent.click(sheet().getByRole('button', { name: 'Done' }));

    it('«Whole» recalculates grams and kcal and is sent as 100 %', async () => {
      const { onSave } = await setup(recognition());
      await open();
      expect(kcal()).toBe('513 kcal');
      fireEvent.click(sheet().getByRole('radio', { name: 'Whole' }));
      expect(kcal()).toBe('641 kcal');
      fireEvent.click(sheet().getByRole('radio', { name: 'Peeled' }));
      expect(kcal()).toBe('513 kcal');
      fireEvent.click(sheet().getByRole('radio', { name: 'Whole' }));
      done();
      expect(line()).toBe('772 g whole → edible 772 g · 100% · yours');
      expect(await save(onSave)).toMatchObject({
        grams: 772,
        edible: { key: 'k', pct: 100 },
      });
    });

    it('«Change %» steps by 5, a gross edit keeps the share', async () => {
      const { onSave } = await setup(recognition());
      await open();
      fireEvent.click(
        sheet().getByRole('button', { name: 'Change the percentage, now 80%' }),
      );
      fireEvent.click(sheet().getByRole('button', { name: 'More by 5%' }));
      expect(
        sheet().getByRole('textbox', { name: 'How much is edible' }),
      ).toHaveProperty('value', '85');
      fireEvent.click(sheet().getByRole('button', { name: '50%' }));
      fireEvent.change(
        sheet().getByRole('textbox', { name: 'Weight with skin' }),
        { target: { value: '900' } },
      );
      expect(sheet().getByText('edible · 450 g')).toBeTruthy();
      done();
      expect(line()).toBe('900 g with skin → edible 450 g · 50% · yours');
      expect(await save(onSave)).toMatchObject({
        grams: 450,
        edible: { key: 'k', pct: 50 },
      });
    });

    it('a share out of 10–100 shows the error and keeps the previous one', async () => {
      const { onSave } = await setup(recognition());
      await open();
      fireEvent.click(
        sheet().getByRole('button', { name: 'Change the percentage, now 80%' }),
      );
      const pct = sheet().getByRole('textbox', { name: 'How much is edible' });
      fireEvent.change(pct, { target: { value: '110' } });
      expect(sheet().getByText('10–100%')).toBeTruthy();
      // OCT-504: only the field and its error until fixed.
      expect(sheet().queryByText(/^edible · /)).toBeNull();
      done();
      const item = await save(onSave);
      expect(item).toMatchObject({ grams: 617.6 });
      expect(item).not.toHaveProperty('edible');
    });

    it('edible under 1 g says why «Done» does nothing (OCT-479)', async () => {
      await setup(recognition());
      await open();
      fireEvent.change(
        sheet().getByRole('textbox', { name: 'Weight with skin' }),
        { target: { value: '1' } },
      );
      expect(sheet().getByRole('alert').textContent).toBe(
        'Under 1 g edible: raise the weight or %',
      );
      expect(sheet().getByText('< 1 g')).toBeTruthy();
      done();
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('a renamed dish goes without the old share (OCT-479)', async () => {
      const { onSave } = await setup(recognition());
      await open();
      fireEvent.click(sheet().getByRole('radio', { name: 'Whole' }));
      fireEvent.change(sheet().getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Apple' },
      });
      done();
      const item = await save(onSave);
      expect(item).toMatchObject({ name: 'Apple', grams: 772 });
      expect(item).not.toHaveProperty('edible');
    });

    it('«Close» drops the choice', async () => {
      const { onSave } = await setup(recognition());
      await open();
      fireEvent.click(sheet().getByRole('radio', { name: 'Whole' }));
      fireEvent.click(sheet().getByRole('button', { name: 'Close' }));
      expect(line()).toBe('772 g with skin → edible 618 g · 80% · USDA');
      expect(await save(onSave)).not.toHaveProperty('edible');
    });

    it('grams by hand show «Weight set by hand», «Restore» relinks', async () => {
      const { onSave } = await setup(recognition());
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Weight of Sapodilla' }),
        { target: { value: '300' } },
      );
      await open();
      expect(sheet().queryByRole('radio', { name: 'Whole' })).toBeNull();
      fireEvent.click(
        sheet().getByRole('button', {
          name: 'Restore the edible weight of Sapodilla',
        }),
      );
      fireEvent.click(sheet().getByRole('radio', { name: 'Whole' }));
      done();
      expect(await save(onSave)).toMatchObject({
        grams: 772,
        edible: { key: 'k', pct: 100 },
      });
    });
  });

  it('a dish unlinked at save goes without edible', async () => {
    const { onSave } = await setup(recognition());
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Weight of Sapodilla' }),
      { target: { value: '300' } },
    );
    const item = await save(onSave);
    expect(item).toMatchObject({ grams: 300 });
    expect(item).not.toHaveProperty('edible');
  });
});
