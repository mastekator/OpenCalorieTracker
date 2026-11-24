import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import {
  CENTRAL,
  CENTRAL_SIG,
  END,
  END_SIG,
  LOCAL,
  LOCAL_SIG,
} from '../export/zip.js';
import { ApiError } from '../http/errors.js';

/** A zip bomb stops here (ADR-0026 §6): declared or actual unpacked size. */
export const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;

const bad = () => new ApiError(400, 'validation_failed');
const tooBig = () => new ApiError(413, 'import_too_large');

/** The file starts with a ZIP local header. */
export async function isZip(path: string) {
  const fh = await open(path);
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await fh.read(head, 0, 4, 0);
    return bytesRead === 4 && head.readUInt32LE(0) === LOCAL_SIG;
  } finally {
    await fh.close();
  }
}

/**
 * The first entry whose name passes `want`, unpacked; null when there is none.
 * Reads the central directory (store/deflate only, no ZIP64, no encryption); names
 * are only compared, never used as paths.
 */
export async function readZipEntry(
  path: string,
  want: (name: string) => boolean,
  maxBytes = MAX_UNZIPPED_BYTES,
): Promise<Buffer | null> {
  const fh = await open(path);
  const read = async (length: number, position: number) => {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, position);
    if (bytesRead !== length) throw bad();
    return buf;
  };
  try {
    const { size } = await fh.stat();
    // The end record sits in the last 22 bytes plus a comment of up to 64 KB.
    const tailLength = Math.min(size, END + 0xffff);
    const tail = await read(tailLength, size - tailLength);
    const sig = Buffer.alloc(4);
    sig.writeUInt32LE(END_SIG);
    const end = tail.lastIndexOf(sig);
    if (end < 0 || end + END > tail.length) throw bad();
    // At most 0xffff entries (ZIP_MAX_ENTRIES): the count is 16-bit without ZIP64.
    const count = tail.readUInt16LE(end + 10);
    const dirSize = tail.readUInt32LE(end + 12);
    const dirOffset = tail.readUInt32LE(end + 16);
    if (dirOffset + dirSize > size) throw bad();
    const dir = await read(dirSize, dirOffset);

    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + CENTRAL > dir.length || dir.readUInt32LE(p) !== CENTRAL_SIG)
        throw bad();
      const flags = dir.readUInt16LE(p + 8);
      const method = dir.readUInt16LE(p + 10);
      const packed = dir.readUInt32LE(p + 20);
      const unpacked = dir.readUInt32LE(p + 24);
      const nameLength = dir.readUInt16LE(p + 28);
      const offset = dir.readUInt32LE(p + 42);
      const name = dir.toString('utf8', p + CENTRAL, p + CENTRAL + nameLength);
      p +=
        CENTRAL +
        nameLength +
        dir.readUInt16LE(p + 30) +
        dir.readUInt16LE(p + 32);
      if (!want(name)) continue;

      if (flags & 1 || (method !== 0 && method !== 8)) throw bad();
      if (unpacked > maxBytes) throw tooBig();
      const local = await read(LOCAL, offset);
      if (local.readUInt32LE(0) !== LOCAL_SIG) throw bad();
      const start =
        offset + LOCAL + local.readUInt16LE(26) + local.readUInt16LE(28);
      if (start + packed > size) throw bad();
      const data = await read(packed, start);
      let out: Buffer;
      if (method === 0) out = data;
      else
        try {
          // The declared size can lie: the output limit holds whatever it says.
          out = inflateRawSync(data, { maxOutputLength: maxBytes });
        } catch (err) {
          throw (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
            ? tooBig()
            : bad();
        }
      if (out.length !== unpacked) throw bad();
      return out;
    }
    return null;
  } finally {
    await fh.close();
  }
}
