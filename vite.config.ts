/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/RunaWeb/',
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
