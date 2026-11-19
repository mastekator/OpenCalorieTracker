import type { AiTestPhoto } from '@oct/shared';

/** The reference set as a finished run returns it; one miss per kind of reason. */
export const TEST_PHOTOS: AiTestPhoto[] = [
  {
    file: 'banana.jpg',
    expected: 'banana; 70-160 kcal; exact',
    got: 'banana',
    kcal: 105,
    levels: 'exact',
    ms: 2800,
    result: 'ok',
  },
  {
    file: 'eggs.jpg',
    expected: 'egg, egg, egg; 150-300 kcal; exact',
    got: 'egg, egg, egg',
    kcal: 234,
    levels: 'exact,exact,exact',
    ms: 3900,
    result: 'ok',
  },
  {
    file: 'bread-slice.jpg',
    expected: 'rye bread slice; 50-180 kcal; exact',
    got: 'rye bread',
    kcal: 95,
    levels: 'high',
    ms: 3400,
    result: 'not every dish is exact',
  },
  {
    file: 'pilaf.jpg',
    expected: 'pilaf; 455-845 kcal; notExact',
    got: 'Pilaf with beef',
    kcal: 720,
    levels: 'medium',
    ms: 4600,
    result: 'ok',
  },
  {
    file: 'salad.jpg',
    expected: 'spinach and tuna salad with dressing; 150-650 kcal; notExact',
    got: 'salad',
    kcal: 900,
    levels: 'medium',
    ms: 4200,
    result: 'kcal 900 not in 150-650',
  },
  {
    file: 'chair.jpg',
    expected: '(none)',
    got: '(none)',
    kcal: 0,
    levels: '',
    ms: 2100,
    result: 'ok',
  },
];

/** Photo 4 of 6 in flight. */
export const RUNNING_PHOTOS: AiTestPhoto[] = TEST_PHOTOS.map((p, i) =>
  i < 3 ? p : { file: p.file, expected: p.expected, result: 'pending' },
);

/** Stopped on the first photo by a bad key. */
export const STOPPED_PHOTOS: AiTestPhoto[] = TEST_PHOTOS.map((p, i) =>
  i === 0
    ? {
        file: p.file,
        expected: p.expected,
        ms: 600,
        result: 'error ai_unavailable',
      }
    : { file: p.file, expected: p.expected, result: 'not_run' },
);
