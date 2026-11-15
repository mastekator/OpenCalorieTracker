import type { ReactNode } from 'react';
import { Segment } from '../Segment/Segment';
import './SegmentedRow.css';

type Props<T extends string> = {
  /** A Lucide icon element, on the same tile as ListRow's. */
  icon?: ReactNode;
  /** Row label, also the radio group's accessible name. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A ListRow with a Segment under its label (OCT-25 §4): one tap, applied at once. Put inside List. */
export function SegmentedRow<T extends string>({
  icon,
  label,
  ...segment
}: Props<T>) {
  return (
    <li className="list__item">
      <div className={`list-row segmented-row${icon ? ' list-row--icon' : ''}`}>
        <span className="segmented-row__head" aria-hidden="true">
          {icon && <span className="list-row__icon">{icon}</span>}
          <span className="list-row__label">{label}</span>
        </span>
        <Segment label={label} {...segment} />
      </div>
    </li>
  );
}
