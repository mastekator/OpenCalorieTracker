import { flushSync } from 'react-dom';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useLocation, useSearch } from 'wouter';
import { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { useUserId } from '../../app/SessionContext';
import { readConsents } from '../../data/aiConsents';
import { readDeviceAi, useDeviceAi } from '../../data/deviceAi';
import { useT } from '../../i18n';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { DropOverlay } from '../../ui/DropOverlay/DropOverlay';
import { CaptureMenu } from './CaptureMenu';
import { ImageDecodeError, prepareImage } from './prepareImage';
import type { MealEditState } from './RecognitionScreen';

/** The meal flow; the recognition screen (OCT-57) reads `?photo=` and passes `?date=` on to the edit screen. */
export const MEAL_NEW_PATH = '/meal/new';
// Kept here, not imported: RecognitionScreen imports this module.
const MEAL_EDIT_PATH = `${MEAL_NEW_PATH}/edit`;

type Capture = {
  /** System camera (`capture`); a desktop without one shows the file picker (E-1.4). */
  camera: () => void;
  /** Library / file picker. */
  pick: () => void;
  /** Manual entry without a photo. */
  manual: () => void;
  /** Menu 5.5 (long press on the camera). */
  menu: () => void;
  /** Menu 5.5 for a past day (`YYYY-MM-DD`; null: today): the flow opens with `?date=` (AC-2.11). */
  addTo: (date: string | null) => void;
  /** The photo being prepared and uploaded: the recognition screen shows it before there is a photoId. */
  pending: Pending | null;
  /** «Try again» after a failed upload: the prepared blob again, no re-encoding. */
  retry: () => void;
};

export type Pending = {
  /** Object URL of the chosen file, for the preview. */
  url: string;
  status: 'uploading' | 'offline' | 'upload_failed';
};

const noop = () => {};
const CaptureContext = createContext<Capture>({
  camera: noop,
  pick: noop,
  manual: noop,
  menu: noop,
  addTo: noop,
  pending: null,
  retry: noop,
});

export const useCapture = () => useContext(CaptureContext);

const photoSchema = z.object({ photoId: z.string() });

const hasFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

/**
 * Way into the photo flow (design OCT-16 §1, §2 3.8, §5 E.1): camera, library,
 * drag and drop and paste → prepareImage → POST /api/photos → MEAL_NEW_PATH.
 */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const userId = useUserId();
  const [deviceAi] = useDeviceAi(userId);
  const [location, navigate] = useLocation();
  const inFlow = location === MEAL_NEW_PATH;
  const cameraInput = useRef<HTMLInputElement>(null);
  const pickInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  // The day «Add an entry for this day» was opened for; other ways in take the current flow's day (none: today).
  const date = useRef<string | null>(null);
  const search = useRef('');
  search.current = useSearch();
  /** Outside menu 5.5 for a past day the day is the current flow's (a retake keeps it), else today. */
  const flowDate = () => new URLSearchParams(search.current).get('date');
  const [dialog, setDialog] = useState<'open' | 'camera' | null>(null);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);

  // A second drop / paste / retry while one photo is in flight is ignored.
  const run = async (job: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await job();
    } finally {
      busy.current = false;
    }
  };

  const [pending, setPendingState] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const origin = useRef<string | null>(null);
  const setPending = (next: Pending | null) => {
    const prev = pendingRef.current;
    if (prev && prev.url !== next?.url) URL.revokeObjectURL(prev.url);
    pendingRef.current = next;
    setPendingState(next);
  };
  // Still on the upload screen of this photo: leaving the flow (cancel, manual entry) clears it.
  const current = (url: string) => pendingRef.current?.url === url;

  // Leaving the flow drops the photo that was being uploaded.
  useEffect(() => {
    if (location !== MEAL_NEW_PATH) setPending(null);
  }, [location]);

  /** Bad photo: off the upload screen to where it was opened from, then dialog 3.8. */
  const backOut = () => {
    // A retake replaced the old photo's entry: put it back; history.back() would leave the flow.
    if (origin.current) {
      navigate(origin.current, { replace: true });
      setPending(null);
    }
    // Pending is cleared by the location effect once back lands: clearing it first would render
    // MealNew's manual-entry redirect before the async popstate.
    else history.back();
    setDialog('open');
  };

  const upload = async (blob: Blob, url: string) => {
    if (!current(url)) return;
    setPending({ url, status: 'uploading' });
    try {
      const { photoId } = await api('/api/photos', photoSchema, {
        method: 'POST',
        body: blob,
      });
      if (!current(url)) return;
      // Replace: the upload screen leaves history, «Back» goes where the flow was opened from.
      navigate(flowPath(photoId), { replace: true });
      setPending(null);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (!current(url)) return;
      if (err.code === 'photo_invalid' || err.code === 'photo_too_large')
        backOut();
      else
        setPending({
          url,
          status:
            err.status === 0 && !navigator.onLine ? 'offline' : 'upload_failed',
        });
    }
  };

  const start = (file: Blob) =>
    run(async () => {
      // A retake from the recognition screen of a photo: its address comes back if this one is bad.
      origin.current =
        inFlow && new URLSearchParams(search.current).has('photo')
          ? `${MEAL_NEW_PATH}?${search.current}`
          : null;
      const url = URL.createObjectURL(file);
      // The screen opens before the slow part (decoding, re-encoding, upload), so it shows that work.
      flushSync(() => setPending({ url, status: 'uploading' }));
      navigate(flowPath(), { replace: inFlow });
      let blob: Blob;
      try {
        blob = await prepareImage(file);
      } catch (err) {
        if (!(err instanceof ImageDecodeError)) throw err;
        // nothing goes to the server (E-1.1)
        if (current(url)) backOut();
        return;
      }
      blobRef.current = blob;
      const manual = withoutAi();
      if (manual) {
        // Manual entry with the photo: it is queued with the meal, never recognized (ADR-0031 §6).
        if (!current(url)) return;
        navigate(flowPath(undefined, MEAL_EDIT_PATH), {
          replace: true,
          state: { manual, photo: blob } satisfies MealEditState,
        });
        setPending(null);
        return;
      }
      await upload(blob, url);
    });
  const retry = () => {
    const mine = pendingRef.current;
    const blob = blobRef.current;
    if (mine && blob) void run(() => upload(blob, mine.url));
  };
  const startRef = useRef(start);
  startRef.current = start;

  /**
   * AI off on this device: plain manual entry (no recalc offer). Offline without a consent to the
   * current provider in the local copy: manual entry saying «No connection», offering «Recalculate»
   * once online, whose tap asks for the consent. Else null: upload and recognize.
   */
  const withoutAi = (): 'user' | 'offline' | null => {
    if (!readDeviceAi(userId)) return 'user';
    if (navigator.onLine || userId === undefined) return null;
    const copy = readConsents(userId);
    const key = copy?.server?.providerKey;
    return key && copy.consents.some((c) => c.providerKey === key)
      ? null
      : 'offline';
  };

  const flowPath = (photoId?: string, path = MEAL_NEW_PATH) => {
    const query = new URLSearchParams();
    if (photoId) query.set('photo', photoId);
    if (date.current) query.set('date', date.current);
    const q = query.toString();
    return q ? `${path}?${q}` : path;
  };

  const pick = () => pickInput.current?.click();
  const camera = () => {
    // shortcut: <input capture> reports no permission denial; only a thrown error shows E-1.3.
    try {
      cameraInput.current?.click();
    } catch {
      setDialog('camera');
    }
  };
  const manual = () => navigate(flowPath());

  const onPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so the same file can be chosen again
    if (file) void start(file); // closing the picker without a file does nothing (AC-1.6)
  };

  // Desktop E.1: drop anywhere in the window, ⌘/Ctrl+V.
  useEffect(() => {
    // Counted, as dragenter / dragleave fire on every nested element.
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (depth++ === 0) setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault(); // allows the drop
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      // Not an image → prepareImage fails → dialog 3.8.
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      date.current = flowDate();
      void startRef.current(file);
    };
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (!file) return; // text paste into fields stays as is
      event.preventDefault();
      date.current = flowDate();
      void startRef.current(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, []);

  const today = (action: () => void) => () => {
    date.current = flowDate();
    action();
  };
  const closeMenuThen = (action: () => void) => () => {
    setMenu(false);
    action();
  };
  const closeDialogThenPick = () => {
    setDialog(null);
    pick();
  };

  return (
    <CaptureContext
      value={{
        camera: today(camera),
        pick: today(pick),
        manual: today(manual),
        menu: today(() => setMenu(true)),
        addTo: (day) => {
          date.current = day;
          setMenu(true);
        },
        pending,
        retry,
      }}
    >
      {children}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="capture-camera"
        onChange={onPicked}
      />
      <input
        ref={pickInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="capture-pick"
        onChange={onPicked}
      />
      <CaptureMenu
        open={menu}
        onClose={() => setMenu(false)}
        onPhoto={closeMenuThen(camera)}
        onGallery={closeMenuThen(pick)}
        onManual={closeMenuThen(manual)}
        aiOff={!deviceAi}
      />
      <ConfirmDialog
        open={dialog === 'open'}
        tone="primary"
        stack
        title={t('capture.err.open.title')}
        body={t('capture.err.open.body')}
        confirmLabel={t('capture.err.open.cta')}
        cancelLabel={t('common.close')}
        onConfirm={closeDialogThenPick}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'camera'}
        tone="primary"
        title={t('capture.err.camera.title')}
        body={t('capture.err.camera.body')}
        confirmLabel={t('capture.gallery')}
        cancelLabel={t('common.close')}
        onConfirm={closeDialogThenPick}
        onCancel={() => setDialog(null)}
      />
      <DropOverlay open={dragging} />
    </CaptureContext>
  );
}
