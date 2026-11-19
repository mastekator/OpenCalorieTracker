import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { RecipeParseResponse } from '@oct/shared';
import { I18nProvider } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { AiPasteView } from './AiPasteScreen';
import { PILAF } from './fixtures';

afterEach(cleanup);

const RESULT: RecipeParseResponse = { draft: PILAF, unsure: [1] };

const view = async (
  parse = vi.fn<(text: string) => Promise<RecipeParseResponse>>(
    async () => RESULT,
  ),
  online = true,
) => {
  const onParsed = vi.fn();
  const onManual = vi.fn();
  await renderLoaded(
    <I18nProvider>
      <AiPasteView
        online={online}
        parse={parse}
        onParsed={onParsed}
        onManual={onManual}
      />
    </I18nProvider>,
  );
  return { parse, onParsed, onManual };
};
const field = () => screen.getByLabelText('Recipe text') as HTMLTextAreaElement;
const type = (value: string) =>
  fireEvent.change(field(), { target: { value } });
const parseButton = () => screen.getByRole('button', { name: /Parse/ });

describe('AiPasteView', () => {
  it('parses the trimmed text and hands over the draft', async () => {
    const { parse, onParsed } = await view();
    expect(parseButton().hasAttribute('disabled')).toBe(true);
    type('  Pilaf: rice 400 g  ');
    expect(screen.getByText('21 / 10,000')).toBeTruthy();
    fireEvent.click(parseButton());
    expect(screen.getByRole('status').textContent).toBe('Parsing the recipe…');
    await vi.waitFor(() => expect(onParsed).toHaveBeenCalledWith(RESULT));
    expect(parse).toHaveBeenCalledWith('Pilaf: rice 400 g');
  });

  it('on failure keeps the text; «Try again» asks once more', async () => {
    const parse = vi
      .fn<(text: string) => Promise<RecipeParseResponse>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(RESULT);
    const { onParsed } = await view(parse);
    type('Pilaf');
    fireEvent.click(parseButton());
    expect(await screen.findByText('Couldn’t parse it')).toBeTruthy();
    expect(field().value).toBe('Pilaf');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // The banner is gone while the request runs: no second request from it.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await vi.waitFor(() => expect(onParsed).toHaveBeenCalledWith(RESULT));
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('«Fill in manually» leaves for an empty editor', async () => {
    const { onManual } = await view(
      vi.fn(async () => Promise.reject(new Error())),
    );
    type('Pilaf');
    fireEvent.click(parseButton());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Fill in manually' }),
    );
    expect(onManual).toHaveBeenCalled();
  });

  it('offline «Parse» is disabled', async () => {
    await view(undefined, false);
    type('Pilaf');
    expect(parseButton().hasAttribute('disabled')).toBe(true);
  });
});
