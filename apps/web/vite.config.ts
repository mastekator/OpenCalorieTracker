/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev only: forward API calls to the local server (apps/server, PORT default 3000).
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3000}` },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    // Lets tests import tokens.css?raw (Vitest blanks CSS by default).
    css: { include: [/tokens\.css/] },
  },
});
