import { useState } from 'react';
import type { NormResult, Profile } from '@oct/shared';

// «Not now» on «Goal reached» (8.13) lasts until the profile changes.
const LATER_KEY = 'oct.goalReached.laterRev';

/** Profile rev «Not now» was pressed for, shared by the profile form and the weight card. */
export function useReachedLater() {
  const [laterRev, setLaterRev] = useState(() =>
    localStorage.getItem(LATER_KEY),
  );
  const later = (rev: number) => {
    localStorage.setItem(LATER_KEY, String(rev));
    setLaterRev(String(rev));
  };
  return [laterRev, later] as const;
}

/** 8.13: offer «Maintain» once the target is reached, until «Not now» for this profile rev. */
export const offerMaintain = (
  calc: NormResult | null,
  profile: Profile,
  rev: number,
  laterRev: string | null,
) =>
  calc?.status === 'ok' &&
  calc.warnings.includes('goal_reached') &&
  profile.targetWeightKg !== null &&
  laterRev !== String(rev);
