import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { OfflineBar } from './OfflineBar';

let online = true;
const setOnline = (value: boolean) => {
  online = value;
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  online = true;
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
});
afterEach(cleanup);

const renderBar = async (props: Parameters<typeof OfflineBar>[0] = {}) => {
  render(
    <I18nProvider>
      <p>ready</p>
      <OfflineBar {...props} />
    </I18nProvider>,
  );
  await screen.findByText('ready'); // the dictionary has loaded
};

describe('OfflineBar', () => {
  it('appears on offline and disappears on online', async () => {
    await renderBar();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => setOnline(false));
    expect(screen.getByRole('status').textContent).toBe('No connection');
    act(() => setOnline(true));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the cached data time offline', async () => {
    online = false;
    await renderBar({ dataTime: '12:40' });
    expect(screen.getByRole('status').textContent).toBe(
      'Offline · data from 12:40',
    );
  });

  it('reports a server that does not answer while online', async () => {
    await renderBar({ serverDown: true });
    expect(screen.getByRole('status').textContent).toBe('Server unavailable');
  });
});
