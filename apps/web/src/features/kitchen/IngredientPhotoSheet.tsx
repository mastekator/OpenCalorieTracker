import { Fragment, useEffect, useRef, useState } from 'react';
import { Camera, CircleAlert, SearchX, Sparkle } from 'lucide-react';
import { z } from 'zod';
import {
  defaultAmount,
  grossKind,
  ingredientsRecognitionSchema,
  MAX_RECIPE_INGREDIENTS,
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
import { Banner } from '../../ui/Banner/Banner';
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
import {
  MAX_SHOTS,
  mapRows,
  shotRows,
  withShot,
  type Shot,
} from './photoShots';
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
  /** Grams typed by hand: no weight tag («from scale», «estimate») any more. */
  byHand?: boolean;
};

type Props = {
  /** The photo picked in «+ Ingredient»; the sheet prepares, uploads and recognizes it. */
  file: File;
  units: Units;
  /** Rows the recipe still has room for: the rest are «won't fit» (AC-C2). */
  free: number;
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
  byHand?: boolean;
};

const photoSchema = z.object({ photoId: z.string() });
const MAX_G = 5000;

let nextKey = 0;

/**
 * «Ingredients from photo» (OCT-435 3.1–3.6, 4.3, ADR-0040 §6): waiting, then the products of up
 * to 5 photos to check — weight source tags, gross → edible, «How much you used» — and «Add · N».
 * Empty and AI error states of the first photo keep the recipe as it is (E2); a later photo's
 * failure is a line in the sheet, the rows found before stay.
 */
