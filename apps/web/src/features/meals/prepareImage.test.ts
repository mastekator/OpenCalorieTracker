import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitSize, ImageDecodeError, prepareImage } from './prepareImage';

afterEach(() => vi.unstubAllGlobals());

describe('fitSize', () => {
  it('brings the long side down to 1280', () => {
    expect(fitSize(8064, 6048)).toEqual({ width: 1280, height: 960 });
    expect(fitSize(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });

  it('never upscales a small photo', () => {
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 });
  });
});

describe('prepareImage', () => {
  it('draws the oriented bitmap at ≤ 1280 px and returns a JPEG', async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(async () => ({
      width: 8064,
      height: 6048,
      close,
    }));
    const drawImage = vi.fn();
    const convertToBlob = vi.fn(
      async ({ type }: { type: string }) => new Blob(['x'], { type }),
    );
    const sizes: number[][] = [];
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(w: number, h: number) {
          sizes.push([w, h]);
        }
        getContext = () => ({ drawImage });
        convertToBlob = convertToBlob;
      },
    );

    const out = await prepareImage(new Blob(['raw']));

    expect(out.type).toBe('image/jpeg');
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: 'from-image',
    });
    expect(sizes).toEqual([[1280, 960]]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 960);
    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/jpeg',
      quality: 0.8,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('turns a decode failure into ImageDecodeError (E-1.1)', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('broken', 'InvalidStateError');
      }),
    );
    await expect(prepareImage(new Blob(['not an image']))).rejects.toThrow(
      ImageDecodeError,
    );
  });
});
