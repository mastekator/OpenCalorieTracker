import { useEffect, useRef } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';
import { markSeen } from '../../data/streaks';
import { useDb } from '../../data/DataContext';
import { Badge } from '../../ui/Badge/Badge';
import { Medal } from '../../ui/Medal/Medal';
import { ProgressBar } from '../../ui/ProgressBar/ProgressBar';
import { Sheet } from '../../ui/Sheet/Sheet';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
import {
  byCategory,
  nextAward,
  recentAwards,
  unseenOf,
  type AwardItem,
} from './awards';
import { useFormatDay } from './StreakCard';
import '../week/WeekCards.css';
import './Streaks.css';

type Open = (item: AwardItem) => void;

/** A secret award not earned yet: nothing of its own is shown (AC-3.8). */
const hidden = (a: AwardItem) => a.category === 'secret' && !a.got;

function useAwardText() {
  const { t, locale } = useT();
  const fmt = useFormatDay();
  const name = (a: AwardItem) =>
    t(`award.${a.key}.name` as 'award.weeks_1.name');
  const value = (a: AwardItem) =>
    t('awards.value', { value: Math.min(a.value, a.target), target: a.target });
  const label = (a: AwardItem) => {
    if (hidden(a)) return t('awards.label_secret');
    const rarity = t(`award.rarity.${a.rarity}`).toLocaleLowerCase(locale);
    const base = a.got
      ? t('awards.label_got', {
          name: name(a),
          rarity,
          date: fmt(a.got.earnedOn),
        })
      : t('awards.label_ahead', { name: name(a), rarity, value: value(a) });
    return a.got && !a.got.seen ? t('awards.label_new', { label: base }) : base;
  };
  return { t, fmt, name, value, label };
}

/** Marks the shown «New» awards seen when the screen goes away (AC-3.5). */
export function useSeenOnLeave(shown: AwardItem[]) {
  const db = useDb();
  const last = useRef(shown);
  last.current = shown;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // StrictMode remounts at once: only a real unmount marks.
      queueMicrotask(() => {
        const unseen = unseenOf(last.current);
        // The db is closed when the whole app goes (sign-out): the next visit marks them.
        if (!mounted.current && unseen.length)
          markSeen(db, unseen).catch(() => {});
      });
    };
  }, [db]);
}

/** A medal with its name and date or progress (OCT-184 5.1); opens the card. */
export function AwardTile({ item, onOpen }: { item: AwardItem; onOpen: Open }) {
  const { t, fmt, name, label } = useAwardText();
  const secret = hidden(item);
  const sub = item.got
    ? t('awards.got_on', { date: fmt(item.got.earnedOn) })
    : secret
      ? null
      : item.target > 1
        ? t('awards.value', {
            value: Math.min(item.value, item.target),
            target: item.target,
          })
        : t('awards.not_yet');
  return (
    <button
      type="button"
      className={`aw-tile${item.got ? '' : ' aw-tile--lock'}`}
      aria-label={label(item)}
      onClick={() => onOpen(item)}
    >
      <Medal
        awardKey={item.key}
        state={item.got ? 'got' : secret ? 'secret' : 'locked'}
      />
      <span className="aw-tile__name">
        {secret ? t('awards.secret') : name(item)}
      </span>
      {sub && <span className="aw-tile__sub">{sub}</span>}
      {item.got && !item.got.seen && (
        <span className="aw-tile__new" aria-hidden="true">
          <Badge tone="new">{t('awards.new')}</Badge>
        </span>
      )}
    </button>
  );
}

