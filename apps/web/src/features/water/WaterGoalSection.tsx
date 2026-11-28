import type { Units } from '@oct/shared';
import { useT } from '../../i18n';
import { Disclaimer } from '../../ui/Disclaimer/Disclaimer';
import { List, ListRow } from '../../ui/List/List';
import { useVolume } from './format';
import './WaterGoalSheet.css';

type Props = {
  goalMl: number;
  /** Set by the user: no disclaimer (OCT-147 4.2). */
  manual: boolean;
  online: boolean;
  units: Units;
  onOpen: () => void;
};

/** OCT-147 4.1: «Water» in the profile, the goal of today; offline it cannot change. */
export function WaterGoalSection({
  goalMl,
  manual,
  online,
  units,
  onOpen,
}: Props) {
  const { t } = useT();
  const volume = useVolume(units);
  return (
    <div className="water-goal-section">
      <List
        title={t('water.title')}
        footer={online ? undefined : t('water.goal.offline')}
      >
        <ListRow
          disabled={!online}
          onClick={() => online && onOpen()}
          value={volume(goalMl)}
          description={t(manual ? 'water.goal.manual' : 'water.goal.reference')}
        >
          {t('water.goal.title')}
        </ListRow>
      </List>
      {!manual && <Disclaimer text={t('water.goal.disclaimer')} />}
    </div>
  );
}
