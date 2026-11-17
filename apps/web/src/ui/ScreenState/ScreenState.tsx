import { useEffect, useRef, type ReactNode } from 'react';
import './ScreenState.css';

type Props = {
  /** A Lucide icon element, drawn in a 56 circle. */
  icon: ReactNode;
  /** Circle colour: neutral (empty, offline), danger (error), warning (invalid link). */
  tone?: 'neutral' | 'danger' | 'warning';
  title: ReactNode;
  /** One short phrase (≤ 30 ch). */
  children?: ReactNode;
  /** Longer block under the text: a list or extra lines, left-aligned. */
  details?: ReactNode;
  /** Usually one <Button>; several stack full width. */
  action?: ReactNode;
  /** Live region for a state that replaces a wait: status, or alert for errors. */
  role?: 'status' | 'alert';
  /** Moves focus to the title on mount (a state the screen switched to). */
  focusTitle?: boolean;
};

/** Whole-screen state: empty / error / offline without cache / invalid link (OCT-13 §3). */
export function ScreenState({
  icon,
  tone = 'neutral',
  title,
  children,
  details,
  action,
  role,
  focusTitle = false,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  return (
    <div className={`screen-state screen-state--${tone}`} role={role}>
      <span className="screen-state__icon" aria-hidden="true">
        {icon}
      </span>
      <h2
        ref={titleRef}
        className="screen-state__title"
        tabIndex={focusTitle ? -1 : undefined}
      >
        {title}
      </h2>
      {children && <p className="screen-state__text">{children}</p>}
      {details && <div className="screen-state__details">{details}</div>}
      {action && <div className="screen-state__action">{action}</div>}
    </div>
  );
}
