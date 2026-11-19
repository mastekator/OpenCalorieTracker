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
  /** Second line under the label (footnote, secondary), e.g. passkey dates. */
  description?: ReactNode;
  /** Keep the description on one line, ellipsis when it does not fit. */
  descriptionNowrap?: boolean;
  /** Secondary text on the right (current value, count, badge). */
  value?: ReactNode;
  /** Defaults to true for rows that navigate or act. */
  chevron?: boolean;
  danger?: boolean;
  /** Accent-coloured action row without a chevron, e.g. «Add a passkey». */
  accent?: boolean;
  /**
   * Greyed out but still focusable and clickable (aria-disabled), so a screen
   * can explain why on tap — e.g. admin rows offline show a toast (OCT-13 §7).
   */
  disabled?: boolean;
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Marks the current item of a set, e.g. the step being cooked; tinted accent. */
  current?: 'step' | 'page';
  /** A separate button at the row's end, its own tap zone, e.g. «+» on the profile's weight row. */
  action?: ReactNode;
};

export function ListRow({
  icon,
  children,
  description,
  descriptionNowrap = false,
  value,
  chevron,
  danger = false,
  accent = false,
  disabled = false,
  href,
  onClick,
  action,
  current,
}: RowProps) {
  const interactive = href !== undefined || onClick !== undefined;
  const className = `list-row${danger ? ' list-row--danger' : ''}${accent ? ' list-row--accent' : ''}${icon ? ' list-row--icon' : ''}${interactive ? ' list-row--interactive' : ''}`;
  const content = (
    <>
      {icon && <span className="list-row__icon">{icon}</span>}
      <span className="list-row__label">
        {children}
        {description && (
          <span
            className={`list-row__description${descriptionNowrap ? ' list-row__description--nowrap' : ''}`}
          >
            {description}
          </span>
        )}
      </span>
      {value !== undefined && <span className="list-row__value">{value}</span>}
      {(chevron ?? (interactive && !accent && !disabled)) && (
        <ChevronRight className="list-row__chevron" aria-hidden="true" />
      )}
    </>
  );
  const common = {
    className,
    'aria-disabled': disabled || undefined,
    'aria-current': current,
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
  return (
    <li className={`list__item${action ? ' list__item--action' : ''}`}>
      {row}
      {action}
    </li>
  );
}
