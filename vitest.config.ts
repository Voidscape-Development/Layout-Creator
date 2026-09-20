import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@model': resolve('src/shared/model'),
      '@emit': resolve('src/shared/emit'),
      '@renderer': resolve('src/renderer'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
