import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Segment } from './Segment';

afterEach(cleanup);

const options = [
  { value: 'passkey', label: 'Passkey' },
  { value: 'password', label: 'Password' },
] as const;

function Method() {
  const [value, setValue] = useState<'passkey' | 'password'>('passkey');
  return (
    <Segment
      label="Sign-in method"
      options={options}
      value={value}
      onChange={setValue}
    />
  );
}

describe('Segment', () => {
  it('is a radio group with only the checked option in the tab order', () => {
    render(<Method />);
    screen.getByRole('radiogroup', { name: 'Sign-in method' });
    const [passkey, password] = screen.getAllByRole('radio') as [
      HTMLElement,
      HTMLElement,
    ];
    expect(passkey.getAttribute('aria-checked')).toBe('true');
    expect(passkey.tabIndex).toBe(0);
    expect(password.getAttribute('aria-checked')).toBe('false');
    expect(password.tabIndex).toBe(-1);
  });

  it('moves selection and focus with arrows, wrapping around', () => {
    render(<Method />);
    const [passkey, password] = screen.getAllByRole('radio') as [
      HTMLElement,
      HTMLElement,
    ];
    passkey.focus();
    fireEvent.keyDown(passkey, { key: 'ArrowRight' });
    expect(password.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(password);
    fireEvent.keyDown(password, { key: 'ArrowRight' });
    expect(passkey.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(passkey);
    fireEvent.keyDown(passkey, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(password);
  });

  it('selects on click', () => {
    render(<Method />);
    fireEvent.click(screen.getByRole('radio', { name: 'Password' }));
    expect(
      screen
        .getByRole('radio', { name: 'Password' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('keeps the first option in the tab order while nothing is chosen', () => {
    render(
      <Segment
        label="Sex"
        options={options}
        value={'' as 'passkey'}
        onChange={() => {}}
      />,
    );
    const [passkey, password] = screen.getAllByRole('radio') as [
      HTMLElement,
      HTMLElement,
    ];
    expect(passkey.tabIndex).toBe(0);
    expect(password.tabIndex).toBe(-1);
  });
});
