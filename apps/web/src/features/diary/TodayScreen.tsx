import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Droplet, ImagePlus, Pencil, Utensils } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  addDays,
  BUILTIN_DRINKS,
  drinkRowOrder,
  remainingOf,
  sumDay,
  summarize,
  weekOf,
  type AccountSettingsPatch,
  type Macros,
  type DrinkEntry,
  type Meal,
  type Units,
  waterGoalOn,
  waterOfDay,
} from '@oct/shared';
import { useSession } from '../../app/SessionContext';
import {
  useCustomDrinks,
  useDb,
  useDrinkEntries,
  useHasDrinkEntries,
  useNorm,
  usePeriod,
  useProfile,
  useSettings,
  useWaterGoals,
  useWeighings,
} from '../../data/DataContext';
import {
  createDrinkEntry,
  deleteDrinkEntry,
  deleteWeighing,
  patchSettings,
  putWeighing,
} from '../../data/outbox';
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
import { DrinksMealRow, kcalDrinks } from '../water/DrinksMealRow';
import { useVolume } from '../water/format';
import { AmountSheet } from '../water/AmountSheet';
import { WaterCard, type DrinkTileInfo } from '../water/WaterCard';
import { WaterDaySheet } from '../water/WaterDaySheet';
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
  /** Today's drink entries: their kcal are in the total even with the water module off. */
  drinks?: DrinkEntry[];
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
  /** The water card, module on: under the day total on the phone, atop the side column on desktop (OCT-147). */
  water?: ReactNode;
  /** Water module on: kcal drinks get a row among the meals (OCT-147 4.3). */
  waterOn?: boolean;
  units?: Units;
};

const DESKTOP = '(min-width: 1024px)';
const desktopQuery = () =>
  typeof matchMedia === 'function' ? matchMedia(DESKTOP) : null;
/** The desktop layout is on: the same breakpoint as TodayScreen.css. */
function useDesktop() {
  return useSyncExternalStore(
    (change) => {
      const q = desktopQuery();
      q?.addEventListener('change', change);
      return () => q?.removeEventListener('change', change);
    },
    () => desktopQuery()?.matches ?? false,
  );
}

const newestFirst = (a: Meal, b: Meal) => b.eatenAt.localeCompare(a.eatenAt);

