import { useCallback, useId, useRef, useState, type ChangeEvent } from 'react';
import { flushSync } from 'react-dom';
import { Camera, CircleAlert, Minus, Plus, Scale } from 'lucide-react';
import { Redirect, useLocation } from 'wouter';
import { z } from 'zod';
import {
  per100,
  recipeTotals,
  round1,
  scaleItem,
  servingG,
  weightWarning,
  type IngredientSource,
  type Nutrients,
  type Recipe,
  type RecipeInput,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useDirty } from '../../app/dirty';
import {
  findHistoryDishes,
  saveRecipe,
  useDb,
  useRecipe,
  type HistoryDish,
} from '../../data/DataContext';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import { DishSheet } from '../../ui/DishSheet/DishSheet';
import { Field } from '../../ui/Field/Field';
import { parseDecimal } from '../../ui/FormList/FormList';
import { IngredientPickerSheet } from '../../ui/IngredientPickerSheet/IngredientPickerSheet';
import { IngredientRow } from '../../ui/IngredientRow/IngredientRow';
import { List, ListRow } from '../../ui/List/List';
import { ManualDishSheet } from '../../ui/ManualDishSheet/ManualDishSheet';
import { NavBar } from '../../ui/NavBar/NavBar';
import { Button } from '../../ui/Button/Button';
import { Sheet } from '../../ui/Sheet/Sheet';
import { StepEditorRow } from '../../ui/StepEditorRow/StepEditorRow';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { usePressRepeat } from '../../ui/usePressRepeat';
import { useToast } from '../../ui/Toast/Toast';
import { ImageDecodeError, prepareImage } from '../meals/prepareImage';
import '../../ui/WeightStepper/WeightStepper.css';
import './RecipeEditor.css';

/** `history.state` of /kitchen/new: a prefilled draft (from a meal, from text; 7/9, 8/9). */
export type RecipeEditorState = { draft?: RecipeInput };

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
  const [draft] = useState(
    () => (history.state as RecipeEditorState | null)?.draft,
  );
  // 0 is never a recipe id: a new recipe reads nothing.
  const recipe = useRecipe(Number(id ?? 0));
  const search = useCallback((q: string) => findHistoryDishes(db, q), [db]);
  if (id !== undefined && recipe === null)
    return <Redirect to="/kitchen" replace />;
  if (id !== undefined && !recipe) return null;
  return (
    <RecipeEditor
      recipe={recipe ?? undefined}
      draft={draft}
      online={online}
      search={search}
      onSave={(input) => saveRecipe(db, input, recipe?.id)}
      onSaved={(r) => navigate(`/kitchen/${r.id}`, { replace: true })}
    />
  );
}

type Row = {
  key: number;
  name: string;
  source: IngredientSource;
  /** Values the grams scale from (as a dish, AC-3.2). */
  base: Nutrients & { grams: number };
  /** The grams field as typed. */
  grams: string;
};

type Props = {
  /** Editing a saved recipe; none: a new one. */
  recipe?: Recipe;
  /** A new recipe's prefilled fields. */
  draft?: RecipeInput;
  /** Offline «Save» is disabled (E-10.5, ADR-0023 §4). */
  online: boolean;
  search: (query: string) => Promise<HistoryDish[]>;
  /** POST / PUT and the local copy; throws on failure. */
  onSave: (input: RecipeInput) => Promise<Recipe>;
  /** After «Save» in the navbar. */
  onSaved: (recipe: Recipe) => void;
};

/** Grams of an ingredient: 0 is allowed (salt «to taste»), null when not a valid weight. */
const gramsOf = (text: string) => {
  const n = parseDecimal(text.trim());
  return n !== null && n >= 0 && n <= 5000 ? round1(n) : null;
};

const text = (n: number) => String(n);

let nextKey = 0;
const rowOf = (i: RecipeInput['ingredients'][number]): Row => ({
  key: nextKey++,
  name: i.name,
  source: i.source,
  base: i,
  grams: text(i.grams),
});

type StepRow = { key: number; text: string; photoId: string | null };

/** Current values of a row; a 0 g base (an AI «to taste») has nothing to scale from. */
const valuesOf = (r: Row, grams: number): Nutrients =>
  r.base.grams > 0 ? scaleItem(r.base, grams) : r.base;

