import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { Redirect, useLocation, useSearch } from 'wouter';
import {
  Ban,
  Barcode,
  Bookmark,
  Calendar,
  Camera,
  ChefHat,
  Clock,
  Droplet,
  Ellipsis,
  ImageOff,
  Plus,
  RefreshCw,
  Sparkle,
  UtensilsCrossed,
  WifiOff,
  X,
} from 'lucide-react';
import { z } from 'zod';
import {
  amountGrams,
  defaultAmount,
  entryDay,
  matchIllustration,
  mealTypeAt,
  nameKey,
  per100,
  recipePortion,
  type Meal,
  type MealInput,
  type MealItemInput,
  type Recipe,
  type MealPatch,
  type DayChoice,
  type IllustrationId,
  type MealType,
  type AiQuestion,
  type RecognitionStatus,
  type Units,
  type Product,
  type Amount,
  type PhotoBarcodesResponse,
  type AiSource,
  barcodeLookupSchema,
  uuid,
} from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { AI_SETTINGS_PATH } from '../settings/AiScreen';
import {
  useAiStatus,
  useDb,
  useIllustrationChoices,
  useMeal,
  useMealError,
  useProducts,
  useRecipes,
  useSettings,
} from '../../data/DataContext';
import {
  keepProduct,
  lookupProduct,
  type BarcodeResult,
} from '../../data/products';
import type { Choices } from '../../data/db';
import {
  createDrinkEntry,
  createMeal,
  deleteDrinkEntry,
  flush,
  patchMeal,
  patchSettings,
  putIllustrationChoice,
} from '../../data/outbox';
import { useT } from '../../i18n';
import { useBarVariant } from '../../app/connection';
import { useSession } from '../../app/SessionContext';
import { useDirty } from '../../app/dirty';
import { AiQuestion as Question } from '../../ui/AiQuestion/AiQuestion';
import { Badge } from '../../ui/Badge/Badge';
import { BarcodeConsentSheet } from '../../ui/BarcodeConsentSheet/BarcodeConsentSheet';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import type { Pack } from '../../ui/AmountPicker/AmountPicker';
import { DishRow } from '../../ui/DishRow/DishRow';
import { DishSheet, type Replaced } from '../../ui/DishSheet/DishSheet';
import { HistoryHint } from '../../ui/HistoryHint/HistoryHint';
import { List, ListRow } from '../../ui/List/List';
import { IllustrationPicker } from '../../ui/IllustrationPicker/IllustrationPicker';
import {
  ManualDishSheet,
  type ManualDish,
} from '../../ui/ManualDishSheet/ManualDishSheet';
import { NoKcalHint } from '../../ui/NoKcalHint/NoKcalHint';
import { OffSuggestCard } from '../../ui/OffSuggestCard/OffSuggestCard';
import { MealTypeSegment } from '../../ui/MealTypeSegment/MealTypeSegment';
import { NavBar } from '../../ui/NavBar/NavBar';
import { OfflineBar, useOnline } from '../../ui/OfflineBar/OfflineBar';
import { PortionSheet } from '../../ui/PortionSheet/PortionSheet';
import { RecipeHint } from '../../ui/RecipeHint/RecipeHint';
import { RefineBar } from '../../ui/RefineBar/RefineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Segment } from '../../ui/Segment/Segment';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { PhotoViewer, ViewerMark } from '../../ui/PhotoViewer/PhotoViewer';
import { unitOf } from '../../ui/weightUnits';
import { diaryDay, localToday } from '../diary/day';
import { NEW_RECIPE_PATH } from '../kitchen/KitchenScreen';
import { recipeFor } from '../kitchen/matchRecipes';
import type { RecipeEditorState } from '../kitchen/RecipeEditor';
import { recipeFromMeal } from '../kitchen/recipeFromMeal';
import type { TodayState } from '../diary/TodayScreen';
import { UNDO_MS, useUndoDelete } from '../diary/undoDelete';
import { MEAL_NEW_PATH, useCapture } from './CaptureContext';
import { RecognitionScreen, type MealEditState } from './RecognitionScreen';
import { ImageDecodeError, prepareImage } from './prepareImage';
import { showOffSuggest } from './offSuggest';
import {
  answer,
  applyAgain,
  applyRefine,
  drinkOf,
  itemOf,
  previousSchema,
  remembers,
  requestDishes,
  shownQuestion,
  relink,
  toRequest,
  toRow,
  toRows,
  unlink,
  withFixed,
  type Applied,
  type PhotoDrink,
  type Recognized,
  type Previous,
  type Row,
  type RowEdible,
  type ShownQuestion,
} from './refine';
import { usePackages } from './usePackages';
import { useRefine, type RefineInput } from './useRefine';
import './MealEditScreen.css';

/** Why the manual sheet opened (MealEditState); set: no AI dishes came. */
type ManualReason = Extract<MealEditState, { manual: unknown }>['manual'];

/** The unsaved edits of a saved meal, kept across its recalculation (5.6). */
export type Draft = { rows: Row[]; mealType: MealType; when: string };
/**
 * `history.state` of /meal/:clientId and its /recalc: the draft before the recalculation,
 * and once the AI answered its dishes.
 */
export type RecalcState = {
  draft: Draft;
  dishes?: Recognized[];
  questions?: AiQuestion[];
};

const photoSchema = z.object({ photoId: z.string() });
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
const savedRow = (item: Meal['items'][number]): Row => ({
  ...toRow(
    {
      name: item.name,
      grams: item.grams,
      ...unitOf(item.unit),
      kcal: item.kcal,
      proteinG: item.proteinG,
      fatG: item.fatG,
      carbsG: item.carbsG,
      confidence: item.confidence ?? undefined,
      ...(item.aiGrams != null && { aiGrams: item.aiGrams }),
      ...(item.illustrationManual && { illustration: item.illustration }),
      ...(item.barcode && { barcode: item.barcode }),
    },
    item.source,
  ),
  ...(item.recipeId && { recipeId: item.recipeId }),
});

