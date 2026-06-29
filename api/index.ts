import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { buildApp } from '../server/src/app.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

let appPromise: ReturnType<typeof buildApp> | null = null;
const backendUrl = process.env.BACKEND_URL?.trim().replace(/\/+$/, '');
const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const proxyTimeoutMs = 55_000;

export const normalizeVercelApiUrl = (url?: string) => {
  const parsed = new URL(url ?? '/', 'http://vercel.local');
  const rewrittenPath = parsed.searchParams.get('__path');
  if (!rewrittenPath) return `${parsed.pathname}${parsed.search}`;

  parsed.searchParams.delete('__path');
  const query = parsed.searchParams.toString();
  return `${rewrittenPath}${query ? `?${query}` : ''}`;
};

const getApp = async () => {
  appPromise ??= buildApp();
  const app = await appPromise;
  await app.ready();
  return app;
};

const shouldProxyToBackend = (req: IncomingMessage) => {
  if (!backendUrl) return false;

  try {
    const target = new URL(backendUrl);
    return target.host !== req.headers.host;
  } catch {
    return false;
  }
};

const proxyToBackend = async (req: IncomingMessage, res: ServerResponse) =>
  new Promise<void>((resolve) => {
    const normalizedUrl = normalizeVercelApiUrl(req.url);
    const target = new URL(normalizedUrl, `${backendUrl}/`);
    const headers: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(req.headers)) {
      if (!value || hopByHopHeaders.has(key.toLowerCase())) continue;
      headers[key] = value;
    }

    headers.host = target.host;
    headers['x-forwarded-host'] = req.headers.host || target.host;
    headers['x-forwarded-proto'] = 'https';

    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const proxyReq = transport(
      target,
      {
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode ?? 502;

        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (!value || hopByHopHeaders.has(key.toLowerCase())) continue;
          res.setHeader(key, value);
        }

        proxyRes.pipe(res);
        proxyRes.on('end', resolve);
      },
    );

    proxyReq.setTimeout(proxyTimeoutMs, () => {
      proxyReq.destroy(new Error('UPSTREAM_TIMEOUT'));
    });

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 504;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Servico demorou para responder. Tente novamente em alguns instantes.' }));
      }
      resolve();
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      proxyReq.end();
      return;
    }

    req.pipe(proxyReq);
  });

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (shouldProxyToBackend(req)) {
    await proxyToBackend(req, res);
    return;
  }

  req.url = normalizeVercelApiUrl(req.url);
  const app = await getApp();
  app.server.emit('request', req, res);
}