/** «Awards» on the streak screen (OCT-184 2.1): last three earned, «Next», «All awards». */
export function AwardsBlock({
  items,
  onOpen,
  onAll,
}: {
  items: AwardItem[];
  onOpen: Open;
  onAll: () => void;
}) {
  const { t, name, value, label } = useAwardText();
  const recent = recentAwards(items);
  const next = nextAward(items);
  return (
    <section className="wcard" aria-label={t('awards.title')}>
      <div className="challenges__head">
        <h2 className="challenges__title">{t('awards.title')}</h2>
        <span className="challenges__count">
          {t('awards.count', {
            n: items.filter((a) => a.got).length,
            total: items.length,
          })}
        </span>
      </div>
      {recent.length ? (
        <ul className="aw-grid aw-grid--recent" aria-label={t('awards.recent')}>
          {recent.map((a) => (
            <li key={a.key}>
              <AwardTile item={a} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="aw-note">{t('awards.empty')}</p>
      )}
      {next && (
        <button
          type="button"
          className="aw-next"
          aria-label={`${t('awards.next')}: ${label(next)}`}
          onClick={() => onOpen(next)}
        >
          <Medal awardKey={next.key} state="locked" size="sm" />
          <span className="aw-next__name">
            <span>{t('awards.next')}</span>
            {name(next)}
          </span>
          {next.target > 1 ? (
            <>
              <span className="aw-next__value">{value(next)}</span>
              <span className="aw-next__wide">
                <ProgressBar
                  value={next.value}
                  max={next.target}
                  label={name(next)}
                  valueText={value(next)}
                />
              </span>
            </>
          ) : (
            <span className="aw-next__wide aw-note">
              {t(`award.${next.key}.rule` as 'award.weeks_1.rule')}
            </span>
          )}
        </button>
      )}
      <button type="button" className="aw-more" onClick={onAll}>
        {t('awards.all')}
        <ChevronRight aria-hidden="true" />
      </button>
    </section>
  );
}

/** `/week/streaks/awards` (OCT-184 5.1, D.2): the total, categories in catalog order, secret last. */
export function AwardsScreen({
  items,
  onOpen,
}: {
  /** Undefined while the local copy is read. */
  items: AwardItem[] | undefined;
  onOpen: Open;
}) {
  const { t } = useT();
  if (!items)
    return (
      <div className="wcard" aria-busy="true">
        <Skeleton width="40%" height="var(--space-8)" />
        <Skeleton height="var(--space-2)" />
      </div>
    );
  const got = items.filter((a) => a.got).length;
  const count = t('awards.count', { n: got, total: items.length });
  return (
    <div className="awards">
      <section className="wcard" aria-label={count}>
        <p className="wcard__big">
          <span className="wcard__number">{got}</span>
          <span className="wcard__unit">
            {t('awards.sum', { total: items.length })}
          </span>
        </p>
        <ProgressBar
          value={got}
          max={items.length}
          label={t('awards.all')}
          valueText={count}
        />
        <p className="aw-note">{t('awards.rule')}</p>
      </section>
      {byCategory(items).map(([category, list]) => {
        const n = list.filter((a) => a.got).length;
        const title = t(`award.category.${category}`);
        return (
          <section key={category} className="aw-cat" aria-label={title}>
            <div className="challenges__head">
              <h2 className="challenges__title">{title}</h2>
              <span className="challenges__count">
                {t(
                  category === 'secret'
                    ? 'awards.group_secret'
                    : 'awards.group',
                  {
                    got: n,
                    total: list.length,
                  },
                )}
              </span>
            </div>
            <ul className="aw-grid">
              {list.map((a) => (
                <li key={a.key}>
                  <AwardTile item={a} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** The award card (OCT-184 5.2–5.5): a sheet, a dialog on desktop. */
export function AwardCard({
  item,
  onClose,
}: {
  item: AwardItem | undefined;
  onClose: () => void;
}) {
  const { t, fmt, name, value, label } = useAwardText();
  const secret = !!item && hidden(item);
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={item ? (secret ? t('awards.secret_title') : name(item)) : ''}
    >
      {item && (
        <div className="aw-card">
          <Medal
            awardKey={item.key}
            state={item.got ? 'got' : secret ? 'secret' : 'locked'}
            size="lg"
            label={label(item)}
          />
          {secret ? (
            <>
              <span className="aw-card__meta">
                {t('award.category.secret')}
              </span>
              <p className="aw-card__hint">
                «{t(`award.${item.key}.hint` as 'award.secret_comeback.hint')}»
              </p>
              <p className="aw-note">{t('awards.secret_foot')}</p>
            </>
          ) : (
            <>
              <span className="aw-card__meta">
                <i
                  className={`aw-card__metal aw-card__metal--${item.rarity}`}
                />
                {t('awards.meta', {
                  rarity: t(`award.rarity.${item.rarity}`),
                  category: t(`award.category.${item.category}`),
                })}
              </span>
              <p className="aw-card__rule">
                {t(`award.${item.key}.rule` as 'award.weeks_1.rule')}
              </p>
              {item.got ? (
                <span className="aw-card__got">
                  <Check aria-hidden="true" />
                  {t('awards.got_on', { date: fmt(item.got.earnedOn) })}
                </span>
              ) : (
                <div className="aw-card__progress">
                  <ProgressBar
                    value={item.value}
                    max={item.target}
                    label={name(item)}
                    valueText={value(item)}
                  />
                  <span>{value(item)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
