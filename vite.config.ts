import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

/**
 * Serves /api/* from the same handlers Vercel runs, with an in-memory store,
 * so `npm run dev` is a complete local stack.
 */
function devApi(): Plugin {
  return {
    name: 'toyboxes-dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const m = url.pathname.match(/^\/api\/([a-z]+)$/);
        if (!m) return next();
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`).catch(() => null);
        if (!mod) {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        let status = 200;
        const vreq = {
          method: req.method,
          url: req.url,
          query: Object.fromEntries(url.searchParams),
          body: raw ? JSON.parse(raw) : undefined,
          headers: req.headers,
        };
        const vres = {
          status(code: number) {
            status = code;
            return vres;
          },
          json(body: unknown) {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(body));
            return vres;
          },
          setHeader(k: string, v: string | string[]) {
            res.setHeader(k, v);
          },
          end() {
            res.statusCode = status;
            res.end();
            return vres;
          },
        };
        await mod.default(vreq, vres);
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
  server: { port: 5207 },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
});
