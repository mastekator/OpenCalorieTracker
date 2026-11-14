import type { Meal } from '@oct/shared';

export const THUMBS_CACHE = 'thumbs-v1';

/**
 * Fetches missing meal thumbnails into the service worker's cache, one at a time, so the
 * diary shows photos offline (ADR-0011 §2). Same URL as the SW's CacheFirst route.
 */
export async function prefetchThumbs(meals: Meal[]) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(THUMBS_CACHE);
  for (const meal of meals) {
    if (!meal.photo) continue;
    const url = `/api/photos/${meal.photo.id}`;
    try {
      if (!(await cache.match(url))) await cache.add(url);
    } catch {
      // Offline or the photo is gone: the next pull tries again.
    }
  }
}
