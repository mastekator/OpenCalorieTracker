import { memo, useMemo, useState, type CSSProperties } from 'react';
import { CircleAlert, CloudOff, Plus, Weight } from 'lucide-react';
import {
  trendChange,
  weightTrend,
  type ProfileResponse,
  type Units,
} from '@oct/shared';
import { useSession } from '../../app/SessionContext';
import {
  useDb,
  useProfile,
  useSettings,
  useWeighings,
} from '../../data/DataContext';
import { deleteWeighing, putWeighing } from '../../data/outbox';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { Button } from '../../ui/Button/Button';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Segment } from '../../ui/Segment/Segment';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
import { useToast } from '../../ui/Toast/Toast';
import { useToday } from '../diary/useToday';
import { saveProfile } from '../profile/ProfileScreen';
import { NB, useWeightFormat } from './format';
import { WeighInSheet } from './WeighInSheet';
import { goalTarget, WeightGoal, type CardWeighing } from './WeightCard';
import { WeightChart } from './WeightChart';
import {
  axisStart,
  periodStart,
  PERIODS,
  type WeightPeriod,
} from './weightScale';
import '../../ui/List/List.css';
import './WeightCard.css';
import './WeightScreen.css';

type Props = {
  /** Local today, `YYYY-MM-DD`. */
  today: string;
  units: Units;
  /** The weight diary by date ascending; undefined while loading. */
  weighings: readonly CardWeighing[] | undefined;
  /** Undefined while loading. */
  profile: ProfileResponse | undefined;
  online: boolean;
  onAdd: () => void;
  /** Opens a weighing in the edit sheet. */
  onEdit: (date: string) => void;
  onSetGoal: () => void;
  onMaintain: () => Promise<void>;
};

