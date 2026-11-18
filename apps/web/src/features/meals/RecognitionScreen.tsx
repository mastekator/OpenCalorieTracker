import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { X } from 'lucide-react';
import {
  aiStatusSchema,
  recognitionSchema,
  type AiQuestion,
  type RecognizedDish,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import { MEAL_NEW_PATH, useCapture } from './CaptureContext';
import {
  RecognitionState,
  type RecognitionStateKind,
} from './RecognitionState';

/** The edit screen (OCT-58). */
export const MEAL_EDIT_PATH = `${MEAL_NEW_PATH}/edit`;

/**
 * `history.state` of MEAL_EDIT_PATH: recognized dishes, or why the manual sheet opens
 * (`ai_down` after 3.2–3.4); empty after a reload → recognize the same photoId again.
 */
export type MealEditState =
  | { dishes: RecognizedDish[]; questions?: AiQuestion[] }
  | { manual: 'user' | 'ai_down' | 'not_configured' | 'no_vision' };

export const SLOW_MS = 10_000;
/** Client safety net over the server's 60 s (ADR-0007). */
export const TIMEOUT_MS = 65_000;

const hidden = () => document.visibilityState === 'hidden';

/** Resolves once the page is visible and online (back from the background / network). */
export function whenBack(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (hidden() || !navigator.onLine) return;
      stop();
      resolve();
    };
    const stop = () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    signal.addEventListener('abort', stop);
    check();
  });
}

/** Recalculating a saved meal (5.6): its dishes go back to it, every other way out returns to it as it was. */
export type Recalc = {
  onDishes: (dishes: RecognizedDish[], questions?: AiQuestion[]) => void;
  onBack: () => void;
};

/** Screen 3 (design OCT-16 §2): POST /api/photos/:id/recognize → edit screen or a state 3.2–3.7. */
export function RecognitionScreen({
  photoId,
  recalc,
}: {
  photoId: string;
  recalc?: Recalc;
}) {
  const { t } = useT();
  const [, navigate] = useLocation();
  const capture = useCapture();
  const [state, setState] = useState<RecognitionStateKind>('loading');
  const [attempt, setAttempt] = useState(0); // «Try again»: same photoId (AC-6.4)
  // `?photo=` and the day of «Add an entry for this day» (`?date=`, AC-2.11) go on to the edit screen.
  const query = `?${useSearch()}`;

  // Replace: «Back» from the edit screen goes to Today, not into a new recognition.
  const toEdit = (editState: MealEditState) =>
    recalc
      ? 'dishes' in editState
        ? recalc.onDishes(editState.dishes, editState.questions)
        : recalc.onBack()
      : navigate(MEAL_EDIT_PATH + query, { replace: true, state: editState });

  useEffect(() => {
    // Aborted by «Cancel» (unmount) or «Try again»; a late answer is then ignored (AC-2.5).
    const ctrl = new AbortController();
    setState('loading');
    const slow = setTimeout(
      () => setState((s) => (s === 'loading' ? 'slow' : s)),
      SLOW_MS,
    );
    let resumed = false;

    const run = async (): Promise<void> => {
      try {
        const { dishes, questions } = await api(
          `/api/photos/${encodeURIComponent(photoId)}/recognize`,
          recognitionSchema,
          {
            method: 'POST',
            signal: AbortSignal.any([
              ctrl.signal,
              AbortSignal.timeout(TIMEOUT_MS),
            ]),
          },
        );
        if (ctrl.signal.aborted) return;
        if (dishes.length > 0) toEdit({ dishes, questions });
        else setState('empty'); // E-7.1
      } catch (err) {
        if (ctrl.signal.aborted) return;
        if (err instanceof ApiError && err.status === 0 && !resumed) {
          // Dropped while in the background or offline: retry once when back; the server
          // answers from its result cache, no new paid call (E-7.8).
          resumed = true;
          if (!navigator.onLine) setState('offline');
          await whenBack(ctrl.signal);
          if (ctrl.signal.aborted) return;
          setState((s) => (s === 'offline' ? 'loading' : s));
          return run();
        }
        clearTimeout(slow);
        if (!(err instanceof ApiError)) return setState('unavailable'); // TimeoutError
        if (err.status === 0)
          return setState(navigator.onLine ? 'unavailable' : 'offline');
        switch (err.code) {
          case 'ai_not_configured':
            return toEdit({ manual: 'not_configured' });
          case 'ai_no_vision':
            return toEdit({ manual: 'no_vision' });
          case 'ai_quota_exceeded':
            return setState('quota');
          case 'ai_invalid_response':
            return setState('failed');
          case 'not_found':
          case 'photo_expired':
            return setState('gone');
          default:
            return setState('unavailable');
        }
      }
    };
    // AI not ready: no recognize call, straight to manual entry with the photo (AC-5.6, AC-6.6).
    // Status unknown (network, server): recognize anyway, its 409 still leads here.
    void api('/api/ai/status', aiStatusSchema, { signal: ctrl.signal })
      .catch(() => null)
      .then((status) => {
        if (ctrl.signal.aborted) return;
        if (status && status.recognition !== 'ready')
          return toEdit({ manual: status.recognition });
        return run();
      });
    return () => {
      ctrl.abort();
      clearTimeout(slow);
    };
    // toEdit only navigates; the request restarts on a new photo or «Try again».
  }, [photoId, attempt]);

  const aiDown =
    state === 'slow' || state === 'unavailable' || state === 'quota';
  return (
    <div className="screen">
      <NavBar
        title={t(recalc ? 'recalc.action_photo' : 'nav.add_food')}
        back={recalc ? undefined : { href: '/', label: t('common.cancel') }}
        action={
          recalc && {
            icon: X,
            label: t('common.cancel'),
            onClick: recalc.onBack,
          }
        }
      />
      <main className="screen__body">
        <RecognitionState
          state={state}
          photoUrl={`/api/photos/${encodeURIComponent(photoId)}`}
          onRetry={() => setAttempt((a) => a + 1)}
          // A retake would start a new meal: recalculating keeps to the entry's photo.
          onRetake={recalc ? undefined : capture.camera}
          onManual={() => toEdit({ manual: aiDown ? 'ai_down' : 'user' })}
          onClose={() => (recalc ? recalc.onBack() : navigate('/'))}
        />
      </main>
    </div>
  );
}
