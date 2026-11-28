import { useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { waterGoalOn, waterOfDay } from '@oct/shared';
import { useSession } from '../../app/SessionContext';
import {
  useDb,
  useDrinkEntries,
  useMeals,
  useNorm,
  useProfile,
  useSettings,
  useWaterGoals,
} from '../../data/DataContext';
import { deleteDrinkEntry } from '../../data/outbox';
import { useT } from '../../i18n';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { WaterDaySheet } from '../water/WaterDaySheet';
import { useCapture } from '../meals/CaptureContext';
import { diaryDay, localToday } from './day';
import { DiaryDay } from './DiaryDay';
import { mealPath } from './TodayScreen';
import { useUndoDelete } from './undoDelete';

/** /diary/:date — a future or malformed date opens today (AC-2.3). */
export function DiaryScreen({ date }: { date: string }) {
  const today = localToday();
  const day = diaryDay(date, today);
  if (day !== date) return <Redirect to={`/diary/${day}`} replace />;
  return <Diary date={day} today={today} />;
}

function Diary({ date, today }: { date: string; today: string }) {
  const capture = useCapture();
  const [, navigate] = useLocation();
  const meals = useMeals(date);
  const norm = useNorm(date);
  const { hidden, hide, remove } = useUndoDelete();
  // One read for the total, the «Drinks» row and the sheet (ADR-0028 §5).
  const drinks = useDrinkEntries(date, date)?.filter(
    (e) => !hidden.has(e.clientId),
  );
  const db = useDb();
  const { t } = useT();
  const online = useOnline();
  const { user } = useSession();
  const settings = useSettings();
  const units = settings?.units ?? user?.units ?? 'metric';
  const profile = useProfile();
  const goals = useWaterGoals();
  const [sheet, setSheet] = useState(false);
  // The goal of that day from the history, not today's (ADR-0028 §3).
  const goalMl =
    settings?.waterEnabled && goals
      ? waterGoalOn(goals, date, profile?.profile.sex ?? null)
      : null;
  const live = drinks?.filter((e) => !e.deleted) ?? [];

  return (
    <>
      <DiaryDay
        date={date}
        today={today}
        // The norm waits with the meals, so the total doesn't jump from «eaten» to «left».
        meals={
          norm === undefined || drinks === undefined
            ? undefined
            : meals?.filter((m) => !hidden.has(m.clientId))
        }
        drinks={drinks}
        norm={norm ?? null}
        onDate={(next) => navigate(`/diary/${next}`, { replace: true })}
        onOpen={(meal) => navigate(mealPath(meal.clientId))}
        onDelete={remove}
        // Today needs no date: the flow picks it (and the late snack, OCT-70).
        onAdd={() => capture.addTo(date === today ? null : date)}
        units={units}
        water={
          goalMl === null ? undefined : { goalMl, onOpen: () => setSheet(true) }
        }
      />
      {goalMl !== null && (
        <WaterDaySheet
          day={date === today ? undefined : date}
          open={sheet}
          onClose={() => setSheet(false)}
          entries={live}
          ml={waterOfDay(live)}
          goalMl={goalMl}
          units={units}
          online={online}
          onDelete={(e) =>
            hide(e.clientId, t('water.deleted'), () =>
              deleteDrinkEntry(db, e.clientId),
            )
          }
        />
      )}
    </>
  );
}
