import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { useModalDialog } from './useModalDialog';

function Modal({ open }: { open: boolean }) {
  const { ref } = useModalDialog(open, () => {});
  return <dialog ref={ref} />;
}

function Two({ outer, inner }: { outer: boolean; inner: boolean }) {
  return (
    <>
      <Modal open={outer} />
      <Modal open={inner} />
    </>
  );
}

const body = document.body.style;

describe('useModalDialog scroll lock', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    window.scrollY = 240;
    scrollTo = vi.spyOn(window, 'scrollTo');
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('fixes body at the scroll offset and restores it on close', () => {
    document.body.style.color = 'red';
    const { rerender } = render(<Modal open />);
    expect(body.position).toBe('fixed');
    expect(body.top).toBe('-240px');

    rerender(<Modal open={false} />);
    expect(body.position).toBe('');
    expect(body.top).toBe('');
    expect(body.color).toBe('red');
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: 'instant' });
    document.body.removeAttribute('style');
  });

  it('keeps the lock until the last of nested modals closes', () => {
    const { rerender } = render(<Two outer inner />);
    rerender(<Two outer inner={false} />);
    expect(body.position).toBe('fixed');
    expect(scrollTo).not.toHaveBeenCalled();
    rerender(<Two outer={false} inner={false} />);
    expect(body.position).toBe('');
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('survives open → close → open under StrictMode and unmount while open', () => {
    const tree = (open: boolean) => (
      <StrictMode>
        <Modal open={open} />
      </StrictMode>
    );
    const { rerender, unmount } = render(tree(true));
    rerender(tree(false));
    expect(body.position).toBe('');
    rerender(tree(true));
    expect(body.position).toBe('fixed');
    unmount();
    expect(body.position).toBe('');
    expect(document.body.hasAttribute('style')).toBe(false);
  });
});
