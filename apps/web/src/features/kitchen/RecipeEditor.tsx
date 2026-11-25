import { useCallback, useId, useRef, useState, type ChangeEvent } from 'react';
import { flushSync } from 'react-dom';
import { Camera, CircleAlert, History, Minus, Plus, Scale } from 'lucide-react';
import { Redirect, useLocation } from 'wouter';
import { z } from 'zod';
import {
  fromPer100,
  per100,
  recipeInputSchema,
  recipeTotals,
  round1,
  scaleItem,
  servingG,
  weightWarning,
  type Amount,
  type DishUnit,
  type EdibleChoice,
  type IngredientSource,
  type Meal,
  type Nutrients,
  type Product,
  type Recipe,
  type RecipeInput,
  type Units,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useDirty } from '../../app/dirty';
import {
  findHistoryDishes,
  isRecipeChanged,
  saveRecipe,
  useDb,
  useRecipe,
  type HistoryDish,
} from '../../data/DataContext';
import { lookupProduct, type BarcodeResult } from '../../data/products';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import { type Pack, useAmountText } from '../../ui/AmountPicker/AmountPicker';
import { DishSheet } from '../../ui/DishSheet/DishSheet';
import { Field } from '../../ui/Field/Field';
import { parseDecimal } from '../../ui/FormList/FormList';
import { IngredientPickerSheet } from '../../ui/IngredientPickerSheet/IngredientPickerSheet';
import { IngredientRow } from '../../ui/IngredientRow/IngredientRow';
import { List, ListRow } from '../../ui/List/List';
import { Banner } from '../../ui/Banner/Banner';
import { ManualDishSheet } from '../../ui/ManualDishSheet/ManualDishSheet';
import { NavBar } from '../../ui/NavBar/NavBar';
import { Button } from '../../ui/Button/Button';
import { Sheet } from '../../ui/Sheet/Sheet';
import { Segment } from '../../ui/Segment/Segment';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { StepEditorRow } from '../../ui/StepEditorRow/StepEditorRow';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { useAiStatus } from '../../data/DataContext';
import { usePressRepeat } from '../../ui/usePressRepeat';
import { useToast } from '../../ui/Toast/Toast';
import { ImageDecodeError, prepareImage } from '../meals/prepareImage';
import '../../ui/WeightStepper/WeightStepper.css';
import { unitOf, useWeight, weightIn } from '../../ui/weightUnits';
import { useUnits } from './units';
import { IngredientPhotoSheet } from './IngredientPhotoSheet';
import { Per100Fields, type MacroKey, type Per100Values } from './Per100Fields';
import './RecipeEditor.css';

/** `history.state` of /kitchen/new: a prefilled draft (from a meal, from text; 7/9, 8/9). */
export type RecipeEditorState = {
  draft?: RecipeInput;
  ai?: AiDraft;
  fromMeal?: FromMeal;
  /** «Add ingredients» on a recipe without them: open in the ingredient mode (OCT-352 2.1). */
  compose?: boolean;
};

/** A draft from «Save as recipe» / «From a meal»: the notice says which meal (OCT-160 3.7). */
type FromMeal = Pick<Meal, 'mealType' | 'localDate'>;

/** A draft from «Recipe from text»: indexes of `draft.ingredients` to check (AC-6.4); never saved. */
type AiDraft = { unsure: number[] };

const photoSchema = z.object({ photoId: z.string() });
const MAX_SERVINGS = 100;
const MAX_COOKED_G = 50000;
const MAX_STEPS = 30;
/** `busy` key of the recipe photo; steps use their row keys (≥ 0). */
const RECIPE_PHOTO = -1;

/** /kitchen/new and /kitchen/:id/edit. */
export function RecipeEditorScreen({ id }: { id?: string }) {
  const db = useDb();
  const online = useOnline();
  const [, navigate] = useLocation();
  const [state] = useState(() => history.state as RecipeEditorState | null);
  // 0 is never a recipe id: a new recipe reads nothing.
  const recipe = useRecipe(Number(id ?? 0));
  const search = useCallback((q: string) => findHistoryDishes(db, q), [db]);
  const units = useUnits();
  const ai = useAiStatus();
  if (id !== undefined && recipe === null)
    return <Redirect to="/kitchen" replace />;
  if (id !== undefined && !recipe) return null;
  return (
    <RecipeEditor
      recipe={recipe ?? undefined}
      draft={state?.draft}
      ai={state?.ai}
      fromMeal={state?.fromMeal}
      compose={state?.compose}
      online={online}
      photo={ai.status?.recognition === 'ready'}
      units={units}
      search={search}
      lookup={(code) => lookupProduct(db, code)}
      onSave={(input, base) =>
        saveRecipe(db, input, base).catch((err: unknown) => {
          // The form holds an older version: back to the fresh card.
          if (isRecipeChanged(err))
            navigate(`/kitchen/${id}`, { replace: true });
          throw err;
        })
      }
      onSaved={(r) => navigate(`/kitchen/${r.id}`, { replace: true })}
    />
  );
}

