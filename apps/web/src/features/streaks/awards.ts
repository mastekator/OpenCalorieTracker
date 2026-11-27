import {
  AWARDS,
  type AwardCategory,
  type AwardKey,
  type AwardProgress,
  type StoredAward,
} from '@oct/shared';
import type { Streaks } from '../../data/streaks';

export const AWARDS_PATH = '/week/streaks/awards';

export type AwardItem = (typeof AWARDS)[number] & {
  value: number;
  /** Stored, so earned on every device; absent while ahead. */
  got?: StoredAward;
};

/**
 * The catalog with progress and what is earned. «Photo» is left out when AI can't read photos
 * and none of them is earned (AC-3.10).
 */
export function awardItems(s: Pick<Streaks, 'awards' | 'stored' | 'photoAi'>) {
  const progress = new Map<string, AwardProgress>(
    s.awards.map((a) => [a.key, a]),
  );
  const stored = new Map(s.stored.map((a) => [a.key, a]));
  const items: AwardItem[] = AWARDS.map((a) => ({
    ...a,
    value: progress.get(a.key)?.value ?? 0,
    got: stored.get(a.key),
  }));
  const photo = s.photoAi || items.some((a) => a.category === 'photo' && a.got);
  return photo ? items : items.filter((a) => a.category !== 'photo');
}

/** Categories in catalog order, secret last (AC-3.11). */
export const byCategory = (items: AwardItem[]) => {
  const groups = new Map<AwardCategory, AwardItem[]>();
  for (const a of items)
    groups.set(a.category, [...(groups.get(a.category) ?? []), a]);
  return [...groups];
};

/** The block's medals (OCT-184 2.1): up to three last earned, newest first. */
export const recentAwards = (items: AwardItem[]) =>
  items
    .filter((a) => a.got)
    .sort((a, b) => (a.got!.earnedOn < b.got!.earnedOn ? 1 : -1))
    .slice(0, 3);

/** «Next»: the open non-secret award closest to its target; ties by catalog order. */
export const nextAward = (items: AwardItem[]) =>
  items
    .filter((a) => !a.got && a.category !== 'secret')
    .reduce<AwardItem | undefined>(
      (best, a) =>
        !best || a.value / a.target > best.value / best.target ? a : best,
      undefined,
    );

/** Shown items not yet seen: they carry «New» and are marked seen on leaving (AC-3.5). */
export const unseenOf = (items: AwardItem[]) =>
  items.flatMap((a) => (a.got && !a.got.seen ? [a.got] : []));

export type { AwardKey };
