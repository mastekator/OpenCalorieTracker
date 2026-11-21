const DELIMITERS = [',', ';', '\t'] as const;

/** The delimiter seen most often outside quotes in the first line; `,` when none is (ADR-0026 §6). */
export function detectDelimiter(firstLine: string) {
  const counts = new Map<string, number>();
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best: string = ',';
  for (const d of DELIMITERS)
    if ((counts.get(d) ?? 0) > (counts.get(best) ?? 0)) best = d;
  return best;
}

/**
 * Streaming RFC 4180 reader: quotes, `""`, line breaks inside quotes, CRLF or LF, a leading BOM.
 * Char by char over chunks, so a quoted field may span chunks; blank lines are skipped.
 */
export async function* csvRows(
  chunks: AsyncIterable<string>,
): AsyncGenerator<string[]> {
  let delimiter: string | null = null;
  let head = ''; // text held back until the first line ends, to pick the delimiter
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quoteSeen = false; // the previous char closed a quote or started `""`
  let started = false; // the row has content (a blank line yields nothing)

  function* feed(text: string): Generator<string[]> {
    for (const ch of text) {
      if (quoted) {
        if (ch === '"') {
          quoted = false;
          quoteSeen = true;
        } else field += ch;
        continue;
      }
      if (ch === '"') {
        // `""` inside a quoted field: the closing quote reopens and keeps one `"`.
        if (quoteSeen) field += '"';
        quoted = true;
        quoteSeen = false;
        started = true;
        continue;
      }
      quoteSeen = false;
      if (ch === delimiter) {
        row.push(field);
        field = '';
        started = true;
      } else if (ch === '\n') {
        if (started || field) {
          row.push(field);
          yield row;
        }
        row = [];
        field = '';
        started = false;
      } else if (ch !== '\r') {
        field += ch;
        started = true;
      }
    }
  }

  let first = true;
  for await (let chunk of chunks) {
    if (first && chunk) {
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
      first = false;
    }
    if (delimiter === null) {
      head += chunk;
      const end = firstLineEnd(head);
      if (end < 0) continue;
      delimiter = detectDelimiter(head.slice(0, end));
      chunk = head;
      head = '';
    }
    yield* feed(chunk);
  }
  if (delimiter === null) {
    delimiter = detectDelimiter(head);
    yield* feed(head);
  }
  if (started || field) {
    row.push(field);
    yield row;
  }
}

/** Index of the first line break outside quotes, or -1. */
function firstLineEnd(text: string) {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (text[i] === '\n' && !quoted) return i;
  }
  return -1;
}
