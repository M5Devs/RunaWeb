/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? './' : '/RunaWeb/',
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
