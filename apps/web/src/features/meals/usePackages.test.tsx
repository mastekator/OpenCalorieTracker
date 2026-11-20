import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, ReactNode } from 'react';
import { act, cleanup, renderHook, screen } from '@testing-library/react';
import type { PhotoBarcodesResponse } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { loadDict } from '../../i18n/translate';
import { ToastProvider } from '../../ui/Toast/Toast';
import { toRows, type Recognized, type Row } from './refine';
import { usePackages } from './usePackages';

// jsdom has no canvas: the label photo goes as is.
vi.mock('./prepareImage', async (original) => ({
  ...(await original<typeof import('./prepareImage')>()),
  prepareImage: async (file: Blob) => file,
}));

const CODE = '4006381333931';
const estimate: Recognized = {
  name: 'Greek yogurt 2%',
  grams: 150,
  kcal: 120,
  proteinG: 5,
  fatG: 4,
  carbsG: 15,
  confidence: 0.7,
  source: 'ai',
  barcode: CODE,
  check: true,
};
const codes: PhotoBarcodesResponse['codes'] = [];

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, '');
});

/** The hook with the rows it replaces; `onLabel` fed a picked file for `CODE`. */
function setup(recognize: () => Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path === '/api/photos' ? Response.json({ photoId: 'l1' }) : recognize(),
    ),
  );
  let rows: Row[] = toRows([estimate]);
  const setRows = vi.fn((next: Row[] | ((rs: Row[]) => Row[])) => {
    rows = typeof next === 'function' ? next(rows) : next;
  });
  const onReplace = vi.fn();
  const { result } = renderHook(
    () => usePackages({ codes, rows, setRows, onReplace }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <I18nProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      ),
    },
  );
  const read = async () => {
    await act(() => loadDict('en'));
    act(() => result.current.shootLabel(CODE));
    expect((history.state as { draft?: Row[] }).draft).toHaveLength(1);
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'label.jpg')],
    });
    await act(() =>
      result.current.onLabel({
        target: input,
      } as unknown as ChangeEvent<HTMLInputElement>),
    );
  };
  return { result, read, onReplace, rows: () => rows };
}

describe('usePackages: onLabel', () => {
  it('read: the package row replaced, «Updated from the label», reading back to false', async () => {
    const { result, read, onReplace, rows } = setup(async () =>
      Response.json({
        dishes: [{ ...estimate, kcal: 98, confidence: 0.9 }],
        questions: [],
      }),
    );
    await read();
    expect(onReplace).toHaveBeenCalledOnce();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.original.kcal).toBe(98);
    await screen.findByText('Updated from the label');
    expect(result.current.reading).toBe(false);
    expect(history.state).toEqual({});
  });

  it('nothing read or an error: the rows stay, «Couldn’t read the label»', async () => {
    for (const recognize of [
      async () => Response.json({ dishes: [], questions: [] }),
      async () => Response.json({ error: 'x' }, { status: 500 }),
    ]) {
      const { result, read, onReplace, rows } = setup(recognize);
      await read();
      expect(onReplace).not.toHaveBeenCalled();
      expect(rows()[0]!.original.kcal).toBe(120);
      await screen.findByText(/Couldn’t read the label/);
      expect(result.current.reading).toBe(false);
      cleanup();
    }
  });

  it('offline: «Couldn’t upload the photo», the rows stay', async () => {
    const { result, read, rows } = setup(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    await read();
    expect(rows()[0]!.original.kcal).toBe(120);
    await screen.findByText('Couldn’t upload the photo');
    expect(result.current.reading).toBe(false);
  });
});
