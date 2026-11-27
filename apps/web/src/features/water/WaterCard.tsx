import { useEffect, useId, useRef, useState } from 'react';
import { Check, Droplet, Plus } from 'lucide-react';
import type { IllustrationId, Units } from '@oct/shared';
import { useT } from '../../i18n';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { useVolume } from './format';
import './WaterCard.css';

/** One tap logs this much (AC-3.2). */
export const TAP_ML = 250;
/** `YYYY-MM-DD` the goal sparks last played: once a day (OCT-147 1.4). */
export const SPARKS_KEY = 'oct.water.sparks';

export type DrinkTileInfo = {
  /** `water`, a built-in key or `custom:<id>`. */
  key: string;
  name: string;
  illustration: IllustrationId;
  countsWater: boolean;
};

type Props = {
  /** Local today, `YYYY-MM-DD`. */
  today: string;
  /** Water drunk today, ml. */
  ml: number;
  goalMl: number;
  units: Units;
  /** The row in `drinkRowOrder`. */
  drinks: readonly DrinkTileInfo[];
  /** No entry in the local copy yet: how to log (OCT-147 1.6). */
  hint: boolean;
  onLog: (key: string) => void;
};

// Glass geometry from the OCT-147 prototype, viewBox 0 0 100 120.
const OUTER = 'M14 10h72l-8.4 98.5q-.6 6.5-7 6.5H29.4q-6.4 0-7-6.5z';
const INNER = 'M18.5 13h63l-7.8 89.5q-.4 3.5-4 3.5H30.3q-3.6 0-4-3.5z';
const BASE =
  'M26.3 102.5q.4 3.5 4 3.5h39.4q3.6 0 4-3.5l-.6 6q-.6 6.5-7 6.5H33q-6.4 0-7-6.5z';
// 30-unit period, so a −30 shift loops seamlessly.
const wave = (amp: number) =>
  `M-30 0q7.5-${amp} 15 0${' t15 0'.repeat(13)}V5H-30z`;
/** Surface y: the inner floor is at 106, 100 % sits a finger below the rim. */
export const levelY = (pct: number) => 106 - Math.min(100, pct) * 0.86;
const BUBBLES = [
  [42, 2.2, 0, -6],
  [55, 1.6, 0.15, 5],
  [48, 1.2, 0.3, -3],
  [60, 2, 0.45, 2],
  [38, 1.4, 0.55, 4],
] as const;

/** OCT-147 §1: the «Water» card on Today — glass, amount, and the drinks row. */
export function WaterCard({
  today,
  ml,
  goalMl,
  units,
  drinks,
  hint,
  onLog,
}: Props) {
  const { t } = useT();
  const volume = useVolume(units);
  const id = useId();
  const pct = Math.round((ml / goalMl) * 100);
  const done = ml >= goalMl;
  const y = levelY(pct);
  // «750» large, «ml» small (OCT-147 1.1).
  const [big, unit] = volume(ml).split('\u00a0');

  // A rise replays the pour: drop, slosh and bubbles restart under a new key.
  const prev = useRef(ml);
  const [pour, setPour] = useState(0);
  useEffect(() => {
    if (ml > prev.current) setPour((n) => n + 1);
    prev.current = ml;
  }, [ml]);

  const [sparkle, setSparkle] = useState(false);
  useEffect(() => {
    if (!done || localStorage.getItem(SPARKS_KEY) === today) return;
    localStorage.setItem(SPARKS_KEY, today);
    setSparkle(true);
  }, [done, today]);

  return (
    <section className="water-card" aria-label={t('water.title')}>
      <div className="water-card__top">
        <svg
          className="water-glass"
          viewBox="0 0 100 120"
          aria-hidden="true"
          style={{ ['--water-grad' as string]: `url(#${id}g)` }}
        >
          <defs>
            <clipPath id={`${id}c`}>
              <path d={INNER} />
            </clipPath>
            <linearGradient
              id={`${id}g`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="-4"
              x2="0"
              y2="100"
            >
              <stop offset="0" className="water-glass__top" />
              <stop offset="1" className="water-glass__bottom" />
            </linearGradient>
          </defs>
          {done && (
            <g
              className={`water-glass__sparks${sparkle ? ' water-glass__sparks--play' : ''}`}
            >
              <path d="M6 34l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
              <path d="M93 20l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" />
              <path d="M96 52l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" />
            </g>
          )}
          <path className="water-glass__glass" d={OUTER} />
          <g clipPath={`url(#${id}c)`}>
            <g
              className="water-glass__level"
              data-testid="water-level"
              style={{ transform: `translateY(${y}px)` }}
            >
              <g
                key={pour}
                className={`water-glass__crest${pour ? ' water-glass__crest--slosh' : ''}`}
              >
                <path className="water-glass__wave-back" d={wave(2.5)} />
                <path
                  className="water-glass__wave-front"
                  d={wave(3)}
                  transform="translate(-12 1)"
                />
              </g>
              <rect
                className="water-glass__body"
                x="0"
                y="4"
                width="100"
                height="120"
              />
            </g>
            {pour > 0 && (
              <g key={pour} className="water-glass__pour">
                <path
                  className="water-glass__drop"
                  style={{ ['--fall' as string]: `${y + 4}px` }}
                  d="M50 -2q3.4 4.6 3.4 7a3.4 3.4 0 0 1-6.8 0q0-2.4 3.4-7z"
                />
                {BUBBLES.map(([cx, r, delay, dx]) => (
                  <circle
                    key={cx}
                    className="water-glass__bubble"
                    cx={cx}
                    cy="102"
                    r={r}
                    style={{
                      ['--rise' as string]: `${y - 98}px`,
                      ['--dx' as string]: `${dx}px`,
                      animationDelay: `calc(var(--duration-fill) * ${delay})`,
                    }}
                  />
                ))}
              </g>
            )}
          </g>
          <path className="water-glass__base" d={BASE} />
          <ellipse
            className="water-glass__rim"
            cx="50"
            cy="10"
            rx="36"
            ry="2.2"
          />
          <path
            className="water-glass__glint"
            d="M22 18q1.8-1 2.6.4l6 80q0 1.8-1.6 1.6q-1.2-.2-1.4-1.6z"
          />
        </svg>
        <div className="water-card__sum">
          <span className="water-card__label">
            <Droplet aria-hidden="true" />
            {t('water.title')}
          </span>
          <span className="water-card__big">
            {big}
            <span className="water-card__unit">{unit}</span>
          </span>
          <span className="water-card__of">
            {t('water.of', { goal: volume(goalMl), pct })}
          </span>
          {done && (
            <span className="water-card__done">
              <Check aria-hidden="true" />
              {t('water.done')}
            </span>
          )}
        </div>
      </div>
      <ul
        className="water-card__drinks"
        aria-label={t('water.row', { amount: volume(TAP_ML) })}
      >
        {drinks.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              className="drink-tile"
              aria-label={t(
                d.countsWater ? 'water.log' : 'water.log_no_water',
                {
                  name: d.name,
                  amount: volume(TAP_ML),
                },
              )}
              onClick={() => onLog(d.key)}
            >
              <DishIllustration
                id={d.illustration}
                size="var(--drink-tile-size)"
              />
              <span className="drink-tile__plus" aria-hidden="true">
                <Plus />
              </span>
              <span className="drink-tile__name" aria-hidden="true">
                {d.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hint && (
        <p className="water-card__hint">
          {t('water.hint', { amount: volume(TAP_ML) })}
        </p>
      )}
    </section>
  );
}
