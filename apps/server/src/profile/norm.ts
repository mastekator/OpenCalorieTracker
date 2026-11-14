import type { Database } from 'better-sqlite3';
import {
  effectiveNorm,
  type ManualNorm,
  type Profile,
  type ProfileResponse,
} from '@oct/shared';
import { bumpRev } from '../sync/rev.js';

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

/** Saves the profile and manual norm (null clears it) with a new rev; call inside a transaction. */
export function writeProfile(
  db: Database,
  userId: number,
  p: Profile,
  m: ManualNorm | null,
) {
  db.prepare(
    `INSERT INTO profiles (user_id, sex, birth_date, height_cm, weight_kg, activity, goal,
       target_weight_kg, deadline, kcal_override, protein_pct, fat_pct, carbs_pct, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       sex = excluded.sex, birth_date = excluded.birth_date, height_cm = excluded.height_cm,
       weight_kg = excluded.weight_kg, activity = excluded.activity, goal = excluded.goal,
       target_weight_kg = excluded.target_weight_kg, deadline = excluded.deadline,
       kcal_override = excluded.kcal_override, protein_pct = excluded.protein_pct,
       fat_pct = excluded.fat_pct, carbs_pct = excluded.carbs_pct,
       updated_at = excluded.updated_at, rev = excluded.rev`,
  ).run(
    userId,
    p.sex,
    p.birthDate,
    p.heightCm,
    p.weightKg,
    p.activity,
    p.goal,
    p.targetWeightKg,
    p.deadline,
    m?.kcal ?? null,
    m?.proteinPct ?? null,
    m?.fatPct ?? null,
    m?.carbsPct ?? null,
    Date.now(),
    bumpRev(db, userId),
  );
}
