import { useContext, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { X } from 'lucide-react';
import {
  aiStatusSchema,
  mergePackages,
  packageRecognitionSchema,
  photoBarcodesSchema,
  type AiQuestion,
  type MergedDish,
  type PhotoBarcodesResponse,
} from '@oct/shared';
import { aiSourceOf, api, ApiError } from '../../api/client';
import { DataContext } from '../../data/DataContext';
import { keepProduct } from '../../data/products';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import { MEAL_NEW_PATH, useCapture, type Pending } from './CaptureContext';
import {
  RecognitionState,
  type PhotoCodes,
  type RecognitionStateKind,
} from './RecognitionState';
import { useAiConsent } from '../ai/AiConsent';
import { AI_SETTINGS_PATH } from '../settings/AiScreen';

/** The edit screen (OCT-58). */
export const MEAL_EDIT_PATH = `${MEAL_NEW_PATH}/edit`;

/**
 * `history.state` of MEAL_EDIT_PATH: recognized dishes glued with the photo's packages,
 * or why the manual sheet opens (`ai_down` after 3.2–3.4) and, without AI, the barcode
 * read but not found (OCT-313 3.4); empty after a reload → recognize the same photoId again.
 */
export type MealEditState =
  | {
      dishes: MergedDish[];
      questions?: AiQuestion[];
      /** The photo's codes as looked up: the label and Open Food Facts hints (OCT-313 2.4, 2.5). */
      codes?: PhotoBarcodesResponse['codes'];
    }
  | {
      manual: 'user' | 'ai_down' | 'not_configured' | 'no_vision';
      barcode?: string;
      /** Taken without AI (off on this device, or offline without consent): kept on the device until saved. */
      photo?: Blob;
    };

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
  onDishes: (dishes: MergedDish[], questions?: AiQuestion[]) => void;
  onBack: () => void;
};

/**
 * Screen 3 (design OCT-16 §2, OCT-313 §1): POST /api/photos/:id/barcodes and /recognize side
 * by side, glued by `mergePackages` → edit screen or a state 3.2–3.7.
 */
