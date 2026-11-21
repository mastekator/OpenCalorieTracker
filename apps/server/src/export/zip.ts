import { crc32 } from 'node:zlib';

/** A file of a store-only ZIP: its exact size is known up front, its bytes come in chunks. */
export interface ZipEntry {
  name: string;
  size: number;
  data: () => Iterable<Uint8Array> | AsyncIterable<Uint8Array>;
}

const LOCAL = 30;
const DESCRIPTOR = 16;
const CENTRAL = 46;
const END = 22;
/** Without ZIP64 (ADR-0026 §3): sizes and offsets are 32-bit, the entry count 16-bit. */
export const ZIP_MAX_BYTES = 0xffffffff;
export const ZIP_MAX_ENTRIES = 0xffff;
// Bit 3: CRC in a data descriptor after the data (computed while streaming); bit 11: UTF-8 names.
const FLAGS = 0x0808;

/** The archive size in bytes, for Content-Length. */
export const zipSize = (entries: Pick<ZipEntry, 'name' | 'size'>[]) =>
  entries.reduce((sum, e) => {
    const name = Buffer.byteLength(e.name);
    return sum + LOCAL + name + e.size + DESCRIPTOR + CENTRAL + name;
  }, END);

function dosDateTime(d: Date) {
  const time =
    (d.getUTCHours() << 11) |
    (d.getUTCMinutes() << 5) |
    (d.getUTCSeconds() >> 1);
  const date =
    ((d.getUTCFullYear() - 1980) << 9) |
    ((d.getUTCMonth() + 1) << 5) |
    d.getUTCDate();
  return { time, date };
}

/**
 * Writes an uncompressed ZIP chunk by chunk; the caller checks zipSize against ZIP_MAX_*.
 * Throws when an entry yields more or fewer bytes than its `size` (a file changed meanwhile):
 * the stream breaks off instead of ending with a length other than Content-Length.
 */
export async function* writeZip(entries: ZipEntry[], at: Date) {
  const { time, date } = dosDateTime(at);
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(LOCAL);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAGS, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    // CRC 0 here (bit 3); the sizes are known, so streaming readers can still skip the data.
    local.writeUInt32LE(e.size, 18);
    local.writeUInt32LE(e.size, 22);
    local.writeUInt16LE(name.length, 26);
    yield local;
    yield name;

    let crc = 0;
    let written = 0;
    for await (const chunk of e.data()) {
      crc = crc32(chunk, crc);
      written += chunk.length;
      if (written > e.size) break;
      yield chunk;
    }
    if (written !== e.size) throw new Error(`zip entry ${e.name} changed size`);

    const descriptor = Buffer.alloc(DESCRIPTOR);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(e.size, 8);
    descriptor.writeUInt32LE(e.size, 12);
    yield descriptor;

    const header = Buffer.alloc(CENTRAL);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(FLAGS, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(e.size, 20);
    header.writeUInt32LE(e.size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += LOCAL + name.length + e.size + DESCRIPTOR;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(END);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  yield dir;
  yield end;
}
