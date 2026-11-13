import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('is a non-submitting button that fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Sign in</Button>);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toBe('button button--primary');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant="danger-plain" small>
        Delete
      </Button>,
    );
    expect(screen.getByRole('button').className).toBe(
      'button button--danger-plain button--small',
    );
  });

  it('blocks clicks when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Sign in
      </Button>,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });

  it('is busy, disabled and shows a hidden spinner while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Signing in…
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      button.querySelector('.button__spinner')?.getAttribute('aria-hidden'),
    ).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
