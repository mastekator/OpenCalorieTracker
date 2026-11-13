import { describe, expect, it } from 'vitest';
import css from '../../styles/tokens.css?raw';
import { parseTokens } from './parseTokens';

describe('parseTokens', () => {
  it('groups declarations by section comments and skips other comments', () => {
    const groups = parseTokens(`/* header */
:root {
  color-scheme: light dark;
  /* ── Spacing (4pt grid) ── */
  --space-1: 4px;  --space-2: 8px; /* note */
  /* ── Colour: light ── */
  /* sub-note: --not-a-token: 1px; */
  --color-bg: #F8FAF9;
  --color-scrim: rgb(24 33 29 / 0.32);
}
:root[data-theme="dark"] { --color-bg: #0E1110; }`);
    expect(groups).toEqual([
      {
        title: 'Spacing (4pt grid)',
        tokens: [
          { name: '--space-1', value: '4px' },
          { name: '--space-2', value: '8px' },
        ],
      },
      {
        title: 'Colour: light',
        tokens: [
          { name: '--color-bg', value: '#F8FAF9' },
          { name: '--color-scrim', value: 'rgb(24 33 29 / 0.32)' },
        ],
      },
    ]);
  });

  it('reads the real tokens.css', () => {
    const groups = parseTokens(css);
    const names = groups.flatMap((group) => group.tokens.map((t) => t.name));
    expect(groups.map((group) => group.title)).toContain('Radii');
    expect(names).toContain('--focus-ring-width');
    expect(new Set(names).size).toBe(names.length); // dark overrides are not read
  });
});
