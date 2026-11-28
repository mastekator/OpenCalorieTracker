import { CloudOff, Trash2 } from 'lucide-react';
import type { DrinkEntry, Units } from '@oct/shared';
import { useMealStatus } from '../../data/DataContext';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useSwipeDelete } from '../../ui/useSwipeDelete';
import { useVolume } from './format';
import './WaterDaySheet.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** A past day, YYYY-MM-DD: its date in the title; absent for today. */
  day?: string;
  /** The day's live entries, any order. */
  entries: readonly DrinkEntry[];
  /** Water drunk that day, ml. */
  ml: number;
  goalMl: number;
  units: Units;
  online: boolean;
  /** Hides the entry with «Deleted · Undo»; offline only for one not sent yet (AC-5.3). */
  onDelete: (entry: DrinkEntry) => void;
};

/** OCT-147 2.3–2.4: «Water today» (or a past day), the day's entries with delete and no edit (AC-3.9). */
export function WaterDaySheet({
  day,
  open,
  onClose,
  entries,
  ml,
  goalMl,
  units,
  online,
  onDelete,
}: Props) {
  const { t, locale } = useT();
  const volume = useVolume(units);
  const date =
    day &&
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`));
  const sorted = [...entries].sort(
    (a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt),
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={date ? t('water.day_on', { date }) : t('water.day')}
    >
      <div className="water-day">
        <p className="water-day__sum">
          <b>{volume(ml)}</b>{' '}
          {t('water.of', {
            goal: volume(goalMl),
            pct: Math.round((ml / goalMl) * 100),
          })}
        </p>
        {sorted.length ? (
          <ul className="water-day__list">
            {sorted.map((e) => (
              <EntryRow
                key={e.clientId}
                entry={e}
                units={units}
                online={online}
                onDelete={() => onDelete(e)}
              />
            ))}
          </ul>
        ) : (
          <p className="water-day__note">
            {t(date ? 'water.day_empty_past' : 'water.day_empty')}
          </p>
        )}
        {sorted.length > 0 && (
          <p className="water-day__note">
            {t(online ? 'water.day_note' : 'water.day_note_offline')}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function EntryRow({
  entry,
  units,
  online,
  onDelete,
}: {
  entry: DrinkEntry;
  units: Units;
  online: boolean;
  onDelete: () => void;
}) {
  const { t, num, locale } = useT();
  const volume = useVolume(units);
  // Not sent yet: the delete just drops it from the queue, so it works offline.
  const pending = useMealStatus(`drink:${entry.clientId}`) === 'pending';
  const can = online || pending;
  const { dragging, bind, confirm } = useSwipeDelete(
    can ? onDelete : undefined,
  );
  const name = entry.name ?? t(`drinks.${entry.drinkKey}` as 'drinks.water');
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
    new Date(entry.takenAt),
  );
  return (
    <li
      className={`water-day__row${dragging ? ' water-day__row--dragging' : ''}`}
      {...bind}
    >
      <div className="water-day__entry">
        <DishIllustration
          id={entry.illustration}
          size="var(--meal-thumb-size)"
        />
        <span className="water-day__main">
          <span className="water-day__name">{name}</span>
          <span className="water-day__sub">
            <span>
              {time} · {volume(entry.ml)}
              {!entry.countsWater && ` · ${t('water.not_water')}`}
            </span>
            {pending && (
              <Badge>
                <CloudOff aria-hidden="true" />
                {t('meal.status.pending')}
              </Badge>
            )}
          </span>
        </span>
        {entry.kcal > 0 && (
          <span className="water-day__kcal">
            {t('meal.kcal', { n: num(Math.round(entry.kcal)) })}
          </span>
        )}
        <button
          type="button"
          className="water-day__delete"
          aria-label={t('water.delete', {
            name,
            time,
            amount: volume(entry.ml),
          })}
          // aria-disabled, not disabled: it stays focusable and the note below says why.
          aria-disabled={!can || undefined}
          onClick={() => can && confirm()}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
