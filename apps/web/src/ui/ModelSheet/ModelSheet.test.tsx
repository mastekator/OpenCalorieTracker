import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AiModelInfo } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { ModelSheet } from './ModelSheet';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const models: AiModelInfo[] = [
  { id: 'qwen/qwen3-vl-72b', vision: true },
  { id: 'openai/gpt-5-mini', vision: true },
  { id: 'community/vl-tiny-3b', vision: null },
  { id: 'meta/llama-text', vision: null },
  { id: 'mistral/vl-embed', vision: false },
];

type Props = Parameters<typeof ModelSheet>[0];
function show(props: Partial<Props> = {}) {
  const onPick = vi.fn();
  const onRefresh = vi.fn();
  const sheet = (p: Partial<Props>) => (
    <ModelSheet
      open
      onClose={() => {}}
      models={models}
      loading={false}
      error={null}
      value="openai/gpt-5-mini"
      onPick={onPick}
      onRefresh={onRefresh}
      {...p}
    />
  );
  const view = render(sheet(props), { wrapper: I18nProvider });
  return {
    onPick,
    onRefresh,
    update: (p: Partial<Props>) => view.rerender(sheet(p)),
  };
}
const groups = () =>
  screen
    .getAllByRole('radiogroup')
    .map((g) => [
      g.getAttribute('aria-label'),
      ...[...g.querySelectorAll('[role=radio]')].map((r) => r.textContent),
    ]);

describe('ModelSheet', () => {
  it('groups photo models first, then silent ones, then no photos', async () => {
    show();
    await screen.findByText('5 models · photo models first');
    expect(groups()).toEqual([
      ['Accept photos', 'qwen/qwen3-vl-72bphotos', 'openai/gpt-5-miniphotos'],
      [
        'Not reported by the provider',
        'community/vl-tiny-3b',
        'meta/llama-text',
      ],
      ['No photos', 'mistral/vl-embedno photos'],
    ]);
    expect(
      screen
        .getByRole('radio', { name: /gpt-5-mini/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('searches by substring, any case, and highlights the match', async () => {
    const { onPick } = show();
    fireEvent.change(await screen.findByLabelText('Search models'), {
      target: { value: 'VL' },
    });
    expect(await screen.findByText('3 found · 5 models · photo models first'));
    expect(groups().map((g) => g[0])).toEqual([
      'Accept photos',
      'Not reported by the provider',
      'No photos',
    ]);
    expect(
      [...document.querySelectorAll('mark')].map((m) => m.textContent),
    ).toEqual(['vl', 'vl', 'vl']);
    fireEvent.click(screen.getByRole('radio', { name: /tiny/ }));
    expect(onPick).toHaveBeenCalledWith('community/vl-tiny-3b');
  });

  it('nothing found: the query goes into manual entry', async () => {
    const { onPick } = show();
    fireEvent.change(await screen.findByLabelText('Search models'), {
      target: { value: 'gpt-9-vision' },
    });
    expect(await screen.findByText('Nothing found for “gpt-9-vision”'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Enter “gpt-9-vision” manually' }),
    );
    expect(
      (screen.getByLabelText('Model name') as HTMLInputElement).value,
    ).toBe('gpt-9-vision');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onPick).toHaveBeenCalledWith('gpt-9-vision');
  });

  it('the list failed: the reason and the name field at once, Refresh retries', async () => {
    const { onPick, onRefresh, update } = show({ models: null, loading: true });
    await screen.findByText('Loading models…');
    update({
      models: null,
      error: 'Couldn’t load the model list: the provider rejected the key',
    });
    expect(
      await screen.findByText(
        'Couldn’t load the model list: the provider rejected the key',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Search models')).toBeNull();
    const name = screen.getByLabelText('Model name') as HTMLInputElement;
    expect(name.value).toBe('openai/gpt-5-mini');
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Enter a model')).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: ' my-model ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onPick).toHaveBeenCalledWith('my-model');
    // Both the header icon and the button under the field.
    for (const b of screen.getAllByRole('button', { name: 'Refresh list' }))
      fireEvent.click(b);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('an empty list says so, not «Nothing found», and offers manual entry', async () => {
    const { onPick } = show({ models: [], value: '' });
    await screen.findByText('The model list is empty');
    expect(screen.queryByText(/Nothing found/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Enter the name manually' }),
    );
    fireEvent.change(screen.getByLabelText('Model name'), {
      target: { value: 'my-model' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onPick).toHaveBeenCalledWith('my-model');
  });

  it('loading: the status line and placeholder rows', async () => {
    show({ models: null, loading: true });
    expect((await screen.findByRole('status')).textContent).toBe(
      'Loading models…',
    );
    expect(document.querySelectorAll('.skeleton')).toHaveLength(5);
  });

  it('«Enter the name manually» starts from the current model', async () => {
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter the name manually' }),
    );
    expect(
      (screen.getByLabelText('Model name') as HTMLInputElement).value,
    ).toBe('openai/gpt-5-mini');
  });
});
