import { useEffect, useState, type ReactNode } from 'react';
import { ImagePlus, Pencil, Utensils } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  remainingOf,
  sumDay,
  summarize,
  weekOf,
  type Macros,
  type Meal,
} from '@oct/shared';
import { useSession } from '../../app/SessionContext';
import {
  useDb,
  useNorm,
  usePeriod,
  useProfile,
  useSettings,
  useWeighings,
} from '../../data/DataContext';
import { deleteWeighing, putWeighing } from '../../data/outbox';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { List } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { useToast } from '../../ui/Toast/Toast';
import { useCapture } from '../meals/CaptureContext';
import { DropZone } from '../meals/DropZone';
import { saveProfile } from '../profile/ProfileScreen';
import { periodDays } from '../week/period';
import { WeighInSheet } from '../weight/WeighInSheet';
import { WeightCard } from '../weight/WeightCard';
import { MealRow } from './MealRow';
import { InstallHint } from './InstallHint';
import { NormInvite } from './NormInvite';
import { PendingConflicts } from './PendingConflicts';
import { RemainingCard } from './RemainingCard';
import { useToday } from './useToday';
import { useUndoDelete } from './undoDelete';
import './TodayScreen.css';

/** Where a meal opens for editing (screen 4). */
export const mealPath = (clientId: string) =>
  `/meal/${encodeURIComponent(clientId)}`;

/** `history.state` after saving a meal: Today flashes that row (OCT-16 A.6). */
export type TodayState = { saved?: string };

type ViewProps = {
  /** `YYYY-MM-DD`, shown as «Saturday, November 14». */
  today: string;
  /** Today's meals in any order; undefined while the local copy loads. */
  meals: Meal[] | undefined;
  /** Null: no norm set; undefined: loading. */
  norm: Macros | null | undefined;
  /** kcal left for the week, negative is over; only with a norm. */
  weekRemainingKcal?: number;
  /** clientId of a meal just saved. */
  highlight?: string;
  onOpen: (meal: Meal) => void;
  onSetNorm: () => void;
  /** The weight card: last on the phone, above the drop zone on desktop (OCT-189 §1). */
  weight?: ReactNode;
};

const newestFirst = (a: Meal, b: Meal) => b.eatenAt.localeCompare(a.eatenAt);

/** Screen 2 «Today» (OCT-19 §2, D.1), states 2.1–2.7. */
export function TodayView({
  today,
  meals,
  norm,
  weekRemainingKcal,
  highlight,
  onOpen,
  onSetNorm,
  weight,
}: ViewProps) {
  const { t, locale } = useT();
  const capture = useCapture();
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`));
  const loading = meals === undefined || norm === undefined;

  // 2.6: the card above the capture buttons, rows below them, so the buttons don't move.
  let summary;
  if (loading)
    summary = (
      <Delayed>
        <Skeleton
          height="calc(var(--space-12) * 5)"
          radius="var(--radius-lg)"
        />
      </Delayed>
    );
  else {
    const eaten = sumDay(meals);
    summary = (
      <>
        <InstallHint />
        {norm === null && <NormInvite onSet={onSetNorm} />}
        <PendingConflicts />
        <RemainingCard
          eaten={eaten}
          norm={norm}
          remaining={norm && remainingOf(norm, eaten)}
          weekRemainingKcal={norm ? weekRemainingKcal : undefined}
        />
      </>
    );
  }

  let list;
  if (loading)
    list = (
      <Delayed>
        <div className="today__skeleton">
          <Skeleton height="calc(var(--space-12) + var(--space-4))" />
          <Skeleton height="calc(var(--space-12) + var(--space-4))" />
        </div>
      </Delayed>
    );
  else if (meals?.length)
    list = (
      <List title={t('today.meals')}>
        {[...meals].sort(newestFirst).map((meal) => (
          <MealRow
            key={meal.clientId}
            meal={meal}
            onOpen={() => onOpen(meal)}
            highlight={meal.clientId === highlight}
          />
        ))}
      </List>
    );
  else
    list = (
      <div className="today__empty">
        <ScreenState icon={<Utensils />} title={t('today.empty.title')}>
          {t('today.empty.body')}
        </ScreenState>
      </div>
    );

  return (
    <div className="today">
      <div className="today__main">
        <p className="today__date">{date}</p>
        {summary}
        <div className="today__capture">
          <Button variant="tonal" onClick={capture.pick}>
            <ImagePlus aria-hidden="true" />
            {t('capture.gallery')}
          </Button>
          <Button variant="tonal" onClick={capture.manual}>
            <Pencil aria-hidden="true" />
            {t('capture.manual')}
          </Button>
        </div>
        {list}
      </div>
      <div className="today__side">
        {weight}
        <div className="today__drop">
          <DropZone />
        </div>
      </div>
    </div>
  );
}

/** Today from the local copy (ADR-0011, ADR-0014 §5). */
export function TodayScreen() {
  const today = useToday();
  const week = weekOf(today);
  // A meal deleted from the edit screen is gone at once, «Undo» brings it back.
  const { hidden } = useUndoDelete();
  const weekMeals = usePeriod(week.from, week.to)?.filter(
    (m) => !hidden.has(m.clientId),
  );
  // The week is counted against today's norm (summarize takes one).
  const norm = useNorm(today);
  const [, navigate] = useLocation();
  const db = useDb();
  const { t } = useT();
  const toast = useToast();
  const online = useOnline();
  const { user } = useSession();
  const settings = useSettings();
  const units = settings?.units ?? user?.units ?? 'metric';
  const profile = useProfile();
  const weighings = useWeighings();
  const [weighIn, setWeighIn] = useState(false);
  // Read once: a reload or coming back later doesn't flash again.
  const [highlight] = useState(
    () => (history.state as TodayState | null)?.saved,
  );
  useEffect(() => {
    if (highlight) history.replaceState(null, '');
  }, [highlight]);

  let weekRemainingKcal;
  if (weekMeals && norm)
    weekRemainingKcal = summarize(
      periodDays(weekMeals, week.from, week.to),
      norm,
      today,
    ).remaining?.kcal;

  return (
    <TodayView
      today={today}
      meals={weekMeals?.filter((m) => m.localDate === today)}
      norm={norm}
      weekRemainingKcal={weekRemainingKcal}
      highlight={highlight}
      onOpen={(meal) => navigate(mealPath(meal.clientId))}
      onSetNorm={() => navigate('/profile')}
      weight={
        <>
          <WeightCard
            today={today}
            units={units}
            weighings={weighings}
            profile={profile}
            online={online}
            onAdd={() => setWeighIn(true)}
            onOpen={() => navigate('/weight')}
            onSetGoal={() => navigate('/profile')}
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
            onRetry={(w) => void putWeighing(db, w.date, w.weightKg)}
          />
          {profile && weighings && (
            <WeighInSheet
              open={weighIn}
              onClose={() => setWeighIn(false)}
              today={today}
              units={units}
              weighings={weighings}
              profile={profile}
              onPut={(date, kg) => putWeighing(db, date, kg)}
              onDelete={(date) => deleteWeighing(db, date)}
            />
          )}
        </>
      }
    />
  );
}
