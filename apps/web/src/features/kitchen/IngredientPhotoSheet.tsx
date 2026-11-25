import { useEffect, useRef, useState } from 'react';
import { CircleAlert, SearchX, Sparkle } from 'lucide-react';
import { z } from 'zod';
import {
  defaultAmount,
  grossKind,
  ingredientsRecognitionSchema,
  round1,
  scaleItem,
  type Amount,
  type EdibleChoice,
  type Product,
  type RecipeInput,
  type RecognizedIngredient,
  type Units,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useT } from '../../i18n';
import { type Pack, useAmountText } from '../../ui/AmountPicker/AmountPicker';
import { Button } from '../../ui/Button/Button';
import { DishSheet } from '../../ui/DishSheet/DishSheet';
import { parseDecimal } from '../../ui/FormList/FormList';
import { IngredientRow } from '../../ui/IngredientRow/IngredientRow';
import { List } from '../../ui/List/List';
import { RecognitionSteps } from '../../ui/RecognitionSteps/RecognitionSteps';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Sheet } from '../../ui/Sheet/Sheet';
import { unitOf, useWeight } from '../../ui/weightUnits';
import { edibleShare, type RowEdible } from '../meals/refine';
import { ImageDecodeError, prepareImage } from '../meals/prepareImage';
import '../meals/RecognitionState.css';
import './IngredientPhotoSheet.css';

/** One found product going into the recipe: the ingredient and what the editor keeps beside it. */
export type PhotoIngredient = {
  ingredient: RecipeInput['ingredients'][number];
  from?: 'scale' | 'package';
  barcode?: string;
  product?: Product;
  amount?: Amount;
  pack?: Pack;
  /** The user's own share, remembered by the server on save (ADR-0039 §4). */
  edible?: EdibleChoice;
};

type Props = {
  /** The photo picked in «+ Ingredient»; the sheet prepares, uploads and recognizes it. */
  file: File;
  units: Units;
  /** «Add · N»: appended to the recipe, nothing replaced (AC-C1). */
  onAdd: (rows: PhotoIngredient[]) => void;
  /** «Take another»: the file picker again. */
  onRetake: () => void;
  onManual: () => void;
  onClose: () => void;
};

type ReviewRow = {
  key: number;
  item: RecognizedIngredient;
  name: string;
  /** The weight field as typed, in the user's units. */
  grams: string;
  edible?: RowEdible;
  product?: Product;
  amount?: Amount;
  pack?: Pack;
};

const photoSchema = z.object({ photoId: z.string() });
const MAX_G = 5000;

let nextKey = 0;

/**
 * «Ingredients from photo» (OCT-435 3.1–3.3, ADR-0040 §6): waiting, then one photo's products to
 * check — weight source tags, gross → edible, «How much you used» — and «Add · N». Empty and AI
 * error states keep the recipe as it is (E2).
 */
