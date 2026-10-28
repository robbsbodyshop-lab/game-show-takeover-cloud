import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
  version: string;
};

/**
 * `/play` and `/host` are their own HTML entries (play.html, host.html) so a phone does not download
 * the stage (NFR-004). Production maps them in vercel.json; this does the same for `vite dev` and
 * `vite preview`, keeping the query string: /play?room=ABCD -> /play.html?room=ABCD.
 */
const pageRoutes = (): Plugin => {
  const rewrite = (url: string | undefined): string | undefined => {
    if (url === undefined) return url;
    const match = /^\/(play|host)(?:\/[^?]*)?(\?.*)?$/.exec(url);
    return match ? `/${match[1] ?? ''}.html${match[2] ?? ''}` : url;
  };
  const install = (server: {
    middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void };
  }) => {
    server.middlewares.use((req, _res, next) => {
      req.url = rewrite(req.url);
      next();
    });
  };
  return { name: 'gst-page-routes', configureServer: install, configurePreviewServer: install };
};

// Only VITE_* variables reach the browser bundle. The Supabase publishable key is public by
// design; everything else is enforced by Row Level Security.
export default defineConfig({
  plugins: [react(), pageRoutes()],
  server: { port: 3000, host: '0.0.0.0' },
  preview: { port: 4173, host: '0.0.0.0' },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // Unused by the app and ~6 KB gzipped on the phone (NFR-004); see src/app/supabaseUnused.ts.
      '@supabase/storage-js': path.resolve(import.meta.dirname, 'src/app/supabaseUnused.ts'),
      '@supabase/functions-js': path.resolve(import.meta.dirname, 'src/app/supabaseUnused.ts'),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      // Three pages: the stage (index.html), the phone (play.html) and the host console (host.html).
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        play: path.resolve(import.meta.dirname, 'play.html'),
        host: path.resolve(import.meta.dirname, 'host.html'),
      },
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
