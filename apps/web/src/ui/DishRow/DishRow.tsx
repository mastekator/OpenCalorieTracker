import type { ReactNode } from 'react';
import { CircleAlert, CirclePlus, Pencil, Trash2 } from 'lucide-react';
import {
  gToOz,
  type DishSource,
  type IllustrationId,
  type Nutrients,
  type Units,
} from '@oct/shared';
import { Badge } from '../Badge/Badge';
import { useT } from '../../i18n';
import { ConfidenceBadge } from '../ConfidenceBadge/ConfidenceBadge';
import { SourceBadge } from '../SourceBadge/SourceBadge';
import {
  DishIllustration,
  illustrationLabel,
} from '../DishIllustration/DishIllustration';
import { useSwipeDelete } from '../useSwipeDelete';
import { WeightStepper } from '../WeightStepper/WeightStepper';
import './DishRow.css';

export type DishRowDish = Nutrients & {
  name: string;
  /** Null while the weight field is invalid; the numbers stay as last valid. */
  grams: number | null;
  source: DishSource;
  /** AI only; dropped by the screen after a weight or name edit (AC-2.9). */
  confidence?: number;
  /** `source: 'barcode'`: the numbers are the user's own product (E-8). */
  mine?: boolean;
  /** Another barcode was read on the package: «check», the sheet offers it (OCT-383 1.1). */
  check?: boolean;
  /** Shown left of the name and macros (OCT-33). */
  illustration?: IllustrationId;
};

type Props = {
  dish: DishRowDish;
  units: Units;
  onGramsChange: (grams: number | null) => void;
  /** Opens the «Dish» sheet: rename, weight, delete (OCT-16 4.4). */
  onEdit: () => void;
  /** Phone: swipe left reveals «Delete», a full swipe deletes; desktop: a trash button (OCT-16 4.5, §5). */
  onDelete?: () => void;
  /** Tap on the illustration: the «Dish picture» sheet (OCT-33 4.1); none: decorative only. */
  onIllustration?: () => void;
  /** After «Refine» / «Recognize again» / an answer (OCT-234 C, H): «new», or «changed, was …» with the old name, weight or kcal. */
  mark?:
    | { kind: 'new' }
    | { kind: 'changed'; name: string; grams: number; kcal?: number };
  /** Under the row's weight: the AI's question (OCT-234 H). */
  children?: ReactNode;
};

/** One dish on the edit screen: name and kcal, source badge and macros, weight stepper, delete. */
export function DishRow({
  dish,
  units,
  onGramsChange,
  onEdit,
  onDelete,
  onIllustration,
  mark,
  children,
}: Props) {
  const { t, num, locale } = useT();
  const was =
    mark?.kind !== 'changed'
      ? null
      : mark.name !== dish.name
        ? mark.name
        : mark.grams === dish.grams && mark.kcal !== undefined
          ? t('meal.kcal', { n: num(mark.kcal) }).replace(' ', '\u00a0') // «was 420 kcal» never splits
          : units === 'us'
            ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(gToOz(mark.grams))}\u00a0${t('unit.oz')}`
            : `${num(mark.grams)}\u00a0${t('unit.g')}`;
  const { offset, dragging, remove, bind, confirm } = useSwipeDelete(onDelete);
  return (
    <>
      <div
        className={`dish-row-swipe${dragging ? ' dish-row-swipe--dragging' : ''}${offset ? ' dish-row-swipe--shifted' : ''}`}
        {...bind}
      >
        <div
          className={`dish-row${dish.illustration ? ' dish-row--illo' : ''}${mark ? ' dish-row--marked' : ''}`}
        >
          {dish.illustration &&
            (onIllustration ? (
              <button
                type="button"
                className="dish-row__illo dish-row__illo--button"
                aria-label={t('edit.illo.change', {
                  name: illustrationLabel(dish.illustration, locale),
                })}
                onClick={onIllustration}
              >
                <DishIllustration id={dish.illustration} />
                <span className="dish-row__illo-dot" aria-hidden="true">
                  <Pencil />
                </span>
              </button>
            ) : (
              <span className="dish-row__illo">
                <DishIllustration id={dish.illustration} />
              </span>
            ))}
          <div className="dish-row__head">
            <button
              type="button"
              className="dish-row__name"
              tabIndex={-1} // the pencil is the keyboard and screen reader path
              onClick={onEdit}
            >
              {dish.name}
            </button>
            <span className="dish-row__kcal tabular-nums">
              {t('meal.kcal', { n: num(dish.kcal) })}
            </span>
          </div>
          <div className="dish-row__meta">
            {/* A recipe answer: its «recipe» badge says it instead (OCT-352 3.2). */}
            {mark && !(mark.kind === 'changed' && dish.source === 'recipe') && (
              // Not by colour only: an icon and a word (AC-3.1).
              <span className={`dish-row__mark dish-row__mark--${mark.kind}`}>
                <Badge tone="ok">
                  {mark.kind === 'new' ? (
                    <CirclePlus aria-hidden="true" />
                  ) : (
                    <Pencil aria-hidden="true" />
                  )}
                  {t(`edit.refine.mark.${mark.kind}`)}
                </Badge>
              </span>
            )}
            {dish.source === 'barcode' || dish.source === 'label' ? (
              <SourceBadge kind={dish.mine ? 'mine' : dish.source} />
            ) : (
              <ConfidenceBadge
                source={dish.source}
                confidence={dish.confidence}
              />
            )}
            {dish.check && (
              <Badge tone="warn">
                <CircleAlert aria-hidden="true" />
                {t('edit.conf.low')}
              </Badge>
            )}
            <span className="tabular-nums">
              {t('edit.macros', {
                p: num(dish.proteinG),
                f: num(dish.fatG),
                c: num(dish.carbsG),
              })}
            </span>
          </div>
          <div className="dish-row__weight">
            <div className="dish-row__weight-main">
              <WeightStepper
                grams={dish.grams}
                units={units}
                label={t('edit.weight.label', { dish: dish.name })}
                onChange={onGramsChange}
              />
              {was && (
                <p
                  className={`dish-row__was${mark?.kind === 'changed' && mark.name !== dish.name ? ' dish-row__was--name' : ''}`}
                >
                  {t('edit.refine.mark.was', { what: was })}
                </p>
              )}
            </div>
            <button
              type="button"
              className="dish-row__edit"
              aria-label={t('edit.edit', { dish: dish.name })}
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" />
            </button>
          </div>
        </div>
        {onDelete && (
          // Always in the DOM: the screen reader's «Delete» and the keyboard reach it without a swipe.
          <button
            ref={remove}
            type="button"
            className="dish-row__delete"
            aria-label={t('edit.delete_dish', { dish: dish.name })}
            onClick={confirm}
          >
            <Trash2 aria-hidden="true" />
            <span className="dish-row__delete-text">{t('edit.delete')}</span>
          </button>
        )}
      </div>
      {/* Outside the row: only the row takes the «changed» fill, the question stays on the surface (OCT-352 3.2). */}
      {children && <div className="dish-row__extra">{children}</div>}
    </>
  );
}
