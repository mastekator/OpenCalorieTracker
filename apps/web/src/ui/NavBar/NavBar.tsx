import { ChevronLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import './NavBar.css';

/**
 * With an icon: a 44×44 icon button, the label read by screen readers; without one: the label as text.
 * mobileOnly: hidden inside the app shell from 1024px, where the sidebar already offers it.
 */
type Action = { icon?: LucideIcon; label: string; mobileOnly?: boolean } & (
  { href: string; onClick?: never } | { onClick: () => void; href?: never }
);

type Props = {
  title: string;
  /** Root screens: a 34 pt title under the bar instead of a centred one. */
  large?: boolean;
  /** Nested screens: chevron + the previous screen's name. */
  back?: { href: string; label: string; mobileOnly?: boolean };
  /** One action on the right. */
  action?: Action;
  /** With `large`: controls in the large title's row, on its right (OCT-19 D.3). */
  aside?: ReactNode;
};

export function NavBar({ title, large = false, back, action, aside }: Props) {
  let right = null;
  if (action) {
    const { icon: Icon, label, href, onClick, mobileOnly } = action;
    const className = `navbar__action${Icon ? '' : ' navbar__action--text'}${mobileOnly ? ' navbar--mobile-only' : ''}`;
    const content = Icon ? <Icon aria-hidden="true" /> : label;
    const ariaLabel = Icon ? label : undefined;
    right =
      href !== undefined ? (
        <Link href={href} className={className} aria-label={ariaLabel}>
          {content}
        </Link>
      ) : (
        <button
          type="button"
          className={className}
          aria-label={ariaLabel}
          onClick={onClick}
        >
          {content}
        </button>
      );
  }
  return (
    <header className={`navbar${large ? ' navbar--large' : ''}`}>
      <div className="navbar__bar">
        <div className="navbar__start">
          {back && (
            <Link
              href={back.href}
              className={`navbar__back${back.mobileOnly ? ' navbar--mobile-only' : ''}`}
              aria-label={back.label}
            >
              <ChevronLeft aria-hidden="true" />
              <span>{back.label}</span>
            </Link>
          )}
        </div>
        {!large && <h1 className="navbar__title">{title}</h1>}
        <div className="navbar__end">{right}</div>
      </div>
      {large &&
        (aside ? (
          <div className="navbar__large-row">
            <h1 className="navbar__large-title">{title}</h1>
            <div className="navbar__aside">{aside}</div>
          </div>
        ) : (
          <h1 className="navbar__large-title">{title}</h1>
        ))}
    </header>
  );
}
