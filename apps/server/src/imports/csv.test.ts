import { describe, expect, it } from 'vitest';
import { csvRows, detectDelimiter } from './csv.js';

const BOM = String.fromCharCode(0xfeff);

async function parse(...chunks: string[]) {
  const rows: string[][] = [];
  for await (const row of csvRows(
    (async function* () {
      yield* chunks;
    })(),
  ))
    rows.push(row);
  return rows;
}

describe('csvRows (RFC 4180, ADR-0026 §6)', () => {
  it.each<[string, string[], string[][]]>([
    [
      'plain rows',
      ['a,b\n1,2\n'],
      [
        ['a', 'b'],
        ['1', '2'],
      ],
    ],
    [
      'no trailing line break',
      ['a,b\n1,2'],
      [
        ['a', 'b'],
        ['1', '2'],
      ],
    ],
    [
      'CRLF',
      ['a,b\r\n1,2\r\n'],
      [
        ['a', 'b'],
        ['1', '2'],
      ],
    ],
    ['BOM', [BOM + 'date,name\n'], [['date', 'name']]],
    ['quoted comma', ['a\n"x, y"\n'], [['a'], ['x, y']]],
    ['doubled quote', ['a\n"say ""hi"""\n'], [['a'], ['say "hi"']]],
    [
      'line break in quotes',
      ['a,b\n"one\ntwo",3\n'],
      [
        ['a', 'b'],
        ['one\ntwo', '3'],
      ],
    ],
    [
      'empty fields',
      ['a,b,c\n,,\n'],
      [
        ['a', 'b', 'c'],
        ['', '', ''],
      ],
    ],
    [
      'empty quoted field',
      ['a,b\n"",x\n'],
      [
        ['a', 'b'],
        ['', 'x'],
      ],
    ],
    ['blank lines skipped', ['a\n\n1\n\n'], [['a'], ['1']]],
    [
      'semicolon',
      ['a;b\n1,5;2\n'],
      [
        ['a', 'b'],
        ['1,5', '2'],
      ],
    ],
    [
      'tab',
      ['a\tb\n1\t2\n'],
      [
        ['a', 'b'],
        ['1', '2'],
      ],
    ],
    [
      'chunk splits a quoted field',
      ['a,b\n"x,', '\ny""', 'z",1\n'],
      [
        ['a', 'b'],
        ['x,\ny"z', '1'],
      ],
    ],
    [
      'chunk splits the first line',
      ['da', 'te;na', 'me\n1;2'],
      [
        ['date', 'name'],
        ['1', '2'],
      ],
    ],
    [
      'chunk splits CRLF',
      ['a,b\r', '\n1,2'],
      [
        ['a', 'b'],
        ['1', '2'],
      ],
    ],
    ['empty input', [''], []],
  ])('%s', async (_, chunks, rows) => {
    expect(await parse(...chunks)).toEqual(rows);
  });

  it('picks the delimiter seen most outside quotes', () => {
    expect(detectDelimiter('"a;b",c,d')).toBe(',');
    expect(detectDelimiter('a;b;"c,d,e"')).toBe(';');
    expect(detectDelimiter('a\tb')).toBe('\t');
    expect(detectDelimiter('single')).toBe(',');
  });
});
