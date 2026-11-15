import { Redirect, useLocation } from 'wouter';
import { useMeals, useNorm } from '../../data/DataContext';
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
  const { hidden, remove } = useUndoDelete();

  return (
    <DiaryDay
      date={date}
      today={today}
      // The norm waits with the meals, so the total doesn't jump from «eaten» to «left».
      meals={
        norm === undefined
          ? undefined
          : meals?.filter((m) => !hidden.has(m.clientId))
      }
      norm={norm ?? null}
      onDate={(next) => navigate(`/diary/${next}`, { replace: true })}
      onOpen={(meal) => navigate(mealPath(meal.clientId))}
      onDelete={remove}
      // Today needs no date: the flow picks it (and the late snack, OCT-70).
      onAdd={() => capture.addTo(date === today ? null : date)}
    />
  );
}