/** The recipe editor (OCT-160 2.3–2.6, AC-6.1, E-10.1, 10.2, 10.8, 10.12). */
export function RecipeEditor({
  recipe,
  draft,
  online,
  search,
  onSave,
  onSaved,
}: Props) {
  const { t, num } = useT();
  const toast = useToast();
  const start = recipe ?? draft;
  const [name, setName] = useState(start?.name ?? '');
  const [photoId, setPhotoId] = useState(start?.photoId ?? null);
  const [rows, setRows] = useState<Row[]>(
    () => start?.ingredients.map(rowOf) ?? [],
  );
  const [cooked, setCooked] = useState(
    start?.cookedG == null ? '' : text(start.cookedG),
  );
  const [servings, setServings] = useState(start?.servings ?? null);
  const [note, setNote] = useState(start?.note ?? '');
  const [steps, setSteps] = useState<StepRow[]>(
    () => start?.steps.map((s) => ({ key: nextKey++, ...s })) ?? [],
  );
  const [focusStep, setFocusStep] = useState<number | null>(null);
  const [touched, setTouched] = useState<{
    name?: boolean;
    cooked?: boolean;
    rows?: boolean;
  }>({});
  const [sheet, setSheet] = useState<
    | { kind: 'picker' }
    | { kind: 'manual'; name: string }
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

  const cookedN = cooked.trim() ? parseDecimal(cooked.trim()) : null;
  const cookedValid =
    cookedN === null ||
    (Number.isFinite(cookedN) && cookedN >= 1 && cookedN <= MAX_COOKED_G);
  const cookedG = cookedValid && cookedN !== null ? round1(cookedN) : null;
  const items = rows.map((r) => {
    const g = gramsOf(r.grams);
    return { row: r, g, ...valuesOf(r, g ?? 0), grams: g ?? 0 };
  });
  const calc = { cookedG, servings, ingredients: items };
  const totals = recipeTotals(items);
  const p100 = per100(calc);
  const serving = servingG(calc);

  const input = (): RecipeInput => ({
    name: name.trim(),
    cookedG,
    servings,
    note: note.trim() || null,
    photoId,
    ingredients: items.map(({ row, grams, kcal, proteinG, fatG, carbsG }) => ({
      name: row.name,
      grams,
      kcal: round1(kcal),
      proteinG: round1(proteinG),
      fatG: round1(fatG),
      carbsG: round1(carbsG),
      source: row.source,
    })),
    // An empty step is dropped rather than an error: «+ Step» tapped and left blank.
    steps: steps
      .filter((s) => s.text.trim())
      .map((s) => ({ text: s.text.trim(), photoId: s.photoId })),
  });
  const [initial] = useState(() => JSON.stringify(input()));
  // A draft from elsewhere is unsaved work from the start (as new dishes, OCT-16 4.7).
  const dirty = (!recipe && !!draft) || JSON.stringify(input()) !== initial;

  const errors = {
    name: !name.trim() ? t('editor.name_err') : undefined,
    cooked: !cookedValid ? t('editor.cooked_err') : undefined,
    rows: !rows.length ? t('editor.no_ingredients') : undefined,
  };

  /** Resolves true once saved; invalid fields are marked and the first one focused. */
  async function save(leave: boolean) {
    if (saveLock.current || uploading || !online) return false;
    const badRow = items.find((i) => i.g === null);
    if (errors.name || errors.cooked || errors.rows || badRow) {
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
    saveLock.current = true;
    setSaving(true);
    try {
      const saved = await onSave(input());
      if (leave) onSaved(saved);
      return true;
    } catch {
      toast({ text: t('editor.save_error') });
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
  const addRow = (i: RecipeInput['ingredients'][number]) => {
    setRows((rs) => [...rs, rowOf(i)]);
    setSheet(null);
  };
  const editing =
    sheet?.kind === 'edit' ? rows.find((r) => r.key === sheet.key) : undefined;

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
      <main className="screen__body recipe-editor">
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

        <div className="recipe-editor__ingredients">
          <List
            title={
              <span className="recipe-editor__group">
                <span>{t('editor.ingredients')}</span>
                <span>{t('editor.ingredients_cols')}</span>
              </span>
            }
          >
            {items.map(({ row, g, kcal: k }) => (
              <IngredientRow
                key={row.key}
                name={row.name}
                kcal={k}
                grams={row.grams}
                error={
                  g === null && (touched.rows || row.grams.trim() !== '')
                    ? t('editor.grams_err')
                    : undefined
                }
                onGramsChange={(grams) => setRow(row.key, { grams })}
                onEdit={() => setSheet({ kind: 'edit', key: row.key })}
              />
            ))}
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
                    onBlur={() => setTouched((s) => ({ ...s, cooked: true }))}
                  />
                  <span className="stepper__unit" aria-hidden="true">
                    {t('unit.g')}
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
                { count: Math.round(ratio), w: num(totals.rawG) },
              )}
            </p>
          ) : (
            cookedG === null &&
            totals.rawG > 0 && (
              <p className="recipe-editor__note">
                <Scale aria-hidden="true" />
                {t('editor.weigh', { w: num(totals.rawG) })}
              </p>
            )
          )}
        </div>

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
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'manual' && (
        <ManualDishSheet
          units="metric"
          title={t('editor.manual_title')}
          name={sheet.name}
          onAdd={(d) => addRow({ ...d, source: 'manual' })}
          onClose={() => setSheet(null)}
        />
      )}
      {editing && (
        <DishSheet
          // shortcut: DishSheet weights start at 1 g, so a 0 g row can be renamed only after a weight; fine until salt rows need renaming.
          original={{ ...editing.base, name: editing.name }}
          grams={gramsOf(editing.grams) ?? editing.base.grams}
          units="metric"
          onDone={(n, g) => {
            setRow(editing.key, { name: n, grams: text(g) });
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
