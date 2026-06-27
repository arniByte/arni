import { defineConfig } from 'vite';

// The client lives in /client with its index.html; build output goes to /client/dist,
// which the Node server serves statically in production. In dev, Vite (5173) proxies
// the Socket.io endpoint to the Node server (3000) so the client can just call io().
export default defineConfig({
  root: 'client',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