type Props = {
  /** Recognized dishes; empty for manual entry. */
  dishes: Recognized[];
  /** The AI's questions about `dishes` (ADR-0020 §4). */
  questions?: AiQuestion[];
  /** Set: the manual sheet opens at once; other than 'user', a banner says why (5.3). */
  manual?: ManualReason;
  photoId?: string;
  /** A photo taken without AI, not uploaded yet: saved with the meal through the queue. */
  photoBlob?: Blob;
  units: Units;
  /**
   * Writes the meal; a rejection keeps the edits and offers «Try again» (E-4.3).
   * `photo`: added from the photo slot while its upload failed, queued with the meal.
   */
  onSave: (
    input: MealInput,
    photo?: Blob,
    drinks?: PhotoDrink[],
  ) => Promise<void>;
  /**
   * The water module is on: a drink row gets the «Drink ↔ Food» chip and is passed to `onSave`
   * in `drinks`, not in the meal; no food, no meal and no photo (ADR-0028 §6).
   */
  waterEnabled?: boolean;
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
  /** The code the server refused the saved meal with (OCT-206): a banner says what to fix. */
  refused?: string | null;
  /** Coming back from a recalculation: the draft, and the AI's dishes in place of the rows. */
  recalc?: RecalcState;
  /** Set only while the meal can be recalculated: full photo, online, AI ready (AC-10.7). */
  onRecalc?: (draft: Draft) => void;
  /** «Not now» on the «AI is back» banner. */
  onDismissRecalc?: () => void;
  /** GET /api/ai/status: «What should I fix?» shows unless AI is not set up (ADR-0020 §5). */
  recognition?: RecognitionStatus;
  /** The user's recipes: in the manual sheet and for «Your recipe» (ADR-0023 §5, §6). */
  recipes?: Recipe[];
  /** A saved meal: «⋯» → «Save as recipe» opens the editor with this draft (AC-6.2). */
  onRecipe?: (state: RecipeEditorState) => void;
  /** Barcode lookup in the manual sheet (OCT-313 §3); none: no «Barcode» field. */
  onBarcode?: (code: string) => Promise<BarcodeResult>;
  /** Read from the photo without AI and not found: the manual sheet opens with it (OCT-313 3.4). */
  photoBarcode?: { code: string; admin: boolean };
  /** Products on this device by code: an own one, its serving and save date (OCT-313 2.6). */
  products?: Map<string, Product>;
  /** The photo's codes as looked up: label hints for those without kcal (OCT-313 2.4). */
  codes?: PhotoBarcodesResponse['codes'];
  /** Show «Turn on Open Food Facts» (OCT-313 2.5). */
  offSuggest?: boolean;
  /** «Turn on» (true) or «Not now»: writes the settings; turned on, the photo's codes looked up again. */
  onOffHint?: (enable: boolean) => Promise<PhotoBarcodesResponse['codes']>;
  /** Rows kept in `history.state` while the label camera was open (the page may be unloaded). */
  draft?: Row[];
};

