import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, GitCompare } from 'lucide-react';
import { useSession } from '../../app/SessionContext';
import { useConflicts, useDb, useSettings } from '../../data/DataContext';
import { keepMine, keepTheirs } from '../../data/outbox';
import { useT } from '../../i18n';
import { DESKTOP_MEDIA } from '../../styles/breakpoints';
import { ConflictSheet, type Side } from '../../ui/ConflictSheet/ConflictSheet';
import { useToast } from '../../ui/Toast/Toast';

/** The conflict toast stays a little longer than others: it has an action (OCT-157 1.1). */
export const CONFLICT_TOAST_MS = 6000;

type Conflicts = {
  /** clientIds whose edit waits for a version choice. */
  ids: ReadonlySet<string>;
  /** Opens «Which version should we keep?» for this meal. */
  open: (clientId: string) => void;
};

const Context = createContext<Conflicts | null>(null);

/**
 * The version choice above the screens (ADR-0022 §4): a toast when a conflict appears,
 * the sheet opened from it or from the meal's badge. Inside DataProvider and ToastProvider.
 */
export function ConflictProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const db = useDb();
  const toast = useToast();
  const { user } = useSession();
  const settings = useSettings();
  const conflicts = useConflicts();
  const [desktop, setDesktop] = useState(
    () => !!window.matchMedia?.(DESKTOP_MEDIA).matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.(DESKTOP_MEDIA);
    const sync = () => setDesktop(media!.matches);
    media?.addEventListener('change', sync);
    return () => media?.removeEventListener('change', sync);
  }, []);
  const [current, setCurrent] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  // Chosen since the sheet opened, for «2 of 3».
  const [done, setDone] = useState(0);
  // The editRev of theirs the screen showed: another one means it changed while open (2.4).
  const shownRev = useRef<number | undefined>(undefined);
  // In memory only: one toast per app start, then only when the count grows.
  const toasted = useRef(0);

  const show = useCallback((clientId: string | null, chosen = 0) => {
    shownRev.current = undefined;
    setUpdated(false);
    setDone(chosen);
    setCurrent(clientId);
  }, []);
  const open = useCallback((clientId: string) => show(clientId), [show]);

  useEffect(() => {
    if (!conflicts) return;
    const n = conflicts.length;
    const grew = n > toasted.current;
    toasted.current = n;
    if (!grew) return;
    const first = conflicts[0]!.mine.clientId;
    toast({
      text:
        n === 1
          ? t('sync.conflict.toast_single')
          : t('sync.conflict.toast', { count: n }),
      icon: <GitCompare aria-hidden="true" />,
      ms: CONFLICT_TOAST_MS,
      action: { label: t('sync.conflict.choose'), onClick: () => open(first) },
    });
  }, [conflicts]);

  const live = conflicts?.find((c) => c.mine.clientId === current);
  const rev = live?.conflict.theirs.editRev;
  useEffect(() => {
    if (rev === undefined) return;
    if (shownRev.current !== undefined && shownRev.current !== rev)
      setUpdated(true);
    shownRev.current = rev;
  }, [rev]);

  const keep = async (side: Side) => {
    if (!live || !current) return;
    const choose = side === 'this' ? keepMine : keepTheirs;
    // Rejects only when the database is closed by a sign-out or user switch.
    const result = await choose(db, current, live.conflict).catch(() => null);
    if (result !== 'done') {
      // Theirs changed after it was drawn: nothing applied, it is shown again.
      if (result === 'stale') setUpdated(true);
      return;
    }
    toast({
      text: t(`sync.conflict.kept_${side}`),
      icon: <Check aria-hidden="true" />,
    });
    const next = conflicts!.find((c) => c.mine.clientId !== current);
    show(next?.mine.clientId ?? null, done + 1);
  };

  const ids = new Set(conflicts?.map((c) => c.mine.clientId));
  return (
    <Context value={{ ids, open }}>
      {children}
      {live && (
        <ConflictSheet
          key={current}
          mine={live.mine}
          editedAt={live.editedAt}
          theirs={live.conflict.theirs}
          updated={updated}
          progress={{ i: done + 1, n: done + conflicts!.length }}
          units={settings?.units ?? user?.units ?? 'metric'}
          desktop={desktop}
          onKeep={(side) => void keep(side)}
          onClose={() => show(null)}
        />
      )}
    </Context>
  );
}

/** Null outside ConflictProvider (stories, view tests): rows open the editor as before. */
export const useConflictSheet = () => useContext(Context);