/** The weight screen (OCT-189 §3): summary, chart by period, every weighing by month. */
export function WeightView({
  today,
  units,
  weighings,
  profile,
  online,
  onAdd,
  onEdit,
  onSetGoal,
  onMaintain,
}: Props) {
  const { t } = useT();
  const f = useWeightFormat(units);
  const [period, setPeriod] = useState<WeightPeriod>('quarter');
  // The weighing picked on the chart or hovered in the list: they light up each other.
  const [selected, setSelected] = useState<string | null>(null);
  // Once over the whole history, so the start of a period does not jump (ADR-0016 §6).
  const trend = useMemo(() => weighings && weightTrend(weighings), [weighings]);

  const add = (
    <Button onClick={onAdd}>
      <Plus aria-hidden="true" />
      {t('weight_card.add')}
    </Button>
  );

  if (!weighings || !profile)
    return (
      <div className="weight-screen" aria-busy="true">
        <div className="weight-screen__card">
          <Skeleton height="var(--text-large-title-size)" width="40%" />
          <Skeleton />
          <Skeleton height="var(--chart-height)" />
        </div>
      </div>
    );

  if (!weighings.length)
    return (
      <ScreenState
        icon={<Weight />}
        title={t('weight_screen.empty_title')}
        action={add}
      >
        {t('weight_screen.empty_body')}
      </ScreenState>
    );

  const latest = weighings.at(-1)!;
  const start = periodStart(today, period);
  const from = start ?? weighings[0]!.date;
  const first = weighings.findIndex((w) => w.date >= from);
  const points = first < 0 ? [] : weighings.slice(first);
  const target = goalTarget(profile, today);
  const change = trendChange(weighings, from);
  const per = t(`weight_screen.per_${period}`);
  const diff =
    change === null ? null : `${f.signed(f.shown(change))}${NB}${f.unit}`;
  // The history is shorter than the period: say from when (OCT-446 §5).
  const firstDate = weighings[0]!.date;
  const since =
    start === null || firstDate > start
      ? firstDate.slice(0, 4) === today.slice(0, 4)
        ? f.short(firstDate)
        : f.shortYear(firstDate)
      : null;
  const label = t(since ? 'weight_screen.chart_since' : 'weight_screen.chart', {
    period: per,
    date: since ?? '',
    weight: f.weight(latest.weightKg),
    trend: diff === null ? '' : t('weight_screen.chart_trend', { diff }),
    goal:
      target === null
        ? ''
        : t('weight_screen.chart_goal', {
            weight: `${f.n01(f.shown(target))}${NB}${f.unit}`,
          }),
  });

  return (
    <div className="weight-screen">
      <section
        className="weight-screen__card"
        aria-label={t('weight_card.title')}
      >
        <div className="weight-card__now">
          <p className="weight-card__big">
            <b>{f.n1(f.shown(latest.weightKg))}</b>
            <span>
              {f.unit} · {f.when(latest.date, today)}
            </span>
          </p>
          <p className="weight-card__muted">
            {f.since(latest, weighings.at(-2))}
          </p>
        </div>
        <Segment
          label={t('weight_screen.period')}
          options={PERIODS.map((value) => ({
            value,
            label: t(`weight_screen.${value}`),
            aria:
              value === 'quarter' ? t('weight_screen.quarter_aria') : undefined,
          }))}
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setSelected(null);
          }}
        />
        {points.length === 0 ? (
          <p className="weight-card__muted weight-screen__none">
            {t('weight_screen.none', { period: per })}
          </p>
        ) : (
          <WeightChart
            points={points}
            trend={trend ? trend.slice(first) : null}
            start={axisStart(points[0]!.date, start, today)}
            today={today}
            units={units}
            target={target}
            label={label}
            selected={selected}
            onSelect={setSelected}
            onEdit={onEdit}
          />
        )}
        {points.length > 0 && (
          <p className="weight-card__muted">
            {diff === null
              ? t('weight_screen.trend_soon')
              : since
                ? t('weight_screen.trend_since', { date: since, diff })
                : t('weight_screen.trend', { period: per, diff })}
          </p>
        )}
        {points.length > 0 && (
          <p className="weight-screen__legend" aria-hidden="true">
            <span>
              <i className="weight-screen__key" />
              {t('weight_screen.legend_points')}
            </span>
            {trend && (
              <span>
                <i className="weight-screen__key weight-screen__key--trend" />
                {t('weight_screen.legend_trend')}
              </span>
            )}
            {target !== null && (
              <span>
                <i className="weight-screen__key weight-screen__key--goal" />
                {t('weight_screen.legend_goal')}
              </span>
            )}
          </p>
        )}
        <WeightGoal
          today={today}
          units={units}
          profile={profile}
          latest={latest}
          online={online}
          onSetGoal={onSetGoal}
          onMaintain={onMaintain}
        />
      </section>
      <div className="weight-screen__add">{add}</div>
      <WeightList
        weighings={weighings}
        units={units}
        selected={selected}
        onHover={setSelected}
        onEdit={onEdit}
      />
    </div>
  );
}

/**
 * «All weigh-ins» by month, newest first, each with its change since the one before.
 * Off-screen months are skipped by the browser (`content-visibility`), no virtualizing library
 * (ADR-0016 §6). shortcut: thousands of rows are still in the DOM; window the months with an
 * IntersectionObserver if 10 years of daily entries lag on slow phones.
 */
