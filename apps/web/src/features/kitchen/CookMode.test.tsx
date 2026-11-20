import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { gToOz, ozToG } from '@oct/shared';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { CookDoneSheet, CookMode, useWakeLock, withCookedG } from './CookMode';
import { PILAF } from './fixtures';
import { RecipeView } from './RecipeScreen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

const view = async (props: Partial<Parameters<typeof CookMode>[0]> = {}) => {
  const onExit = vi.fn();
  const onSaveWeight = vi.fn<(cookedG: number) => Promise<void>>(
    async () => {},
  );
  await renderLoaded(
    <I18nProvider>
      <CookMode
        recipe={PILAF}
        online
        awake={false}
        onExit={onExit}
        onSaveWeight={onSaveWeight}
        {...props}
      />
    </I18nProvider>,
  );
  return { onExit, onSaveWeight };
};

const title = () => screen.getByRole('heading', { level: 1 }).textContent;
const key = (k: string, target: Element | Window = window) =>
  fireEvent.keyDown(target, { key: k });

describe('CookMode', () => {
  it('pages with Back / Next; the last step says Done and opens «Done!»', async () => {
    await view();
    expect(title()).toBe('Step 1 of 3');
    expect(
      screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(title()).toBe('Step 3 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(title()).toBe('Step 2 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Done!')).toBeTruthy();
  });

  it('moves focus to the step text on a step change', async () => {
    await view();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(document.activeElement?.textContent).toBe(PILAF.steps[1]!.text);
  });

  it('← / → page, Esc exits', async () => {
    const { onExit } = await view();
    key('ArrowRight');
    expect(title()).toBe('Step 2 of 3');
    key('ArrowLeft');
    key('ArrowLeft'); // stays on the first
    expect(title()).toBe('Step 1 of 3');
    key('Escape');
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('keys are left alone while a sheet is open or in a field', async () => {
    const { onExit } = await view();
    fireEvent.click(screen.getByRole('button', { name: 'All steps' }));
    await screen.findAllByText(/Step \d of 3/);
    key('ArrowRight');
    key('Escape', document.querySelector('dialog')!);
    expect(onExit).not.toHaveBeenCalled();
    expect(title()).toBe('Step 1 of 3');
    // Esc closed only the sheet; in the list a tap goes to that step.
    fireEvent.click(screen.getByRole('button', { name: 'All steps' }));
    // The step being cooked is marked on the row button itself.
    expect(
      screen
        .getByText('Step 1 of 3 · now')
        .closest('button')!
        .getAttribute('aria-current'),
    ).toBe('step');
    fireEvent.click(screen.getByText(PILAF.steps[2]!.text));
    expect(title()).toBe('Step 3 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const field = await screen.findByRole('textbox', { name: 'Cooked weight' });
    key('ArrowLeft', field);
    key('Escape', field);
    expect(title()).toBe('Step 3 of 3');
    expect(onExit).not.toHaveBeenCalled();
  });

  it('a horizontal swipe pages; a vertical move does not', async () => {
    await view();
    const body = screen.getByRole('main');
    const move = (x0: number, y0: number, x1: number, y1: number) => {
      fireEvent.pointerDown(body, {
        pointerType: 'touch',
        clientX: x0,
        clientY: y0,
      });
      fireEvent.pointerUp(body, {
        pointerType: 'touch',
        clientX: x1,
        clientY: y1,
      });
    };
    move(300, 400, 100, 420);
    expect(title()).toBe('Step 2 of 3');
    move(200, 100, 230, 500); // a scroll
    expect(title()).toBe('Step 2 of 3');
    move(100, 400, 300, 400);
    expect(title()).toBe('Step 1 of 3');
  });

  it('the «screen stays on» line only while the lock is held', async () => {
    await view();
    expect(screen.queryByText('Screen stays on while cooking')).toBeNull();
    cleanup();
    await view({ awake: true });
    expect(screen.getByText('Screen stays on while cooking')).toBeTruthy();
  });
});

describe('CookDoneSheet', () => {
  const done = async (props: Parameters<typeof view>[0] = {}) => {
    const spies = await view(props);
    fireEvent.click(screen.getByRole('button', { name: 'All steps' }));
    fireEvent.click(await screen.findByText(PILAF.steps[2]!.text));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const field = await screen.findByRole('textbox', {
      name: 'Cooked weight',
    });
    return { ...spies, field };
  };

  it('saves a refined cooked weight; Just close exits', async () => {
    const { field, onSaveWeight, onExit } = await done();
    expect(screen.queryByRole('button', { name: 'Save weight' })).toBeNull();
    fireEvent.change(field, { target: { value: '2050' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(() => expect(onSaveWeight).toHaveBeenCalledWith(2050));
    fireEvent.click(screen.getByRole('button', { name: 'Just close' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('ounces: shown in oz, untouched is not a change, typed oz save as grams (AC-2.6)', async () => {
    const { field, onSaveWeight } = await done({ units: 'us' });
    expect((field as HTMLInputElement).value).toBe(String(gToOz(2100)));
    fireEvent.change(field, { target: { value: String(gToOz(2100)) } });
    expect(screen.queryByRole('button', { name: 'Save weight' })).toBeNull();
    fireEvent.change(field, { target: { value: '70.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(() => expect(onSaveWeight).toHaveBeenCalledWith(ozToG(70.5)));
  });

  it('0 g is not saved; a weight 3× off warns but saves (E-10.1, E-10.2)', async () => {
    const { field } = await done();
    fireEvent.change(field, { target: { value: '0' } });
    expect(screen.getByText('More than 0 g')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Save weight' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.change(field, { target: { value: '500' } });
    expect(
      screen.getByText(/^Check the weight: cooked is 3× lighter/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Save weight' })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('offline: the weight is read-only and says why', async () => {
    const { field } = await done({ online: false });
    expect(field.hasAttribute('readonly')).toBe(true);
    expect(
      screen.getByText('The weight can be saved when you’re back online.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save weight' })).toBeNull();
  });

  it('a failed save keeps the sheet open', async () => {
    const { field, onExit } = await done({
      onSaveWeight: vi.fn(async () => {
        throw new Error('500');
      }),
    });
    fireEvent.change(field, { target: { value: '2050' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Save weight' })
          .getAttribute('aria-busy'),
      ).toBeNull(),
    );
    expect(screen.getByText('Done!')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('«Log a serving» only with a handler', async () => {
    await done();
    expect(screen.queryByRole('button', { name: 'Log a serving' })).toBeNull();
    cleanup();
    await done({ onLog: () => {} });
    expect(screen.getByRole('button', { name: 'Log a serving' })).toBeTruthy();
  });

  it('«Log a serving» saves an edited weight first', async () => {
    const order: string[] = [];
    const { field } = await done({
      onSaveWeight: vi.fn(async () => void order.push('save')),
      onLog: () => order.push('log'),
    });
    fireEvent.change(field, { target: { value: '1800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log a serving' }));
    await waitFor(() => expect(order).toEqual(['save', 'log']));
  });

  it('a failed save does not open the portion sheet', async () => {
    const onLog = vi.fn();
    const onSaveWeight = vi.fn(async () => {
      throw new Error('500');
    });
    const { field } = await done({ onSaveWeight, onLog });
    fireEvent.change(field, { target: { value: '1800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log a serving' }));
    await waitFor(() => expect(onSaveWeight).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Log a serving' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    expect(onLog).not.toHaveBeenCalled();
  });

  it('offline with an edited weight: logs from the saved one and says so', async () => {
    const onSave = vi.fn(async () => {});
    const onLog = vi.fn();
    const sheet = (online: boolean) => (
      <I18nProvider>
        <CookDoneSheet
          open
          recipe={PILAF}
          online={online}
          onClose={() => {}}
          onExit={() => {}}
          onSave={onSave}
          onLog={onLog}
        />
      </I18nProvider>
    );
    const { rerender } = await renderLoaded(sheet(true));
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Cooked weight' }),
      { target: { value: '1800' } },
    );
    rerender(sheet(false));
    expect(
      screen.getByText(/A serving is counted from the saved weight/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Log a serving' }));
    await waitFor(() => expect(onLog).toHaveBeenCalledOnce());
    expect(onSave).not.toHaveBeenCalled();
  });
});

it('withCookedG: the saved recipe as a PUT body with the new weight', () => {
  const body = withCookedG(PILAF, 2050);
  expect(body).toEqual({
    name: PILAF.name,
    cookedG: 2050,
    servings: PILAF.servings,
    note: PILAF.note,
    photoId: PILAF.photoId,
    ingredients: PILAF.ingredients,
    steps: PILAF.steps,
    per100: null,
    servingG: null,
  });
});

describe('useWakeLock', () => {
  const mock = () => {
    const release = vi.fn(async () => {});
    const sentinel = {
      release,
      addEventListener: vi.fn(),
    } as unknown as WakeLockSentinel;
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });
    return { request, release };
  };
  const visibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => visibility('visible'));

  it('takes the lock on open and releases it on exit', async () => {
    const { request, release } = mock();
    const { result, unmount } = renderHook(useWakeLock);
    await waitFor(() => expect(result.current).toBe(true));
    expect(request).toHaveBeenCalledWith('screen');
    unmount();
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases when the tab is hidden and takes it again when back', async () => {
    const { request, release } = mock();
    renderHook(useWakeLock);
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await act(async () => {});
    visibility('hidden');
    expect(release).toHaveBeenCalledOnce();
    visibility('visible');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a lock granted after exit is released at once', async () => {
    const { request, release } = mock();
    const { unmount } = renderHook(useWakeLock);
    unmount();
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await waitFor(() => expect(release).toHaveBeenCalledOnce());
  });

  it('no API or a refusal: false', async () => {
    expect(renderHook(useWakeLock).result.current).toBe(false);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(async () => Promise.reject(new Error('no'))) },
      configurable: true,
    });
    const { result } = renderHook(useWakeLock);
    await act(async () => {});
    expect(result.current).toBe(false);
  });
});

it('the recipe card has «Cook» only when the recipe has steps', async () => {
  const card = (recipe: typeof PILAF) =>
    renderLoaded(
      <I18nProvider>
        <RecipeView
          recipe={recipe}
          today="2026-11-19"
          online
          lighter={false}
          onDelete={async () => {}}
          onLog={async () => {}}
        />
      </I18nProvider>,
    );
  await card(PILAF);
  expect(screen.getByRole('link', { name: 'Cook' }).getAttribute('href')).toBe(
    '/kitchen/1/cook',
  );
  cleanup();
  await card({ ...PILAF, steps: [] });
  expect(screen.queryByRole('link', { name: 'Cook' })).toBeNull();
});
