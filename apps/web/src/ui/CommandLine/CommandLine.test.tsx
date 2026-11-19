import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { CommandLine } from './CommandLine';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const COMMAND = 'docker compose exec app node dist/cli.js reset-admin-access';

it('keeps each word whole and copies the command unchanged', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  const { container } = await renderLoaded(
    <I18nProvider>
      <CommandLine command={COMMAND} />
    </I18nProvider>,
  );
  const words = [...container.querySelectorAll('.command-line__word')];
  expect(words.map((w) => w.textContent)).toEqual(COMMAND.split(' '));
  expect(container.querySelector('code')?.textContent).toBe(COMMAND);
  fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));
  expect(writeText).toHaveBeenCalledWith(COMMAND);
  expect(
    await screen.findByRole('button', { name: 'Command copied' }),
  ).toBeTruthy();
});
