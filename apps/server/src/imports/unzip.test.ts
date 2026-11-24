import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { writeZip } from '../export/zip.js';
import { isZip, readZipEntry } from './unzip.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function file(data: Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), 'oct-unzip-'));
  dirs.push(dir);
  const path = join(dir, 'f.zip');
  await writeFile(path, data);
  return path;
}

async function stored(entries: [string, string][]) {
  const chunks: Uint8Array[] = [];
  for await (const c of writeZip(
    entries.map(([name, text]) => ({
      name,
      size: Buffer.byteLength(text),
      data: () => [Buffer.from(text)],
    })),
    new Date(),
  ))
    chunks.push(c);
  return Buffer.concat(chunks);
}

/** One deflated entry; `declared` overrides the unpacked size the headers claim. */
function deflated(name: string, data: Buffer, declared = data.length) {
  const packed = deflateRawSync(data);
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(declared, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(declared, 24);
  central.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + n.length, 12);
  end.writeUInt32LE(30 + n.length + packed.length, 16);
  return Buffer.concat([local, n, packed, central, n, end]);
}

const csv = (name: string) => name.endsWith('.csv');

describe('readZipEntry', () => {
  it('reads the wanted entry of a stored and of a deflated archive', async () => {
    const zip = await file(
      await stored([
        ['Exercise.txt', 'x'],
        ['Nutrition.csv', 'Date,Meal\n'],
      ]),
    );
    expect(await isZip(zip)).toBe(true);
    expect((await readZipEntry(zip, csv))?.toString()).toBe('Date,Meal\n');
    expect(await readZipEntry(zip, (n) => n === 'none')).toBeNull();

    const text = 'Date,Meal,Calories\n'.repeat(1000);
    const packed = await file(deflated('a.csv', Buffer.from(text)));
    expect((await readZipEntry(packed, csv))?.toString()).toBe(text);
  });

  it('refuses a zip bomb: declared or actual size past the limit is 413', async () => {
    const zeros = Buffer.alloc(10_000);
    // Honest headers: refused before inflating.
    await expect(
      readZipEntry(await file(deflated('a.csv', zeros)), csv, 1000),
    ).rejects.toMatchObject({ status: 413 });
    // Lying headers: the output limit stops the inflate.
    await expect(
      readZipEntry(await file(deflated('a.csv', zeros, 10)), csv, 1000),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('refuses what is not a readable ZIP with 400', async () => {
    const text = await file(Buffer.from('Date,Meal\n'));
    expect(await isZip(text)).toBe(false);
    await expect(readZipEntry(text, csv)).rejects.toMatchObject({
      status: 400,
    });
    const zip = deflated('a.csv', Buffer.from('Date,Meal\n'));
    // Cut in the middle of the data: the central directory points past the end.
    const cut = Buffer.concat([zip.subarray(0, 40), zip.subarray(-70)]);
    await expect(readZipEntry(await file(cut), csv)).rejects.toMatchObject({
      status: 400,
    });
  });
});
