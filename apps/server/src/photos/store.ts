import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ApiError } from '../http/errors.js';

// One libvips thread and no operation cache: small hosts (Pi) matter more than throughput (ADR-0008).
sharp.concurrency(1);
sharp.cache(false);

export type PhotoSize = 'full' | 'preview';

const PHOTO_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const EXT: Record<PhotoSize, string> = { full: 'jpg', preview: 'webp' };
// ~48-50 MP cameras fit; bigger inputs are decompression bombs.
const MAX_INPUT_PIXELS = 100_000_000;

const userDir = (dataDir: string, userId: number) =>
  join(dataDir, 'photos', String(userId));

/** The path of a user's photo file, or null when the id is malformed (checked before any fs access). */
export function photoPath(
  dataDir: string,
  userId: number,
  photoId: string,
  size: PhotoSize,
): string | null {
  if (!PHOTO_ID_RE.test(photoId)) return null;
  return join(userDir(dataDir, userId), `${photoId}.${EXT[size]}`);
}

/** Re-encodes an uploaded image without metadata, stores it with a preview and returns its id. */
export async function savePhoto(
  dataDir: string,
  userId: number,
  bytes: Uint8Array,
): Promise<string> {
  let full: Buffer, preview: Buffer;
  try {
    // sharp writes no metadata unless asked to, so EXIF/GPS is dropped here (AC-1.4).
    full = await sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    preview = await sharp(full)
      .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
  } catch {
    throw new ApiError(400, 'photo_invalid');
  }

  const id = randomBytes(16).toString('base64url');
  const dir = userDir(dataDir, userId);
  await mkdir(dir, { recursive: true });
  // Temp file in the same directory so rename is atomic: no half-written photo after a crash.
  const write = async (size: PhotoSize, data: Buffer) => {
    const path = photoPath(dataDir, userId, id, size)!;
    await writeFile(`${path}.tmp`, data);
    await rename(`${path}.tmp`, path);
  };
  try {
    await write('preview', preview);
    await write('full', full);
  } catch (err) {
    await Promise.all(
      (['preview', 'full'] as const).flatMap((s) => {
        const p = photoPath(dataDir, userId, id, s)!;
        return [rm(p, { force: true }), rm(`${p}.tmp`, { force: true })];
      }),
    );
    throw err;
  }
  return id;
}