export function IngredientPhotoSheet({
  file,
  units,
  onAdd,
  onRetake,
  onManual,
  onClose,
}: Props) {
  const { t, num } = useT();
  const w = useWeight(units);
  const amountText = {
    g: useAmountText(units, 'g'),
    ml: useAmountText(units, 'ml'),
  };
  const [state, setState] = useState<'wait' | 'error' | ReviewRow[]>('wait');
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // Prepared once: «Retry» uploads the same JPEG again, the server deleted the failed one (AC-B9).
  const blob = useRef<Promise<Blob>>(null);

  useEffect(() => {
    let live = true;
    setState('wait');
    void (async () => {
      try {
        blob.current ??= prepareImage(file);
        const { photoId } = await api('/api/photos', photoSchema, {
          method: 'POST',
          body: await blob.current,
        });
        const { items } = await api(
          `/api/photos/${photoId}/recognize?mode=ingredients`,
          ingredientsRecognitionSchema,
          { method: 'POST' },
        );
        if (!live) return;
        const wu = (i: RecognizedIngredient) => w.as(i.unit);
        setState(
          items.map((item) => ({
            key: nextKey++,
            item,
            name: item.name,
            grams: String(wu(item).show(item.grams)),
            edible: item.edible,
            product: item.product,
            amount:
              item.weight === 'barcode' && item.product
                ? defaultAmount(item.product)
                : undefined,
          })),
        );
      } catch (err) {
        if (!(err instanceof ApiError || err instanceof ImageDecodeError))
          throw err;
        if (live) setState('error');
      }
    })();
    return () => {
      live = false;
    };
    // `w` follows the units, fixed while the sheet is open.
  }, [file, attempt]);

  const rows = typeof state === 'string' ? [] : state;
  const setRow = (key: number, patch: Partial<ReviewRow>) =>
    setState(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const gramsOf = (r: ReviewRow) => {
    const n = parseDecimal(r.grams.trim());
    const g = n === null ? null : w.as(r.item.unit).toG(n);
    return g !== null && g >= 0 && g <= MAX_G ? g : null;
  };
  const valid = rows.length > 0 && rows.every((r) => gramsOf(r) !== null);

  const add = () =>
    onAdd(
      rows.map((r) => {
        const g = gramsOf(r)!;
        const v = scaleItem(r.item, g);
        const e = r.edible;
        return {
          ingredient: {
            name: r.name,
            grams: g,
            ...unitOf(r.item.unit),
            kcal: round1(v.kcal),
            proteinG: round1(v.proteinG),
            fatG: round1(v.fatG),
            carbsG: round1(v.carbsG),
            source: r.item.source,
          },
          ...(r.item.weight === 'scale' || r.item.weight === 'package'
            ? { from: r.item.weight }
            : {}),
          barcode: r.item.barcode,
          product: r.product,
          amount: r.amount,
          pack: r.pack,
          ...(e?.chosen &&
            !e.unlinked && { edible: { key: e.key, pct: edibleShare(e) } }),
        };
      }),
    );

  const edibleLine = (r: ReviewRow, g: number | null) => {
    const e = r.edible;
    if (!e || e.unlinked || !g) return undefined;
    const wu = w.as(r.item.unit);
    return t('edit.edible.line', {
      gross: wu.text(e.grossG),
      kind: e.whole
        ? t('edit.edible.whole')
        : t(`edit.edible.gross_kind.${grossKind(e.key)}`),
      net: wu.text(g),
      pct: num(edibleShare(e)),
      source: t(`edit.edible.source.${e.chosen ? 'user' : e.source}`),
    });
  };
  const shareOf = ({ product: p, amount: a }: ReviewRow) =>
    p && a && a.mode !== 'weight' ? amountText[p.per].row(p, a) : undefined;
  const open = rows.find((r) => r.key === editing);

  let body;
  if (state === 'wait')
    body = (
      <div className="photo-ingredients__wait recog__wait" role="status">
        <div className="recog__photo">
          <img src={url} alt="" />
          <span className="recog__glint" aria-hidden="true" />
        </div>
        <p className="recog__title">{t('editor.products.wait')}</p>
        <p className="recog__hint">{t('editor.products.wait_sub')}</p>
        <RecognitionSteps
          label={t('recog.steps_a11y')}
          marks={{
            wait: t('recog.mark.wait'),
            run: t('recog.mark.run'),
            done: t('recog.mark.done'),
            skip: t('recog.mark.skip'),
            warn: t('recog.mark.warn'),
          }}
          steps={[
            {
              title: t('editor.products.step_ai'),
              caption: t('editor.products.step_ai_sub'),
              mark: 'run',
            },
          ]}
        />
        <p className="photo-ingredients__note">
          {t('editor.products.not_kept')}
        </p>
      </div>
    );
  else if (state === 'error')
    body = (
      <ScreenState
        icon={<CircleAlert />}
        tone="danger"
        role="alert"
        title={t('editor.products.error')}
        action={
          <>
            <Button onClick={() => setAttempt((a) => a + 1)}>
              {t('common.retry')}
            </Button>
            <Button variant="tonal" onClick={onManual}>
              {t('editor.products.manual')}
            </Button>
          </>
        }
      >
        {t('editor.products.error_body')}
      </ScreenState>
    );
  else if (!state.length)
    body = (
      <ScreenState
        icon={<SearchX />}
        role="status"
        title={t('editor.products.none')}
        action={
          <>
            <Button onClick={onRetake}>{t('editor.products.retake')}</Button>
            <Button variant="tonal" onClick={onManual}>
              {t('editor.products.manual')}
            </Button>
          </>
        }
      >
        {t('editor.products.none_body')}
      </ScreenState>
    );
  else
    body = (
      <div className="photo-ingredients">
        <p className="photo-ingredients__hint">
          <Sparkle aria-hidden="true" />
          {t('editor.products.note')}
        </p>
        <List>
          {state.map((r) => {
            const g = gramsOf(r);
            const wu = w.as(r.item.unit);
            return (
              <IngredientRow
                key={r.key}
                name={r.name}
                kcal={g === null ? 0 : scaleItem(r.item, g).kcal}
                grams={r.grams}
                units={units}
                unit={r.item.unit}
                error={
                  g === null
                    ? t('editor.grams_err', { max: wu.fmt(MAX_G), u: wu.u })
                    : undefined
                }
                estimate={r.item.weight === 'estimate'}
                barcode={r.item.weight === 'barcode'}
                from={
                  r.item.weight === 'scale' || r.item.weight === 'package'
                    ? r.item.weight
                    : undefined
                }
                share={shareOf(r)}
                note={edibleLine(r, g)}
                onGramsChange={(grams) =>
                  setRow(r.key, {
                    grams,
                    amount: undefined,
                    // Grams by hand: no longer the share of the gross weight.
                    edible: r.edible && { ...r.edible, unlinked: true },
                  })
                }
                onEdit={() => setEditing(r.key)}
              />
            );
          })}
        </List>
      </div>
    );

  return (
    <>
      <Sheet
        open={!open}
        full
        onClose={onClose}
        title={t('editor.products.title')}
        footer={
          Array.isArray(state) &&
          state.length > 0 && (
            <Button disabled={!valid} onClick={add}>
              {t('editor.products.add', { n: num(state.length) })}
            </Button>
          )
        }
      >
        {body}
      </Sheet>
      {open && (
        <DishSheet
          original={{ ...open.item, name: open.name }}
          grams={gramsOf(open) ?? open.item.grams}
          units={units}
          product={open.product}
          amount={
            open.product &&
            (open.amount ?? { mode: 'weight', value: gramsOf(open) ?? 0 })
          }
          edible={open.edible}
          amountTitle={t('editor.used')}
          edibleTitle={t('editor.products.edible_title')}
          deleteLabel={t('editor.products.remove')}
          onDone={(name, g, _, amount, pack, edible) => {
            setRow(open.key, {
              name,
              grams: String(w.as(open.item.unit).show(g)),
              edible,
              ...(open.product && {
                amount,
                pack: { ...open.pack, ...pack },
                product: { ...open.product, ...pack },
              }),
            });
            setEditing(null);
          }}
          onDelete={() => {
            setState(rows.filter((r) => r.key !== open.key));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
