import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import './NavBar.css';

type Action = { icon: LucideIcon; label: string } & (
  { href: string; onClick?: never } | { onClick: () => void; href?: never }
);

type Props = {
  title: string;
  /** Root screens: a 34 pt title under the bar instead of a centred one. */
  large?: boolean;
  /** Nested screens: chevron + the previous screen's name. */
  back?: { href: string; label: string };
  /** One 44×44 icon on the right; the label is read by screen readers. */
  action?: Action;
};

export function NavBar({ title, large = false, back, action }: Props) {
  let right = null;
  if (action) {
    const { icon: Icon, label, href, onClick } = action;
    right =
      href !== undefined ? (
        <Link href={href} className="navbar__action" aria-label={label}>
          <Icon aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          className="navbar__action"
          aria-label={label}
          onClick={onClick}
        >
          <Icon aria-hidden="true" />
        </button>
      );
  }
  return (
    <header className={`navbar${large ? ' navbar--large' : ''}`}>
      <div className="navbar__bar">
        <div className="navbar__start">
          {back && (
            <Link href={back.href} className="navbar__back">
              <ChevronLeft aria-hidden="true" />
              <span>{back.label}</span>
            </Link>
          )}
        </div>
        {!large && <h1 className="navbar__title">{title}</h1>}
        <div className="navbar__end">{right}</div>
      </div>
      {large && <h1 className="navbar__large-title">{title}</h1>}
    </header>
  );
}
