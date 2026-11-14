import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BookOpen, ChartColumn, House, User } from 'lucide-react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { LONG_PRESS_MS, TabBar } from './TabBar';

const items = [
  { href: '/', icon: House, label: 'Today' },
  { href: '/diary', icon: BookOpen, label: 'Diary' },
  { href: '/week', icon: ChartColumn, label: 'Week' },
  { href: '/profile', icon: User, label: 'Profile' },
];

function renderAt(path: string, onAdd = () => {}, onLongPress?: () => void) {
  render(
    <I18nProvider>
      <Router hook={memoryLocation({ path }).hook}>
        <TabBar items={items} onAdd={onAdd} onLongPress={onLongPress} />
      </Router>
    </I18nProvider>,
  );
}

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

describe('TabBar', () => {
  it('marks only the current tab with aria-current, nested screens included', async () => {
    renderAt('/diary/2026-11-14');
    const current = (await screen.findAllByRole('link')).filter((link) =>
      link.hasAttribute('aria-current'),
    );
    expect(current.map((link) => link.textContent)).toEqual(['Diary']);
    expect(current[0]!.getAttribute('aria-current')).toBe('page');
  });

  it('marks Today only on its own screen', async () => {
    renderAt('/');
    expect(
      (await screen.findByRole('link', { name: 'Today' })).getAttribute(
        'aria-current',
      ),
    ).toBe('page');
    cleanup();
    renderAt('/week');
    expect(
      (await screen.findByRole('link', { name: 'Today' })).hasAttribute(
        'aria-current',
      ),
    ).toBe(false);
  });

  it('puts the labelled camera button in the middle and calls onAdd', async () => {
    const onAdd = vi.fn();
    renderAt('/', onAdd);
    const camera = await screen.findByRole('button', {
      name: 'Take a photo of food',
    });
    const slots = [...screen.getByRole('list').children];
    expect(slots.indexOf(camera.parentElement!)).toBe(2);
    fireEvent.click(camera);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('long press opens the menu and swallows the click that ends it', async () => {
    const onAdd = vi.fn();
    const onLongPress = vi.fn();
    renderAt('/', onAdd, onLongPress);
    const camera = await screen.findByRole('button', {
      name: 'Take a photo of food',
    });
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(camera, { clientX: 0, clientY: 0 });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(onLongPress).toHaveBeenCalledOnce();
      fireEvent.pointerUp(camera);
      fireEvent.click(camera);
      expect(onAdd).not.toHaveBeenCalled();
      // The next tap opens the camera again.
      fireEvent.click(camera);
      expect(onAdd).toHaveBeenCalledOnce();
      expect(fireEvent.contextMenu(camera)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a short tap or a moved press is not a long press', async () => {
    const onLongPress = vi.fn();
    renderAt('/', () => {}, onLongPress);
    const camera = await screen.findByRole('button', {
      name: 'Take a photo of food',
    });
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(camera, { clientX: 0, clientY: 0 });
      fireEvent.pointerUp(camera);
      fireEvent.pointerDown(camera, { clientX: 0, clientY: 0 });
      fireEvent.pointerMove(camera, { clientX: 0, clientY: 30 });
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
      expect(onLongPress).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