type Row = {
  key: number;
  name: string;
  source: IngredientSource;
  /** Values the grams scale from (as a dish, AC-3.2); `unit` 'ml': millilitres (ADR-0038). */
  base: Nutrients & { grams: number; unit?: DishUnit };
  /** The weight field as typed, in the user's units. */
  grams: string;
  /** The AI couldn't estimate it; cleared by a grams edit. */
  unsure?: boolean;
  /** Typed or found in the manual sheet: remembered by the server, not stored in the recipe (ADR-0040 §1). */
  barcode?: string;
  pack?: Pack;
  /** The found product and the share picked of it: «½ pack · 200 g» until the grams are edited. */
  product?: Product;
  amount?: Amount;
  /** Weight read from a scale or a package on a photo: its tag instead of «estimate» (OCT-435 3.6). */
  from?: 'scale' | 'package';
  /** The user's share of the gross weight, remembered by the server on save (ADR-0039 §4). */
  edible?: EdibleChoice;
};

type Props = {
  /** Editing a saved recipe; none: a new one. */
  recipe?: Recipe;
  /** A new recipe's prefilled fields. */
  draft?: RecipeInput;
  /** The draft came from the AI: a notice, «estimate» badges, unsure rows marked. */
  ai?: AiDraft;
  /** The draft came from a meal: a notice with its type and date. */
  fromMeal?: FromMeal;
  /** A recipe without ingredients opens in the ingredient mode, its values as a note. */
  compose?: boolean;
  /** Offline «Save» is disabled (E-10.5, ADR-0023 §4). */
  online: boolean;
  /** AI recognition is set up: «Photograph the ingredients» in «+ Ingredient» (AC-B1). */
  photo?: boolean;
  /** Weights shown and typed in grams or ounces; saved in grams (AC-2.6). */
  units?: Units;
  search: (query: string) => Promise<HistoryDish[]>;
  /** Barcode lookup in the manual sheet, as in a meal (ADR-0040 §1); none: no «Barcode» field. */
  lookup?: (code: string) => Promise<BarcodeResult>;
  /** POST / PUT and the local copy; throws on failure. */
  /** POST (no base) or PUT from `base`, the recipe as the editor opened it. */
  onSave: (
    input: RecipeInput,
    base?: Pick<Recipe, 'id' | 'updatedAt'>,
  ) => Promise<Recipe>;
  /** After «Save» in the navbar. */
  onSaved: (recipe: Recipe) => void;
};

const MAX_INGREDIENT_G = 5000;
type Weight = ReturnType<typeof weightIn>;

const text = (n: number) => String(n);
/** A typed number, NaN when it is not one: the shared schema reports it (ADR-0035 §2). */
const numOr = (typed: string, blank: number) =>
  typed.trim() ? (parseDecimal(typed.trim()) ?? NaN) : blank;

/**
 * Grams of a typed weight, null when it is not a number. Untouched, it keeps
 * the saved grams, so opening and saving in ounces changes nothing.
 */
const typedG = (typed: string, w: Weight, saved?: number | null) => {
  if (saved != null && typed === text(w.show(saved))) return saved;
  const n = parseDecimal(typed.trim());
  return n === null ? null : w.toG(n);
};

/** Grams of an ingredient: 0 is allowed (salt «to taste»), null when not a valid weight. */
const gramsOf = (typed: string, w: Weight, saved?: number) => {
  const g = typedG(typed, w, saved);
  return g !== null && g >= 0 && g <= MAX_INGREDIENT_G ? g : null;
};

let nextKey = 0;
const rowOf = (
  i: RecipeInput['ingredients'][number],
  w: Weight,
  unsure?: boolean,
): Row => ({
  key: nextKey++,
  name: i.name,
  source: i.source,
  base: i,
  grams: text(w.show(i.grams)),
  unsure,
});

type StepRow = { key: number; text: string; photoId: string | null };

/** Current values of a row; a 0 g base (an AI «to taste») has nothing to scale from. */
const valuesOf = (r: Row, grams: number): Nutrients =>
  r.base.grams > 0 ? scaleItem(r.base, grams) : r.base;

