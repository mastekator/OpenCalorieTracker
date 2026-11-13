export type Token = { name: string; value: string };
export type TokenGroup = { title: string; tokens: Token[] };

// Groups start at `/* ── Title ── */`; anything else in a comment is ignored.
const PART =
  /\/\*\s*──\s*(.+?)\s*──\s*\*\/|\/\*[\s\S]*?\*\/|(--[\w-]+)\s*:\s*([^;]+);/g;

/** Groups of custom properties from the first `:root { … }` block of tokens.css (light values). */
export function parseTokens(css: string): TokenGroup[] {
  const start = css.indexOf(':root {');
  if (start < 0) return [];
  const end = css.indexOf('\n}', start);
  const block = css.slice(start, end < 0 ? undefined : end);
  const groups: TokenGroup[] = [];
  for (const [, title, name, value] of block.matchAll(PART)) {
    if (title) groups.push({ title, tokens: [] });
    else if (name && value) {
      if (!groups.length) groups.push({ title: 'Other', tokens: [] });
      groups.at(-1)!.tokens.push({ name, value: value.trim() });
    }
  }
  return groups.filter((group) => group.tokens.length);
}
