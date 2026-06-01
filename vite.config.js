import { defineConfig, loadEnv } from 'vite';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Local API plugin: Vercel serverless functions in `api/` are NOT served by
 * Vite's dev or preview servers (that runtime only exists on Vercel). Without
 * this, a local `POST /api/sample` hits no route and returns a 404 — the cause
 * of the "Sampling failed (404)" fallback. This middleware loads `api/<name>.js`
 * and shims the Vercel-style `res.status().json()` helpers onto Node's response
 * so the SAME handler runs locally (dev AND preview) and in production.
 *
 *  - dev (`bun run dev`):     uses Vite's `ssrLoadModule` (HMR-aware).
 *  - preview (`bun run preview`): plain dynamic `import()` of the built handler.
 */
function localApiPlugin() {
  /** Attach Vercel-style helpers to a Node response object. */
  const shim = (res) => {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
      return res;
    };
  };

  /** Build the middleware; `load(pathname)` differs for dev vs preview. */
  const middleware = (load, logger) => async (req, res, next) => {
    const url = req.url || '';
    if (!url.startsWith('/api/')) return next();
    const pathname = url.split('?')[0];

    // Buffer the request body NOW, before the async module load below. The
    // dynamic import is async; if we awaited it first, the request stream would
    // drain its data/end events with no listener attached and the handler's
    // body read would hang forever (dev masked this via a cached loader).
    let rawBody = '';
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      rawBody = await new Promise((res2) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => res2(Buffer.concat(chunks).toString('utf8')));
        req.on('error', () => res2(''));
      });
    }

    shim(res);
    try {
      const mod = await load(pathname);
      // Hand the pre-read body to the handler (its readJsonBody early-returns
      // when req.body is already a string/object).
      req.body = rawBody;
      await mod.default(req, res);
    } catch (err) {
      logger?.error?.(`[local-api] ${pathname}: ${err?.stack}`);
      if (!res.writableEnded) {
        res.status(500).json({ error: err?.message ?? 'local-api error' });
      }
    }
  };

  return {
    name: 'local-api',
    apply: 'serve', // dev server
    configureServer(server) {
      const load = (pathname) => server.ssrLoadModule(`.${pathname}.js`);
      server.middlewares.use(middleware(load, server.config.logger));
    },
    configurePreviewServer(server) {
      // No Vite module pipeline in preview — import the handler by ABSOLUTE
      // file URL from the project root (a bare relative path would resolve
      // against Vite's temp config dir, not the repo).
      const load = (pathname) =>
        import(pathToFileURL(resolve(process.cwd(), `.${pathname}.js`)).href);
      server.middlewares.use(middleware(load, server.config.logger));
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env into process.env so the local API handler can read GROQ_API_KEY
  // (parity with Vercel, which injects env vars at runtime).
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [react(), tailwindcss(), localApiPlugin()],
  };
});
