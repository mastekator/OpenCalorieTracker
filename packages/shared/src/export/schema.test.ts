import { describe, expect, it } from 'vitest';
import { ILLUSTRATION_IDS } from '../illustrations/dictionary.js';
import { OCT_EXPORT_VERSION, octExportSchema } from './schema.js';

const valid = {
  format: 'oct-export',
  version: OCT_EXPORT_VERSION,
  exportedAt: '2026-11-21T10:00:00.000Z',
  app: '0.4.0',
  period: { from: '2026-11-01', to: '2026-11-21' },
  profile: {
    sex: 'female',
    birthDate: '1990-05-01',
    heightCm: 168,
    weightKg: 62.5,
    activity: 'light',
    goal: 'maintain',
    targetWeightKg: null,
    deadline: null,
  },
  norm: { kcal: 2000, proteinPct: 20, fatPct: 30, carbsPct: 50 },
  settings: {
    locale: 'en',
    theme: 'system',
    units: 'metric',
    offEnabled: false,
  },
  meals: [
    {
      clientId: '0b9e5a52-2f7e-4c1e-9d55-4a8a3b0f6a10',
      localDate: '2026-11-20',
      eatenAt: '2026-11-20T08:15:00.000Z',
      tzOffsetMin: 180,
      mealType: 'breakfast',
      photo: 'photos/42.jpg',
      dishes: [
        {
          name: 'Oatmeal',
          grams: 183.4,
          unit: 'g',
          kcal: 250.37,
          proteinG: 8.1,
          fatG: 4.4,
          carbsG: 44.12,
          source: 'ai',
          illustration: ILLUSTRATION_IDS[0],
        },
        {
          name: 'Milk',
          grams: 200,
          unit: 'ml',
          kcal: 104,
          proteinG: 6,
          fatG: 5,
          carbsG: 9.4,
          source: 'barcode',
        },
      ],
    },
    {
      clientId: 'import:3:1',
      localDate: '2026-11-19',
      eatenAt: '2026-11-19T12:00:00.000Z',
      tzOffsetMin: 0,
      mealType: 'snack',
      dishes: [
        {
          name: 'Snack total',
          grams: 0,
          unit: 'g',
          kcal: 310,
          proteinG: 0,
          fatG: 0,
          carbsG: 0,
          source: 'import',
        },
      ],
    },
  ],
  weighings: [{ date: '2026-11-20', weightKg: 62.4 }],
};

describe('octExportSchema', () => {
  it('accepts a valid file', () => {
    expect(octExportSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a newer version and another format', () => {
    expect(
      octExportSchema.safeParse({ ...valid, version: OCT_EXPORT_VERSION + 1 })
        .success,
    ).toBe(false);
    expect(
      octExportSchema.safeParse({ ...valid, format: 'other' }).success,
    ).toBe(false);
  });

  it('drops unknown keys of future modules instead of failing', () => {
    const r = octExportSchema.parse({
      ...valid,
      water: [{ date: '2026-11-20', ml: 1500 }],
      meals: [{ ...valid.meals[0], supplements: ['d3'] }],
    });
    expect(r).not.toHaveProperty('water');
    expect(r.meals[0]).not.toHaveProperty('supplements');
  });

  it('keeps no email in the profile', () => {
    const r = octExportSchema.parse({
      ...valid,
      profile: { ...valid.profile, email: 'a@b.c' },
    });
    expect(r.profile).not.toHaveProperty('email');
  });

  it('accepts a WebP preview as the photo', () => {
    const meal = { ...valid.meals[0], photo: 'photos/42.webp' };
    expect(octExportSchema.safeParse({ ...valid, meals: [meal] }).success).toBe(
      true,
    );
  });

  it('rejects a photo path outside photos/', () => {
    const meal = { ...valid.meals[0], photo: '../etc/passwd' };
    expect(octExportSchema.safeParse({ ...valid, meals: [meal] }).success).toBe(
      false,
    );
  });
});
