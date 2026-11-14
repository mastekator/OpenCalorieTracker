import type { ReactNode } from 'react';
import './ScreenState.css';

type Props = {
  /** A Lucide icon element, drawn in a 56 circle. */
  icon: ReactNode;
  /** Circle colour: neutral (empty, offline), danger (error), warning (invalid link). */
  tone?: 'neutral' | 'danger' | 'warning';
  title: ReactNode;
  /** One short phrase (≤ 30 ch). */
  children?: ReactNode;
  /** One button, usually <Button>. */
  action?: ReactNode;
};

/** Whole-screen state: empty / error / offline without cache / invalid link (OCT-13 §3). */
export function ScreenState({
  icon,
  tone = 'neutral',
  title,
  children,
  action,
}: Props) {
  return (
    <div className={`screen-state screen-state--${tone}`}>
      <span className="screen-state__icon" aria-hidden="true">
        {icon}
      </span>
      <h2 className="screen-state__title">{title}</h2>
      {children && <p className="screen-state__text">{children}</p>}
      {action && <div className="screen-state__action">{action}</div>}
    </div>
  );
}
