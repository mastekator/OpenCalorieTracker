import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, ListOrdered, Sun, X } from 'lucide-react';
import { Redirect, useLocation } from 'wouter';
import {
  recipeInputSchema,
  recipeTotals,
  weightWarning,
  type Recipe,
  type Units,
} from '@oct/shared';
import { saveRecipe, useDb, useRecipe } from '../../data/DataContext';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { FormRow, InlineNumber } from '../../ui/FormList/FormList';
import { List, ListRow } from '../../ui/List/List';
import { NavBar } from '../../ui/NavBar/NavBar';
import { useBarVariant } from '../../app/connection';
import { OfflineBar, useOnline } from '../../ui/OfflineBar/OfflineBar';
import { PortionSheet } from '../../ui/PortionSheet/PortionSheet';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { useWeight } from '../../ui/weightUnits';
import { logPortion } from './portion';
import { useUnits } from './units';
import './CookMode.css';

/** Below this a move is still a tap. */
const SWIPE_PX = 48;
/** tan 30°: a steeper move is a scroll, not a swipe (as in useSwipeDelete). */
const MAX_SLOPE = 0.577;

/**
 * Keeps the screen on while mounted (Wake Lock, OCT-160 4.1); true while the lock is held.
 * No API or a refusal: false, and the «screen stays on» line is not shown. The browser drops
 * the lock when the tab is hidden; it is taken again when the tab is back.
 */
export function useWakeLock() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let asking = false;
    let gone = false;
    const sync = () => {
      if (document.visibilityState !== 'visible') {
        const held = lock;
        lock = null;
        setHeld(false);
        void held?.release();
        return;
      }
      if (lock || asking) return;
      asking = true;
      navigator.wakeLock.request('screen').then(
        (got) => {
          asking = false;
          // Left the mode while the request was pending.
          if (gone) return void got.release();
          lock = got;
          setHeld(true);
          got.addEventListener('release', () => {
            if (lock === got) lock = null;
            setHeld(false);
          });
        },
        () => {
          asking = false;
          setHeld(false);
        },
      );
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', sync);
      void lock?.release();
    };
  }, []);
  return held;
}

/** The PUT body for a refined cooked weight: the saved recipe with only `cookedG` changed. */
export const withCookedG = (recipe: Recipe, cookedG: number | null) =>
  recipeInputSchema.parse({ ...recipe, cookedG });

/** /kitchen/:id/cook from the local copy, so it works offline (AC-3a.4, E-10.5). */
export function CookScreen({ id }: { id: string }) {
  const db = useDb();
  const recipe = useRecipe(Number(id));
  const online = useOnline();
  const awake = useWakeLock();
  const [, navigate] = useLocation();
  const units = useUnits();
  const w = useWeight(units);
  const { t } = useT();
  const toast = useToast();
  const [portion, setPortion] = useState(false);
  const card = `/kitchen/${id}`;
  if (recipe === null) return <Redirect to="/kitchen" replace />;
  if (!recipe) return null;
  if (recipe.steps.length === 0) return <Redirect to={card} replace />;
  return (
    <>
      <CookMode
        recipe={recipe}
        online={online}
        units={units}
        awake={awake}
        onExit={() => navigate(card, { replace: true })}
        onSaveWeight={async (cookedG) => {
          await saveRecipe(db, withCookedG(recipe, cookedG), recipe);
        }}
        onLog={() => setPortion(true)}
      />
      {portion && (
        // Over «Done!»: logged, the cooking is over — back to the card.
        <PortionSheet
          open
          recipe={recipe}
          units={units}
          log
          onClose={() => setPortion(false)}
          onAdd={(item, when) => {
            if (!when) return; // `log` always passes the meal and time
            void logPortion(db, item, when).then(
              () => {
                toast({
                  text: t('portion.logged', {
                    name: item.name,
                    w: `${w.fmt(item.grams)}\u00a0${w.u}`,
                  }),
                });
                navigate(card, { replace: true });
              },
              () => toast({ text: t('portion.error') }),
            );
          }}
        />
      )}
    </>
  );
}

