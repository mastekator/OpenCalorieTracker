import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Redirect, useLocation, useSearch } from 'wouter';
import {
  Calendar,
  Camera,
  ImageOff,
  Plus,
  Sparkle,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { z } from 'zod';
import {
  DISH_GRAMS,
  entryDay,
  illustrationIdSchema,
  matchIllustration,
  mealTypeAt,
  nameKey,
  round1,
  scaleItem,
  type Meal,
  type MealInput,
  type MealItemInput,
  type MealPatch,
  type DayChoice,
  type IllustrationId,
  type MealType,
  type RecognizedDish,
  type Units,
  uuid,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import {
  useAiStatus,
  useDb,
  useIllustrationChoices,
  useMeal,
  useSettings,
} from '../../data/DataContext';
import type { Choices } from '../../data/db';
import {
  createMeal,
  patchMeal,
  putIllustrationChoice,
} from '../../data/outbox';
import { useT } from '../../i18n';
import { useBarVariant } from '../../app/connection';
import { useSession } from '../../app/SessionContext';
import { useDirty } from '../../app/dirty';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { Field } from '../../ui/Field/Field';
import { DishRow } from '../../ui/DishRow/DishRow';
import { DishSheet } from '../../ui/DishSheet/DishSheet';
import { HistoryHint } from '../../ui/HistoryHint/HistoryHint';
import { IllustrationPicker } from '../../ui/IllustrationPicker/IllustrationPicker';
import {
  ManualDishSheet,
  type ManualDish,
} from '../../ui/ManualDishSheet/ManualDishSheet';
import { MealTypeSegment } from '../../ui/MealTypeSegment/MealTypeSegment';
import { NavBar } from '../../ui/NavBar/NavBar';
import { OfflineBar, useOnline } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Segment } from '../../ui/Segment/Segment';
import { useToast } from '../../ui/Toast/Toast';
import { diaryDay, localToday } from '../diary/day';
import type { TodayState } from '../diary/TodayScreen';
import { UNDO_MS, useUndoDelete } from '../diary/undoDelete';
import { MEAL_NEW_PATH, useCapture } from './CaptureContext';
import { RecognitionScreen, type MealEditState } from './RecognitionScreen';
import { ImageDecodeError, prepareImage } from './prepareImage';
import './MealEditScreen.css';

/**
 * `illustration`: picked by hand on this dish — a loaded meal passes it only with
 * `illustrationManual`, or the automatic one would freeze and stop following the name.
 */
type Dish = ManualDish & { confidence?: number; illustration?: IllustrationId };
/** Why the manual sheet opened (MealEditState); set: no AI dishes came. */
type ManualReason = Extract<MealEditState, { manual: unknown }>['manual'];

type Row = {
  /** Stable key: rows are deleted and put back in place (4.5). */
  id: string;
  /** As recognized or entered, with the current name: every recalculation starts from here (AC-3.2). */
  original: Dish;
  source: 'ai' | 'manual' | 'history';
  /** Null while the weight field is invalid (AC-3.4). */
  grams: number | null;
  /** Last valid weight: the numbers stay on it while the field is invalid. */
  shown: number;
  /** Weight or name edited: the confidence badge goes (AC-2.9). */
  edited: boolean;
  /** A similar dish from the history: the hint under the row (4.3). */
  previous?: Previous;
};

/** The unsaved edits of a saved meal, kept across its recalculation (5.6). */
export type Draft = { rows: Row[]; mealType: MealType; when: string };
/**
 * `history.state` of /meal/:clientId and its /recalc: the draft before the recalculation,
 * and once the AI answered its dishes.
 */
export type RecalcState = { draft: Draft; dishes?: RecognizedDish[] };

const photoSchema = z.object({ photoId: z.string() });
const previousSchema = z.array(
  z
    .object({
      mealId: z.number(),
      eatenAt: z.string(),
      grams: z.number(),
      kcal: z.number(),
      proteinG: z.number(),
      fatG: z.number(),
      carbsG: z.number(),
      illustration: illustrationIdSchema,
    })
    .nullable(),
);
/** The fields of `PreviousDish` the hint uses. */
type Previous = NonNullable<z.infer<typeof previousSchema>[number]>;
/** Delay after a name typed by hand before looking it up (AC-11.6). */
export const LOOKUP_DELAY_MS = 300;

type Lookup = { id: string; name: string; kcalPer100?: number };
const lookupOf = (row: Row): Lookup => ({
  id: row.id,
  name: row.original.name,
  ...(row.original.grams > 0 && {
    kcalPer100: (row.original.kcal / row.original.grams) * 100,
  }),
});

/** Default time of a meal added to a past day (AC-2.12). */
const MEAL_TIME: Record<MealType, string> = {
  breakfast: '08:00',
  lunch: '13:00',
  dinner: '19:00',
  snack: '16:00',
};

/** East-positive offset of the device at `at`, as the API takes it. */
const offsetAt = (at: Date) => -at.getTimezoneOffset();

/** `YYYY-MM-DDTHH:mm` of `at` on the device clock, as `<input type="datetime-local">` takes it. */
const localInput = (at: Date) =>
  new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

/** A saved dish as the screen edits it: its stored values are the base for recalculation (AC-2.8). */
const savedRow = (item: Meal['items'][number]): Row =>
  toRow(
    {
      name: item.name,
      grams: item.grams,
      kcal: item.kcal,
      proteinG: item.proteinG,
      fatG: item.fatG,
      carbsG: item.carbsG,
      confidence: item.confidence ?? undefined,
      ...(item.illustrationManual && { illustration: item.illustration }),
    },
    item.source,
  );

const inRange = (g: number) => g >= DISH_GRAMS.min && g <= DISH_GRAMS.max;

function toRow(original: Dish, source: Row['source'] = 'ai'): Row {
  // AI grams may carry any decimals; the API takes one (mealItemInputSchema).
  const g = round1(original.grams);
  return {
    id: uuid(),
    original,
    source,
    grams: inRange(g) ? g : null,
    shown: g,
    edited: false,
  };
}

const itemOf = (row: Row): MealItemInput => {
  const { name, kcal, proteinG, fatG, carbsG, grams, confidence } = scaleItem(
    row.original,
    row.shown,
  );
  return {
    name,
    grams,
    kcal,
    proteinG,
    fatG,
    carbsG,
    source: row.source,
    // A manual dish has no confidence (AC-3.9).
    ...(row.source === 'ai' && !row.edited && { confidence }),
    // Only a hand-picked one is sent; the server matches the rest (ADR-0009).
    ...(row.original.illustration && {
      illustration: row.original.illustration,
    }),
  };
};

type Props = {
  /** Recognized dishes; empty for manual entry. */
  dishes: Dish[];
  /** Set: the manual sheet opens at once; other than 'user', a banner says why (5.3). */
  manual?: ManualReason;
  photoId?: string;
  units: Units;
  /**
   * Writes the meal; a rejection keeps the edits and offers «Try again» (E-4.3).
   * `photo`: added from the photo slot while its upload failed, queued with the meal.
   */
  onSave: (input: MealInput, photo?: Blob) => Promise<void>;
  onClose: () => void;
  /** A past day (`YYYY-MM-DD`) from «Add an entry for this day» (AC-2.11); none: now. */
  date?: string;
  /** The clock: read on open and again on Save, the time eaten (E-1.4). */
  now?: () => Date;
  /** Editing a saved meal: its own dishes are not «last time» (OCT-53 grooming). */
  mealId?: number;
  /** Remembered illustration per dish nameKey (useIllustrationChoices). */
  choices?: Choices;
  /** A pick in the «Dish picture» sheet, remembered for the name; null: back to automatic (AC-4.4). */
  onChoice?: (name: string, illustration: IllustrationId | null) => void;
  /**
   * A saved meal (OCT-19 §3.1): its dishes, type and time; `onSave` is not used.
   * `onPatch` gets only what changed, null when nothing did; `onDelete` deletes it.
   */
  meal?: Meal;
  onPatch?: (patch: Omit<MealPatch, 'editedAt'> | null) => Promise<void>;
  onDelete?: () => void;
  /** Coming back from a recalculation: the draft, and the AI's dishes in place of the rows. */
  recalc?: RecalcState;
  /** Set only while the meal can be recalculated: full photo, online, AI ready (AC-10.7). */
  onRecalc?: (draft: Draft) => void;
  /** «Not now» on the «AI is back» banner. */
  onDismissRecalc?: () => void;
};

/** Screen 4 (design OCT-16 §3, E.2): dishes, weights with live totals, meal type, save. */
export function MealEditScreen({
  dishes,
  manual,
  photoId,
  units,
  onSave,
  onClose,
  date,
  now = () => new Date(),
  meal,
  mealId = meal?.id,
  choices,
  onChoice,
  onPatch,
  onDelete,
  recalc,
  onRecalc,
  onDismissRecalc,
}: Props) {
  const { t, num, locale } = useT();
  const online = useOnline();
  const [opened] = useState(now);
  // 00:00-03:59: the two choices give different days, a late snack goes to yesterday (AC-0.1a).
  const late =
    !date &&
    !meal &&
    entryDay(opened, offsetAt(opened), 'yesterday') !==
      entryDay(opened, offsetAt(opened), 'today');
  const [day, setDay] = useState<DayChoice>('yesterday');
  // The idempotency key lives as long as the screen: «Try again» resends the same meal (4.8).
  const [clientId] = useState(uuid);
  const [rows, setRows] = useState(() =>
    recalc?.dishes
      ? recalc.dishes.map((d) => toRow(d))
      : (recalc?.draft.rows ??
        (meal ? meal.items.map(savedRow) : dishes.map((d) => toRow(d)))),
  );
  // The AI's dishes replace the entry's: saved with the offer cleared, «Restore my numbers» undoes it.
  const [recalced, setRecalced] = useState(!!recalc?.dishes);
  const [mealType, setMealType] = useState<MealType>(
    () =>
      recalc?.draft.mealType ??
      meal?.mealType ??
      (date ? 'lunch' : mealTypeAt(opened.getHours())),
  );
  // A saved meal: date and time on the device clock, never in the future (AC-2.9).
  const maxWhen = localInput(opened);
  const savedWhen = meal ? localInput(new Date(meal.eatenAt)) : '';
  const [when, setWhen] = useState(recalc?.draft.when ?? savedWhen);
  // A past day: the time follows the meal type until edited by hand (AC-2.12).
  const [time, setTime] = useState<string | null>(null);
  const eatenTime = time ?? MEAL_TIME[mealType];
  const [hh, mm] = eatenTime.split(':').map(Number);
  const [y, m, d] = (date ?? '').split('-').map(Number);
  /** The time eaten on a past day, local. */
  const pastAt = () => new Date(y!, m! - 1, d, hh, mm);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [editing, setEditing] = useState<string | null>(null);
  // Row whose «Dish picture» sheet is open (OCT-33 4.1).
  const [picking, setPicking] = useState<string | null>(null);
  const [adding, setAdding] = useState(manual !== undefined); // AC-5.5, 5.3
  // Recognized, uploaded from the slot, or kept on the device when the upload failed.
  const [photo, setPhoto] = useState<
    { id: string; url: string } | { blob: Blob; url: string } | null
  >(() =>
    meal?.photo
      ? {
          id: meal.photo.id,
          url: `/api/photos/${encodeURIComponent(meal.photo.id)}?size=preview`,
        }
      : photoId
        ? {
            id: photoId,
            url: `/api/photos/${encodeURIComponent(photoId)}?size=preview`,
          }
        : null,
  );
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  // The url that failed to load: a new photo shows again without a reset.
  const [brokenUrl, setBrokenUrl] = useState<string>();
  const cameraInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  // Row whose pencil gets focus after a delete or «Undo», so it never drops to <body> (WCAG 2.4.3).
  const focusRow = useRef<string | null>(null);
  const toast = useToast();
  const capture = useCapture();
  // Pending history lookups by key; a new one with the same key cancels the old (AC-11.6).
  const lookups = useRef(new Map<string, AbortController>());

  /** The hint is optional (AC-11.3): errors and offline show nothing. */
  function findPrevious(key: string, wanted: Lookup[], ms = 0) {
    lookups.current.get(key)?.abort();
    const ctl = new AbortController();
    lookups.current.set(key, ctl);
    const timer = setTimeout(() => {
      api('/api/dishes/previous', previousSchema, {
        method: 'POST',
        body: {
          dishes: wanted.map(({ name, kcalPer100 }) => ({ name, kcalPer100 })),
        },
        signal: ctl.signal,
      }).then(
        (found) =>
          setRows((rs) =>
            rs.map((r) => {
              const i = wanted.findIndex((w) => w.id === r.id);
              const prev = found[i];
              // A renamed row waits for its own answer.
              return prev &&
                prev.mealId !== mealId &&
                r.original.name === wanted[i]!.name
                ? { ...r, previous: prev }
                : r;
            }),
          ),
        () => {},
      );
    }, ms);
    ctl.signal.addEventListener('abort', () => clearTimeout(timer));
  }

  // One request for all recognized dishes, by the AI's kcal per 100 g.
  useEffect(() => {
    const pending = lookups.current;
    if (rows.length) findPrevious('ai', rows.slice(0, 20).map(lookupOf));
    return () => pending.forEach((c) => c.abort());
  }, []);

  const items = rows.map(itemOf);
  // Follows the name live (AC-3.6, AC-4.5): hand-picked, then remembered for the name, then matched.
  const illustrationOf = ({ original: { name, illustration } }: Row) =>
    illustration ?? choices?.[nameKey(name)] ?? matchIllustration(name);
  const total = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbsG') =>
    items.reduce((s, i) => s + i[k], 0);
  const valid =
    rows.length > 0 && rows.every((r) => r.grams !== null) && (!meal || !!when);
  // What a saved meal compares against: the screen is dirty once any of it differs (AC-2.10).
  const itemsKey = JSON.stringify(items);
  // Against the saved meal, not a draft brought back from a recalculation.
  const [initial] = useState(() =>
    meal
      ? {
          itemsKey: JSON.stringify(meal.items.map(savedRow).map(itemOf)),
          mealType: meal.mealType,
          when: savedWhen,
        }
      : { itemsKey, mealType, when },
  );
  const changed = {
    // An invalid weight is an edit too: leaving must not drop it silently (E-0.4).
    items: recalced || itemsKey !== initial.itemsKey || !valid,
    mealType: mealType !== initial.mealType,
    when: when !== initial.when,
  };
  const dirty = changed.items || changed.mealType || changed.when;

  const setGrams = (index: number, grams: number | null) =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === index
          ? { ...r, grams, shown: grams ?? r.shown, edited: true }
          : r,
      ),
    );

  // Removed and put back in place by «Undo» (4.5); after leaving the screen «Undo» does nothing.
  const remove = (id: string) => {
    const index = rows.findIndex((r) => r.id === id);
    const row = rows[index];
    if (!row) return;
    // Next row, else the previous one; with none left the empty state takes focus.
    focusRow.current = (rows[index + 1] ?? rows[index - 1])?.id ?? null;
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast({
      text: t('edit.deleted', { dish: row.original.name }),
      ms: 5000,
      action: {
        label: t('common.undo'),
        onClick: () => {
          focusRow.current = row.id;
          setRows((rs) => [...rs.slice(0, index), row, ...rs.slice(index)]);
        },
      },
    });
  };

  const applySheet = (id: string, name: string, grams: number) => {
    setEditing(null);
    const row = rows.find((r) => r.id === id);
    const renamed = !!row && name !== row.original.name;
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              original: { ...r.original, name },
              grams,
              shown: grams,
              edited: r.edited || renamed || grams !== r.grams,
              previous: renamed ? undefined : r.previous,
            }
          : r,
      ),
    );
    if (row && renamed)
      findPrevious(
        id,
        [lookupOf({ ...row, original: { ...row.original, name } })],
        LOOKUP_DELAY_MS,
      );
  };

  // Picked: on this dish and for its name; null: both go and the name matches again (AC-4.4, 4.7).
  const pickIllustration = (row: Row, illustration: IllustrationId | null) => {
    setPicking(null);
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? {
              ...r,
              original: {
                ...r.original,
                illustration: illustration ?? undefined,
              },
            }
          : r,
      ),
    );
    onChoice?.(row.original.name, illustration);
  };

  const addManual = (dish: ManualDish) => {
    setAdding(false);
    const row = toRow(dish, 'manual');
    focusRow.current = row.id;
    setRows((rs) => [...rs, row]);
    findPrevious(row.id, [lookupOf(row)], LOOKUP_DELAY_MS);
  };

  // The hint unmounts with the focused button, so focus goes back to the dish row.
  const keepEstimate = (id: string) => {
    focusRow.current = id;
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, previous: undefined } : r)),
    );
  };

  // «Same as last time»: weight recalculation now starts from the previous values (AC-11.5).
  const applyPrevious = (row: Row, prev: Previous) => {
    const { grams, kcal, proteinG, fatG, carbsG } = prev;
    focusRow.current = row.id;
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? {
              ...r,
              original: {
                name: r.original.name,
                grams,
                kcal,
                proteinG,
                fatG,
                carbsG,
              },
              source: 'history',
              grams,
              shown: grams,
              edited: false,
              previous: undefined,
            }
          : r,
      ),
    );
    toast({
      text: t('edit.history.applied'),
      ms: 5000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          setRows((rs) => rs.map((r) => (r.id === row.id ? row : r))),
      },
    });
  };

  // The slot photo never goes to the AI (AC-5.7).
  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    let blob: Blob | undefined;
    try {
      blob = await prepareImage(file);
      const { photoId: id } = await api('/api/photos', photoSchema, {
        method: 'POST',
        body: blob,
      });
      setPhoto({
        id,
        url: `/api/photos/${encodeURIComponent(id)}?size=preview`,
      });
    } catch (err) {
      if (blob && err instanceof ApiError && err.status === 0)
        // No network: the outbox uploads it with the meal (ADR-0008).
        setPhoto({ blob, url: URL.createObjectURL(blob) });
      else if (
        err instanceof ImageDecodeError ||
        (err instanceof ApiError &&
          (err.code === 'photo_invalid' || err.code === 'photo_too_large'))
      )
        toast({ text: t('capture.err.open.title') });
      else if (err instanceof ApiError)
        toast({ text: t('capture.upload_failed') });
      else throw err;
    } finally {
      setUploading(false);
    }
  };
  const photoUrl = photo?.url;
  useEffect(
    () => () => {
      if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  /** Only what changed; nothing changed: null, and nothing is queued. */
  function patchOf(): Omit<MealPatch, 'editedAt'> | null {
    if (!dirty) return null;
    // Parsed as local time; the offset is the one at that moment, not now (DST).
    const at = new Date(when);
    return {
      ...(changed.mealType && { mealType }),
      ...(changed.items && { items }),
      // The server then records the current model on the AI dishes (AC-10.10).
      ...(recalced && { recalcOffer: false }),
      ...(changed.when && {
        eatenAt: at.toISOString(),
        tzOffsetMin: offsetAt(at),
        localDate: entryDay(at, offsetAt(at), 'today'),
      }),
    };
  }

  /** Resolves true once saved; false when invalid, already saving or failed (the screen shows why). */
  async function save() {
    if (saving.current || !valid) return false; // a second tap sends nothing (E-4.2)
    saving.current = true;
    setStatus('saving');
    const at = date ? pastAt() : now();
    try {
      if (meal) {
        await onPatch?.(patchOf());
        return true;
      }
      await onSave(
        {
          clientId,
          eatenAt: at.toISOString(),
          tzOffsetMin: offsetAt(at),
          localDate: date ?? entryDay(at, offsetAt(at), day),
          mealType,
          ...(photo && 'id' in photo && { photoId: photo.id }),
          // Entered by hand because of the AI, with a photo: recalculable later (5.6).
          ...(manual && manual !== 'user' && photo && { recalcOffer: true }),
          items,
        },
        photo && 'blob' in photo ? photo.blob : undefined,
      );
      return true;
    } catch {
      saving.current = false;
      setStatus('error');
      return false;
    }
  }

  // A new meal asks while there are dishes, edited or not (4.7, AC-3.12); a saved one only after edits (6.8).
  useDirty(
    meal ? dirty : rows.length > 0,
    save,
    meal
      ? {
          title: t('edit.leave_existing.title'),
          body: t('edit.leave_existing.body'),
        }
      : {
          title: t('edit.leave.title'),
          body: t(dishes.length ? 'edit.leave.body' : 'edit.leave.body_manual'),
        },
  );

  // Once per recalculation: StrictMode runs effects twice, the ref outlives that.
  const recalcToast = useRef(false);
  useEffect(() => {
    if (!recalc?.dishes || recalcToast.current) return;
    recalcToast.current = true;
    toast({
      text: t('recalc.done'),
      ms: 5000,
      action: {
        label: t('recalc.undo'),
        // Back to the draft right before the recalculation, edits included (OCT-62 design).
        onClick: () => {
          setRows(recalc.draft.rows);
          setRecalced(false);
        },
      },
    });
  }, []);

  // Runs after the sheet's cleanup, which returns focus to its (possibly deleted) opener.
  useEffect(() => {
    const id = focusRow.current;
    focusRow.current = null;
    if (id)
      document
        .querySelector<HTMLElement>(`[data-row="${id}"] .dish-row__edit`)
        ?.focus();
  }, [rows]);

  const keys = useRef({ save, onClose });
  keys.current = { save, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void keys.current.save();
      } else if (e.key === 'Escape' && !e.defaultPrevented) {
        keys.current.onClose(); // the leave guard asks (4.7)
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const timeOf = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(at);
  const dateOf = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const yesterday = entryDay(opened, offsetAt(opened), 'yesterday');
  const title = meal
    ? t('edit.title_existing', {
        meal: t(`meal.type.${mealType}`),
        date: dateOf((when || initial.when).slice(0, 10), {
          day: 'numeric',
          month: 'short',
        }),
      })
    : date
      ? t('edit.title', {
          day: dateOf(date, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }),
          time: timeOf(pastAt()),
        })
      : t('edit.title', {
          // The real day: which day the snack counts toward is the segment's job (OCT-166).
          day: t('day.today'),
          time: timeOf(opened),
        });
  const busy = status === 'saving';
  const editingRow = rows.find((r) => r.id === editing);
  const offer = !!meal?.recalcOffer && !!onRecalc && !recalced;
  const startRecalc = () => onRecalc?.({ rows, mealType, when });
  const pickingRow = rows.find((r) => r.id === picking);
  // A saved meal takes no photo in PATCH; a meal with a photo has one (AC-4.3).
  const photoActions = !meal && !photo && !uploading;
  const takePhoto = (input: typeof photoInput) => () => {
    setPicking(null);
    input.current?.click();
  };

  return (
    <div className="meal-edit">
      <OfflineBar variant={useBarVariant()} />
      <div className="meal-edit__window">
        <NavBar
          title={title}
          action={{ icon: X, label: t('common.close'), onClick: onClose }}
        />
        {manual && manual !== 'user' && (
          <div className="meal-edit__error">
            <Banner tone="notice">
              {t(
                manual === 'ai_down'
                  ? 'manual_dish.ai_down'
                  : `recog.${manual}`,
              )}
            </Banner>
          </div>
        )}
        {offer && (
          <div className="meal-edit__error">
            <Banner
              tone="accent"
              title={t('recalc.banner.title')}
              actions={
                <>
                  <button type="button" onClick={startRecalc} disabled={busy}>
                    {t('recalc.action')}
                  </button>
                  <button type="button" onClick={onDismissRecalc}>
                    {t('recalc.dismiss')}
                  </button>
                </>
              }
            >
              {t('recalc.banner.body')}
            </Banner>
          </div>
        )}
        {status === 'error' && (
          <div className="meal-edit__error">
            <Banner tone="danger" title={t('edit.save_err.title')}>
              {t('edit.save_err.body')}
            </Banner>
          </div>
        )}
        <div className="meal-edit__body">
          <aside
            className={`meal-edit__summary${!meal || photo ? ' meal-edit__summary--photo' : ''}`}
          >
            {photo ? (
              brokenUrl === photo.url ? (
                <div
                  className="meal-edit__thumb meal-edit__thumb--broken"
                  role="img"
                  aria-label={t('edit.photo.unavailable')}
                >
                  <ImageOff aria-hidden="true" />
                </div>
              ) : (
                <img
                  className="meal-edit__thumb"
                  src={photo.url}
                  alt=""
                  onError={() => setBrokenUrl(photo.url)}
                />
              )
            ) : meal ? null : (
              <button
                type="button"
                className="meal-edit__thumb meal-edit__photo-add"
                disabled={uploading}
                aria-busy={uploading || undefined}
                aria-label={t('edit.photo.add_label')}
                onClick={() => photoInput.current?.click()}
              >
                {uploading ? (
                  // Button's spinner, the same on every waiting action.
                  <span className="button__spinner" aria-hidden="true" />
                ) : (
                  <Camera aria-hidden="true" />
                )}
                {t('edit.photo.add')}
              </button>
            )}
            <div className="meal-edit__total tabular-nums">
              <p className="meal-edit__kcal">
                {num(total('kcal'))}{' '}
                <span className="meal-edit__unit">{t('today.kcal')}</span>
              </p>
              <p className="meal-edit__macros">
                {(
                  [
                    ['protein', 'proteinG'],
                    ['fat', 'fatG'],
                    ['carbs', 'carbsG'],
                  ] as const
                ).map(([macro, key]) => (
                  <span key={macro}>
                    <i
                      className={`meal-edit__dot meal-edit__dot--${macro}`}
                      aria-hidden="true"
                    />
                    {t(`macro.${macro}`)} {num(total(key))} {t('macro.g')}
                  </span>
                ))}
              </p>
              {onRecalc && !offer && (
                <span className="meal-edit__recalc">
                  <Button variant="plain" onClick={startRecalc} disabled={busy}>
                    <Sparkle
                      aria-hidden="true"
                      className="meal-edit__add-icon"
                    />
                    {t('recalc.action_photo')}
                  </Button>
                </span>
              )}
            </div>
            {rows.some((r) => r.source === 'ai') && (
              <p className="meal-edit__estimate">
                <Sparkle aria-hidden="true" />
                {t('edit.estimate')}
              </p>
            )}
          </aside>
          <div className="meal-edit__main">
            <MealTypeSegment value={mealType} onChange={setMealType} />
            {late && (
              <div className="meal-edit__day">
                <Segment
                  label={t('edit.late.label')}
                  options={(['yesterday', 'today'] as const).map((v) => ({
                    value: v,
                    label: t(`edit.late.${v}`),
                  }))}
                  value={day}
                  onChange={setDay}
                />
                {day === 'yesterday' && (
                  <p className="meal-edit__note">
                    {t('edit.late.hint', {
                      time: timeOf(opened),
                      // Keep "14 November" on one line.
                      date: dateOf(yesterday, {
                        day: 'numeric',
                        month: 'long',
                      }).replace(' ', '\u00a0'),
                    })}
                  </p>
                )}
              </div>
            )}
            {meal && (
              // OCT-19 §3.1: the value in the app's language; the native picker covers it transparently.
              <label className="meal-edit__when">
                <Calendar aria-hidden="true" />
                <span aria-hidden="true">
                  {new Intl.DateTimeFormat(locale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                    .format(new Date(when))
                    .replace(/ /g, '\u00a0')}
                </span>
                <input
                  type="datetime-local"
                  aria-label={t('edit.when')}
                  required
                  value={when}
                  max={maxWhen}
                  onClick={(event) => {
                    try {
                      event.currentTarget.showPicker(); // desktop Chrome: a click alone only focuses
                    } catch {
                      // No showPicker, or no user activation: the native behaviour stays.
                    }
                  }}
                  // A typed future time is pulled back to now (AC-2.9); a cleared field keeps the value.
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setWhen(v > maxWhen ? maxWhen : v);
                  }}
                />
              </label>
            )}
            {date && (
              <Field
                label={t('edit.time')}
                type="time"
                required
                value={eatenTime}
                onChange={(e) => setTime(e.target.value || null)}
              />
            )}
            {rows.length > 0 ? (
              <ul className="meal-edit__list">
                {rows.map((row, i) => {
                  const item = items[i]!;
                  return (
                    <li key={row.id} data-row={row.id}>
                      <DishRow
                        dish={{
                          ...item,
                          grams: row.grams,
                          confidence: item.confidence,
                          illustration: illustrationOf(row),
                        }}
                        units={units}
                        onGramsChange={(g) => setGrams(i, g)}
                        onEdit={() => setEditing(row.id)}
                        onDelete={() => remove(row.id)}
                        onIllustration={() => setPicking(row.id)}
                      />
                      {row.previous && (
                        <HistoryHint
                          eatenAt={row.previous.eatenAt}
                          grams={row.previous.grams}
                          kcal={row.previous.kcal}
                          illustration={row.previous.illustration}
                          units={units}
                          onApply={() => applyPrevious(row, row.previous!)}
                          onKeep={() => keepEstimate(row.id)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : dishes.length > 0 && !meal ? (
              // 4.6: every recognized dish deleted.
              <ScreenState
                icon={<UtensilsCrossed />}
                title={t('edit.empty.title')}
                focusTitle
                action={
                  <>
                    <Button variant="tonal" onClick={() => setAdding(true)}>
                      {t('edit.add_manual')}
                    </Button>
                    <Button variant="plain" onClick={capture.camera}>
                      {t('common.retake')}
                    </Button>
                  </>
                }
              >
                {t('edit.empty.body')}
              </ScreenState>
            ) : (
              <p className="meal-edit__empty">{t('edit.empty_manual')}</p>
            )}
            {(rows.length > 0 || dishes.length === 0) && (
              <Button variant="plain" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" className="meal-edit__add-icon" />
                {t('edit.add_manual')}
              </Button>
            )}
          </div>
        </div>
        <footer className="meal-edit__footer">
          {!online && (
            <p className="meal-edit__note">{t('edit.offline_note')}</p>
          )}
          <div className="meal-edit__actions">
            <span className="meal-edit__cancel">
              <Button variant="plain" onClick={onClose}>
                {t('common.cancel')}
              </Button>
            </span>
            {meal && rows.length === 0 ? (
              // Every dish deleted: the entry itself goes (E-2.3).
              <Button variant="danger" onClick={onDelete}>
                {t('edit.delete_entry')}
              </Button>
            ) : (
              <Button
                onClick={() => void save()}
                disabled={!valid}
                loading={busy}
              >
                {t(
                  busy
                    ? 'edit.saving'
                    : status === 'error'
                      ? 'common.retry'
                      : 'edit.save',
                )}
              </Button>
            )}
            {meal && rows.length > 0 && (
              <span className="meal-edit__delete">
                <Button variant="danger-plain" onClick={onDelete}>
                  {t('edit.delete_entry')}
                </Button>
              </span>
            )}
          </div>
        </footer>
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="edit-photo"
        onChange={(e) => void onPhoto(e)}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="edit-camera"
        onChange={(e) => void onPhoto(e)}
      />
      {pickingRow && (
        <IllustrationPicker
          open
          name={pickingRow.original.name}
          current={illustrationOf(pickingRow)}
          manual={
            !!pickingRow.original.illustration ||
            !!choices?.[nameKey(pickingRow.original.name)]
          }
          onPick={(id) => pickIllustration(pickingRow, id)}
          onReset={() => pickIllustration(pickingRow, null)}
          onClose={() => setPicking(null)}
          {...(photoActions && {
            onCamera: takePhoto(cameraInput),
            onGallery: takePhoto(photoInput),
          })}
        />
      )}
      {adding && (
        <ManualDishSheet
          units={units}
          onAdd={addManual}
          onClose={() => setAdding(false)}
        />
      )}
      {editingRow && (
        <DishSheet
          original={editingRow.original}
          grams={editingRow.grams ?? editingRow.shown}
          units={units}
          onDone={(name, grams) => applySheet(editingRow.id, name, grams)}
          onDelete={() => {
            setEditing(null);
            remove(editingRow.id);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * MEAL_EDIT_PATH: dishes come in `history.state` from the recognition screen. After a
 * reload the state is gone: recognize the same photo again, the server answers from cache.
 */
export function MealEditRoute() {
  const db = useDb();
  const settings = useSettings();
  const choices = useIllustrationChoices();
  const { user } = useSession();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const photoId = params.get('photo') ?? undefined;
  // Checked like the diary's address: a real past day, else today (AC-2.3).
  const today = localToday();
  const day = diaryDay(params.get('date') ?? today, today);
  const date = day === today ? undefined : day;
  const [state] = useState(() => history.state as MealEditState | null);
  if (!state && photoId)
    return <Redirect to={`${MEAL_NEW_PATH}?${search}`} replace />;
  return (
    <MealEditScreen
      dishes={state && 'dishes' in state ? state.dishes : []}
      manual={state && 'manual' in state ? state.manual : undefined}
      photoId={photoId}
      date={date}
      units={settings?.units ?? user?.units ?? 'metric'}
      choices={choices}
      onChoice={(name, id) => void putIllustrationChoice(db, name, id)}
      onSave={async (input, photo) => {
        await createMeal(db, input, photo);
        if (date) return navigate(`/diary/${date}`, { replace: true });
        navigate('/', {
          replace: true,
          state: { saved: input.clientId } satisfies TodayState,
        });
      }}
      onClose={() => navigate('/')}
    />
  );
}

/**
 * /meal/:clientId — a saved meal from the local copy (ADR-0011); the edit and the delete
 * go through the queue. Back to the meal's own day; a move says where it went (6.7).
 */
export function MealEditExisting({ clientId }: { clientId: string }) {
  const { t, locale } = useT();
  const db = useDb();
  const settings = useSettings();
  const choices = useIllustrationChoices();
  const { user } = useSession();
  const meal = useMeal(clientId);
  const undo = useUndoDelete();
  const toast = useToast();
  const [, navigate] = useLocation();
  // Only a meal with its full photo can be recalculated: no request for the others.
  const ai = useAiStatus(!!meal?.photo?.full);
  const online = useOnline();
  const [recalc] = useState(() => recalcState());
  if (meal === undefined) return null; // the local copy answers within a frame
  if (!meal || undo.hidden.has(clientId)) return <Redirect to="/" replace />;
  const from = meal.localDate;
  const back = from === localToday() ? '/' : `/diary/${from}`;
  // A fresh «ready» only: the stored answer may be stale (AC-10.7).
  const canRecalc =
    !!meal.photo?.full &&
    online &&
    !ai.loading &&
    ai.status?.recognition === 'ready';
  return (
    <MealEditScreen
      key={meal.clientId}
      meal={meal}
      recalc={recalc}
      onRecalc={
        canRecalc
          ? (draft) =>
              // Replace: the leave guard lets it pass, the draft rides along (OCT-62 grooming).
              navigate(`/meal/${encodeURIComponent(clientId)}/recalc`, {
                replace: true,
                state: { draft } satisfies RecalcState,
              })
          : undefined
      }
      onDismissRecalc={() =>
        void patchMeal(db, clientId, { recalcOffer: false })
      }
      dishes={[]}
      units={settings?.units ?? user?.units ?? 'metric'}
      choices={choices}
      onChoice={(name, id) => void putIllustrationChoice(db, name, id)}
      onSave={async () => {}}
      onPatch={async (patch) => {
        if (patch) await patchMeal(db, clientId, patch);
        navigate(back, { replace: true });
        const to = patch && 'localDate' in patch ? patch.localDate : undefined;
        if (to && to !== from)
          toast({
            text: t('edit.moved', {
              date: new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              }).format(new Date(`${to}T00:00:00Z`)),
            }),
            ms: UNDO_MS,
            action: {
              label: t('edit.open'),
              onClick: () => navigate(`/diary/${to}`),
            },
          });
      }}
      onDelete={() => {
        navigate(back, { replace: true });
        undo.remove(meal);
      }}
      onClose={() => navigate(back)}
    />
  );
}

const recalcState = () => {
  const state = history.state as RecalcState | null;
  return state && typeof state === 'object' && 'draft' in state
    ? state
    : undefined;
};

/** /meal/:clientId/recalc — screen 3 on the saved meal's photo; every way out goes back to it. */
export function MealRecalc({ clientId }: { clientId: string }) {
  const meal = useMeal(clientId);
  const [, navigate] = useLocation();
  const [state] = useState(() => recalcState());
  if (meal === undefined) return null;
  const to = `/meal/${encodeURIComponent(clientId)}`;
  // Reloaded without the draft, or no photo to read: back to the entry.
  if (!meal?.photo || !state) return <Redirect to={to} replace />;
  const go = (dishes?: RecognizedDish[]) =>
    navigate(to, {
      replace: true,
      state: { draft: state.draft, dishes } satisfies RecalcState,
    });
  return (
    <RecognitionScreen
      photoId={meal.photo.id}
      recalc={{ onDishes: go, onBack: () => go() }}
    />
  );
}
