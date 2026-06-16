import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// GitHub Codespaces sets CODESPACES=true. In that environment the page is served
// over HTTPS on port 443 via a forwarded-port subdomain, so Vite's HMR socket
// must dial back on 443 rather than the internal dev port.
const inCodespaces = process.env.CODESPACES === 'true';

// Resolve @liquidate/shared to its TypeScript source so Vite treats it as
// project source (transpiling it) rather than a pre-bundled dependency.
export default defineConfig({
  resolve: {
    alias: {
      '@liquidate/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Proxy the game's WebSocket to the Node server. This keeps the client on a
    // single origin (`/ws` on its own host), so localhost, a single forwarded
    // Codespaces port, and the bundled production server all work identically.
    proxy: {
      // Target matches SERVER_PORT in @liquidate/shared/config.
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    },
    ...(inCodespaces ? { hmr: { clientPort: 443 } } : {}),
  },
});
