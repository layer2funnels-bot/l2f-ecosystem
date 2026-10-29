import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The repository root is served so the app can load the shared migrations and design tokens (local demo engine).
export default defineConfig({
  base: '/planner/',   // served by the ecosystem site at /planner/ (scripts/build-web.mjs)
  plugins: [react()],
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
  preview: { port: 4173, strictPort: true },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
