import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
  version: string;
};

// Only VITE_* variables reach the browser bundle. The Supabase publishable key is public by
// design; everything else is enforced by Row Level Security.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: '0.0.0.0' },
  preview: { port: 4173, host: '0.0.0.0' },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase';
          if (/[\\/]src[\\/]content[\\/][^\\/]+\.json$/.test(id)) return 'content';
          return undefined;
        },
      },
    },
  },
});
