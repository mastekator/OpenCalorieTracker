import { useState } from 'react';
import {
  ChevronRight,
  CircleAlert,
  CloudOff,
  Plus,
  Target,
  Weight,
} from 'lucide-react';
import {
  addDays,
  ageYears,
  calculateNorm,
  daysBetween,
  round1,
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
import { NB, useWeightFormat } from './format';
import './WeightCard.css';

/** The mini chart covers the last 30 days, today included. */
const SPAN = 30;
// Plot box in px, as --weight-spark-width / --weight-spark-height.
const W = 128;
const H = 56;
const PAD = 6;
/** The smallest vertical span, kg: small swings stay small (OCT-189 §1). */
const MIN_RANGE_KG = 2;

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
  /** The weight screen: the weight, the chart and «All weigh-ins». */
  onOpen: () => void;
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
  onOpen,
  onSetGoal,
  onMaintain,
  onRetry,
}: Props) {
  const { t } = useT();
  const f = useWeightFormat(units);

  const head = (when?: string) => (
    <div className="weight-card__bar">
      <h2 className="weight-card__head">
        <Weight aria-hidden="true" />
        {t('weight_card.title')}
        {when && <span>· {when}</span>}
      </h2>
      {when && (
        <button type="button" className="weight-card__link" onClick={onOpen}>
          {t('weight_card.all')}
          <ChevronRight aria-hidden="true" />
        </button>
      )}
    </div>
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

  const latest = weighings.at(-1)!;
  const target = goalTarget(profile, today);

  // No weighing in 30 days: no chart, a lone goal dash reads as broken.
  const recent = weighings.filter((w) => daysBetween(w.date, today) < SPAN);

  return (
    <section className="weight-card" aria-label={t('weight_card.title')}>
      {head(f.when(latest.date, today))}
      <div
        className="weight-card__top weight-card__top--link"
        // A tap on the weight or the chart opens the screen; the keyboard has «All weigh-ins».
        onClick={(e) => {
          if (!(e.target as Element).closest('button')) onOpen();
        }}
      >
        <div className="weight-card__now">
          <p className="weight-card__big">
            <b>{f.n1(f.shown(latest.weightKg))}</b>
            <span>{f.unit}</span>
          </p>
          <p className="weight-card__muted">
            {f.since(latest, weighings.at(-2))}
          </p>
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
        {recent.length > 0 && (
          <Spark
            points={recent}
            today={today}
            target={target}
            label={t('weight_card.chart')}
          />
        )}
      </div>
      <WeightGoal
        today={today}
        units={units}
        profile={profile}
        latest={latest}
        online={online}
        onSetGoal={onSetGoal}
        onMaintain={onMaintain}
      />
      {add}
    </section>
  );
}

/** The target weight the charts dash; null under 18 or without a lose / gain goal. */
export function goalTarget(profile: ProfileResponse, today: string) {
  const p = profile.profile;
  const minor = p.birthDate !== null && ageYears(p.birthDate, today) < 18;
  return !minor && (p.goal === 'lose' || p.goal === 'gain')
    ? p.targetWeightKg
    : null;
}

type GoalProps = Pick<
  Props,
  'today' | 'units' | 'online' | 'onSetGoal' | 'onMaintain'
> & { profile: ProfileResponse; latest: Weighing };

/** The goal row under the weight: goal and what is left, «Set goal», or «Goal reached» (OCT-189 §1). */
export function WeightGoal({
  today,
  units,
  profile,
  latest,
  online,
  onSetGoal,
  onMaintain,
}: GoalProps) {
  const { t } = useT();
  const f = useWeightFormat(units);
  const [laterRev, later] = useReachedLater();
  const [saving, setSaving] = useState(false);
  const p = { ...profile.profile, weightKg: latest.weightKg };
  const target = goalTarget(profile, today);

  // Under 18: no goal row at all (AC-9.18).
  if (p.birthDate !== null && ageYears(p.birthDate, today) < 18) return null;
  if (p.goal === 'maintain')
    return (
      <p className="weight-card__goal">
        <Target aria-hidden="true" />
        {t('weight_card.maintain')}
      </p>
    );
  if (target === null)
    return (
      <p className="weight-card__goal">
        <Target aria-hidden="true" />
        <span className="weight-card__muted">{t('weight_card.no_goal')}</span>
        <button type="button" className="weight-card__link" onClick={onSetGoal}>
          {t('weight_card.set_goal')}
        </button>
      </p>
    );
  const goalText = `${f.n01(f.shown(target))}${NB}${f.unit}`;
  const left = round1(
    p.goal === 'lose'
      ? f.shown(latest.weightKg) - f.shown(target)
      : f.shown(target) - f.shown(latest.weightKg),
  );
  const calc = profile.manual ? null : calculateNorm(p, today);
  return offerMaintain(calc, p, profile.rev, laterRev) ? (
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
          ? t('weight_card.to_go', { weight: `${f.n1(left)}${NB}${f.unit}` })
          : t('weight_card.goal_reached')}
      </span>
    </p>
  );
}

/** 30 days of weighings, the latest dot, the goal dashed; scaled to min..max, goal included, at least MIN_RANGE_KG tall. */
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
  const min = Math.min(...ws, target ?? Infinity);
  const max = Math.max(...ws, target ?? -Infinity);
  const grow = Math.max(0, MIN_RANGE_KG - (max - min)) / 2;
  const lo = min - grow;
  const hi = max + grow;
  const from = addDays(today, 1 - SPAN);
  const x = (d: string) =>
    PAD + ((W - 2 * PAD) * daysBetween(from, d)) / (SPAN - 1);
  const y = (kg: number) => PAD + ((H - 2 * PAD) * (hi - kg)) / (hi - lo);
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