type Props = {
  recipe: Recipe;
  online: boolean;
  /** The cooked weight in grams or ounces (AC-2.6). */
  units?: Units;
  /** The screen is kept on: shows the `sun` line. */
  awake: boolean;
  /** «×», Esc and «Just close»: back to the recipe card. */
  onExit: () => void;
  onSaveWeight: (cookedG: number) => Promise<void>;
  /** «Log a serving»: opens the portion sheet; not rendered without it. */
  onLog?: () => void;
};

/** Full screen, one step at a time (OCT-160 4.1, 4.2); desktop: the whole main area, ← / → page. */
export function CookMode({
  recipe,
  online,
  units,
  awake,
  onExit,
  onSaveWeight,
  onLog,
}: Props) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [sheet, setSheet] = useState<'steps' | 'done' | null>(null);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const text = useRef<HTMLParagraphElement>(null);
  const shown = useRef(i);
  const start = useRef<{ x: number; y: number } | null>(null);
  const n = recipe.steps.length;
  const step = recipe.steps[i]!;
  const last = i === n - 1;

  const next = () => (last ? setSheet('done') : setI(i + 1));
  const back = () => i > 0 && setI(i - 1);

  // On a step change focus goes to its text, so a screen reader reads it (OCT-160 §11).
  useEffect(() => {
    if (shown.current === i) return;
    shown.current = i;
    text.current?.focus();
  }, [i]);

  // Latest handlers for the window listener, without re-subscribing on every step.
  const keys = useRef({ next, back, onExit, sheet });
  keys.current = { next, back, onExit, sheet };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = keys.current;
      // A sheet handles its own Esc; arrows move the caret in a field.
      if (k.sheet || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, dialog')
      )
        return;
      if (event.key === 'ArrowRight') k.next();
      else if (event.key === 'ArrowLeft') k.back();
      else if (event.key === 'Escape') k.onExit();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const swipe = {
    onPointerDown: (event: PointerEvent) => {
      start.current =
        event.pointerType === 'mouse'
          ? null
          : { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx) * MAX_SLOPE)
        return;
      if (dx < 0) next();
      else back();
    },
    // The browser took the move as a scroll.
    onPointerCancel: () => (start.current = null),
  };

  return (
    <div className="cook">
      <OfflineBar variant={useBarVariant()} />
      <NavBar
        title={t('cook.step', { i: i + 1, n })}
        start={{ icon: X, label: t('cook.exit'), onClick: onExit }}
        action={{
          icon: ListOrdered,
          label: t('cook.all_steps'),
          onClick: () => setSheet('steps'),
        }}
      />
      <main className="cook__body" {...swipe}>
        <div className="cook__progress" aria-hidden="true">
          {recipe.steps.map((_, k) => (
            <span
              key={k}
              className={`cook__segment${k <= i ? ' cook__segment--on' : ''}`}
            />
          ))}
        </div>
        <section
          className="cook__step"
          aria-label={t('cook.step', { i: i + 1, n })}
        >
          <p className="cook__kicker">{recipe.name}</p>
          <p ref={text} className="cook__text" tabIndex={-1}>
            {step.text}
          </p>
          {step.photoId && !broken.has(i) && (
            <img
              key={step.photoId}
              className="cook__photo"
              src={thumbUrl(step.photoId)}
              alt=""
              onError={() => setBroken((b) => new Set(b).add(i))}
            />
          )}
        </section>
      </main>
      <footer className="cook__bar">
        {awake && (
          <p className="cook__awake">
            <Sun aria-hidden="true" />
            {t('cook.awake')}
          </p>
        )}
        <div className="cook__nav">
          <Button variant="tonal" disabled={i === 0} onClick={back}>
            <ChevronLeft aria-hidden="true" />
            {t('cook.back')}
          </Button>
          <Button onClick={next}>
            {last ? (
              t('cook.done')
            ) : (
              <>
                {t('cook.next')}
                <ChevronRight aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </footer>
      <Sheet
        open={sheet === 'steps'}
        title={t('cook.all_steps')}
        onClose={() => setSheet(null)}
      >
        <List>
          {recipe.steps.map((s, k) => (
            <ListRow
              key={k}
              chevron={false}
              current={k === i ? 'step' : undefined}
              description={t(k === i ? 'cook.step_now' : 'cook.step', {
                i: k + 1,
                n,
              })}
              onClick={() => {
                setSheet(null);
                setI(k);
              }}
            >
              {s.text}
            </ListRow>
          ))}
        </List>
      </Sheet>
      <CookDoneSheet
        open={sheet === 'done'}
        recipe={recipe}
        online={online}
        units={units}
        onClose={() => setSheet(null)}
        onExit={onExit}
        onSave={onSaveWeight}
        onLog={onLog}
      />
    </div>
  );
}

type DoneProps = {
  open: boolean;
  recipe: Recipe;
  online: boolean;
  units?: Units;
  /** «×», Esc, scrim: back to the last step. */
  onClose: () => void;
  /** «Just close»: out of the mode. */
  onExit: () => void;
  /** PUT /api/recipes/:id with the new cooked weight; throws on failure. */
  onSave: (cookedG: number) => Promise<void>;
  onLog?: () => void;
};

/** «Done!» (OCT-160 4.2): refine the cooked weight, log a serving or just close. No write-off in wave 1. */
export function CookDoneSheet({
  open,
  recipe,
  online,
  units,
  onClose,
  onExit,
  onSave,
  onLog,
}: DoneProps) {
  const { t, num } = useT();
  const w = useWeight(units);
  const { u } = w;
  const toast = useToast();
  const [cookedG, setCookedG] = useState(recipe.cookedG);
  const [busy, setBusy] = useState(false);
  // The local copy changed (saved here or synced): start from the new weight.
  useEffect(() => setCookedG(recipe.cookedG), [recipe.cookedG]);
  const valid =
    cookedG !== null &&
    recipeInputSchema.shape.cookedG.safeParse(cookedG).success;
  const changed = cookedG !== recipe.cookedG;
  const { rawG } = recipeTotals(recipe.ingredients);
  const warn = valid && weightWarning({ ...recipe, cookedG });
  const ratio =
    valid && rawG ? Math.max(cookedG, rawG) / Math.min(cookedG, rawG) : 0;

  /** True once the weight is saved. */
  const save = async () => {
    if (!valid) return false;
    setBusy(true);
    try {
      await onSave(cookedG);
      toast({ text: t('cook.finish.saved') });
      return true;
    } catch {
      toast({ text: t('cook.finish.error') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  // A serving is counted from the saved weight: save an edited one first.
  const log = async () => {
    if (online && changed && valid && !(await save())) return;
    onLog?.();
  };

  let note = t('cook.finish.weigh');
  if (!online)
    note = t(changed ? 'cook.finish.offline_old' : 'cook.finish.offline');
  else if (changed && cookedG !== null && !valid)
    note = t('cook.finish.weight_err', { u });
  else if (warn)
    note = t(
      cookedG > rawG
        ? 'cook.finish.check_weight.heavier'
        : 'cook.finish.check_weight.lighter',
      { x: num(ratio), w: w.fmt(rawG), u },
    );

  return (
    <Sheet
      open={open}
      title={t('cook.finish.title')}
      onClose={onClose}
      footer={
        <>
          {online && changed && (
            <Button
              disabled={!valid}
              loading={busy}
              onClick={() => void save()}
            >
              {busy ? t('cook.finish.saving') : t('cook.finish.save')}
            </Button>
          )}
          {onLog && (
            <Button variant="tonal" disabled={busy} onClick={() => void log()}>
              {t('cook.finish.log')}
            </Button>
          )}
          <Button variant="plain" onClick={onExit}>
            {t('cook.finish.close')}
          </Button>
        </>
      }
    >
      <List
        footer={
          <span className={warn && online ? 'cook__note--warn' : undefined}>
            {note}
          </span>
        }
      >
        <FormRow label={t('cook.finish.weight')}>
          <InlineNumber
            label={t('cook.finish.weight')}
            value={cookedG === null ? null : w.show(cookedG)}
            // Untouched ounces keep the saved grams, so «Save weight» doesn't appear by itself.
            onChange={(v) =>
              setCookedG(
                v === null
                  ? null
                  : recipe.cookedG !== null && v === w.show(recipe.cookedG)
                    ? recipe.cookedG
                    : w.toG(v),
              )
            }
            unit={u}
            decimals={w.us ? 1 : 0}
            error={changed && cookedG !== null && !valid}
            readOnly={!online}
          />
        </FormRow>
      </List>
    </Sheet>
  );
}
