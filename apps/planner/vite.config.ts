import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The repository root is served so the app can load the shared migrations and design tokens (local demo engine).
// Two entries: index.html (the /planner/ page: the local demo, otherwise a redirect into the shell) and src/embed.tsx, which the
// ecosystem shell imports as /planner/embed.js to mount Planner under its own header. embed.js keeps a fixed name (the shell
// imports it by address) and keeps its exports; everything else is content-hashed.
export default defineConfig({
  base: '/planner/',   // served by the ecosystem site at /planner/ (scripts/build-web.mjs)
  plugins: [react()],
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
  preview: { port: 4173, strictPort: true },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    target: 'es2022', chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: { index: 'index.html', embed: 'src/embed.tsx' },
      preserveEntrySignatures: 'exports-only',
      output: { entryFileNames: (chunk) => (chunk.name === 'embed' ? 'embed.js' : 'assets/[name]-[hash].js') },
    },
  },
});