/** Screen 2 «Today» (OCT-19 §2, D.1), states 2.1–2.7. */
export function TodayView({
  today,
  meals,
  drinks = [],
  norm,
  weekRemainingKcal,
  highlight,
  onOpen,
  onSetNorm,
  weight,
  water,
  waterOn = false,
  units = 'metric',
}: ViewProps) {
  const { t, locale } = useT();
  const desktop = useDesktop();
  const capture = useCapture();
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`));
  const loading = meals === undefined || norm === undefined;
  const drinkRow = waterOn ? kcalDrinks(drinks) : [];
  const drinksRow = drinkRow.length > 0 && (
    <DrinksMealRow key="drinks" entries={drinkRow} units={units} />
  );

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
    const eaten = sumDay([...meals, ...drinks]);
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
        {!desktop && water}
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
  else if (meals.length || drinksRow) {
    const rows = [...meals]
      .sort(newestFirst)
      .map((meal) => (
        <MealRow
          key={meal.clientId}
          meal={meal}
          onOpen={() => onOpen(meal)}
          highlight={meal.clientId === highlight}
        />
      ));
    // By the time of the last drink, among the meals newest first.
    if (drinksRow) {
      const last = Date.parse(drinkRow[0]!.takenAt);
      rows.splice(
        meals.filter((m) => Date.parse(m.eatenAt) > last).length,
        0,
        drinksRow,
      );
    }
    list = <List title={t('today.meals')}>{rows}</List>;
  } else
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
        {desktop && water}
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
  const weekDrinks = useDrinkEntries(week.from, week.to)?.filter(
    (e) => !hidden.has(e.clientId),
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
  const water = useWater(today, units);
  // Read once: a reload or coming back later doesn't flash again.
  const [highlight] = useState(
    () => (history.state as TodayState | null)?.saved,
  );
  useEffect(() => {
    if (highlight) history.replaceState(null, '');
  }, [highlight]);

  let weekRemainingKcal;
  if (weekMeals && weekDrinks && norm)
    weekRemainingKcal = summarize(
      periodDays(weekMeals, week.from, week.to, weekDrinks),
      norm,
      today,
    ).remaining?.kcal;

  return (
    <TodayView
      today={today}
      meals={weekDrinks && weekMeals?.filter((m) => m.localDate === today)}
      drinks={weekDrinks?.filter((e) => e.date === today)}
      norm={norm}
      weekRemainingKcal={weekRemainingKcal}
      highlight={highlight}
      onOpen={(meal) => navigate(mealPath(meal.clientId))}
      onSetNorm={() => navigate('/profile')}
      water={water}
      waterOn={settings?.waterEnabled ?? false}
      units={units}
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

/** The Water card from the local copy; null with the module off or while it loads (ADR-0028 §5). */
function useWater(today: string, units: Units) {
  const db = useDb();
  const { t, num } = useT();
  const toast = useToast();
  const volume = useVolume(units);
  const settings = useSettings();
  const profile = useProfile();
  const online = useOnline();
  const { hidden, hide } = useUndoDelete();
  const entries = useDrinkEntries(addDays(today, -29), today)?.filter(
    (e) => !hidden.has(e.clientId),
  );
  // A drink deleted in settings leaves the row while «Undo» is offered.
  const custom = useCustomDrinks()?.filter(
    (d) => !hidden.has(`custom:${d.id}`),
  );
  const goals = useWaterGoals();
  const any = useHasDrinkEntries();
  const [other, setOther] = useState<DrinkTileInfo | null>(null);
  const [day, setDay] = useState(false);
  if (!settings?.waterEnabled || !entries || !custom || !goals) return null;

  const tiles = drinkRowOrder({
    entries,
    customDrinks: custom,
    hidden: settings.hiddenDrinks ?? [],
    today,
  }).map((key): DrinkTileInfo => {
    const own = custom.find((d) => `custom:${d.id}` === key);
    if (own) return { key, ...own, per100: own };
    const builtin = BUILTIN_DRINKS.find((d) => d.key === key)!;
    return {
      key,
      name: t(`drinks.${builtin.key}`),
      illustration: builtin.illustration,
      countsWater: true,
      per100: builtin.per100,
    };
  });

  const log = async (key: string, ml: number) => {
    const clientId = await createDrinkEntry(db, {
      drinkKey: key,
      ml,
      date: today,
      takenAt: new Date().toISOString(),
    });
    const entry = await db.get('drinkEntries', clientId);
    const name = tiles.find((d) => d.key === key)!.name;
    const amount = volume(ml);
    toast({
      text: entry?.kcal
        ? t('water.logged_kcal', { amount, name, kcal: num(entry.kcal) })
        : t('water.logged', { amount, name }),
      icon: <Droplet aria-hidden="true" />,
      ms: 5000,
      action: {
        label: t('water.undo'),
        onClick: () => void deleteDrinkEntry(db, clientId),
      },
    });
  };

  const todays = entries.filter((e) => e.date === today);
  const ml = waterOfDay(todays);
  const goalMl = waterGoalOn(goals, today, profile?.profile.sex ?? null);
  return (
    <>
      <WaterCard
        today={today}
        ml={ml}
        goalMl={goalMl}
        units={units}
        drinks={tiles}
        hint={any === false}
        onLog={(key, ml) => void log(key, ml)}
        onOther={(key) => setOther(tiles.find((d) => d.key === key)!)}
        onHide={(key) =>
          void patchSettings(db, {
            // Only hideable keys reach here: built-ins without water (DrinkMenu).
            hiddenDrinks: [...(settings.hiddenDrinks ?? []), key].filter(
              (k) => k !== 'water',
            ) as NonNullable<AccountSettingsPatch['hiddenDrinks']>,
          })
        }
        onOpenDay={() => setDay(true)}
      />
      <AmountSheet
        drink={other}
        units={units}
        onClose={() => setOther(null)}
        onAdd={(ml) => other && void log(other.key, ml)}
      />
      <WaterDaySheet
        open={day}
        onClose={() => setDay(false)}
        entries={todays.filter((e) => !e.deleted)}
        ml={ml}
        goalMl={goalMl}
        units={units}
        online={online}
        onDelete={(e) =>
          hide(
            e.clientId,
            t('water.deleted'),
            // Sent and offline when the window ends: the delete waits in the queue.
            () => deleteDrinkEntry(db, e.clientId),
          )
        }
      />
    </>
  );
}
