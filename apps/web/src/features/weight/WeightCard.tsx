import { useState } from 'react';
import { CircleAlert, CloudOff, Plus, Target, Weight } from 'lucide-react';
import {
  addDays,
  ageYears,
  calculateNorm,
  daysBetween,
  round1,
  weightFromKg,
  type ProfileResponse,
  type Units,
  type Weighing,
} from '@oct/shared';
import type { MealStatus } from '../../data/outbox';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
import { offerMaintain, useReachedLater } from '../profile/goalReached';
import './WeightCard.css';

const NB = ' ';
const MINUS = '−';
/** The mini chart covers the last 30 days, today included. */
const SPAN = 30;
// Plot box in px, as --weight-spark-width / --weight-spark-height.
const W = 128;
const H = 56;
const PAD = 6;

export type CardWeighing = Weighing & { status: MealStatus };

type Props = {
  /** Local today, `YYYY-MM-DD`. */
  today: string;
  units: Units;
  /** The weight diary by date ascending; undefined while loading. */
  weighings: readonly CardWeighing[] | undefined;
  /** Undefined while loading. */
  profile: ProfileResponse | undefined;
  /** The profile saves only online: «Switch» is greyed out offline. */
  online: boolean;
  onAdd: () => void;
  /** «Set goal»: the profile screen. */
  onSetGoal: () => void;
  /** «Switch» on «Goal reached»: the goal becomes «Maintain». */
  onMaintain: () => Promise<void>;
  /** Sends a refused weighing again. */
  onRetry: (w: Weighing) => void;
};

