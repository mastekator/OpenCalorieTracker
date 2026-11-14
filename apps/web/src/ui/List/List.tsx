import type { MouseEvent, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import './List.css';

type ListProps = {
  /** Group title above the rows (footnote, secondary). */
  title?: ReactNode;
  /** Caption under the group: explains the rows or why they are disabled. */
  footer?: ReactNode;
  children: ReactNode;
};

/** Grouped list (OCT-13 §3): a surface card of ListRow items. */
export function List({ title, footer, children }: ListProps) {
  return (
    <section className="list">
      {title && <h2 className="list__title">{title}</h2>}
      <ul className="list__rows">{children}</ul>
      {footer && <p className="list__footer">{footer}</p>}
    </section>
  );
}

type RowProps = {
  /** A Lucide icon element; drawn on a 30×30 accent-soft tile. */
  icon?: ReactNode;
  children: ReactNode;
  /** Secondary text on the right (current value, count, badge). */
  value?: ReactNode;
  /** Defaults to true for rows that navigate or act. */
  chevron?: boolean;
  danger?: boolean;
  /**
   * Greyed out but still focusable and clickable (aria-disabled), so a screen
   * can explain why on tap — e.g. admin rows offline show a toast (OCT-13 §7).
   */
  disabled?: boolean;
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
};

export function ListRow({
  icon,
  children,
  value,
  chevron,
  danger = false,
  disabled = false,
  href,
  onClick,
}: RowProps) {
  const interactive = href !== undefined || onClick !== undefined;
  const className = `list-row${danger ? ' list-row--danger' : ''}${interactive ? ' list-row--interactive' : ''}`;
  const content = (
    <>
      {icon && <span className="list-row__icon">{icon}</span>}
      <span className="list-row__label">{children}</span>
      {value !== undefined && <span className="list-row__value">{value}</span>}
      {(chevron ?? interactive) && (
        <ChevronRight className="list-row__chevron" aria-hidden="true" />
      )}
    </>
  );
  const common = {
    className,
    'aria-disabled': disabled || undefined,
  };
  let row;
  if (href !== undefined)
    row = (
      <a
        {...common}
        href={href}
        onClick={(event) => {
          if (disabled) event.preventDefault();
          onClick?.(event);
        }}
      >
        {content}
      </a>
    );
  else if (onClick)
    row = (
      <button {...common} type="button" onClick={onClick}>
        {content}
      </button>
    );
  else row = <div {...common}>{content}</div>;
  return <li className="list__item">{row}</li>;
}
