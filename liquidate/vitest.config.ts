import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@liquidate/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    // Integration tests boot a real server; give them room to breathe.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
