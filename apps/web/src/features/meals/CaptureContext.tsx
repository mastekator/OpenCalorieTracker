import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { useT } from '../../i18n';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { DropOverlay } from '../../ui/DropOverlay/DropOverlay';
import { useToast } from '../../ui/Toast/Toast';
import { CaptureMenu } from './CaptureMenu';
import { ImageDecodeError, prepareImage } from './prepareImage';

/** The meal flow; the recognition screen (OCT-57) reads `?photo=` and `?date=`. */
export const MEAL_NEW_PATH = '/meal/new';

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
};

const noop = () => {};
const CaptureContext = createContext<Capture>({
  camera: noop,
  pick: noop,
  manual: noop,
  menu: noop,
  addTo: noop,
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
  const toast = useToast();
  const [, navigate] = useLocation();
  const cameraInput = useRef<HTMLInputElement>(null);
  const pickInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  // The day «Add an entry for this day» was opened for; null from every other way in.
  const date = useRef<string | null>(null);
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

  const upload = async (blob: Blob) => {
    try {
      const { photoId } = await api('/api/photos', photoSchema, {
        method: 'POST',
        body: blob,
      });
      navigate(flowPath(photoId));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.code === 'photo_invalid' || err.code === 'photo_too_large')
        setDialog('open');
      else if (err.status === 0 || err.status >= 500)
        // The prepared blob is kept: «Try again» doesn't re-encode.
        toast({
          text: t('capture.upload_failed'),
          action: {
            label: t('common.retry'),
            onClick: () => void run(() => upload(blob)),
          },
        });
      else toast({ text: t(`errors.${err.code}`) });
    }
  };

  const start = (file: Blob) =>
    run(async () => {
      let blob: Blob;
      try {
        blob = await prepareImage(file);
      } catch (err) {
        if (!(err instanceof ImageDecodeError)) throw err;
        setDialog('open'); // nothing goes to the server (E-1.1)
        return;
      }
      await upload(blob);
    });
  const startRef = useRef(start);
  startRef.current = start;

  const flowPath = (photoId?: string) => {
    const query = new URLSearchParams();
    if (photoId) query.set('photo', photoId);
    if (date.current) query.set('date', date.current);
    const q = query.toString();
    return q ? `${MEAL_NEW_PATH}?${q}` : MEAL_NEW_PATH;
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
      if (file) void startRef.current(file);
    };
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (!file) return; // text paste into fields stays as is
      event.preventDefault();
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
    date.current = null;
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
      />
      <ConfirmDialog
        open={dialog === 'open'}
        tone="primary"
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
