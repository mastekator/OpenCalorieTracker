import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import type { AwardKey, StoredAward } from '@oct/shared';
import { useDb, useStreaks } from '../../data/DataContext';
import { markSeen } from '../../data/streaks';
import { AwardToast } from '../../ui/AwardToast/AwardToast';
import { useToday } from '../diary/useToday';

/** The strip goes away by itself after this. */
export const AWARD_TOAST_MS = 5000;
const AWARDS_PATH = '/week/streaks/awards';

const modalOpen = () => !!document.querySelector('dialog[open]');

/**
 * Congratulates on new awards once per account (ADR-0032 §5): showing the strip marks them
 * seen on every device. Waits while a sheet or dialog is open: outside it the strip is inert.
 */
export function AwardCelebration() {
  const db = useDb();
  const celebrate = useStreaks(useToday())?.celebrate;
  const [shown, setShown] = useState<StoredAward[] | null>(null);
  const [modal, setModal] = useState(modalOpen);
  // Marked this session: the read after markSeen may land later than the strip goes.
  const marked = useRef(new Set<string>());
  const [location, navigate] = useLocation();
  const at = useRef(location);

  const waiting = !shown && !!celebrate?.length;
  useEffect(() => {
    if (!waiting) return;
    const watch = new MutationObserver(() => setModal(modalOpen()));
    watch.observe(document.body, {
      subtree: true,
      childList: true,
      attributeFilter: ['open'],
    });
    setModal(modalOpen());
    return () => watch.disconnect();
  }, [waiting]);

  useEffect(() => {
    if (shown || modal) return;
    const fresh = (celebrate ?? []).filter((a) => !marked.current.has(a.key));
    if (!fresh.length) return;
    fresh.forEach((a) => marked.current.add(a.key));
    setShown(fresh);
    markSeen(db, fresh).catch(() => {});
  }, [celebrate, shown, modal, db]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), AWARD_TOAST_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  // Leaving the screen closes it.
  useEffect(() => {
    if (at.current === location) return;
    at.current = location;
    setShown(null);
  }, [location]);

  return (
    <AwardToast
      awards={(shown ?? []).map((a) => a.key as AwardKey)}
      onOpen={() => {
        setShown(null);
        navigate(AWARDS_PATH);
      }}
      onClose={() => setShown(null)}
    />
  );
}
