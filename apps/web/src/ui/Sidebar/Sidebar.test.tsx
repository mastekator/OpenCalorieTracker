import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BookOpen, House, Settings2 } from 'lucide-react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { Sidebar } from './Sidebar';

const items = [
  { href: '/', icon: House, label: 'Today' },
  { href: '/diary', icon: BookOpen, label: 'Diary' },
];
const settings = { href: '/settings', icon: Settings2, label: 'Settings' };

function renderAt(path: string, onAdd = () => {}) {
  render(
    <I18nProvider>
      <Router hook={memoryLocation({ path }).hook}>
        <Sidebar
          items={items}
          settings={settings}
          email="anna@example.com"
          onAdd={onAdd}
        />
      </Router>
    </I18nProvider>,
  );
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

describe('Sidebar', () => {
  it('marks only the current item with aria-current, Settings included', async () => {
    renderAt('/settings/theme');
    const current = (await screen.findAllByRole('link')).filter((link) =>
      link.hasAttribute('aria-current'),
    );
    expect(current.map((link) => link.textContent)).toEqual(['Settings']);
    expect(current[0]!.getAttribute('aria-current')).toBe('page');
  });

  it('calls onAdd from «Add food» and shows the email', async () => {
    const onAdd = vi.fn();
    renderAt('/', onAdd);
    fireEvent.click(await screen.findByRole('button', { name: 'Add food' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByText('anna@example.com')).toBeTruthy();
  });
});
