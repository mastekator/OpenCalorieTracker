import { defineConfig } from 'vitest/config';

// Server and shared run in node; web takes its own Vite config and jsdom.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['apps/server/**/*.test.ts', 'packages/**/*.test.ts'],
          environment: 'node',
        },
      },
      'apps/web',
    ],
  },
});