/** The recipe editor (OCT-160 2.3–2.6, AC-6.1, E-10.1, 10.2, 10.8, 10.12). */
export function RecipeEditor({
  recipe,
  draft,
  ai,
  fromMeal,
  compose,
  online,
  photo,
  units,
  search,
  lookup,
  onSave,
  onSaved,
}: Props) {
  const { t, num, locale } = useT();
  const toast = useToast();
  // Fixed on open: a version synced in meanwhile must not pass the form's edits as fresh.
  const [opened, setOpened] = useState(recipe);
  const w = useWeight(units);
  const unit = w.u;
  const start = recipe ?? draft;
  const [name, setName] = useState(start?.name ?? '');
  const [photoId, setPhotoId] = useState(start?.photoId ?? null);
  const [rows, setRows] = useState<Row[]>(
    () =>
      start?.ingredients.map((i, n) =>
        rowOf(i, w.as(i.unit), ai?.unsure.includes(n)),
      ) ?? [],
  );
  const [cooked, setCooked] = useState(
    start?.cookedG == null ? '' : text(w.show(start.cookedG)),
  );
  const [servings, setServings] = useState(start?.servings ?? null);
  const [note, setNote] = useState(start?.note ?? '');
  const [mode, setMode] = useState<'ingredients' | 'per100'>(
    start?.per100 && !compose ? 'per100' : 'ingredients',
  );
  const [p100In, setP100In] = useState<Per100Values>(() => {
    const p = start?.per100;
    const s = start?.servingG;
    return {
      kcal: p ? text(p.kcal) : '',
      proteinG: p ? text(p.proteinG) : '',
      fatG: p ? text(p.fatG) : '',
      carbsG: p ? text(p.carbsG) : '',
      serving: s == null ? '' : text(w.show(s)),
    };
  });
  const [confirmMode, setConfirmMode] = useState(false);
  const [steps, setSteps] = useState<StepRow[]>(
    () => start?.steps.map((s) => ({ key: nextKey++, ...s })) ?? [],
  );
  const [focusStep, setFocusStep] = useState<number | null>(null);
  // Key of the step with a photo but no text that blocked the last save; shown while it still has no text.
  const [stepErr, setStepErr] = useState<number | null>(null);
  const [touched, setTouched] = useState<{
    name?: boolean;
    cooked?: boolean;
    rows?: boolean;
    per100?: boolean;
  }>({});
  const [sheet, setSheet] = useState<
    | { kind: 'picker' }
    | { kind: 'manual'; name: string }
    | { kind: 'photo'; file: File; n: number }
    | { kind: 'edit'; key: number }
    | { kind: 'step'; key: number }
    | null
  >(null);
  // Photos being uploaded: RECIPE_PHOTO or a step's key.
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const uploading = busy.size > 0;
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const cookedLabel = useId();
  const portionsLabel = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const cookedRef = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const productsInput = useRef<HTMLInputElement>(null);

  const cookedIn = cooked.trim() ? typedG(cooked, w, start?.cookedG) : null;
  const cookedValid =
    cookedIn === null ||
    (Number.isFinite(cookedIn) && cookedIn >= 1 && cookedIn <= MAX_COOKED_G);
  const cookedG = cookedValid ? cookedIn : null;
  const items = rows.map((r) => {
    const g = gramsOf(r.grams, w.as(r.base.unit), r.base.grams);
    return { row: r, g, ...valuesOf(r, g ?? 0), grams: g ?? 0 };
  });
  const calc = { cookedG, servings, ingredients: items };
  const totals = recipeTotals(items);
  const p100 = per100(calc);
  const serving = servingG(calc);

  const typedServing = p100In.serving.trim()
    ? (typedG(p100In.serving, w, start?.servingG) ?? NaN)
    : null;
  const byIngredients = mode === 'ingredients';
  const input = (): RecipeInput => ({
    name: name.trim(),
    cookedG: byIngredients ? cookedG : null,
    servings: byIngredients ? servings : null,
    note: note.trim() || null,
    photoId,
    ingredients: (byIngredients ? items : []).map(
      ({ row, grams, kcal, proteinG, fatG, carbsG }) => ({
        name: row.name,
        grams,
        ...unitOf(row.base.unit),
        kcal: round1(kcal),
        proteinG: round1(proteinG),
        fatG: round1(fatG),
        carbsG: round1(carbsG),
        source: row.source,
        ...(row.barcode && { barcode: row.barcode }),
        // The schema takes a package only with its code.
        ...(row.barcode &&
          (row.amount || row.pack) && {
            pack: { ...row.pack, ...(row.amount && { amount: row.amount }) },
          }),
        ...(row.edible && { edible: row.edible }),
      }),
    ),
    // An empty step is dropped rather than an error: «+ Step» tapped and left blank.
    steps: steps
      .filter((s) => s.text.trim())
      .map((s) => ({ text: s.text.trim(), photoId: s.photoId })),
    per100: byIngredients
      ? null
      : {
          kcal: numOr(p100In.kcal, NaN),
          proteinG: numOr(p100In.proteinG, 0),
          fatG: numOr(p100In.fatG, 0),
          carbsG: numOr(p100In.carbsG, 0),
        },
    servingG: byIngredients ? null : typedServing,
  });
  const [initial] = useState(() => JSON.stringify(input()));
  // A draft from elsewhere is unsaved work from the start (as new dishes, OCT-16 4.7).
  const dirty = (!recipe && !!draft) || JSON.stringify(input()) !== initial;

  const errors = {
    name: !name.trim() ? t('editor.name_err') : undefined,
    cooked: !cookedValid ? t('editor.cooked_err', { u: unit }) : undefined,
    rows: !rows.length ? t('editor.no_ingredients') : undefined,
  };

  // The per-100-g fields are checked by the shared schema only; its paths map to the fields here.
  const parsed = byIngredients ? null : recipeInputSchema.safeParse(input());
  const bad = new Set(parsed?.error?.issues.map((i) => i.path.join('.')) ?? []);
  // A bad kcal stops zod before the macro sum check; check the rest with a valid kcal too (OCT-352 1.4).
  if (bad.has('per100.kcal')) {
    const rest = input();
    rest.per100 = { ...rest.per100!, kcal: 0 };
    recipeInputSchema
      .safeParse(rest)
      .error?.issues.forEach((i) => bad.add(i.path.join('.')));
  }
  const p100Shown = (k: keyof Per100Values) =>
    touched.per100 || p100In[k].trim() !== '';
  const badMacros = (['proteinG', 'fatG', 'carbsG'] as const).filter(
    (k) => bad.has(`per100.${k}`) && p100Shown(k),
  );
  const macroSum = (['proteinG', 'fatG', 'carbsG'] as const).reduce(
    (sum, k) => sum + numOr(p100In[k], 0),
    0,
  );
  const p100Errors: {
    kcal?: string;
    macros?: { text: string; bad: readonly MacroKey[] };
    serving?: string;
  } = {
    kcal:
      bad.has('per100.kcal') && p100Shown('kcal')
        ? t('editor.per100.kcal_err')
        : undefined,
    macros: badMacros.length
      ? { text: t('editor.per100.macro_err'), bad: badMacros }
      : bad.has('per100')
        ? {
            text: t('editor.per100.macros_err', { g: num(macroSum) }),
            bad: ['proteinG', 'fatG', 'carbsG'],
          }
        : undefined,
    serving: bad.has('servingG')
      ? t('editor.per100.serving_err', { max: w.fmt(5000), u: unit })
      : undefined,
  };
  const p100Valid =
    parsed?.success && parsed.data.per100 ? parsed.data.per100 : null;
  const preview =
    p100Valid && parsed?.data?.servingG
      ? {
          n: fromPer100(p100Valid, parsed.data.servingG),
          g: w.fmt(parsed.data.servingG),
        }
      : null;
  // «It was …» after switching back, until the first ingredient (OCT-352 1.6).
  const wasNumbers = [
    p100In.kcal,
    p100In.proteinG,
    p100In.fatG,
    p100In.carbsG,
  ].map((v) => numOr(v, 0));
  const was =
    byIngredients &&
    !rows.length &&
    p100In.kcal.trim() &&
    !wasNumbers.some(Number.isNaN)
      ? wasNumbers
      : null;

  /** «By ingredients» → «per 100 g» pre-fills the values from the calculation (AC-1.5). */
  const toPer100 = () => {
    if (rows.length) {
      const s = servingG(calc);
      setP100In({
        kcal: text(Math.round(p100.kcal)),
        proteinG: text(round1(p100.proteinG)),
        fatG: text(round1(p100.fatG)),
        carbsG: text(round1(p100.carbsG)),
        serving: s === null ? '' : text(w.show(Math.round(s))),
      });
      setRows([]);
      setCooked('');
      setServings(null);
    }
    setConfirmMode(false);
    setMode('per100');
  };

  /** Resolves true once saved; invalid fields are marked and the first one focused. */
  async function save(leave: boolean) {
    if (saveLock.current || uploading || !online) return false;
    if (!byIngredients) {
      if (errors.name || !parsed?.success) {
        flushSync(() => setTouched({ name: true, per100: true }));
        if (errors.name) nameRef.current?.focus();
        else
          document
            .querySelector<HTMLInputElement>(
              '.recipe-editor__per100 [aria-invalid="true"]',
            )
            ?.focus();
        return false;
      }
    } else if (
      errors.name ||
      errors.cooked ||
      errors.rows ||
      items.some((i) => i.g === null)
    ) {
      const badRow = items.find((i) => i.g === null);
      // Render the errors first, so focus reads them via aria-describedby (WCAG 3.3.1).
      flushSync(() => setTouched({ name: true, cooked: true, rows: true }));
      if (errors.name) nameRef.current?.focus();
      else if (badRow) {
        const fields = document.querySelectorAll<HTMLInputElement>(
          '.ingredient-row input',
        );
        fields[items.indexOf(badRow)]?.focus();
      } else if (errors.cooked) cookedRef.current?.focus();
      return false;
    }
    // A step's photo is never dropped silently: it needs text, or the step deleted.
    const mute = steps.findIndex((s) => s.photoId && !s.text.trim());
    if (mute >= 0) {
      flushSync(() => setStepErr(steps[mute]!.key));
      const field = document.querySelectorAll<HTMLTextAreaElement>(
        '.step-editor-row__text',
      )[mute];
      field?.focus();
      field?.scrollIntoView?.({ block: 'center' });
      return false;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const saved = await onSave(input(), opened);
      setOpened(saved);
      if (leave) onSaved(saved);
      return true;
    } catch (err) {
      toast({
        text: t(isRecipeChanged(err) ? 'editor.changed' : 'editor.save_error'),
      });
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  useDirty(dirty, () => save(false), { title: t('unsaved.title'), body: '' });

  // E-10.12: a failed photo is a toast; the recipe (or the step) saves without it.
  const upload = async (
    key: number,
    file: File,
    done: (id: string) => void,
  ) => {
    setBusy((b) => new Set(b).add(key));
    try {
      const blob = await prepareImage(file);
      const { photoId: id } = await api('/api/photos', photoSchema, {
        method: 'POST',
        body: blob,
      });
      done(id);
    } catch (err) {
      if (err instanceof ImageDecodeError || err instanceof ApiError)
        toast({ text: t('editor.photo_error') });
      else throw err;
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  };
  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void upload(RECIPE_PHOTO, file, setPhotoId);
  };

  const setStep = (key: number, patch: Partial<StepRow>) =>
    setSteps((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const moveStep = (key: number, to: number) =>
    setSteps((ss) => {
      const from = ss.findIndex((s) => s.key === key);
      if (from < 0 || to < 0 || to >= ss.length || to === from) return ss;
      const next = [...ss];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  const addStep = () => {
    const key = nextKey++;
    setSteps((ss) => [...ss, { key, text: '', photoId: null }]);
    setFocusStep(key);
  };
  const stepMenu =
    sheet?.kind === 'step' ? steps.findIndex((s) => s.key === sheet.key) : -1;

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (
    i: RecipeInput['ingredients'][number],
    extra?: Partial<Row>,
  ) => {
    setRows((rs) => [...rs, { ...rowOf(i, w.as(i.unit)), ...extra }]);
    setSheet(null);
  };
  const editing =
    sheet?.kind === 'edit' ? rows.find((r) => r.key === sheet.key) : undefined;
  const amountText = {
    g: useAmountText(units ?? 'metric', 'g'),
    ml: useAmountText(units ?? 'metric', 'ml'),
  };
  // Grams alone are already in the field: a caption only for a share.
  const shareOf = ({ product: p, amount: a }: Row) =>
    p && a && a.mode !== 'weight' ? amountText[p.per].row(p, a) : undefined;

  const servingsPress = usePressRepeat((dir) => {
    setServings((s) => {
      const next = (s ?? 0) + dir;
      if (next < 1 || next > MAX_SERVINGS) servingsPress.stop();
      return next < 1 ? null : Math.min(next, MAX_SERVINGS);
    });
  });

  const ratio =
    cookedG && totals.rawG
      ? Math.max(cookedG, totals.rawG) / Math.min(cookedG, totals.rawG)
      : 0;
  const kcal = (n: number | null) => (n === null ? '—' : num(n));
  const title = recipe ? recipe.name : t('editor.new');

  return (
    <div className="screen screen--wide">
      <NavBar
        title={title}
        back={{
          href: recipe ? `/kitchen/${recipe.id}` : '/kitchen',
          label: t('common.cancel'),
        }}
        action={{
          label: t('editor.save'),
          disabled: !online || uploading || saving,
          onClick: () => void save(true),
        }}
      />
      <main
        className={`screen__body recipe-editor${ai || fromMeal ? ' recipe-editor--ai' : ''}`}
      >
        {fromMeal && (
          <div className="recipe-editor__ai">
            <Banner
              tone="notice"
              icon={<History aria-hidden="true" />}
              title={t(`editor.from_meal.title.${fromMeal.mealType}`, {
                date: new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                }).format(new Date(`${fromMeal.localDate}T00:00:00Z`)),
              })}
            >
              {t('editor.from_meal.body')}
            </Banner>
          </div>
        )}
        {ai && (
          <div className="recipe-editor__ai">
            <Banner tone="accent" title={t('editor.ai.title')}>
              {t('editor.ai.body')}
            </Banner>
          </div>
        )}
        <div className="recipe-editor__mode">
          <div className="recipe-editor__head">
            <button
              type="button"
              className={`recipe-editor__photo${photoId ? ' recipe-editor__photo--set' : ''}`}
              aria-label={t(
                photoId ? 'editor.photo_replace' : 'editor.photo_add',
              )}
              aria-busy={busy.has(RECIPE_PHOTO)}
              disabled={busy.has(RECIPE_PHOTO)}
              onClick={() => photoInput.current?.click()}
            >
              {photoId ? (
                <img src={thumbUrl(photoId)} alt="" />
              ) : (
                <>
                  <Camera aria-hidden="true" />
                  {t('editor.photo')}
                </>
              )}
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={onPhoto}
            />
            <Field
              ref={nameRef}
              label={t('editor.name')}
              value={name}
              maxLength={80}
              autoComplete="off"
              error={touched.name ? errors.name : undefined}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((s) => ({ ...s, name: true }))}
            />
          </div>
          <Segment
            label={t('editor.mode.label')}
            options={[
              { value: 'ingredients', label: t('editor.mode.ingredients') },
              { value: 'per100', label: t('editor.mode.per100') },
            ]}
            value={mode}
            onChange={(m) => {
              if (m === mode) return;
              if (m === 'ingredients') setMode(m);
              else if (rows.length) setConfirmMode(true);
              else toPer100();
            }}
          />
          {was && (
            <Banner
              tone="notice"
              icon={<History aria-hidden="true" />}
              title={t('editor.was.title', { k: num(was[0]!) })}
            >
              {t('editor.was.body', {
                p: num(was[1]!),
                f: num(was[2]!),
                c: num(was[3]!),
              })}
            </Banner>
          )}
        </div>

        {byIngredients ? (
          <>
            {!was && (
              <dl
                className="recipe-editor__totals"
                aria-label={t('editor.totals.label')}
                aria-live="polite"
              >
                {(
                  [
                    [
                      'serving',
                      serving === null ? null : (p100.kcal * serving) / 100,
                    ],
                    ['per100', p100.kcal],
                    ['total', totals.kcal],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="recipe-editor__total">
                    <dt>{t(`editor.totals.${k}`)}</dt>
                    <dd className="tabular-nums">
                      {kcal(v)}
                      {v !== null && (
                        <span className="recipe-editor__unit">
                          {'\u00a0'}
                          {t('today.kcal')}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="recipe-editor__ingredients">
              <List
                title={
                  <span className="recipe-editor__group">
                    <span>{t('editor.ingredients')}</span>
                    <span>
                      {t(
                        w.us
                          ? 'editor.ingredients_cols_oz'
                          : 'editor.ingredients_cols',
                      )}
                    </span>
                  </span>
                }
              >
                {items.map(({ row, g, kcal: k }) => (
                  <IngredientRow
                    key={row.key}
                    name={row.name}
                    kcal={k}
                    grams={row.grams}
                    units={units}
                    unit={row.base.unit}
                    error={
                      g === null && (touched.rows || row.grams.trim() !== '')
                        ? t('editor.grams_err', {
                            max: w.as(row.base.unit).fmt(MAX_INGREDIENT_G),
                            u: w.as(row.base.unit).u,
                          })
                        : undefined
                    }
                    estimate={row.source === 'ai' && !row.from}
                    barcode={row.source === 'barcode' && !row.from}
                    from={row.from}
                    share={shareOf(row)}
                    unsure={
                      row.unsure && g === 0
                        ? t('editor.ai.zero', { q: row.name })
                        : undefined
                    }
                    onGramsChange={(grams) =>
                      setRow(row.key, {
                        grams,
                        unsure: false,
                        amount: undefined,
                      })
                    }
                    onEdit={() => setSheet({ kind: 'edit', key: row.key })}
                  />
                ))}
                {was && (
                  <li className="list__item recipe-editor__empty">
                    <b>{t('editor.empty')}</b>
                    {t('editor.empty_body')}
                  </li>
                )}
                <ListRow
                  accent
                  icon={<Plus />}
                  onClick={() => setSheet({ kind: 'picker' })}
                >
                  {t('editor.ingredient')}
                </ListRow>
              </List>
              {touched.rows && errors.rows && (
                <p className="recipe-editor__error" role="alert">
                  <CircleAlert aria-hidden="true" />
                  {errors.rows}
                </p>
              )}
            </div>

            {!was && (
              <div className="recipe-editor__yield">
                <List title={t('editor.yield')}>
                  <li className="list__item">
                    <div className="list-row recipe-editor__kv">
                      <span id={cookedLabel}>{t('editor.cooked_weight')}</span>
                      <label
                        className={`stepper__box${touched.cooked && errors.cooked ? ' recipe-editor__invalid' : ''}`}
                      >
                        <input
                          ref={cookedRef}
                          className="stepper__input tabular-nums"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="—"
                          aria-labelledby={cookedLabel}
                          aria-invalid={touched.cooked && !!errors.cooked}
                          value={cooked}
                          // E-10.1: a minus is never accepted; 0 is an error.
                          onChange={(e) =>
                            setCooked(e.target.value.replace(/-/g, ''))
                          }
                          onBlur={() =>
                            setTouched((s) => ({ ...s, cooked: true }))
                          }
                        />
                        <span className="stepper__unit" aria-hidden="true">
                          {unit}
                        </span>
                      </label>
                    </div>
                  </li>
                  <li className="list__item">
                    <div className="list-row recipe-editor__kv">
                      <span id={portionsLabel}>{t('editor.portions')}</span>
                      <div
                        className="stepper__row"
                        role="group"
                        aria-labelledby={portionsLabel}
                      >
                        <button
                          type="button"
                          className="stepper__button"
                          aria-label={t('editor.portions_less')}
                          disabled={servings === null}
                          {...servingsPress.bind(-1)}
                        >
                          <Minus aria-hidden="true" />
                        </button>
                        <span
                          className="recipe-editor__servings tabular-nums"
                          aria-live="polite"
                        >
                          {servings ?? '—'}
                        </span>
                        <button
                          type="button"
                          className="stepper__button"
                          aria-label={t('editor.portions_more')}
                          disabled={servings === MAX_SERVINGS}
                          {...servingsPress.bind(1)}
                        >
                          <Plus aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                </List>
                {touched.cooked && errors.cooked ? (
                  <p className="recipe-editor__error">
                    <CircleAlert aria-hidden="true" />
                    {errors.cooked}
                  </p>
                ) : weightWarning(calc) ? (
                  <p className="recipe-editor__note recipe-editor__note--warning">
                    <CircleAlert aria-hidden="true" />
                    {t(
                      cookedG! > totals.rawG
                        ? 'editor.check_weight.heavier'
                        : 'editor.check_weight.lighter',
                      {
                        count: Math.round(ratio),
                        w: w.fmt(totals.rawG),
                        u: unit,
                      },
                    )}
                  </p>
                ) : (
                  cookedG === null &&
                  totals.rawG > 0 && (
                    <p className="recipe-editor__note">
                      <Scale aria-hidden="true" />
                      {t('editor.weigh', { w: w.fmt(totals.rawG), u: unit })}
                    </p>
                  )
                )}
                {totals.rawG > 0 && rows.some((r) => r.base.unit === 'ml') && (
                  <p className="recipe-editor__note">
                    {t('editor.raw_ml_note')}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <Per100Fields
            values={p100In}
            errors={p100Errors}
            unit={unit}
            preview={preview}
            onChange={(patch) => setP100In((v) => ({ ...v, ...patch }))}
          />
        )}

        <div className="recipe-editor__more">
          <List
            title={
              <span className="recipe-editor__group">
                <span>{t('editor.steps')}</span>
                <span>{t('editor.optional')}</span>
              </span>
            }
          >
            {steps.map((s, i) => (
              <StepEditorRow
                key={s.key}
                index={i}
                text={s.text}
                photoId={s.photoId}
                busy={busy.has(s.key)}
                autoFocus={s.key === focusStep}
                error={
                  s.key === stepErr && !s.text.trim()
                    ? t('editor.step_text_err', { i: i + 1 })
                    : undefined
                }
                onTextChange={(v) => setStep(s.key, { text: v })}
                onPhoto={(file) =>
                  void upload(s.key, file, (id) =>
                    setStep(s.key, { photoId: id }),
                  )
                }
                onMenu={() => setSheet({ kind: 'step', key: s.key })}
                onMove={(to) => moveStep(s.key, to)}
              />
            ))}
            {steps.length < MAX_STEPS && (
              <ListRow accent icon={<Plus />} onClick={addStep}>
                {t('editor.step')}
              </ListRow>
            )}
          </List>
          <Field
            label={t('editor.note')}
            value={note}
            maxLength={2000}
            placeholder={t('editor.note_ph')}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </main>

      <ConfirmDialog
        open={confirmMode}
        tone="primary"
        stack
        title={t('editor.switch.title')}
        body={t('editor.switch.body', {
          count: rows.length,
          k: num(Math.round(p100.kcal)),
          p: num(round1(p100.proteinG)),
          f: num(round1(p100.fatG)),
          c: num(round1(p100.carbsG)),
        })}
        confirmLabel={t('editor.switch.ok')}
        cancelLabel={t('editor.switch.stay')}
        onConfirm={toPer100}
        onCancel={() => setConfirmMode(false)}
      />
      <Sheet
        open={stepMenu >= 0}
        title={t('editor.step_text', { i: stepMenu + 1 })}
        onClose={() => setSheet(null)}
        footer={
          <>
            {(
              [
                ['editor.step_up', -1],
                ['editor.step_down', 1],
              ] as const
            ).map(([label, dir]) => (
              <Button
                key={label}
                variant="plain"
                disabled={
                  dir < 0 ? stepMenu <= 0 : stepMenu >= steps.length - 1
                }
                onClick={() => {
                  if (sheet?.kind === 'step')
                    moveStep(sheet.key, stepMenu + dir);
                  setSheet(null);
                }}
              >
                {t(label)}
              </Button>
            ))}
            <Button
              variant="danger-plain"
              onClick={() => {
                if (sheet?.kind === 'step')
                  setSteps((ss) => ss.filter((s) => s.key !== sheet.key));
                setSheet(null);
              }}
            >
              {t('editor.step_delete')}
            </Button>
            <Button variant="plain" onClick={() => setSheet(null)}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        {null}
      </Sheet>
      {sheet?.kind === 'picker' && (
        <IngredientPickerSheet
          search={search}
          onPick={(d) => addRow({ ...d, source: 'history' })}
          onManual={(q) => setSheet({ kind: 'manual', name: q })}
          photo={
            photo
              ? { online, onPick: () => productsInput.current?.click() }
              : undefined
          }
          onClose={() => setSheet(null)}
        />
      )}
      <input
        ref={productsInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) setSheet({ kind: 'photo', file, n: nextKey++ });
        }}
      />
      {sheet?.kind === 'photo' && (
        <IngredientPhotoSheet
          key={sheet.n}
          file={sheet.file}
          units={units ?? 'metric'}
          // Appended, nothing replaced (AC-C1); the same product twice is two rows (AC-C3).
          onAdd={(found) => {
            setRows((rs) => [
              ...rs,
              ...found.map(({ ingredient: i, ...extra }) => ({
                ...rowOf(i, w.as(i.unit)),
                ...extra,
              })),
            ]);
            setSheet(null);
          }}
          onRetake={() => productsInput.current?.click()}
          onManual={() => setSheet({ kind: 'manual', name: '' })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'manual' && (
        <ManualDishSheet
          units={units ?? 'metric'}
          title={t('editor.manual_title')}
          name={sheet.name}
          lookup={lookup}
          amountTitle={t('editor.used')}
          // A found product comes with its share (ADR-0040 §1); a code not found: the user's own product.
          onAdd={({ amount, pack, product, ...d }) =>
            addRow(
              { ...d, source: amount ? 'barcode' : 'manual' },
              { barcode: d.barcode, pack, product, amount },
            )
          }
          onClose={() => setSheet(null)}
        />
      )}
      {editing && (
        <DishSheet
          // shortcut: DishSheet weights start at 1 g, so a 0 g row can be renamed only after a weight; fine until salt rows need renaming.
          original={{ ...editing.base, name: editing.name }}
          grams={
            gramsOf(editing.grams, w.as(editing.base.unit)) ??
            editing.base.grams
          }
          units={units ?? 'metric'}
          product={editing.product}
          amount={
            editing.product &&
            (editing.amount ?? {
              mode: 'weight',
              value: gramsOf(editing.grams, w.as(editing.base.unit)) ?? 0,
            })
          }
          amountTitle={t('editor.used')}
          onDone={(n, g, _, amount, pack) => {
            setRow(editing.key, {
              name: n,
              grams: text(w.as(editing.base.unit).show(g)),
              unsure: false,
              ...(editing.product && {
                amount,
                pack: { ...editing.pack, ...pack },
                product: { ...editing.product, ...pack },
              }),
            });
            setSheet(null);
          }}
          onDelete={() => {
            setRows((rs) => rs.filter((r) => r.key !== editing.key));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
