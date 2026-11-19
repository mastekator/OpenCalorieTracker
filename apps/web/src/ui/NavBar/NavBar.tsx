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
  /** Instead of `back`: an icon action on the left, e.g. «×» of a full-screen mode (OCT-160 4.1). */
  start?: Action;
  /** One action on the right; on a root screen (`large` without `back`) in the large title's row. */
  action?: Action;
  /** With `large`: controls in the large title's row, on its right (OCT-19 D.3). */
  aside?: ReactNode;
};

function ActionButton({
  icon: Icon,
  label,
  href,
  onClick,
  mobileOnly,
}: Action) {
  const className = `navbar__action${Icon ? '' : ' navbar__action--text'}${mobileOnly ? ' navbar--mobile-only' : ''}`;
  const content = Icon ? <Icon aria-hidden="true" /> : label;
  const ariaLabel = Icon ? label : undefined;
  return href !== undefined ? (
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

export function NavBar({
  title,
  large = false,
  back,
  start,
  action,
  aside,
}: Props) {
  const right = action ? <ActionButton {...action} /> : null;
  const bar = !large || !!back;
  return (
    <header className={`navbar${large ? ' navbar--large' : ''}`}>
      {/* Root screens have nothing for the bar: the action sits in the title's row (OCT-303). */}
      {bar && (
        <div className="navbar__bar">
          <div className="navbar__start">
            {start && <ActionButton {...start} />}
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
      )}
      {large && (
        <div className="navbar__large-row">
          <h1 className="navbar__large-title">{title}</h1>
          {(aside || (!bar && right)) && (
            <div className="navbar__aside">
              {aside}
              {!bar && right}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
