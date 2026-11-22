import { diffMeals, type Meal, type Units } from '@oct/shared';
import { RefreshCw } from 'lucide-react';
import { localClock } from '../../features/diary/mealTime';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';
import { Sheet } from '../Sheet/Sheet';
import { VersionCard, type VersionRow } from '../VersionCard/VersionCard';
import { useWeight } from '../weightUnits';
import './ConflictSheet.css';

export type Side = 'this' | 'other';

type Props = {
  /** The local version and when it was edited here. */
  mine: Meal;
  editedAt?: number;
  /** The server's version from the 409. */
  theirs: Meal;
  /** Theirs changed while the screen was open, or a choice came back `stale` (2.4). */
  updated?: boolean;
  /** «1 of 3» when several meals wait. */
  progress?: { i: number; n: number };
  units: Units;
  desktop?: boolean;
  onKeep: (side: Side) => void;
  /** Choose later: the badge stays (AC-4.5). */
  onClose: () => void;
};

type Dish = Meal['items'][number];

/** «Which version should we keep?» (OCT-157 §2): full-screen sheet on the phone, dialog on desktop. */
export function ConflictSheet({
  mine,
  editedAt,
  theirs,
  updated,
  progress,
  units,
  desktop,
  onKeep,
  onClose,
}: Props) {
  const { t, num, locale } = useT();
  const w = useWeight(units);
  const { fields, dishes } = diffMeals(mine, theirs);
  const when = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(Date.parse(mine.localDate));

  const field = (f: (typeof fields)[number], m: Meal): VersionRow => ({
    key: f,
    field: true,
    label: t(
      `sync.conflict.field.${f === 'mealType' ? 'type' : f === 'eatenAt' ? 'when' : 'photo'}`,
    ),
    value:
      f === 'mealType' ? (
        t(`meal.type.${m.mealType}`)
      ) : f === 'eatenAt' ? (
        when.format(localClock(m))
      ) : m.photo ? (
        <img
          className="version-card__thumb"
          src={`/api/photos/${encodeURIComponent(m.photo.id)}?size=preview`}
          alt=""
        />
      ) : (
        t('sync.conflict.photo_none')
      ),
  });
  const amount = (d: Dish) =>
    `${w.as(d.unit ?? 'g').text(d.grams)} · ${t('meal.kcal', { n: num(d.kcal) })}`;
  const dish = (key: string, x: Dish | null, other: Dish | null): VersionRow =>
    x
      ? {
          key,
          label: x.name,
          value: amount(x),
          note: other ? undefined : 'only',
        }
      : { key, label: other!.name, value: '—', note: 'missing' };

  const card = (side: Side, m: Meal) => {
    const pick = (d: (typeof dishes)[number]) =>
      side === 'this' ? [d.mine, d.theirs] : [d.theirs, d.mine];
    return (
      <VersionCard
        side={side}
        desktop={desktop}
        editedAt={side === 'this' ? editedAt : theirs.editedAt}
        kcal={m.kcal}
        updated={side === 'other' && updated}
        rows={[
          ...fields.map((f) => field(f, m)),
          ...dishes.flatMap((d, i) =>
            d.changed ? [dish(`d${i}`, ...(pick(d) as [Dish, Dish]))] : [],
          ),
        ]}
        unchanged={dishes.flatMap((d, i) =>
          d.changed ? [] : [dish(`d${i}`, d.mine, d.theirs)],
        )}
        onKeep={() => onKeep(side)}
      />
    );
  };

  return (
    <Sheet
      open
      full
      onClose={onClose}
      closeLabel={t('sync.conflict.close_a11y')}
      title={`${t(`meal.type.${mine.mealType}`)}, ${day}`}
    >
      <div className="conflict-sheet">
        <p className="conflict-sheet__question">
          <span>{t('sync.conflict.question')}</span>
          {progress && progress.n > 1 && (
            <span className="conflict-sheet__progress">
              {t('sync.conflict.progress', progress)}
            </span>
          )}
        </p>
        {updated && (
          <Banner
            tone="warning"
            icon={<RefreshCw aria-hidden="true" />}
            title={t('sync.conflict.updated.title')}
          >
            {t('sync.conflict.updated.body')}
          </Banner>
        )}
        <div className="conflict-sheet__cards">
          {card('this', mine)}
          {card('other', theirs)}
        </div>
      </div>
    </Sheet>
  );
}
