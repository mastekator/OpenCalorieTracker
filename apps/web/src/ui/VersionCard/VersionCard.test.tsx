import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { VersionCard } from './VersionCard';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

describe('VersionCard', () => {
  it('says in words which dish is missing, folds the unchanged ones and keeps this side', async () => {
    const onKeep = vi.fn();
    render(
      <I18nProvider>
        <VersionCard
          side="other"
          kcal={712}
          rows={[{ key: 'a', label: 'Sauce', value: '—', note: 'missing' }]}
          unchanged={[{ key: 'b', label: 'Bread', value: '60 g · 150 kcal' }]}
          onKeep={onKeep}
        />
      </I18nProvider>,
    );
    const card = await screen.findByRole('region', {
      name: 'On another device, 712 kcal',
    });
    expect(card.querySelector('s')?.textContent).toBe('Sauce');
    expect(card.textContent).toContain('Saucenot in this version—');
    const toggle = screen.getByRole('button', {
      name: '1 more item unchanged',
    });
    expect(screen.queryByText('Bread')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Bread')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Keep this one',
        description: 'On another device',
      }),
    );
    expect(onKeep).toHaveBeenCalledOnce();
  });
});
