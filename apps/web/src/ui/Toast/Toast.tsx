import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

export type ToastOptions = {
  text: string;
  /** 20px icon (Lucide), decorative. */
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
};

export const TOAST_MS = 3000;

const ToastContext = createContext<(toast: ToastOptions) => void>(() => {});

/** `useToast()(options)`: one toast at a time, a new one replaces the old. Not for errors that need action. */
export const useToast = () => useContext(ToastContext);

/** Pause between moving the empty live region into a dialog and filling it: VoiceOver
 * misses a region that appears already filled, and one frame is not always enough. */
export const ANNOUNCE_DELAY_MS = 100;

type Shown = ToastOptions & { id: number };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Shown | null>(null);
  const [host, setHost] = useState<Element>(() => document.body);
  const hostRef = useRef(host);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms = 0) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  const moveTo = useCallback((next: Element) => {
    hostRef.current = next;
    setHost(next);
  }, []);

  const hide = useCallback(() => {
    setToast(null);
    // Back to <body>, so an empty region is not left in a dialog that closes.
    moveTo(document.body);
  }, [moveTo]);

  const show = useCallback(
    (options: ToastOptions) => {
      // A modal <dialog> makes everything outside it inert (no clicks, no screen reader),
      // so the toast goes inside the top open dialog. Next tick: a sheet closed in the
      // same handler is gone by then.
      later(() => {
        const id = ++seq.current;
        const open = document.querySelectorAll('dialog[open]');
        const next = open[open.length - 1] ?? document.body;
        if (next === hostRef.current) {
          setToast({ ...options, id });
          return;
        }
        // The region is recreated in the new host: mount it empty, fill it after a pause.
        setToast(null);
        moveTo(next);
        later(() => {
          if (seq.current === id) setToast({ ...options, id });
        }, ANNOUNCE_DELAY_MS);
      });
    },
    [later, moveTo],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(hide, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, hide]);

  return (
    <ToastContext value={show}>
      {children}
      {/* The live region stays mounted empty in its host (<body> or the top open dialog), so screen readers announce what appears in it. */}
      {createPortal(
        <div className="toast" role="status">
          {toast && (
            <div key={toast.id} className="toast__inner">
              {toast.icon && (
                <span className="toast__icon" aria-hidden="true">
                  {toast.icon}
                </span>
              )}
              <span className="toast__text">{toast.text}</span>
              {toast.action && (
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    hide();
                    toast.action?.onClick();
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>,
        host,
      )}
    </ToastContext>
  );
}