/** Screen 4 (design OCT-16 §3, E.2): dishes, weights with live totals, meal type, save. */
export function MealEditScreen({
  dishes,
  questions,
  manual,
  photoId,
  photoBlob,
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
  refused,
  recalc,
  onRecalc,
  onDismissRecalc,
  recognition,
  recipes = [],
  onRecipe,
  onBarcode,
  photoBarcode,
  products,
  codes = [],
  offSuggest,
  onOffHint,
  draft,
  waterEnabled = false,
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
  const [rows, setRows] = useState(
    () =>
      draft ??
      (recalc?.dishes
        ? toRows(recalc.dishes, recalc.questions)
        : (recalc?.draft.rows ??
          (meal ? meal.items.map(savedRow) : toRows(dishes, questions)))),
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
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // Row whose «Dish picture» sheet is open (OCT-33 4.1).
  const [picking, setPicking] = useState<string | null>(null);
  // The row whose sheet took the photo: a failed upload reopens it with the error (OCT-318).
  const photoRow = useRef<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [adding, setAdding] = useState(manual !== undefined); // AC-5.5, 5.3
  // Only the sheet that opens on arrival carries the photo's barcode.
  const [photoCode, setPhotoCode] = useState(photoBarcode);
  useEffect(() => {
    if (!adding) setPhotoCode(undefined);
  }, [adding]);
  // A recipe tapped in the manual sheet: its portion sheet (OCT-160 3.4).
  const [portion, setPortion] = useState<Recipe | null>(null);
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
        : photoBlob
          ? { blob: photoBlob, url: URL.createObjectURL(photoBlob) }
          : null,
  );
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState(false);
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
  // «Refine» / «Recognize again» (ADR-0020 §9); «Undo» brings back the list and `recalced`.
  const refine = useRefine<{ rows: Row[]; recalced: boolean }>();
  const [refineText, setRefineText] = useState('');
  // The last step's marks, «Removed» and kcal shift; gone with the next edit (OCT-234 C.2).
  // `answered`: the step was an answer chip, not a request (OCT-234 H.2).
  const [applied, setApplied] = useState<
    (Applied & { answered?: boolean; byRecipe?: boolean }) | null
  >(null);
  // Where focus goes once rendered: the field after «Other…» (H.6), the restored chip or the field after «Undo» (WCAG 2.4.3).
  const [focusOn, setFocusOn] = useState<{ selector: string } | null>(null);
  const answeredRow = useRef<string | null>(null);
  const lastRefine = useRef<RefineInput>(null);
  const [photoGone, setPhotoGone] = useState(!!meal?.photo && !meal.photo.full);
  const [noVision, setNoVision] = useState(false);
  const refineError =
    refine.state.status === 'error' ? refine.state.code : null;
  useEffect(() => {
    if (refineError === 'photo_expired') setPhotoGone(true);
    if (refineError === 'ai_no_vision') setNoVision(true);
  }, [refineError]);
  const working =
    refine.state.status === 'busy' || refine.state.status === 'slow';
  const packages = usePackages({
    codes,
    offSuggest,
    onOffHint,
    rows,
    setRows,
    onReplace: () => setApplied(null),
  });
  // A label or Open Food Facts answer replaces rows: an edit or a save meanwhile would be lost.
  const locked = working || packages.reading || packages.offLoading;

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

  /** «Your recipe» goes first: a dish named like a recipe gets no history lookup (ADR-0023 §6). */
  function findHints(key: string, wanted: Row[], ms = 0) {
    const found = new Map<string, Recipe>();
    for (const r of wanted) {
      const recipe = recipeFor(recipes, r.original.name);
      if (recipe) found.set(r.id, recipe);
    }
    if (found.size)
      setRows((rs) =>
        rs.map((r) =>
          found.has(r.id)
            ? { ...r, recipe: found.get(r.id), previous: undefined }
            : r,
        ),
      );
    const rest = wanted.filter((r) => !found.has(r.id));
    if (rest.length) findPrevious(key, rest.map(lookupOf), ms);
    else lookups.current.get(key)?.abort();
  }

  // One request for all recognized dishes, by the AI's kcal per 100 g; a recipe portion needs none.
  useEffect(() => {
    const pending = lookups.current;
    const wanted = rows.filter((r) => r.source !== 'recipe').slice(0, 20);
    if (wanted.length) findHints('ai', wanted);
    return () => pending.forEach((c) => c.abort());
  }, []);

  const items = rows.map(itemOf);
  // Follows the name live (AC-3.6, AC-4.5): hand-picked, then remembered for the name, then matched.
  const illustrationOf = ({ original: { name, illustration } }: Row) =>
    illustration ?? choices?.[nameKey(name)] ?? matchIllustration(name);
  // A saved meal stays a meal: its dishes cannot leave it as drink entries.
  const chip = (r: Row) => waterEnabled && !meal && r.drink !== undefined;
  const isDrink = (r: Row) => chip(r) && r.drink === true;
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
    // Uploaded to a saved meal without a photo; attached by PATCH on save (OCT-126).
    photoId: !!meal && !meal.photo && photo && 'id' in photo ? photo.id : null,
  };
  const dirty =
    changed.items || changed.mealType || changed.when || !!changed.photoId;

  /** A typed weight puts a product dish into «Grams» (AC-3.6). */
  const setGrams = (index: number, grams: number | null, amount?: Amount) => {
    setApplied(null);
    setRows((rs) =>
      rs.map((r, i) =>
        i === index
          ? {
              ...unlink(r),
              grams,
              shown: grams ?? r.shown,
              amount: amount ?? { mode: 'weight', value: grams ?? r.shown },
              fixed: withFixed(r.fixed, 'grams'),
            }
          : r,
      ),
    );
  };

  // Removed and put back in place by «Undo» (4.5); after leaving the screen «Undo» does nothing.
  const remove = (id: string) => {
    const index = rows.findIndex((r) => r.id === id);
    const row = rows[index];
    if (!row) return;
    // Next row, else the previous one; with none left the empty state takes focus.
    focusRow.current = (rows[index + 1] ?? rows[index - 1])?.id ?? null;
    setApplied(null);
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

  const applySheet = (
    id: string,
    name: string,
    grams: number,
    replaced?: Replaced,
    amount?: Amount,
    pack?: Pack,
    edible?: RowEdible,
  ) => {
    setEditing(null);
    const row = rows.find((r) => r.id === id);
    const renamed =
      !!row && name !== (replaced?.dish?.name ?? row.original.name);
    // «Replace» with a product: another dish, as if its code had been found first (AC-3).
    const other = renamed || !!replaced?.dish;
    setApplied(null);
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              // The share from the sheet; otherwise grams typed there are the user's, not the share.
              ...(edible
                ? { ...r, edible }
                : grams !== r.grams
                  ? unlink(r)
                  : r),
              original: replaced
                ? {
                    ...r.original,
                    ...(replaced.dish && {
                      ...replaced.dish,
                      check: undefined,
                    }),
                    name,
                    barcode: replaced.barcode,
                    alt: undefined,
                  }
                : { ...r.original, name },
              ...(replaced?.dish && {
                source: 'barcode' as const,
                edible: undefined,
              }),
              // Another product: the share was the old one's, it must not be saved under its key.
              ...(renamed && { edible: undefined }),
              grams,
              shown: grams,
              amount,
              // Another product after «Replace»: what was typed was about the old one.
              pack: replaced?.dish ? pack : { ...r.pack, ...pack },
              fixed: [
                ...(renamed ? ['name' as const] : []),
                ...(grams !== r.grams ? ['grams' as const] : []),
              ].reduce(withFixed, r.fixed),
              previous: other ? undefined : r.previous,
              recipe: other ? undefined : r.recipe,
              // Another dish now: the server refuses a recipe link on a non-recipe dish.
              ...(renamed &&
                r.source === 'recipe' && {
                  source: 'manual' as const,
                  recipeId: undefined,
                }),
              // A question about another dish (E-10.a).
              question: other ? undefined : r.question,
            }
          : r,
      ),
    );
    if (row && renamed)
      findHints(
        id,
        [{ ...row, original: { ...row.original, name } }],
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

  // `product` is read back from the products on this device (shareOf).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addManual = ({ amount, pack, product, ...dish }: ManualDish) => {
    setAdding(false);
    // A found product's amount and typed package go with the meal, as from the dish sheet (OCT-417).
    const row = { ...toRow(dish, 'manual'), amount, pack };
    focusRow.current = row.id;
    setApplied(null);
    setRows((rs) => [...rs, row]);
    findHints(row.id, [row], LOOKUP_DELAY_MS);
  };

  const addRecipe = (item: MealItemInput) => {
    setPortion(null);
    const { name, grams, kcal, proteinG, fatG, carbsG, recipeId } = item;
    const row: Row = {
      ...toRow({ name, grams, kcal, proteinG, fatG, carbsG }, 'recipe'),
      recipeId,
    };
    focusRow.current = row.id;
    setApplied(null);
    setRows((rs) => [...rs, row]);
  };

  // The hint unmounts with the focused button, so focus goes back to the dish row.
  const keepEstimate = (id: string) => {
    focusRow.current = id;
    setRows((rs) =>
      rs.map((r) =>
        r.id === id ? { ...r, previous: undefined, recipe: undefined } : r,
      ),
    );
  };

  // «Same as last time»: weight recalculation now starts from the previous values (AC-11.5).
  const applyPrevious = (row: Row, prev: Previous) => {
    const { grams, unit, kcal, proteinG, fatG, carbsG } = prev;
    focusRow.current = row.id;
    setApplied(null);
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? {
              ...r,
              original: {
                name: r.original.name,
                grams,
                ...unitOf(unit),
                kcal,
                proteinG,
                fatG,
                carbsG,
              },
              source: 'history',
              edible: undefined,
              grams,
              shown: grams,
              fixed: [],
              previous: undefined,
              question: undefined,
            }
          : r,
      ),
    );
    undoToast(row, 'edit.history.applied');
  };

  // «Use the recipe»: the estimated weight stays, kcal and macros come from the recipe per 100 g.
  const applyRecipe = (row: Row, recipe: Recipe) => {
    const { kcal, proteinG, fatG, carbsG } = recipePortion(recipe, row.shown);
    focusRow.current = row.id;
    setApplied(null);
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? {
              ...r,
              original: {
                name: r.original.name,
                grams: row.shown,
                kcal,
                proteinG,
                fatG,
                carbsG,
              },
              source: 'recipe',
              recipeId: recipe.id,
              edible: undefined,
              fixed: [],
              recipe: undefined,
              question: undefined,
            }
          : r,
      ),
    );
    undoToast(row, 'edit.recipe.applied');
  };

  const undoToast = (
    row: Row,
    text: 'edit.history.applied' | 'edit.recipe.applied',
  ) =>
    toast({
      text: t(text),
      ms: 5000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          setRows((rs) => rs.map((r) => (r.id === row.id ? row : r))),
      },
    });

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
      const failed = err instanceof ImageDecodeError || err instanceof ApiError;
      if (blob && !meal && err instanceof ApiError && err.status === 0)
        // No network: the outbox uploads it with the new meal (ADR-0008); a saved one is online only.
        setPhoto({ blob, url: URL.createObjectURL(blob) });
      else if (meal && failed) {
        // No toast over «Save»: the sheet comes back with the error and the retry (OCT-318).
        setPicking(photoRow.current);
        setPhotoError(true);
      } else if (
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

  async function sendRefine(input: RefineInput) {
    lastRefine.current = input;
    setApplied(null);
    const before = rows;
    const res = await refine.run(input, { rows, recalced });
    if (!res) return;
    const next = (input.mode === 'again' ? applyAgain : applyRefine)(
      before,
      res.dishes,
      res.questions,
    );
    setRows(next.rows);
    setApplied(next);
    // Saved with the current model on its AI dishes, like a recalculation (AC-4.3).
    setRecalced(true);
    setRefineText('');
    // Hints work for the dishes the AI added or changed too (AC-3.5).
    const fresh = next.rows.filter((r) => next.marks[r.id]).slice(0, 20);
    if (fresh.length) findHints('refine', fresh);
  }
  // Local, no request: works offline and costs no refinement (ADR-0020 §4).
  const answerRow = (row: Row, shown: ShownQuestion, option: number) => {
    refine.remember({ rows, recalced });
    answeredRow.current = row.id;
    const recipe = shown.options[option]!.recipe;
    const next = answer(rows, row.id, shown.at[option]!, recipe);
    setRows(next.rows);
    setApplied({ ...next, answered: true, byRecipe: !!recipe });
  };
  const other = (row: Row) => {
    const prefix = `${row.original.name}: `;
    setRefineText((v) => (v.startsWith(prefix) ? v : prefix + v));
    setFocusOn({ selector: '.refine__input' });
  };
  useEffect(() => {
    if (!focusOn) return;
    const el = document.querySelector<HTMLElement>(focusOn.selector);
    el?.focus();
    if (el instanceof HTMLTextAreaElement)
      el.setSelectionRange(el.value.length, el.value.length);
  }, [focusOn]);
  const undoRefine = () => {
    const before = refine.undo();
    if (!before) return;
    // The «Undo» bar goes away: focus lands where the step was taken.
    setFocusOn({
      selector: applied?.answered
        ? `[data-row="${answeredRow.current}"] [role="radio"][aria-checked="true"]`
        : '.refine__input',
    });
    setRows(before.rows);
    setRecalced(before.recalced);
    setApplied(null);
  };

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
      ...(changed.photoId && { photoId: changed.photoId }),
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
    if (meal && uploading) return false; // a saved entry would lose the photo being uploaded
    saving.current = true;
    setStatus('saving');
    const at = date ? pastAt() : now();
    try {
      if (meal) {
        await onPatch?.(patchOf());
        return true;
      }
      const food = items.filter((_, i) => !isDrink(rows[i]!));
      // Drinks only: no meal, so the photo has nobody to belong to.
      const kept = food.length ? photo : null;
      await onSave(
        {
          clientId,
          eatenAt: at.toISOString(),
          tzOffsetMin: offsetAt(at),
          localDate: date ?? entryDay(at, offsetAt(at), day),
          mealType,
          ...(kept && 'id' in kept && { photoId: kept.id }),
          // Entered by hand because of the AI, with a photo: recalculable later (5.6).
          ...(manual && manual !== 'user' && kept && { recalcOffer: true }),
          // The moment of «Save»; the queue sends this very value later (ADR-0032 §2).
          loggedAt: now().toISOString(),
          items: food,
        },
        kept && 'blob' in kept ? kept.blob : undefined,
        rows.flatMap((r, i) =>
          isDrink(r) ? [drinkOf(items[i]!, illustrationOf(r))] : [],
        ),
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
    const el =
      id &&
      document.querySelector<HTMLElement>(`[data-row="${id}"] .dish-row__edit`);
    // A late history answer's effect can run between «Undo» and its render: keep the target until the row is there.
    if (!el) return;
    focusRow.current = null;
    el.focus();
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

  const openPicker = (event: MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker(); // desktop Chrome: a click alone only focuses
    } catch {
      // No showPicker, or no user activation: the native behaviour stays.
    }
  };
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
  // A photo the server keeps: a slot photo too (AC-4.1); a queued one is not there yet.
  const serverPhoto =
    photo && 'id' in photo && !photoGone ? photo.id : undefined;
  const queued = !!photo && 'blob' in photo;
  const canRefine = !!recognition && recognition !== 'not_configured';
  const vision = recognition === 'ready' && !noVision;
  const canAgain = canRefine && vision && !!serverPhoto;
  const aiRows = rows.some((r) => r.source === 'ai');
  // Package numbers: where they come from (OCT-313 §2).
  const packageOf = (row: Row) => {
    if (row.source !== 'barcode' && row.source !== 'label') return undefined;
    const code = row.original.barcode ?? null;
    const product = code ? products?.get(code) : undefined;
    const mine =
      row.source === 'barcode' &&
      (row.original.from === 'mine' || !!product?.savedAt);
    return {
      kind: mine ? ('mine' as const) : row.source,
      code,
      servingG: product?.servingG,
      savedAt: product?.savedAt,
    };
  };
  const mixed = aiRows && rows.some((r) => packageOf(r));
  // A found product, with what was typed in the sheet: counted in shares (OCT-380 1.1, 3.2).
  const shareOf = (row: Row) => {
    if (row.source !== 'barcode' && row.source !== 'manual') return undefined;
    const found = row.original.barcode
      ? products?.get(row.original.barcode)
      : undefined;
    if (!found) return undefined;
    const product = { ...found, ...row.pack };
    const d = defaultAmount(product);
    // Not stored with the meal (AC-3.7): grams equal to the default read as it.
    const amount: Amount =
      row.amount ??
      (row.grams === amountGrams(product, d)
        ? d
        : { mode: 'weight', value: row.grams ?? row.shown });
    return { product, amount };
  };
  // Reading a label needs a vision model (AC-4.7): without one, no label button.
  const orphanCode =
    vision &&
    codes.find(
      (c) =>
        c.result.product?.kcal100 === null &&
        !rows.some((r) => r.original.barcode === c.code),
    )?.code;
  const remembered = items.filter(remembers);
  const refineOff = !online || locked || refine.limitReached;
  // A question with a deleted recipe may be gone: shown ones only (E-2.b).
  const shown = rows.map((r) => shownQuestion(r, recipes));
  const asked = shown.filter((q) => q && q.chosen === undefined).length;
  // «Other…» needs a request: offline or at the limit it says why (OCT-234 H.8).
  const otherOff = !online
    ? t('edit.refine.offline')
    : refine.limitReached
      ? t('edit.refine.limit')
      : refineError === 'ai_quota_exceeded' ||
          refineError === 'too_many_attempts'
        ? t('edit.refine.err.quota.title')
        : undefined;
  const again = () =>
    void sendRefine({
      mode: 'again',
      photoId: serverPhoto,
      text: refineText.trim(),
      dishes: requestDishes('again', rows),
    });
  const refineErrorBanner = refineError && (
    <RefineError
      code={refineError}
      source={
        refine.state.status === 'error' ? refine.state.aiSource : undefined
      }
      // The list may have changed since: send it as it is now, `ref` points into it.
      onRetry={() =>
        lastRefine.current &&
        void sendRefine({
          ...lastRefine.current,
          dishes: requestDishes(lastRefine.current.mode, rows),
        })
      }
    />
  );
  const startRecalc = () => onRecalc?.({ rows, mealType, when });
  const pickingRow = rows.find((r) => r.id === picking);
  // A meal with a photo has one (AC-4.3); a saved one takes it online only (OCT-126).
  const photoActions = !photo && !uploading && (!meal || online);
  const takePhoto = (input: typeof photoInput) => () => {
    photoRow.current = picking;
    setPhotoError(false);
    setPicking(null);
    input.current?.click();
  };

  return (
    <div className="meal-edit">
      <OfflineBar variant={useBarVariant()} />
      <div className="meal-edit__window">
        {meal && onRecipe ? (
          // OCT-160 3.6: «⋯» on the right, so «×» moves to the left.
          <NavBar
            title={title}
            start={{ icon: X, label: t('common.close'), onClick: onClose }}
            action={{
              icon: Ellipsis,
              label: t('meal.menu'),
              onClick: () => setMenu(true),
            }}
          />
        ) : (
          <NavBar
            title={title}
            action={{ icon: X, label: t('common.close'), onClick: onClose }}
          />
        )}
        <Sheet open={menu} title={title} onClose={() => setMenu(false)}>
          <List>
            <ListRow
              icon={<ChefHat />}
              // An empty meal has nothing to make a recipe of.
              disabled={!items.length}
              onClick={() => {
                if (!items.length) return;
                setMenu(false);
                // From the dishes on screen, edits included; the leave guard asks about them.
                onRecipe?.(
                  recipeFromMeal({
                    mealType,
                    localDate: (when || initial.when).slice(0, 10),
                    items,
                  }),
                );
              }}
            >
              {t('meal.save_as_recipe')}
            </ListRow>
          </List>
        </Sheet>
        {manual && manual !== 'user' && (
          <div className="meal-edit__error">
            <Banner tone="notice">
              {t(
                manual === 'ai_down' || manual === 'offline'
                  ? `manual_dish.${manual}`
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
        {refused && (
          <div className="meal-edit__error">
            <Banner tone="danger" title={t('edit.refused.title')}>
              {t(
                // Only the photo upload is refused with a photo_* code.
                refused.startsWith('photo_')
                  ? 'edit.refused.photo'
                  : 'edit.refused.body',
              )}
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
            className={`meal-edit__summary${!meal || photo || uploading ? ' meal-edit__summary--photo' : ''}`}
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
                <>
                  <button
                    type="button"
                    className="meal-edit__thumb viewer-open"
                    aria-label={t('photoViewer.open')}
                    aria-haspopup="dialog"
                    onClick={() => setViewer(true)}
                  >
                    <img
                      src={photo.url}
                      alt=""
                      onError={() => setBrokenUrl(photo.url)}
                    />
                    <ViewerMark />
                  </button>
                  <PhotoViewer
                    open={viewer}
                    onClose={() => setViewer(false)}
                    preview={photo.url}
                    full={
                      // A queued photo is the original itself; nothing on the server yet.
                      'blob' in photo
                        ? photo.url
                        : photoGone
                          ? null
                          : `/api/photos/${encodeURIComponent(photo.id)}?size=full`
                    }
                    title={title}
                    alt={t('photoViewer.alt', { title })}
                  />
                </>
              )
            ) : meal && !uploading ? null : (
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
                {applied && Math.round(applied.kcalDelta) !== 0 && (
                  <span className="meal-edit__delta">
                    <Badge tone="ok">
                      {applied.kcalDelta > 0 ? '+' : '−'}
                      {num(Math.abs(applied.kcalDelta))}
                    </Badge>
                  </span>
                )}
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
              {onRecalc && !offer && !canAgain && (
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
            {(aiRows || canAgain) && (
              // A.1: one line under the meal type, the estimate and «Recognize again» side by side.
              <div className="meal-edit__estimate-row">
                {aiRows && (
                  <p className="meal-edit__estimate">
                    {mixed && !asked ? (
                      <Barcode aria-hidden="true" />
                    ) : (
                      <Sparkle aria-hidden="true" />
                    )}
                    {asked
                      ? t('edit.question.count', { count: asked })
                      : mixed
                        ? t('edit.package_caption')
                        : t(
                            items.some((i) => i.unit === 'ml')
                              ? 'edit.estimate_ml'
                              : 'edit.estimate',
                          )}
                  </p>
                )}
                {canAgain && (
                  // One tap, no hint needed; the hint goes along when typed.
                  <span className="meal-edit__again">
                    <Button
                      variant="tonal"
                      small
                      disabled={refineOff}
                      onClick={again}
                    >
                      <RefreshCw aria-hidden="true" />
                      {t('edit.refine.again')}
                    </Button>
                  </span>
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
                  onClick={openPicker}
                  // A typed future time is pulled back to now (AC-2.9); a cleared field keeps the value.
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setWhen(v > maxWhen ? maxWhen : v);
                  }}
                />
              </label>
            )}
            {date && (
              // The same trick as a saved meal: the time as in the title, the native picker on top.
              <label className="meal-edit__when">
                <Clock aria-hidden="true" />
                <span aria-hidden="true">
                  {timeOf(pastAt()).replace(/ /g, '\u00a0')}
                </span>
                <input
                  type="time"
                  aria-label={t('edit.time')}
                  required
                  value={eatenTime}
                  onClick={openPicker}
                  // A cleared field keeps the value.
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setTime(v);
                  }}
                />
              </label>
            )}
            {packages.suggest && onOffHint && (
              <OffSuggestCard
                onEnable={packages.askConsent}
                onLater={packages.offLater}
              />
            )}
            {orphanCode && (
              // A package without kcal and no dish for it: the label adds one.
              <NoKcalHint
                busy={packages.reading}
                onShoot={() => packages.shootLabel(orphanCode)}
              />
            )}
            {rows.length > 0 ? (
              // Locked while the AI works: its answer would overwrite an edit (AC-5.2).
              <ul
                className="meal-edit__list"
                inert={locked}
                aria-busy={locked || undefined}
              >
                {rows.map((row, i) => {
                  const item = items[i]!;
                  const share = shareOf(row);
                  return (
                    <li key={row.id} data-row={row.id}>
                      <DishRow
                        dish={{
                          ...item,
                          grams: row.grams,
                          confidence: item.confidence,
                          mine: packageOf(row)?.kind === 'mine',
                          check: !!row.original.alt,
                          illustration: illustrationOf(row),
                        }}
                        units={units}
                        onGramsChange={(g) => setGrams(i, g)}
                        edible={row.edible}
                        onRelink={() => {
                          setApplied(null);
                          setRows((rs) =>
                            rs.map((r) => (r.id === row.id ? relink(r) : r)),
                          );
                        }}
                        share={
                          share && {
                            ...share,
                            onChange: (a) =>
                              setGrams(i, amountGrams(share.product, a), a),
                          }
                        }
                        onEdit={() => setEditing(row.id)}
                        onDelete={() => remove(row.id)}
                        onIllustration={() => {
                          setPhotoError(false);
                          setPicking(row.id);
                        }}
                        mark={applied?.marks[row.id]}
                        kind={
                          chip(row)
                            ? {
                                drink: row.drink === true,
                                onToggle: () =>
                                  setRows((rs) =>
                                    rs.map((r) =>
                                      r.id === row.id
                                        ? { ...r, drink: !r.drink }
                                        : r,
                                    ),
                                  ),
                              }
                            : undefined
                        }
                      >
                        {shown[i] && (
                          <Question
                            text={shown[i].text}
                            options={shown[i].options.map((o) => ({
                              label: o.label,
                              ...(o.recipe && {
                                hint: t('recipes.per100', {
                                  k: num(per100(o.recipe).kcal),
                                }),
                              }),
                            }))}
                            guess={shown[i].guess}
                            chosen={shown[i].chosen}
                            onChoose={(o) => answerRow(row, shown[i]!, o)}
                            onOther={() => other(row)}
                            otherOff={otherOff}
                          />
                        )}
                      </DishRow>
                      {row.recipe ? (
                        <RecipeHint
                          recipe={row.recipe}
                          onApply={() => applyRecipe(row, row.recipe!)}
                          onKeep={() => keepEstimate(row.id)}
                        />
                      ) : (
                        row.previous && (
                          <HistoryHint
                            eatenAt={row.previous.eatenAt}
                            grams={row.previous.grams}
                            unit={row.previous.unit}
                            kcal={row.previous.kcal}
                            illustration={row.previous.illustration}
                            units={units}
                            onApply={() => applyPrevious(row, row.previous!)}
                            onKeep={() => keepEstimate(row.id)}
                          />
                        )
                      )}
                      {vision && row.original.check && row.original.barcode && (
                        <NoKcalHint
                          busy={packages.reading}
                          onShoot={() =>
                            packages.shootLabel(row.original.barcode!)
                          }
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
            {remembered.map((item, i) => (
              // AC-4.5: saved with its barcode, found at once next time.
              <p key={i} className="meal-edit__estimate">
                <Bookmark aria-hidden="true" />
                {t('edit.remember', { name: item.name })}
              </p>
            ))}
            {(rows.length > 0 || dishes.length === 0) && (
              <Button
                variant="plain"
                disabled={locked}
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden="true" className="meal-edit__add-icon" />
                {t('edit.add_manual')}
              </Button>
            )}
          </div>
        </div>
        <footer className="meal-edit__footer">
          {canRefine && (
            <RefineBar
              value={refineText}
              onChange={(v) => {
                setRefineText(v);
                // D.5: the banner goes once the text is edited.
                if (refineError) refine.cancel();
              }}
              textOnly={!serverPhoto}
              onRefine={() =>
                void sendRefine({
                  mode: 'refine',
                  ...(vision && serverPhoto && { photoId: serverPhoto }),
                  text: refineText.trim(),
                  dishes: toRequest(rows),
                })
              }
              onAgain={canAgain ? again : undefined}
              busy={
                working ? (refine.state.status as 'busy' | 'slow') : undefined
              }
              mode={lastRefine.current?.mode}
              onCancel={refine.cancel}
              disabled={!online || refine.limitReached}
              note={
                !online ? (
                  queued ? (
                    <>
                      <Clock aria-hidden="true" />
                      {t('edit.refine.queued')}
                    </>
                  ) : (
                    <>
                      <WifiOff aria-hidden="true" />
                      {t('edit.refine.offline_save')}
                    </>
                  )
                ) : refine.limitReached ? (
                  <span className="refine__note-status" role="status">
                    <Ban aria-hidden="true" />
                    {t('edit.refine.limit')}
                  </span>
                ) : photoGone ? (
                  <>
                    <ImageOff aria-hidden="true" />
                    {t('edit.refine.gone')}
                  </>
                ) : undefined
              }
              error={refineErrorBanner}
              result={
                applied && refine.canUndo
                  ? {
                      kcalDelta: applied.kcalDelta,
                      removed: applied.removed,
                      onUndo: undoRefine,
                      answered: applied.answered,
                      byRecipe: applied.byRecipe,
                    }
                  : undefined
              }
            />
          )}
          {/* With the refine field its note already says it (OCT-283). */}
          {!online && !canRefine && (
            <p className="meal-edit__note">{t('edit.offline_note')}</p>
          )}
          <div className="meal-edit__actions button-row">
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
                disabled={!valid || locked}
                loading={busy || (!!meal && uploading)}
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
      <input
        ref={packages.labelInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="edit-label"
        onChange={(e) => void packages.onLabel(e)}
      />
      <BarcodeConsentSheet
        open={packages.consent}
        onEnable={() => void packages.offEnable()}
        onClose={packages.offLater}
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
          onClose={() => {
            setPicking(null);
            photoRow.current = null;
          }}
          {...(photoActions && {
            onCamera: takePhoto(cameraInput),
            onGallery: takePhoto(photoInput),
            photoError,
          })}
          offline={!!meal && !online && !photo && !uploading}
        />
      )}
      {adding && (
        <ManualDishSheet
          units={units}
          onAdd={addManual}
          lookup={onBarcode}
          barcode={photoCode?.code}
          photoNotFound={photoCode && (photoCode.admin ? 'admin' : 'user')}
          onClose={() => setAdding(false)}
          recipes={recipes}
          onRecipe={(recipe) => {
            setAdding(false);
            setPortion(recipe);
          }}
        />
      )}
      {portion && (
        <PortionSheet
          open
          recipe={portion}
          units={units}
          onAdd={addRecipe}
          onClose={() => setPortion(null)}
        />
      )}
      {editingRow && (
        <DishSheet
          original={editingRow.original}
          grams={editingRow.grams ?? editingRow.shown}
          units={units}
          source={
            packageOf(editingRow) ??
            (editingRow.original.alt && {
              kind: 'code',
              code: editingRow.original.barcode ?? null,
            })
          }
          alt={editingRow.original.alt}
          lookup={onBarcode}
          product={shareOf(editingRow)?.product}
          amount={shareOf(editingRow)?.amount}
          edible={editingRow.edible}
          onDone={(name, grams, replaced, amount, pack, edible) =>
            applySheet(
              editingRow.id,
              name,
              grams,
              replaced,
              amount,
              pack,
              edible,
            )
          }
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

/** Errors of POST /api/ai/refine (product OCT-232 §6): the list and the text stay. */
function RefineError({
  code,
  source,
  onRetry,
}: {
  code: ClientErrorCode;
  source?: AiSource;
  onRetry: () => void;
}) {
  const { t } = useT();
  const [, navigate] = useLocation();
  if (source === 'own_key' && code === 'ai_unavailable')
    return (
      <Banner
        tone="danger"
        title={t('edit.refine.err.key_bad.title')}
        actions={
          <button type="button" onClick={() => navigate(AI_SETTINGS_PATH)}>
            {t('recog.err.ai_settings')}
          </button>
        }
      >
        {t('edit.refine.err.key_bad.body')}
      </Banner>
    );
  if (source === 'own_key' && code === 'ai_quota_exceeded')
    return <Banner tone="warning" title={t('edit.refine.err.key_quota')} />;
  switch (code) {
    case 'ai_quota_exceeded':
    case 'too_many_attempts':
      return (
        <Banner tone="warning" title={t('edit.refine.err.quota.title')}>
          {t('edit.refine.err.quota.body')}
        </Banner>
      );
    case 'ai_invalid_response':
      return <Banner tone="warning" title={t('edit.refine.err.invalid')} />;
    case 'ai_empty_result':
      return <Banner tone="warning" title={t('edit.refine.err.empty')} />;
    case 'ai_no_vision':
      return <Banner title={t('edit.refine.err.no_vision')} />;
    case 'photo_expired':
      return <Banner title={t('edit.refine.gone')} />;
    default:
      return (
        <Banner
          tone="danger"
          title={t(
            source === 'server'
              ? 'edit.refine.err.server_down'
              : 'edit.refine.err.unavailable.title',
          )}
          actions={
            <button type="button" onClick={onRetry}>
              {t('common.retry')}
            </button>
          }
        >
          {t('edit.refine.err.unavailable.body')}
        </Banner>
      );
  }
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
  const [state] = useState(
    () => history.state as (MealEditState & { draft?: Row[] }) | null,
  );
  const codes = (state && 'codes' in state && state.codes) || [];
  // Read once on open, like the hints: «Not now» hides it until the next photo anyway.
  const [offSuggest] = useState(() =>
    showOffSuggest(codes, settings?.offHintAt, new Date()),
  );
  const ai = useAiStatus();
  const recipes = useRecipes();
  const products = useProducts();
  const { t, num } = useT();
  const toast = useToast();
  if (!state && photoId)
    return <Redirect to={`${MEAL_NEW_PATH}?${search}`} replace />;
  // Read once on open: hints are matched then (the local copy answers within a frame).
  if (!recipes) return null;
  return (
    <MealEditScreen
      recipes={recipes}
      products={products}
      onBarcode={(code) => lookupProduct(db, code)}
      dishes={state && 'dishes' in state ? state.dishes : []}
      draft={state?.draft}
      codes={codes}
      offSuggest={offSuggest}
      onOffHint={async (enable) => {
        const offHintAt = new Date().toISOString();
        await patchSettings(
          db,
          enable ? { offEnabled: true, offHintAt } : { offHintAt },
        );
        if (!enable) return [];
        // The server looks up only once the switch got there.
        await flush(db).catch(() => {});
        const unique = [...new Set(codes.map((c) => c.code))];
        return Promise.all(
          unique.map(async (code) => {
            const result = await api(
              `/api/barcodes/${code}`,
              barcodeLookupSchema,
            ).catch(() => null);
            if (result?.product)
              await keepProduct(db, result.product).catch(() => {});
            return result && { code, result };
          }),
        ).then((found) => found.filter((f) => f !== null));
      }}
      questions={state && 'dishes' in state ? state.questions : undefined}
      manual={state && 'manual' in state ? state.manual : undefined}
      photoBarcode={
        state && 'barcode' in state && state.barcode
          ? { code: state.barcode, admin: user?.role === 'admin' }
          : undefined
      }
      photoId={photoId}
      photoBlob={state && 'manual' in state ? state.photo : undefined}
      recognition={ai.status?.recognition}
      date={date}
      units={settings?.units ?? user?.units ?? 'metric'}
      choices={choices}
      onChoice={(name, id) => void putIllustrationChoice(db, name, id)}
      waterEnabled={settings?.waterEnabled ?? false}
      onSave={async (input, photo, drinks = []) => {
        const ids: string[] = [];
        for (const d of drinks)
          ids.push(
            await createDrinkEntry(db, {
              ...d,
              date: input.localDate,
              takenAt: input.eatenAt,
            }),
          );
        const meal = input.items.length > 0;
        if (meal) await createMeal(db, input, photo);
        // A new meal only: an edit of a saved one says nothing (AC-4.5).
        const names = input.items.filter(remembers).map((i) => i.name);
        if (date) navigate(`/diary/${date}`, { replace: true });
        else
          navigate('/', {
            replace: true,
            ...(meal && {
              state: { saved: input.clientId } satisfies TodayState,
            }),
          });
        if (names.length)
          toast({ text: t('today.remembered', { name: names.join(', ') }) });
        // Drinks only: nothing new in the list says where they went (OCT-147 4.5).
        else if (!meal)
          toast({
            text: t('water.saved_drinks', {
              count: ids.length,
              kcal: num(drinks.reduce((s, d) => s + d.photo.kcal, 0)),
            }),
            icon: <Droplet aria-hidden="true" />,
            ms: 5000,
            action: {
              label: t('water.undo'),
              onClick: () => {
                for (const id of ids) void deleteDrinkEntry(db, id);
              },
            },
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
  const refused = useMealError(clientId);
  const undo = useUndoDelete();
  const toast = useToast();
  const [, navigate] = useLocation();
  // «What should I fix?» works without a photo too (AC-4.2).
  const ai = useAiStatus();
  const online = useOnline();
  const [recalc] = useState(() => recalcState());
  const recipes = useRecipes();
  const products = useProducts();
  // The local copy answers within a frame.
  if (meal === undefined || recipes === undefined) return null;
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
      recipes={recipes}
      products={products}
      onBarcode={(code) => lookupProduct(db, code)}
      refused={refused}
      recalc={recalc}
      recognition={ai.status?.recognition}
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
        // A refused meal is sent again even unchanged: the server may take it now.
        if (patch || refused) await patchMeal(db, clientId, patch ?? {});
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
      onRecipe={(state) => navigate(NEW_RECIPE_PATH, { state })}
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
  const go = (dishes?: Recognized[], questions?: AiQuestion[]) =>
    navigate(to, {
      replace: true,
      state: { draft: state.draft, dishes, questions } satisfies RecalcState,
    });
  return (
    <RecognitionScreen
      photoId={meal.photo.id}
      recalc={{ onDishes: go, onBack: () => go() }}
    />
  );
}