export function IngredientPhotoSheet({
  file,
  units,
  free,
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
  const [shots, setShots] = useState<Shot<ReviewRow>[]>(() => [
    // The URL is made (and revoked) by the mount effect, so a StrictMode remount keeps a live one.
    { key: nextKey++, file, url: '', state: 'wait' },
  ]);
  const [editing, setEditing] = useState<number | null>(null);
  const moreInput = useRef<HTMLInputElement>(null);
  // Prepared once per photo: «Retry» uploads the same JPEG again, the server deleted the failed one (AC-B9).
  const blobs = useRef(new Map<number, Promise<Blob>>());
  // The latest run of each photo: an older or unmounted run's answer is dropped.
  const runs = useRef(new Map<number, number>());
  const urls = useRef<string[]>([]);
  // Closing the sheet cancels every upload and recognition still running: no quota spent for nothing.
  const ctrl = useRef(new AbortController());

  const recognize = async ({ key, file: f }: Shot<ReviewRow>) => {
    const run = nextKey++;
    runs.current.set(key, run);
    const settle = (state: Shot<ReviewRow>['state']) => {
      if (runs.current.get(key) === run)
        setShots((s) => withShot(s, key, state));
    };
    settle('wait');
    const { signal } = ctrl.current;
    try {
      let blob = blobs.current.get(key);
      if (!blob) blobs.current.set(key, (blob = prepareImage(f)));
      const { photoId } = await api('/api/photos', photoSchema, {
        method: 'POST',
        body: await blob,
        signal,
      });
      const { items } = await api(
        `/api/photos/${photoId}/recognize?mode=ingredients`,
        ingredientsRecognitionSchema,
        { method: 'POST', signal },
      );
      settle(
        items.map((item) => ({
          key: nextKey++,
          item,
          name: item.name,
          grams: String(w.as(item.unit).show(item.grams)),
          edible: item.edible,
          product: item.product,
          amount:
            item.weight === 'barcode' && item.product
              ? defaultAmount(item.product)
              : undefined,
        })),
      );
    } catch (err) {
      if (signal.aborted) return;
      if (!(err instanceof ApiError || err instanceof ImageDecodeError))
        throw err;
      settle('error');
    }
  };

  useEffect(() => {
    const c = (ctrl.current = new AbortController());
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setShots((s) => s.map((x) => (x.key === first.key ? { ...x, url } : x)));
    void recognize(first);
    return () => {
      c.abort();
      runs.current.clear();
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, []);

  const more = (f: File) => {
    const shot: Shot<ReviewRow> = {
      key: nextKey++,
      file: f,
      url: URL.createObjectURL(f),
      state: 'wait',
    };
    urls.current.push(shot.url);
    setShots((s) => [...s, shot]);
    void recognize(shot);
  };

  const rows = shotRows(shots);
  const setRow = (key: number, patch: Partial<ReviewRow>) =>
    setShots((s) =>
      mapRows(s, (rs) =>
        rs.map((r) => (r.key === key ? { ...r, ...patch } : r)),
      ),
    );
  const gramsOf = (r: ReviewRow) => {
    const n = parseDecimal(r.grams.trim());
    const g = n === null ? null : w.as(r.item.unit).toG(n);
    return g !== null && g >= 0 && g <= MAX_G ? g : null;
  };
  // AC-C2: rows past the recipe's room «won't fit»; «Add the first N» takes them in sheet order.
  const fit = Math.min(rows.length, Math.max(free, 0));
  const fits = rows.slice(0, fit);
  const valid = fit > 0 && fits.every((r) => gramsOf(r) !== null);

  const add = () =>
    onAdd(
      fits.map((r) => {
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
          ...(r.byHand && { byHand: true }),
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
  /** «3 pcs ≈ 55 g» while the weight is still the model's estimate of whole items. */
  const noteOf = (r: ReviewRow, g: number | null) => {
    const edible = edibleLine(r, g);
    const count = r.item.pieces;
    if (!count || r.byHand || r.item.weight !== 'estimate' || g === null)
      return edible;
    const rest = edible
      ? `\u00b7 ${edible}`
      : `\u2248 ${w.as(r.item.unit).text(g)}`;
    return t('editor.products.pieces', { count, rest });
  };
  const shareOf = ({ product: p, amount: a }: ReviewRow) =>
    p && a && a.mode !== 'weight' ? amountText[p.per].row(p, a) : undefined;
  const open = rows.find((r) => r.key === editing);

  const first = shots[0]!;
  const one = shots.length === 1;
  let body;
  if (one && first.state === 'wait')
    body = (
      <div className="photo-ingredients__wait recog__wait" role="status">
        <div className="recog__photo">
          {first.url && <img src={first.url} alt="" />}
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
  else if (one && first.state === 'error')
    body = (
      <ScreenState
        icon={<CircleAlert />}
        tone="danger"
        role="alert"
        title={t('editor.products.error')}
        action={
          <>
            <Button onClick={() => void recognize(first)}>
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
  else if (one && !rows.length)
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
  else {
    const full = shots.length >= MAX_SHOTS;
    body = (
      <div className="photo-ingredients">
        <div className="photo-ingredients__shots">
          {shots.map((s, i) => (
            <span
              key={s.key}
              className="photo-ingredients__shot"
              role="img"
              aria-label={t('editor.products.shot', { n: num(i + 1) })}
            >
              {s.url && <img src={s.url} alt="" />}
              <span className="photo-ingredients__shot-n" aria-hidden="true">
                {num(i + 1)}
              </span>
              {s.state === 'wait' && (
                <span
                  className="button__spinner photo-ingredients__spinner"
                  aria-hidden="true"
                />
              )}
            </span>
          ))}
          {!full && (
            <button
              type="button"
              className="photo-ingredients__shot photo-ingredients__more"
              aria-label={t('editor.products.more_a11y')}
              onClick={() => moreInput.current?.click()}
            >
              <Camera aria-hidden="true" />
            </button>
          )}
          <span className="photo-ingredients__shots-note">
            {t(full ? 'editor.products.more_full' : 'editor.products.more')}
          </span>
        </div>
        <p className="photo-ingredients__hint">
          <Sparkle aria-hidden="true" />
          {t('editor.products.note')}
        </p>
        <List>
          {shots.map((s, i) => {
            const n = num(i + 1);
            return (
              <Fragment key={s.key}>
                {!one && (
                  <li className="photo-ingredients__sep">
                    {t('editor.products.shot', { n })}
                  </li>
                )}
                {s.state === 'wait' ? (
                  <li className="list__item">
                    <div
                      className="list-row photo-ingredients__line"
                      role="status"
                    >
                      <span>
                        {t('editor.products.shot_wait')}
                        <span className="photo-ingredients__line-sub">
                          {t('editor.products.shot_wait_sub')}
                        </span>
                      </span>
                      <span
                        className="button__spinner photo-ingredients__spinner"
                        aria-hidden="true"
                      />
                    </div>
                  </li>
                ) : s.state === 'error' ? (
                  <li className="list__item">
                    <div
                      className="list-row photo-ingredients__line"
                      role="alert"
                    >
                      <span>{t('editor.products.shot_error', { n })}</span>
                      <Button
                        small
                        variant="tonal"
                        onClick={() => void recognize(s)}
                      >
                        {t('common.retry')}
                      </Button>
                    </div>
                  </li>
                ) : !s.state.length ? (
                  <li className="list__item">
                    <div
                      className="list-row photo-ingredients__line"
                      role="status"
                    >
                      <span>{t('editor.products.shot_none', { n })}</span>
                    </div>
                  </li>
                ) : (
                  s.state.map((r) => {
                    const g = gramsOf(r);
                    const wu = w.as(r.item.unit);
                    const tag = r.byHand ? undefined : r.item.weight;
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
                            ? t('editor.grams_err', {
                                max: wu.fmt(MAX_G),
                                u: wu.u,
                              })
                            : undefined
                        }
                        estimate={tag === 'estimate'}
                        barcode={r.item.weight === 'barcode'}
                        from={
                          tag === 'scale' || tag === 'package' ? tag : undefined
                        }
                        wontFit={!fits.includes(r)}
                        share={shareOf(r)}
                        note={noteOf(r, g)}
                        onGramsChange={(grams) =>
                          setRow(r.key, {
                            grams,
                            byHand: true,
                            amount: undefined,
                            // Grams by hand: no longer the share of the gross weight.
                            edible: r.edible && { ...r.edible, unlinked: true },
                          })
                        }
                        onEdit={() => setEditing(r.key)}
                      />
                    );
                  })
                )}
              </Fragment>
            );
          })}
        </List>
        <input
          ref={moreInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f && shots.length < MAX_SHOTS) more(f);
          }}
        />
      </div>
    );
  }

  const over = rows.length > fit;
  const footer = rows.length > 0 && (
    <>
      {over && (
        <Banner tone="warning">
          {t('editor.products.limit_fit', {
            have: num(MAX_RECIPE_INGREDIENTS - free),
            n: num(fit),
          })}
        </Banner>
      )}
      <Button disabled={!valid} onClick={add}>
        {over
          ? t('editor.products.add_first', { n: num(fit) })
          : t('editor.products.add', { n: num(rows.length) })}
      </Button>
    </>
  );

  return (
    <>
      <Sheet
        open={!open}
        full
        onClose={onClose}
        title={t('editor.products.title')}
        footer={footer}
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
              // New grams not taken from the gross weight are the user's own, as typed in the row.
              ...(!open.product &&
                g !== gramsOf(open) &&
                !(edible && !edible.unlinked) && { byHand: true }),
              ...(open.product && {
                amount,
                pack: { ...open.pack, ...pack },
                product: { ...open.product, ...pack },
              }),
            });
            setEditing(null);
          }}
          onDelete={() => {
            setShots((s) =>
              mapRows(s, (rs) => rs.filter((r) => r.key !== open.key)),
            );
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
