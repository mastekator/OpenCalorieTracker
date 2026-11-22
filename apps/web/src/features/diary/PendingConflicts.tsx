import { GitCompare } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { useConflictSheet } from './conflicts';
import './NormInvite.css';

type Props = { count: number; onChoose: () => void };

/** «3 entries need a version choice · Choose» above the day total, no close button (OCT-157 1.2). */
export function PendingConflictsView({ count, onChoose }: Props) {
  const { t } = useT();
  return (
    <div className="norm-invite norm-invite--warning" role="status">
      <GitCompare className="norm-invite__icon" aria-hidden="true" />
      <span className="norm-invite__text">
        {t('sync.conflict.pending', { count })}
      </span>
      <Button variant="plain" small onClick={onChoose}>
        {t('sync.conflict.choose')}
      </Button>
    </div>
  );
}

/** Opens the first conflict; nothing when none waits or outside ConflictProvider. */
export function PendingConflicts() {
  const conflicts = useConflictSheet();
  const first = conflicts?.ids.values().next().value;
  if (!first) return null;
  return (
    <PendingConflictsView
      count={conflicts.ids.size}
      onChoose={() => conflicts.open(first)}
    />
  );
}
