import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/storybook-static/**',
      'playwright-report/**',
      'test-results/**',
      '.e2e-data/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
