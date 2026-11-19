import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Settings2, UserPlus } from 'lucide-react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { NavBar } from './NavBar';

afterEach(cleanup);

describe('NavBar', () => {
  it('links back to the previous screen and to the action', () => {
    render(
      <Router hook={memoryLocation({ path: '/settings/theme' }).hook}>
        <NavBar
          title="Theme"
          back={{ href: '/settings', label: 'Settings' }}
          action={{ icon: Settings2, label: 'Open', href: '/settings/x' }}
        />
      </Router>,
    );
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Settings' }).getAttribute('href'),
    ).toBe('/settings');
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe('/settings/x');
  });

  it('renders a labelled action button', () => {
    const onClick = vi.fn();
    render(
      <NavBar
        title="Invitations"
        large
        action={{ icon: UserPlus, label: 'Invite', onClick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders an action without an icon as its text', () => {
    const onClick = vi.fn();
    render(<NavBar title="Diary" large action={{ label: 'Today', onClick }} />);
    const button = screen.getByRole('button', { name: 'Today' });
    expect(button.textContent).toBe('Today');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('puts a root screen action in the large title row, with no bar above', () => {
    const { container } = render(
      <NavBar
        title="Profile"
        large
        action={{ icon: UserPlus, label: 'Invite', onClick: () => {} }}
      />,
    );
    expect(container.querySelector('.navbar__bar')).toBeNull();
    const row = container.querySelector('.navbar__large-row')!;
    expect(row.contains(screen.getByRole('heading', { name: 'Profile' }))).toBe(
      true,
    );
    expect(row.contains(screen.getByRole('button', { name: 'Invite' }))).toBe(
      true,
    );
  });

  it('keeps the bar with Back above a large title', () => {
    const { container } = render(
      <Router hook={memoryLocation({ path: '/register' }).hook}>
        <NavBar
          title="Sign up"
          large
          back={{ href: '/login', label: 'Sign in' }}
        />
      </Router>,
    );
    const bar = container.querySelector('.navbar__bar')!;
    expect(bar.contains(screen.getByRole('link', { name: 'Sign in' }))).toBe(
      true,
    );
  });
});
