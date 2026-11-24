import { useId, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Cloud,
  Laptop,
  RotateCcw,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import './VersionCard.css';

/** One line of a version: a meal field (secondary label) or a dish; `note` marks a dish only one version has. */
export type VersionRow = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  field?: boolean;
  note?: 'only' | 'missing';
};

type Props = {
  side: 'this' | 'other';
  /** This device's icon: a phone or a laptop. */
  desktop?: boolean;
  editedAt?: number;
  /** The other side deleted the meal (3.1): no rows and no total, «Delete entry». */
  deletedAt?: number;
  /** This side against a delete (3.1): «Restore my version». */
  restore?: boolean;
  kcal: number;
  /** The differences, the same count and order in both cards (OCT-157 §2). */
  rows: VersionRow[];
  /** Dishes equal in both versions, folded under «N more items unchanged». */
  unchanged: VersionRow[];
  /** Theirs changed while the screen was open (2.4). */
  updated?: boolean;
  onKeep: () => void;
};

/** One version of a meal on the conflict screen (OCT-157 §2). */
export function VersionCard({
  side,
  desktop,
  editedAt,
  deletedAt,
  restore,
  kcal,
  rows,
  unchanged,
  updated,
  onKeep,
}: Props) {
  const { t, num, locale } = useT();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const gone = deletedAt !== undefined;
  const Icon = gone
    ? Trash2
    : side === 'other'
      ? Cloud
      : desktop
        ? Laptop
        : Smartphone;
  const title = t(`sync.conflict.${side}_device`);
  const at = gone ? deletedAt : editedAt;
  const edited =
    at === undefined
      ? ''
      : t(`sync.conflict.${gone ? 'deleted_at' : 'edited_at'}`, {
          time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
            at,
          ),
        });
  const total = gone ? '' : t('meal.kcal', { n: num(kcal) });
  return (
    <section
      className="version-card"
      aria-label={[title, edited, total].filter(Boolean).join(', ')}
    >
      <div className="version-card__head">
        <span
          className={`version-card__icon version-card__icon--${gone ? 'gone' : side}`}
        >
          <Icon aria-hidden="true" />
        </span>
        <span className="version-card__titles">
          <span id={titleId} className="version-card__title">
            {title}
          </span>
          <span className="version-card__edited">
            {edited}
            {updated && (
              <Badge tone="warn">{t('sync.conflict.updated_badge')}</Badge>
            )}
          </span>
        </span>
        {total && (
          // The space keeps the text «530 kcal»; flex drops it from layout, the gap spaces it.
          <span className="version-card__kcal">
            {num(kcal)}{' '}
            <span className="version-card__unit">{t('today.kcal')}</span>
          </span>
        )}
      </div>
      {gone && (
        <p className="version-card__gone">
          <Trash2 aria-hidden="true" />
          {t('sync.conflict.deleted.note')}
        </p>
      )}
      {rows.length > 0 && <Rows rows={rows} />}
      {unchanged.length > 0 && (
        <>
          <button
            type="button"
            className="version-card__toggle"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {t('sync.conflict.unchanged', { count: unchanged.length })}
            <ChevronDown aria-hidden="true" />
          </button>
          {open && <Rows rows={unchanged} />}
        </>
      )}
      <Button
        variant={gone ? 'danger-tonal' : 'tonal'}
        // The visible words stay the name (WCAG 2.5.3); the side comes as its description.
        aria-describedby={titleId}
        onClick={onKeep}
      >
        {restore && <RotateCcw aria-hidden="true" />}
        {t(
          gone
            ? 'sync.conflict.delete'
            : restore
              ? 'sync.conflict.restore'
              : 'sync.conflict.keep',
        )}
      </Button>
    </section>
  );
}

function Rows({ rows }: { rows: VersionRow[] }) {
  const { t } = useT();
  return (
    <ul className="version-card__rows">
      {rows.map((r) => (
        <li
          key={r.key}
          className={`version-card__row${r.field ? ' version-card__row--field' : ''}${r.note === 'missing' ? ' version-card__row--missing' : ''}`}
        >
          <span className="version-card__label">
            {r.note === 'missing' ? <s>{r.label}</s> : r.label}
            {r.note && (
              // Words, not only the strike or a colour: read as «Sour cream sauce not in this version».
              <Badge>
                {t(
                  r.note === 'only'
                    ? 'sync.conflict.only_here'
                    : 'sync.conflict.missing',
                )}
              </Badge>
            )}
          </span>
          <span className="version-card__value">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
