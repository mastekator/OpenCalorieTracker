import type { Database } from 'better-sqlite3';
import { effectiveNorm, type ProfileResponse } from '@oct/shared';

interface ProfileRow {
  sex: 'male' | 'female' | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity: ProfileResponse['profile']['activity'];
  goal: ProfileResponse['profile']['goal'];
  target_weight_kg: number | null;
  deadline: string | null;
  kcal_override: number | null;
  protein_pct: number | null;
  fat_pct: number | null;
  carbs_pct: number | null;
  rev: number;
}

/** The user's stored profile; no row yet means every field is null (AC-1.3). */
export function readProfile(db: Database, userId: number): ProfileResponse {
  const r = db
    .prepare('SELECT * FROM profiles WHERE user_id = ?')
    .get(userId) as ProfileRow | undefined;
  return {
    profile: {
      sex: r?.sex ?? null,
      birthDate: r?.birth_date ?? null,
      heightCm: r?.height_cm ?? null,
      weightKg: r?.weight_kg ?? null,
      activity: r?.activity ?? null,
      goal: r?.goal ?? null,
      targetWeightKg: r?.target_weight_kg ?? null,
      deadline: r?.deadline ?? null,
    },
    // The CHECK constraint keeps the four manual columns all set or all null.
    manual:
      r?.kcal_override == null
        ? null
        : {
            kcal: r.kcal_override,
            proteinPct: r.protein_pct!,
            fatPct: r.fat_pct!,
            carbsPct: r.carbs_pct!,
          },
    rev: r?.rev ?? 0,
  };
}

/** The norm the day's remainder is counted from (ADR-0010, ADR-0014 §5); null when there is none. */
export function getDailyNorm(db: Database, userId: number, today: string) {
  const { profile, manual } = readProfile(db, userId);
  return effectiveNorm(profile, manual, today);
}
