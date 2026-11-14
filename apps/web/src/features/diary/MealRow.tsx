import type { Meal } from '@oct/shared';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Moon, Trash2, Utensils } from 'lucide-react';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
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

/** Below this a move is still a tap. */
const SLOP_PX = 8;
/** A full swipe past this share of the row deletes at once. */
const FULL_SWIPE = 0.6;
/** tan 30°: a steeper move is a scroll, not a swipe. */
const MAX_SLOPE = 0.577;

type Drag = { x: number; y: number; from: number; swiping?: boolean };

/** A meal in a `List` on Today / Diary: thumbnail, type, time, dishes, kcal. */
export function MealRow({ meal, onOpen, onDelete, highlight }: Props) {
  const { t, num, locale } = useT();
  // A preview that fails to load (offline, not cached) falls back to the icon.
  const [broken, setBroken] = useState(false);
  // Row offset in px: 0 closed, −(delete width) open, anything between while dragging.
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const remove = useRef<HTMLButtonElement>(null);
  const type = t(`meal.type.${meal.mealType}`);
  const time = new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(localClock(meal));
  const onPointerDown = (event: PointerEvent<HTMLLIElement>) => {
    // Mouse: the trash button, no swipe (D.2).
    swiped.current = false;
    if (!onDelete || event.pointerType === 'mouse') return;
    drag.current = { x: event.clientX, y: event.clientY, from: offset };
  };
  const onPointerMove = (event: PointerEvent<HTMLLIElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (d.swiping === undefined) {
      if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
      d.swiping = Math.abs(dy) < Math.abs(dx) * MAX_SLOPE;
      if (!d.swiping) return void (drag.current = null);
      swiped.current = true;
      setDragging(true);
    }
    setOffset(Math.min(0, d.from + dx));
  };
  const onPointerUp = (event: PointerEvent<HTMLLIElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d?.swiping) return;
    const x = Math.min(0, d.from + event.clientX - d.x);
    const reveal = remove.current?.offsetWidth ?? 0;
    if (-x > event.currentTarget.offsetWidth * FULL_SWIPE) {
      setOffset(0);
      onDelete?.();
    } else setOffset(-x > reveal / 2 ? -reveal : 0);
  };

  return (
    <li
      className={`list__item meal-row${highlight ? ' meal-row--new' : ''}${dragging ? ' meal-row--dragging' : ''}${offset ? ' meal-row--shifted' : ''}`}
      style={{ '--swipe-offset': `${offset}px` } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        setOffset(0);
      }}
      onClickCapture={(event) => {
        // A click that ends a swipe does nothing; a tap on an open row closes it.
        if (swiped.current) {
          swiped.current = false;
          event.stopPropagation();
        } else if (
          offset !== 0 &&
          !remove.current?.contains(event.target as Node)
        ) {
          event.stopPropagation();
          setOffset(0);
        }
      }}
    >
      <button
        type="button"
        className="list-row list-row--interactive meal-row__open"
        onClick={onOpen}
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
          <span className="meal-row__thumb meal-row__thumb--icon">
            <Utensils aria-hidden="true" />
          </span>
        )}
        <span className="meal-row__main">
          <span className="meal-row__title">
            {type}
            <span className="meal-row__time">{time}</span>
          </span>
          <span className="meal-row__dishes">
            {meal.items.map((item) => item.name).join(', ')}
          </span>
          {isLate(meal) && (
            <span className="meal-row__badges">
              <Badge>
                <Moon aria-hidden="true" />
                {t('meal.status.late')}
              </Badge>
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
          onClick={() => {
            setOffset(0);
            onDelete();
          }}
        >
          <Trash2 aria-hidden="true" />
          <span className="meal-row__delete-text">{t('diary.delete')}</span>
        </button>
      )}
    </li>
  );
}
