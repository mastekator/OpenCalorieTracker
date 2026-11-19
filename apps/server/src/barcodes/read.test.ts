import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBarcodes } from './read.js';

const fixture = (name: string) =>
  join(import.meta.dirname, 'fixtures', `${name}.jpg`);

describe('readBarcodes', () => {
  it.each([
    ['ean13', ['4006381333931']],
    ['ean8', ['96385074']],
    ['upca', ['0036000291452']],
    ['upce', ['0012345000065']],
    ['none', []],
    ['repeat', ['4006381333931']],
  ])('%s', async (name, codes) => {
    expect(await readBarcodes(await readFile(fixture(name)))).toEqual(codes);
  });
});
