import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Safari (iOS and macOS) doesn't focus a button on click, so the opener would be
// <body>: remember what was pressed last and return focus there instead.
let pressed: HTMLElement | null = null;
if (typeof document !== 'undefined')
  document.addEventListener(
    'pointerdown',
    (event) => {
      pressed =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(FOCUSABLE)
          : null;
    },
    true,
  );

// Background scroll lock shared by every open modal: a nested ConfirmDialog over a
// sheet keeps it until the last one closes. `overflow: hidden` doesn't stop iOS
// Safari (or the PWA) from scrolling the page under a swipe, so body gets fixed
// at the current offset and the offset is restored on unlock.
let locks = 0;
let saved: { y: number; style: string } | null = null;

function lockScroll() {
  if (locks++ > 0) return;
  const body = document.body;
  const y = window.scrollY;
  // Desktop: the page's scrollbar disappears with it, pad so the layout doesn't shift.
  const bar = window.innerWidth - document.documentElement.clientWidth;
  saved = { y, style: body.getAttribute('style') ?? '' };
  Object.assign(body.style, {
    position: 'fixed',
    top: `${-y}px`,
    insetInline: '0',
    width: '100%',
  });
  if (bar > 0) body.style.paddingInlineEnd = `${bar}px`;
}

function unlockScroll() {
  if (locks === 0 || --locks > 0 || !saved) return;
  const { y, style } = saved;
  saved = null;
  if (style) document.body.setAttribute('style', style);
  else document.body.removeAttribute('style');
  // 'instant': a smooth scroll-behavior would show the page sliding back.
  window.scrollTo({ top: y, behavior: 'instant' });
}

/**
 * Native modal <dialog> driven by `open`: focus goes inside (an element with
 * data-autofocus, e.g. the title so a tap doesn't light a focus ring, else the first focusable), Tab cycles inside, Esc asks
 * onClose, and on close focus returns to the element that opened it.
 * While open the page behind doesn't scroll.
 * The dialog never closes itself: the screen decides (e.g. confirm unsaved).
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && active !== document.body
        ? active
        : pressed;
    dialog.showModal();
    lockScroll();
    (
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog.querySelector<HTMLElement>(FOCUSABLE)
    )?.focus();
    return () => {
      dialog.close();
      unlockScroll();
      opener?.focus();
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const dialog = ref.current;
    if (!dialog) return;
    if (event.key === 'Escape') {
      // Handled here (not in `cancel`) so Chrome can't force-close it on a repeated Esc.
      event.preventDefault();
      event.stopPropagation(); // a nested dialog must not close its parent too
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // Cycle ourselves: Safari skips buttons on Tab by default and would leave the dialog.
    event.preventDefault();
    event.stopPropagation();
    // tabIndex -1 drops roving-tabindex items (a radiogroup is one Tab stop).
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.tabIndex >= 0,
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    // From outside the list (-1), Shift+Tab lands on the last item.
    items
      .at(at === -1 && step === -1 ? -1 : (at + step) % items.length)
      ?.focus();
  };

  // Other close requests (Android back): keep the dialog open, ask the screen.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  return { ref, onKeyDown, onCancel };
}
