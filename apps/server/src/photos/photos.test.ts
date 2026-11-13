import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { setCookie, testApp } from '../test/app.js';
import { MAX_PHOTO_BYTES } from './routes.js';
import { photoPath } from './store.js';

const PASSWORD = 'Correct-horse-battery-9';
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true })));
});

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'oct-photos-'));
  dirs.push(dataDir);
  const t = testApp({ DATA_DIR: dataDir });
  await ensureAdmin(t.config, t.db);
  const signIn = async (email: string) => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    return setCookie(res, 'oct_session')!.split(';')[0]!;
  };
  const upload = (cookie: string, body: Uint8Array) =>
    t.app.request('/api/photos', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', cookie },
      body,
    });
  const get = (cookie: string, id: string, size?: string) =>
    t.app.request(`/api/photos/${id}${size ? `?size=${size}` : ''}`, {
      headers: { cookie },
    });
  return {
    ...t,
    dataDir,
    signIn,
    upload,
    get,
    cookie: await signIn('admin@example.com'),
  };
}

/** A noisy (hard to compress) JPEG with a GPS tag, like a phone photo. */
const camera = (width = 3000, height = 2000) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#888',
      noise: { type: 'gaussian', mean: 128, sigma: 30 },
    },
  })
    .jpeg({ quality: 70 })
    .withExif({
      IFD0: { Make: 'TestCam' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' },
    })
    .toBuffer();

describe('photos', () => {
  it('stores a resized JPEG and a WebP preview without metadata', async () => {
    const input = await camera();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const { upload, get, cookie } = await setup();
    const res = await upload(cookie, input);
    expect(res.status).toBe(201);
    const { photoId } = (await res.json()) as { photoId: string };
    expect(photoId).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const full = await get(cookie, photoId, 'full');
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('image/jpeg');
    expect(full.headers.get('cache-control')).toBe(
      'private, max-age=31536000, immutable',
    );
    const fullMeta = await sharp(
      Buffer.from(await full.arrayBuffer()),
    ).metadata();
    expect(fullMeta).toMatchObject({
      format: 'jpeg',
      width: 1280,
      height: 853,
    });
    expect(fullMeta.exif).toBeUndefined();

    const preview = await get(cookie, photoId);
    expect(preview.headers.get('content-type')).toBe('image/webp');
    const previewBytes = Buffer.from(await preview.arrayBuffer());
    expect(previewBytes.length).toBeLessThanOrEqual(50 * 1024);
    const previewMeta = await sharp(previewBytes).metadata();
    expect(previewMeta).toMatchObject({ format: 'webp', width: 320 });
    expect(previewMeta.exif).toBeUndefined();
  });

  it('applies EXIF orientation and never upscales', async () => {
    const input = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#f00' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const { upload, get, cookie } = await setup();
    const { photoId } = (await (await upload(cookie, input)).json()) as {
      photoId: string;
    };
    const meta = await sharp(
      Buffer.from(await (await get(cookie, photoId, 'full')).arrayBuffer()),
    ).metadata();
    expect(meta).toMatchObject({ width: 100, height: 200 });
    expect(meta.orientation).toBeUndefined();
  });

  it('rejects a non-image with 400 and stores nothing', async () => {
    const { upload, cookie, dataDir } = await setup();
    const res = await upload(cookie, new TextEncoder().encode('not a photo'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'photo_invalid' } });
    expect(await readdir(dataDir)).toEqual([]);
  });

  it('rejects a body over 5 MB with 413', async () => {
    const { upload, cookie } = await setup();
    const res = await upload(cookie, new Uint8Array(MAX_PHOTO_BYTES + 1));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: { code: 'photo_too_large' } });
  });

  it("is 404 for another user's photo, a missing one and a malformed id", async () => {
    const t = await setup();
    t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('b@example.com', 'user', randomblob(16), 0)",
      )
      .run();
    t.db
      .prepare(
        "INSERT INTO passwords (user_id, hash, updated_at) VALUES ((SELECT id FROM users WHERE email = 'b@example.com'), ?, 0)",
      )
      .run(await hashPassword(PASSWORD));
    const other = await t.signIn('b@example.com');
    const { photoId } = (await (
      await t.upload(t.cookie, await camera(400, 300))
    ).json()) as { photoId: string };

    expect((await t.get(other, photoId)).status).toBe(404);
    expect((await t.get(other, photoId, 'full')).status).toBe(404);
    expect((await t.get(t.cookie, 'A'.repeat(22))).status).toBe(404);
    expect((await t.get(t.cookie, '..%2F..%2F1%2Fx')).status).toBe(404);
    expect((await t.get(t.cookie, photoId, 'raw')).status).toBe(400);
  });

  it('is 401 without a session', async () => {
    const { upload, get } = await setup();
    expect((await upload('', await camera(10, 10))).status).toBe(401);
    expect((await get('', 'A'.repeat(22))).status).toBe(401);
  });
});

describe('photoPath', () => {
  it('rejects malformed ids before touching the filesystem', () => {
    for (const id of [
      '',
      '..',
      '../x',
      '..%2Fx',
      'a/b',
      'A'.repeat(21),
      'A'.repeat(23),
      `${'A'.repeat(21)}.`,
    ])
      expect(photoPath('/data', 1, id, 'full')).toBeNull();
  });

  it("stays inside the user's directory", () => {
    expect(photoPath('/data', 7, 'A'.repeat(22), 'preview')).toBe(
      join('/data', 'photos', '7', `${'A'.repeat(22)}.webp`),
    );
  });
});
