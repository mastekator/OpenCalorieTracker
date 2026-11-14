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
});