/** The «Weight» card, last on Today (OCT-189 §1). */
export function WeightCard({
  today,
  units,
  weighings,
  profile,
  online,
  onAdd,
  onSetGoal,
  onMaintain,
  onRetry,
}: Props) {
  const { t, locale } = useT();
  const [laterRev, later] = useReachedLater();
  const [saving, setSaving] = useState(false);
  const unit = t(units === 'us' ? 'unit.lb' : 'unit.kg');

  const head = (when?: string) => (
    <h2 className="weight-card__head">
      <Weight aria-hidden="true" />
      {t('weight_card.title')}
      {when && <span>· {when}</span>}
    </h2>
  );
  const add = (
    <Button variant="tonal" onClick={onAdd}>
      <Plus aria-hidden="true" />
      {t('weight_card.add')}
    </Button>
  );

  if (!weighings || !profile)
    return (
      <section
        className="weight-card"
        aria-label={t('weight_card.title')}
        aria-busy="true"
      >
        {head()}
        <div className="weight-card__top">
          <div className="weight-card__now">
            <Skeleton height="var(--text-large-title-size)" width="60%" />
            <Skeleton height="var(--text-subhead-size)" width="80%" />
          </div>
          <div className="weight-card__spark">
            <Skeleton height="100%" />
          </div>
        </div>
        <Skeleton height="var(--control-height)" />
      </section>
    );

  if (!weighings.length)
    return (
      <section className="weight-card" aria-label={t('weight_card.title')}>
        {head()}
        <div className="weight-card__invite">
          <span className="weight-card__invite-icon">
            <Weight aria-hidden="true" />
          </span>
          <div>
            <p className="weight-card__invite-title">
              {t('weight_card.empty_title')}
            </p>
            <p className="weight-card__muted">{t('weight_card.empty_body')}</p>
          </div>
        </div>
        {add}
      </section>
    );

  const n1 = (v: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(v);
  // A goal reads «73 kg», «160.9 lb».
  const n01 = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  const shown = (kg: number) => round1(weightFromKg(kg, units));
  const short = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    })
      .format(new Date(`${d}T00:00:00Z`))
      .replaceAll(' ', NB);

  const latest = weighings.at(-1)!;
  const prev = weighings.at(-2);
  const ago = daysBetween(latest.date, today);
  const when =
    ago <= 0
      ? t('weight_card.today')
      : ago === 1
        ? t('weight_card.yesterday')
        : t('weight_card.days_ago', { count: ago });

  let delta = t('weight_card.first');
  if (prev) {
    // Signed number, no color or arrow (AC-9.17); «0.0» has no sign.
    const d = round1(shown(latest.weightKg) - shown(prev.weightKg));
    const sign = d > 0 ? '+' : d < 0 ? MINUS : '';
    delta = t('weight_card.since', {
      diff: `${sign}${n1(Math.abs(d))}${NB}${unit}`,
      date: short(prev.date),
    });
  }

  // The goal as of the latest weighing, counted here (ADR-0016 §4).
  const p = { ...profile.profile, weightKg: latest.weightKg };
  const minor = p.birthDate !== null && ageYears(p.birthDate, today) < 18;
  const target =
    !minor && (p.goal === 'lose' || p.goal === 'gain')
      ? p.targetWeightKg
      : null;

  let goal = null;
  if (minor) {
    // Under 18: no goal row at all (AC-9.18).
  } else if (p.goal === 'maintain')
    goal = (
      <p className="weight-card__goal">
        <Target aria-hidden="true" />
        {t('weight_card.maintain')}
      </p>
    );
  else if (target === null)
    goal = (
      <p className="weight-card__goal">
        <Target aria-hidden="true" />
        <span className="weight-card__muted">{t('weight_card.no_goal')}</span>
        <button type="button" className="weight-card__link" onClick={onSetGoal}>
          {t('weight_card.set_goal')}
        </button>
      </p>
    );
  else {
    const goalText = `${n01(shown(target))}${NB}${unit}`;
    const left = round1(
      p.goal === 'lose'
        ? shown(latest.weightKg) - shown(target)
        : shown(target) - shown(latest.weightKg),
    );
    const calc = profile.manual ? null : calculateNorm(p, today);
    goal = offerMaintain(calc, p, profile.rev, laterRev) ? (
      <Banner
        tone="weight"
        title={t('weight_card.reached_title', { weight: goalText })}
        actions={
          <>
            <button
              type="button"
              disabled={!online || saving}
              onClick={() => {
                setSaving(true);
                void onMaintain().finally(() => setSaving(false));
              }}
            >
              {t('reached.go')}
            </button>
            <button type="button" onClick={() => later(profile.rev)}>
              {t('reached.later')}
            </button>
          </>
        }
      >
        {t('weight_card.reached_body')}
      </Banner>
    ) : (
      <p className="weight-card__goal">
        <Target aria-hidden="true" />
        {t('weight_card.goal', { weight: goalText })}{' '}
        <span className="weight-card__muted">
          {left > 0
            ? t('weight_card.to_go', { weight: `${n1(left)}${NB}${unit}` })
            : t('weight_card.goal_reached')}
        </span>
      </p>
    );
  }

  return (
    <section className="weight-card" aria-label={t('weight_card.title')}>
      {head(when)}
      <div className="weight-card__top">
        <div className="weight-card__now">
          <p className="weight-card__big">
            <b>{n1(shown(latest.weightKg))}</b>
            <span>{unit}</span>
          </p>
          <p className="weight-card__muted">{delta}</p>
          {latest.status === 'pending' && (
            <Badge>
              <CloudOff aria-hidden="true" />
              {t('meal.status.pending')}
            </Badge>
          )}
          {latest.status === 'error' && (
            <p className="weight-card__error">
              <Badge tone="err">
                <CircleAlert aria-hidden="true" />
                {t('meal.status.error')}
              </Badge>
              <button
                type="button"
                className="weight-card__link"
                onClick={() => onRetry(latest)}
              >
                {t('weight_card.retry')}
              </button>
            </p>
          )}
        </div>
        <Spark
          points={weighings.filter((w) => daysBetween(w.date, today) < SPAN)}
          today={today}
          target={target}
          label={t('weight_card.chart')}
        />
      </div>
      {goal}
      {add}
    </section>
  );
}

/** 30 days of weighings, the latest dot, the goal dashed; scaled to min..max, goal included. */
function Spark({
  points,
  today,
  target,
  label,
}: {
  points: readonly Weighing[];
  today: string;
  target: number | null;
  label: string;
}) {
  const ws = points.map((w) => w.weightKg);
  const lo = Math.min(...ws, target ?? Infinity);
  const hi = Math.max(...ws, target ?? -Infinity);
  const from = addDays(today, 1 - SPAN);
  const x = (d: string) =>
    PAD + ((W - 2 * PAD) * daysBetween(from, d)) / (SPAN - 1);
  // A flat diary sits in the middle.
  const y = (kg: number) =>
    hi === lo ? H / 2 : PAD + ((H - 2 * PAD) * (hi - kg)) / (hi - lo);
  const last = points.at(-1);
  return (
    <svg
      className="weight-card__spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      {target !== null && (
        <line
          className="weight-card__target"
          x1={0}
          x2={W}
          y1={y(target)}
          y2={y(target)}
        />
      )}
      {points.length > 1 && (
        <polyline
          className="weight-card__line"
          points={points.map((w) => `${x(w.date)},${y(w.weightKg)}`).join(' ')}
        />
      )}
      {last && (
        <circle
          className="weight-card__dot"
          cx={x(last.date)}
          cy={y(last.weightKg)}
        />
      )}
    </svg>
  );
}
