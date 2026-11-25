/** Photos one «Ingredients from photo» sheet takes (OCT-435 3.5, AC-B6). */
export const MAX_SHOTS = 5;

/** One photo in the review sheet: recognizing, failed, or its rows. */
export type Shot<R> = {
  key: number;
  file: File;
  url: string;
  state: 'wait' | 'error' | R[];
};

/** Rows of the recognized photos in photo order: a later photo's rows go after, never merged. */
export const shotRows = <R>(shots: readonly Shot<R>[]): R[] =>
  shots.flatMap((s) => (typeof s.state === 'string' ? [] : s.state));

export const withShot = <R>(
  shots: readonly Shot<R>[],
  key: number,
  state: Shot<R>['state'],
): Shot<R>[] => shots.map((s) => (s.key === key ? { ...s, state } : s));

/** Applies `f` to every recognized photo's rows; waiting and failed photos stay as they are. */
export const mapRows = <R>(
  shots: readonly Shot<R>[],
  f: (rows: R[]) => R[],
): Shot<R>[] =>
  shots.map((s) =>
    typeof s.state === 'string' ? s : { ...s, state: f(s.state) },
  );
