import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { normalizeGtin } from '@oct/shared';
import sharp from 'sharp';
import {
  prepareZXingModule,
  readBarcodes as zxingRead,
} from 'zxing-wasm/reader';
import { RESULT_TTL_MS } from '../ai/routes.js';

let ready = false;
/** Loads the wasm from node_modules on first use; the library's default fetches it from a CDN (ADR-0034 §1). */
function prepare() {
  if (ready) return;
  // The Emscripten build only fetches URLs, so the bytes are handed over instead of a path.
  const wasmBinary = readFileSync(
    createRequire(import.meta.url).resolve(
      'zxing-wasm/reader/zxing_reader.wasm',
    ),
  );
  prepareZXingModule({ overrides: { wasmBinary } });
  ready = true;
}

const MAX_CODES = 5;

/** Retail barcodes on a stored photo (ADR-0034 §1): normalized GTINs, no repeats, at most 5. */
export async function readBarcodes(jpeg: Uint8Array): Promise<string[]> {
  prepare();
  const { data, info } = await sharp(jpeg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const found = await zxingRead(
    {
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
      width: info.width,
      height: info.height,
    } as ImageData,
    { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'] },
  );
  const codes = found
    .filter((r) => r.isValid)
    // zxing returns UPC-A and UPC-E already expanded to 13 digits.
    .map((r) => normalizeGtin(r.text))
    .filter((c): c is string => c !== null);
  return [...new Set(codes)].slice(0, MAX_CODES);
}

export type PhotoBarcodes = (
  key: string,
  read: () => Promise<string[]>,
) => Promise<string[]>;

/** Codes by "userId:photoId", kept as long as AI results; failures are dropped at once. */
export function photoBarcodes(): PhotoBarcodes {
  const cache = new Map<string, Promise<string[]>>();
  return (key, read) => {
    const cached = cache.get(key);
    if (cached) return cached;
    const result = read();
    cache.set(key, result);
    result.then(
      () => setTimeout(() => cache.delete(key), RESULT_TTL_MS).unref(),
      () => cache.delete(key),
    );
    return result;
  };
}