const WeightList = memo(function WeightList({
  weighings,
  units,
  selected,
  onHover,
  onEdit,
}: {
  weighings: readonly CardWeighing[];
  units: Units;
  selected: string | null;
  onHover: (date: string | null) => void;
  onEdit: (date: string) => void;
}) {
  const { t, locale } = useT();
  const f = useWeightFormat(units);
  // Formatted once per diary change, so a hover or a period switch re-renders two rows, not all.
  const months = useMemo(() => {
    const thisYear = weighings.at(-1)?.date.slice(0, 4);
    const monthName = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'long',
    });
    const out: { key: string; title: string; rows: RowProps[] }[] = [];
    for (let i = weighings.length - 1; i >= 0; i--) {
      const w = weighings[i]!;
      const prev = weighings[i - 1];
      const key = w.date.slice(0, 7);
      if (out.at(-1)?.key !== key) {
        const name = monthName.format(new Date(`${key}-01T00:00:00Z`));
        const year = key.slice(0, 4);
        out.push({
          key,
          title:
            name.charAt(0).toLocaleUpperCase(locale) +
            name.slice(1) +
            (year === thisYear ? '' : ` ${year}`),
          rows: [],
        });
      }
      out.at(-1)!.rows.push({
        date: w.date,
        day: f.day(w.date),
        diff: prev
          ? f.signed(f.shown(w.weightKg) - f.shown(prev.weightKg))
          : '',
        weight: f.weight(w.weightKg),
        status: w.status,
      });
    }
    return out;
  }, [weighings, units, locale]);

  return (
    <section className="weight-screen__list">
      <h2 className="list__title">{t('weight_card.all')}</h2>
      {months.map(({ key, title, rows }) => (
        <section
          key={key}
          className="weight-screen__month"
          style={{ '--rows': rows.length } as CSSProperties}
        >
          <h3 className="list__title">{title}</h3>
          <ul className="list__rows">
            {rows.map((row) => (
              <WeightRow
                key={row.date}
                {...row}
                selected={row.date === selected}
                onHover={onHover}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
});

type RowProps = {
  date: string;
  /** «Thu, Nov 12» */
  day: string;
  /** Change since the weighing before, «−0.8»; empty for the first. */
  diff: string;
  weight: string;
  status: CardWeighing['status'];
};

const WeightRow = memo(function WeightRow({
  date,
  day,
  diff,
  weight,
  status,
  selected,
  onHover,
  onEdit,
}: RowProps & {
  selected: boolean;
  onHover: (date: string | null) => void;
  onEdit: (date: string) => void;
}) {
  const { t } = useT();
  return (
    <li className="list__item">
      <button
        type="button"
        className="list-row list-row--interactive weight-screen__row"
        data-selected={selected || undefined}
        onClick={() => onEdit(date)}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') onHover(date);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') onHover(null);
        }}
      >
        <span className="list-row__label">
          {day}
          {status !== 'synced' && (
            <span className="list-row__description">
              {status === 'pending' ? (
                <Badge>
                  <CloudOff aria-hidden="true" />
                  {t('meal.status.pending')}
                </Badge>
              ) : (
                <Badge tone="err">
                  <CircleAlert aria-hidden="true" />
                  {t('meal.status.error')}
                </Badge>
              )}
            </span>
          )}
        </span>
        <span className="weight-screen__diff">{diff}</span>
        <b className="weight-screen__weight">{weight}</b>
      </button>
    </li>
  );
});

/** The weight screen with its data and the log / edit sheet. */
export function WeightScreen({ onSetGoal }: { onSetGoal: () => void }) {
  const today = useToday();
  const db = useDb();
  const { t } = useT();
  const toast = useToast();
  const online = useOnline();
  const { user } = useSession();
  const settings = useSettings();
  const units = settings?.units ?? user?.units ?? 'metric';
  const profile = useProfile();
  const weighings = useWeighings();
  // undefined: closed; null: a new weighing; a date: that weighing.
  const [sheet, setSheet] = useState<string | null | undefined>();

  return (
    <>
      <WeightView
        today={today}
        units={units}
        weighings={weighings}
        profile={profile}
        online={online}
        onAdd={() => setSheet(null)}
        onEdit={setSheet}
        onSetGoal={onSetGoal}
        onMaintain={() =>
          profile
            ? saveProfile(db, {
                profile: {
                  ...profile.profile,
                  goal: 'maintain',
                  targetWeightKg: null,
                  deadline: null,
                },
                manual: profile.manual,
              }).then(
                () => toast({ text: t('save.done') }),
                () => toast({ text: t('save.error') }),
              )
            : Promise.resolve()
        }
      />
      {profile && weighings && (
        <WeighInSheet
          open={sheet !== undefined}
          onClose={() => setSheet(undefined)}
          today={today}
          units={units}
          weighings={weighings}
          profile={profile}
          edit={sheet ?? undefined}
          onPut={(date, kg) => putWeighing(db, date, kg)}
          onDelete={(date) => deleteWeighing(db, date)}
        />
      )}
    </>
  );
}
