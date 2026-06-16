import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Resolve @liquidate/shared to its TypeScript source so Vite treats it as
// project source (transpiling it) rather than a pre-bundled dependency.
export default defineConfig({
  resolve: {
    alias: {
      '@liquidate/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
