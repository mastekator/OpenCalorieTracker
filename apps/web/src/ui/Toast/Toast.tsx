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

type Shown = ToastOptions & { id: number; host: Element };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Shown | null>(null);
  const seq = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    // A modal <dialog> makes everything outside it inert (no clicks, no screen reader),
    // so the toast goes inside the top open dialog. Next tick: a sheet closed in the
    // same handler is gone by then.
    setTimeout(() => {
      const open = document.querySelectorAll('dialog[open]');
      setToast({
        ...options,
        id: ++seq.current,
        host: open[open.length - 1] ?? document.body,
      });
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext value={show}>
      {children}
      {/* The empty live region stays in <body>, so screen readers announce what appears in it. */}
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
                    setToast(null);
                    toast.action?.onClick();
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>,
        toast?.host ?? document.body,
      )}
    </ToastContext>
  );
}
