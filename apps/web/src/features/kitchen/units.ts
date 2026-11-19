import type { Units } from '@oct/shared';
import { useSession } from '../../app/SessionContext';
import { useSettings } from '../../data/DataContext';

/** The user's weight units, read as the dish editor reads them. */
export function useUnits(): Units {
  const settings = useSettings();
  const { user } = useSession();
  return settings?.units ?? user?.units ?? 'metric';
}
