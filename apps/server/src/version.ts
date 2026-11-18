import { readFileSync } from 'node:fs';

// Same relative path from src/ (dev, tests) and dist/ (production).
export const appVersion = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version;
