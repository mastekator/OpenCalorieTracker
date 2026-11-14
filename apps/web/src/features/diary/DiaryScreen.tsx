import type { Meal } from '@oct/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useDb, useMeals } from '../../data/DataContext';
import { deleteMeal } from '../../data/outbox';
import { useT } from '../../i18n';
import { useToast } from '../../ui/Toast/Toast';
import { useCapture } from '../meals/CaptureContext';
import { diaryDay, localToday } from './day';
import { DiaryDay } from './DiaryDay';

/** How long «Undo» is offered before the delete is queued (OCT-19 6.3). */
export const UNDO_MS = 5000;

/** /diary/:date — a future or malformed date opens today (AC-2.3). */
export function DiaryScreen({ date }: { date: string }) {
  const today = localToday();
  const day = diaryDay(date, today);
  if (day !== date) return <Redirect to={`/diary/${day}`} replace />;
  return <Diary date={day} today={today} />;
}

function Diary({ date, today }: { date: string; today: string }) {
  const { t } = useT();
  const db = useDb();
  const toast = useToast();
  const capture = useCapture();
  const [, navigate] = useLocation();
  const meals = useMeals(date);
  // Deleted on screen at once; the local delete (and its DELETE) waits for the undo window.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef<{
    clientId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const commit = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    // Rejects only when the database is closed by a sign-out or user switch.
    deleteMeal(db, p.clientId).catch(() => {});
  }, [db]);

  // Also when the app goes to the background or the screen is left (AC-2.7).
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && commit();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      commit();
    };
  }, [commit]);

  const remove = (meal: Meal) => {
    commit(); // one undo at a time: the previous delete goes through
    const { clientId } = meal;
    pending.current = { clientId, timer: setTimeout(commit, UNDO_MS) };
    setHidden((s) => new Set(s).add(clientId));
    toast({
      text: t('diary.deleted', { meal: t(`meal.type.${meal.mealType}`) }),
      ms: UNDO_MS,
      action: {
        label: t('diary.undo'),
        onClick: () => {
          if (pending.current?.clientId !== clientId) return;
          clearTimeout(pending.current.timer);
          pending.current = null;
          setHidden((s) => {
            const next = new Set(s);
            next.delete(clientId);
            return next;
          });
        },
      },
    });
  };

  return (
    <DiaryDay
      date={date}
      today={today}
      meals={meals?.filter((m) => !hidden.has(m.clientId))}
      // The norm on the client comes with the profile in OCT-92.
      norm={null}
      onDate={(next) => navigate(`/diary/${next}`, { replace: true })}
      // shortcut: editing a saved meal is OCT-69; until then a tap opens nothing.
      onOpen={() => {}}
      onDelete={remove}
      // Today needs no date: the flow picks it (and the late snack, OCT-70).
      onAdd={() => capture.addTo(date === today ? null : date)}
    />
  );
}
