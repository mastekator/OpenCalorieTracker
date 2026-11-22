import { mealIllustration, type Meal } from '@oct/shared';
import { useState } from 'react';
import { CircleAlert, CloudOff, GitCompare, Moon, Trash2 } from 'lucide-react';
import { useMealStatus } from '../../data/DataContext';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { useSwipeDelete } from '../../ui/useSwipeDelete';
import { useConflictSheet } from './conflicts';
import { isLate, localClock } from './mealTime';
import './MealRow.css';

type Props = {
  meal: Meal;
  /** Opens the meal for editing (screen 4). */
  onOpen: () => void;
  /** Phone: swipe left reveals «Delete», a full swipe deletes; desktop: a trash button (OCT-19 6.3, D.2). */
  onDelete?: () => void;
  /** Just saved: the row flashes accent-soft once (OCT-16 A.6). */
  highlight?: boolean;
};

/** A meal in a `List` on Today / Diary: thumbnail, type, time, dishes, kcal. */
export function MealRow({ meal, onOpen, onDelete, highlight }: Props) {
  const { t, num, locale } = useT();
  // A preview that fails to load (offline, not cached) falls back to the illustration.
  const [broken, setBroken] = useState(false);
  const { offset, dragging, remove, bind, confirm } = useSwipeDelete(onDelete);
  const status = useMealStatus(meal.clientId);
  const queued = status !== undefined && status !== 'synced';
  const conflicts = useConflictSheet();
  // Waiting for a version choice: the tap opens the choice, not the editor (OCT-157 1.1).
  const choose = conflicts?.ids.has(meal.clientId);
  const type = t(`meal.type.${meal.mealType}`);
  const time = new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(localClock(meal));
  return (
    <li
      className={`list__item meal-row${highlight ? ' meal-row--new' : ''}${dragging ? ' meal-row--dragging' : ''}${offset ? ' meal-row--shifted' : ''}`}
      {...bind}
    >
      <button
        type="button"
        className="list-row list-row--interactive meal-row__open"
        onClick={choose ? () => conflicts!.open(meal.clientId) : onOpen}
      >
        {meal.photo && !broken ? (
          <img
            className="meal-row__thumb"
            src={`/api/photos/${encodeURIComponent(meal.photo.id)}?size=preview`}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <DishIllustration
            id={mealIllustration(meal.items)}
            size="var(--meal-thumb-size)"
          />
        )}
        <span className="meal-row__main">
          <span className="meal-row__title">
            {type}
            <span className="meal-row__time">{time}</span>
          </span>
          <span className="meal-row__dishes">
            {meal.items.map((item) => item.name).join(', ')}
          </span>
          {(queued || isLate(meal)) && (
            <span className="meal-row__badges">
              {status === 'pending' && (
                <Badge>
                  <CloudOff aria-hidden="true" />
                  {t('meal.status.pending')}
                </Badge>
              )}
              {status === 'conflict' && (
                <Badge tone="warn">
                  <GitCompare aria-hidden="true" />
                  {t('meal.status.conflict')}
                </Badge>
              )}
              {status === 'error' && (
                <Badge tone="err">
                  <CircleAlert aria-hidden="true" />
                  {t('meal.status.error')}
                </Badge>
              )}
              {isLate(meal) && (
                <Badge>
                  <Moon aria-hidden="true" />
                  {t('meal.status.late')}
                </Badge>
              )}
            </span>
          )}
        </span>
        <span className="meal-row__kcal">
          {t('meal.kcal', { n: num(meal.kcal) })}
        </span>
      </button>
      {onDelete && (
        // Always in the DOM: VoiceOver and the keyboard reach it without a swipe.
        <button
          ref={remove}
          type="button"
          className="meal-row__delete"
          aria-label={t('meal.delete', { meal: type })}
          onClick={confirm}
        >
          <Trash2 aria-hidden="true" />
          <span className="meal-row__delete-text">{t('diary.delete')}</span>
        </button>
      )}
    </li>
  );
}
