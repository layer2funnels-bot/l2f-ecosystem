import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the ecosystem site at /projects/ (scripts/build-web.mjs). The shell imports /projects/embed.js and calls mount(),
// like Planner: embed.js keeps a fixed name and its exports; everything else is content-hashed. The repository root is
// allowed so the shared contract (packages/core/pm/shared/api.ts) can be imported.
export default defineConfig({
  base: '/projects/',
  plugins: [react()],
  server: { fs: { allow: ['../..'] } },
  build: {
    target: 'es2022', outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { embed: 'web/embed.tsx' },
      preserveEntrySignatures: 'exports-only',
      output: { entryFileNames: (chunk) => (chunk.name === 'embed' ? 'embed.js' : 'assets/[name]-[hash].js') },
    },
  },
});
