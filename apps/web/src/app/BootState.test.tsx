import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ApiError } from '../api/client';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../i18n';
import { renderLoaded } from '../test-utils';
import { BootState } from './BootState';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

it('keeps the main landmark and puts the alert on the message (OCT-170)', async () => {
  await renderLoaded(
    <I18nProvider>
      <BootState error={new ApiError(500, 'internal')} onRetry={() => {}} />
    </I18nProvider>,
  );
  const main = screen.getByRole('main');
  expect(main.getAttribute('role')).toBeNull();
  expect(main.contains(screen.getByRole('alert'))).toBe(true);
});