export function RecognitionScreen({
  photoId,
  pending,
  recalc,
}: {
  photoId?: string;
  /** No photoId yet: the photo is being prepared and uploaded (OCT-370), nothing is requested here. */
  pending?: Pending;
  recalc?: Recalc;
}) {
  const { t } = useT();
  const withConsent = useAiConsent();
  const [, navigate] = useLocation();
  const capture = useCapture();
  // None in view tests and stories: nothing is kept then.
  const db = useContext(DataContext);
  const [state, setState] = useState<RecognitionStateKind>('loading');
  const [codes, setCodes] = useState<PhotoCodes>('pending');
  const [ai, setAi] = useState<'run' | 'none'>('run');
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
    if (!photoId) return;
    // Aborted by «Cancel» (unmount) or «Try again»; a late answer is then ignored (AC-2.5).
    const ctrl = new AbortController();
    setState('loading');
    setCodes('pending');
    setAi('run');
    const photo = `/api/photos/${encodeURIComponent(photoId)}`;
    // Works without AI (ADR-0034 §1); a failed read skips steps 1–2, the rest is as before.
    const barcodes: Promise<PhotoBarcodesResponse['codes'] | null> = api(
      `${photo}/barcodes`,
      photoBarcodesSchema,
      { method: 'POST', signal: ctrl.signal },
    ).then(
      async (r) => {
        // Kept before the edit screen opens, so its «Dish» sheet finds them (OCT-313 2.6).
        if (db)
          await Promise.all(
            r.codes.map(
              ({ result: { product } }) =>
                product && keepProduct(db, product).catch(() => {}),
            ),
          );
        return r.codes;
      },
      () => null,
    );
    void barcodes.then((c) => {
      if (!ctrl.signal.aborted) setCodes(c ?? 'failed');
    });

    // Found products without the AI's dishes go to the edit screen; false when none was found.
    const foundToEdit = (found: PhotoBarcodesResponse['codes'] | null) => {
      const dishes = mergePackages([], found ?? []);
      if (dishes.length === 0) return false;
      setAi('none');
      toEdit({ dishes, codes: found ?? [] });
      return true;
    };
    // No AI: a found product goes to the edit screen, a code not found to manual entry (AC-4.7).
    const withoutAi = async (manual: 'not_configured' | 'no_vision') => {
      setAi('none');
      const found = await barcodes;
      if (ctrl.signal.aborted || foundToEdit(found)) return;
      const code = found?.[0]?.code;
      toEdit({ manual, ...(code && { barcode: code }) });
    };
    const slow = setTimeout(
      () => setState((s) => (s === 'loading' ? 'slow' : s)),
      SLOW_MS,
    );
    let resumed = false;

    const run = async (): Promise<void> => {
      try {
        const recognized = await withConsent('photo', () =>
          api(`${photo}/recognize`, packageRecognitionSchema, {
            method: 'POST',
            signal: AbortSignal.any([
              ctrl.signal,
              AbortSignal.timeout(TIMEOUT_MS),
            ]),
          }),
        );
        const found = await barcodes;
        if (ctrl.signal.aborted) return;
        const dishes = mergePackages(recognized.dishes, found ?? []);
        if (dishes.length > 0)
          toEdit({
            dishes,
            questions: recognized.questions,
            codes: found ?? [],
          });
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
        // Recognition failed but the barcodes found products: keep them (OCT-348).
        const found = await barcodes;
        if (ctrl.signal.aborted || foundToEdit(found)) return;
        if (!(err instanceof ApiError)) return setState('unavailable'); // TimeoutError
        if (err.status === 0)
          return setState(navigator.onLine ? 'unavailable' : 'offline');
        const source = aiSourceOf(err);
        switch (err.code) {
          case 'ai_not_configured':
            return withoutAi('not_configured');
          case 'ai_no_vision':
            return withoutAi('no_vision');
          case 'ai_consent_required': // «Not now»: manual entry with the photo (OCT-178 2.4)
            return toEdit({ manual: 'user' });
          case 'ai_quota_exceeded':
            return setState(source === 'own_key' ? 'key_quota' : 'quota');
          case 'ai_invalid_response':
            return setState('failed');
          case 'not_found':
          case 'photo_expired':
            return setState('gone');
          case 'ai_unavailable':
            return setState(
              source === 'own_key'
                ? 'key_bad'
                : source === 'server'
                  ? 'server_down'
                  : 'unavailable',
            );
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
          return withoutAi(status.recognition);
        return run();
      });
    return () => {
      ctrl.abort();
      clearTimeout(slow);
    };
    // toEdit only navigates; the request restarts on a new photo or «Try again».
  }, [photoId, attempt]);

  const aiDown =
    state === 'slow' ||
    state === 'unavailable' ||
    state === 'quota' ||
    state === 'key_bad' ||
    state === 'key_quota' ||
    state === 'server_down';
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
          state={
            !pending || pending.status === 'uploading' ? state : pending.status
          }
          uploading={pending?.status === 'uploading'}
          codes={codes}
          ai={ai}
          photoUrl={
            pending?.url ?? `/api/photos/${encodeURIComponent(photoId!)}`
          }
          onRetry={pending ? capture.retry : () => setAttempt((a) => a + 1)}
          // A retake would start a new meal: recalculating keeps to the entry's photo.
          onRetake={recalc ? undefined : capture.camera}
          onManual={() => toEdit({ manual: aiDown ? 'ai_down' : 'user' })}
          onClose={() => (recalc ? recalc.onBack() : navigate('/'))}
          onAiSettings={() => navigate(AI_SETTINGS_PATH)}
        />
      </main>
    </div>
  );
}
