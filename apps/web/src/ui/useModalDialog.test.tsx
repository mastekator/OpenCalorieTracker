import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
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

// Like Sheet: the content is only mounted while open.
function Box({ open, items }: { open: boolean; items: string[] }) {
  const { ref } = useModalDialog(open, () => {});
  return (
    <dialog ref={ref}>
      {open && items.map((name) => <button key={name}>{name}</button>)}
    </dialog>
  );
}

function Chain({ a, b, c = false }: { a: boolean; b: boolean; c?: boolean }) {
  return (
    <>
      <button>Opener</button>
      <Box open={a} items={['x', 'y']} />
      <Box open={b} items={['inner']} />
      <Box open={c} items={['confirm']} />
    </>
  );
}

const button = (name: string) => screen.getByRole('button', { name });

describe('useModalDialog focus between sheets (OCT-503)', () => {
  afterEach(cleanup);

  const start = () => {
    const view = render(<Chain a={false} b={false} />);
    button('Opener').focus();
    view.rerender(<Chain a b={false} />);
    button('y').focus();
    return view;
  };

  it('a sheet replacing another returns focus to the first one’s opener', () => {
    const { rerender } = start();
    rerender(<Chain a={false} b />);
    expect(document.activeElement).toBe(button('inner'));
    rerender(<Chain a={false} b={false} />);
    expect(document.activeElement).toBe(button('Opener'));
  });

  it('a sheet reopening under a closed one focuses where it was', () => {
    const { rerender } = start();
    rerender(<Chain a={false} b />);
    rerender(<Chain a b={false} />);
    expect(document.activeElement).toBe(button('y'));
    rerender(<Chain a={false} b={false} />);
    expect(document.activeElement).toBe(button('Opener'));
  });

  it('a sheet opened later, by a new action, starts from the top', async () => {
    const { rerender } = start();
    rerender(<Chain a={false} b={false} />);
    await act(async () => {});
    rerender(<Chain a b={false} />);
    expect(document.activeElement).toBe(button('x'));
  });

  it('a dialog over a sheet returns focus inside the sheet', () => {
    const { rerender } = start();
    rerender(<Chain a b={false} c />);
    rerender(<Chain a b={false} />);
    expect(document.activeElement).toBe(button('y'));
  });
});
