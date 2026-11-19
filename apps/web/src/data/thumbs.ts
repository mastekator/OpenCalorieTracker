import type { Meal, Recipe } from '@oct/shared';

export const THUMBS_CACHE = 'thumbs-v1';

/** Every photo the diary and the kitchen show: meal photos, recipe and step photos. */
export const photoIds = (meals: Meal[], recipes: Recipe[]) => [
  ...meals.flatMap((m) => (m.photo ? [m.photo.id] : [])),
  ...recipes.flatMap((r) =>
    [r.photoId, ...r.steps.map((s) => s.photoId)].filter(
      (id): id is string => !!id,
    ),
  ),
];

/** Thumbnail URL, the same the SW's CacheFirst route keeps (ADR-0008). */
export const thumbUrl = (photoId: string) =>
  `/api/photos/${encodeURIComponent(photoId)}`;

/**
 * Fetches missing thumbnails into the service worker's cache, one at a time, so the
 * diary and recipes show photos offline (ADR-0011 §2, ADR-0023 §4).
 */
export async function prefetchThumbs(ids: string[]) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(THUMBS_CACHE);
  for (const id of ids) {
    const url = thumbUrl(id);
    try {
      if (!(await cache.match(url))) await cache.add(url);
    } catch {
      // Offline or the photo is gone: the next pull tries again.
    }
  }
}
