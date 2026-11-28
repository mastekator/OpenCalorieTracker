import { Flame } from 'lucide-react';
import type { StreakState } from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../../ui/Badge/Badge';
import { List, ListRow } from '../../ui/List/List';
import { useStreakTitle, useWeekLine } from './StreakCard';
import './Streaks.css';

export const STREAKS_PATH = '/week/streaks';

/** The streak row on top of the Week tab (OCT-184 1.1): flame, streak, this week; opens the streak screen. */
export function StreakRow({
  streak,
  fresh = 0,
  onOpen,
}: {
  streak: StreakState;
  /** Awards not seen yet: «{n} new» (OCT-184 1.1). */
  fresh?: number;
  onOpen: () => void;
}) {
  const { t } = useT();
  const title = useStreakTitle(streak);
  const sub = useWeekLine(streak);
  return (
    <div className="streak-row">
      <List>
        <ListRow
          icon={
            <span
              className={`streak__flame${streak.best > 0 ? '' : ' streak__flame--off'}`}
            >
              <Flame aria-hidden="true" />
            </span>
          }
          description={sub}
          value={
            fresh > 0 && (
              <Badge tone="new">{t('awards.fresh', { count: fresh })}</Badge>
            )
          }
          onClick={onOpen}
        >
          {title}
        </ListRow>
      </List>
    </div>
  );
}
