import type { Meal } from '@oct/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useDb } from '../../data/DataContext';
import { deleteMeal } from '../../data/outbox';
import { useT } from '../../i18n';
import { useToast } from '../../ui/Toast/Toast';

/** How long «Undo» is offered before the delete is queued (OCT-19 6.3). */
export const UNDO_MS = 5000;

type UndoDelete = {
  /** clientIds deleted on screen and still in the undo window. */
  hidden: ReadonlySet<string>;
  /** Hides the meal with a «Deleted · Undo» toast; the local delete waits for the window. */
  remove: (meal: Meal) => void;
};

const Context = createContext<UndoDelete | null>(null);

/**
 * Above the screens, so «Undo» outlives the screen the delete came from
 * (the edit screen goes back to the day at once). Inside DataProvider.
 */
export function UndoDeleteProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const db = useDb();
  const toast = useToast();
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

  // Also when the app goes to the background or is left (AC-2.7).
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

  return <Context value={{ hidden, remove }}>{children}</Context>;
}

export function useUndoDelete() {
  const value = useContext(Context);
  if (!value) throw new Error('useUndoDelete outside UndoDeleteProvider');
  return value;
}
