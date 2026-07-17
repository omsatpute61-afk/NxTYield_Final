import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

const apiRoutes = new Map([
  ['/api/health', () => import('./api/health.js')],
  ['/api/insights', () => import('./api/insights.js')],
  ['/api/predict', () => import('./api/predict.js')],
  ['/api/stream', () => import('./api/stream.js')],
  ['/api/weather', () => import('./api/weather.js')],
  ['/api/chat', () => import('./api/chat/index.js')],
  ['/api/chat/status', () => import('./api/chat/status.js')],
  ['/api/irrigation/remote', () => import('./api/irrigation/remote.js')],
  ['/api/sensors/latest', () => import('./api/sensors/latest.js')],
  ['/api/sensors/history', () => import('./api/sensors/history.js')],
]);

function applyLocalEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  Object.entries(env).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function augmentRequest(req) {
  const url = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(url.searchParams.entries());
}

function augmentResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
}

function viteApiMiddleware() {
  return {
    name: 'nxtyield-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const routeLoader = apiRoutes.get(url.pathname);
        if (!routeLoader) {
          next();
          return;
        }

        try {
          augmentRequest(req);
          augmentResponse(res);
          const route = await routeLoader();
          await route.default(req, res);
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
          }

          if (!res.writableEnded) {
            res.end(JSON.stringify({
              available: false,
              message: error?.message || 'Local API handler failed',
            }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  applyLocalEnv(mode);

  return {
    plugins: [react(), viteApiMiddleware()],
  };
});
